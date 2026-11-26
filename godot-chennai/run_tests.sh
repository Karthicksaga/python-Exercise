#!/usr/bin/env bash
# Runs the headless GDScript tests (decision G-8). Exits non-zero on any failure.
#   ./run_tests.sh                 # everything
#   ./run_tests.sh --filter=codec  # tests whose file::name contains "codec"
# GODOT may name the binary (default: godot on the PATH). Tests wait in game time; the
# timeout only stops a hung run.
set -euo pipefail
cd "$(dirname "$0")"
GODOT="${GODOT:-godot}"
mkdir -p tests/out
# Each run gets its own user:// folder. Tests write fixed save files there; several runs on one machine
# (agents, a local run beside CI-style runs) would otherwise delete each other's files and fail at random.
DATA_HOME="$(mktemp -d)"
trap 'rm -rf "$DATA_HOME"' EXIT
export XDG_DATA_HOME="$DATA_HOME"
# Import first: a fresh checkout has no .godot/, and new class_name scripts only join the
# global class cache through an import (a few seconds when nothing changed). SKIP_IMPORT=1 skips it.
if [ "${SKIP_IMPORT:-0}" != "1" ]; then
  timeout 900 "$GODOT" --headless --audio-driver Dummy --path . --import > tests/out/import.log 2>&1 || true
  [ -f .godot/global_script_class_cache.cfg ] || { cat tests/out/import.log >&2; echo "import failed" >&2; exit 1; }
fi
set +e
timeout "${TEST_TIMEOUT:-1200}" "$GODOT" --headless --audio-driver Dummy --path . --script res://tests/test_runner.gd -- "$@" 2>&1 | tee tests/out/test.log
status=${PIPESTATUS[0]}
set -e
# Script errors never change Godot's exit code; any in the log fails the run as well.
if grep -nE "SCRIPT ERROR" tests/out/test.log; then
  echo "run_tests.sh: SCRIPT ERROR lines in the log" >&2
  [ "$status" -eq 0 ] && status=1
fi
exit "$status"
