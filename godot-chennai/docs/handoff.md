# Handoff

Newest entry last. Say who you are (branch), what you did, what is next and what is weak.

## Foundation (phase 0), branch `agent/godot-foundation`, 23 Nov 2026
**Done.** Project skeleton, module layout as the Three.js game, boot flow (loading → title →
play on an empty test ground with a debug HUD), byte-for-byte data and asset sync with licence
rows, the world reader with a format-version check behind the `WorldSource` interface, the
floating origin, a headless test runner (21 tests), CI with import, tests, Android APK and an
emulator smoke run. Decisions G-1…G-9 in `technical-decisions.md`.

**For the World agent (wave 2).**
- Read the city only through `WorldSource` (`FileWorldSource` today). Call `open()`,
  `read_chunk()` and `roads_near()` on worker threads (`BackgroundTask`); they return plain data.
  Build chunk meshes with `SurfaceTool`/`ArrayMesh` off the main thread around `ChunkData.centre`,
  add a chunk only when complete, a few ms per frame.
- Put streamed content and the player in the group `WorldOrigin.GROUP` and call
  `WorldOrigin.follow(player_position)` from the player's step; convert data with
  `WorldOrigin.to_scene(Vector2(x, z), y)`.
- Replace `src/app/test_world/` with the streamed city; keep printing `[boot] play` when the
  player can move (the emulator smoke test waits for it), and keep the loading steps honest
  (add steps to `Main.STEPS`, each real work).
- `roads_near()` is a linear scan; keep roads per chunk (`roadSpansByChunk`) for streaming.

**CI.** Green on `agent/godot-foundation` (run 45185128445): tests, the `godot-chennai-apk`
artifact, emulator smoke. The first emulator runs stalled: the emulator's Vulkan failed to
present and the main loop stopped; with guest Vulkan off, Godot's own switch to OpenGL worked
once and then lost the app on the next run. The smoke APK now starts on the Compatibility
renderer itself, so the emulator tests booting, data and flow, not the Mobile renderer.

**Weak or not done.**
- The test ground is deliberately empty: no city meshes, no player, no touch joystick yet.
- 640×320 screens get readable but small text (14 at 0.7 scale ≈ 10 px).
- The Mobile (Vulkan) renderer has not run anywhere real yet: the CI emulator cannot present
  with Vulkan, and Godot's automatic Vulkan-to-OpenGL switch was unreliable there. First check
  on the owner's phone (Adreno 613).
- The frame watchdog is not covered by a test (it would need a deliberately stalled main loop).
- The APK carries every synced asset (about 50 MB of data, mostly the legacy cast) although
  phase 0 uses none of the models.
- Safe-area insets are coded but only real on a phone with a notch; untested there.


<!-- Data agent section. Other agents append their own sections. -->

## Data (tools/geo, world format 2)

