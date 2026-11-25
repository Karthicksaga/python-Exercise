# Parity checklist: Three.js game to Godot

Written 25 Nov 2026 by the parity-checklist agent (branch `agent/godot-parity`, from
`origin/feat/godot-chennai` at `8569cd0`). Docs only; no game code changed.

## How to read this

- **Scope:** the Three.js game as it is in `chennai-open-world/` on this branch: `apps/game/src`,
  `apps/game/tests`, `packages/*`, `apps/mobile`, `scripts/`, `tools/blender/`, `docs/`. Features that
  exist only on other Three.js branches (for example `agent/loading-screen`, `agent/carjacking`,
  `agent/crash-ejection`) are marked as such in the note.
- **Godot status** uses six words:
  - `done`: the Godot code exists and a test or a documented check covers it (found by grep in
    `godot-chennai/src` and `godot-chennai/tests`). Not the same as "seen on a phone".
  - `partial`: some of the feature is in Godot, or the logic is in Godot but nothing calls it in play.
  - `missing`: no Godot code found by grep.
  - `replaced`: a different Godot approach covers the same job on purpose (for example Jolt for
    Rapier, Blender GLBs for procedural autos, Python build tools for the TypeScript pipeline).
  - `dropped on purpose`: no row uses this word, because no decision to drop a feature was found.
  - `unverified`: a fact I could not check by grep, or a mapping I could not confirm. No guess is made.
- **Phones:** nothing here is measured on a phone. The owner's POCO M6 Pro 5G (Adreno 613) has not
  tested any build recorded in the docs.
- **Granularity:** one row per feature, rule, stage, job, vehicle kind, place, sound group, control,
  setting and test file. Individual test cases are not counted: the Three.js side has about 522 unit
  test cases and 99 browser `test(` calls by static count (unverified exact numbers, the count
  regex misses some forms).

## 1. Flow, menus, controls and HUD

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Loading with real steps, failure and retry (`apps/game/src/main.ts`; branch spec `agent/loading-screen`, TD-25) | done | `src/ui/loading_screen/loading_screen.gd`, `src/app/main.gd` (STEPS), G-166 | Five real steps. Test: `test_loading_screen.gd`, `test_boot.gd` |
| Title menu over the live city, PLAY / ABOUT / QUIT (Three.js: native menu in `apps/mobile`) | replaced | `src/ui/title_menu/title_menu.gd`, G-160 to G-165 | Title lives inside the Godot game. Test: `test_title_screen.gd` |
| Pause menu with Back routing (`apps/game/src/Game.ts`, `nativeBridge.ts`) | done | `src/ui/pause_menu/pause_menu.gd`, `src/app/main.gd` (`go_back`) | Test: `test_boot.gd` |
| Android Back closes the open map or dialog (`apps/game/src/CityMapDesk.ts`, `nativeBridge.ts`) | done | `src/app/main.gd` (NOTIFICATION_WM_GO_BACK_REQUEST), `src/ui/minimap/full_map.gd` | Godot sends the notification itself, no WebView bridge |
| Native bridge messages `cityMap`, `back`, pause (`apps/game/src/nativeBridge.ts`) | replaced | `src/app/main.gd` | No WebView, so no JSON bridge |
| ABOUT page with OSM credit and extract date (`apps/mobile`, `packages/ui/src/CityMap.ts`) | done | `src/ui/title_menu/title_menu.gd` (ABOUT) | Test: `test_ui_layout.gd` |
| QUIT (`apps/game/src/Game.ts`) | done | `src/ui/title_menu/title_menu.gd`, `src/app/main.gd` | Test: `test_title_screen.gd` |
| Full-screen city map, pinch, drag, double-tap, centre on me (`packages/ui/src/CityMap.ts`, `cityMapMath.ts`) | done | `src/ui/minimap/full_map.gd`, `src/ui/minimap/map_projection.gd`, `src/app/missions_layer/missions_layer.gd` | Test: `tests/scene/test_maps.gd`, `tests/unit/test_map_projection.gd` |
| Minimap with heading and roads (`packages/ui/src/Minimap.ts`, `packages/game-engine/src/MapView.ts`) | done | `src/ui/minimap/minimap.gd`, `src/ui/minimap/map_roads.gd` | |
| Minimap place and objective glyphs (`packages/ui/src/placeIcons.ts`) | partial | `src/ui/minimap/map_glyphs.gd` (PLACE ring, MISSION diamond) | Glyph shapes exist. Three.js place icons (tagged badges) are not copied one for one |
| HUD: stage, money, reputation, timer, objective (`packages/ui/src/Hud.ts`) | done | `src/ui/mission_hud/mission_hud.gd`, `src/ui/mission_hud/meter_bar.gd` | |
| Player health bar that heals after six seconds unhurt (`apps/game/src/Game.ts`, `packages/combat/src/Combat.ts`) | missing | - | No health bar in `src/ui` (grep `health`: none). Combat is not wired into play |
| Wanted stars HUD (`packages/ui/src/WantedStars.ts`) | missing | - | No stars display in `src/ui` (grep `stars`: none) |
| Place screen for each place (`packages/ui/src/PlaceScreen.ts`, `apps/game/src/PlaceDesk.ts`) | done | `src/app/missions_layer/missions_layer.gd` (dialogs), `src/missions/life.gd` | Place dialogs are in the missions layer, not a separate scene |
| Landmark name labels (`packages/ui/src/LandmarkLabels.ts`) | partial | `src/game_engine/city/landmark_models.gd` (in-world `Label3D` signs) | Signs exist in the world. No on-screen label overlay like the Three.js one |
| Ride panel for vehicles and trains (`packages/ui/src/RidePanel.ts`) | replaced | `src/ui/rail_hud/rail_hud.gd`, `src/ui/driving_controls/driving_controls.gd` | Train HUD and driving controls replace it |
| Touch controls: stick, look, JUMP, HIT, FIRE, ENTER / EXIT (`packages/ui/src/TouchControls.ts`) | replaced | `src/ui/touch_controls/touch_controls.gd`, `action_context.gd`, G-66, G-67, G-176 | Redesign: one ACTION button, no RUN button, auto-run. Test: `test_touch_foot.gd`, `test_touch_layout.gd` |
| Driving controls: steering, gas, brake, horn, exit, gear readout (`packages/ui/src/TouchControls.ts`) | replaced | `src/ui/driving_controls/driving_controls.gd`, G-78, G-174, G-175 | Slide-to-steer ring. Three.js P/R/D selector removed; reverse by holding BRAKE |
| Settings: sound and weather toggles (`packages/audio/src/Sound.ts`, `apps/game/src/Game.ts`) | done | `src/app/main.gd` (pause settings), `src/audio/sound.gd`, `src/game_engine/environment/weather.gd` | Test: `test_settings_scroll.gd`, `test_sound_system.gd` |
| Mute switch (`packages/audio/src/Sound.ts`) | done | `src/audio/sound.gd` (`SOUND` toggle, saved) | Test: `tests/scene/test_sound_system.gd` |
| Pause menu runs the game clock and sound down (`apps/game/src/Game.ts`) | done | `src/app/main.gd` (pause, `Sound.suspend`) | |

