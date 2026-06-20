#!/usr/bin/env bash

set -Eeuo pipefail

ACTION="start"
ACCELERATOR="auto"
LLM="auto"
OCR="auto"
USE_RECOMMENDED=0
DRY_RUN=0
SKIP_BUILD=0
MANUAL_SELECTION_REQUESTED=0

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT="$(cd -- "$SCRIPT_DIR/../.." && pwd -P)"
LOCAL_DIR="$ROOT/deploy/local"
LOGS_DIR="$LOCAL_DIR/logs"
SELECTED_ENV="$LOCAL_DIR/selected.env"
COMPOSE_FILE="$ROOT/compose.yaml"
ROOT_ENV="$ROOT/.env"
LLM_ENV="$ROOT/config/llm.env"
NVIDIA_COMPOSE="$ROOT/deploy/compose/accelerators/nvidia.yaml"
OCR_PADDLE_CPU_COMPOSE="$ROOT/deploy/compose/ocr/paddle-cpu.yaml"
OCR_PADDLE_GPU_COMPOSE="$ROOT/deploy/compose/ocr/paddle-gpu.yaml"
LOW_PROFILE="$ROOT/deploy/profiles/llm/low.env"
HIGH_PROFILE="$ROOT/deploy/profiles/llm/high.env"
LLM_VRAM_RESERVE_GB="1.0"
PADDLE_GPU_VRAM_BUDGET_GB="3.0"
PADDLE_GPU_MIN_DRIVER="522.06"
CURRENT_CHILD_PID=""
DOCKER_PATH=""
NVIDIA_AVAILABLE=0
NVIDIA_NAME=""
NVIDIA_DRIVER=""
NVIDIA_FREE_MB=0
NVIDIA_TOTAL_MB=0
DOCKER_GPU=0
PADDLE_GPU_AVAILABLE=0
PADDLE_GPU_REASON="no comprobado"
OCR_RECOMMENDED_MODE="tesseract"
OCR_RECOMMENDATION_DETAIL=""
RECOMMENDED_ACCELERATOR="cpu"
RECOMMENDED_LLM="low"
RECOMMENDED_OCR="tesseract"
FINAL_ACCELERATOR="cpu"
FINAL_LLM="low"
FINAL_OCR="tesseract"
SELECTED_ACCELERATOR="cpu"
SELECTED_LLM="low"
SELECTED_OCR="tesseract"
EXISTING_ACCELERATOR="cpu"
EXISTING_LLM="low"
EXISTING_OCR="tesseract"
COMPOSE_ARGS=()

if [[ -t 1 ]]; then
    COLOR_YELLOW=$'\033[33m'
    COLOR_CYAN=$'\033[36m'
    COLOR_GREEN=$'\033[32m'
    COLOR_RED=$'\033[31m'
    COLOR_GRAY=$'\033[90m'
    COLOR_RESET=$'\033[0m'
else
    COLOR_YELLOW=""
    COLOR_CYAN=""
    COLOR_GREEN=""
    COLOR_RED=""
    COLOR_GRAY=""
    COLOR_RESET=""
fi

cleanup_child() {
    if [[ -n "$CURRENT_CHILD_PID" ]] && kill -0 "$CURRENT_CHILD_PID" 2>/dev/null; then
        kill "$CURRENT_CHILD_PID" 2>/dev/null || true
    fi
}

trap 'cleanup_child; exit 130' INT TERM

usage() {
    cat <<'EOF'
Uso:
  manualito.sh --action setup|start|stop [opciones]

Opciones equivalentes a Windows:
  -Action, --action                 setup | start | stop
  -Accelerator, --accelerator       auto | cpu | nvidia
  -Llm, --llm                       auto | low | high
  -Ocr, --ocr                       auto | tesseract | paddle_cpu | paddle_gpu
  -UseRecommended, --use-recommended
  -DryRun, --dry-run
  -SkipBuild, --skip-build
EOF
}

lower() {
    printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

parse_args() {
    while (($#)); do
        case "$(lower "$1")" in
            -action|--action)
                [[ $# -ge 2 ]] || stop_manualito "Falta valor para $1."
                ACTION="$(lower "$2")"
                shift 2
                ;;
            -accelerator|--accelerator)
                [[ $# -ge 2 ]] || stop_manualito "Falta valor para $1."
                ACCELERATOR="$(lower "$2")"
                shift 2
                ;;
            -llm|--llm)
                [[ $# -ge 2 ]] || stop_manualito "Falta valor para $1."
                LLM="$(lower "$2")"
                shift 2
                ;;
            -ocr|--ocr)
                [[ $# -ge 2 ]] || stop_manualito "Falta valor para $1."
                OCR="$(lower "$2")"
                shift 2
                ;;
            -userecommended|--use-recommended)
                USE_RECOMMENDED=1
                shift
                ;;
            -dryrun|--dry-run)
                DRY_RUN=1
                shift
                ;;
            -skipbuild|--skip-build)
                SKIP_BUILD=1
                shift
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            *)
                stop_manualito "Opción no reconocida: $1"
                ;;
        esac
    done

    case "$ACTION" in setup|start|stop) ;; *) stop_manualito "Acción inválida: $ACTION" ;; esac
    case "$ACCELERATOR" in auto|cpu|nvidia) ;; *) stop_manualito "Acelerador inválido: $ACCELERATOR" ;; esac
    case "$LLM" in auto|low|high) ;; *) stop_manualito "LLM inválido: $LLM" ;; esac
    case "$OCR" in auto|tesseract|paddle_cpu|paddle_gpu) ;; *) stop_manualito "OCR inválido: $OCR" ;; esac

    if [[ "$ACCELERATOR" != "auto" || "$LLM" != "auto" || "$OCR" != "auto" ]]; then
        MANUAL_SELECTION_REQUESTED=1
    fi
}

write_rule() {
    printf '%s%s%s\n' "$COLOR_GRAY" "========================================================================" "$COLOR_RESET"
}