Where things are:
- Tools: `tools/geo/chennai_geo/` (`cli.py` is the entry point; `world.py` the builder;
  `codec_v2.py`/`writer.py` the format; `codec_v1.py` today's format; `fusion.py` phase 2).
  Tests: `tools/geo/run_tests.sh`. Format spec: `docs/world-format.md`. Decisions G-20 to G-29.
- Data: `world/` (committed game data), `data/MANIFEST.json`, `data/boundary/world-boundary.geojson`;
  downloads go to `data/raw/` (git-ignored). `tools/geo/` and `data/` carry a `.gdignore` so
  Godot doesn't scan them.

To rebuild: `docs/world-format.md` §7 (venv with `requirements.txt`, `apt-get install
osmium-tool`, then `fetch`, `clip`, `build --max-ring 3`, `run_tests.sh`). About 2.5 min and 3 GB
RAM for the whole world.

For the World agent writing the GDScript reader of format 2:
- Read `world.json`, check `format == 2`, take grid, tile size and rings from it (never constants).
- Stream tiles around the player: `tile.json` (chunk table with pack offsets), `roads.bin`
  (pieces: join by road id and piece; neighbouring pieces share their end point), then chunk
  records by `FileAccess.seek(offset)` into `chunks.bin`. `areas.bin` is for the map/far layer.
- The chunk record is today's record plus fields; Foundation's `WorldCodec` (v1) can be extended
  with a `format == 2` branch. Today's chunk (c, r) = (c + 107, r + 225); same centres.
- Export filter: the APK must include `world/**/*.json` and `*.bin` (non-resource files).
- Size per tile: 0.1–2.5 MB; the densest tile (city centre) about 2.5 MB of chunks plus about
  1 MB roads.

Hosts needed for phase 2 (fusion), to ask the owner to allow:
- Overture buildings (GeoParquet, read with DuckDB `httpfs`/`spatial` and a bbox filter):
  `overturemaps-us-west-2.s3.us-west-2.amazonaws.com` (or the Azure mirror
  `overturemapswestus2.blob.core.windows.net`), `extensions.duckdb.org` (DuckDB's spatial and
  httpfs extensions), and `docs.overturemaps.org`/`stac.overturemaps.org` to pin a release.
  `duckdb` itself comes from PyPI (already allowed).
- Google Open Buildings 2.5D Temporal (heights raster): an Earth Engine export, needing
  `earthengine.googleapis.com`, `oauth2.googleapis.com`, `accounts.google.com` and an Earth
  Engine account, with the export landing in `storage.googleapis.com` (a GCS bucket) or Drive;
  or the owner exports it once and puts the GeoTIFF on an allowed host. Open Buildings v3
  polygons (only if Overture lacks them): `storage.googleapis.com` (bucket `open-buildings-data`).
- `rasterio` (PyPI) for reading the GeoTIFF.

Weak or not done:
- Fusion not run: rings 2–3 have only 15,345 OSM buildings for about 3,000 km² of towns and
  villages; those areas look empty until Overture is fused in. Heights are 97.8 % estimated.
- Archetypes: the byte is there (0 = unassigned); no archetype rules yet.
- Rail (`rail.json`) not rebuilt for the region; today's `rail.json` (Beach–Tambaram) still
  applies to ring 0 only. Rivers (waterway lines) and the Buckingham Canal as lines are not kept
  (water polygons are).
- Areas: big rural landuse is thin in OSM (farmland 136 polygons); the rural look will need a
  default ground plus scrub/paddy texture by rule, not data.
- The sea is one coastline chain (16 ways joined); islands and the Pulicat lagoon mouths are not
  special-cased. The outline is fine for drawing water, not for exact shore physics.
- Region tiles hold areas and aeroways by their centre; a reader drawing a tile edge must also
  look at the neighbouring tile's `areas.bin`.
- Equirectangular scale at the world's edges (about 50 km from the origin) is slightly off true
  distance (estimate 0.4 %); consistent for game data, wrong for survey use.
- The format-2 ring-0 world is 1.4× today's bytes; if phone storage matters, provenance could
  move to a per-tile side table.


## Rules (agent/godot-rules): where I left off
- **Wired:** the 251 rules cases live in `tests/unit/rules/` and run in Foundation's `./run_tests.sh`
  (and so in CI); the separate runner is gone. Merged with Foundation + Data; all scripts compile
  under the project's warnings-as-errors.
- **Class names to check for clashes** with other agents: `MissionData`, `MissionRunner`,
  `JobData`, `JobRunner`, `FareStop`, `GoodsStop`, `ShareShift`, `RouteLine`, `Chase`, `Life`,
  `StoryRunner`, `GameContent`, `SaveStore`, `Combat`, `CombatWorld`, `EnemySpot`, `Melee`,
  `Weapons`, `Arsenal`, `Gangs`, `PedestrianHits`, `Casualties`, `WeaponPickups`, `Wanted`,
  `PoliceFleet`, `Carjack`, `DistrictIndex`, `VisitedDistricts`, `RulesMath`,
  `SeededRandom`. There is one clock: Foundation's `GameClock` (my duplicate port was removed;
  `SaveStore` and the tests use `GameClock`). If the Data agent also ports `districts.ts`, keep
  one of the two.