## 2. Map data and the city's data files

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| OSM extract, fetch and rebuild scripts (`scripts/fetch-osm.mjs`, `scripts/build-world.ts`) | replaced | `tools/geo/` (Python), G-22 to G-29 | Pipeline now Python. Scope grew to Chengalpattu to Pulicat |
| Projection, TD-2 coordinates (`packages/map-data/src/projection.ts`) | replaced | `tools/geo/chennai_geo` (G-21), `tests/unit/test_map_projection.gd` | Same coordinates. Test values checked to 1 cm |
| OSM parsing (`packages/map-data/src/osm.ts`) | replaced | `tools/geo/` (43 pytest tests) | Python parser. Its tests: `tools/geo/run_tests.sh` |
| Chunk codec v1 decoder (`packages/game-world/src/codec.ts`) | done | `src/game_world/world_codec.gd`, G-4, G-6 | Tests: `test_world_codec.gd` |
| World index (`apps/game/public/world/index.json`) | done | `src/game_world/world_index.gd` | Test: `test_world_index.gd` |
| Road network from `roads.bin` (`packages/game-world/src/roadChunks.ts`) | done | `src/game_world/road.gd`, `src/game_world/road_network.gd` | |
| Districts (`packages/game-world/src/districts.ts`) | done | `src/game_world/district_index.gd` | Test: `tests/unit/rules/test_game_world.gd` |
| Visited areas memory (`apps/game/src/Game.ts`) | done | `src/game_world/visited_districts.gd` | |
| Game clock (`packages/game-world/src/clock.ts`) | done | `src/game_world/game_clock.gd` | Test: `test_game_clock.gd` |
| Coast (`packages/game-world/src/coast.ts`) | unverified | `src/game_world/world_sea.gd` (probable) | Name matches, but the coast edges were not compared |
| Solids: walls, trees, poles, shelters colliders (`packages/game-world/src/solids.ts`) | done | `src/game_engine/city/chunk_builder.gd`, G-55 | Test: `test_city_streaming.gd` (rays hit buildings) |
| Geometry helpers (`packages/game-world/src/geometry.ts`) | replaced | Godot `Geometry2D` and built-ins | |
| World types (`packages/game-world/src/types.ts`) | replaced | `src/game_world/building.gd`, `road.gd`, `place.gd`, `landmark.gd` | Typed GDScript classes |
| World files loader (`apps/game/src/WorldFiles.ts`) | done | `src/game_world/world_files.gd`, `src/game_world/file_world_source.gd` | |
| `buildWorldMap` (`packages/game-world/src/buildWorldMap.ts`) | replaced | `tools/geo/` and `world/REPORT.md` | |
| Tree/palm placement (`packages/game-world/src/props.ts`, MeshBuilder) | done | `src/game_world/world_tree.gd`, `src/game_engine/city/mesh_builder.gd` | Trees, palms and poles as MultiMesh |

## 3. City rendering and environment

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Streaming 250 m chunks, load and free radius (`packages/game-engine/src/ChunkManager.ts`) | done | `src/game_world/city/chunk_streamer.gd`, G-50 | Test: `test_city_streaming.gd` |
| Chunk view built and shown when complete (`packages/game-engine/src/ChunkView.ts`) | done | `src/game_engine/city/chunk_builder.gd`, G-50, G-51 | Built on workers, added in 2.5 ms steps |
| Ground, parks, water, sand, verges, footpaths (`packages/game-engine/src/GroundMeshes.ts`) | done | `src/game_engine/city/ground_meshes.gd`, `water_meshes.gd`, G-52 | |
| Road markings and yellow-black kerbs (`packages/game-engine/src/MeshBuilder.ts`) | done | `src/game_engine/city/mesh_builder.gd`, G-52 | Test: `test_city_meshes.gd` |
| Facade kit: bays, chajjas, balconies, shutters, roofs (`packages/game-engine/src/FacadeKit.ts`) | done | `src/game_engine/city/building_meshes.gd`, G-52, G-53, G-57 | Test: `test_city_meshes.gd` |
| Shop signs, Tamil first, never a real name (`packages/game-engine/src/shopSigns.ts`) | done | `src/game_engine/city/shop_signs.gd`, `sign_categories.gd`, G-192 | Test: `test_osm_detail.gd` |
| Textures and materials (`packages/game-engine/src/textures.ts`) | done | `src/game_engine/city/city_materials.gd` | |
| Texture atlas (`packages/game-engine/src/kitAtlas.ts`) | done | `src/game_engine/city/city_atlas.gd` | |
| Hash for seeded looks (`packages/game-engine/src/hash.ts`) | done | `src/game_engine/city/city_hash.gd` | Test: `test_city_meshes.gd` (hash parity) |
| Landmarks: Anna Nagar Tower, Kapaleeshwarar gopuram (`packages/game-engine/src/LandmarkView.ts`, `packages/game-world/src/landmarks.ts`) | done | `src/game_engine/city/landmark_models.gd`, `landmark_spec.gd`, G-180 to G-185 | Test: `test_landmarks.gd` |
| Street furniture: bus shelters, poles, bins (`packages/game-engine/src/StreetFurniture.ts`, `packages/game-world/src/furniture.ts`) | done | `src/game_world/city/street_furniture.gd` | Test: `test_city_meshes.gd` (partial coverage) |
| Street props (`packages/game-engine/src/StreetProps.ts`, `packages/game-world/src/props.ts`) | done | `src/game_world/city/street_props.gd`, `assets/props/*.glb` | |
| Sodium street lights (`packages/game-engine/src/SceneRenderer.ts`, `StreetProps.ts`) | done | `src/game_engine/environment/street_lights.gd`, G-88 | Test: `test_city_environment.gd` |
| Day and night lighting (`packages/game-engine/src/lighting.ts`) | done | `src/game_engine/environment/lighting.gd`, G-86 | Test: `test_lighting.gd` (ported) |
| Sky, haze, shadows near the player (`packages/game-engine/src/SceneRenderer.ts`) | done | `src/game_engine/environment/city_environment.gd`, `sky.gdshader`, G-89 | Test: `test_city_environment.gd` |
| Rain (`packages/game-engine/src/RainView.ts`) | done | `src/game_engine/environment/rain_view.gd`, `rain.gdshader`, G-87 | One draw call |
| Weather state, saved (`packages/game-engine/src/RainView.ts`, `apps/game/src/Game.ts`) | done | `src/game_engine/environment/weather.gd` | Saved as `cow-weather-v1` |
| Motion blur (`packages/game-engine/src/MotionBlur.ts`, `SceneRenderer.ts`) | missing | - | No motion blur in `src`. Not decided whether it should come back |
| Place markers in the world (`packages/game-engine/src/PlaceMarkers.ts`) | partial | `src/game_engine/beacon/mission_beacon.gd` | Mission beacon exists. Named place markers not checked |
| Mission beacon and objective marker (`packages/game-engine/src/Beacon.ts`) | done | `src/game_engine/beacon/mission_beacon.gd` | |
| Motion helpers (`packages/game-engine/src/Motion.ts`) | unverified | - | No obvious Godot counterpart; the helper's job was not identified |
| Game loop at a fixed step (`packages/game-engine/src/GameLoop.ts`) | done | `src/game_engine/game_loop.gd`, G-6 (60 Hz, 5 steps) | Test: `test_game_loop.gd` |
| Follow camera (`packages/game-engine/src/FollowCamera.ts`) | done | `src/player/follow_camera.gd`, G-65 | Test: `test_player.gd` (walls, poles, drag) |
| Frame cost at `?quality=lite`, measured (`docs/progress.md`, Three.js cost table) | done | `src/game_engine/quality/frame_timeline.gd`, G-340 | Godot measures frames itself; numbers in `docs/performance.md`, not on a phone |

