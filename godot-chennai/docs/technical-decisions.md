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
