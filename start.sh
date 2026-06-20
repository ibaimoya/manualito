#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT="$ROOT/deploy/linux/manualito.sh"
BASH_BIN="${BASH:-bash}"

exec "$BASH_BIN" "$SCRIPT" --action start "$@"
