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
**Done.** idle/walk/run come from Quaternius' Universal Animation Library (Standard, CC0 1.0):
`Idle_Loop`, `Walk_Formal_Loop`, `Jog_Fwd_Loop`; all 70 people and the player's clip rig
`assets/animations/locomotion.glb` (written by `tools/blender/characters.py --locomotion`, same
clip names) rebuilt; `sync_from_threejs.py` no longer copies the old Mixamo file. Decisions
G-100…G-105 (G-106…G-109 free).
- Download: `https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip`
  (opengameart.org is reachable from the cloud container; quaternius.com and itch.io are not).
  Licence evidence in `assets/LICENSES.md` (hash, page, `License.txt`).
- `tests/unit/test_asset_licences.gd`: no asset names Mixamo, and no gait clip moves like the
  Mixamo clips (fingerprints, G-101; closest today 14.0°, limit 7°).
- Measured on the imported cast (Mixamo era in brackets): worst sole in any clip 0.002 m (0.024),
  wrist 36.0° (43.6), finger joint 33.5° (33.5), gait blends 0.003 m with planting (0.010) and
  0.094 m without (0.077); the player: soles within 0.0005 m, joint directions within 0.58° of
  the clips. Budgets unchanged (LOD0 7,200–9,971, LOD1 3,340–3,391), 55.5 MB of GLB (57.7).
- For Traffic: play `walk`/`run` at `speed / clipSpeedsMps[clip]` from `people.json` (G-105).
  Scene paths and clip names are unchanged. Clips now import at 60 fps (G-103).
- Weak: the run is a softened jog; from a three-quarter view the bent elbows read wide and
  sarees, veshtis and lungis still flare forward at full stride. The walk's arm swing is small.
  The run's feet slide at the player's 6.2 m/s (as before). Only seen on llvmpipe
  (Compatibility), not on a phone. `test_city_streaming.gd::test_main_thread_budget_under_cpu_load`
  fails in full runs here on `feat/godot-chennai` too (load-sensitive; passes alone).

## Missions (G-130 to G-139, agent/godot-missions), 24 Nov 2026
- **Playable:** `MissionsLayer` (`src/app/missions_layer/`, added to `Main` after the player) steps
  `MissionSession` (`src/missions/mission_session.gd`, node-free: stages, jobs, stories, life places,
  one purse and one save) from the player's real state; draws the marker (`MissionBeacon`), the HUD
  (`MissionHud`: money, stages, reputation, objective with distance/countdown/arrow, JOBS, toasts,
  job board, results, GO INSIDE, gym needle), parks the content's vehicles near the player, shows
  passengers boarding/alighting, goods handed over and the ambulance stretcher (`FareFigures`,
  cast adults only), and saves after each stage/job. NEW GAME on the title menu clears progress.
- **Tests:** `tests/scene/test_missions_layer.gd` (stages 1 and 2, restart, NEW GAME, board, a fare),
  `test_missions_jobs.gd` (courier goods, ambulance stretcher, pay, bumps, adults only),
  `tests/unit/rules/test_content_on_map.gd` (the 5 map-dependent content checks, G-137, plus a port
  of `kerbSpot`: `FareSpots`). Screenshots: `tests/tools/missions_shots.gd` (xvfb, Compatibility).
- **Not done / weak:** passengers are hidden when seated (no seated pose until the cast pose work);
  sound cues are only mapped to `Sound.chime` if it exists; the pause menu, parked-vehicle ownership
  and boarding belong to Integration: `MissionsLayer` spawns the content's parked vehicles itself
  (`spawn_parking`) and must be switched off if Integration parks them. Train stages (18-19) need
  the rail/train rider (not in this phase): see `by_train`.

## Integration (agent/godot-integration), 24 Nov 2026
Parked vehicles (`src/app/parked_vehicles/`), `PlayWiring` (driving, sounds, environment, parking),
`EnvironmentWiring` (clock and weather into the lights and materials), the pause menu
(`src/ui/pause_menu/`) and Back routing in `Main`. Decisions G-110…G-115. Tests: `test_game_vehicles`
(board, drive 20 m, exit, bike ejection, day/night/rain, pause, chunk ring and origin shift).
Open: the debug FPS badge sits under the pause panel's corner at 915x412; vehicles' headlamps do not
light the road at night; screenshots are software-GL only (no phone run).


