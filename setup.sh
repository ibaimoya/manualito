#!/usr/bin/env bash

set -Eeuo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
SCRIPT="$ROOT/deploy/linux/manualito.sh"
BASH_BIN="${BASH:-bash}"

set +e
"$BASH_BIN" "$SCRIPT" --action setup "$@"
status=$?
set -e

if [[ "$status" -eq 42 ]]; then
    set +e
    "$BASH_BIN" "$ROOT/start.sh"
    status=$?
    set -e
fi

exit "$status"