## 4. Player and people

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Player controller: walk, run, jump, kerbs and steps (`packages/player/src/PlayerController.ts`) | done | `src/player/player_controller.gd`, G-60 | Test: `test_player.gd` |
| Rigged human figure, idle, walk, run (`packages/player/src/HumanFigure.ts`) | done | `src/player/human_figure.gd`, `locomotion_clips.gd`, G-62, G-63 | Test: `test_human_figure.gd` |
| Retargeting clips to the MakeHuman rig (`packages/player/src/retarget.ts`) | replaced | `src/player/retarget.gd`, G-61; CC0 clips from Quaternius (G-105) | Mixamo clips replaced by CC0 clips. Test: `test_retarget.gd` |
| Arm settle and natural hands (`packages/player/src/armSettle.ts`, `apps/game/src/Arms.ts`) | done | `src/player/human_figure.gd` (arm settle), G-62 | Test: `test_human_figure.gd` |
| Carrying pose: box in both hands (`packages/player/src/carryPose.ts`) | missing | - | No carry pose in `src/player`. Goods are handed over without a carry pose |
| Riding pose in vehicles and trains (`packages/player/src/ridingPose.ts`) | done | `src/player/poses/seat_pose.gd`, `src/app/ride_poses.gd`, G-260 to G-269 | Test: `test_poses.gd` |
| Strike pose for punch and bat (`packages/player/src/strikePose.ts`) | missing | - | No strike pose in Godot. Melee not wired |
| Weapon models in hand (`packages/player/src/weaponModels.ts`) | missing | - | No weapon models. Weapons logic only |
| LOD simplification of models (`packages/player/src/simplify.ts`) | unverified | `src/app/perf/feature_switches.gd` (probable) | Not checked which mesh step this replaces |
| People manifest, cast by role (`packages/player/src/people.ts`, `apps/game/src/peopleFiles.ts`) | done | `src/player/people_manifest.gd`, `src/player/people/people_pool.gd`, G-100 to G-105 | 70 people. Test: `tests/people/test_people.gd` |
| Pedestrian figures and crowd figures (`packages/player/src/CrowdFigures.ts`, `apps/game/src/Population.ts`) | done | `src/player/people/person_view.gd`, `src/ai/crowd_field.gd`, G-126 | |
| Player footsteps, landing, wet ground (`apps/game/src/Game.ts`) | done | `src/audio/player_sounds.gd` | Test: `test_player_sounds.gd` |
| Figures that fight and fall (`apps/game/src/Fighters.ts`) | partial | `src/player/poses/knockdown.gd`, `src/player/poses/knockdown_poses.gd`, G-275 | Falls and get-up exist (`test_knockdown.gd`). Fights are not in play |
| Hit puffs on a punch (`apps/game/src/HitPuffs.ts`) | missing | - | No hit puff effect in Godot |

## 5. Vehicles and physics

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Physics world, Rapier (`packages/physics/src/PhysicsWorld.ts`) | replaced | Jolt in Godot, `src/physics/physics_layers.gd`, G-70 | Jolt is the 3D default since 4.6 |
| Ray-cast vehicle body (`packages/physics/src/VehicleBody.ts`) | done | `src/physics/raycast_vehicle.gd`, G-70, G-71 | Test: `test_vehicle_handling.gd` (within 10 % of the Three.js numbers) |
| Vehicle class, drift, regrip (`packages/vehicles/src/Vehicle.ts`) | done | `src/vehicles/vehicle.gd`, G-70, G-71 | Test: `test_vehicle_handling.gd` |
| Vehicle specs: masses, seats, grips, cargo (`packages/vehicles/src/specs.ts`) | done | `src/vehicles/data/vehicle_types.json`, `src/vehicles/vehicle_manifest.gd`, G-73 | Test: `test_vehicle_catalog.gd` |
| Vehicle models loaded from GLB (`packages/vehicles/src/glbModels.ts`, `models.ts`) | done | `src/vehicles/vehicle_model.gd`, `src/vehicles/vehicle_catalog.gd`, G-36, G-73 | Test: `test_vehicle_models.gd` (3,226 checks, 34 models) |
| Procedural auto model (`packages/vehicles/src/autoModel.ts`) | replaced | Blender auto-rickshaw GLB, `tools/blender/vehicles/road/` (G-36) | Procedural model dropped in favour of Blender GLB |
| Test models (`packages/vehicles/src/testModels.ts`) | done | `tests/models/model_checks.gd` | Helper for model checks |
| Gearbox: P / R / D (`packages/vehicles/src/Gearbox.ts`) | done | `src/vehicles/gearbox.gd`, G-74 | Test: `test_gearbox.gd`. Driving UI shows gears as readout only (G-175) |
| Boarding: walk round, door, sit, shut (`packages/vehicles/src/Boarding.ts`) | done | `src/vehicles/boarding.gd`, `src/app/player_rider_link.gd`, G-77 | Test: `test_boarding.gd`, `test_boarding_safety.gd` |
| Doors, hinges, sliding and folding doors (`packages/vehicles/src/doors.test.ts` subject, bus door in `specs.ts`) | done | `src/vehicles/boarding.gd`, `src/vehicles/vehicle_model.gd`, G-77 | |
| Hatchback, taxi, police and gang variants (`packages/vehicles/src/specs.ts`, `apps/game/src/vehicleFiles.ts`) | done | `src/vehicles/data/vehicle_types.json`, `src/app/vehicle_yard/vehicle_yard.gd` | Paint variants from the TN set. Police light bar not checked in Godot |
| Motorbike: lean and topple (`packages/vehicles/src/specs.ts`) | done | `src/vehicles/vehicle.gd`, `src/vehicles/crash_flight.gd` | |
| Auto-rickshaw (`packages/vehicles/src/specs.ts`) | done | `src/vehicles/vehicle_manifest.gd`, `tools/blender/vehicles/road/` | Redesigned as a Blender GLB |
| Bus with folding door and aisle (`packages/vehicles/src/specs.ts`) | done | `src/vehicles/boarding.gd`, G-77 | Test: `test_boarding.gd` |
| Ambulance with siren and rear doors (`packages/vehicles/src/specs.ts`) | done | `src/vehicles/vehicle_model.gd`, G-73 | |
| Traffic car (`packages/vehicles/src/TrafficCar.ts`) | done | `src/vehicles/traffic/traffic_vehicle_view.gd`, G-124 | |
| Crash: velocity change above a threshold (`apps/game/src/Game.ts`, `packages/vehicles`) | done | `src/vehicles/crash_rules.gd`, G-75, G-270 | Crash bands by severity, shake, effects |
| Crash ejection: riders thrown, drivers through the windscreen (branch `agent/crash-ejection`, TD-29, WIP) | done | `src/vehicles/crash_flight.gd`, `src/vehicles/crash_effects/crash_effects.gd`, G-75, G-271 | Three.js spec was unfinished WIP; Godot finished it |
| Carjacking: stop a car, pull out the driver, take it (branch `agent/carjacking`, TD-30) | partial | `src/app/city_life/carjacking.gd`, `src/ai/carjack.gd`, G-300 | Not on this branch. Godot: TAKE OVER works; no heat until a Wanted runs (see section 8) |
| Vehicle engine and horn sound per kind (`packages/audio/src/Sound.ts`) | done | `src/audio/engine_voice.gd`, `src/audio/sound_profiles.gd`, G-80 to G-83 | See section 10 |

## 6. Traffic, walkers and crowds (AI)

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Road graph for drive and walk (`packages/ai/src/RoadGraph.ts`) | done | `src/ai/road_graph.gd`, G-120, G-121 | Test: `test_ai_traffic.gd` |
| Agents: cars and walkers on the graph (`packages/ai/src/Agents.ts`) | done | `src/ai/agent_system.gd`, G-124 | Test: `test_ai_traffic.gd` |
| Agent presets (`packages/ai/src/presets.ts`) | done | `src/ai/agent_presets.gd` | |
| Density by place and hour (`packages/ai/src/Density.ts`, TD-31) | done | `src/ai/density.gd`, `src/ai/crowd_field.gd`, G-126 | Test: `test_ai_population.gd` |
| Signals at junctions, stop lines, zebras (`packages/ai/src/Signals.ts`, `SignalView.ts`) | done | `src/ai/traffic_signals.gd`, `src/vehicles/traffic/signal_heads.gd`, G-123 | Test: `test_ai_traffic.gd` |
| Junction turns, brakes for the player, pulling over for sirens (`packages/ai/src/Agents.ts`) | done | `src/ai/agent_system.gd` | Test: `test_ai_traffic.gd`, `test_traffic_view_teleport.gd` |
| Traffic stops for people crossing (`docs/progress.md`, traffic section) | done | `src/ai/agent_system.gd`, G-129 | Test: `test_ai_traffic.gd` |
| Reactions: walkers and riders hit by a car (`packages/ai/src/Reactions.ts`) | done | `src/app/city_life/street_reactions.gd`, `src/ai/street_hits.gd`, G-362, G-363 | Test: `test_street_reactions.gd`, `test_street_hits.gd` |
| Pursuit: police chase rules (`packages/ai/src/Pursuit.ts`) | partial | `src/combat/police_fleet.gd`, `src/missions/chase.gd` | Rules done. Not wired into play; no police cars drive after the player |
| Walkers on pavements, stepping round people (`apps/game/src/Population.ts`, `packages/ai`) | done | `src/ai/ai_population.gd`, G-129 | Test: `test_ai_population.gd` |
| Cast picker: adults drive, children only beside an adult at stations or the beach (`apps/game/src/peopleFiles.ts`) | done | `src/ai/cast_picker.gd`, G-125 | Test: `test_ai_population.gd` |
| Gated on loaded chunks (`packages/ai/src/Agents.ts`) | done | `src/ai/ai_area.gd` (`world_ready_around`), G-54 | Test: `test_city_streaming.gd` |
| Places for walkers and drivers (`apps/game/src/places.ts`) | done | `src/ai/places.gd` | |