write_title() {
    local text="$1"
    local padding=$(( (72 - ${#text}) / 2 ))
    ((padding < 0)) && padding=0
    printf '\n'
    write_rule
    printf '%s%*s%s%s\n' "$COLOR_CYAN" "$padding" "" "$text" "$COLOR_RESET"
    write_rule
}

write_step() {
    local text="$1"
    [[ "$text" == *: ]] || text="$text:"
    printf '%s[*] %s%s%s\n' "$COLOR_YELLOW" "$COLOR_CYAN" "$text" "$COLOR_RESET"
}

write_ok() {
    printf '%s[*] %s%s%s\n' "$COLOR_YELLOW" "$COLOR_GREEN" "$1" "$COLOR_RESET"
}

write_note() {
    printf '%s[!] %s%s%s\n' "$COLOR_YELLOW" "$COLOR_YELLOW" "$1" "$COLOR_RESET"
}

write_fail() {
    printf '%s[!] ERROR: %s%s\n' "$COLOR_RED" "$1" "$COLOR_RESET" >&2
}

write_field() {
    printf '%s    %-22s %s%s\n' "$COLOR_GRAY" "$1" "$2" "$COLOR_RESET"
}

join_lines() {
    local separator="${1:-, }"
    local result="" line
    while IFS= read -r line || [[ -n "$line" ]]; do
        [[ -z "$line" ]] && continue
        if [[ -n "$result" ]]; then
            result+="$separator"
        fi
        result+="$line"
    done
    printf '%s' "$result"
}

stop_manualito() {
    write_fail "$1"
    exit 1
}

exit_manualito() {
    write_ok "$1"
    exit 0
}

assert_file() {
    local path="$1"
    local name="$2"
    [[ -e "$path" ]] || stop_manualito "No encuentro $name en $path"
}

trim() {
    local value="$1"
    value="${value#"${value%%[![:space:]]*}"}"
    value="${value%"${value##*[![:space:]]}"}"
    printf '%s' "$value"
}

format_elapsed() {
    local seconds="$1"
    local hours=$((seconds / 3600))
    local minutes=$(((seconds % 3600) / 60))
    local rest=$((seconds % 60))
    if ((hours > 0)); then
        printf '%02d:%02d:%02d' "$hours" "$minutes" "$rest"
    else
        printf '%02d:%02d' "$minutes" "$rest"
    fi
}

is_interactive_console() {
    [[ -t 1 ]]
}

clear_manualito_screen() {
    is_interactive_console || return 0
    if [[ -n "${TERM:-}" ]] && command -v tput >/dev/null 2>&1 && tput clear 2>/dev/null; then
        return 0
    fi
    if command -v clear >/dev/null 2>&1 && clear 2>/dev/null; then
        return 0
    fi
    printf '\033[2J\033[H'
}

console_width() {
    local width=80
    if command -v tput >/dev/null 2>&1; then
        width="$(tput cols 2>/dev/null || printf '80')"
    fi
    [[ "$width" =~ ^[0-9]+$ ]] || width=80
    ((width < 20)) && width=20
    printf '%s' "$((width - 1))"
}

format_console_line() {
    local text="${1//$'\r'/ }"
    text="${text//$'\n'/ }"
    text="${text//$'\t'/ }"
    local width
    width="$(console_width)"
    if ((${#text} > width)); then
        text="${text:0:$((width - 3))}..."
    fi
    printf '%-*s' "$width" "$text"
}

get_activity_bar() {
    local frame="$1"
    local width=30
    local marker="====>"
    local position=$((frame % (width - ${#marker} + 1)))
    printf '['
    printf '%*s' "$position" ''
    printf '%s' "$marker"
    printf '%*s' "$((width - ${#marker} - position))" ''
    printf ']'
}

write_activity_line() {
    local started_at="$1"
    local frame="$2"
    is_interactive_console || return 0
    local now elapsed line
    now="$(date +%s)"
    elapsed="$((now - started_at))"
    line="$(printf '    %-22s %s  %s' "transcurrido" "$(format_elapsed "$elapsed")" "$(get_activity_bar "$frame")")"
    printf '\r%s%s%s' "$COLOR_GRAY" "$(format_console_line "$line")" "$COLOR_RESET"
}

complete_activity_line() {
    is_interactive_console && printf '\n'
    return 0
}

ensure_local_dirs() {
    umask 077
    mkdir -p "$LOCAL_DIR" "$LOGS_DIR"
    chmod 700 "$LOCAL_DIR" "$LOGS_DIR" 2>/dev/null || true
}

new_docker_log_path() {
    local stamp
    stamp="$(date +%Y%m%d-%H%M%S-%3N 2>/dev/null || date +%Y%m%d-%H%M%S)"
    printf '%s/%s-%s.log' "$LOGS_DIR" "$ACTION" "$stamp"
}

format_project_path() {
    local path="$1"
    if [[ "$path" == "$ROOT/"* ]]; then
        printf '%s' "${path#"$ROOT/"}"
    else
        printf '%s' "$path"
    fi
}

display_command() {
    local part
    printf '%q' "$1"
    shift
    for part in "$@"; do
        printf ' %q' "$part"
    done
}

read_console_line() {
    local answer
    if [[ -r /dev/tty ]]; then
        IFS= read -r answer </dev/tty || return 1
    else
        IFS= read -r answer || return 1
    fi
    printf '%s' "$answer"
}

read_setup_option() {
    printf '%s[*] %sSelecciona una opción: %s' "$COLOR_YELLOW" "$COLOR_CYAN" "$COLOR_RESET" >/dev/tty 2>/dev/null \
        || printf '%s[*] %sSelecciona una opción: %s' "$COLOR_YELLOW" "$COLOR_CYAN" "$COLOR_RESET" >&2
    read_console_line || true
}

read_yes_no() {
    local question="$1"
    local answer normalized
    while true; do
        printf '%s[*] %s%s (s/n): %s' "$COLOR_YELLOW" "$COLOR_GREEN" "$question" "$COLOR_RESET"
        answer="$(read_console_line)" || return 1
        normalized="$(lower "$(trim "$answer")")"
        case "$normalized" in
            s|si|sí|y|yes) return 0 ;;
            n|no) return 1 ;;
            *) write_note "Responde s o n." ;;
        esac
    done
}

run_external() {
    local label="$1"
    shift
    local command_path="$1"
    shift
    local args=("$@")
    local display
    display="$(display_command "$command_path" "${args[@]}")"
    write_step "$label"
    if ((DRY_RUN)); then
        write_field "accion" "$label"
        write_field "modo" "dry-run"
        return 0
    fi

    ensure_local_dirs
    local docker_log started_at frame exit_code pid
    docker_log="$(new_docker_log_path)"
    write_field "accion" "$label"
    write_field "estado" "en curso"
    write_field "log" "$(format_project_path "$docker_log")"
    started_at="$(date +%s)"

    {
        printf '# %s\n\n' "$display"
        "$command_path" "${args[@]}"
    } >"$docker_log" 2>&1 &
    pid=$!
    CURRENT_CHILD_PID="$pid"
    frame=0
    while kill -0 "$pid" 2>/dev/null; do
        write_activity_line "$started_at" "$frame"
        sleep 0.16
        frame=$((frame + 1))
    done
    set +e
    wait "$pid"
    exit_code=$?
    set -e
    CURRENT_CHILD_PID=""
    complete_activity_line
    write_field "transcurrido" "$(format_elapsed "$(($(date +%s) - started_at))")"
    if ((exit_code != 0)); then
        write_field "estado" "error"
        write_fail "$label falló con código $exit_code. Revisa $(format_project_path "$docker_log")"
        exit 1
    fi
    write_field "estado" "listo"
}

read_env_value() {
    local path="$1"
    local wanted_key="$2"
    local line key value
    [[ -f "$path" ]] || return 1
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        line="$(trim "$line")"
        [[ -z "$line" || "$line" == \#* || "$line" != *=* ]] && continue
        key="$(trim "${line%%=*}")"
        value="$(trim "${line#*=}")"
        if [[ "$key" == "$wanted_key" ]]; then
            printf '%s' "$value"
            return 0
        fi
    done <"$path"
    return 1
}

required_env_value() {
    local path="$1"
    local key="$2"
    local value
    if ! value="$(read_env_value "$path" "$key")" || [[ -z "$value" ]]; then
        stop_manualito "Falta $key en deploy/local/selected.env. Ejecuta setup.sh otra vez."
    fi
    printf '%s' "$value"
}

assert_accelerator() {
    case "$1" in
        cpu|nvidia) ;;
        *) stop_manualito "Acelerador inválido '$1'. Ejecuta setup.sh otra vez." ;;
    esac
}

assert_ocr() {
    case "$1" in
        tesseract|paddle_cpu|paddle_gpu) ;;
        *) stop_manualito "OCR inválido '$1'. Ejecuta setup.sh otra vez." ;;
    esac
}

test_docker() {
    write_step "Comprobando Docker"
    local docker_path compose os_type
    docker_path="$(command -v docker || true)"
    [[ -n "$docker_path" ]] || stop_manualito "Docker no está instalado o no está en PATH."
    DOCKER_PATH="$docker_path"
    write_field "docker" "$docker_path"
    if (( ! DRY_RUN )); then
        if ! os_type="$("$docker_path" info --format '{{.OSType}}' 2>/dev/null)"; then
            stop_manualito "Docker no responde. Arranca Docker y vuelve a intentarlo."
        fi
        os_type="$(trim "$os_type")"
        [[ "$os_type" == "linux" ]] || stop_manualito "Docker está en modo '$os_type'. Manualito necesita contenedores Linux."
        write_field "engine" "linux"
    fi
    if compose="$("$docker_path" compose version --short 2>/dev/null)"; then
        write_field "compose" "$(trim "$compose")"
    else
        stop_manualito "Docker Compose no responde. En Linux instala el plugin de Compose; en WSL activa la integración de Docker Desktop con esta distro."
    fi
}

get_nvidia_info() {
    write_step "Buscando NVIDIA"
    local nvidia_path raw line name driver free total best_name="" best_driver="" best_free=-1 best_total=0
    nvidia_path="$(command -v nvidia-smi || true)"
    if [[ -z "$nvidia_path" ]]; then
        write_field "estado" "no detectada"
        NVIDIA_AVAILABLE=0
        return 0
    fi
    if ((DRY_RUN)); then
        write_field "nvidia-smi" "$nvidia_path"
        write_field "estado" "detectada (sin medir en dry-run)"
        NVIDIA_AVAILABLE=1
        NVIDIA_NAME="NVIDIA"
        NVIDIA_DRIVER=""
        NVIDIA_FREE_MB=0
        NVIDIA_TOTAL_MB=0
        return 0
    fi
    if ! raw="$("$nvidia_path" --query-gpu=name,driver_version,memory.free,memory.total --format=csv,noheader,nounits 2>/dev/null)"; then
        write_field "estado" "nvidia-smi no responde"
        NVIDIA_AVAILABLE=0
        return 0
    fi
    while IFS= read -r line || [[ -n "$line" ]]; do
        IFS=',' read -r name driver free total _ <<<"$line"
        name="$(trim "${name:-}")"
        driver="$(trim "${driver:-}")"
        free="$(trim "${free:-}")"
        total="$(trim "${total:-}")"
        [[ "$free" =~ ^[0-9]+$ && "$total" =~ ^[0-9]+$ ]] || continue
        if ((free > best_free)); then
            best_name="$name"
            best_driver="$driver"
            best_free="$free"
            best_total="$total"
        fi
    done <<<"$raw"
    if ((best_free < 0)); then
        write_field "estado" "sin datos de memoria"
        NVIDIA_AVAILABLE=0
        return 0
    fi
    NVIDIA_AVAILABLE=1
    NVIDIA_NAME="$best_name"
    NVIDIA_DRIVER="$best_driver"
    NVIDIA_FREE_MB="$best_free"
    NVIDIA_TOTAL_MB="$best_total"
    write_field "gpu" "$NVIDIA_NAME"
    write_field "driver" "$NVIDIA_DRIVER"
    write_field "vram libre" "$(awk -v free="$NVIDIA_FREE_MB" -v total="$NVIDIA_TOTAL_MB" 'BEGIN {printf "%.1f GB / %.1f GB", free/1024, total/1024}')"
}

test_docker_gpu_run() {
    local docker_path="$1"
    ((DRY_RUN)) && return 1
    "$docker_path" run --rm --gpus all hello-world >/dev/null 2>&1
}

test_docker_gpu() {
    local docker_path="$1"
    DOCKER_GPU=0
    ((NVIDIA_AVAILABLE)) || return 0
    write_step "Comprobando NVIDIA en Docker"
    if ((DRY_RUN)); then
        write_field "estado" "saltado en dry-run"
        return 0
    fi
    if test_docker_gpu_run "$docker_path"; then
        DOCKER_GPU=1
        write_field "estado" "GPU NVIDIA disponible en Docker"
    else
        write_field "estado" "Docker no ha validado --gpus all"
        write_note "Se usará cpu salvo que fuerces NVIDIA manualmente."
    fi
}

assert_selected_gpu_runtime() {
    local docker_path="$1"
    local accelerator="$2"
    local ocr_mode="$3"
    [[ "$accelerator" == "nvidia" || "$ocr_mode" == "paddle_gpu" ]] || return 0
    write_step "Validando NVIDIA guardada"
    if ((DRY_RUN)); then
        write_field "estado" "saltado en dry-run"
        return 0
    fi
    if test_docker_gpu_run "$docker_path"; then
        write_field "estado" "GPU NVIDIA disponible en Docker"
        return 0
    fi
    stop_manualito "La selección guardada pide GPU NVIDIA, pero este Docker no puede usarla. Ejecuta setup.sh en este mismo entorno y usa la recomendada, o configura NVIDIA en Docker."
}

local_port_open() {
    local port="$1"
    ( : >"/dev/tcp/127.0.0.1/$port" ) >/dev/null 2>&1
}

is_wsl() {
    grep -qiE 'microsoft|wsl' /proc/version 2>/dev/null
}

service_is_running() {
    local service="$1"
    local running_services="$2"
    grep -Fxq "$service" <<<"$running_services"
}

port_conflict_message() {
    local service="$1"
    local port="$2"
    local message="El puerto $port está ocupado y $service no está corriendo en este stack."
    if is_wsl; then
        message="$message Si Manualito se arrancó con start.bat, páralo con stop.bat o usa el mismo entorno para arrancar y parar."
    else
        message="$message Libera el puerto o reinicia Docker si lo ocupa un contenedor invisible para este proyecto."
    fi
    printf '%s' "$message"
}

assert_start_ports_free() {
    ((DRY_RUN)) && return 0
    local running_services="$1"
    local service port
    while read -r service port; do
        [[ -z "$service" ]] && continue
        if local_port_open "$port" && ! service_is_running "$service" "$running_services"; then
            stop_manualito "$(port_conflict_message "$service" "$port")"
        fi
    done <<'EOF'
api 8000
flower 5555
mailpit 8025
frontend 5173
EOF
}

manualito_ports_open() {
    local_port_open 8000 || local_port_open 5173
}

version_ge() {
    local actual="$1"
    local minimum="$2"
    [[ -n "$actual" ]] || return 1
    [[ "$(printf '%s\n%s\n' "$minimum" "$actual" | sort -V | head -n1)" == "$minimum" ]]
}

get_paddle_gpu_status() {
    if (( ! DOCKER_GPU )); then
        PADDLE_GPU_AVAILABLE=0
        PADDLE_GPU_REASON="no disponible: requiere NVIDIA en Docker"
    elif ! version_ge "$NVIDIA_DRIVER" "$PADDLE_GPU_MIN_DRIVER"; then
        PADDLE_GPU_AVAILABLE=0
        PADDLE_GPU_REASON="no disponible: driver NVIDIA < 522.06"
    else
        PADDLE_GPU_AVAILABLE=1
        PADDLE_GPU_REASON="NVIDIA compatible"
    fi
}

get_profile_file() {
    case "$1" in
        low) printf '%s' "$LOW_PROFILE" ;;
        high) printf '%s' "$HIGH_PROFILE" ;;
        *) stop_manualito "LLM inválido: $1" ;;
    esac
}

get_llm_model() {
    local profile value
    profile="$(get_profile_file "$1")"
    assert_file "$profile" "perfil LLM $1"
    value="$(read_env_value "$profile" "OLLAMA_MODEL" || true)"
    [[ -n "$value" ]] || stop_manualito "Falta OLLAMA_MODEL en perfil LLM $1."
    printf '%s' "$value"
}

get_llm_estimated_vram_gb() {
    local profile value
    profile="$(get_profile_file "$1")"
    assert_file "$profile" "perfil LLM $1"
    value="$(read_env_value "$profile" "MANUALITO_LLM_VRAM_GB" || true)"
    [[ "$value" =~ ^[0-9]+([.][0-9]+)?$ ]] || stop_manualito "MANUALITO_LLM_VRAM_GB inválido en perfil LLM $1."
    printf '%s' "$value"
}

get_llm_recommended_free_mb() {
    local vram
    vram="$(get_llm_estimated_vram_gb "$1")"
    awk -v vram="$vram" -v reserve="$LLM_VRAM_RESERVE_GB" 'BEGIN {printf "%d", int(((vram + reserve) * 1024) + 0.999999)}'
}

format_llm_vram() {
    awk -v vram="$(get_llm_estimated_vram_gb "$1")" 'BEGIN {printf "~%.1f GB", vram}'
}

format_llm_choice() {
    printf '%s (%s)' "$1" "$(get_llm_model "$1")"
}

format_selection() {
    printf '%s + %s' "$1" "$(format_llm_choice "$2")"
}

format_menu_selection() {
    printf '%-6s + %-4s (%s)' "$1" "$2" "$(get_llm_model "$2")"
}

write_menu_option() {
    local key="$1"
    local choice="$2"
    local description="$3"
    local width="${4:-38}"
    printf '%s' "$COLOR_GRAY"
    printf "    %-6s %-${width}s" "$key" "$choice"
    [[ -n "$description" ]] && printf ' %s' "$description"
    printf '%s\n' "$COLOR_RESET"
}

write_ocr_selection_header() {
    clear_manualito_screen
    write_title "Manualito setup"
    write_step "Modo seleccionado"
    write_field "modo" "$(format_selection "$1" "$2")"
    write_field "vram llm" "$(format_llm_vram "$2")"
}

write_setup_execution_header() {
    clear_manualito_screen
    write_title "Manualito setup"
    write_step "Selección final"
    write_field "modo" "$(format_selection "$FINAL_ACCELERATOR" "$FINAL_LLM")"
    write_field "vram llm" "$(format_llm_vram "$FINAL_LLM")"
    write_field "ocr" "$FINAL_OCR"
    write_field "config" "deploy/local/selected.env"
    if [[ "$FINAL_ACCELERATOR" != "$RECOMMENDED_ACCELERATOR" || "$FINAL_LLM" != "$RECOMMENDED_LLM" || "$FINAL_OCR" != "$RECOMMENDED_OCR" ]]; then
        write_field "aviso" "selección manual"
    fi
    [[ "$FINAL_ACCELERATOR" == "cpu" && "$FINAL_LLM" == "high" ]] && write_field "aviso" "CPU/RAM; puede ser muy lento"
    [[ "$FINAL_OCR" == "paddle_cpu" ]] && write_field "aviso ocr" "muy fiable, pero lento"
    [[ "$FINAL_OCR" == "paddle_gpu" ]] && write_field "aviso ocr" "requiere Paddle CUDA y VRAM libre"
    return 0
}

get_ocr_recommendation() {
    local selected_accelerator="$1"
    local llm_size="$2"
    if [[ "$selected_accelerator" != "nvidia" ]]; then
        OCR_RECOMMENDED_MODE="tesseract"
        OCR_RECOMMENDATION_DETAIL="el modo cpu no solicita GPU a Docker"
        return 0
    fi
    if (( ! PADDLE_GPU_AVAILABLE )); then
        OCR_RECOMMENDED_MODE="tesseract"
        OCR_RECOMMENDATION_DETAIL="$PADDLE_GPU_REASON"
        return 0
    fi
    if ((NVIDIA_FREE_MB <= 0)); then
        OCR_RECOMMENDED_MODE="tesseract"
        OCR_RECOMMENDATION_DETAIL="no hay una medida real de VRAM libre"
        return 0
    fi
    local remaining
    remaining="$(awk -v free="$NVIDIA_FREE_MB" -v llm="$(get_llm_estimated_vram_gb "$llm_size")" 'BEGIN {printf "%.1f", free/1024 - llm}')"
    if awk -v remaining="$remaining" -v budget="$PADDLE_GPU_VRAM_BUDGET_GB" 'BEGIN {exit !(remaining >= budget)}'; then
        OCR_RECOMMENDED_MODE="paddle_gpu"
        OCR_RECOMMENDATION_DETAIL="quedan ~$remaining GB tras el LLM seleccionado"
    else
        OCR_RECOMMENDED_MODE="tesseract"
        OCR_RECOMMENDATION_DETAIL="quedan ~$remaining GB tras el LLM seleccionado; PaddleGPU pide ~$PADDLE_GPU_VRAM_BUDGET_GB GB de margen"
    fi
}

read_setup_selection() {
    local recommended_accelerator="$1"
    local recommended_llm="$2"
    local answer exit_key
    exit_key=5
    ((DOCKER_GPU)) || exit_key=3
    write_step "Selección de modo"
    write_menu_option "Enter" "$(format_menu_selection "$recommended_accelerator" "$recommended_llm")" "<- recomendada"
    write_menu_option "1" "$(format_menu_selection "cpu" "low")" "máxima compatibilidad"
    write_menu_option "2" "$(format_menu_selection "cpu" "high")" "CPU/RAM; perfil experimental, puede ser muy lento"
    if ((DOCKER_GPU)); then
        write_menu_option "3" "$(format_menu_selection "nvidia" "low")" "mayor velocidad"
        write_menu_option "4" "$(format_menu_selection "nvidia" "high")" "perfil de referencia; mejor calidad esperada"
    fi
    write_menu_option "$exit_key" "exit" "salir sin cambios"
    write_note "Usa la recomendada salvo que sepas exactamente qué estás cambiando."

    if [[ ! -t 0 ]]; then
        CHOSEN_ACCELERATOR="$recommended_accelerator"
        CHOSEN_LLM="$recommended_llm"
        return 0
    fi
    while true; do
        answer="$(lower "$(trim "$(read_setup_option)")")"
        if [[ "$answer" == "$exit_key" || "$answer" == "5" || "$answer" == "exit" || "$answer" == "salir" || "$answer" == "q" ]]; then
            exit_manualito "Setup cancelado. No se han aplicado cambios."
        fi
        case "$answer" in
            ""|r) CHOSEN_ACCELERATOR="$recommended_accelerator"; CHOSEN_LLM="$recommended_llm"; return 0 ;;
            1) CHOSEN_ACCELERATOR="cpu"; CHOSEN_LLM="low"; return 0 ;;
            2) CHOSEN_ACCELERATOR="cpu"; CHOSEN_LLM="high"; return 0 ;;
            3) if ((DOCKER_GPU)); then CHOSEN_ACCELERATOR="nvidia"; CHOSEN_LLM="low"; return 0; fi ;;
            4) if ((DOCKER_GPU)); then CHOSEN_ACCELERATOR="nvidia"; CHOSEN_LLM="high"; return 0; fi ;;
        esac
        write_note "Opción no válida. Pulsa Enter para usar la recomendada."
    done
}

