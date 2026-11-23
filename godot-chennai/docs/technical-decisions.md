# Technical decisions (Godot version)

Numbering: G-1 … G-9 come from the foundation (phase 0); G-10 … G-19 are the cast's (people,
Blender scripts); later work continues after the highest number in use. The Three.js game's
decisions (TD-n in `chennai-open-world/docs/technical-decisions.md`) still hold where an entry
below says so.

## G-1: Godot 4.7.2, Mobile renderer, landscape, typed GDScript
**Decision (23 Nov 2026).** The project is pinned to Godot **4.7.2 stable** (`config/features`
"4.7", CI downloads exactly 4.7.2 and checks its SHA-512). Renderer **Mobile**
(`rendering_method` and `rendering_method.mobile`), with `rendering_device/fallback_to_opengl3`
so a phone or emulator without usable Vulkan starts on the Compatibility renderer instead of
failing. Screenshots here are taken with Compatibility under xvfb (software Vulkan draws skinned
meshes black); judge Mobile on the emulator and the owner's phone. Orientation sensor landscape;
UI base size 915×412 (a small phone in dp) with `canvas_items` stretch and `expand`, so 1830×824
is the same layout at 2× and 640×320 gives the UI 915×458. Touch is emulated from the mouse on
desktop. Physics is **Jolt** (G-2). GDScript is typed: `untyped_declaration`,
`unsafe_property_access` and `unsafe_method_access` are errors, `unsafe_call_argument` and
`unsafe_cast` warnings; the test runner compiles every script first, so an untyped line fails
CI. Textures inside glTF files are embedded as Basis Universal
(`[importer_defaults] gltf/embedded_image_handling=2`) so importing writes nothing next to the
synced sources; Android imports ETC2/ASTC.

## G-2: Fixed 60 Hz game time (TD-6 carried over)
Physics and gameplay step at 60 Hz with at most 5 steps per rendered frame (the Three.js
`GameLoop`). The autoload **`GameLoop`** (`src/game_engine/game_loop.gd`) counts physics frames
and game seconds (both stop while the tree is paused), advances the time of day (`GameClock`,
port of `clock.ts` with its test) and offers `wait_physics_frames(n)` and
`wait_game_seconds(s)`. Tests and gameplay wait in game time, never on the wall clock (the
Three.js lesson: a 40 s wall-clock wait failed on a slow runner). Only two autoloads exist:
`GameLoop` and `WorldOrigin` (G-7).

## G-3: Data and assets are copied byte for byte and committed
`tools/sync_from_threejs.py` copies the world files (`apps/game/public/world/`), the 37 people
(LOD0 + LOD1) with `people.json` and `player.glb`, `locomotion.glb`, vehicles, props and fonts
from `chennai-open-world/` into `assets/`, and writes their licence rows between markers in
`assets/LICENSES.md`. It never edits a file: the Three.js game stays the source until parity.
**Committed, not generated in CI**, because Git stores identical bytes once: the 1,979 copies
(about 68 MB on disk, 5 MB of it the world) add almost nothing to the repository, and the
Godot project then builds from its own folder. CI runs `sync_from_threejs.py --check`, which
fails when a copy drifts from its source or the licence rows are stale. The old cast goes to
`assets/people/legacy/` so the new cast (G-10+) has `assets/people/` to itself. The APK
exports all resources (about 50 MB of data today, mostly the legacy cast); a later phase may
exclude what the game no longer uses.

