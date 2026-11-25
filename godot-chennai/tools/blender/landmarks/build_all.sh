#!/usr/bin/env bash
# Rebuild every landmark GLB from its spec, twice, and fail if the two builds differ (the builds
# must be deterministic: same spec, same Blender, same bytes), then run the landmark tests.
#   godot-chennai/tools/blender/landmarks/build_all.sh [ID ...]   (BLENDER / GODOT override the binaries)
# Needs Blender 5.2 LTS and Godot 4.7.2 (not in the repo). The kit scripts are the source of the models.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"   # godot-chennai/
BLENDER="${BLENDER:-blender}"
GODOT="${GODOT:-godot}"
cd "$ROOT"
build() {
  for kit in gopuram_complex colonial_clocktower station tower lighthouse mall hero_station hero_flyover; do
    [ -f "$HERE/$kit.py" ] || continue
    "$BLENDER" -b --factory-startup --python "$HERE/$kit.py" -- "$@" 2>&1 | grep -E '^(MODEL|KIT)|Error|Traceback' || true
  done
}
build "$@"
sha256sum assets/landmarks/*/*.glb > /tmp/landmarks-first.sha
build "$@" > /dev/null
if ! sha256sum -c --quiet /tmp/landmarks-first.sha; then
  echo "landmark builds are not deterministic" >&2
  exit 1
fi
echo "deterministic: second build identical ($(wc -l < /tmp/landmarks-first.sha) GLBs)"
rm -rf "$HERE/__pycache__"
GODOT="$GODOT" "$ROOT/run_tests.sh" --filter=landmarks 2>&1 | grep -E 'landmarks|TESTS|FAIL' || true
