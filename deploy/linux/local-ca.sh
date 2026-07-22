#!/usr/bin/env bash

set -Eeuo pipefail

ACTION="${1:-}"
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
COMPOSE_FILE="$ROOT/compose.yaml"
ROOT_CERTIFICATE_PATH="/data/caddy/pki/authorities/local/root.crt"
STATE_FILE_NAME="local-ca-fingerprints.txt"
HEALTH_TIMEOUT_SECONDS=120
DOCKER_PATH=""
REGISTERED=()

if [[ -t 1 ]]; then
    COLOR_YELLOW=$'\033[33m'
    COLOR_CYAN=$'\033[36m'
    COLOR_RED=$'\033[31m'
    COLOR_GRAY=$'\033[90m'
    COLOR_RESET=$'\033[0m'
else
    COLOR_YELLOW=""
    COLOR_CYAN=""
    COLOR_RED=""
    COLOR_GRAY=""
    COLOR_RESET=""
fi

write_info() {
    printf '%s[*] %s%s%s\n' "$COLOR_YELLOW" "$COLOR_CYAN" "$1" "$COLOR_RESET"
}

write_note() {
    printf '%s[!] %s%s\n' "$COLOR_YELLOW" "$1" "$COLOR_RESET"
}

write_fail() {
    printf '%s[!] ERROR: %s%s\n' "$COLOR_RED" "$1" "$COLOR_RESET" >&2
}

write_field() {
    printf '%s    %-22s %s%s\n' "$COLOR_GRAY" "$1" "$2" "$COLOR_RESET"
}

stop_manualito() {
    write_fail "$1"
    exit 1
}

truthy() {
    case "${1,,}" in
        1|true|yes|si|sí) return 0 ;;
        *) return 1 ;;
    esac
}

skip_store() {
    truthy "${MANUALITO_LOCAL_CA_SKIP_STORE:-}"
}

state_dir() {
    local base="${XDG_STATE_HOME:-${HOME:-}/.local/state}"
    [[ -n "$base" ]] || stop_manualito "No se pudo resolver XDG_STATE_HOME para guardar el estado."
    printf '%s/manualito' "$base"
}

state_file() {
    printf '%s/%s' "$(state_dir)" "$STATE_FILE_NAME"
}

read_registered_fingerprints() {
    REGISTERED=()
    local path line fingerprint existing
    path="$(state_file)"
    [[ -f "$path" ]] || return 0
    while IFS= read -r line || [[ -n "$line" ]]; do
        fingerprint="${line//[[:space:]]/}"
        fingerprint="${fingerprint^^}"
        [[ -z "$fingerprint" ]] && continue
        [[ "$fingerprint" =~ ^[0-9A-F]{64}$ ]] \
            || stop_manualito "El estado de la CA contiene una huella SHA-256 inválida: $path"
        existing=0
        local registered
        for registered in "${REGISTERED[@]}"; do
            [[ "$registered" == "$fingerprint" ]] && existing=1
        done
        ((existing)) || REGISTERED+=("$fingerprint")
    done <"$path"
}

write_registered_fingerprints() {
    local directory path temporary fingerprint
    directory="$(state_dir)"
    path="$(state_file)"
    umask 077
    mkdir -p "$directory"
    chmod 700 "$directory" 2>/dev/null || true
    temporary="$(mktemp "$directory/local-ca.XXXXXX")"
    chmod 600 "$temporary"
    for fingerprint in "$@"; do
        printf '%s\n' "$fingerprint"
    done >"$temporary"
    mv -f "$temporary" "$path"
    chmod 600 "$path" 2>/dev/null || true
}

remove_state_file() {
    rm -f -- "$(state_file)"
}

get_docker_path() {
    DOCKER_PATH="$(command -v docker || true)"
    [[ -n "$DOCKER_PATH" ]] || stop_manualito "Docker no está instalado o no está en PATH."
}

compose() {
    "$DOCKER_PATH" compose --ansi never -f "$COMPOSE_FILE" "$@"
}

frontend_health() {
    local container_id
    container_id="$(compose ps -q frontend 2>/dev/null | head -n1 || true)"
    [[ -n "$container_id" ]] || return 1
    "$DOCKER_PATH" inspect \
        --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' \
        "$container_id" 2>/dev/null
}

