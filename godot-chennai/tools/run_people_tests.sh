#!/usr/bin/env bash
# Runs the people tests (tests/people/test_people.gd) headless, or the review renders
# (--lineup, Compatibility renderer under xvfb). Uses godot-chennai/project.godot when it
# exists; otherwise a throwaway project in a temp folder whose res:// links to this folder's
# assets/ and tests/ (nothing is imported or written into the repository).
#   tools/run_people_tests.sh                       # tests, exit code 0 = all passed
#   tools/run_people_tests.sh --lineup -- <args>    # see tests/people/people_lineup.gd
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
godot_bin="${GODOT:-godot}"
mode=test
if [[ "${1:-}" == "--lineup" ]]; then mode=lineup; shift; fi
if [[ "${1:-}" == "--" ]]; then shift; fi
if [[ -f "$here/project.godot" ]]; then
  project="$here"
else
  project="$(mktemp -d)"
  trap 'rm -rf "$project"' EXIT
  printf 'config_version=5\n\n[application]\nconfig/name="people-tests"\n' > "$project/project.godot"
  ln -s "$here/assets" "$project/assets"
  ln -s "$here/tests" "$project/tests"
fi
if [[ $mode == test ]]; then
  timeout 900 "$godot_bin" --headless --audio-driver Dummy --path "$project" --script res://tests/people/test_people.gd "$@"
else
  timeout 300 xvfb-run -a -s "-screen 0 1830x824x24" "$godot_bin" --rendering-method gl_compatibility --rendering-driver opengl3 \
    --audio-driver Dummy --path "$project" --script res://tests/people/people_lineup.gd -- "$@"
fi