read_ocr_selection() {
    local recommended_ocr="$1"
    local recommendation_detail="$2"
    local answer exit_key
    exit_key=4
    write_step "Selección de OCR"
    write_menu_option "Enter" "$recommended_ocr" "<- recomendada" 14
    write_menu_option "1" "tesseract" "máxima compatibilidad" 14
    write_menu_option "2" "paddle_cpu" "muy fiable, pero lento" 14
    if ((PADDLE_GPU_AVAILABLE)); then
        write_menu_option "3" "paddle_gpu" "mejor OCR esperado; requiere margen de VRAM" 14
    else
        write_menu_option "3" "paddle_gpu" "$PADDLE_GPU_REASON" 14
    fi
    write_menu_option "$exit_key" "exit" "salir sin cambios" 14
    if [[ "$recommended_ocr" == "paddle_gpu" ]]; then
        write_note "paddle_gpu se recomienda porque $recommendation_detail; Tesseract sigue siendo la opción conservadora."
    else
        write_note "Tesseract recomendado: $recommendation_detail."
    fi

    if [[ ! -t 0 ]]; then
        CHOSEN_OCR="$recommended_ocr"
        return 0
    fi
    while true; do
        answer="$(lower "$(trim "$(read_setup_option)")")"
        if [[ "$answer" == "$exit_key" || "$answer" == "5" || "$answer" == "exit" || "$answer" == "salir" || "$answer" == "q" ]]; then
            exit_manualito "Setup cancelado. No se han aplicado cambios."
        fi
        case "$answer" in
            ""|r) CHOSEN_OCR="$recommended_ocr"; return 0 ;;
            1|tesseract) CHOSEN_OCR="tesseract"; return 0 ;;
            2|paddle_cpu) CHOSEN_OCR="paddle_cpu"; return 0 ;;
            3|paddle_gpu)
                if ((PADDLE_GPU_AVAILABLE)); then
                    CHOSEN_OCR="paddle_gpu"
                    return 0
                fi
                write_note "paddle_gpu no está disponible: $PADDLE_GPU_REASON."
                ;;
            *) write_note "Opción no válida. Pulsa Enter para usar la recomendada." ;;
        esac
    done
}