## 7. Missions, jobs, stages and life

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Mission runner: stages, objectives, results (`packages/missions/src/MissionRunner.ts`) | done | `src/missions/mission_runner.gd`, `src/missions/mission_session.gd`, G-130 | Test: `test_mission_runner.gd` |
| Stage 1 Morning walk (`apps/game/src/content.ts`) | done | `src/missions/content/content.json` (stage 1), `missions_layer.gd` | Reach objective |
| Stage 2 Borrowed wheels (`content.ts`) | done | `content.json` (stage 2) | |
| Stage 3 Auto shift, timed fare (`content.ts`) | done | `content.json` (stage 3), `src/missions/fare_stop.gd`, G-130 | Test: `test_fares.gd` |
| Stage 4 Parcel run, goods on the back seat (`content.ts`) | done | `content.json` (stage 4), `src/missions/goods_stop.gd` | Test: `test_goods.gd` |
| Stage 5 Cross-town dash (`content.ts`) | done | `content.json` (stage 5) | |
| Stage 6 Two-wheel courier (`content.ts`) | done | `content.json` (stage 6) | |
| Stage 7 Park trouble: beat three thugs (`content.ts`) | partial | `content.json` (stage 7, defeat) | Defeat objective: nothing in `src/app` sends a defeat event (grep) |
| Stage 8 Bike thieves: take down the thieves (`content.ts`) | partial | `content.json` (stage 8, defeat) | Same reason as stage 7 |
| Stage 9 Godown raid: clear the guards (`content.ts`) | partial | `content.json` (stage 9, defeat) | Same reason as stage 7 |
| Stage 10 Roundtana showdown: defeat the boss (`content.ts`) | partial | `content.json` (stage 10, defeat) | Same reason as stage 7 |
| Stage 11 Courier chase (`apps/game/src/streetWar.ts`) | partial | `content.json` (stage 11, chase), `src/missions/chase.gd` | Chase rules exist; the pursuer in play is not wired |
| Stage 12 Protection money: tea shop, fight (`streetWar.ts`) | partial | `content.json` (stage 12, tea-shop) | Gang fight needs combat and gangs in play |
| Stage 13 Hot wheels: drive-by with a gun (`streetWar.ts`) | partial | `content.json` (stage 13, drive-by) | Needs weapons in play |
| Stage 14 Snake pit: hideout fight (`streetWar.ts`) | partial | `content.json` (stage 14, snake-pit) | Needs combat in play |
| Stage 15 Turf war: the clock tower fight (`streetWar.ts`) | partial | `content.json` (stage 15, turf-war) | Needs gangs and weapons in play |
| Stage 16 Muhurtham, the wedding party (`laterStages.ts`) | done | `content.json` (Godot stage 17, wedding-party) | Order changed on purpose: TD in `technical-decisions.md` (stages 16 to 21 reordered). Three.js 16 is Godot 17 |
| Stage 17 Hot property, planted chain (`laterStages.ts`) | done | `content.json` (Godot stage 18, planted-chain) | Order changed (see stage 16) |
| Stage 18 The Mumbai Mail, train stage (`laterStages.ts`) | partial | `content.json` (Godot stage 19, mumbai-mail) | Rules exist; no train rider scene (`docs/mission-design.md` W8) |
| Stage 19 The harmonium thief (`laterStages.ts`) | done | `content.json` (Godot stage 21, harmonium-thief) | Order changed (see stage 16) |
| Stage 20 Biryani for the dressing room (`laterStages.ts`) | done | `content.json` (Godot stage 16, stadium-biryani) | Order changed (see stage 16) |
| Stage 21 Beach road brawl, fists and bats (`laterStages.ts`) | partial | `content.json` (Godot stage 20, beach-road-brawl) | Brawl enemies need combat in play |
| City job: ambulance run (`apps/game/src/content.ts`) | done | `content.json` (jobs), `src/missions/job_runner.gd` | Test: `test_jobs.gd`, `test_missions_jobs.gd` |
| City job: courier delivery (`content.ts`) | done | `content.json` (jobs), `src/missions/job_runner.gd` | |
| City job: cab ride (`content.ts`) | done | `content.json` (jobs) | |
| City job: bus route (`content.ts`) | done | `content.json` (jobs) | |
| City job: hospital transfer (`content.ts`) | done | `content.json` (jobs) | |
| City job: lunch rush, food delivery (`content.ts`) | done | `content.json` (jobs) | |
| City job: medicine run (`content.ts`) | done | `content.json` (jobs) | |
| City job: Tower Park visitor (`content.ts`) | done | `content.json` (jobs) | |
| City job: evening bus, the other way (`content.ts`) | done | `content.json` (jobs) | |
| City job: Marina evening drive (`apps/game/src/cityJobs.ts`) | done | `content.json` (jobs) | |
| City job: Egmore hospital transfer (`cityJobs.ts`) | done | `content.json` (jobs) | |
| City job: Mount Road bus (`cityJobs.ts`) | done | `content.json` (jobs) | |
| Share auto: passengers, fares, route (`packages/missions/src/shareAuto.ts`, `apps/game/src/shareAutoRoute.ts`) | done | `src/missions/share_shift.gd`, `src/app/missions_layer/fare_spots.gd` | Test: `test_share_auto.gd` |
| Share riders on the auto (`apps/game/src/ShareRiders.ts`) | partial | `src/app/missions_layer/fare_figures.gd` | Figures drawn for fares; share-auto riders not checked separately |
| Fares: passengers board and alight (`packages/missions/src/fares.ts`) | done | `src/missions/fare_stop.gd`, G-130 | Test: `test_fares.gd` |
| Fare spots beside the carriageway (`apps/game/src/fareSpots.ts`) | done | `src/app/missions_layer/fare_spots.gd` | Test: `test_content_on_map.gd` |
| Fare figures on the pavement (`apps/game/src/FareFigures.ts`) | done | `src/app/missions_layer/fare_figures.gd` | Test: `test_fare_figures.gd` |
| Goods: handover, cargo aboard (`packages/missions/src/goods.ts`) | done | `src/missions/goods_stop.gd` | Test: `test_goods.gd` |
| Goods figures and models (`apps/game/src/GoodsFigures.ts`, `goodsModels.ts`) | partial | `src/app/missions_layer/missions_layer.gd` | Goods scene call present. Models not checked one by one |
| Ambulance stretcher, patient lying on a wheeled stretcher (`apps/game/src/StretcherFigures.ts`) | done | `src/app/missions_layer/fare_figures.gd` (`_make_stretcher`) | Test: `test_missions_jobs.gd` |
| Chase rules (`packages/missions/src/chase.ts`) | done | `src/missions/chase.gd` | Logic only; see stage 11 |
| Life: everyday places and activities (`packages/missions/src/life.ts`) | done | `src/missions/life.gd` | Test: `test_life.gd` |
| Places: paati's check-up, gym bet, first show (`apps/game/src/places.ts`, `packages/missions/src/stories.ts`) | done | `src/missions/content/content.json` (stories), `src/missions/story_runner.gd` | Stories run through `MissionSession` |
| Reputation (`packages/missions/src/reputation.test.ts` subject) | done | `src/missions/job_runner.gd`, `src/missions/save_store.gd` | Test: `test_mission_session.gd`, `test_save_store.gd` |
| Save and progress (`apps/game/src/Game.ts`, localStorage) | done | `src/missions/save_store.gd` | Saved as a versioned section; migration to v2 (G-140s) |
| Job board: JOBS and STAGES tabs (`apps/game/src/JobDesk.ts`) | done | `src/app/missions_layer/missions_layer.gd`, `src/ui/mission_hud/` | Test: `test_missions_layer.gd` |
| Place dialogs (`apps/game/src/PlaceDesk.ts`) | done | `src/app/missions_layer/missions_layer.gd` | Test: `test_missions_layer.gd` |
| Mission markers and needles (`apps/game/src/Game.ts`) | done | `src/missions/marker_kind.gd` | |

