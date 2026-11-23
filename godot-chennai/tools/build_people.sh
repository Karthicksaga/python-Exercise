#!/usr/bin/env bash
# Builds people with Blender (tools/blender/characters.py) and writes the game GLBs
# (tools/blender/optimize_people.py). Arguments go to characters.py, e.g.
#   tools/build_people.sh --set phase1
#   tools/build_people.sh --only nurse,homemaker
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
raw="$(mktemp -d)"
trap 'rm -rf "$raw"' EXIT
"${BLENDER:-blender}" -b --factory-startup --python "$here/tools/blender/characters.py" -- "$here/assets/people" --raw "$raw" "$@"
python3 "$here/tools/blender/optimize_people.py" "$raw" "$here/assets/people"