resolve_selection() {
    RECOMMENDED_ACCELERATOR="cpu"
    RECOMMENDED_LLM="low"
    get_paddle_gpu_status
    if ((DOCKER_GPU && NVIDIA_AVAILABLE)); then
        if ((NVIDIA_FREE_MB >= $(get_llm_recommended_free_mb "high"))); then
            RECOMMENDED_ACCELERATOR="nvidia"
            RECOMMENDED_LLM="high"
        elif ((NVIDIA_FREE_MB >= $(get_llm_recommended_free_mb "low"))); then
            RECOMMENDED_ACCELERATOR="nvidia"
            RECOMMENDED_LLM="low"
        fi
    fi
    get_ocr_recommendation "$RECOMMENDED_ACCELERATOR" "$RECOMMENDED_LLM"
    RECOMMENDED_OCR="$OCR_RECOMMENDED_MODE"

    FINAL_ACCELERATOR="$RECOMMENDED_ACCELERATOR"
    FINAL_LLM="$RECOMMENDED_LLM"
    FINAL_OCR="$RECOMMENDED_OCR"

    write_step "Configuración recomendada"
    write_field "recomendada" "$(format_selection "$RECOMMENDED_ACCELERATOR" "$RECOMMENDED_LLM")"
    write_field "vram llm" "$(format_llm_vram "$RECOMMENDED_LLM")"
    write_field "ocr" "$RECOMMENDED_OCR"

    if ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN)); then
        [[ "$ACCELERATOR" != "auto" ]] && FINAL_ACCELERATOR="$ACCELERATOR"
        [[ "$LLM" != "auto" ]] && FINAL_LLM="$LLM"
        [[ "$FINAL_ACCELERATOR" == "cpu" && "$LLM" == "auto" ]] && FINAL_LLM="low"
        get_ocr_recommendation "$FINAL_ACCELERATOR" "$FINAL_LLM"
        FINAL_OCR="$OCR_RECOMMENDED_MODE"
        [[ "$OCR" != "auto" ]] && FINAL_OCR="$OCR"
    else
        read_setup_selection "$RECOMMENDED_ACCELERATOR" "$RECOMMENDED_LLM"
        FINAL_ACCELERATOR="$CHOSEN_ACCELERATOR"
        FINAL_LLM="$CHOSEN_LLM"
        get_ocr_recommendation "$FINAL_ACCELERATOR" "$FINAL_LLM"
        write_ocr_selection_header "$FINAL_ACCELERATOR" "$FINAL_LLM"
        read_ocr_selection "$OCR_RECOMMENDED_MODE" "$OCR_RECOMMENDATION_DETAIL"
        FINAL_OCR="$CHOSEN_OCR"
    fi

    if ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN || SKIP_BUILD)); then
        write_step "Configuración seleccionada"
        write_field "selección" "$(format_selection "$FINAL_ACCELERATOR" "$FINAL_LLM")"
        write_field "vram llm" "$(format_llm_vram "$FINAL_LLM")"
        write_field "ocr" "$FINAL_OCR"
    fi
    if [[ "$FINAL_ACCELERATOR" != "$RECOMMENDED_ACCELERATOR" || "$FINAL_LLM" != "$RECOMMENDED_LLM" || "$FINAL_OCR" != "$RECOMMENDED_OCR" ]]; then
        ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN || SKIP_BUILD)) && write_note "Configuración manual distinta de la recomendada."
    fi
    if [[ "$FINAL_ACCELERATOR" == "cpu" && "$FINAL_LLM" == "high" ]]; then
        ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN || SKIP_BUILD)) && write_note "$(format_selection "cpu" "high") usa CPU/RAM; perfil experimental, puede ser muy lento."
    fi
    [[ "$FINAL_ACCELERATOR" == "nvidia" && "$NVIDIA_AVAILABLE" -eq 0 ]] && stop_manualito "Has forzado NVIDIA, pero nvidia-smi no está disponible."
    if [[ "$FINAL_ACCELERATOR" == "nvidia" && "$DOCKER_GPU" -eq 0 ]]; then
        ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN || SKIP_BUILD)) && write_note "Has forzado NVIDIA aunque Docker no ha validado --gpus all."
    fi
    [[ "$FINAL_OCR" == "paddle_cpu" ]] && ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN || SKIP_BUILD)) && write_note "paddle_cpu es muy fiable, pero puede ser bastante lento."
    if [[ "$FINAL_OCR" == "paddle_gpu" && "$PADDLE_GPU_AVAILABLE" -eq 0 ]]; then
        if ((DRY_RUN)); then
            write_note "Has elegido paddle_gpu, pero $PADDLE_GPU_REASON."
        else
            stop_manualito "Has elegido paddle_gpu, pero $PADDLE_GPU_REASON."
        fi
    fi
    if [[ "$FINAL_OCR" == "paddle_gpu" && "$PADDLE_GPU_AVAILABLE" -eq 1 && "$OCR_RECOMMENDED_MODE" != "paddle_gpu" ]]; then
        ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED || DRY_RUN || SKIP_BUILD)) && write_note "Has elegido paddle_gpu aunque $OCR_RECOMMENDATION_DETAIL."
    fi
    return 0
}

