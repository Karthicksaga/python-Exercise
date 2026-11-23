#!/usr/bin/env bash
# Run the tools/geo tests. Uses $GEO_PYTHON, else /opt/tools/geo-venv, else python3 (needs the
# packages in requirements.txt). No network: every test uses committed fixtures or world files.
set -euo pipefail
cd "$(dirname "$0")"
PY="${GEO_PYTHON:-}"
if [[ -z "$PY" ]]; then
  if [[ -x /opt/tools/geo-venv/bin/python ]]; then PY=/opt/tools/geo-venv/bin/python; else PY=python3; fi
fi
if "$PY" -c "import mypy" 2>/dev/null; then "$PY" -m mypy --ignore-missing-imports chennai_geo; fi
exec "$PY" -m pytest -q tests "$@"
