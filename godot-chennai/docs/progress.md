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

## Player (phase 1, branch `agent/godot-player`, 23 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Kinematic player at the fixed step: walk 2.4 / run 6.2 m/s relative to the camera, jump 7.2 m/s, gravity 24, stays on the ground, walls stop it, kerbs (15 cm) and steps (30 cm) climbed, 60 cm ledges not (G-60) | Done on the test ground | `tests/scene/test_player.gd`: three camera headings, walk 0.8–3.2 m in 1 s, run > 2.5× walk, \|y\| < 8 cm; jump apex 0.9–1.25 m and landing; wall at x = 6 and a corner; kerb, step, ledge |
| Player model from a people manifest (default: the Three.js `player.glb` at 1.75 m) (G-63) | Done | `tests/unit/test_retarget.gd` (manifest paths); swapping to a Cast person is one call, not yet tried with a new-cast GLB |
| Mixamo idle/walk/run retargeted to the A-pose MPFB rig: limbs, whole hand frames, finger joints (G-61) | Done | `tests/unit/test_retarget.gd` (synthetic A-pose arm vs T-pose: arm, hand, knuckles, finger within 0.01 rad); `test_human_figure.gd`: every arm, hand, knuckle-line, finger and leg direction of the player's baked clips within 2° of the clip rig at 36 moments (measured 0.00°) |
| Soles planted per clip and every step, blends included; arms settled in (G-62) | Done | `test_human_figure.gd`, every foot vertex measured: idle 0.0 mm, walk −0.2…0 mm, run −0.3…0 mm, ten gait changes within 0.2 mm (limit 1 cm); wrists: idle ≤ 8.9° (limit 15°), walk ≤ 33.2° and run ≤ 41.9° vs the clips' own 33.2° and 40.1° (limit +3°); upper arms ≥ 3.8° out |
| Orbit/chase camera: drag to look, smooth follow, look-ahead with speed, walls clamp at once, poles and people ease (G-65) | Done | `test_player.gd`: 720 steps swinging round walls and a corner with the camera never inside a collider; walking past a pole: seen as thin, largest step-to-step distance change < 0.25 m; drag 286 → 1.4–1.75 rad; look-ahead 0.85 m at a run |
| Touch controls: floating stick left, look zone right, RUN and JUMP bottom-right; keyboard (G-66, G-67) | Done | `test_player.gd` (stick and drag through real touch events); `tests/scene/test_touch_layout.gd` at 915×412, 1830×824, 640×320 with the HUD: in bounds, ≥ 48 UI units and ≥ 48 px, 8 apart, no overlap, thumb zones |
| Vehicle and combat hooks (`enter_vehicle`/`exit_vehicle`, `knock`, signals) | Done (API only) | `test_player.gd` vehicle test (follows the seat, no collision, back on foot) |
| Screenshots (Compatibility, xvfb): idle, walk, run, by a wall, close-up, at 915×412 and 1830×824 | Done | made by `tests/tools/player_screenshot.gd` into a scratch folder (not committed, AGENTS.md) |
| Player in the game flow (main scene) | Not done | `PlayerRig` is ready for the composition root; wiring it into `main.gd` is left to the coordinator/World so the test ground and the streamed city are swapped in one place |

## World: the streamed city (phase 1, branch `agent/godot-world`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Streamed real map round the player: 250 m chunks, load 260 m / free 340 m, nearest first (G-50) | Done | `tests/scene/test_city_streaming.gd`: every chunk in reach shown; a 2 km drive at 40 m a frame and back never keeps a chunk past 340 m; no build left running, roots freed, node count back within 40 |
| Built off the main thread (decode, meshes, colliders, node trees), added a step at a time within 2.5 ms (G-50, G-51) | Done | `test_main_thread_budget_under_cpu_load`: with every free core busy, a frame spends at most the budget plus one step and no step reaches 16 ms (this box, quiet: max 3.3 ms a frame, 1.9 ms a step; worst build 160 ms on a worker) |
| Ground in one surface: earth, parks, water and sea, sand, verges and footpaths, roads, lane markings, yellow-black kerbs (G-52) | Done | `tests/unit/test_city_meshes.gd` (layers present at the start, markings painted, kerbs the highest layer, lane-line rules); screenshots |
| Buildings with the Chennai facade kit: window bays, chajjas, balconies, shop shutters and Tamil-first signboards (invented generic names), clay-tile roofs, water tanks, AC units, dishes; far look (G-52, G-53, G-57) | Done | hash parity with the Three.js game (values from node), deterministic builds (same arrays twice), facade plan (shops only on commercial or two-storey buildings facing roads), sign words on the generic list |
| Trees and palms (MultiMesh), poles, bus shelters at mapped stops, pavement props (Blender GLBs) | Done | spawn chunk has trees, palms, poles, kerbs; 300+ shelters placed; prop models fit their collider boxes |
| Landmarks: Anna Nagar Tower, Kapaleeshwarar gopuram with collision | Done | tower as tall as its estimated height, triangle budgets |
| Colliders: walls (trimesh pieces), trees, poles, shelters, props, ground, map edge, coast (G-55) | Done | `test_colliders_where_buildings_are`: rays at 1 m hit all 25 buildings tried |
| `world_ready_around` gating (G-54) | Done | a stand-in actor never steps with a chunk missing; a teleport target is not ready at once |
| Floating origin: chunk roots, landmarks, player in `WorldOrigin.GROUP`; streaming follows the player (G-59) | Done | Foundation's origin test; `test_boot` checks the player is the focus |
| Regional world (format 2) behind `WorldSource`, per-tile layouts; v1 kept with `--world=v1` (G-56) | Done | `tests/unit/test_regional_world_source.gd` against the Python reference (3 tiles: counts, buildings, roads), ring 0 against today's files, a chunk outside today's box builds |
| Player in the game: `PlayerRig` placed on the start road once its streets are in (G-59) | Done | `test_boot` |
| Budget at the densest views (Compatibility, all passes) | Met | spawn (Anna Nagar) 46 draw calls / 237k primitives; T. Nagar (Sir Thyagaraya Road) 39 / 157k; Anna Salai 30 / 104k; Marina 5 / 0.1k |
| Screenshots at 915×412 and 1830×824: spawn, T. Nagar, Marina, Anna Salai | Done | `tests/tools/city_shot.gd` into a scratch folder (not committed) |
| Day lighting | Minimal fallback only | a sun, sky, ambient colour and depth haze in `city_world.tscn` for the environment work to replace |