save_selection() {
    local quiet="$1"
    local exists=0
    [[ -f "$SELECTED_ENV" ]] && exists=1
    if ((DRY_RUN)); then
        ((quiet)) && return 0
        write_ok "Selección calculada:"
        write_field "archivo" "deploy/local/selected.env"
        return 0
    fi
    ensure_local_dirs
    local tmp
    tmp="$(mktemp "$LOCAL_DIR/selected.env.XXXXXX")"
    chmod 600 "$tmp"
    {
        printf '# Generado por setup.sh/setup.bat. No editar salvo que sepas lo que haces.\n'
        printf 'MANUALITO_ACCELERATOR=%s\n' "$FINAL_ACCELERATOR"
        printf 'MANUALITO_LLM_SIZE=%s\n' "$FINAL_LLM"
        printf 'MANUALITO_OCR_MODE=%s\n' "$FINAL_OCR"
        printf 'MANUALITO_RECOMMENDED_ACCELERATOR=%s\n' "$RECOMMENDED_ACCELERATOR"
        printf 'MANUALITO_RECOMMENDED_LLM_SIZE=%s\n' "$RECOMMENDED_LLM"
        printf 'MANUALITO_RECOMMENDED_OCR_MODE=%s\n' "$RECOMMENDED_OCR"
        printf 'MANUALITO_SETUP_VERSION=1\n'
    } >"$tmp"
    mv -f "$tmp" "$SELECTED_ENV"
    chmod 600 "$SELECTED_ENV" 2>/dev/null || true
    ((quiet)) && return 0
    if ((exists)); then
        write_ok "Selección actualizada:"
    else
        write_ok "Selección guardada:"
    fi
    write_field "archivo" "deploy/local/selected.env"
}

