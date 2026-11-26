#!/usr/bin/env bash
# tools/imagery tests and type check. Uses $GEO_PYTHON, else /opt/tools/geo-venv, else python3
# (the chunk grid and roads use chennai_geo, which needs the packages of tools/geo/requirements.txt).
# No network: every test uses committed data or hand-written parser fixtures.
set -euo pipefail
cd "$(dirname "$0")"
PY="${GEO_PYTHON:-}"
if [[ -z "$PY" ]]; then
  if [[ -x /opt/tools/geo-venv/bin/python ]]; then PY=/opt/tools/geo-venv/bin/python; else PY=python3; fi
fi
if "$PY" -c "import mypy" 2>/dev/null; then "$PY" -m mypy --ignore-missing-imports --explicit-package-bases street_imagery; fi
"$PY" -m street_imagery check
exec "$PY" -m pytest -q tests "$@"
