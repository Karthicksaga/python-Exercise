#!/usr/bin/env bash
# The people tests and review renders (docs/characters.md).
#   tools/run_people_tests.sh                       # the people tests through ./run_tests.sh
#   tools/run_people_tests.sh --lineup -- <args>    # review render, see tests/people/people_lineup.gd
# Renders use the Compatibility renderer under xvfb (software Vulkan draws skinned meshes black).
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
godot_bin="${GODOT:-godot}"
if [[ "${1:-}" != "--lineup" ]]; then
  exec "$here/run_tests.sh" --filter=people/ "$@"
fi
shift
if [[ "${1:-}" == "--" ]]; then shift; fi
[[ "${SKIP_IMPORT:-0}" == "1" ]] || timeout 900 "$godot_bin" --headless --audio-driver Dummy --path "$here" --import > /dev/null 2>&1 || true
timeout 300 xvfb-run -a -s "-screen 0 1830x824x24" "$godot_bin" --rendering-method gl_compatibility --rendering-driver opengl3 \
  --audio-driver Dummy --path "$here" --script res://tests/people/people_lineup.gd -- "$@"