build_compose_args() {
    local accelerator="$1"
    local llm_size="$2"
    local ocr_mode="$3"
    local profile
    assert_accelerator "$accelerator"
    assert_ocr "$ocr_mode"
    profile="$(get_profile_file "$llm_size")"
    assert_file "$ROOT_ENV" ".env"
    assert_file "$LLM_ENV" "config/llm.env"
    assert_file "$COMPOSE_FILE" "compose.yaml"
    assert_file "$profile" "perfil LLM $llm_size"
    COMPOSE_ARGS=(compose --ansi never --progress plain --env-file "$ROOT_ENV" --env-file "$LLM_ENV" --env-file "$profile" -f "$COMPOSE_FILE")
    if [[ "$accelerator" == "nvidia" ]]; then
        assert_file "$NVIDIA_COMPOSE" "override NVIDIA"
        COMPOSE_ARGS+=(-f "$NVIDIA_COMPOSE")
    fi
    if [[ "$ocr_mode" == "paddle_cpu" ]]; then
        assert_file "$OCR_PADDLE_CPU_COMPOSE" "override OCR Paddle CPU"
        COMPOSE_ARGS+=(-f "$OCR_PADDLE_CPU_COMPOSE")
    fi
    if [[ "$ocr_mode" == "paddle_gpu" ]]; then
        assert_file "$OCR_PADDLE_GPU_COMPOSE" "override OCR Paddle GPU"
        COMPOSE_ARGS+=(-f "$OCR_PADDLE_GPU_COMPOSE")
    fi
}

