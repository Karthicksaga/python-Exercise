#!/usr/bin/env bash
# Runs the rules tests headless. Uses godot-chennai/project.godot when Foundation's project is
# there; otherwise copies src/ and tests/ into a throwaway project (nothing is written into the
# repo). Exit code: 0 all passed, 1 a failure.  Usage: tools/rules/run_tests.sh [--only=test_x]
set -euo pipefail
here="$(cd "$(dirname "$0")/../.." && pwd)"
godot_bin="${GODOT:-godot}"
if [[ -f "$here/project.godot" ]]; then
  proj="$here"
else
  proj="$(mktemp -d)"
  trap 'rm -rf "$proj"' EXIT
  printf 'config_version=5\n\n[application]\nconfig/name="rules-tests"\nconfig/features=PackedStringArray("4.7")\n' > "$proj/project.godot"
  cp -r "$here/src" "$here/tests" "$proj/"
fi
timeout 120 "$godot_bin" --headless --audio-driver Dummy --path "$proj" --import >/dev/null 2>&1 || true
log="$(mktemp)"
status=0
timeout 300 "$godot_bin" --headless --audio-driver Dummy --path "$proj" --script res://tests/rules/run_rules_tests.gd -- "$@" >"$log" 2>&1 || status=$?
cat "$log"
# Godot exits 0 after a runtime error inside a test that still returned: count those as failures.
if grep -qE "SCRIPT ERROR|Parse Error" "$log"; then echo "Rules tests: script errors in the log (see above)"; status=1; fi
rm -f "$log"
exit $status
