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


<!-- Data agent section. Other agents append their own sections. -->

## Data: world tools and format 2 (agent/godot-data, 23 Nov 2026)

Done:
- [x] `tools/geo/` (Python, typed, 43 pytest tests, `tools/geo/run_tests.sh`, no network).
- [x] Projection port, checked against `projection.ts` to 1 cm (G-21).
- [x] Format-1 port (`codec_v1.py`): today's 1,877 chunks and `roads.bin` re-encode byte for byte.
- [x] World boundary Chengalpattu–Pulicat from the OSM Tamil Nadu polygon, committed (G-22).
- [x] Pipeline: fetch (manifest with sha256 and OSM timestamp) → boundary → osmium clip → parse
      (multipolygons, aeroways, rural landuse/natural, coastline) → rings → tiles → format 2.
- [x] Format 2 designed, documented with byte layouts (`docs/world-format.md`) and built:
      `godot-chennai/world/`, all 4 rings, 37.5 MB, 190 files, 47 tiles (G-23 to G-26, G-29).
- [x] Coverage report: `world/REPORT.md` (whole world, by ring) and `world/reports/<tile>.md`.
- [x] Ring 0 reproduces today's world within 1–2 % (test); converter paths v1 → v2 and
      OSM → v1 (G-27).
- [x] Fusion step (Overture footprints + Open Buildings heights) designed and tested on
      fixtures; not run (hosts not allowed) (G-28).

Measured (OSM 2026-11-23T00:28:57Z, whole world):
- 391,283 buildings (908 multipolygon parts, 844 with courtyards); heights estimated 97.8 %,
  `building:levels` 2.2 %, `height` 103. Roof shape tagged on 45. Rings: 0 107,098, 1 268,840,
  2 13,998, 3 1,347 (OSM barely maps buildings outside the city: fusion is needed there).
- 151,851 road pieces (residential 114,784, service 20,258, primary 4,298, tertiary 4,379,
  secondary 2,254, footway 3,263, track 1,992, motorway 616, raceway 7 — the Irungattukottai
  circuit). Tags: lanes 2.3 %, width 0.1 %, surface 6.2 %, bridge 1.4 %, layer 1.7 %, tunnel 0.2 %,
  maxspeed 1.2 %, name 13.8 %.
- Airport (Meenambakkam) present: runways 07/25 and 12/30 with widths, 160 taxiway ways,
  15 aprons, 5 terminals, 104 gates, 36 hangars, 12 helipads, windsocks; Tambaram air station too.
- 7,804 areas (water 1,644, residential 1,331, park 1,290, saltpan 288 round Ennore and Pulicat,
  forest 334, farmland only 136); 417,486 trees (1,315 mapped).
- Geometry: 358 slivers dropped, 1 footprint repaired.

Not done / weak: see `handoff.md` "Data".


## Rules (agent/godot-rules, 23 Nov 2026)
- **Done:** typed GDScript ports of the missions package (stages runner, chase, fares, goods,
  city jobs, share auto, life, stories), the combat package (TD-27 combat with `hurt` from TD-29,
  weapons and arsenal, gangs, pedestrian hits and casualties, pickups), the wanted level with
  TD-28 heat before stars and the TD-30 carjacking crime, TD-28's police crew rules finished as
  `PoliceFleet`, the carjacking rules, the game clock and districts; the 21 stages, 13 city jobs,
  9 enemy groups, parking, gangs, crews and pickups as a baked JSON table; the save file.
- **Tests:** 251 cases (236 of 241 relevant TS cases ported, 15 new), all passing headless with
  Godot 4.7.2 (`./run_tests.sh --filter=unit/rules/`); the runner was checked to exit 1 on a broken
  assertion and on a test that dies, and the log is scanned for script errors.
- **Details:** `docs/rules.md`; decisions G-40 to G-49.

## Models (agent/godot-models)
- [x] Model kit by script (`tools/blender/vehicles/vkit.py`): shared palette atlas, paint and
  livery materials, LODs, anchors, manifests (G-30 to G-34).
- [x] Premium cars: luxury saloon, SUV, sports coupé (LOD0/LOD1, doors on hinges, steering
  node, seats, grips, cargo, 6 paints each).
- [x] Race car: original open-wheel car, 4 invented liveries.
- [x] Helicopter: main and tail rotor nodes, skids, hinged and sliding doors, 5 seats, cyclic
  and collective grips (LOD0/1/2).
- [x] Airliner: narrow-body twin, retract-pivot gear, ailerons, flaps, elevators, rudder, fans,
  forward door, invented airline colours (LOD0/1/2).
- [x] Light aircraft: high wing, propeller, control surfaces, steerable nose wheel, doors (LOD0/1/2).
- [x] Trains: ICF-style EMU (cab, motor, trailer), AC EMU variant, WAP-7-style locomotive,
  LHB-style coach, Vande-Bharat-style nose car and coach; bogies, wheelsets, sliding doors,
  pantographs, formations (LOD0/1/2).
- [x] Road vehicles ported from the Three.js game (hatchback, motorbike, auto-rickshaw, bus,
  ambulance) with manifests from `specs.ts` (G-36).
- [x] Model checks in the project runner (`tests/unit/test_vehicle_models.gd` →
  `tests/models/model_checks.gd`, typed), 1,648 checks on 22 models, all
  passing, including the embedded palette and livery texels (G-37).
- [x] Review round: train LOD0 rebuilt with real openings, rounded roofs, vents, gangways,
  cab fronts, the WAP-7 nose and roof gear, the VB nose; the SUV reshaped; texture checks added.
- [ ] Use in the game (Phase 2, 6, 6b): manifest loader, visibility ranges, wheel, door and
  pivot animation, train MultiMesh.
- [ ] Seen on a phone (nothing tried on a device yet).