## 8. Combat, police and gangs

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Combat rules: health, damage, enemies (`packages/combat/src/Combat.ts`) | partial | `src/combat/combat.gd`, `src/combat/combat_world.gd` | Rules done and tested. No combat runtime is wired into `Main` (grep: no caller) |
| Punch combo and bat swing with wind-up and blow (`packages/combat/src/Strikes.ts`, TD-25) | partial | `src/combat/melee.gd`, `tests/unit/rules/test_melee.gd` | Logic only. No punch or bat input in `src/ui` or `src/app` |
| Weapons: pistol, shotgun, SMG, rounds (`packages/combat/src/Weapons.ts`) | partial | `src/combat/weapons.gd`, `src/combat/arsenal.gd` | Logic only. Nothing fires |
| Weapons lying in the world, pick up (`packages/combat/src/Pickups.ts`) | partial | `src/combat/weapon_pickups.gd` | Logic only |
| Gangs, crews, turf (`packages/combat/src/Gangs.ts`, `apps/game/src/streetWar.ts`) | partial | `src/combat/gangs.gd`, `src/missions/content/content.json` (gangs, crews) | Data and logic exist. No gang crews spawned in play |
| Pedestrians hit in a fight (`packages/combat/src/PedestrianHits.ts`) | partial | `src/combat/pedestrian_hits.gd` | Logic only. Vehicle hits on people are done (section 6) |
| Wanted level: heat and stars (`packages/combat/src/Wanted.ts`, TD-28) | partial | `src/combat/wanted.gd`, `src/app/city_life/street_reactions.gd` | Logic done. No Wanted instance is created in `Main`; carjacking and street reactions call it only when present |
| Police response: units and pursuit (`packages/combat/src/Police.ts`, `apps/game/src/Police.ts`) | partial | `src/combat/police_fleet.gd`, `src/combat/wanted.gd` | Crew rules done. Not in play |
| Killed officers stay dead, new units from out of sight (TD-28, `agent/police-tuning`) | partial | `src/combat/police_fleet.gd` | Rules in `tests/unit/rules/test_police_fleet.gd` |
| Combat animation: arms and fists in a fight (`apps/game/src/Arms.ts`, `Fighters.ts`) | partial | `src/player/human_figure.gd` | Arm and hand poses exist; no fight poses |
| Combat and gang browser tests (`apps/game/tests/combat.spec.ts`, `gangs.spec.ts`, `weapons.spec.ts`, `police.spec.ts`) | missing | - | No Godot scene test for these in play. Logic tests only |

## 9. Railway

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Rail path (`packages/rail/src/path.ts`) | done | `src/rail/rail_path.gd`, G-320 | Test: `test_rail.gd` |
| Rail motion and run profile (`packages/rail/src/motion.ts`) | done | `src/rail/run_profile.gd`, `src/rail/rail_line.gd` | Test: `test_rail.gd` |
| Rail network, Beach to Tambaram and more (`packages/rail/src/network.ts`) | done | `src/rail/rail_network.gd`, `world/rail/rail.json` | Godot network adds MRTS and more services (G-320 to G-334) |
| Rail build from OSM (`packages/rail/src/build.ts`, `scripts/build-rail.ts`) | replaced | `tools/rail/build_rail.py`, `tools/rail/test_build_rail.py` | Python port; value-for-value check |
| Doors (`packages/rail/src/doors.ts`) | done | `src/rail/rail_rules.gd`, `src/game_engine/rail/trains_view.gd` | Test: `test_rail.gd`, `test_railway.gd` |
| Station layout and platforms (`packages/rail/src/station.ts`) | done | `src/rail/station_layout.gd` | Test: `test_rail_station.gd` |
| Station crowds (`packages/rail/src/crowd.ts`) | done | `src/rail/station_crowd.gd` | Test: `test_railway.gd` |
| Rail timetable rules (`packages/rail/src/types.ts`, `rail.test.ts` subject) | done | `src/rail/rail_rules.gd`, `src/rail/rail_path.gd` | Test: `test_rail.gd` |
| Station kit: decks, sheds, boards, stalls (`packages/game-engine/src/StationKit.ts`) | done | `src/game_engine/rail/station_view.gd`, G-334 | Test: `test_rail_hud_layout.gd` (HUD) |
| Station boards in Tamil, Hindi and English (`StationKit.ts`) | partial | `src/game_engine/rail/station_view.gd` | Tamil over English only. No Hindi font or board text found (grep: none) |
| Station clock and LED departure board (`packages/game-engine/src/StationLife.ts`) | partial | `src/game_engine/rail/station_view.gd` | Departure text exists; LED clock behaviour not compared |
| Rail track view (`packages/game-engine/src/RailView.ts`) | done | `src/game_engine/rail/rail_tracks_view.gd` | |
| Trains view (`packages/game-engine/src/TrainView.ts`) | done | `src/game_engine/rail/trains_view.gd`, `train_models.gd` | MultiMesh per car type (G-320s) |
| Riding and driving trains (`apps/game/src/Railway.ts`) | done | `src/app/railway/railway.gd`, `src/app/railway/railway_wiring.gd` | Test: `test_railway.gd` |
| Railway HUD: timetable, route map, speed (`apps/game/src/Railway.ts`, `packages/ui/src/RidePanel.ts`) | done | `src/ui/rail_hud/rail_hud.gd`, `route_map.gd` | Test: `test_rail_hud_layout.gd` |
| Railway browser spec (`apps/game/tests/railway.spec.ts`) | done | `tests/scene/test_railway.gd`, `test_rail_hud_layout.gd` | Ported |
| Stations browser spec (`apps/game/tests/stations.spec.ts`) | done | `tests/scene/test_railway.gd` (stations) | |
| Rail unit tests (`packages/rail/src/doors.test.ts`, `station.test.ts`, `rail.test.ts`, `apps/game/src/rail.test.ts`) | done | `tests/unit/test_rail.gd`, `test_rail_station.gd`, `test_rail_file.gd`, `test_rail_cab.gd` | Ported |

## 10. Sound

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Sound API: engine, horn, doors, crash, skid, sirens, footsteps (`packages/audio/src/Sound.ts`) | done | `src/audio/sound.gd`, G-80, G-81 | Test: `test_sound_system.gd` |
| Sound design per vehicle kind (TD-26 in Three.js) | done | `src/audio/sound_profiles.gd`, G-80 | Test: `test_sound_profiles.gd` (ported) |
| Engine voices: loops at rpm points, crossfades, pitch (`Sound.ts`) | done | `src/audio/engine_voice.gd`, `src/audio/engine_blend.gd`, G-83 | Test: `test_engine_sound.gd` |
| Recorded sounds replacing synthesis (owner, 23 Nov; Three.js is all synthesised) | partial | `assets/audio/`, G-85, `tools/audio/import_recordings.py` | Only the car engine is a real recording. Others are CC0 stand-ins (`LICENSES.md`) |
| City ambience by hour and place (`Sound.ts`) | done | `src/audio/ambience.gd`, G-84 | Test: `test_sound_system.gd` |
| Traffic 3D sounds, nearest three (`Sound.ts`) | done | `src/audio/sound.gd` | Test: `test_sound_system.gd` |
| Mix buses and limiter (`Sound.ts`) | done | `default_bus_layout.tres`, `src/audio/sound.gd` | Test: `test_sound_mix.gd` |
| Sound library licences (`assets/README.md`) | done | `src/audio/sound_library.gd`, `assets/LICENSES.md` | Test: `test_sound_library.gd`, `test_asset_licences.gd` |
| Vehicle sounds wiring (`apps/game/src/Game.ts`) | partial | `src/app/vehicle_sounds.gd` (wired in `play_wiring.gd`) | No test found by name that covers it |