wait_frontend_healthy() {
    local health=""
    health="$(frontend_health || true)"
    if [[ "$health" == "healthy" ]]; then
        write_info "Caddy ya está sano."
        return 0
    fi

    write_info "Arrancando Caddy para leer la CA local."
    compose up -d caddy-data-init >/dev/null \
        || stop_manualito "No se pudo preparar el volumen caddy-data."
    compose up -d --no-deps frontend >/dev/null \
        || stop_manualito "No se pudo arrancar el contenedor frontend."

    local deadline=$((SECONDS + HEALTH_TIMEOUT_SECONDS))
    while ((SECONDS < deadline)); do
        health="$(frontend_health || true)"
        if [[ "$health" == "healthy" ]]; then
            write_info "Caddy está sano."
            return 0
        fi
        sleep 2
    done
    stop_manualito "Caddy no alcanzó el estado healthy en $HEALTH_TIMEOUT_SECONDS segundos."
}

export_root_certificate() {
    local destination="$1"
    write_info "Extrayendo root.crt desde el volumen de Caddy."
    compose cp "frontend:$ROOT_CERTIFICATE_PATH" "$destination" >/dev/null \
        || stop_manualito "No se pudo extraer root.crt del contenedor frontend."
}

require_openssl() {
    command -v openssl >/dev/null 2>&1 \
        || stop_manualito "OpenSSL no está instalado o no está en PATH."
}

certificate_fingerprint() {
    openssl x509 -in "$1" -noout -fingerprint -sha256 \
        | sed 's/^[^=]*=//' \
        | tr -d ':' \
        | tr '[:lower:]' '[:upper:]'
}

validate_certificate() {
    local certificate="$1"
    local count subject issuer constraints
    count="$(grep -c -- '-----BEGIN CERTIFICATE-----' "$certificate" || true)"
    [[ "$count" -eq 1 ]] \
        || stop_manualito "root.crt debe contener exactamente un certificado."
    openssl x509 -in "$certificate" -noout >/dev/null 2>&1 \
        || stop_manualito "root.crt no contiene un certificado X.509 válido."
    subject="$(openssl x509 -in "$certificate" -noout -subject -nameopt RFC2253)"
    issuer="$(openssl x509 -in "$certificate" -noout -issuer -nameopt RFC2253)"
    subject="${subject#subject=}"
    issuer="${issuer#issuer=}"
    [[ "$subject" == "$issuer" ]] \
        || stop_manualito "root.crt no es autofirmado: sujeto y emisor no coinciden."
    constraints="$(openssl x509 -in "$certificate" -noout -text)"
    grep -A1 -F 'X509v3 Basic Constraints' <<<"$constraints" | grep -q -F 'CA:TRUE' \
        || stop_manualito "root.crt no está marcado como CA."
    openssl verify -CAfile "$certificate" "$certificate" >/dev/null 2>&1 \
        || stop_manualito "root.crt no supera la validación de una CA autofirmada."
}

assert_debian_or_ubuntu() {
    if skip_store; then
        return 0
    fi
    [[ -r /etc/os-release ]] \
        || stop_manualito "No se pudo identificar la distribución. Instala root.crt manualmente."
    local distro_id
    distro_id="$(sed -n 's/^ID=//p' /etc/os-release | head -n1)"
    distro_id="${distro_id%\"}"
    distro_id="${distro_id#\"}"
    case "$distro_id" in
        debian|ubuntu) ;;
        *)
            stop_manualito "Distribución no soportada. Instala root.crt manualmente en el almacén de confianza de tu sistema."
            ;;
    esac
    command -v sudo >/dev/null 2>&1 \
        || stop_manualito "sudo no está disponible. Instala root.crt manualmente como administrador."
    command -v update-ca-certificates >/dev/null 2>&1 \
        || stop_manualito "update-ca-certificates no está disponible. Instala el paquete ca-certificates."
}

registered_contains() {
    local wanted="$1"
    local registered
    for registered in "${REGISTERED[@]}"; do
        [[ "$registered" == "$wanted" ]] && return 0
    done
    return 1
}

certificate_installed() {
    local fingerprint="$1"
    if skip_store; then
        registered_contains "$fingerprint"
        return
    fi
    local installed="/usr/local/share/ca-certificates/manualito-$fingerprint.crt"
    [[ -f "$installed" ]] || return 1
    [[ "$(certificate_fingerprint "$installed")" == "$fingerprint" ]] || return 1
    openssl verify -CApath /etc/ssl/certs "$installed" >/dev/null 2>&1
}

install_certificate() {
    local certificate="$1"
    local fingerprint="$2"
    if skip_store; then
        write_info "Instalación omitida por MANUALITO_LOCAL_CA_SKIP_STORE."
        return 0
    fi
    local destination="/usr/local/share/ca-certificates/manualito-$fingerprint.crt"
    write_info "Instalando la CA del sistema con sudo."
    sudo install -m 0644 "$certificate" "$destination"
    sudo update-ca-certificates
}