## G-4: The world reader is a port of `codec.ts`, versioned
`src/game_world/` reads today's files directly (no converter): `WorldCodec` (chunk and roads
decoders, a bounds-checked little-endian reader), `WorldIndex` (`index.json`), `WorldFiles`
(file access), and plain-data classes `Road`, `RoadNetwork`, `Building`, `ChunkData`,
`WorldTree` (Godot has a `Tree` control), `WorldArea`, `Landmark`, `Place`, `WorldSea`.
Every decoder checks the magic number and the **format version** first
(`WorldCodec.SUPPORTED_FORMATS`, today `[1]`) and refuses others with a message to rebuild the
world, so codec v2 (archetypes, height source, provenance) is a new branch, not a rewrite.
Errors are an `error` field on the result (GDScript has no exceptions); a truncated or foreign
file never crashes. Points are `Vector2(x, z)` in metres (float32: about 1 mm at 12 km, 8 mm at
85 km, below the files' 5 cm quantum). Chunk points are rounded like the TS decoder
(`Math.round(v*100)/100`). The decoders are pure functions safe on worker threads; chunks carry
their `centre` as a local origin for meshes. Tests compare against values from the TS decoder
run on the same files (roads 20,625; buildings 106,619; trees 44,541; areas 1,059; exact
outlines, ids, names, heights).

## G-5: Same structure, formats, coordinates and flow as the Three.js game (owner, 23 Nov 2026)
`src/` mirrors the Three.js packages with the same names and boundaries: `game_engine`,
`game_world`, `map_data`, `physics`, `player`, `vehicles`, `ai`, `combat`, `missions`, `rail`,
`audio`, `ui`, plus `src/app/` as the composition root (`main.tscn`/`main.gd`, like `Game.ts`:
wires systems, no gameplay logic). The package table in `AGENTS.md` keeps the old "may import"
rules. Folders inside a module follow `godot-project-organization` (one thing, one folder,
scene and script with the same snake_case name). Same data formats, 250 m chunks, TD-2
coordinates and scale: +X east, -Z north, metres, so world (x, z) is `Vector3(x, y, z)` in
Godot (whose forward is -Z, north). Same flow: loading screen → title menu → play.
**Bounds and the chunk grid always come from the data** (`index.json`), never from constants:
the world will grow to Chengalpattu–Pulicat (about 85 × 40 km, owner 23 Nov 2026), and a test
parses a 45 × 90 km index to prove nothing assumes today's box.

## G-6: The game reads the world through `WorldSource`
`WorldSource` (abstract, `src/game_world/world_source.gd`) is the only way systems reach world
data: bounds, chunk size, geographic origin, attribution, `chunks_near`, `read_chunk`,
`roads_near`, `loaded_roads`, `index_at`. `FileWorldSource` implements it for today's files
(one index, one roads file read at start, chunks on demand). A regional source (for example
10 km tiles, each with its own chunk table and roads, loaded as the player moves) implements the
same interface; all tiles share one global chunk grid so `(col, row)` means one square
everywhere. Blocking calls are made on worker threads (`BackgroundTask`), and return plain data
that the main thread adds to the scene in small steps (the loading and streaming lessons of
TD-25 and the ride-stutter fix).

## G-7: Floating origin
World data stays in world metres from the one fixed geographic origin (`index.json` `origin`).
The autoload `WorldOrigin` holds the world point at the scene's zero as two 64-bit floats and
converts (`to_scene`, `to_world`). When the focus is more than 2 km from the scene's zero,
`follow()` recentres: every node in the group `origin_shifted` moves by the same offset and the
`shifted` signal tells systems with positions of their own. Physics, camera and GPU then always
work near zero in float32, however far the 85 km world reaches. Wave 2 puts streamed chunks,
the player and vehicles in that group and calls `follow()` from the player's step.

## G-8: A small custom test runner, not GUT
`tests/test_runner.gd` (a `SceneTree` script, ~110 lines) compiles every script under `src/`
and `tests/`, runs every `test_*` method of every `tests/**/test_*.gd` (`TestCase`
subclasses), counts assertions and failures and exits 1 on any failure, broken script or empty
run; `run_tests.sh` imports first, adds a timeout and also fails on any `SCRIPT ERROR` in the
log. Why not GUT: an add-on of thousands of lines to vendor, update and licence for what we need
(asserts, awaits, game-time waits, exit codes), and the skill's pattern is enough. Tests return
`true` on their last line so a test that dies on a runtime error is counted as failed, may
`await`, wait in game time (`wait_physics_frames`, `wait_game_seconds`, `wait_until(cond,
max_frames)`), and put nodes under `root` (freed after each test). Checked that a broken
assertion makes the run exit 1.

## G-9: CI, Android export and the emulator smoke
`.github/workflows/godot-chennai.yml` (paths `godot-chennai/**` and itself): **test** (install
Godot 4.7.2 with checksum, cached; `sync --check`; import with `.godot` cached by asset hash;
`run_tests.sh`), **android** (JDK 17, Android templates only from the 4.7.2 archive, cached; a
debug keystore generated in the job and passed through `GODOT_ANDROID_KEYSTORE_*`; exports the
`Android` preset (arm64-v8a, release, signed with that debug key: for testing, not the store)
as artifact `godot-chennai-apk`, and the `Android Smoke` preset (x86_64, debug, launch argument
`--start=play`) for the emulator; prints the APKs' SDK levels), **android-smoke** (API 34
x86_64 emulator, `tools/android_smoke.sh`: install, launch, wait for the `[boot] play` line the
main scene prints to logcat, press ENTER if the title menu shows instead, fail on
`[boot] failed`, a crash of this app or a timeout, then check it still runs 10 s later). The smoke APK starts on the **Compatibility renderer** by itself (launch
arguments `--rendering-method gl_compatibility --rendering-driver opengl3` in the smoke preset):
on the runner the emulator's SwiftShader Vulkan failed to present and Godot's main loop stopped
after the first step, and with guest Vulkan turned off Godot's own Vulkan-to-OpenGL switch
started the app once and lost it on the next run. The Mobile renderer is judged on real phones.
While loading, a watchdog thread prints `[boot] no frame for N s` if the main loop stalls, so a
device log never goes silent. No
Gradle build: Godot's prebuilt template, so the minimum SDK is the template's: API 24
(Android 7.0), target 36 (printed by CI). Package `com.chennaiopenworld.godot`, so it installs beside the Three.js app.


<!-- Data agent section: G-20 to G-29. Other agents append their own ranges. -->

## Data: world tools and format 2 (G-20 to G-29)

## G-20: Build-time world tools in Python, `tools/geo/`
The world is built on a build machine by `tools/geo/chennai_geo` (Python 3.11+, typed): pyosmium
for reading OSM (with multipolygon assembly), the `osmium` CLI for the clip, Shapely 2 for
clipping, repair and boundaries, PyProj only for fusion matching. Versions pinned in
`tools/geo/requirements.txt`; the venv lives outside the repo (`/opt/tools/geo-venv`).
`tools/geo/run_tests.sh` runs pytest with no network (committed fixtures and committed world
files only). The old TS pipeline (`scripts/build-world.ts`) is not called: its rules were ported
line for line instead, so one tool owns OSM → world, and the port is checked against it (G-27).
Why not keep TS: multipolygons, repair, fusion and rasters need GEOS/PROJ, which Python has.

## G-21: One projection, the game's
Every coordinate goes through a port of `GeoProjection` (equirectangular at Anna Nagar,
R = 6,371,008.8 m, +X east, -Z north; TD-2), never UTM or another CRS. The port agrees with the
TS file to 1 cm on 12 reference points from Chengalpattu to the state border
(`tests/fixtures/projection_reference.json`, produced by node from `projection.ts`). UTM 44N is
used only inside fusion to measure overlaps in m²; results go back through `GeoProjection`. The
equirectangular scale error at 50 km from the origin (about 0.4 % north-south distance
distortion near the edges, estimate) is accepted: it's a game, and data stay consistent.

## G-22: The world boundary comes from OSM and is committed
Box 79.95–80.40 E, 12.68–13.60 N ∩ the OSM Tamil Nadu polygon (admin_level 4), plus the sea
east of the coast south of where the border meets it (13.5639 N; north of that the water is
Andhra Pradesh's). Derived once (`cli.py boundary`) and committed as
`data/boundary/world-boundary.geojson` (6 KB, simplified to about 2 m) so builds and tests don't
need the PBF. The northern edge is the state border (13.42–13.56 N depending on longitude), not a
straight line. About 4,500 km² including the sea strip.

## G-23: Global 250 m grid aligned with today's chunks; 10 km region tiles
Chunk (0, 0) sits at (-28365, -57341): today's grid origin moved by whole chunks, so today's
chunk (c, r) is (c + 107, r + 225) with the same centre and identical quantised bytes. Region
tile = 40 × 40 chunks (10 km), `(floor(col/40), floor(row/40))`; 47 tiles have content. A tile
has its own chunk table, road pieces and points, so nothing city-sized is always loaded (today's
single index and roads file would be about 30–50 MB at this size). Roads are cut into pieces at
tile edges (segment midpoint rule, as `roadSpansByChunk`), pieces share end points and carry
`offset`/`total` so dashes stay in step. Matches Foundation's G-6 ("all tiles share one global
chunk grid").

## G-24: Rings are nested boxes ∩ the boundary; ring 0 is today's exact rectangle
Four rings (today's box; city with the airport; suburbs and corridors; rural edges). A chunk is
labelled with the smallest ring overlapping it; a build has `--max-ring`. Ring 0 uses today's
bounds exactly (x -1615..8633, z -1091..11655) and the same "inside" tests, so a ring-0 build is
today's world. The game can stream or gate by ring (load only `ring <= unlocked`).

## G-25: Format 2 files: `world.json` + per tile `tile.json`, `chunks.bin`, `roads.bin`, `areas.bin`
Versioned (`u16 2` after the same magics; readers refuse other versions). Chunk records keep
today's content and add: per building provenance and merged ids, `minHeight`, `use`, archetype
placeholder, roof shape and levels, flags, holes; per area provenance, 23 kinds and holes; a
section list for future data without a format bump. Roads keep class, bridge, tunnel, layer,
surface, sidewalk, maxspeed, width source, ref, lit. Chunks are **packed per tile** (one
`chunks.bin` with an offset table in the file and in `tile.json`): 190 files instead of about
33,000, cheaper for git, the APK and Android storage, and one seek per chunk. Enum tables are
append-only and pinned by a test. Byte layouts: `docs/world-format.md`.

## G-26: Ids and provenance
The u32 game id is kept (it seeds colour and estimated floors exactly like today): way id for
way buildings (build fails at 2^31), `0x80000000 | relation << 3 | part` for multipolygon parts,
`0x40000000+` for fused new buildings. Provenance is `(u8 dataset, u64 id)` per building, area
and road (node ids already exceed 2^32), plus a list of absorbed ids; non-numeric ids (Overture
GERS, plus codes) are indexes into a per-world id table. Tests check provenance survives build,
write, read and fusion.

## G-27: Ring 0 must reproduce today; v2 changes are explicit
`codec_v1.py` (port of `codec.ts`) re-encodes all 1,877 of today's chunks and `roads.bin` byte for
byte. The builder with `v2=False` applies today's rules only; on 23 Nov data it gives 106,622
buildings vs 106,619, 20,724 road pieces vs 20,625, 44,570 trees vs 44,541, equal bus stops,
signals, districts and landmarks (one week of OSM edits apart). The committed world is held to
1 % (buildings, points, height mix) and 2 % (roads, trees) of today's files by a test. What v2
changes on purpose: multipolygon buildings and areas (+364 buildings in ring 0), invalid
footprints repaired with `make_valid` (largest part kept) or dropped and counted, more road
classes (motorway, track, raceway, steps…) and area kinds, the airport, landmarks limited to a
`near` circle (in 4,500 km² another "Kapali…" temple could match first). Slivers stay at today's
12 m² (not the blueprint's 6 m²) so counts stay comparable.

## G-28: Fusion is a separate, tested step with fixed rules (phase 2)
`fusion.py`: STRtree candidates, IoU ≥ 0.5 or containment ≥ 0.8 = same building, small ML
footprints inside one OSM footprint are absorbed, unmatched ones become new buildings labelled by
dataset. Height priority OSM `height` > `levels` > Overture height/floors > Open Buildings median >
estimate; never relabel a non-OSM height as measured. Interfaces (`FootprintSource`,
`HeightRaster`) so the real readers (DuckDB/GeoParquet, a GeoTIFF) drop in; tested on hand-made
fixtures only, nothing downloaded (hosts not allowed yet). It matters: OSM has only 15,345
buildings in rings 2–3 (whole villages are unmapped), and 97.8 % of heights are estimated.

## G-29: The whole world is committed (37.5 MB); rebuilt from a manifest
All four rings come to 37.5 MB in 190 files (ring-0 chunks 5.5 MB, ring 1 14.0 MB, ring 2 2.1
MB, ring 3 0.9 MB, tile files 13.3 MB), under the 150 MB line, so the full world is committed in
`godot-chennai/world/` and no CI step is needed to play it. The PBF, its clip and the venv are
never committed (`data/raw/` is ignored); `data/MANIFEST.json` records URL, size, sha256 and OSM
timestamp. Each refresh rewrites most files (about 37 MB of history per refresh): refresh
deliberately (per milestone, not per commit); move `world/` to Git LFS or a release artefact if
refreshes become frequent or fusion grows it past about 100 MB. Format 2 is about 1.4× today's
bytes for the same box (7.4 MB vs 5.2 MB), mostly provenance (9–18 bytes per building).

## Player: on foot, figure, camera, touch controls (G-60 to G-69)

## G-60: The player on foot is a kinematic cylinder at the fixed step (TD-6)
`PlayerController` (`src/player/player_controller.gd`) is a `CharacterBody3D` moved with
`move_and_slide` in `_physics_process` at 60 Hz (G-2). The movement rules are the Three.js
`PlayerController`'s, unchanged: walk 2.4 m/s, run 6.2 m/s (× `run_scale`), the stick runs past
82% of its travel, speed eases towards the stick at 10/s (35% of that in the air), gravity
24 m/s², jump 7.2 m/s (apex 1.08 m), fall capped at 40 m/s, turning 12 rad/s towards the travel,
movement relative to the camera's yaw. The Rapier character settings carry over: steps and kerbs
up to 0.35 m are climbed (`_step_up`: up, across, down onto a walkable top), floor snap 0.3 m,
slopes up to 50°. The body is an upright **cylinder** 1.75 m × 0.32 m, not a capsule: its flat
base can stand on a kerb's edge once lifted over it, while a capsule's round base slid back off
a 15 cm kerb in Jolt. It reads a `PlayerInput` (stick, jump, run, camera yaw) and knows no
device, so tests, touch, keys and later AI or cutscenes drive it the same way.

**Hooks.** Vehicles: `enter_vehicle(vehicle, seat)` turns collision off and makes the body
follow the seat node each step; `exit_vehicle(feet, yaw)` puts the player back on foot; signals
`entered_vehicle`, `exited_vehicle`. Combat: `knock(push)`, `facing()`, `figure`,
`controls_enabled`; signals `jumped`, `landed`.

## G-61: Locomotion retargeted in Godot at load, on plain data
The Mixamo clips (T-pose, `locomotion.glb`, only rotation tracks on a hierarchy of joint nodes)
are retargeted to each MPFB character (A-pose Skeleton3D) by `Retarget.run`, a port of the
Three.js `retarget.ts`: each bone's model-space rotation away from rest on the source, applied to
the target's rest; limbs first turned to point the way the source's do; **hands aligned by their
whole frame** (along the middle finger and across the knuckles) and each finger joint after the
joint above, so no wrist bends in (§7). Bones are matched by plain name (`BoneNames.plain`:
`mixamorig:X`, `mixamorig_X` (Godot's import), `mixamorigX` → `X`); the skeleton keeps its own
names in the track paths. It works on plain data (`RigData` read from the Skeleton3D or the
joint nodes on the main thread), so it runs on a worker thread (`BackgroundTask`): about 0.25 s
for the player on a desktop. Results are cached per skeleton (`LocomotionClips`), as the Three.js
`clipCache`. Not baked to files: new cast members need no extra step, and the cost is once per
skeleton in a loading screen. Clips play in an `AnimationTree` (blend tree: three clips, a
`TimeScale` each, two `Blend2`) advanced manually in the physics step, so the post-steps below
see the pose of this step and tests are deterministic.

## G-62: Soles planted per clip and every step, measured on the mesh
At retargeting, each frame's hips are raised or lowered so the lowest **sole vertex** stays at
its rest height (`SoleSet`: vertices bound mostly to a foot bone, the lower 45% of the feet, CPU
skinned with their bind poses: all 3,002 of the player's sole vertices, not a sample, the
Three.js lesson of a 7 cm sink). At run time (`HumanFigure`, the player: `plants_feet`; everyone
else only during a gait blend) the hips are moved every step so the lowest sole is exactly on
the ground, both ways, which also holds through the 0.22 s blends (8.5 cm sink in Three.js).
Only candidates are skinned per step: the 4 lowest of each baked frame plus the support points
of each foot part in 200 directions (a foot part turns almost rigidly, so its lowest point is
one of them); tests measure every foot vertex. After the clips, each upper arm is turned in
(9° idle, 8° walk, 10° run by gait weight, never below 4° out), as `armSettle.ts`. MPFB's
black vertex-colour channel is never used as albedo.

## G-63: The player's model comes from a people manifest
`PeopleManifest` reads the `people.json` schema (`{"people": [{"id", "file", "heightM", ...}]}`)
shared by the legacy cast and the new cast; files resolve beside the manifest (the legacy
`people/x.glb` resolves to `x.glb`). `PlayerRig.load_figure(manifest, id)` draws any person as
the player (any rig whose bones have the Mixamo names); with none, the default is the Three.js
`player.glb`, scaled to 1.75 m. The figure faces -Z (the model is turned round; glTF faces +Z).

## G-64: Physics layers
Layer 1 world (ground, buildings, kerbs, poles), 2 player, 3 people, 4 vehicles (bits 1, 2, 4,
8; constants on `PlayerController`). The player scans world, people and vehicles; the camera's
view is blocked by world, people and vehicles, never the player. Systems added later take
these bits; when a shared `src/physics/` module exists the constants move there.

## G-65: Orbit and chase camera that eases round thin obstacles
`FollowCamera` (port of `FollowCamera.ts` plus `chennai-game-design` §5): drag turns yaw and
pitch (0.0055 rad per UI unit, pitch −0.2…1.15); follows the feet + 1.5 m with
`1 − exp(−14·dt)` smoothing (softer height in a vehicle), snapping on the first step and after
8 m jumps; looks ahead along the velocity (0.15 s of travel on foot, 0.3 s in a vehicle, at most
7 m, eased at 2.5/s, held off for 1.5 s after a drag); `chase()` trails the travel direction and
adds up to 1.4 m and 7° at top speed. Collision: a 0.22 m sphere swept from the focus. If the
obstacle is **thin** (the wanted camera place is free and a sweep back from it meets the obstacle
within 0.8 m, as a pole or a person) the camera eases in at 2.5/s instead of snapping and eases
out at 4/s when the view clears; a **wall** (anything thicker, or the wanted place inside
geometry) pulls it in at once. Whatever the easing, a final check never leaves the camera inside
a collider. It runs in the physics step after the player moves (priorities: rig −10, body 0,
camera 100), so following the 60 Hz body cannot jitter at 60 fps. If Foundation later turns on
physics interpolation, the camera should follow `get_global_transform_interpolated()` in
`_process` instead.

## G-66: Touch controls track every finger themselves
`TouchControls` (`src/ui/touch_controls/`, a `CanvasLayer`) handles `InputEventScreenTouch` and
`ScreenDrag` in `_input` by touch index, so the stick, the look drag and a button work at the
same time (Godot's GUI focus is single-pointer). Layout (UI units, 915×412 base): floating stick
(56 radius) where the thumb lands on the left 45%, resting bottom-left; JUMP (80) in the
bottom-right corner lifted clear of the HUD's OSM credit; RUN (70) to its left along the
thumb's arc, 16 apart; the rest of the screen is the look zone. Buttons of 70 or more stay at
least 48 px on a 640×320 screen (scale 0.7). RUN is a switch (a thumb cannot hold it and steer
the camera): tap to run, off when the stick is let go; a full stick runs too. Inside a
`SafeAreaMargin`. The mouse drives the same code through `emulate_touch_from_mouse`.

## G-67: `PlayerRig` is the on-foot unit the composition root adds
`PlayerRig` (Node3D) owns the body, the camera and the touch controls and, each physics step
before the body moves, turns touch and keys into a `PlayerInput`. Keyboard for desktop testing:
WASD/arrows (walk pace), Shift run, Space jump; the actions (`player_*`) are added to the
InputMap at run time when missing, so `project.godot` needs no edit. `reads_devices = false`
hands control to code (tests, cutscenes).

## G-68: The player's test ground until the city lands
`PlayerTestGround` (`src/player/player_test_ground.gd`) adds to Foundation's test world a long
wall and a corner, a 15 cm kerb, a 30 cm step, a 60 cm ledge, two 18 cm street-light poles and
a person-sized post, and a `PlayerRig`. Tests and `tests/tools/player_screenshot.gd` use it;
the World agent's streamed city replaces it in the game.