## 11. Platform, tools and assets

| Three.js feature (file) | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| React Native Android shell (`apps/mobile/`) | replaced | Godot export, `export_presets.cfg` | No WebView shell |
| Release APK, debug signed (`apps/mobile/android/`, `.github/workflows/chennai-open-world.yml`) | done | `export_presets.cfg`, `.github/workflows/godot-chennai.yml`, G-9 | APK 77 MB, arm64, minSDK 24 (progress.md). Not re-run here |
| Emulator smoke test (`scripts/android-smoke.mjs`) | done | `tools/android_smoke.sh`, G-9 | Reached `[boot] play` on an emulator (progress.md) |
| Browser end-to-end tests with touch (`scripts/e2e.mjs`, Playwright) | replaced | `tests/` (headless Godot runner, `run_tests.sh`) | Godot tests replace Playwright |
| Test runner (`npm test` with Vitest) | replaced | `run_tests.sh`, `tests/test_runner.gd` (G-8) | |
| Blender character script (`tools/blender/characters.py`) | done | `tools/blender/characters.py`, `tools/blender/cast_people.py`, G-100 | Extended for the 70 people |
| Blender vehicle script (`tools/blender/vehicles.py`) | done | `tools/blender/vehicles/` (`cars.py`, `trains.py`, `vkit.py`), G-30 to G-34 | |
| Blender auto-rickshaw script (`tools/blender/auto_rickshaw.py`) | replaced | `tools/blender/vehicles/road/` | Redesigned |
| Blender street props script (`tools/blender/street_props.py`) | unverified | `assets/props/*.glb` | Props exist. Source script not found in `tools/blender` (grep) |
| Blender preview animation script (`tools/blender/preview_animation.py`) | unverified | `tools/blender/cast_animation.py` (probable) | Not compared |
| Animation extraction from Mixamo (`scripts/extract-animations.py`) | replaced | `tools/blender/cast_animation.py`, CC0 clips (G-105) | Mixamo removed |
| Mixamo locomotion clips (`chennai-open-world/assets/animations/locomotion.glb`) | replaced | `assets/animations/locomotion.glb` (own CC0 rig) | CC0 from Quaternius |
| Optimise assets (`scripts/optimize-assets.mjs`) | replaced | `tools/apk_size_report.sh`, G-240 to G-243 | Size budget guards |
| Data and asset sync with licence rows (`assets/README.md`) | done | `tools/sync_from_threejs.py`, `assets/LICENSES.md`, G-3 | `--check` runs in CI |
| Licence rows for every asset (`assets/README.md`) | done | `assets/LICENSES.md`, `tests/unit/test_asset_licences.gd` | |
| Clip-city and clip-rail scripts (`scripts/clip-city.py`, `clip-rail.py`) | unverified | `tools/geo/` (probable) | Not compared |
| Fetch rail data (`scripts/fetch-rail.mjs`) | replaced | `tools/geo/`, `tools/rail/build_rail.py` | |
| Sync to Android (`scripts/sync-android.mjs`) | replaced | `.github/workflows/godot-chennai.yml` | |
| Blender runner (`scripts/blender.mjs`) | replaced | `tools/` (Blender run from CI scripts) | |
| Documentation of TD decisions (`docs/technical-decisions.md`) | replaced | `godot-chennai/docs/technical-decisions.md` (G-1 onward) | |
| Handoff and progress notes (`docs/handoff.md`, `docs/progress.md`) | done | `godot-chennai/docs/handoff.md`, `godot-chennai/docs/progress.md` | |

## 12. Three.js unit test files (61)

Count of test calls per file is not checked. Status describes the Godot test that covers the same subject.

| Three.js test file | Godot status | Godot test / G-number | Note |
|---|---|---|---|
| `apps/game/src/content.test.ts` | done | `tests/unit/rules/test_content.gd` | |
| `apps/game/src/enemyWalls.test.ts` | unverified | - | No Godot test for enemy walls found by name |
| `apps/game/src/fareSpots.test.ts` | done | `tests/unit/rules/test_content_on_map.gd`, `test_stage_spread.gd` | Spots checked through content tests |
| `apps/game/src/furniture.test.ts` | partial | `tests/unit/test_city_meshes.gd` | Furniture covered partly |
| `apps/game/src/goods.test.ts` | done | `tests/unit/rules/test_goods.gd` | |
| `apps/game/src/laterStages.test.ts` | done | `tests/unit/rules/test_content.gd` (stage order), `test_stage_spread.gd` | Checks the Godot order of stages 16 to 21 |
| `apps/game/src/places.test.ts` | unverified | - | No Godot test for the place list by name |
| `apps/game/src/props.test.ts` | partial | `tests/unit/test_city_meshes.gd` | Street props only partly |
| `apps/game/src/rail.test.ts` | done | `tests/unit/test_rail.gd` | |
| `apps/game/src/ridingPose.test.ts` | done | `tests/scene/test_poses.gd` | |
| `apps/game/src/streetWar.test.ts` | partial | `tests/unit/rules/test_stage_spread.gd`, `test_content.gd` | Gang stage rules are in logic tests only |
| `packages/ai/src/Agents.test.ts` | done | `tests/unit/test_ai_traffic.gd` | |
| `packages/ai/src/Density.test.ts` | done | `tests/unit/test_ai_population.gd` | |
| `packages/ai/src/Pursuit.test.ts` | partial | `tests/unit/rules/test_police_fleet.gd` | Pursuit rules in police logic; not in play |
| `packages/ai/src/Reactions.test.ts` | done | `tests/unit/test_street_hits.gd`, `tests/scene/test_street_reactions.gd` | |
| `packages/ai/src/Signals.test.ts` | done | `tests/unit/test_ai_traffic.gd` (signals) | |
| `packages/combat/src/Combat.test.ts` | done | `tests/unit/rules/test_combat.gd` | Logic |
| `packages/combat/src/Gangs.test.ts` | done | `tests/unit/rules/test_gangs.gd` | Logic |
| `packages/combat/src/PedestrianHits.test.ts` | done | `tests/unit/rules/test_pedestrian_hits.gd` | Logic |
| `packages/combat/src/Strikes.test.ts` | done | `tests/unit/rules/test_melee.gd` | Logic |
| `packages/combat/src/Wanted.test.ts` | done | `tests/unit/rules/test_wanted.gd` | Logic |
| `packages/combat/src/Weapons.test.ts` | done | `tests/unit/rules/test_weapons.gd` | Logic |
| `packages/game-engine/src/FacadeKit.test.ts` | partial | `tests/unit/test_city_meshes.gd` | |
| `packages/game-engine/src/FollowCamera.test.ts` | done | `tests/scene/test_player.gd` (camera) | |
| `packages/game-engine/src/LandmarkView.test.ts` | done | `tests/unit/test_landmarks.gd` | |
| `packages/game-engine/src/Motion.test.ts` | unverified | - | Subject of `Motion.ts` unverified |
| `packages/game-engine/src/RailView.test.ts` | partial | `tests/scene/test_railway.gd` | Track view covered indirectly |
| `packages/game-engine/src/StreetProps.test.ts` | partial | `tests/unit/test_city_meshes.gd` | |
| `packages/game-engine/src/lighting.test.ts` | done | `tests/unit/test_lighting.gd` | Ported |
| `packages/game-world/src/clock.test.ts` | done | `tests/unit/test_game_clock.gd` | |
| `packages/game-world/src/districts.test.ts` | done | `tests/unit/rules/test_game_world.gd` | |
| `packages/game-world/src/furniture.test.ts` | partial | `tests/unit/test_city_meshes.gd` | |
| `packages/game-world/src/landmarks.test.ts` | done | `tests/unit/test_landmarks.gd`, `tests/unit/test_world_index.gd` | |
| `packages/game-world/src/props.test.ts` | partial | `tests/unit/test_city_meshes.gd` | |
| `packages/map-data/src/osm.test.ts` | replaced | `tools/geo/tests/` (pytest) | Python tests |
| `packages/map-data/src/projection.test.ts` | done | `tests/unit/test_map_projection.gd`, `tools/geo/tests/` | |
| `packages/missions/src/MissionRunner.test.ts` | done | `tests/unit/rules/test_mission_runner.gd` | |
| `packages/missions/src/chase.test.ts` | done | `tests/unit/rules/test_mission_systems.gd` (chase) | Chase rules are logic only |
| `packages/missions/src/fares.test.ts` | done | `tests/unit/rules/test_fares.gd` | |
| `packages/missions/src/goods.test.ts` | done | `tests/unit/rules/test_goods.gd` | |
| `packages/missions/src/jobs.test.ts` | done | `tests/unit/rules/test_jobs.gd` | |
| `packages/missions/src/life.test.ts` | done | `tests/unit/rules/test_life.gd` | |
| `packages/missions/src/reputation.test.ts` | done | `tests/unit/rules/test_mission_session.gd` | |
| `packages/missions/src/shareAuto.test.ts` | done | `tests/unit/rules/test_share_auto.gd` | |
| `packages/missions/src/stories.test.ts` | partial | `tests/unit/rules/test_mission_events.gd`, `test_content.gd` (stories) | Matched by subject name only |
| `packages/player/src/armSettle.test.ts` | done | `tests/scene/test_human_figure.gd` | |
| `packages/player/src/people.test.ts` | done | `tests/people/test_people.gd` | |
| `packages/player/src/retarget.test.ts` | done | `tests/unit/test_retarget.gd` | |
| `packages/player/src/strikePose.test.ts` | missing | - | No strike pose in Godot |
| `packages/rail/src/doors.test.ts` | done | `tests/unit/test_rail.gd` | |
| `packages/rail/src/rail.test.ts` | done | `tests/unit/test_rail.gd` | |
| `packages/rail/src/station.test.ts` | done | `tests/unit/test_rail_station.gd` | |
| `packages/ui/src/cityMapMath.test.ts` | partial | `tests/unit/test_map_projection.gd`, `tests/scene/test_maps.gd` | Map maths covered by other names |
| `packages/vehicles/src/Boarding.test.ts` | done | `tests/unit/test_boarding.gd` | |
| `packages/vehicles/src/Gearbox.test.ts` | done | `tests/unit/test_gearbox.gd` | |
| `packages/vehicles/src/autoModel.test.ts` | replaced | `tests/unit/test_vehicle_models.gd` | Auto is a GLB now |
| `packages/vehicles/src/blenderVehicles.test.ts` | done | `tests/unit/test_vehicle_models.gd` | 3,226 checks |
| `packages/vehicles/src/doors.test.ts` | partial | `tests/unit/test_boarding.gd`, `tests/unit/test_vehicle_catalog.gd` | Door checks spread over boarding tests |
| `packages/vehicles/src/glbModels.test.ts` | done | `tests/unit/test_vehicle_catalog.gd` | |
| `packages/vehicles/src/specs.test.ts` | done | `tests/unit/test_vehicle_catalog.gd`, `tests/scene/test_vehicle_handling.gd` | |
| `packages/physics/src/VehicleBody.test.ts` | done | `tests/scene/test_vehicle_handling.gd` | |