invoke_compose() {
    local docker_path="$1"
    shift
    local accelerator="$1"
    local llm_size="$2"
    local ocr_mode="$3"
    shift 3
    local tail=("$@")
    build_compose_args "$accelerator" "$llm_size" "$ocr_mode"
    run_external "docker compose ${tail[*]}" "$docker_path" "${COMPOSE_ARGS[@]}" "${tail[@]}"
}

capture_compose_lines() {
    local docker_path="$1"
    shift
    local accelerator="$1"
    local llm_size="$2"
    local ocr_mode="$3"
    shift 3
    local tail=("$@")
    ((DRY_RUN)) && return 0
    build_compose_args "$accelerator" "$llm_size" "$ocr_mode"
    "$docker_path" "${COMPOSE_ARGS[@]}" "${tail[@]}" 2>/dev/null | sed '/^[[:space:]]*$/d' || true
}

load_selection() {
    [[ -f "$SELECTED_ENV" ]] || return 1
    SELECTED_ACCELERATOR="$(required_env_value "$SELECTED_ENV" "MANUALITO_ACCELERATOR")"
    SELECTED_LLM="$(required_env_value "$SELECTED_ENV" "MANUALITO_LLM_SIZE")"
    SELECTED_OCR="$(required_env_value "$SELECTED_ENV" "MANUALITO_OCR_MODE")"
    assert_accelerator "$SELECTED_ACCELERATOR"
    assert_ocr "$SELECTED_OCR"
}