- **Content is baked** (`src/missions/content/content.json`, G-41). Re-run
  `tools/rules/export_content.ts` (instructions in its header) when the world data or the TS
  content changes; once the Data agent's road reader exists, the placement in `content.ts` can be
  ported and the 5 map-checking content tests added.
- **Not done / weak:** the 5 map-dependent content tests; TD-28's numbers are still untuned by
  play (as in the TS game); the police cars' driving, search and spawn-point rules in `Police.ts`
  are game code with routing (`@cow/ai` Pursuit) and are not ported; crash thresholds
  (`vehicles/src/crash.ts`, TD-29) belong to the vehicles phase.

## Models (agent/godot-models)
State: every model in the brief is built, under budget and passing the model checks. See
`docs/vehicles.md` for the list, data model, budgets and how to rebuild.

To continue:
- Rebuild: `godot-chennai/tools/blender/vehicles/build_all.sh` (Blender 5.2.4 LTS and Godot 4.7.2
  on the PATH). To check only: `./run_tests.sh --filter=vehicle_models`
  (`tests/unit/test_vehicle_models.gd` runs `tests/models/model_checks.gd`, part of the CI run).
- Review screenshots: `tools/models/model_shot.gd` (the header has the command; xvfb, Compatibility
  renderer). Screenshots are not committed.
- The Three.js road vehicles are the sync's (`assets/vehicles/legacy/`, G-36); a new agent is
  redesigning the Tamil Nadu road vehicles and will replace them.
