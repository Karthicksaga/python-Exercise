#!/usr/bin/env bash
# Rebuild every vehicle, aircraft and train model, then run the model checks.
#   godot-chennai/tools/blender/vehicles/build_all.sh            (BLENDER / GODOT override the binaries)
# Needs Blender 5.2 LTS and Godot 4.7.2 (not in the repo). The scripts are the source of the models.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"   # godot-chennai/
BLENDER="${BLENDER:-blender}"
GODOT="${GODOT:-godot}"
cd "$ROOT"
for script in cars aircraft trains; do
  "$BLENDER" -b --factory-startup --python "$HERE/$script.py" -- "$@" 2>&1 | grep -E '^(MODEL|MANIFEST)|Error|Traceback' || true
done
# Tamil Nadu road vehicles (autos, Indian cars, van ambulance, buses): run after cars.py, which they import.
for script in autos cars_in buses; do
  "$BLENDER" -b --factory-startup --python "$HERE/road/$script.py" -- "$@" 2>&1 | grep -E '^(MODEL|MANIFEST)|Error|Traceback' || true
done
python3 "$HERE/port_road_vehicles.py"   # manifests for the synced legacy vehicles (assets/vehicles/legacy/)
rm -rf "$HERE/__pycache__" "$HERE/road/__pycache__"
GODOT="$GODOT" "$ROOT/run_tests.sh" --filter=vehicle_models 2>&1 | grep -E 'vehicle_models|model checks|TESTS' 