load_existing_selection_for_compose() {
    if load_selection; then
        EXISTING_ACCELERATOR="$SELECTED_ACCELERATOR"
        EXISTING_LLM="$SELECTED_LLM"
        EXISTING_OCR="$SELECTED_OCR"
    else
        EXISTING_ACCELERATOR="cpu"
        EXISTING_LLM="low"
        EXISTING_OCR="tesseract"
    fi
}

get_running_manualito_services() {
    local docker_path="$1"
    load_existing_selection_for_compose
    capture_compose_lines "$docker_path" "$EXISTING_ACCELERATOR" "$EXISTING_LLM" "$EXISTING_OCR" ps --status=running --services
}

resolve_running_manualito_before_vram() {
    local docker_path="$1"
    ((DRY_RUN)) && return 0
    local running_services
    running_services="$(get_running_manualito_services "$docker_path")"
    [[ -z "$running_services" ]] && return 0
    write_step "Manualito ya está en ejecución"
    write_field "servicios" "$(printf '%s\n' "$running_services" | join_lines ', ')"
    write_note "Puede ocupar VRAM y hacer que la recomendación sea más conservadora."
    if ((MANUAL_SELECTION_REQUESTED || USE_RECOMMENDED)); then
        write_note "No se parará automáticamente porque has usado parámetros de setup."
        return 0
    fi
    if read_yes_no "¿Quieres pararlo antes de medir VRAM?"; then
        invoke_compose "$docker_path" "$EXISTING_ACCELERATOR" "$EXISTING_LLM" "$EXISTING_OCR" down
    else
        write_note "La recomendación usará la VRAM libre actual."
    fi
}

invoke_setup() {
    local docker_path="$1"
    resolve_running_manualito_before_vram "$docker_path"
    get_nvidia_info
    test_docker_gpu "$docker_path"
    resolve_selection
    save_selection "$((! DRY_RUN && ! SKIP_BUILD))"
    if ((SKIP_BUILD)); then
        write_note "Build saltado por -SkipBuild."
        return 0
    fi
    write_setup_execution_header
    invoke_compose "$docker_path" "$FINAL_ACCELERATOR" "$FINAL_LLM" "$FINAL_OCR" up --build --no-start
    if ((DRY_RUN)); then
        write_ok "Comando de setup preparado"
    else
        write_ok "Setup preparado."
    fi
}

get_running_llm_model() {
    local docker_path="$1"
    capture_compose_lines "$docker_path" "$SELECTED_ACCELERATOR" "$SELECTED_LLM" "$SELECTED_OCR" exec -T llm printenv OLLAMA_MODEL | head -n1
}

invoke_start() {
    local docker_path="$1"
    if ! load_selection; then
        write_note "Primera ejecución detectada: lanzando setup antes de arrancar."
        invoke_setup "$docker_path"
        SELECTED_ACCELERATOR="$FINAL_ACCELERATOR"
        SELECTED_LLM="$FINAL_LLM"
        SELECTED_OCR="$FINAL_OCR"
    fi
    assert_selected_gpu_runtime "$docker_path" "$SELECTED_ACCELERATOR" "$SELECTED_OCR"
    assert_start_ports_free "$(get_running_manualito_services "$docker_path")"
    write_step "Arrancando Manualito"
    write_field "modo" "$(format_selection "$SELECTED_ACCELERATOR" "$SELECTED_LLM")"
    write_field "ocr" "$SELECTED_OCR"
    invoke_compose "$docker_path" "$SELECTED_ACCELERATOR" "$SELECTED_LLM" "$SELECTED_OCR" up -d
    if ((DRY_RUN)); then
        write_ok "Comando de arranque preparado"
    else
        write_ok "Manualito listo:"
        write_field "api" "http://localhost:8000"
        write_field "app" "http://localhost:5173"
        write_field "flower" "http://localhost:5555"
        write_field "mailpit" "http://localhost:8025"
        write_field "openapi" "http://localhost:8000/docs"
        write_ok "LLM:"
        local running_model
        running_model="$(get_running_llm_model "$docker_path" || true)"
        if [[ -z "$running_model" ]]; then
            write_field "modelo" "no verificado"
        else
            write_field "modelo" "$running_model"
        fi
    fi
}

invoke_stop() {
    local docker_path="$1"
    if ! load_selection; then
        SELECTED_ACCELERATOR="cpu"
        SELECTED_LLM="low"
        SELECTED_OCR="tesseract"
        write_note "No hay selected.env; parando con cpu + low."
    fi
    invoke_compose "$docker_path" "$SELECTED_ACCELERATOR" "$SELECTED_LLM" "$SELECTED_OCR" down
    if ((DRY_RUN)); then
        write_ok "Comando de parada preparado"
    elif manualito_ports_open; then
        write_note "Los puertos de Manualito siguen ocupados. Si lo arrancaste desde otro entorno, páralo también desde ahí."
        write_ok "Comando de parada completado"
    else
        write_ok "Manualito parado"
    fi
}

main() {
    parse_args "$@"
    cd "$ROOT"
    clear_manualito_screen
    write_title "Manualito $ACTION"
    assert_file "$COMPOSE_FILE" "compose.yaml"
    local docker_path
    test_docker
    docker_path="$DOCKER_PATH"
    case "$ACTION" in
        setup)
            invoke_setup "$docker_path"
            if (( ! DRY_RUN && ! SKIP_BUILD )); then
                if read_yes_no "¿Quieres arrancar Manualito ahora?"; then
                    exit 42
                else
                    write_ok "Manualito queda preparado. Abre start.sh para arrancarlo."
                fi
            fi
            ;;
        start) invoke_start "$docker_path" ;;
        stop) invoke_stop "$docker_path" ;;
    esac
}

main "$@"
