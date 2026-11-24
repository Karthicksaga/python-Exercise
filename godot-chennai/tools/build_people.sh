#!/usr/bin/env bash
# Builds people with Blender (tools/blender/characters.py) and writes the game GLBs
# (tools/blender/optimize_people.py), then the player's CC0 clip rig and the Godot imports.
# Needs the Universal Animation Library GLB (CC0) at $UAL_GLB or /opt/tools/ual/ (docs/characters.md). Arguments go to characters.py, e.g.
#   tools/build_people.sh --set phase1
#   tools/build_people.sh --only nurse,homemaker
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
raw="$(mktemp -d)"
trap 'rm -rf "$raw"' EXIT
"${BLENDER:-blender}" -b --factory-startup --python "$here/tools/blender/characters.py" -- "$here/assets/people" --raw "$raw" "$@"
python3 "$here/tools/blender/optimize_people.py" "$raw" "$here/assets/people"
# The player's clip rig (assets/animations/locomotion.glb, CC0, decision G-100), unless only some
# people were asked for.
if [[ " $* " != *" --only "* ]]; then
  "${BLENDER:-blender}" -b --factory-startup --python "$here/tools/blender/characters.py" -- "$here/assets/people" --locomotion "$raw/locomotion.glb"
  npx --yes @gltf-transform/cli@4.5.0 resample "$raw/locomotion.glb" "$here/assets/animations/locomotion.glb" > /dev/null
fi
# Godot import, the clips set to loop in each .import file, import again (G-13).
"${GODOT:-godot}" --headless --audio-driver Dummy --path "$here" --import > /dev/null 2>&1 || true
python3 "$here/tools/blender/people_import.py"
"${GODOT:-godot}" --headless --audio-driver Dummy --path "$here" --import > /dev/null 2>&1 || true
