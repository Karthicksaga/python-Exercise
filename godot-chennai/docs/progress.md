# Progress

What runs and how it was tested. "Emulator" and "phone" are different statements.

## Phase 0: Foundation (23 Nov 2026, branch `agent/godot-foundation`)
| Item | State | How it was tested |
|---|---|---|
| Project skeleton: Godot 4.7.2, Mobile renderer (OpenGL fallback), sensor landscape, 915×412 base UI, touch from mouse, Jolt, 60 Hz / 5 steps per frame, typed GDScript as errors (G-1, G-2) | Done | `tests/scene/test_game_loop.gd` reads the settings; every script compiles under the strict warnings |
| Module folders as the Three.js packages, `src/app/` composition root (G-5) | Done (empty modules hold a `.gitkeep`) | Review |
| Boot flow: loading screen with three real steps (read the index, read the roads, prepare the test ground; each on a worker thread, a frame between steps), TRY AGAIN / CLOSE on failure, title menu (PLAY, ABOUT with OSM credit and extract date, QUIT), test ground (ground with collider, sun, haze, camera, scale objects), debug HUD (FPS, time of day, roads and chunks loaded, OSM credit), Back routing | Done | `tests/scene/test_boot.gd` (whole flow headless, failure and retry), screenshots at 915×412, 1830×824, 640×320 (Compatibility, xvfb) |
| UI layout: nothing off-screen or overlapping, buttons ≥ 48 tall, focus on every menu page, at 915×412, 915×458, 1098×412, 915×686 UI sizes | Done | `tests/scene/test_ui_layout.gd` |
| Data and asset sync from `chennai-open-world` with licence rows (G-3) | Done: 1,979 files | `tools/sync_from_threejs.py --check` (CI) |
| World reader: `WorldCodec`, `WorldIndex`, `WorldFiles`, `WorldSource`/`FileWorldSource`, format-version check (G-4, G-6) | Done | `tests/unit/test_world_codec.gd`, `test_world_index.gd`, `test_world_source.gd`: values from the TS decoder on the same files, every chunk decoded, hand-made and truncated files, other versions refused |
| Floating origin `WorldOrigin` (G-7) | Done (not yet used by moving things) | `tests/unit/test_world_source.gd::test_floating_origin` |
| Headless test runner (G-8) | Done: 21 tests, 432 assertions | `./run_tests.sh` locally and in CI; a broken assertion exits 1 |
| CI: import, tests, Android APK, emulator smoke (G-9) | Done: green (see `handoff.md` for the run) | GitHub Actions `Godot Chennai`: APK 77 MB (arm64, min SDK 24, target 36); emulator API 34 x86_64 reached `[boot] play` and kept running, on the Compatibility renderer (see G-9) |

## Phase 2: Vehicles (23 Nov 2026, branch `agent/godot-vehicles`)
Details and measurements in `docs/vehicles.md`; decisions G-70…G-79.

| Item | State | How it was tested |
|---|---|---|
| Ray-cast vehicle body on Jolt (port of the Three.js/Rapier controller), CCD, locked roll/pitch (G-70) | Done | `tests/scene/test_vehicle_handling.gd`: speed curve, top speed, time to 50/90 %, braking, coasting, reverse of all five Three.js kinds within 10 % of the Three.js measurements (G-71); wheels on the ground and Three.js ride height |
| Drift on full lock at speed, grip back within 1 s; no drift when slow; two-wheelers never slide | Done | `test_vehicle_handling.gd` (hatchback and ambulance drift > 0.3, regrip < 1 s; every kind < 0.15 slow) |
| Hatchback with taxi, police (light bar, siren), gang variants; motorbike (lean, topple); auto-rickshaw; bus (folding door, aisle); ambulance (siren beacons, rear doors) | Done, legacy GLBs | Scene tests drive each; screenshots (Compatibility, xvfb) |
| Premium saloon, SUV, coupé and race car handling profiles (G-72) | Done; **stand-in models** (stretched hatchback/ambulance) until the Models agent's GLBs | `test_vehicle_handling.gd::test_premium_and_race_cars_are_faster` |
| Per-model manifest (wheels, doors, paint, beacons, LOD1 at 28 m) (G-73) | Done | `tests/unit/test_vehicle_catalog.gd` loads every manifest's GLB and finds its nodes |
| Gearbox P/R/D, shifting only when stopped, HUD gear D1…Dn (G-74) | Done | `tests/unit/test_gearbox.gd`, `tests/scene/test_driving.gd` (R reverses, P holds, D drives, R asked while moving brakes first) |
| Getting in and out: walk round the body to the door, door opens, sit, door shuts; out the same way, control back while the door closes; refused while moving; bus aisle; no door on the auto and bike; carjacking `pull` phase (G-77) | Done (stand-in rider: a capsule) | `tests/unit/test_boarding.gd`, `test_driving.gd` (standing 1–2 m right of the car, feet on the ground) |
| Crash ejection: bike/auto riders thrown, car drivers through the windscreen, damage by impact, no wall crossed, landing on the ground, bike topples (G-75) | Done | `tests/unit/test_crash_rules.gd` (every threshold: thrown above, not below), `tests/scene/test_crash_ejection.gd` (bike at 50 and 24 km/h, car at 78 and 50 km/h into a wall) |
| No tunnelling at top speed | Done | `test_crash_ejection.gd::test_no_tunnelling_at_top_speed`: race car at 223 km/h into a 30 cm wall |
| Chase camera (eases in and out, behind the travel, look-ahead) (G-79) | Done | `test_driving.gd::test_chase_camera_settles_behind_and_never_jumps` |
| Touch driving controls: steering pad, GAS, BRAKE, P/R/D, HORN/SIREN, EXIT, GET IN, speed and gear (G-78) | Done | `tests/scene/test_driving_controls_layout.gd` at 4 UI sizes (inside, ≥ 48×48, 8 apart, thumb zones, multi-touch) |
| Seated poses on the real figure, engine/horn sound, the vehicles in the streamed city | Not done (Player, Sound, World agents) | – |
