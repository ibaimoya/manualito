#!/usr/bin/env bash

set -Eeuo pipefail

directory="${1:?Falta la carpeta de secretos}"
database_exists="${2:?Falta el estado del volumen de Postgres}"
dry_run="${3:-0}"
names=(postgres_user postgres_password redis_password flower_basic_auth resend_api_key tunnel_token)

fail() {
    printf '%s\n' "$1" >&2
    exit 1
}

validate_paths() {
    [[ ! -L "$directory" ]] || fail "La carpeta secrets no puede ser un enlace."
    if [[ -e "$directory" && ! -d "$directory" ]]; then
        fail "La ruta secrets debe ser una carpeta."
    fi
    local name path
    for name in "${names[@]}"; do
        path="$directory/$name.txt"
        [[ ! -L "$path" ]] || fail "El secreto $name no puede ser un enlace."
        if [[ -e "$path" && (! -f "$path" || ! -s "$path" || ! -r "$path") ]]; then
            fail "El secreto $name debe ser un archivo legible y no vacío."
        fi
        if [[ -f "$path" ]] && ! grep -q '[^[:space:]]' "$path"; then
            fail "El secreto $name no puede estar vacío."
        fi
    done
}

random_password() {
    od -An -N32 -tx1 /dev/urandom | tr -d ' \n'
}

create_secret() {
    local name="$1" value
    [[ ! -e "$directory/$name.txt" ]] || return 0
    case "$name" in
        postgres_user) value="manualito" ;;
        flower_basic_auth) value="admin:$(random_password)" ;;
        *) value="$(random_password)" ;;
    esac
    (set -o noclobber; printf '%s\n' "$value" > "$directory/$name.txt")
}

validate_paths
if [[ "$database_exists" == 1 && (! -f "$directory/postgres_user.txt" || ! -f "$directory/postgres_password.txt") ]]; then
    fail "Ya existe el volumen de Postgres. Restaura sus archivos de usuario y contraseña antes de continuar."
fi
if [[ "$dry_run" == 1 ]]; then
    printf '%s\n' 'Se crearían los secretos que falten sin sustituir los existentes.'
    exit 0
fi

umask 077
mkdir -p -- "$directory"
# Compose monta cada archivo por separado. El directorio privado protege el host.
chmod 0700 -- "$directory"
for name in postgres_user postgres_password redis_password flower_basic_auth; do
    create_secret "$name"
done
for name in "${names[@]}"; do
    if [[ -f "$directory/$name.txt" ]]; then
        chmod 0644 -- "$directory/$name.txt"
    fi
done
