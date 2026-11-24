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