- Add a vehicle: write it in the matching script with `vkit` helpers. Give it named nodes and
  anchors, write its manifest (copy an existing one's fields), and add its kind's budget to
  `BUDGETS` in the test if it is a new kind.
- Next uses: Phase 2 (premium and race cars drivable; read `physics` and `pose` from the manifest),
  Phase 6 (trains on the line, MultiMesh per car type), Phase 6b (helicopter and aeroplanes).

Weak spots (also in `docs/vehicles.md`): simple car fronts and rears, stepped window outlines up
close, light trains (painted windows), cabins in the aircraft without gauges, the ported auto
over the car budget, and nothing seen on a phone.

## Player (phase 1), branch `agent/godot-player`, 23 Nov 2026
**Done.** `src/player/`: `PlayerController` (kinematic cylinder, Three.js movement rules,
kerb stepping), `HumanFigure` (any MPFB/Mixamo-named model, retargeted idle/walk/run in an
`AnimationTree` advanced in the physics step, arms settled, soles planted every step),
`Retarget`/`RigData`/`SoleSet`/`LocomotionClips` (retargeting on plain data, on a worker
thread, cached per skeleton), `PeopleManifest`, `FollowCamera` (orbit + chase, eases round
thin obstacles, clamps at walls), `PlayerRig` (body + camera + touch + keys),
`PlayerTestGround`; `src/ui/touch_controls/` (multi-touch stick, look, RUN, JUMP). Decisions
G-60…G-68 (G-69 free). Tests: `tests/unit/test_retarget.gd`, `tests/scene/test_human_figure.gd`,
`test_player.gd`, `test_touch_layout.gd`. Screenshots: regenerate with `tests/tools/player_screenshot.gd` into a scratch folder (never committed, AGENTS.md).

**To wire it into the game** (composition root): add a `PlayerRig` to the world, `await
rig.load_figure()` during loading (it retargets on a worker thread, about 0.25 s on a desktop),
then `rig.place(feet, yaw)`; hide `rig.controls` outside play; the rig makes its camera current.
Put the rig in `WorldOrigin.GROUP` and call `WorldOrigin.follow(rig.body.global_position)` from
the step (World agent), then `rig.camera.snap()` after a recentre. A new-cast person:
`rig.load_figure("res://assets/people/people.json", "<id>")`.

**For Vehicles.** `body.enter_vehicle(vehicle, seat_node)` / `body.exit_vehicle(feet, yaw)`;
while riding call `rig.camera.chase(velocity, heading, forward_speed, top_speed, dt)` each step
and set `rig.camera.reach` for the vehicle (Three.js: further for cars and buses);
`rig.camera.follow(vehicle_body)` to follow the vehicle instead of the player; the figure stays
shown for a seated pose (none yet). Layers: G-64.

**Weak or not done.**
- Not in `main.gd` yet (see above); the touch controls appear only with a `PlayerRig`.
- No jump or fall clip (the Three.js game had none either): in the air the gait clip plays at
  0.55×.
- Physics interpolation is off project-wide; the camera follows in the physics step, smooth at
  60 fps, but on a 90/120 Hz screen the view updates at 60 Hz. Turning interpolation on means
  the camera should read `get_global_transform_interpolated()` in `_process`.
- The step-up uses `test_move` probes on a cylinder body; checked on boxes, not on the real
  city's kerbs or stairs, or on slopes steeper than the ground.
- Retargeting cost (0.25 s desktop) is untested on the Adreno 613 phone; if it is slow, bake
  the clips per skeleton to a resource at build time.
- Only the default player model was exercised; Cast's new models must keep the Mixamo bone
  names (any prefix) and the A-pose for the retarget to apply.
- In the close-up the shoulders read slightly raised; arms are judged natural, hands relaxed,
  sandals flat on the ground.

## Emulator smoke made deterministic, branch `agent/godot-smoke`, 24 Nov 2026
**Root cause** of the intermittent `android-smoke`: an overlay change on the freshly booted
emulator changed every app's asset paths, Android relaunched the game's activity, and Godot
ended its own process (G-9, amended, with the log evidence). **Fix:** the smoke waits, bounded,
for the overlays and configuration to stay unchanged for 20 s before installing and before
launching (plus boot, managers, unlocked landscape screen, install broadcasts), follows the
game's pid, and prints the exit reason and the log before any relaunch on failure. To repeat
the check: *Run workflow* with `smoke_runs` = `1,2,3,4,5,6,7,8` (`smoke_settle` = `0` launches
the old way, without the waits).

## Cast (people)

### 23 Nov 2026, cast agent (branch `agent/godot-cast`)
Where things are: `docs/characters.md` (everything about the people), decisions G-10 … G-19 in
`docs/technical-decisions.md`, licences in `assets/LICENSES.md` (People section).

For the coordinator / Foundation, on merge:
- Wire `tests/people/test_people.gd` into the test runner: it is a `SceneTree` script that quits
  with 1 on failure and reads `res://assets/people/`, so in the real project it runs as
  `godot --headless --path godot-chennai --script res://tests/people/test_people.gd`; it needs no
  import step (it parses the GLBs with `GLTFDocument`). About 15 s for 60 people.
- `assets/people/sole_plant.gd` is a run-time helper the character scenes should call after
  their AnimationTree each frame (move it to `entities/` if your layout prefers; update the
  test's preload path).
- After import, set the five clips to loop (import script or `.import` `_subresources`).
- Do not commit the `.godot/` folder; `.glb.import` files will appear next to the GLBs once the
  real project imports them, which is fine.

Rebuilding needs Blender 5.2, MPFB 2.0.18 and the MakeHuman packs (steps in
`docs/characters.md`); in this container they are at `/opt/tools/` with MPFB's data folder linked
to `/opt/tools/mpfb-data`.

Next: props and the 10 uncast figures; better faces (more face targets per person, women's faces
softer); the player model (richer budget); real-device check of the skinned look on the Mobile
renderer (only the Compatibility renderer could be judged here).

### 24 Nov 2026, cast agent: review round and integration
- Merged `feat/godot-chennai` (Foundation, Data, Rules, Models); docs and licences keep every
  section. The 37 Three.js people stay in `assets/people/legacy/` (Foundation's sync).
- `tests/people/` is now a `TestCase` run by `tests/test_runner.gd` (`res://tests/people` added to
  `TEST_DIRS`), strictly typed; `./run_tests.sh --filter=people/` runs only it. It loads the
  imported scenes, so `--import` must have run (the runner does it).
- The five clips loop through the `.glb.import` files (`tools/blender/people_import.py`).
- 70 people now (owner's answers in `docs/characters.md`); the cricket boy's `play` role means
  safe play areas only.

## Tamil Nadu road vehicles (agent/godot-tn-vehicles)
State: 12 models in `assets/vehicles/` (autos, cars, ambulance, five buses), replacing the
Three.js hatchback, auto, ambulance and bus (those stay in `legacy/`). Details, references and
rules: `docs/vehicles.md` "Tamil Nadu road vehicles"; decisions G-90 to G-96.

To continue:
- Rebuild: `tools/blender/vehicles/build_all.sh` runs `road/autos.py`, `road/cars_in.py` and
  `road/buses.py` after `cars.py` (they import its body method). One script:
  `blender -b --factory-startup --python godot-chennai/tools/blender/vehicles/road/buses.py -- --only bus_city`.
- Check: `./run_tests.sh --filter=vehicle_models`.
- First follow-ups: look at photographs of current Chennai city and low-floor buses and correct
  their colour families if needed (the Commons downloads were rate limited, G-90); restyle the
  legacy motorbike; draw destination names on the `dest_*` nodes in Phase 3.

## Vehicles (phase 2), branch `agent/godot-vehicles`, 23 Nov 2026
**Done.** A ray-cast vehicle body that reproduces the Three.js handling (measured against the
Rapier vehicles: `tools/reference/threejs_handling.mts`, `tests/data/threejs_handling.json`),
the five Three.js vehicles plus taxi/police/gang variants, the premium saloon/SUV/coupé and race
car on the Models agent's GLBs, the gearbox, boarding with doors, crash ejection, the touch
driving controls; wired to the Player (`PlayerRiderLink`: `enter_vehicle`/`exit_vehicle`,
`controls_enabled`; `FollowCamera.chase` while driving) in `src/app/vehicle_yard/`. Vehicles load
through the per-vehicle manifests (`assets/vehicles/*.json`, `legacy/`). Decisions G-70…G-79;
details in `docs/driving.md`.

**For the World agent.** In `Main`: spawn with `Vehicle.create(variant)` + `place()`, add a
`Driving` with `rider = PlayerRiderLink.make(rig.body)`, a `DrivingControls` on a CanvasLayer and
`DrivingWiring.wire(driving, controls, rig)` (as `VehicleYard` does); put vehicles in
`WorldOrigin.GROUP`.
**For the Tamil Nadu vehicles and Models agents.** A GLB + `<model>.json` in `assets/vehicles/`
replaces the `legacy/` one of the same name with its geometry (wheels, collision, seat, entry);
handling stays in `src/vehicles/data/vehicle_types.json`. Wheels are matched to physics wheels by
position. New kinds: add a kind and a variant to `vehicle_types.json`.
**For the Player agent.** A seated pose would make bikes and autos right: `RiderLink.set_seated
(type, amount)` gets `type.pose` (hands, feet, lean) and is the place to drive it.
**For the Sound agent.** Signals: `Driving.horn`, `boarding_event` (door_opening, shut…),
`crashed`; `Gearbox.shifted_up` for gear changes; `Vehicle.siren()`.

**Weak.** Single-front-wheel vehicles turn ~15 % less from rest than in the Three.js game and the
rear-driven ones slide a little more at full lock (cause not found; `docs/driving.md`). No seated
pose. The yard's lighting is a test ground, not the city. No physics interpolation.

## Sound and environment (agent/godot-ambient)
**Where things are.** `src/audio/` (`SoundProfiles` data, `Synth` offline stand-ins, `SoundLibrary`
manifest reader, `EngineBlend`/`EngineVoice` engines, `Ambience`, `PlayerSounds`, the `Sound`
autoload), `src/game_engine/environment/` (`Lighting`, `CityEnvironment`, `RainView`,
`StreetLights`, sky and rain shaders, the `Weather` autoload), `default_bus_layout.tres`,
`assets/audio/` (`manifest.json`, `rec/` recordings, `standin/` synthesised), `tools/audio/`.
Decisions G-80…G-89.

**How other agents call it.**
- Vehicles: every frame driving `Sound.set_engine(kind, speed_mps, accelerator01)`; getting out
  `Sound.engine_off()`; `Sound.horn(kind)`, `Sound.door(kind)`, `Sound.crash(delta_v)`,
  `Sound.set_skid(slide01)`, `Sound.set_siren(on)`. Kind names: `SoundProfiles.sound_kind()`
  maps hatchback/taxi/police → car, suv/saloon → premium, motorbike → bike, enfield/bike350 →
  thumper. Set `Sound.set_place(coast_m, traffic01, enclosed)` (enclosed = closed car or bus).
- Player: add a `PlayerSounds` and `follow(rig.body)` (the composition root; not wired yet).
- Traffic (AI): every frame `Sound.set_traffic([{id, position, speed, kind}], dt, GameLoop.clock.hour)`.
- World: add one `CityEnvironment` to the city scene (it replaces any WorldEnvironment/sun),
  `register_wet()` road/ground materials or read `global uniform float city_wetness;` /
  `city_night` in shaders, and `street_lights.set_lamps(points)` with the lamp feet per loaded area.
- UI (pause menu): `Sound.label()/toggle()`, `Weather.label()/toggle()`,
  `GameLoop.clock.text()/next()`; `main.gd` sets `Sound.active` in play and suspends at the title.

**Recordings still missing (synthesised fallback in use).** Engines: **premium, race, auto
(no licensed auto-rickshaw recording found on Commons or OpenGameArt), bike, thumper, bus,
ambulance**; all horns, doors, gear clunk, crashes, skid, wind, both sirens, wet footsteps,
landing, city hum, sea, koel, interface cues. Candidates found and licence-checked but not yet
downloaded because `upload.wikimedia.org` answers HTTP 429 with `Retry-After: 600` from this
environment: Jawa 350 exhaust (public domain → thumper), Pulsar 2 (Bajaj Pulsar, CC BY 3.0 →
bike), MAN SG 220 city bus engine, horn and door (CC BY 4.0, Work With Sounds → bus), FSR Tarpan
239D diesel van (CC BY 4.0 → ambulance), Ferrari Portofino and McLaren 765LT (CC BY 3.0 →
premium, race), "Car Horn.wav" (CC0), WWS police car siren and small waves (CC BY 4.0). Koel and
house-crow recordings on Commons are all CC-BY-SA (not used). To add one: download it with its
Commons metadata into a cache folder (`meta*.json`: title → url, file_url, licence, artist,
local), add its cuts to `tools/audio/recordings.json`, run
`python3 tools/audio/import_recordings.py --cache <folder>`, then
`godot --headless --path . --script res://tools/audio/render_standins.gd` (drops stand-ins a
recording replaced) and `--import`; the tests check rows, licences and the engine notes. The owner
could also record an auto-rickshaw on a phone (idle, held revs, start, stop, horn) for the auto.

**Measured.** Synthesis in GDScript: ~2 µs/sample/voice; full stand-in render 7.5-11 s (why no
run-time synthesis). Audio size: `assets/audio` 2.9 MB on disk (engine loops WAV, imported as QOA; the rest OGG). Draw calls in the test world:
12 dry, 13 raining. Screenshots (Compatibility, xvfb): golden hour is very warm and orange on the
flat test ground, noon's horizon band is near-white, night pools are sodium-orange but dim at the
edge; judge again on the real city.

**Weak or not done.** Recorded engines carry one load (revving in neutral), so on-load and
off-load sound the same apart from level; the car's top loop is a short (0.35 s) cut from a rev
blip. Traffic voices are untested in a real scene (no traffic yet). The ambience's "coast" and
"traffic" inputs need the world and AI. Helicopter and aeroplane sounds are not done. Sky
reflections are off (flat car paint at night).

## World (phase 1), branch `agent/godot-world`, 24 Nov 2026
**Done.** `src/game_world/city/`: `CityWorld` (scene: streamer, landmarks, ground plane, edges,
coast wall, a fallback sun/sky/haze and preview camera), `ChunkStreamer` + `ChunkWorkers`
(streaming, gating, near/far looks), `CityLayout`/`CityLayouts` (road spans, junctions, segment
grid, nearest road, shelters; per tile for format 2), `StreetFurniture`, `StreetProps`,
`LandmarkProfiles`. `src/game_engine/city/`: `ChunkBuilder` (one chunk's nodes on a worker),
`MeshBuilder`, `GroundMeshes`, `BuildingMeshes` (facade kit), `CityModels` (pole, shelter,
tree, palm, baked prop GLBs), `LandmarkMeshes`, `CityMaterials`, `CityAtlas`, `ShopSigns`,
`CityHash`, `shaders/ground.gdshader`. `src/game_world/regional_world_source.gd`,
`world_codec_v2.gd`. Textures: `tools/bake_city_textures.gd` → `assets/city/textures/`.
Decisions G-50…G-59. Tests: `tests/unit/test_city_meshes.gd`, `test_city_layout.gd`,
`test_regional_world_source.gd`, `tests/scene/test_city_streaming.gd`, `tests/support/city_kit.gd`.

**How to use.** `main.gd` builds the city in loading step 3 and adds the `PlayerRig`.
- Gate anything that simulates: `world.world_ready_around(point)` or
  `await world.wait_ready_around(point)` (world metres).
- The near/far switch distance is `world.streamer.near_distance`; load and free distances
  `load_distance`/`unload_distance`; main-thread budget `budget_usec`.
- Time of day and weather hooks for the environment work: `world.materials.set_night(0..1)`
  (windows and shops glow), `set_wet(0..1)`; replace the `Environment` and `Sun` nodes of
  `city_world.tscn`. Lighting tuned only so the ground is not blown out (sun 0.6, AgX).
- Look at a place: `godot --path . --script res://tests/tools/city_shot.gd -- --place=t_nagar`
  (under xvfb, Compatibility) prints draw calls and primitives; `--world=v1` for today's files.
- Rebake textures after changing a painter: `tools/bake_city_textures.gd` (xvfb), then import.

**Weak or not done.**
- Flyovers and bridges are drawn flat on the ground (format 2 has `bridge`/`layer`; no decks).
- Courtyards (holes) in format 2 buildings are not cut out of roofs or walled; v2 roof shapes,
  uses and min heights are read but not drawn; landuse areas (residential, industrial…) are
  bare earth.
- Wall-clock timing tests are sensitive to an oversubscribed machine (G-58); on this shared box
  the budget test failed while other agents loaded every core, and passed when quieter.
- Night glow, wet look and street-light pools exist only as material hooks (no lamp glow yet).
- The textures are painted stand-ins (ports of the Three.js canvases); tile seams show faintly
  on the earth layer, and the asphalt repeats visibly up close.
- No LOD for landmarks, no occlusion; trees have no far LOD (MultiMesh, cheap so far).
- Seen only under the Compatibility renderer on llvmpipe; not on a phone or the Mobile renderer.
- Physics interpolation off (G-59). Kerbs are not solid, so the player's step-up is not
  exercised by the city.

### 24 Nov 2026, cast agent: CC0 locomotion (branch `agent/godot-cc0-anim`)
- idle/walk/run now come from Quaternius' Universal Animation Library (Standard, CC0 1.0), not
  Mixamo: all 70 people rebuilt, and `assets/animations/locomotion.glb` is written by
  `tools/blender/characters.py --locomotion` (same clip names, MPFB skeleton) for the player's
  run-time retarget. `sync_from_threejs.py` no longer copies the old file. G-100.
- Download used: `https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip`
  (opengameart.org is reachable from the cloud container; quaternius.com and itch.io are not).
- New test `tests/unit/test_asset_licences.gd`: nothing under `assets/` may name Mixamo.
- The run is a jog in the library's style (lower, deeper knees); compare renders in the report.

