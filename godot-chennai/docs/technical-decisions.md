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
after the first step. The Mobile renderer is judged on real phones.
While loading, a watchdog thread prints `[boot] no frame for N s` if the main loop stalls, so a
device log never goes silent. No
Gradle build: Godot's prebuilt template, so the minimum SDK is the template's: API 24
(Android 7.0), target 36 (printed by CI). Package `com.chennaiopenworld.godot`, so it installs beside the Three.js app.

**Amended 24 Nov 2026: the intermittent smoke failure.** About one emulator run in seven lost
the app a second or two after launch, with no crash. The device log showed the chain, the same
in every failure captured (3 of 3 with the full log): Android's overlay manager changed which
resource overlays are enabled some seconds after boot (events log
`commit_sys_config_file: [overlays,…]`, `idmap2d` starting), which changes every app's asset
paths; the window manager then **relaunched the game's activity**
(`wm_relaunch_resume_activity`, changes `0x80000000` = asset paths, which no `configChanges`
entry can absorb); Godot cannot start twice in one process, so it ended its own process
(`ApplicationExitInfo` reason SIGNALED, signal 9; `Main::start` never finished). Whether it hit
depended only on whether the overlay change landed during the game's first seconds. The
earlier note here that Godot's Vulkan-to-OpenGL switch "lost the app" was this same race.
**Fix** (`tools/android_smoke.sh`): before installing and again before launching, wait (bounded,
with a message for each wait) for boot, the package and activity managers, an unlocked screen,
a landscape display, the install broadcasts, and **the overlay list and the global
configuration unchanged for 20 s**; then follow the game's process id until 10 s after
`[boot] play`. The emulator screen is landscape (`-skin 1280x576`) and ignores orientation
requests, so the game is not rotated as it starts either. On failure the script prints the
exit reason, relaunches and configuration changes, the 4 s of system log before a relaunch,
lifecycle events and the crash buffer. Evidence: without the waits (`smoke_settle=0`) 2/8 and
4/8 parallel runs failed this way; with them 8/8, 8/8 and 7/8 (the eighth failed before the
emulator started: an action download timed out), each with 0 relaunches. The emulator system
image is now cached (one run failed downloading it). Run `workflow_dispatch` with `smoke_runs`
= `1,2,3,4,5,6,7,8` to repeat the check. On a phone the same relaunch would need an overlay or
font change during the game's first seconds: rare, and the game closes rather than hangs;
surviving a relaunch is the engine's limit, not this project's.


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


## Rules (G-40 to G-49, agent/godot-rules)