## Mission design v2 (G-140 to G-149, agent/godot-missions), 24 Nov 2026
- **Done:** audit fixes W2 (checkpoints, retry, fail-forward, failure reasons), W3 (medals, goals, replay, STAGES tab, save version 2 with migration), W4 (seeded dynamic events in jobs and stages), W5 (content checked on the regional world), W6 (kerb test at 100 % of 49), W10 (cues through `Sound`, compact board with 4 rows, toast fit test). Systems: `fragile` (stability meter), `tail` (suspicion meter), `hazard_zone` (flood, procession, strike), choices. The five missions (Hall Ticket, Sambar for Sixty, Wrong Number, Monsoon Night, The Bandh) are data (`src/missions/content/missions_v2.json`, `anchors.json`), built by `tools/rules/bake_missions_v2.gd` + `build_missions_v2.py`, playable from the board's STAGES tab. HUD: meters, minimap, choice/retry/medals dialogs.
- **Tests:** `unit/rules/test_mission_systems.gd` (31 cases, numbers and edges), `test_content_v2.gd`, `test_mission_events.gd`, `scene/test_missions_v2.gd` (retry, choice, medals, meters, flood stalls an ambulance, STAGES tab). Screenshots: `tests/tools/missions_shots.gd`.
- **Not done:** W7 and hazard re-planning (road graph from the traffic branch), W8 (seated passengers, trains), W9 (spawn_parking off at merge), red light wiring, wanted heat wiring, wave B (stealth, race). The minimap shots place synthetic zones near the spawn because the real missions are kilometres away and not streamed in the screenshot tool.
- **Re-baking:** `godot --headless --audio-driver Dummy --path . --script res://tools/rules/bake_missions_v2.gd` then `python3 tools/rules/build_missions_v2.py`.

## Traffic, walkers, crowds, carjacking (phase 3), branch `agent/godot-traffic`, 24 Nov 2026
**Done.** `src/ai/` (pure): `AiArea` (roads round the player, built on a worker), `RoadGraph`
(with node heights, G-122), `AgentSystem` (traffic and walkers; lanes, signals, junction turns,
sidestepping, broad phase), `AgentPresets` (`chennai_mix`), `TrafficSignals`, `PlaceMap` and
`CrowdField` (TD-31), `TrafficDensity`, `CastPicker`, `AiPopulation` (ties them together by place
and hour). Views: `src/vehicles/traffic/` (`TrafficVehicleView`, `SignalHeads`),
`src/player/people/` (`PersonView`, `PeoplePool`). Wiring: `src/app/city_life/` (`CityLife`,
`Carjacking`); `main.gd` adds `CityLife` at the end of loading step 3. Decisions G-120…G-129.
Tests: `tests/unit/test_ai_traffic.gd`, `test_ai_population.gd`, `tests/scene/test_city_life.gd`.
Tool: `tests/tools/traffic_shot.gd` (screenshots and the frame-cost numbers).

**For the integration agent (PlayWiring).** Add the carjacking where `Driving` exists:
`var jack := Carjacking.make(main.life, play_wiring.driving); world.add_child(jack)` (set
`jack.wanted` once Phase 5 has a `Wanted`; listen to `jack.carjacked` for the HUD). The Get-in
button already offers the swapped vehicle (it is a `Vehicle` in the group). `Driving.enter`
reads the meta `driver_aboard` (one additive line). `CityLife.focus_node` is the player's body;
when the player drives, the driven `Vehicle` is an obstacle to the AI automatically. Change
agents only from `CityLife.between_steps` (the AI thread runs between).
**For the sound agent.** `CityLife` calls `Sound.set_traffic` every physics frame when
`Sound.active` (kinds: motorbike, auto_rickshaw, bus, hatchback, saloon/suv/coupe).
**For the world agent.** When flyover decks are drawn, build areas with `decks = true`
(`AiArea.build`, G-122) and give the crowd field a `solid(Vector2)` test against buildings.
**For Phase 5.** `AgentSystem.hold/let_go/scare/slow/place_at` are the hooks for knocked-down
walkers and police stops; walkers are adults only.

**Measured** (this 4-core container, Godot 4.7.2; `traffic_shot.gd`, 18:30, default pools 34
vehicles / 34 walkers). Main thread, headless at a fixed 60 fps, CityLife's own work per physics
frame (sync + wait): T. Nagar 0.73 + 0.42 ms, Marina 0.94 + 0.30 ms, Anna Salai 0.66 + 0.06 ms
(all physics callbacks together at Marina: 1.26 ms; before: 0.00 ms; the world's streaming
runs in `_process` and is unchanged). The AI step on its own thread, every second physics
frame: 1.8–3.1 ms (traffic 1.0–1.5, walkers 0.5–1.3, crowd 0.05–0.5). Twice the pools (68/68)
at T. Nagar: main 1.38 + 2.0 ms, AI step 7.8 ms: the default pools are what the budget allows.
Draw calls (Compatibility, xvfb, all passes), city alone → with life: T. Nagar 40 → 121, Marina
30 → 166, Anna Salai 32 → 159, Central 47 → 135; before merging the vehicle models and capping
the figures Marina was 244. 03:00 at Marina: 66. Out at 18:30: 21–28 vehicles, 20–34 walkers,
1–31 crowd people, at most 36 figures drawn plus drivers.

**Weak or not done.**
- Not seen on a phone; numbers are a desktop container's. On the Adreno 613 phone expect the
  main-thread part 3–4× slower (about 3–5 ms) and the draw calls as measured; lower
  `FIGURE_CAP` or the pools if the phone needs it.
