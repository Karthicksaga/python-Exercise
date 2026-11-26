# Progress

What runs and how it was tested. "Emulator" and "phone" are different statements.

## Phase status (parity agent, 25 Nov 2026)

Phase list from `MIGRATION_PROMPT.md` section 5 (phases 0 to 7) and section 11 (phase 6b). Feature
detail and the Three.js comparison are in `docs/parity.md`. "Done on desktop" means headless tests
and Compatibility screenshots only. Nothing here has run on the owner's phone (POCO M6 Pro 5G,
Adreno 613).

| Phase | Status | Done | Not done | Evidence |
|---|---|---|---|---|
| 0 Foundation | Done | Skeleton, boot flow, world reader, test runner, CI with APK and emulator smoke | - | Table below; CI green on its branch (run 45185128445), not re-run here |
| 1 Walk around Chennai | Done on desktop | Streamed city, buildings, roads, player, camera, touch, day lighting, shadows | Phone check | `test_city_streaming.gd`, `test_player.gd`, `test_city_environment.gd` |
| 2 Vehicles and driving | Done on desktop | Five road kinds, premium and race models, boarding, crash ejection, seated poses, engine sound | Phone check; premium cars not in traffic | `test_vehicle_handling.gd`, `test_game_vehicles.gd`, `test_crash_ejection.gd` |
| 3 Traffic and pedestrians | Done on desktop | Road graph, signals, traffic, walkers, crowds, carjacking (TAKE OVER) | AI does not call `RoadHeights`; phone check | `test_ai_traffic.gd`, `test_city_life.gd` (incl. carjacking) |
| 4 Missions and jobs | Partial | 21 stages (data and runner), 13 city jobs, saving, job board, medals, stages 22 to 26 | Fight, chase and gun objectives in stages 7 to 15, 18 and 21 need combat and police in play; Mumbai Mail rider scene | `test_missions_layer.gd`, `test_missions_v2.gd`, `test_mission_systems.gd` |
| 5 Police, combat, weapons, gangs | Partial (logic only) | Rules ported and tested (`src/combat/`) | Not wired into `Main`: no punch or gun input, no gang crews, no police, no wanted stars | `tests/unit/rules/test_combat.gd`, `test_wanted.gd`, `test_police_fleet.gd` (rules only) |
| 6 Railway and the city | Partial | Beach to Tambaram and more, stations, trains, rail HUD, full map, weather, day and night, sound stand-ins | Train horn; recorded sounds; Hindi on station boards; train rider scene (stage 18) | `test_railway.gd`, `test_maps.gd`, `test_sound_system.gd` |
| 6b Airport, helicopter, aeroplane, far-city | Not started | Helicopter, airliner and light aircraft models; airport in the world data | Flight code; airport in play; far-city layer | `tests/unit/test_vehicle_models.gd` (models only) |
| 7 Visual upgrade and release quality | Partial | Performance presets, overlay, shader warm-up, OSM detail, shop signs, area atlas, parity checklist | Phone profiling; motion blur; HUD landmark labels; Overture fusion (not run, G-28) | `docs/performance.md`, `docs/parity.md` |

Counts and the missing list: `docs/parity.md` (217 feature rows: 144 done, 33 partial, 26 replaced,
8 missing, 6 unverified).

<!-- Phase statuses above are the parity agent's. Agent sections below stay as written. -->

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

## Cast (people)

**23–24 Nov 2026: the phase-1 board (20) and every figure of the phase-2 board, 70 people, built, rigged and tested.**
- [x] Blender pipeline: `tools/blender/characters.py` (from the Three.js version, extended),
  `cast_people.py` (the cast, one person per board figure), `cast_animation.py` (clips),
  `optimize_people.py`, `people_import.py`; `tools/build_people.sh` builds and imports everything.