remove_certificate() {
    local fingerprint="$1"
    if skip_store; then
        write_info "Retirada omitida para la huella registrada $fingerprint."
        return 0
    fi
    local installed="/usr/local/share/ca-certificates/manualito-$fingerprint.crt"
    if [[ ! -e "$installed" ]]; then
        write_info "La huella registrada ya no está instalada: $fingerprint."
        return 0
    fi
    [[ -f "$installed" ]] \
        || stop_manualito "La ruta registrada no es un fichero regular: $installed"
    [[ "$(certificate_fingerprint "$installed")" == "$fingerprint" ]] \
        || stop_manualito "El certificado instalado no coincide con la huella registrada; no se borrará."
    write_info "Retirando la huella registrada $fingerprint con sudo."
    sudo rm -- "$installed"
    sudo update-ca-certificates
}

trust_ca() {
    local temporary_dir certificate fingerprint old_fingerprint
    local manage_current=0
    local installed_before=0
    temporary_dir="$(mktemp -d)"
    chmod 700 "$temporary_dir"
    certificate="$temporary_dir/root.crt"
    trap 'rm -rf -- "$temporary_dir"' RETURN

    wait_frontend_healthy
    export_root_certificate "$certificate"
    chmod 600 "$certificate"
    validate_certificate "$certificate"
    fingerprint="$(certificate_fingerprint "$certificate")"
    write_info "CA local validada."
    write_field "huella SHA-256" "$fingerprint"

    read_registered_fingerprints
    if ((${#REGISTERED[@]} == 0)); then
        write_note "No hay huellas previas registradas; no se retirará ningún certificado existente."
    fi
    registered_contains "$fingerprint" && manage_current=1
    certificate_installed "$fingerprint" && installed_before=1
    for old_fingerprint in "${REGISTERED[@]}"; do
        if [[ "$old_fingerprint" != "$fingerprint" ]]; then
            write_info "Rotación detectada."
            remove_certificate "$old_fingerprint"
        fi
    done
    if ((installed_before)); then
        write_info "La CA actual ya está instalada."
        if ((! manage_current)); then
            write_note "No fue registrada por Manualito; no se asumirá su propiedad."
        fi
    else
        install_certificate "$certificate" "$fingerprint"
        manage_current=1
    fi
    if ! skip_store && ! certificate_installed "$fingerprint"; then
        stop_manualito "update-ca-certificates terminó sin dejar instalada la huella esperada."
    fi
    if ((manage_current)); then
        write_registered_fingerprints "$fingerprint"
        write_info "Confianza local registrada."
        write_field "estado" "$(state_file)"
    else
        remove_state_file
        write_note "No se ha creado estado local para una CA instalada externamente."
    fi
    trap - RETURN
    rm -rf -- "$temporary_dir"
}

status_ca() {
    local temporary_dir certificate fingerprint registered installed
    temporary_dir="$(mktemp -d)"
    chmod 700 "$temporary_dir"
    certificate="$temporary_dir/root.crt"
    trap 'rm -rf -- "$temporary_dir"' RETURN

    wait_frontend_healthy
    export_root_certificate "$certificate"
    chmod 600 "$certificate"
    validate_certificate "$certificate"
    fingerprint="$(certificate_fingerprint "$certificate")"
    write_info "Estado de la CA local."
    write_field "huella actual" "$fingerprint"
    write_field "estado local" "$(state_file)"

    read_registered_fingerprints
    if ((${#REGISTERED[@]} == 0)); then
        write_field "registradas" "ninguna"
    else
        for registered in "${REGISTERED[@]}"; do
            installed="no"
            certificate_installed "$registered" && installed="sí"
            write_field "huella registrada" "$registered"
            write_field "instalada" "$installed"
        done
    fi
    trap - RETURN
    rm -rf -- "$temporary_dir"
}

untrust_ca() {
    local fingerprint
    read_registered_fingerprints
    if ((${#REGISTERED[@]} == 0)); then
        write_info "No hay huellas de Manualito registradas."
        remove_state_file
        return 0
    fi
    for fingerprint in "${REGISTERED[@]}"; do
        remove_certificate "$fingerprint"
    done
    remove_state_file
    write_info "Huellas registradas por Manualito retiradas."
}

main() {
    [[ $# -eq 1 ]] || stop_manualito "Uso: local-ca trust|status|untrust"
    ACTION="${ACTION,,}"
    case "$ACTION" in
        trust|status|untrust) ;;
        *) stop_manualito "Uso: local-ca trust|status|untrust" ;;
    esac
    cd "$ROOT"
    require_openssl
    assert_debian_or_ubuntu
    write_info "Manualito local-ca $ACTION."
    case "$ACTION" in
        trust)
            get_docker_path
            trust_ca
            ;;
        status)
            get_docker_path
            status_ca
            ;;
        untrust) untrust_ca ;;
    esac
}

main "$@"