- `Performance.TIME_PHYSICS_PROCESS` read 3.5–14 ms here even for idle frames (noise from the
  headless fixed-fps loop), so the physics engine's share was not isolated; the claim above is
  the script callbacks only. Under xvfb the GPU (llvmpipe) dominates every frame.
- Traffic still reads thin on most streets (a pool of 34 over a 170 m ring of many roads); a
  rush hour in Chennai is denser than this. Jams form at some junctions (several vehicles at a
  standstill seen at T. Nagar); the junction-turn rule is the Three.js one and was not tuned.
- T. Nagar reads as "lane" by road length: OSM's shops there are sparse for the market rule
  (9 within 90 m); TD-31's thresholds are unchanged.
- No sitting on the sand (the cast's `sit` clip is on a seat): beach groups stand or talk.
  Drivers use the seat `sit` clip; bike riders' legs are not on the footpegs.
- The fleeing carjacked driver runs straight for 9 s and vanishes; not an AI agent, so traffic
  does not stop for them. No HUD toast for the crime yet (integration/missions).
- Crowd spots do not test buildings (`solid` not wired): a spot can stand in a building's
  doorway or wall where pavements are narrow.
- Traffic views have no brake or indicator lights; doors never open.
- Model merging is skipped headless (the dummy renderer's mesh store is not thread-safe).

## Infrastructure (agent/godot-infrastructure), 24 Nov 2026
Decks and ramps, water, ground covers and road details. Decisions G-150…G-155; format
`docs/world-format.md` §3.7 (format 2.1, `infra.bin`).

**Audit before the work (format-2 world, 23 Nov data).** 153,969 road pieces: 2,134 `bridge`
(2,127 ways, 196 km), 360 `tunnel`/covered, 2,568 with `layer` ≠ 0 (+1: 2,339; −1: 189; +2: 30;
+3: 3; +4: 4; −2: 3). Ring 0: 20,857 pieces, 418 bridge, 113 tunnel, 458 layer > 0, 59 layer < 0.
Kathipara (centre of its named roads, x −700, z 8620): 16 deck pieces within 400 m (7 primary
layer 1, 5 primary_link layer 1, 2 primary layer 2, 2 footway layer 1). Gemini (Anna Flyover):
6 (5 primary, 1 secondary, layer 1). All were drawn flat on the ground. Water: 1,644 water,
30 reservoir and 177 wetland polygons (246 km²), but rivers had gaps (Adyar at Kotturpuram, Cooum
at Chetpet had no polygon) because `waterway=river|canal|stream` **lines were dropped** by
`osm_parse.py`. Parks, farmland, orchard, meadow, scrub, forest, cemetery, sport and mangrove were
all the same grass tile; water, reservoir and wetland a flat blue tile at +2 cm; residential and
industrial land bare earth. No crossings or traffic calming were read.

**Now.** `infra.bin` per tile (1.3 MB): heights for 7,369 raised road pieces (1,803 bridge chains,
525 crossing a road or railway; 12 of 1,027 checked crossings under 4.5 m clearance), 1,055
waterway pieces (317 km river, 236 km canal, 136 km stream, drains and ditches kept but not
drawn), 662 mapped spots (263 zebra, 12 signal crossing, 179 hump, 76 bump, 74 rumble strip, 58
unmarked) and 11,028 rule spots (1,161 zebras at signal junctions, 9,867 speed breakers, invented).
Rebuild: `tools/geo` `cli build --max-ring 3` (85 s); all 2.0 files come out unchanged.

**For the traffic agent (AI heights).** `RoadHeights` (`src/game_world/infra/road_heights.gd`,
node-free): `RoadHeights.on_road(road, segment, t)` for an agent on its lane (no search);
`RoadHeights.create(layouts).height_at(point, near_y)` / `surfaces_at(point)` / `top_at(point)`
for anything placed by position (where decks stack it picks the surface the body stands on).
`Road.heights`, `height_along(d)`, `height_at(i, t)`, `is_raised()` are on every road piece.
The composition root can build one from `CityWorld.layouts`. The player and vehicles need nothing:
decks are colliders.
**For the missions agent (fragile cargo).** `RoadBumps.create(layouts).crossed(prev, now)` each
physics step returns the speed breaker driven over (kind, height, length) or null.

**Measured (this box, 4 cores; same tool and world before and after, G-155).** Kathipara from
above (−700, 8620, camera 140 m back, 110 m up, 915×412, Compatibility): before 50 draw calls,
179.7k primitives; after 56 draw calls, 189.6k primitives (decks 14.8k triangles in the 9
chunks, ground 23.7k → 39.6k, colliders 10.5k → 19.1k; objects 51.4k → 30.6k as poles and props
leave the decks). Worst chunk build on a worker 686 → 844 ms. Main thread while streaming 800 m
through Kathipara at 20 m/s (headless; runs at headings 0.6 and 2.17): before, max frame
2.1–2.9 ms and max step (one collider body) 0.76–1.40 ms; after, max frame 2.4–3.4 ms and max
step 0.83–1.30 ms, with deck collider pieces of at most 1,200 triangles (2,400 gave 1.65–1.85 ms
steps). One after-run had a single 41 ms frame with every step under 1 ms (OS pre-emption, as in
G-58). A frame is the 2.5 ms budget plus at most one step by design (G-50). Full scene after:
57 draw calls, 175.7k primitives from above at Kathipara; Gemini road level 54 / 188.8k.

**Weak or not done.**
- Heights are estimated by rule; real flyovers differ (Kathipara's upper level is about 13 m
  here). Where a ramp leaves a deck their carriageways overlap at slightly different heights
  (up to about 0.5 m) for a few metres: a car feels a small step down.
- Ramps have kinks at the top and foot (grade jumps from 0 to 1:20), no vertical curve.
- Ramp spill: where OSM ends a bridge high and the next junction is close, the ramp continues
  into the junction and lifts the side streets' first metres (seen on GST Road at Kathipara).
- Underpasses are covered sections at ground level, not lowered roads (the ground is one
  boundary plane, G-151). Pedestrian subways under roads are not drawn.
- Causeways: a road crossing water without `bridge` stays at ground level over the sunk water,
  with a gap in the bund; one can step off it onto the invisible ground over the water.
- Water is not in the far/map layers; the sea is unchanged; intermittent streams look full.
- Medians are visual only (as kerbs); the median does not stop traffic.
- Rule speed breakers (9,867) are invented and dense; tune `RULE_BUMP_SHARE` if play says so.
- Kathipara hero model (Blender) not started (a later task, as asked).
- Seen only on llvmpipe (Compatibility); not on a phone or the Mobile renderer.

## OSM detail (agent/godot-osmdetail), 24 Nov 2026
Format 2.2 (`detail.bin`), decisions G-190…G-195; the page to read is `docs/osm-detail.md` (what is
drawn from which tag, the coverage report, the measured cost, the weak points).

**Data.** `tools/geo/chennai_geo/detail.py` (+ `osm_parse.py` collecting into `OsmFeatures.detail_*`):
one `detail.bin` per tile with building colours, materials and category, `building:part` polygons,
street objects, barrier and platform lines, zones, sign spots; 2.0 and 2.1 files unchanged;
`world/DETAIL.md` is the coverage report. Rebuild: `cli build --max-ring 3` (about 95 s).
`assets/city/sign_categories.json` is the one table of the 47 sign categories shared by Python and
the game.
**Game.** `DetailTile` (`src/game_world/detail/`, read by `RegionalWorldSource.tile_detail`,
`WorldSource.detail_for(cell)`); `ChunkBuilder.apply_detail` (colours, parts and hosts),
`use_mapped_lamps`, `add_platform_shelters`; `BuildingMeshes` (roof kinds, colours, parts, category
signs), `ShopSigns.pick`, `DetailMeshes` + `DetailModels` (objects, barriers, platforms, zones),
`GroundMeshes` covers 17 to 19, the pool colour in `water.gdshader`, `AreaPalettes`
(`data/areas/palettes.json`, G-194).
**For godot-areas.** `AreaPalettes` is the only reader of `data/areas/palettes.json`, which is now the areas agent's real file (G-200 and G-202; format 1: `default` plus `areas.<id>` with `walls`, `roofs`,
`roof_types`, `storeys` bins and a `boundary`). `AreaPalettes` (G-194, updated) picks the area of a building by
boundary containment at its footprint centre (circle: distance over radius; corridor: distance to the spine over
half width; the smallest wins; none contains it: `default`, which leaves a house exactly as before). The old
district-name lookup (`slug`, `districts_of`) is gone. Roof types and storey bins are picked by weight. Mapped OSM
tags always win.
**For the landmarks agent.** The world build already leaves out a building, its parts and signs at
a landmark footprint; `DetailMeshes` never draws inside a building's footprint or on water.
**Tests.** `tools/geo/tests/test_detail.py` (17), `tests/unit/test_osm_detail.gd` (14): the tile
decoded like the Python reader, every tile's detail, Tamil font coverage and baked ink, sign
picking, roof kinds and meshes, colours, floating parts, hosts replaced by parts, objects,
barriers and zones built in real chunks, barriers off the carriageway, mapped lamps, palette file.
`test_city_meshes.gd` lost the ten-sign test (now the category-table test) and `test_infra*` accept
`minor >= 1`.
**Weak or not done:** see `docs/osm-detail.md`.


## Area atlas (areas agent), branch `agent/godot-areas`, 24 Nov 2026
**Done.** Researched data for the landmark and building-detail work, no game code touched:
`data/areas/areas.json`, `landmarks_shortlist.json`, `palettes.json`, `coverage.json` and their
schemas; tools `area_lookup.py`, `area_coverage.py`, `area_palettes.py` in `tools/geo`; the atlas
`docs/areas.md`. Decisions G-200…G-204.

**For godot-osmdetail.** Read `data/areas/palettes.json` (schema in G-202 and
`palettes.schema.json`): per area id `walls`, `roofs` (hex), `roof_types` (roof shape to weight,
the world format's names), `storeys` (bins `1, 2, 3, 4-5, 6-9, 10+` to weight) and the area
`boundary` (circle or corridor in world metres) to pick the area of a building; `default` for the
rest. Everything is an estimate. OSM carries levels for 3.9 % of buildings in the areas and almost
no roof, colour or material tags (`docs/areas.md` coverage table), so these weights are the
palette's only source.

**For godot-landmarks.** `landmarks_shortlist.json`: per landmark OSM id, footprint, tier and
`tier.params` (kit name and numbers, mostly estimated), levels and height where tagged or sourced,
features with sources, Commons file titles. Heights and kit parameters marked `estimated` are not
measurements.

**Weak or not done.**
- `en.wikipedia.org`, Wikidata and most news hosts were not reachable; `sourced` claims rest on
  search-result summaries of those pages. 114 claims are `unverified` (107 in areas.json, 7 in the shortlist).
- No photo was viewed: the Commons image host answered 429 on the first request and fetching was
  stopped, so the wall colours are written from descriptions.
- Tamil names are OSM's, all need native review; T. Nagar has none.
- Eighteen landmarks have no matching Commons file by search; the world keeps only 55 buildings in
  Chengalpattu and 24 at Pulicat.
- Nothing reads the data in the game yet.



## Controls redesign (G-170…G-179), branch `agent/godot-controls`, 24 Nov 2026
**Done** (spec: `suggestions/2026-11-24-godot-controls-redesign.md`; decisions in
`technical-decisions.md`). Everything pure and shared is in `src/ui/touch_controls/`:
`ControlSettings`, `MoveState`, `LookState`, `JumpState`, `SteerState`, `ReverseHold`,
`ActionContext` / `ActionCandidate`, `ControlsLayout`, `ControlActions` (the InputMap names),
`DeviceTracker`, `HapticsPlan`, `ControlsGuide`. Nodes: `TouchControls` (walking),
`DrivingControls` and `SteerZone` (`src/ui/driving_controls/`), `ControlSettingsRows` (pause menu).
**How it connects.**
- `PlayerRig._physics_process` turns touch, pad and keys into one `PlayerInput` through
  `MoveState`, `LookState` and `body.press_jump()`; `PlayerController` keeps the `JumpState`.
- `DriveInput.read` merges keys, triggers and the stick into `Driving` (`gas`, `brake`,
  `gas_amount`, `brake_amount`, `steer`); `Driving.reverse_on_hold` (on in `PlayWiring`) runs
  `ReverseHold` and sets the gearbox with `Gearbox.set_now`.
- **Anything that wants the ACTION button** registers a source on
  `rig.controls.action_context` (see the class comment of `ActionContext`): TALK, PICK UP, HAND
  OVER and ENTER have no interaction in the game yet, so only `DrivingWiring`'s GET IN is
  registered. Use `ActionContext.P_*` priorities.
- **Title agent**: read `ControlsGuide.rows(ControlsGuide.ON_FOOT or DRIVING, device, settings)`.
- **A new scheme or button**: a key in `ControlsLayout`, a button in the controls that reads it, a
  row in `ControlsGuide`; `ControlSettings.SCHEMES` lists the schemes.
**Changed on purpose** (existing tests): `test_touch_layout.gd` prints ACTION and JUMP (no RUN);
`test_driving_controls_layout.gd` is rewritten for the zone, no chips and no GET IN;
`test_game_vehicles.gd` boards with the ACTION button instead of the GET IN control. Removed:
`SteerPad`, the `gear_*` actions, `DrivingControls.gears/get_in/set_gears/set_get_in`,
`TouchControls.run`.
**Not done / weak.** Tilt and buttons schemes; combat buttons; kerb haptics. Only a phone can say
whether 70 units is the right slide, whether the 0.65 top-speed factor is right, how the glide
and the ACTION button size feel, and how the buttons sit under real thumbs. A real gamepad was not
available: pad support is tested with synthetic events. The 640x320 worst case holds medium
buttons at 48 px; small is under that there.
Screenshots: `tests/tools/controls_shots.gd` (shots foot, near, driving, reverse, lefty,
lefty_drive, pad, settings) into a scratch folder.


**Addendum (malls).** 16 shopping complexes and two market entries added (100 landmarks: A 18, B 72,
C 10). Game code must read `sign` and `names`, never `research_name`. Storeys come from OSM levels
where tagged (seven of sixteen); architecture notes are sourced for three only, the rest `unverified`.

## Title screen (G-160 to G-165, agent/godot-title), 24 Nov 2026
**Where things are.** `src/ui/title_menu/` (`TitleMenu` the page and rows, `TitleRow`, `TitleFonts`,
`ControlsGuide`), `src/app/title_wiring/` (`TitleWiring` camera, chip, rain layers, lightning;
`TitleSpots` the three places; `TitlePlace` real names), fonts in `assets/fonts/title/`,
`tests/scene/test_title_screen.gd`, `test_title_wiring.gd`, `tests/unit/test_title_places.gd`,
the screenshot tool `tests/tools/title_shots.gd`. `Main` gained `title_summary()`, `title_wiring`,
`title_tour`, `title_seed`, `title_spot`.

**How other agents call it.**
- Another controls scheme: change `ControlsGuide.groups()` only; the CONTROLS page and its test follow.
- A new setting: add it in `Main._add_pause_menu` (one loop feeds the pause menu and SETTINGS).
- Tests that boot `Main` and press play are unaffected: headless runs keep `title_tour` off, so
  streaming stays on the player. A test of the tour sets `main.title_tour = true` (and
  `title_spot`) before adding `Main` to the tree (see `test_title_wiring.gd`).
- Screenshots: `HOME=<scratch> xvfb-run ... --script res://tests/tools/title_shots.gd -- --spot=central --hour=21.5 --rain=1 --storm=1 --save=1 --page=controls --out=...`
  (HOME keeps the save file out of the real one; `--custom=x,z,heading,distance,height` tries a spot).

**Measured (container, Godot 4.7.2, Compatibility under xvfb, software GL: only counts and script
time mean anything).** The title's own script work per frame: about 150 µs on average, 230 µs at most
(`TitleWiring.stats`). Draw calls at T. Nagar and Central with the title over them: about 170 dry; the two
extra rain layers add 2 while it rains and 5k triangles (the camera's own rain adds one more); see
G-165. Boot to title now also waits for the spot's streets (about 4 s longer in the test run).

**Weak or not done.** Not seen on a phone. Morning and noon are blown out by the existing lighting
(white walls and sand at Marina), night is nearly black (`Lighting`; the title adds no light of
its own). No splash rings or ripples, no mist bands, no radial vignette, no thunder or rain sound
(sound is suspended on the title). "Central" resolves to the district name "Evening Bazaar"
(the data has no Chennai Central landmark). CONTINUE and NEW GAME wait for the player's streets
to load after a tour (a loading screen of one step); NEW GAME has no confirmation (as before).
Screenshots of the title at the three spots show the existing renderer's look, not a design pass
on the world.

**Loading screen (G-166).** Restyled with the title: `src/ui/loading_screen/loading_screen.gd`, tests
`tests/scene/test_loading_screen.gd` and the loading cases in `test_ui_layout.gd`, screenshots with
`tests/tools/loading_shots.gd -- --state=mid|failed|slow`. Tamil step lines need native review
(listed in `LoadingScreen.TAMIL`). Not seen on a phone; it adds no animation, so the Adreno 613
failure of the old animated screen should not return, but that is untested there.


## Landmarks (agent/godot-landmarks), 24 Nov 2026
Decisions G-180…G-188; how-to and every reference with its licence in `docs/landmarks.md`.

**Done.** Ranking (`cli landmarks-rank` → `data/landmarks/candidates.json`, `COVERAGE.md`: 2,341
candidates in the world, 396 with Wikidata, 401 with Wikipedia, 1,392 with a footprint). Specs
in `assets/landmarks/<id>/spec.json` (OSM part filled by `cli landmark-osm`), Blender kits in
`tools/blender/landmarks/` (`build_all.sh` builds twice, checks the bytes, runs the tests), game
side `LandmarkSpec` + `LandmarkModels` (worker loading, OSM origin, LOD ranges, Jolt boxes,
real-name signs) and the building filter in `ChunkBuilder`. Six landmarks: Kapaleeshwarar
Temple (east and west gopurams, striped compound wall, shrines, mandapams on the OSM buildings,
flagstaff, tank steps and mandapam), Ripon Building, Chennai Central (with the Tamil/English
roof sign), Chennai Egmore (with the train shed), Anna Nagar Tower (ported), Chennai Lighthouse.

| Landmark | LOD0 / LOD1 / LOD2 triangles | Boxes | Height model / spec |
|---|---|---|---|
| Kapaleeshwarar Temple | 14,561 / 5,998 / 1,696 | 73 | 37 m (east gopuram) |
| Ripon Building | 6,463 / 793 / 405 | 14 | 43 m |
| Chennai Central | 5,411 / 659 / 263 | 7 | 41.5 m |
| Chennai Egmore | 8,792 / 1,942 / 374 | 84 | 24 m (estimated) |
| Anna Nagar Tower | 5,459 / 1,535 / 543 | 6 | 41 m |
| Chennai Lighthouse | 5,369 / 1,739 / 411 | 4 | 45.72 m (OSM tag) |
| Shopping complex, Royapettah (generic, G-189) | 5,068 / 982 / 653 | 28 | 29.6 m (estimated) |

**Measured** (this shared 4-core box, xvfb + llvmpipe, Compatibility, 915x412, `city_shot.gd
--frames=180`, two runs each; `--no-landmarks` leaves the OSM buildings in place). Temple from
above (NE, 85 m back, 22 m up): with landmarks 52 draw calls, 148.0k primitives, frame 130.5 /
132.4 ms average; without 50 draw calls, 125.3k primitives, 117.0 / 119.5 ms. Sannadhi Street at
eye level: with 46 draw calls, 131.3k primitives, 124.4 / 111.7 ms; without 44, 108.6k, 125.2 /
106.9 ms. Software rendering, so the milliseconds only compare runs; the cost is one draw call
per visible landmark and about 23k primitives at the temple. Main-thread maximum while filling
stayed at 0.2 ms (models load on the worker).

**Weak or not done.**
- Few reference photos were actually seen: Commons thumbnails were rate-limited (shared with the
  coordinator). Central follows a real photo; the gopuram, Ripon and Egmore follow published
  descriptions and general knowledge of the styles; tier counts, colours and many heights are
  estimated (each spec's `estimated`). Facts were checked through search summaries; Wikipedia and
  Wikidata cannot be fetched from this container.
- Chennai Central's heritage building is not mapped in OSM; the model stands on the frontage
  way's rectangle. Ripon's OSM outline (68 x 20 m) is smaller than the published 85 x 32 m.
- The committed world was not rebuilt with the landmark outlines (the game filters at run time).
- Kapaleeshwarar's tank steps sit inside the water polygon above the 0.75 m sunk water; the bund
  and barrier still close the tank (no walking the steps yet, culture note §3 visit not built).
- The mall kit makes a generic block (one mall from the godot-areas shortlist so far; its shortlist file is not merged here, the spec copies the OSM id); no interiors; no night lighting on landmarks; GLBs carry float vertex
  colours (0.2–1.5 MB each, 4.6 MB in all).
- `scene/test_city_streaming.gd::test_main_thread_budget_under_cpu_load` failed once in the full
  local run (wall-clock, load-sensitive on this shared machine; not touched).
- Seen only under the Compatibility renderer on llvmpipe; not on a phone.

**Addendum (malls).** 16 shopping complexes and two market entries added (100 landmarks: A 18, B 72,
C 10). Game code must read `sign` and `names`, never `research_name`. Storeys come from OSM levels
where tagged (seven of sixteen); architecture notes are sourced for three only, the rest `unverified`.



## Poses: seated, passengers, falls, arm swing (agent/godot-anim, G-260…G-269), 24 Nov 2026
**Knockdown API (for `agent/godot-crash`; stable, committed first).** Both figures of a person
have the same four methods and one signal: `HumanFigure` (the player, fare passengers) and
`PersonView` (walkers, crowds, drivers from `PeoplePool`). The figure animates on its own node
only (procedural tumble, crumple, lying and get-up poses on the skeleton, no physics bodies);
whoever moves the body (`CrashFlight` through `RiderLink`, or the AI for a walker) keeps
moving the node as before, and the figure never moves its own origin.

```gdscript
## Knocked off the feet with `velocity` (m/s, scene space: the launch or the hit's push). Tumbles
## while airborne; lands by itself after the ballistic time of velocity.y (at least 0.35 s)
## unless play_landed() comes first. Calling it again while down restarts the fall.
func play_fall(velocity: Vector3) -> void
## The body touched the ground (optional; CrashFlight's landing): crumple, then lie still.
func play_landed() -> void
## Stand up from lying (or from wherever the fall is: it lands first). Takes GETUP_TIME seconds
## of game time, then emits got_up and the normal clips (gait, seated) take over again.
func play_getup() -> void
## &"" upright (normal clips), &"falling", &"down" (crumpling or lying), &"rising".
func knockdown_state() -> StringName
signal got_up
const GETUP_TIME := 1.2   # CrashFlight.RISE_TIME is 1.2 too (was 0.75; changed on this branch)
```

`PlayerRiderLink` already calls them from `CrashFlight`'s phases (flying → `play_fall(launch)`,
sliding → `play_landed()`, rising → `play_getup()`), so a bike throw through `Driving` needs
nothing more. The figure lies on its back, head away from the way it flew, soles and head
above the ground. The figures advance in the physics step (`HumanFigure.advance`,
`PersonView.advance`): a figure that is not advanced does not animate its fall either.

**Done (owner's phone report, 24 Nov).** All poses are procedural on the skeleton after the clip
(`src/player/poses/`: `PoseRig`, `SeatPose`, `Knockdown` + `KnockdownPoses`, `GaitSwing`),
shared by `HumanFigure` and `PersonView`. Decisions G-260…G-267.
- **Drivers seated** in car, auto, bike, bus (and every other vehicle): hip joints on the seat,
  palms on the grips (fingers closed), ankles on the footrests or pedals, torso leaning as the
  ride pose says, head turning into the steering; hands follow the turning handlebar or wheel
  (the model's `steering` node now turns). The ride pose's hand, foot and hub are measured from
  the model's own `grip_r`/`foot_r`/`steering`/`seat_driver` nodes (`VehicleModel.
  measure_ride_pose`); the driver is drawn in closed vehicles too. Traffic drivers take the same
  seat (`CityLife.driver_seat`, `RidePoses`).
- **Seat anchors** (driver, aisle, passenger doors and seats) are measured from the model's drawn
  ground (`VehicleManifest.apply_geometry`): from `chassis_to_model_y` every rider sank 7–10 cm
  into the seat (G-267). Collision boxes are unchanged.
- **Passengers seated and visible** in their own seat slots (`VehicleType.seats`, the model's
  passenger seats in order) in auto, car and bus; they sit down while entering and stand up
  while getting out (`FareFigures`).
- **Falls**: dive and roll three quarters of a turn, land on the back (or a push falls
  backwards), crumple, lie with one knee up and the head turned; get up through sitting, a
  crouch and one knee into the clip (1.2 s; `CrashFlight.RISE_TIME` raised from 0.75 to match).
- **Walk**: arms swing with the opposite leg (hands 0.47 m fore and aft, was 0.07), shoulders
  turn against the hips, small head nod, for the player and every street walker. **Run**: 15°
  lean, elbows ~90°, cadence 4.6 → 4.2 m/s per clip speed (~186 steps/min at 6.2 m/s), and walk
  blends into run by speed (2.6–4.0 m/s) on one normalised stride cycle.
- Tests: `tests/scene/test_poses.gd` (drivers, steering, passengers, swing, run, blend),
  `tests/scene/test_knockdown.gd` (API on both figures, a real bike crash). Screenshots:
  `tests/tools/pose_shots.gd` (into a scratch folder).

**Weak or not done.**
- Share-auto passengers face forwards (their seats face inwards; `facing` is not read yet).
- No prone pose: every fall ends on the back; a hit from behind dives and rolls to get there.
- The get-up's feet move fast in the crouch (about 0.1 m per frame at 60 fps); 1.2 s is short.
- The palms' facing on a steering wheel is not controlled (only position and finger curl).
- Seen only under the Compatibility renderer on llvmpipe, not on a phone.

## APK size diet (branch `agent/godot-sizediet`), 24 Nov 2026
**Done.** `docs/app-size.md` has the method, the breakdown, the diet with before and after, the
budget, the forecast and the Play plan. APK (release, arm64, local unsigned) 162.68 to 115.00 MB:
legacy cast and vehicles, `docs/` and the v1 chunks are no longer exported (the files stay in the
repository, the sync check is green). CI budget step (`APK_BUDGET_MB: 260`) and
`tools/apk_size_report.sh <apk>`. Size guards in `tests/unit/test_export_size.gd` and
`test_asset_budget.gd`.

**For other agents.**
- A new file under `assets/people/legacy` or `assets/vehicles/legacy` (sync tool) fails
  `test_export_size.gd` until it is added to `exclude_filter` in both presets.
- New textures of 256 x 256 or more must stay VRAM compressed; a WAV over 200 KB must be Ogg.
- The cast is the biggest line of the forecast (0.82 MB per person, 0.1 MB of it the five
  animations every GLB repeats): a shared animation library is the next real saving (cast agent).
- Non-resource data (`.bin`, `.json`) only ships if `include_filter` lists it: a new data folder
  needs a pattern in both presets.

**Weak or not done.** CI: phone APK 115.13 MB, smoke APK 119.73 MB (run 45381255694, all green). No `.aab`, no asset packs, no custom
template. Generated LODs, tangents and the world tile format were measured, not changed.


## Take over (branch `agent/godot-take`, 24 Nov 2026)
**Done.** The carjacking was never added to the game; now `Main` wires `Carjacking` to the life
layer and the ACTION button (G-300). TAKE OVER is offered beside a moving or stopped car, auto or
bike; pressed, the driver is pulled out through the boarding's pull phase, the player gets in on
the right and drives, the driver staggers and runs off. Tests: `scene/test_city_life.gd`
(moving car, moving bike, bus refused, refused while boarding, adults-only drivers, bookkeeping
and freeing a vehicle left far behind), `scene/test_game_vehicles.gd` (end to end in `Main`),
`unit/rules/test_carjack.gd`.

**Weak or not done.**
- No `Wanted` instance exists in the game, so there is no heat yet: hook `Carjacking.wanted`.
- The pulled driver's fall is a lean while staggering (no fall clip); the moving vehicle stops
  dead at the press instead of braking.
- Seen headless only; not on a phone, no screenshots (nothing new is drawn).
