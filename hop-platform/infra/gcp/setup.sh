#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON="${PYTHON:-python3}"

if ! command -v "$PYTHON" &>/dev/null; then
  echo "Error: Python 3 is required." >&2
  exit 1
fi

"$PYTHON" "$SCRIPT_DIR/setup_gcp.py" "$@"