- [x] 20 phase-1 people, 10 men and 10 women, one per figure of `phase1-20-characters.webp`.
- [x] Phase 2: the 20 plus 50 new people play all 74 figures of `phase2-60-characters.webp`
  (owner, 23 Nov: the four women cast for men's figures stay; the ten first left out built too).
- [x] One shared 52-bone skeleton; LOD0 ≤ 10k triangles, LOD1 ≤ 3.5k, 512 px textures; five
  looping clips idle, walk, run (Mixamo, retargeted per person), sit, talk (authored).
- [x] Review round: half sleeves and chest pockets as on the boards, plaids, chef's cap, saree
  pleats and a hanging pallu end, less hem swing, relaxed fingers, upright spine and level head,
  arms closer to the body, hands on the thighs when seated.
- [x] Manifest `assets/people/people.json` (board figure, roles, clothing, LODs, licence, child flag).
- [x] Tests `tests/people/test_people.gd` in Foundation's runner (`./run_tests.sh`): manifest,
  shared skeleton, budgets, loops, soles on the ground in every clip and through gait blends
  (with `sole_plant.gd`), wrists, fingers, no vertex colours.
- [x] Review renders (Compatibility renderer, xvfb) and board side-by-side sheets looked at.
- [x] 24 Nov: idle/walk/run are CC0 (Quaternius' Universal Animation Library) for all 70 people
  and for the player (`assets/animations/locomotion.glb` is our own clip rig now); no asset cites
  or moves like Mixamo (tested); soles, wrists, fingers and blends measured better than before
  (headless tests and Compatibility renders, not a phone); decisions G-100…G-105.
- [ ] Props (bags, helmet, baskets, stick, bicycle, cricket bat), the player model.
- [ ] The game's use of them (pedestrians, drivers, crowds) is phase 3.

## Tamil Nadu road vehicles (agent/godot-tn-vehicles, 23-24 Nov 2026)
- [x] Chennai auto-rickshaw redesigned (5.5k / 2.0k triangles, under the car budget; same wheels,
  hip points and handling as the Three.js auto), share auto (six seats), mini goods carrier.
- [x] Indian cars: small hatchback (redesign, same handling), compact sedan, Chennai taxi (plain
  roof board, yellow plates); six common Indian paints each.
- [x] Van ambulance redesigned (plain white with a red band, beacons, no emblem or name).
- [x] Buses with three LODs: city high-floor (cream and maroon family), low-floor, state-transport
  intercity (green and yellow), private mofussil (invented bright art), school bus (yellow, brown
  band); every seat, the conductor, grab rails, kerb points and destination boards as nodes.
- [x] Model checks extended (budgets per kind with legacy counts by name, exit points on the
  ground, livery and paint colour families): 3,226 checks on 34 models, all passing
  (`./run_tests.sh --filter=vehicle_models`).
- [x] Review screenshots (Compatibility renderer, 915×412 and 1830×824) and side-by-side
  comparisons with the references, not committed.
- [ ] Compared with photographs of current Chennai buses (Commons downloads were rate limited).
- [ ] Used in the game (Phase 2 vehicles, Phase 3 traffic); seen on a phone.

## Phase 2: Vehicles (23 Nov 2026, branch `agent/godot-vehicles`)
Details and measurements in `docs/driving.md`; decisions G-70…G-79.

| Item | State | How it was tested |
|---|---|---|
| Ray-cast vehicle body on Jolt (port of the Three.js/Rapier controller), CCD, locked roll/pitch (G-70) | Done | `tests/scene/test_vehicle_handling.gd`: speed curve, top speed, time to 50/90 %, braking, coasting, reverse of all five Three.js kinds within 10 % of the Three.js measurements (G-71); wheels on the ground and Three.js ride height |
| Drift on full lock at speed, grip back within 1 s; no drift when slow; two-wheelers never slide | Done | `test_vehicle_handling.gd` (hatchback and ambulance drift > 0.3, regrip < 1 s; every kind < 0.15 slow) |
| Hatchback with taxi, police (light bar, siren), gang variants; motorbike (lean, topple); auto-rickshaw; bus (folding door, aisle); ambulance (siren beacons, rear doors) | Done, legacy GLBs | Scene tests drive each; screenshots (Compatibility, xvfb) |
| Premium saloon, SUV, coupé and race car handling profiles on the Models agent's GLBs (G-72, G-73) | Done | `test_vehicle_handling.gd::test_premium_and_race_cars_are_faster` |
| Vehicles load through the per-vehicle manifests (`assets/vehicles/*.json`, `legacy/`): LODs, wheels, doors, collision, seat, entry, paint (G-73) | Done | `tests/unit/test_vehicle_catalog.gd` loads every manifest's GLB, finds its nodes, checks door leaves and the premium cars' own models |
| Gearbox P/R/D, shifting only when stopped, HUD gear D1…Dn (G-74) | Done | `tests/unit/test_gearbox.gd`, `tests/scene/test_driving.gd` (R reverses, P holds, D drives, R asked while moving brakes first) |
| Getting in and out: walk round the body to the door, door opens, sit, door shuts; out the same way, control back while the door closes; refused while moving; bus aisle; no door on the auto and bike; carjacking `pull` phase (G-77) | Done, with the real player (`PlayerRiderLink`); no seated pose yet | `tests/unit/test_boarding.gd`, `test_driving.gd` (standing 1–2 m right of the car, feet on the ground) |
| Crash ejection: bike/auto riders thrown, car drivers through the windscreen, damage by impact, no wall crossed, landing on the ground, bike topples (G-75) | Done | `tests/unit/test_crash_rules.gd` (every threshold: thrown above, not below), `tests/scene/test_crash_ejection.gd` (bike at 50 and 24 km/h, car at 78 and 50 km/h into a wall) |
| No tunnelling at top speed | Done | `test_crash_ejection.gd::test_no_tunnelling_at_top_speed`: race car at 223 km/h into a 30 cm wall |
| Driving camera: the Player's `FollowCamera.chase` (G-79) | Done | `test_driving.gd::test_chase_camera_settles_behind_and_never_jumps` |
| Touch driving controls: steering pad, GAS, BRAKE, P/R/D, HORN/SIREN, EXIT, GET IN, speed and gear (G-78) | Done | `tests/scene/test_driving_controls_layout.gd` at 4 UI sizes (inside, ≥ 48×48, 8 apart, thumb zones, multi-touch) |
| Seated pose on the figure, engine/horn sound, the vehicles in the streamed city | Not done (Player, Sound, World agents) | – |

## Sound and environment (agent/godot-ambient, 23-24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Sound design as data (TD-26 port + owner's kinds): 8 engine kinds (car, premium, race, auto, bike, thumper 350 cc, bus, ambulance), horns, rpm from the gear rule, placement, stride cadence, city level, wildlife, honking by hour, ambience levels by hour and place (G-80…G-84) | Done | `tests/unit/test_sound_profiles.gd` (ported `profiles.test.ts` + new kinds) |
| Sample-based engines: loops at rpm points, equal-power crossfades, pitch = rpm / loop rpm, start/stop, gear dip and clunk, lope; players only while heard (G-83) | Done | `tests/unit/test_engine_sound.gd`: the game's own loop files rendered through the same blend and measured: each kind idles on its designed note (±8 %), revs above 2× at 8 m/s, pitch tracks rpm (±6 %), no two kinds within 10 %, bus louder than car, no clicks in a full rev sweep or at loop wraps; `tests/scene/test_sound_system.gd` (gears 2-5 on the way up) |
| Recorded sounds (owner: real recordings): car engine (NSU Prinz 1200 C, CC BY 4.0, Work With Sounds) at 702/1608/2541/3516 rpm + start/stop; crickets, rain, three crows, four stone footsteps (OpenGameArt, CC0) (G-85) | Partly done: see the handoff for what is still synthesised | `tests/unit/test_sound_library.gd`: every audio file has a manifest row and a `LICENSES.md` row, licences CC0/PD/CC-BY only, recordings carry URL/author/original/edits |
| Stand-ins for everything else, rendered offline (G-81) | Done | Same tests; `tools/audio/render_standins.gd` |
| Sound API (`Sound` autoload): engine, horn, doors, crash, skid, sirens, footsteps, landing, traffic in 3D (nearest 3), honks in jams by hour, ambience beds by hour and place with birds, suspend, SOUND on/off saved (`cow-sound-v1`) | Done | `tests/scene/test_sound_system.gd` (cadence 10 s walk/run ±1.5 steps, nearest-three traffic, rush honks > 2× 3 am, beds per hour/place, koel at dawn / crows by day / none at night, mute saved and reloaded) |
| Player hooks: `PlayerSounds` (footsteps, wet in rain, landing strength, listener on the camera) | Done (not yet added by the composition root) | `tests/scene/test_player_sounds.gd` on Player's test ground |
| Mix: Vehicles/World/Ambience/UI buses at the TS levels, compressor + limiter -1 dBFS, ambience muffle in vehicles (G-84) | Done | `tests/unit/test_sound_mix.gd` (bus levels, effects, every bus named in code exists, beds against the idling hatchback from measured RMS) |
| Day/night: `Lighting` (port of `lighting.ts`), `CityEnvironment` (sun/moon, ambient, sky shader, ACES exposure, exponential haze hiding the streaming edge, shadows 40 m round the camera) on `GameLoop.clock` (G-86, G-89) | Done | `tests/unit/test_lighting.gd` (ported), `tests/scene/test_city_environment.gd`; screenshots golden hour, noon, night, rain at 915×412 and 1830×824 (Compatibility) |
| Weather: `Weather` autoload (rain fades in 2.5 game s, saved `cow-weather-v1`), rain streaks one draw call, wet look (`city_wetness` global uniform, `register_wet`) (G-87) | Done | `tests/scene/test_city_environment.gd`; measured draw calls in the test world 12 dry → 13 raining (Compatibility, `tests/tools/look_screenshot.gd`) |
| Sodium street lights: one MultiMesh of glowing heads, six nearest omni lights, no shadows (G-88) | Done (lamp positions come from the World agent) | `tests/scene/test_city_environment.gd` |
| Phase 6 sounds (G-370…G-379): trains (EMU horn, rumble, clatter by speed, brake squeal, door chime and doors, platform announcement), level-crossing bell and booms, the goods carrier's engine and horn, bus air brake, the market, tea stall and far temple bell by kind of street, credits on ABOUT. Which are real and which synthetic: `docs/sound-recordings.md` | Done as far as free recordings could be had; most are synthetic (flagged) | `tests/unit/test_sound_recordings.gd`, `test_rail_sounds.gd`, `test_sound_mix.gd`, `tests/scene/test_sound_system.gd`, `tools/audio/test_audio_files.py` |
| Helicopter and aeroplane sounds | Not done (later, with the vehicles) | |

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

| Integration (G-110…G-115): parked vehicles in the city, board / drive / exit with doors, crash ejection, day/night and weather in the game, pause menu with Back routing | Done on desktop (headless tests and Compatibility screenshots), not on a phone | `tests/scene/test_game_vehicles.gd`, `test_boot.gd` |

## Phase 3: traffic, walkers, crowds, carjacking (branch `agent/godot-traffic`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Road graph from the area round the player (drive and walk graphs, one-ways, lanes from OSM), rebuilt on a worker thread (G-120, G-121) | Done | `tests/unit/test_ai_traffic.gd` (shared junctions, one-ways, two lanes each way used, one-way uses its whole carriageway) |
| Road heights for decks and ramps carried by every agent (G-122) | Done, off until decks are drawn | `test_flyover_decks_and_ramps_have_heights`: deck at 6 m, ramp 1 in 20, a car over the deck at deck height |
| Signals at main and mapped junctions, groups taking turns, stop lines and zebras; heads drawn (G-123) | Done | traffic waits at red and goes again, nobody runs a red at speed, someone on the zebra stops traffic; heads seen in screenshots |
| Traffic: Tamil Nadu vehicles, rare premium cars, kinematic bodies, seated drivers (G-124) | Done | mix test (every look a buildable variant, premium ≤ 4 %); scene test: vehicles on roads and shown chunks, views where the agents are, a driver in the seat near the camera |
| Junctions taken in turn, brakes for the player and obstacles, pull over for sirens | Done (ported) | `test_vehicles_take_turns_through_a_junction`, `test_traffic_brakes_for_the_player…` |
| Walkers on pavements from the cast, stepping round each other and the player (G-129) | Done | head-on walkers never closer than 0.6 m and pass without stopping; a walker passes a standing player |
| Traffic stops for people crossing (G-129) | Done | `test_traffic_stops_for_someone_crossing_the_street` |
| Crowds by place and hour within the draw budget (TD-31, G-126) | Done | market vs lane, beach at sunset vs noon, station rushes, cap respected; population fills a market by day and empties at night; crowd spots carried over between areas |
| Children only beside an adult at stations or on the sand (G-125) | Done | real manifest: walkers, drivers and general crowds are adults; every child spot has an adult within 2 m, at a station or beach, off every carriageway |
| Gated on loaded chunks (brief §7) | Done | `test_the_ai_waits_for_the_ground` (city scene) and the unit gating test |
| Carjacking runtime (TD-30, G-128) | Done | scene test: stand in front of a car, it stops, Get in offers it, the driver is pulled out (crime signalled once), the player drives it in its paint, the agent respawns elsewhere; walking away undoes the swap |
| Frame cost measured (G-127) | Measured on the container, not on a phone | `tests/tools/traffic_shot.gd`; numbers in `handoff.md` |
| Seen on a phone | Not done | — |

## Infrastructure: decks, water, ground covers, road details (branch `agent/godot-infrastructure`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Format 2.1 `infra.bin`: road heights, waterway lines, crossings and speed breakers; 2.0 files byte for byte (G-150) | Done | `tools/geo/tests/test_infra.py` (solver cases: flyover over a road, grades and continuity, stacked deck, water bridge, tunnel, rail overbridge, footbridge stairs; spots; codec round trip; Kathipara stacked to 13 m, Anna flyover 6.5 m, Adyar/Cooum/Buckingham kept); `diff -r` of a rebuild against the committed world |
| Decks, ramps, parapets, piers, underside; footbridges; rail overbridges; covered roads (G-151) | Done (estimated heights) | `tests/unit/test_infra.gd` (reader vs Python, heights, stacked surfaces at Kathipara, seamless spans at chunk edges, deck colliders and piers, nothing at ground level on decks); `tests/scene/test_decks_driving.gd` (a car up, over and down the Anna flyover at 70 km/h); screenshots |
| `RoadHeights` (ground plus deck height for player, vehicles, traffic, pedestrians) (G-151) | Done; not yet called by the AI (traffic agent) | `test_infra.gd` |
| Rivers, canals, streams, ponds, lakes, reservoirs: sunk water, banks, bunds, shader; blocked at the bank (G-152) | Done | screenshots (Adyar at Kotturpuram Bridge, Chetpet lake); bunds and gaps counted in `test_infra.gd` |
| Ground covers: lawn, meadow, scrub, forest, wetland/mangrove, farmland, pitch, cemetery, bare; kerbed parks (G-154) | Done | screenshots; `test_city_meshes.gd` unchanged and passing |
| Zebras (mapped and at signal junctions), speed breakers with colliders, `RoadBumps`, medians (G-153) | Done | `test_infra.gd` (profile, crossing query on a mapped hump), screenshots |
| Lowered roads and underpasses below ground, Kathipara hero model | Not done (see the handoff) | |

## OSM detail (branch `agent/godot-osmdetail`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Format 2.2 `detail.bin`; 2.0 and 2.1 files byte for byte (G-190) | Done | `tools/geo/tests/test_detail.py` (tags to categories, colours, parts and hosts, objects, lines, zones, signs, codec round trip, committed world); `diff -r` of a rebuild |
| Building colour, material, roof kinds (flat, gabled, hipped, pyramidal, skillion, dome), parts, `min_height` (G-191) | Done; most of Chennai's buildings map none of it, so estimated | `tests/unit/test_osm_detail.gd`; screenshots |
| Signs by category, Tamil above English, one atlas, never a name (G-192) | Done (words only; no name plates) | table, font coverage and baked ink tests; screenshot of a shopping street (T. Nagar area) |
| Street objects, mapped lamps, bus-stop poles, barriers, tree rows, platforms, pitches, playgrounds, tracks, pools (G-193) | Done | `test_osm_detail.gd` (real chunks), screenshots (bus stop, station platform, football pitches, walls and fences) |
| Area palette loader and stub file (G-194) | Done; waiting for the godot-areas data | `test_osm_detail.gd` |
| Coverage report | Done: `world/DETAIL.md`, `docs/osm-detail.md` | generated with the world |
| Measured cost (G-195): no new draw calls, +0.6 to 1.0 % primitives, worst build +10 to 16 % | Done | `tests/tools/city_shot.gd` before and after |
| Name plates for public places; steps onto platforms; swimming; fence and wall textures | Not done | |


## Area atlas (branch `agent/godot-areas`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| `data/areas/areas.json`: 31 areas with character, storeys, roofs, wall palettes, materials, streets, trees, street life, signage; claims with sources or marked (G-200) | Done (estimates marked; Tamil needs native review; no photos viewed) | `tools/geo/tests/test_areas_data.py` (schema, claim rules, weights, Tamil only from OSM, no brands) |
| `landmarks_shortlist.json`: 100 landmarks, tiers A 18 / B 72 / C 10, incl. 16 generic malls (G-205), all found in the extract by name, Commons titles and licences (G-203) | Done | same tests; `test_area_lookup.py` for the lookup |
| `palettes.json` derived from areas.json for building detail (G-202) | Done | staleness test |
| Area boundaries and coverage table (G-201, G-204) | Done | `test_area_coverage.py`; world total equals `world/REPORT.md` |
| `docs/areas.md` atlas | Done (generated) | read through; numbers from `coverage.json` |
| Used by the building and landmark code | Not done (other agents) | |



## Controls redesign (G-170…G-179, branch `agent/godot-controls`, 24 Nov 2026)
Built from the owner-approved proposal `suggestions/2026-11-24-godot-controls-redesign.md` and its
interactive prototype (the Proposed on-foot layout and scheme A "wheel").
| Item | State | How it was tested |
|---|---|---|
| Pure logic: dead zone 0.12, run above 0.85 / walk under 0.70, toggle run, look sensitivity / invert-Y / glide, jump buffer 100 ms and coyote 80 ms, relative steering (full lock at 70 units), response curve, reverse on hold 0.4 s below 0.3 m/s (G-171…G-175) | Done | `tests/unit/test_control_logic.gd` (numbers, stepped in 1/60 s of game time) |
| On foot: floating stick (left), look drag (right), big ACTION button fed by `ActionContext`, small JUMP; RUN and the separate GET IN gone (G-176) | Done on desktop | `test_touch_foot.gd`, `test_touch_layout.gd`, `test_action_context.gd` |
| Driving, scheme A: slide-to-steer ring, GAS, BRAKE with "hold to reverse", HORN / SIREN, EXIT, readout only; steering slider and P/R/D removed (G-174, G-175) | Done on desktop | `test_driving_controls_layout.gd`, `test_reverse_on_hold.gd` (real hatchback: no reverse before 0.4 s, reverses, release stops, gas ends it, braking from speed never reverses) |
| Gamepad: stick move/steer/run/look, A, X, RT, LT (analogue, reverses), Y, B, Start; glyphs follow the last device; rumble on crashes (G-178) | Done on desktop with synthetic events; no real pad | `test_gamepad.gd` |
| Settings: left-handed (exact mirror), look speed, invert-Y, button size, opacity, vibration, run toggle; saved, versioned, live (G-170, G-177) | Done | `test_control_settings.gd`, `test_controls_layout.gd` (915x412 and 1830x824, every size and hand) |
| `ControlsGuide` rows for the title's CONTROLS page (G-179) | Done | `test_control_settings.gd` |
| Tilt (scheme B) and buttons (scheme C), combat buttons, kerb haptics | Not built (owner: later); the layout and settings are ready for them | — |
| Feel on a phone: thumb reach, steering curve, slide distance, glide, haptics strength | Not judged: needs the POCO M6 Pro 5G | — |

## Title screen from the landing-page design (G-160 to G-165, branch `agent/godot-title`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Fonts: Barlow Condensed Bold/ExtraBold and Noto Sans Tamil Bold, licence rows (G-160) | Done | `test_fonts_draw_tamil_and_latin` (every glyph of சென்னை present, a width), screenshot shows the Tamil name |
| Rows with subtitles, CONTINUE only with a save and the real stage/money/stages done, primary row amber bar and glow (G-161) | Done | `test_title_screen` (rows, first launch, buttons, D-pad order), `test_boot` (focus, CONTINUE iff a save) |
| 48-unit rows, nothing clipped or overlapping at four screen sizes, no scrolling at 915x412 (G-161) | Done | `test_ui_layout` (title with and without a save, ABOUT, SETTINGS, CONTROLS) |
| Rows slide in one by one, hover/focus nudge, reduced motion (G-161, G-165) | Done | `test_entrance_slides_rows_in_one_by_one`, `test_focus_nudges_the_row_when_motion_is_on`, `test_reduced_motion_has_no_slide_nudge_or_glow` |
| SETTINGS (Time, Weather, Sound as in the pause menu), CONTROLS (read-only, from one list) (G-162, G-163) | Done | `test_settings_page_holds_the_real_settings`, `test_controls_page_lists_the_guide` |
| Map credit with the extract date; chip with the real place, time and weather (G-164) | Done | `test_chip_and_credit`, `test_place_names_come_from_the_index`, `test_chip_follows_the_clock_and_the_weather` |
| Camera drift over a seeded spot of the live city, handing the city back on CONTINUE (G-164) | Done | `test_seed_picks_the_same_spot`, `test_camera_drift_is_slow_and_bounded`, `test_camera_drifts_over_the_player_and_holds_still_with_reduced_motion`, `test_tour_streams_the_spot_and_continue_hands_the_city_back` |
| Rain layers, lightning in a stormy title (G-165) | Done (rings, mist bands, thunder left out) | `test_rain_layers_one_draw_call_each_and_none_when_dry`, `test_lightning_only_in_a_storm_and_never_with_reduced_motion` |
| Seen on a phone | Not done | — |


## Landmarks: ranking, specs, Blender kits, placement (branch `agent/godot-landmarks`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Candidate ranking from the OSM PBF, coverage report (G-180) | Done: 2,341 candidates, 396 with Wikidata | `tools/geo/tests/test_landmarks.py` (fixture: kinds, exclusions, point-into-polygon merge, ranking, coverage, inside filter) |
| Spec per landmark, OSM part filled by `landmark-osm` (G-181) | Done for 6 | `LandmarkSpec.validate()` in `test_landmarks.gd`; pytest fill tests |
| Commons reference listing with rate limiting (G-182) | Done; few photos actually seen (host rate-limited) | pytest: 429 + Retry-After + cache, host rewrite, licence rule |
| Blender kits: gopuram complex, colonial clock tower, station, tower, lighthouse; deterministic GLBs (G-183, G-184) | Done (mall kit not built) | `build_all.sh` builds twice and compares bytes; `test_models_built_from_the_current_spec` |
| Kapaleeshwarar Temple, Ripon Building, Chennai Central, Chennai Egmore, Anna Nagar Tower, Chennai Lighthouse in the city (G-185) | Done (Compatibility screenshots, not on a phone) | `test_landmarks.gd`: outline within 2 m of OSM, height within 10 %, budgets, LODs, collision ray, placement and floating origin, worker loading, buildings left out, names |
| Old `LandmarkMeshes`/`LandmarkProfiles` retired | Done | tower ported to the `tower` kit; full suite |

## APK size diet (branch `agent/godot-sizediet`, G-240 to G-243)
| Item | State | How it was tested |
|---|---|---|
| Measured breakdown of the APK, per ABI and per build kind (`docs/app-size.md`) | Done, local export with the 4.7.2 Android templates | export, `unzip -lv`, `.import` mapping |
| Legacy cast, legacy vehicles, docs and v1 chunks out of the export (G-240) | Done: 162.68 to 115.00 MB (local release, arm64) | `test_export_size.gd` (5 tests; fails when `player.glb` is excluded) |
| Texture, audio and GLB size guards (G-241) | Done (nothing needed converting: already VRAM compressed and Ogg) | `test_asset_budget.gd` (3 tests) |
| `tools/apk_size_report.sh` and the CI budget step (G-243) | Done | run on local APKs; CI job summary |
| Forecast and the Play asset-pack plan | Written, not built | |

## Performance on phones (G-250 to G-259, branch `agent/godot-perf`, 24 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Quality presets Low/Medium/High, auto-detect from GPU, memory, screen; saved; live (G-250…G-252) | Done (desktop) | `test_quality_settings.gd` (table, auto-detect rows, saving), `test_perf_wiring.gd::test_presets_apply_live` |
| Performance overlay, verdict, perf log, pause-menu summary, three-finger tap (G-253) | Done (desktop) | `test_perf_wiring.gd::test_overlay_switches_and_log`, screenshots |
| Feature switches, safe mode, measured cost per press (G-254) | Done (desktop) | `test_overlay_switches_and_log` |
| Compatibility-renderer A/B APK (G-255) | In CI | workflow artifact `godot-chennai-apk-compat` |
| Traffic/figure/vehicle/street-light cost fixes (G-256…G-259) | Done; measured on llvmpipe | `docs/performance.md` before/after tables |
| Seen on the owner's phone | Not done | — |

## Trees (phase 7, G-380 to G-388, branch `agent/godot-trees`, 25 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Eighteen species (ten trees, five bushes and grass, three dead), three LODs each, own silhouettes (G-381) | Done | `test_trees.gd` (budgets per LOD, outlines differ), gallery screenshots |
| One VRAM-compressed atlas under 1.5 MB, painted by script, CC0 (G-380) | Done (0.7 MB with mips) | `test_atlas_size_and_licence` |
| Alpha-cut shader with vertex wind, off on Low (G-382) | Done (Compatibility); not on the Mobile renderer or a phone | `test_one_atlas_and_wind_data`, `test_perf_wiring` |
| Species by district, park, beach, avenue, mapped tree; clear of buildings, carriageways, water, decks, rails (G-383) | Done; species are estimates (no tag in the data) | `test_plants_stand_clear_and_deterministic`, `test_species_mix_by_area`, `test_prune_removes_plants_near_a_line` |
| MultiMesh per species per LOD per chunk, at most two draws a species (G-384, G-385) | Done | `test_chunk_budgets_and_lods`, `test_lod_rule` |
| Quality caps: density, LOD distances, no sway on Low, shadows from LOD 0 on High (G-386) | Done | `test_quality_caps`, `test_perf_wiring` |
| Before and after draws, primitives, main-thread ms, screenshots against the owner's photographs | Done on llvmpipe at 915x412 (`docs/trees.md`, handoff) | scratch harness (not committed) |
| Seen on a phone | Not done | — |

## Language: English and Tamil (G-440 to G-446, branch `agent/godot-lang`, 25 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| `Tr.t(key, args)` over CSV catalogs read into `Translation` objects on the `TranslationServer`; keys, `{0}` / `{name}` placeholders, counted texts, three display modes (G-440) | Done | `test_i18n.gd` (same keys in both files, no duplicates, placeholders match, modes, fallbacks, missing keys listed) |
| Language setting (English, தமிழ், both) in the pause menu and the title's SETTINGS, saved, live (G-441) | Done | `test_language_setting_saves_and_switches_live`, `test_pause_menu_and_title_follow_the_language` |
| UI, HUD, toasts, controls guide, map legend, railway HUD and texts, About, loading steps and tips, 21 stages, 13 jobs, 5 new missions, 3 stories as keys (G-440, G-442) | Done; developer-only text stays English (G-446) | static scan of every key in `src` (both languages, none unused), content scan (`ContentKeys`) |
| Tamil written for all of it; every row `needs native review`; `docs/tamil-review.md`; release flag; About says so (G-443) | Done; **no native speaker has read any of it** | `test_unreviewed_tamil_can_be_left_out_of_a_release`, `test_review_table_matches_the_catalog` |
| Noto Sans Tamil behind the UI font; no tofu (G-444) | Done | every Tamil string shaped at six sizes, no `.notdef` glyph |
| Layouts survive Tamil and Both at 915x412 and 1830x824 (G-445) | Done in the test; seen only in screenshots under software GL | `test_i18n_layout.gd` |
| Read by a native speaker; seen on a phone | Not done | — |

## Culture and life (G-480 to G-489, branch `agent/godot-culture`, 25 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Culture data: nine places, the temple zone, the temple visit's places, swimming rules, from landmark specs and `world.json` (G-480) | Done | `test_culture.gd` (positions and names equal the specs'; keys in both catalogs) |
| Peace zone as data; GET IN, horn, crash show, TAKE OVER, crime report keep its rules; walking pace; calm sound (G-481) | Done; **rule list is the owner's decision**; `violence` has no consumer until the combat runtime exists | `test_peace_zone.gd`, `test_culture_wiring.gd` |
| Heritage journal: screen from the pause menu, fills in as places are visited, saved in `chennai-heritage-v1`, NEW GAME clears it (G-482) | Done | `test_culture.gd`, `test_culture_wiring.gd`, `test_culture_layout.gd` |
| `SaveStore` keeps sections it did not set (settings, journal) when a mission save writes (G-482) | Done (fixes an existing loss of other sections) | `test_the_journal_has_its_own_section_and_the_mission_save_keeps_it` |
| Kapaleeshwarar visit: leave sandals, walk in, light the lamp, walk round the shrines, journal "visit completed"; props, bell, calm (G-483) | Done; no deity image or model, no scoring | `test_temple_visit_*` (logic and ACTION button), `test_the_temple_in_the_real_city` (real body through the gopuram), `test_a_ring_of_free_ground_goes_round_the_shrines` |
| Swimming: sea to a 30 m rope line, rivers and canals inside their banks, energy, tiring carries to shore, no drowning (G-484) | Done on desktop; no swim animation | `test_culture.gd` (limits, tiring, river), `test_swimming_*`, `test_swimming_at_the_marina_and_in_a_real_river` |
| All text in `cul.*` keys, English and Tamil; Tamil `needs native review` (G-486) | Done; unread machine Tamil | `test_i18n.gd`, `docs/tamil-review.md` |
| Layouts: journal, energy plate, pause row, ACTION labels in English, Tamil, both at 915x412 and 2460x1080 (G-487) | Done | `test_culture_layout.gd` |
| Bicycle, boat, swim clip (G-488) | Not done | — |
| Seen on a phone; read by a native Tamil speaker | Not done | — |
## Transit: bus stops, routes, riding, stations (G-210…G-219, branch `agent/godot-transit`, 24 Nov 2026)
Details and numbers: `docs/transit.md`, `world/TRANSIT.md`.
| Item | State | How it was tested |
|---|---|---|
| Stops, bus stations, railway stations with platforms and entrances, rail lines, bus routes from OSM; snapped to the drive graph; coverage report (G-210…G-213) | Done: 1,463 stops, 185 stations, 15 lines, 77 relations → 11 clean, 18 fallback, 22 broken, 26 unusable; first set 40 | `tools/geo/tests/test_transit.py` (snapping, one-ways, detours, ordering, inference, codec, committed data vs roads) |
| `TransitNetwork`, timetable, fares, `BusRide`, `TrainService` stub, `StationPlace`, `BusJobRoutes` | Done | `tests/unit/test_transit.gd` |
| Route buses in traffic: real routes, kerb, dwell with doors open, signs, density by place and hour, loaded ground only (G-214) | Done on desktop | `test_transit.gd`, `tests/scene/test_transit_ride.gd`, screenshots |
| AI heights from the roads' deck samples (traffic on flyovers) | Done | `test_transit.gd` (flyover heights) |
| Travel by bus: BOARD, ticket, interior, announcements, FAST TRAVEL, ALIGHT; not while wanted (G-215, G-216) | Done on desktop | `test_transit_ride.gd` (real game, game time) |
| Drive a bus on real stops (G-218) | Done (baked jobs moved; one real-route job) | `test_transit.gd` |
| Stations as places, train interface (G-217) | Done; trains not built (phase 6) | `test_transit.gd`, screenshot |
| Bicycles | Not built | — |
## Touch in menus, GET OUT, overlay default (G-490 to G-494, branch `agent/godot-fixui`, 25 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Taps in every scrolling menu at the phone's stretch (G-490) | Done (desktop, engine touch emulation) | `test_menu_touch.gd` (915x412, 2460x1080 stretched, 2460x1080 UI); fails 25 rows without the fix |
| Full map pans once per finger, minimap opens once, list under the map leaves its drags (G-492) | Done | `test_menu_touch.gd` map pan check |
| Performance overlay off in a release boot, no three-finger toggle there (G-491) | Done | `test_overlay_release.gd` |
| Overlay text wraps inside the screen (G-493) | Done | `test_overlay_release.gd` (30 long lines, real text, 915x412 and phone) |
| GET OUT pill while driving or riding, stop-then-exit while moving (G-494) | Done | `test_get_out.gd` (parked car, bike, taken-over bike, moving) |
| Seen on the owner's phone | Not done | — |

## Rail extras: rail on the maps, the Metro, trains past the old edge, the whole-city map (G-460…G-468, branch `agent/godot-rail2`, 25 Nov 2026)
| Item | State | How it was tested |
|---|---|---|
| Railway from the regional OSM extract (committed railway part, 258 KB) (G-460) | Done: 22 lines, 121 stations, 1,268 tracks (113 estimated second-track runs), 409 crossings | `tools/rail/test_build_rail.py` (23 tests incl. extract, route graph, keep-left, heights, the Three.js lines inside the old box) |
| Trains past the old edge: Beach - Tambaram, Chengalpattu, beyond Avadi (Arakkonam), beyond Gummidipoondi (Sullurpeta), return services (G-461) | Done on desktop | `test_rail_file.gd`, `test_railway.gd` (ride to Sevvapet Road, ride to Tambaram) |
| Chennai Metro Blue and Green, both ways: viaducts, tunnels, Metro trains, ₹20, no cab, rides end before tunnels (G-462, G-464) | Done on desktop; tunnels and underground stations not drawn | `test_rail_file.gd::test_metro_blue_and_green_lines`, `test_railway.gd::test_metro_ride_…` |
| Rail lines coloured per kind on the minimap and the full map, station dots and names, RAIL ON/OFF in the legend, Low preset cheap (G-463, G-465) | Done | `test_map_rail.gd`, `test_rail_maps.gd` |
| Full map covers the whole city and labels areas, roads, stations, hospitals, police, bus stands and stops, decluttered by zoom (G-466) | Done (owner's phone report) | `test_map_city.gd`, `test_maps.gd`, screenshots |
| Main-thread cost (G-467) | Measured headless here (see handoff); not on a phone | `tests/tools/rail_shots.gd --shot=measure` |
| Seen on a phone | Not done | — |
## Street imagery reference prototype (G-510 to G-513, branch `agent/godot-streetref`, 25 Nov 2026)
- Built and tested (39 pytest, mypy clean): Mapillary and KartaView discovery tool, SQLite store, chunk mapping,
  coverage report, source manifest and observation/facade validators, facade category data, comparison page
  (rendered with Chromium). Plan, licence analysis and extension guide in `docs/street-imagery.md`.
- NOT done: any real API call succeeded (egress blocked, no token), so no coverage numbers, observations or
  observed facade values exist; nothing is wired into the game.