### G-40: Rules are typed RefCounted GDScript in the old packages' modules, stepped with game time
`src/missions`, `src/combat`, `src/ai`, `src/game_world` (pure helpers only), mirroring
`packages/missions`, `combat`, `ai`, `game-world` (owner's §9 decision). No autoloads, no nodes,
no scenes: every rule takes `dt` in game seconds and, where it needs it, the game hour from an
injected `GameClock` (Foundation's, `GameLoop.clock`); nothing reads the wall clock. **Why:** the TS rules were pure and fully
unit-tested; keeping them pure keeps the tests exact and lets the game wire them freely.

### G-41: Content tables are baked to JSON from the TS game and loaded into typed classes
`tools/rules/export_content.ts` runs the TS `buildContent` on the same world files and writes
`src/missions/content/content.json` (format `chennai-rules-content`, version 1); `GameContent`
loads it into `MissionData`/`JobData`/`EnemySpot`. Not `.tres`: one diffable generated file, no
uid churn, and the numbers are the TS game's to the last digit. **Why not port `content.ts` now:**
it snaps every place to roads, kerbs, POIs and districts, which needs the Data agent's world
reader. **Revisit** when that reader lands: port the placement and the 5 map tests.

### G-42: Runners return events and emit signals
`update()` returns event Dictionaries in the TS shapes (tests compare them like the TS tests);
each is also emitted as a typed signal (`godot-signals-groups`), so HUD, sound and save listen
without references to the runner.

### G-43: One save file keyed by the Three.js game's localStorage keys
`user://chennai-save-v1.json`; top-level keys `cow-progress-v1` ({completed, money, life}),
`cow-jobs-v1`, `cow-weapons-v1`, `cow-districts-v1`, `cow-hour-v1`, `cow-weather-v1`, each with the
JSON the TS game stored, so a save can be imported 1:1. Written to a temporary file and renamed;
a missing or damaged file is a new game. **Why:** the same progress shape was asked for; one file
is one atomic write.

### G-44: Numbers are bit-faithful to the TS rules
Doubles everywhere (positions as `{x, z}` Dictionaries, never 32-bit `Vector2`), `Math.round`
as `floor(x + 0.5)` (`RulesMath.js_round`), stable sorts where TS sorted, and mulberry32 ported
bit for bit (`SeededRandom`, checked against node's output). **Why:** the ported tests assert the
TS numbers; a share auto shift replays the same crowd for the same save.

### G-45: Combat is the TD-27 redesign; TD-25 `Strikes.ts` is superseded
`feat/godot-chennai` has the TD-25 strikes (wind-up and wall-aware knock-back on the old
`Combat`); `agent/combat-redesign` (TD-27) branched before it and does the same jobs with its own
wind-up, stun and knock-back stopped by walls, plus block, dodge, combos and lock-on. Porting both
would give two wind-ups; TD-27 is the newer design the coordinator named. `Combat.hurt` (TD-29) is
added.

### G-46: The wanted level merges TD-28 and TD-30; TD-29 adds no crime
`Wanted` is `agent/police-tuning`'s rules (heat before stars, witnessed stars, police crews) plus
`agent/carjacking`'s `carjacking` crime (3 points, at least a star, every take counts).
`agent/crash-ejection` only adds crash damage (`Combat.hurt`); crashing into things is no crime.

### G-47: TD-28's police crews finished as a pure `PoliceFleet`
In the TS game the crew, abandoned-car and dispatch rules lived in `Police.ts` next to models and
routing, tested only in the browser. `PoliceFleet` holds them as data and rules (crew, out,
abandoned, the abandoned cap and which car makes way, deploy and recall conditions), using
`Wanted.crew_left`/`officers_to_deploy`; the game supplies sight and distances. 8 new tests.

### G-48: The rules tests run in Foundation's runner (G-8)
`tests/unit/rules/test_*.gd` extend `rules_test.gd`, a `TestCase` with the comparison helpers
the ported TS tests need (deep equality with ints equal to floats, `toMatchObject`,
`toBeCloseTo(digits)`). One GDScript case per TS `it`, same numbers. (Before the merge they had
a runner of their own; it was removed once Foundation's existed.)

### G-49: Optional values are sentinels; names are snake_case; event names stay as in TS
`-1`, `""`, `{}` or `null` stand for TS `undefined` (documented per field). Methods and fields are
snake_case (GDScript style); event `type` strings and their keys keep the TS names so the game
logic reads the same as the TS game's.

## Models (G-30 to G-39)

### G-30 Vehicles, aircraft and trains are Blender scripts; the scripts are the source
`tools/blender/vehicles/` holds `vkit.py` (shared kit), `cars.py`, `aircraft.py`, `trains.py`,
`port_road_vehicles.py`, the copied Three.js sources in `road/`, and `build_all.sh`. The GLBs and
manifests in `assets/{vehicles,aircraft,trains}/` are committed outputs. Running the scripts again
rebuilds the same models: nodes, counts and manifests are identical, although a few files differ
by a few bytes from run to run. Every design is original: no real makes, badges, grilles, airline names or
liveries, railway or metro logos, lettering or real numbers (TD-18, brief §11). This follows the
Three.js pipeline (`vehicles.py`, `auto_rickshaw.py`), with its lofted-shell method kept.

### G-31 One frame for every model (TD-2)
Metres, +Y up, front towards -Z, +X right, ground or rail top at y = 0. Cars have their origin
between the axles, aircraft on the ground below the main gear or rotor mast, train cars at
mid-car on the rail top. Moving parts are separate nodes with their origin on the axle, hinge or
pivot. The manifest gives each one's axis and range in the Godot frame. Anchors (seats, grips,
cargo, front marker) are empty nodes.

### G-32 Materials: one palette atlas, a paint material, one livery per type; no vertex colours
Fixed colours are cells of a shared 512 px palette (albedo, metallic-roughness, emission),
mapped by UV, so a mesh node costs one draw call for the atlas, plus one for `paint` and one for
its livery where it has them. The body colour is the `paint` material, recoloured at run time from
the manifest's `paints`. Trains get one 512 px livery each and the airliner one 1,024 px livery,
with windows and doors painted in (research note). There are no vertex colours (the MPFB lesson,
§7) and no transparent glass (fill rate on the Adreno 613).

Train LOD0 bodies (G-32 addendum) are built from panels with real openings (recessed windows,
frames and bars, doorway vestibules, louvres) and roofs drawn with the atlas `roof_grey` role.
LOD1 and LOD2 keep painted windows from the same window lists, so the LODs line up.

### G-33 LODs as separate GLBs with distances in the manifest
`<name>.glb`, `<name>_lod1.glb` and `<name>_lod2.glb`, as in the Three.js layout (`_lod1`). The game
can load only LOD1 for traffic and switch the rest with visibility ranges. Cars switch at 28 m,
trains at 60, 300 and 900 m, the light aircraft and helicopter at 40, 250 and 2,000 m, the
airliner at 90, 600 and 4,000 m. LOD2 drops wheels and bogies.

### G-34 A JSON manifest per model keeps the old game's vehicle data model
It records size, mass, LODs, wheels, steering, doors (hinge, axis, open angle or slide), seats,
grips, cargo, pivots, collision proxies, paints, handling (`VehicleSpec`-shaped, chassis frame with
`groundBelow` unchanged), flight values, train formations and licence. Collision lives in the
manifest as simple boxes, capsules and cylinders, not as meshes in the GLB, so vehicle bodies get
shapes without an importer's static bodies.

### G-35 No glTF Transform or meshopt step for Godot
The Three.js game compressed with meshopt and WebP because its GLBs were embedded in the APK.
Godot imports a GLB into its own mesh and texture resources and compresses textures for the GPU
(ETC2/ASTC) on import. The export ships those resources, not the GLB, and a meshopt-compressed
GLB would need the extension on import. So the GLBs stay as Blender writes them. The repository
holds 8.5 MB of them in all, and size on the phone is decided by import settings.

### G-36 The Three.js road vehicles come from the sync, into `assets/vehicles/legacy/`
One source of truth: `tools/sync_from_threejs.py` copies the five vehicles' GLBs and LOD1s byte
for byte into `assets/vehicles/legacy/` (as it does for `assets/people/legacy/`), and its
`--check` covers them. `assets/vehicles/` itself holds only the new models, which the sync never
touches. `port_road_vehicles.py` no longer copies anything. It checks that the synced GLBs are
there and writes a manifest beside each, holding the data the old game keeps in code: wheels,
handling, hip points, poses, grips, door hinges, passenger doors, cargo anchors and the
ambulance's clear box. Each manifest records the overall measured size and the documented body
size. The model agent's earlier copies were byte-identical and were dropped. The old source
scripts stay in `tools/blender/vehicles/road/` for reference. These vehicles are interim: a Tamil
Nadu road-vehicle redesign replaces them.

### G-37 Model tests read the files with GLTFDocument, in the project's runner
`tests/models/model_checks.gd` (`ModelChecks`, typed under the project's strict warnings) is run by
`tests/unit/test_vehicle_models.gd` in `./run_tests.sh` and CI, one assertion per check. It reads the
GLBs with GLTFDocument as they are, with no dependence on import settings, and handles both
`MeshInstance3D` (in the project) and `ImporterMeshInstance3D` (outside one). It checks every
manifest against its GLBs: triangle budgets per kind and LOD, manifest counts equal to the
measured ones, node names, the frame (size, ground, front marker or steered wheels at -Z),
wheels on the ground or rail at their axles, hinges and pivots at their origins, no vertex
colours, texture sizes, and the texture contents: each embedded palette is checked against
`palette.json` cell by cell, and each manifest's `texture_samples` texel is read back from the
images in the GLB. This was added after a line-up render was taken while a diagnostic livery
build (with a bright green roof) was on disk; the committed files were right, but nothing would
have caught a wrong texture.

### G-38 Liveries: invented colours; real colour families for trains only, without marks
The cars, race car and aircraft use invented colours. The airline has white, deep teal, coral and
a disc emblem, with no name or registration. The race car has no team, sponsor or number (the
game draws a number on the roundel). Trains use the real colour families the research note
proposes (Chennai EMU green and cream, AC EMU white and blue, WAP-7 red and cream, Vande Bharat
saffron and grey) with no logos, lettering or numbers. Closer liveries are the owner's decision.

### G-39 Handling and flight numbers are starting values
The premium cars are faster and grippier than the hatchback (saloon 40 m/s, SUV 35, coupé 48, race
car 70). The aircraft have speeds and masses close to real types of their class. All of them are
estimates for Phase 2 and Phase 6b tuning, not measurements, and the manifests say so.

## Tamil Nadu road vehicles (G-90 to G-99, agent/godot-tn-vehicles)

### G-90 Real vehicles as references only: look, model by script, never ship the picture
Photographs (Wikimedia Commons) and 3D model thumbnails (Sketchfab) of real Tamil Nadu vehicles
are looked at for proportions, part layout and colour families. They stay in a scratch folder,
are listed with their licences in `docs/vehicles.md`, are never committed, used as textures or
traced. The geometry is original, by script (`tools/blender/vehicles/road/`). No downloaded
mesh is imported: the CC-BY models found are 2k to 1.6M faces, carry real makers' badges and
operators' names, and would need the same rebuilding to reach the phone budget.

### G-91 No marks: makes, operators, emblems, route numbers and registrations stay out
No make, badge, maker's name or a make's grille shape; no operator name (MTC, TNSTC, SETC,
private operators), emblem, route number or government mark; no red cross or star of life on
the ambulance (protected or registered marks); plates blank (yellow for commercial vehicles,
white for private cars, as in India) for the game to draw invented numbers. Fleet numbers are
invented and painted on bus fronts and rears only. Destination boards carry real place names
(Tamil first, English below), drawn by the game from the manifest.

### G-92 Budgets: Tamil Nadu vehicles as cars, buses 15k / 3.5k / 600
Autos, the share auto, the goods carrier, the Indian cars and the van ambulance use the car
budget (12k / 3k); buses 15k / 3.5k / 600 with a third LOD (40, 250, 900 m). The legacy
Three.js auto, ambulance and bus keep their measured counts by name (`LEGACY_BUDGETS`). All the
new models land well under: autos 4.9k to 5.6k, cars 7.6k to 9.7k, buses 8.9k to 10.6k at LOD0.

### G-93 Liveries: real colour families with invented layouts, checked by the tests
Each bus has one 512 px painted livery; the sides share its upper part (u along the bus), the
front and rear the lower part, so art reads the same on both sides and text appears only on the
front and rear. Colour families: Chennai city bus cream with maroon bands; low-floor white over
red-orange; state-transport intercity green with yellow bands; private mofussil white with
bright invented sweeps; school bus golden yellow with the brown band; autos yellow with a
black hood. `texture_samples[].family` and `paint_family` in the manifests name the family and
`ModelChecks.in_family` checks hue, saturation and value ranges.

### G-94 The redesigned hatchback, auto, ambulance and bus keep the old riding data
`assets/vehicles/hatchback`, `auto_rickshaw` and `ambulance` take the Three.js models' places
with the same handling numbers, and the auto and ambulance with the same wheel positions, hip
points and pose, so Phase 2 can port the old riding and physics tests unchanged. The old models
stay in `assets/vehicles/legacy/` (G-36). The city bus replaces the old bus with real Tamil Nadu
proportions (axles ±2.75 m, 1.08 m floor) and the old handling numbers.

### G-95 Bus anchors: every seat, the conductor, rails, kerb points and boards are nodes
Buses carry `seat_driver`, `seat_conductor` and one `seat_rNN_<side><n>` per passenger seat,
`grip_rail_*` on the ceiling rails and `grip_door_*` on the stanchions, `standing_area`, and
kerb points `stand_door_*` where passengers wait and alight. Exit and kerb points are listed under
`exits` and checked to lie on the ground beside the vehicle. Destination boards are separate
nodes (`dest_front`, `dest_side`, `dest_rear`) with size and facing in the manifest.

### G-96 Handlebar steering turns the fork and mudguard too
On the autos the `steering` node holds the handlebar, column, fork, front mudguard and (on the Chennai auto) the headlamp, turning
about the column axis in the manifest; the game also turns `wheel_front` about Y. Grips are at the
handlebar ends (the Three.js auto's hand points).
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

## Cast (people), G-10 … G-19

### G-10: One GLB per person, both LODs on one skeleton, clips inside
Each person is `assets/people/<id>.glb`: a `Skeleton3D` with two skinned meshes, `Body` (LOD0,
at most 10,000 triangles) and `Body_LOD1` (at most 3,500), the same two materials (`Skin`,
`Outfit`, 512 px each) and an `AnimationPlayer` with five clips. The game shows one mesh at a
time by distance (`visibility_range_end`/`begin` at 30 m with a little hysteresis; the value is
in `people.json`, `lods[].until/from`). Why: one skeleton and one AnimationPlayer drive both
LODs (no second skeleton to keep in step), textures are stored once, and the LOD swap is a
visibility change. Cost: a far-only crowd still loads LOD0 (~0.3 MB of vertices per person).
The Three.js version used separate `_lod1.glb` files; the manifest records mesh names instead.

### G-11: Clips are baked per person in Blender, not retargeted at run time
idle, walk and run come from `chennai-open-world/assets/animations/locomotion.glb` (Mixamo, T-pose
rest) and are retargeted onto each person's own MPFB A-pose skeleton in
`tools/blender/cast_animation.py`, then exported with the person. Method: spine, neck, head and
legs take the source's world-space rotation away from its rest onto the target's own rest (both
rest upright); shoulders, arms, hands and fingers are first aligned with a **full frame** (bone
direction plus a second axis: palm index-to-pinky line for hands and fingers, forward for arms),
so wrists keep their twist (the Three.js version bent every wrist ~70° before this); upper arms
are then turned 9° in towards the body, and in idle the thighs 7° in (the Mixamo idle stands wide
on top of MakeHuman's open rest). Why bake: every person has different bone lengths and rest
angles; baking gives exact per-person clips and the game needs no retarget code. Cost: ~60 KB of
animation per file.

### G-12: Soles planted per frame when baking, and at run time during blends
Each baked frame moves the hips so the lowest sole vertex of the real mesh (shoes and sandals
included, skinned with its own weights; only vertices moved mostly by a foot or toe bone, so a
saree hem or a trouser cuff near the floor never lifts the feet) is at 0. A cross-fade between
two planted clips still dips a sole up to 7.7 cm (measured: worst over the cast), so
`assets/people/sole_plant.gd` re-plants at run time from up to 96 sole vertices (call `apply()`
after the animation update; near people only). Tested on the imported scenes: soles within 2 cm
of the ground in idle, walk, sit and talk, within 2.4 cm in the run (between two baked frames
where the supporting foot changes), and within 1 cm through 0.22 s blends between idle, walk,
run and talk. Floor-length hems end 4.5 cm above the ground so they stay clear in blends.

### G-13: sit and talk are authored by script; posture, hands and loops fixed in the bake
No CC0 sit/talk clips were available offline; both are written in `cast_animation.py` from the
retargeted idle pose: sit (thighs forward, shins down, hands placed on the thighs by a two-bone
IK per arm, slow breathing, 4 s loop) and talk (idle twice over, right-hand beats, left hand
joining, nods and a head turn, 5 s loop). Original work, CC0. `seatHeightM` in the manifest
gives the seat height for benches and seats. Review round (24 Nov): every clip takes most of the
Mixamo clips' forward stoop out of the spine and levels the head (relative to MakeHuman's rest),
turns the upper arms in by clip (idle/talk 11°, walk 7°, run 5°), and replaces the clips' clawed
fingers with relaxed ones (rest pose plus 8–16° per joint towards the palm; a loose fist when
running). The five clips loop: `tools/blender/people_import.py` writes `settings/loop_mode = 1`
into each `.glb.import`, so the game needs no import script.

### G-14: No vertex colours anywhere
MPFB meshes carry a black vertex-colour channel; the exporter drops all colour attributes
(`export_vertex_color="NONE"`) and the tests check that no surface has `ARRAY_COLOR` and no
material has `vertex_color_use_as_albedo`.

### G-15: Plain float geometry, WebP textures
Godot 4.7.2 refuses `EXT_meshopt_compression` and `KHR_mesh_quantization` (checked headless:
"required extension … is not supported"), so the Three.js pipeline's meshopt step cannot be
used. `tools/blender/optimize_people.py` runs glTF Transform dedup, prune, resample and WebP
(quality 85; Godot reads `EXT_texture_webp`). About 0.8 MB per person, 57.7 MB for the 70; Godot recompresses
textures to ETC2/ASTC on import for Android.

### G-16: People tests read GLBs with GLTFDocument at run time
`tests/people/test_people.gd` loads each file with `GLTFDocument.append_from_file` (the
importer's own parser, same `mixamorig_X` bone names), so it needs no `--import` step and runs in
a throwaway project (`tools/run_people_tests.sh`) or in Foundation's project unchanged (it reads
`res://assets/people/`). All timing is game time: clips are sampled with `seek()`, blends advanced
with `AnimationPlayer.advance()`.

### G-17: The boards are the casting list; 70 people for all 74 phase-2 figures
Phase 1: one person per figure of `phase1-20-characters.webp` (20). Phase 2: the board shows 74
figures (two couples) under "30 Male + 30 Female". The 20 phase-1 people play their matching
phase-2 figures (`alsoFigures`), 50 new people play the rest, so every figure is played. Four
figures drawn as men are cast as women (Doctor, Teacher, Bank Employee, Sanitation Worker);
**the owner decided on 23 Nov 2026 to keep them as women**, and their `note` says so. The ten
figures first left out were built at the owner's request in the same round: 70 people, 40 men
and 30 women. Every manifest entry records board, figure id and label.

### G-18: Children are marked and kept out of harm by data
`age: "child"` (under 13) and `child: true`; their roles are limited to `school`, `passenger`,
`family` and `play` (checked by the tests). `play` (the cricket boy, owner's request) means a
child at play only inside a safe play area (park, beach, school ground) with no traffic,
vehicles, police or fights. The game must never cast a child as a street pedestrian, enemy,
driver or anyone who can be hit; teens likewise stay out of combat casting.

### G-19: One shared skeleton, MPFB `mixamo`, A-pose rest
52 bones, Godot names `mixamorig_<Bone>` (the importer turns `:` into `_`), identical names and
hierarchy in all 70 files (tested). Rest pose MakeHuman A-pose, metres, soles at y = 0, facing
glTF +Z. Clips from elsewhere must be retargeted to this rest (or baked by the Blender script).