## 13. Three.js browser spec files (23)

| Three.js browser spec | Godot status | Godot test / G-number | Note |
|---|---|---|---|
| `apps/game/tests/boarding.spec.ts` | done | `tests/scene/test_boarding_safety.gd`, `tests/scene/test_game_vehicles.gd` | |
| `apps/game/tests/city.spec.ts` | done | `tests/scene/test_city_streaming.gd` | |
| `apps/game/tests/citymap.spec.ts` | done | `tests/scene/test_maps.gd` | |
| `apps/game/tests/combat.spec.ts` | missing | - | Combat not in play |
| `apps/game/tests/driving.spec.ts` | done | `tests/scene/test_driving.gd` | |
| `apps/game/tests/fares.spec.ts` | partial | `tests/scene/test_missions_layer.gd`, `test_fare_figures.gd` | Fare flow in play; some stages not checked |
| `apps/game/tests/gangs.spec.ts` | missing | - | Gangs not in play |
| `apps/game/tests/handling.spec.ts` | done | `tests/scene/test_vehicle_handling.gd` | |
| `apps/game/tests/jobs.spec.ts` | done | `tests/scene/test_missions_jobs.gd` | |
| `apps/game/tests/landmarks.spec.ts` | done | `tests/unit/test_landmarks.gd` | |
| `apps/game/tests/look.spec.ts` | done | `tests/scene/test_city_environment.gd` | |
| `apps/game/tests/missions2.spec.ts` | done | `tests/scene/test_missions_v2.gd` | |
| `apps/game/tests/onfoot.spec.ts` | done | `tests/scene/test_player.gd`, `tests/scene/test_touch_foot.gd` | |
| `apps/game/tests/pedestrians.spec.ts` | partial | `tests/scene/test_city_life.gd`, `test_street_reactions.gd` | Walkers done; fights missing |
| `apps/game/tests/people.spec.ts` | done | `tests/people/test_people.gd`, `tests/scene/test_human_figure.gd` | |
| `apps/game/tests/places.spec.ts` | partial | `tests/scene/test_missions_layer.gd` | Place dialogs; the place list not checked by name |
| `apps/game/tests/police.spec.ts` | missing | - | Police not in play |
| `apps/game/tests/railway.spec.ts` | done | `tests/scene/test_railway.gd` | |
| `apps/game/tests/shareAuto.spec.ts` | partial | `tests/unit/rules/test_share_auto.gd` | Scene version not found by name |
| `apps/game/tests/stages3.spec.ts` | partial | `tests/scene/test_missions_v2.gd`, `tests/scene/test_missions_layer.gd` | Stages 16 to 21 play-through not confirmed |
| `apps/game/tests/stations.spec.ts` | done | `tests/scene/test_railway.gd` | |
| `apps/game/tests/traffic.spec.ts` | done | `tests/scene/test_city_life.gd`, `tests/scene/test_traffic_view_teleport.gd` | |
| `apps/game/tests/weapons.spec.ts` | missing | - | Weapons not in play |

## 14. Godot-only work (not counted in the summary)

These rows are not in the Three.js game. They come from the migration brief (section 9 to 11) or from
Godot decisions. They are listed so nobody thinks they are missing from Three.js.

| Item | Godot status | Godot file / G-number | Note |
|---|---|---|---|
| Premium saloon, SUV, sports coupé (brief section 11) | done | `assets/vehicles/`, G-72, G-73 | Models and handling. Not yet in the traffic mix |
| Race car (brief section 11) | done | G-72, G-73 | Model and handling. Races not built |
| Helicopter model (brief section 11, phase 6b) | partial | `tools/blender/vehicles/aircraft.py`, `assets/aircraft/` | Model only. No flight code |
| Light aircraft and airliner models (brief section 11, phase 6b) | partial | `assets/aircraft/` | Models only. No flight, no airport in play |
| Airport in the world data (brief section 11) | partial | `world/`, `tools/geo/` (aeroways) | Data exists. Not played |
| Far-city layer for flight (brief section 11) | missing | - | Not built |
| Gamepad (G-178) | done | `src/ui/touch_controls/device_tracker.gd`, `test_gamepad.gd` | |
| Quality presets, auto-detect, performance overlay (G-250 to G-259, G-340 to G-346) | done | `src/game_engine/quality/`, `src/ui/debug_hud/perf_overlay.gd` | Measured on llvmpipe, not on a phone |
| Shader warm-up at load (G-258) | done | `src/app/perf/shader_warmup.gd` | |
| Frame timeline and hitch log (G-340) | done | `src/game_engine/quality/frame_timeline.gd` | |
| Left-handed controls, look sensitivity, invert-Y (G-170) | done | `src/ui/touch_controls/control_settings.gd`, `test_control_settings.gd` | |
| Title camera tour over a seeded spot (G-164) | done | `src/app/title_wiring/title_spots.gd` | |
| Rain and lightning on the title (G-165) | done | `src/app/title_wiring/` | Thunder left out |
| Reduced-motion mode (G-165) | done | `src/ui/title_menu/` | Test: `test_title_screen.gd` |
| Floating origin (G-7) | done | `src/game_engine/world_origin.gd` | Test: `test_world_source.gd` |
| Regional world index and rings (G-56, G-23 to G-29) | done | `src/game_world/regional_world_source.gd` | |
| Infrastructure: decks, ramps, water, speed breakers (G-150 to G-154) | done | `src/game_world/infra/`, `src/game_engine/city/deck_meshes.gd` | Test: `test_infra.gd`, `test_decks_driving.gd` |
| OSM detail: roof kinds, parts, street objects (G-190 to G-195) | done | `src/game_engine/city/detail_meshes.gd`, `src/game_world/detail/` | Test: `test_osm_detail.gd` |
| Area atlas, 31 areas (G-200 to G-204) | done | `data/areas/`, `src/game_world/city/area_palettes.gd` | Test: `tools/geo/tests/test_areas_data.py` |
| Navigation and spread (G-280 to G-289) | done | `src/ai/`, `src/missions/` | |
| Crash poses and knockdown (G-260 to G-275) | done | `src/player/poses/knockdown.gd` | Test: `test_knockdown.gd` |
| Touch scrolling for menus (G-350) | done | `src/ui/touch_scroll/touch_scroll.gd` | Test: `test_touch_scroll.gd` |
| Controls guide page, one data list (G-179) | done | `src/ui/touch_controls/controls_guide.gd` | Godot-only page |
| Codec v2 with version and infra and detail layers (G-23 to G-26) | done | `src/game_world/world_codec_v2.gd` | Godot-only format; see `docs/world-format.md` |
| Regional world, per-tile layouts, 47 tiles (G-56) | done | `src/game_world/regional_world_source.gd` | Godot-only |
| Medals, bonus goals, replay, retry (G-140 to G-149) | done | `src/missions/medals.gd`, `src/missions/mission_session.gd` | Godot-only |
| Stages 22 to 26 (G-140 to G-149) | done | `src/missions/content/missions_v2.json` | Godot-only |
| Road heights for decks and ramps in the AI (AI assumed y = 0 in Three.js) | partial | `src/game_world/infra/road_heights.gd`, G-151 | Not called by the AI (grep: only its own file) |
| Level crossings and their view (owner decision) | done | `src/rail/level_crossing.gd`, `src/game_engine/rail/crossing_view.gd` | Godot-only |
| Cab driving, owner prototype as rules (G-320s) | done | `src/rail/cab_drive.gd` | Godot-only |
| Recorded horns, doors, sirens, impacts, footsteps (owner decision, 23 Nov) | partial | `assets/audio/standin/` | Stand-ins only; no recordings yet |
| Train horn, rumble and crossing bell (brief section 6 for rail) | missing | - | Not made; bus horn stands in (handoff) |
| Helicopter flight, aeroplane flight, airport in play (brief section 11, phase 6b) | missing | - | Models only, see the row above |
| Haptics on crash (G-178) | done | `src/ui/touch_controls/haptics_plan.gd` | Godot-only |

## Summary

Counts are over sections 1 to 13 (Three.js features and tests). Section 14 is not counted.

| Status | Feature rows (sections 1 to 11) | Test rows (sections 12 and 13) | All counted rows |
|---|---:|---:|---:|
| done | 144 | 57 | 201 |
| partial | 33 | 17 | 50 |
| replaced | 26 | 2 | 28 |
| missing | 8 | 5 | 13 |
| unverified | 6 | 3 | 9 |
| **Total** | **217** | **84** | **301** |

Section 14 (Godot-only work, 34 rows: 26 done, 5 partial, 3 missing) is not in these counts.

Counts were taken from this file with `awk` over the status column. "Done" means code and a test
or documented check exist. It does not mean a phone has run it. Nothing here was run on a phone.

What is verified in play, and what is only in the logic layer:

- Stages 1 to 6 and the 13 city jobs are in play through `MissionsLayer`.
- Stages with a defeat, chase or gun objective (7 to 15, 18, 21) need combat or police code that
  `Main` does not create. Their rules are tested; the play path is not.
- Combat, weapons, gangs, pickups, the wanted level and police are logic only. Their scene tests do
  not exist.

## Prioritised: what to build next

Missing and partial rows, most important first. "Next" means the order I would build them in, based on
what blocks the most play.

1. **Wire combat into play (phase 5).** Combat, Strikes, Weapons, Gangs, Pickups, PedestrianHits and
   Fighters are logic only (`src/combat/`). Add punch and bat input on ACTION, a weapon pickup, gang
   crews from `content.json`, and the fight objectives' defeat events. Unblocks stages 7 to 10, 12, 14,
   15 and 21, and the `combat.spec.ts` and `gangs.spec.ts` tests.
2. **Health, hits and fight looks.** Player health bar with the six-second heal (missing), strike pose
   for punch and bat (missing), hit puffs (missing), weapon models in hand (missing). Needed with item 1.
3. **Wanted level and police in play (phase 5).** Create one `Wanted` in `Main`, add the stars HUD
   (missing), wire `PoliceFleet` and `Pursuit`. Unblocks the stage 11 chase, carjacking heat
   (`carjacking.gd` has the hook) and `police.spec.ts`.
4. **Goods look right.** Carry pose for a box in both hands (missing); goods figure models (partial).
   Needed for stage 4 to read well on screen.
5. **Stage 18, the Mumbai Mail.** The rules exist. The rider scene for seated passengers in trains
   does not (`docs/mission-design.md` W8). Partial.
6. **Share riders and place markers.** Riders on the share auto (partial); named place markers in the
   world (partial).
7. **Road heights in the AI.** `RoadHeights` exists and is tested. The traffic AI does not call it, so
   decks and ramps have no traffic heights yet. Partial.
8. **Station boards and clock.** Hindi on boards (partial: Tamil over English only); LED clock behaviour
   (partial, not compared).
9. **Recorded sounds.** Horns, doors, sirens, impacts, footsteps and train horn are stand-ins or
   missing. Blocked on recordings (`docs/handoff.md`, sound section).
10. **Landmark labels, place icons and motion blur.** On-screen landmark labels (partial: in-world
    signs exist), place icons (partial), motion blur (missing). Decide whether motion blur comes back:
    it is a Three.js feature with no decision recorded.
11. **Check the unverified rows** before building on them: enemy walls, the `Motion.ts` helper,
    `simplify.ts`, the coast, `StationLife.ts`, the Blender preview and street-props scripts, and
    the clip scripts.
12. **After parity (not counted):** phase 6b (helicopter and aeroplane flight, airport in play, far-city
    layer). Models exist; flight code does not.

## Top ten missing items

These are the missing rows, ranked by how much they block. Items 1 to 8 are all of the missing feature
rows in sections 1 to 11. Items 9 and 10 are missing test rows.

1. Player health bar with the six-second heal (`apps/game/src/Game.ts`, `Combat.ts`): no HUD in `src/ui`.
2. Strike pose for punch and bat (`packages/player/src/strikePose.ts`): no pose in `src/player`.
3. Hit puffs on a punch (`apps/game/src/HitPuffs.ts`): no effect in Godot.
4. Weapon models in hand (`packages/player/src/weaponModels.ts`): no models in play.
5. Wanted stars HUD (`packages/ui/src/WantedStars.ts`): no stars display in `src/ui`.
6. Carrying pose, box in both hands (`packages/player/src/carryPose.ts`): no pose in `src/player`.
7. Combat and gang browser tests (`apps/game/tests/combat.spec.ts`, `gangs.spec.ts`, `weapons.spec.ts`):
   no scene test, because combat is not in play.
8. Motion blur (`packages/game-engine/src/MotionBlur.ts`): no code. Not decided whether it should return.
9. Strike pose unit test (`packages/player/src/strikePose.test.ts`): nothing to test until the pose exists.
10. Police browser test (`apps/game/tests/police.spec.ts`): no scene test, because police is not in play.
