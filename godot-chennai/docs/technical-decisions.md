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

## Sound and environment (G-80 to G-89, agent/godot-ambient)

### G-80: No synthesis while the game runs; every sound is a file
The Three.js game synthesised everything live with Web Audio. In Godot that means GDScript per
sample into an `AudioStreamGenerator`: measured here at about 2 µs a sample for one engine voice
(4.5 % of a desktop core per voice at 22.05 kHz; an Adreno 613-class phone CPU is 4-5× slower, so
four engines and the ambience would take a whole core), and rendering the full set once takes
7.5-11 s. So the game only plays files through Godot's mixer (C++), and the owner's decision of
23 Nov (real recorded sounds) fits the same path. `AudioStreamGenerator` is not used.

### G-81: Synthesised stand-ins, rendered offline, for whatever has no acceptable recording
`tools/audio/render_standins.gd` renders the TD-26 designs (`SoundProfiles`, `Synth`: firing
frequency = rpm / 60 × cylinders / 2, the horns' notes, the beds) into `assets/audio/standin/`,
deterministically (seeded noise), CC0 own work. It never overwrites a recording, and a kind whose
engine has recorded loops gets no synthesised loops. Tests render the same designs and measure
them (horn notes, the auto's double tap, wet steps).

### G-82: One manifest for every sound file, with its provenance
`assets/audio/manifest.json` maps an id (`engine.car.loop.1.off`, `horn.auto`, `bed.rain`…) to
its file, what it is (engine loops: rpm and load), `source` (`recording` or `synth`), licence,
author, URL, original file name, edits and measured RMS. `SoundLibrary` reads it and starts
threaded loads at boot. Engine loops are 16-bit mono WAV (imported as QOA, sample-accurate
loops; tests read the source WAV); everything else is mono 22.05 kHz OGG Vorbis q3. Licences:
CC0, public domain or CC-BY only; NC, ND, Sampling+, RemArc and unknown are refused by a test, as
is any audio file without a manifest row and an `assets/LICENSES.md` row.

### G-83: Sample-based engines: loops at rpm points, crossfaded and pitch-shifted
Each kind (car, premium, race, auto, bike, thumper, bus, ambulance) has loops at three or four
rpm points (stand-ins: off-load and on-load at each). At any rpm the two neighbouring points
play, pitch = rpm / point rpm (0.5-2.5), crossfaded with equal power; the accelerator crossfades
off-load into on-load. Every loop is a whole number of firing periods with a crossfaded wrap, so
pitch-shifting keeps the putts in time and nothing clicks (tested: a full rev sweep is no rougher
than the voice held still). Revs follow the HUD's gear rule (`engine_rpm`); a gear change dips
the level for 0.15 s with a clunk; start and stop are one-shots; a single's lope is a pitch wobble
at idle. Players run only while their gain is above zero. Traffic: the nearest three vehicles
within 45 m, each an `EngineVoice` of `AudioStreamPlayer3D`s at the vehicle (inverse distance from
5 m, Godot's air-absorption filter for distance dulling, faded over the last quarter).

### G-84: Four buses, Three.js levels, glue and limiter on Master
Vehicles 0.55, World 0.495, Ambience 0.4675, UI 0.44 (master 0.55 × the old bus gains) into
Master with a 4:1 compressor at -16 dB and a hard limiter at -1 dBFS (`default_bus_layout.tres`).
Ambience has a low-pass that closes to 1.4 kHz inside a vehicle. Bed levels are set against the
idling hatchback (evening rush 3-10 dB under it, rain about as loud as the rush, sea a little
under, crickets well under) and tested from the manifest's measured RMS. SOUND on/off mutes Master
and is saved in the save file (`SaveStore`, key `cow-sound-v1`, "on"/"off" as the TS game).

### G-85: Recordings from Wikimedia Commons, cut and matched by a script
Sources (owner, 23 Nov): Wikimedia Commons through the MediaWiki API (search, categories,
`imageinfo` for licence, author and URL) and OpenGameArt; no Freesound. Downloads from
`upload.wikimedia.org` are rate-limited from this environment (HTTP 429, `Retry-After: 600`), so
they are fetched slowly, one file per window. `tools/audio/import_recordings.py` (numpy, ffmpeg)
cuts the pieces listed in `tools/audio/recordings.json`: engine loops on whole firing periods
measured by autocorrelation, RMS matched to the stand-in each replaces (the mix was tuned on the
stand-ins), then writes manifest and licence rows. CC-BY-SA is avoided: the only koel and house-crow
recordings on Commons are CC-BY-SA, so the birds stay synthesised (listed in the handoff).

### G-86: Day and night as numbers (`Lighting`), applied cheaply (`CityEnvironment`)
`Lighting.at(hour, rain)` is `lighting.ts` (same keys, sun path, rain overcast), unit-tested.
`CityEnvironment` applies it when the hour moves half a game minute or the rain changes: sun or
moon (`DirectionalLight3D`), flat ambient colour (no sky radiance or reflections on the phone
budget), a small sky shader (gradient, glow, sun and moon discs), ACES with the look's exposure,
and **exponential** fog in the horizon colour reaching ~89 % at 340 m (thicker at golden hour and
in rain) so the streaming edge melts away. Depth fog was tried first: the Compatibility renderer
draws none. Light energies are the TS intensities × 0.32 (sun) and × 0.55 (ambient), tuned on the
screenshots.

### G-87: Weather is an autoload; wetness is a global shader parameter
`Weather` (autoload): clear or rain, fading over 2.5 game seconds on `GameLoop.ticked`, saved as
`cow-weather-v1`. It publishes `city_wetness` (and `CityEnvironment` publishes `city_night`) as
global shader uniforms declared in `project.godot`, so road and wall shaders can darken and gloss;
`CityEnvironment.register_wet()` does the same for `StandardMaterial3D`s. Rain is the TS
`RainView`: one mesh of quads wrapped round the camera in the vertex shader, measured one extra
draw call (12 → 13 in the test world, Compatibility) and none when dry.

### G-88: Lights and shadows on the phone budget
Shadows: one orthogonal directional shadow, 40 m from the camera (it follows the player), 2048
atlas on mobile. Street lights: every lamp head is one instance of an emissive MultiMesh (one draw
call); only the six nearest lamps get a real `OmniLight3D` (sodium, no shadows), re-picked four
times a second. The world agent supplies lamp positions with `street_lights.set_lamps()`.

### G-89: One clock: `GameLoop.clock`
Foundation's `GameLoop` owns game time and the time of day (`GameClock`: `hour`, `label()`,
`next()`, `text()`); the environment, the ambience, honking by hour and the missions all read it.
This branch adds no clock. HUD and pause hooks: `GameLoop.clock.text()/next()`,
`Weather.label()/toggle()`, `Sound.label()/toggle()`.

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
The clips of `locomotion.glb` (a hierarchy of joint nodes; Mixamo and T-pose until G-100, now
our CC0 clip rig on MPFB's A-pose skeleton) are retargeted to each MPFB character (A-pose Skeleton3D) by `Retarget.run`, a port of the
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
idle, walk and run came from the Three.js game's `locomotion.glb` (Mixamo, T-pose rest); since
G-100 they come from a CC0 library (Rigify rest, any rest works: the source's own rest rotation
is divided out; G-104 for how they are eased). They are retargeted onto each person's own MPFB A-pose skeleton in
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


## Cast: open locomotion (G-100 …)

### G-100: idle, walk and run are CC0 (Quaternius' Universal Animation Library), not Mixamo
**Owner, 24 Nov 2026: the whole game must be open.** The Mixamo clips (Adobe's terms) are
replaced everywhere by three clips of Quaternius' **Universal Animation Library, Standard**,
CC0 1.0 (the pack's `License.txt`; OpenGameArt lists it as CC0, author quaternius):
`Idle_Loop` → idle, `Walk_Formal_Loop` → walk, `Jog_Fwd_Loop` → run. sit and talk stay our own
(CC0). Only this one clip set is used; its licence evidence is in `assets/LICENSES.md`.
- **The cast:** `cast_animation.py` reads the library's Godot GLB (Rigify `DEF-*` bones renamed
  to our `mixamo` names, `UAL_BONES`), divides out its rest rotations, and keeps every earlier fix
  (full hand frames and each finger joint, arms in, upright spine and level head, relaxed
  fingers, foot-only sole planting, loops). Changes for this library are G-104.
- **The player:** `assets/animations/locomotion.glb` is no longer copied from the Three.js game
  (removed from `sync_from_threejs.py`); `tools/blender/characters.py --locomotion` writes it: a
  skin-less MPFB `mixamo` skeleton (`it-professional-m`, an average adult man of the cast)
  carrying the same baked clips under the same names, without the cast's fixed arm turn-in (the
  player module settles arms itself). `LocomotionClips`/`Retarget` read it unchanged.
- **Not committed:** the library itself; rebuilding needs `universal_animation_librarystandard.zip`
  from opengameart.org (hash in `assets/LICENSES.md`), its Godot GLB at `$UAL_GLB` or
  `/opt/tools/ual/AnimationLibrary_Godot_Standard.glb`.
- **Clip speed fixed on the way:** the Blender scene ran at its default 24 fps while keys were
  placed one per 1/30 s, so every baked clip (before this change too) played 25% slow; the scene
  now runs at the bake rate (G-103).

### G-101: The licence test recognises Mixamo motion, not only the word
`tests/unit/test_asset_licences.gd` fails if any licence row, manifest, text file or glTF JSON
under `assets/` names Mixamo, **and** if any idle, walk or run in any GLB under `assets/` moves
like the Mixamo clips. `tests/support/gait_fingerprint.gd` reduces a clip to joint angles on joint
positions only (knee flexion and thigh pitch per leg, elbow flexion per arm, 24 phases of the
loop), so rest poses, bone names and renaming do not matter, and compares at the best phase shift
and either foot first. The reference is the old `locomotion.glb`'s idle, walk and run as
fingerprints (numbers, not the clips). Measured: the Mixamo-era cast, retargeted, eased and
re-baked, sat 2.1-5.9° from the reference; the CC0 clips sit 10° and more away (the report in
`docs/handoff.md` has today's closest value); the limit is 7°. `tests/tools/gait_fingerprints.gd`
prints fingerprints and distances for any GLB files (how the limit was chosen).

### G-102: Planting on what the game skins
Two faults kept soles off the ground, found with the jog (its flight phase and landings):
- **Loose vertices.** Deleting the skin hidden under clothes leaves vertices with no face;
  Blender's sole sampler planted on them, the glTF exporter drops them, so in the run the real
  sandal hung 3.6 cm up for 0.1 s twice a loop. The sampler now takes only vertices of faces,
  with the four largest weights normalised as the exporter writes them.
- **Run-time candidates.** `sole_plant.gd` took only vertices with one foot bone at ≥ 0.5 weight,
  missing the ball of the foot (shared half and half by the foot and toe bones, the lowest point
  at toe-off), and subsampled the rest-lowest vertices. It now counts foot and toe weights
  together and starts from each foot part's support points (extreme vertex in 25 directions
  round straight down), then fills the 96 points with the rest-lowest. Worst blend error over the
  cast: 0.014 → 0.004 m (the Mixamo-era cast: 0.010 m).

### G-103: Clips keyed from 0 s, the run at 60 fps, imported at 60 fps
- Keys now start at scene frame 0: from frame 1 every glTF clip started at 1/30 s and Godot held
  its first pose an extra frame each loop (a small hitch; loop lengths were 1/30 s long).
- The run's landings drop the hips ~6 cm in 1/30 s, so linear keys at 30 fps sank a sole 2.5 cm
  between two planted frames: the run is baked at 60 fps (`CLIP_FPS`), the scene runs at 60 fps
  with linear keys (the optimiser's resample drops the redundant samples of the 30 fps clips).
- Godot re-bakes glTF animation at the import option `animation/fps` (30 by default), which
  undid the 60 fps keys; `tools/blender/people_import.py` sets 60 for every person and for
  `locomotion.glb`. Cost: the imported scene of a person grows ~3% (750 → 774 KB, Godot's
  optimiser removes linear keys); the GLBs did not grow.

### G-104: Making the CC0 clips read as Chennai pedestrians
Review renders showed the library's style does not fit as it is; each change keeps the tests:
- **idle:** its bent-knee "ready" stance is taken 75% back towards rest (legs), its ~17° wrist
  flex half way back, thighs 4° in.
- **walk:** `Walk_Formal_Loop`, not `Walk_Loop`: the plain walk holds both hands bent up in front
  of the belly (it read as holding the stomach, also with the elbows eased 60% straighter).
- **run:** the jog crouches into a long lunge that stretched sarees, veshtis and lungis into
  sheets: 35% of its leg motion is taken back towards rest, the arms are turned 12° in and an
  upper arm stands at most 22° out (`ARM_OUT_MAX`; for the player's rig too).
- **sit:** built from the rest legs, not the idle's stance, so it is the same seat whatever idle
  is used (seat heights within 2.2 cm of the Mixamo era), and a seated wrist bends at most 36°
  (the hand is turned towards the forearm's line past that); before, 46-51° failed the test.

### G-105: Gait clip speeds in the manifest; the player's walk retuned
`people.json` gains `clipSpeedsMps` per person: the speed the body must move at playback rate 1
for the planted feet not to slide (two steps per loop cover twice each foot's range relative to
the hips), measured on the baked clip. Spawners should play `walk`/`run` at `speed /
clipSpeedsMps`. The player's `HumanFigure.WALK_CLIP_SPEED` goes from 1.5 (Mixamo) to 1.1 m/s
(the CC0 walk at the player's 1.75 m); `RUN_CLIP_SPEED` stays 4.6 for a believable cadence at
6.2 m/s (the run's natural speed would need a frantic rate), so the run's feet slide a little,
as before.

## G-70: A custom ray-cast vehicle on a Jolt `RigidBody3D`, not `VehicleBody3D`
**Decision (23 Nov 2026, vehicles).** `RaycastVehicle` (`src/physics/raycast_vehicle.gd`) is a
`RigidBody3D` whose wheels are rays: suspension spring and damper, a sideways bilateral tyre
constraint, engine/brake/rolling impulses and Bullet's friction circle, applied in
`_integrate_forces`. It is a line-by-line port of Rapier 0.21's `DynamicRayCastVehicleController`
as the Three.js `VehicleBody.ts` drives it (same constants, same order: every spring measured
before any is applied), plus that file's arcade drift and the two-wheelers' hold-the-line.
Roll and pitch are locked (as in the Three.js game: predictable on a touchscreen, cannot flip),
CCD is on, gravity 9.81 (Rapier's), damping 0.08/1.2.
**Why not `VehicleBody3D`.** It is also a Bullet port, but its friction, the drift hooks and the
per-step order are not ours to change, and matching the Three.js numbers (G-71) needs exactly
Rapier's arithmetic. **Revisit** if a ragdoll or real roll is wanted.

## G-71: Handling is tested against measurements of the Three.js vehicles
`tools/reference/threejs_handling.mts` runs the Three.js `VehicleBody` (Rapier) on a flat plane
(read-only use of `chennai-open-world/`) and stores speed curve, top speed, braking, coasting,
reversing, cornering and drift numbers in `tests/data/threejs_handling.json`;
`tests/scene/test_vehicle_handling.gd` measures the Godot vehicles the same way (all at once,
each in its own lane) and requires 10 % (15 % for the first second, 20 % for the single-front-
wheel vehicles' cornering: `docs/driving.md`, "Known differences"). Re-run the script if the
Three.js handling changes.

## G-72: Vehicle kinds and variants are data
`src/vehicles/data/vehicle_types.json` holds each kind's handling (`VehicleSpec`), seat, pose,
entry, passenger doors, gears, camera distance and crash rule, and the variants that spawn
(taxi, police, gang = the car kind with paint and extras). The five Three.js kinds keep the
Three.js numbers exactly; the premium saloon, SUV, coupé and the race car (MIGRATION_PROMPT §11)
are invented profiles with a `grip` multiplier (friction limit and side stiffness).

## G-73: Vehicles load through the Models agent's manifest
`assets/vehicles/<model>.json` (the Models agent's schema, shared with the Tamil Nadu vehicles
agent) names the LOD files and distances, wheel and door nodes, collision boxes, seats, pose,
entry and paint. `VehicleManifest` reads it: a kind whose own model is present takes its geometry
(wheels, chassis boxes, ride height, driver's seat, entry, aisle) from the manifest; the handling
scalars stay in `vehicle_types.json` (G-71, G-72). Wheels are matched to the physics wheels by
position and drawn at the physics hub. Kinds whose GLB is not on the branch yet use a stretched
`fallback_model`. So a redesigned auto, hatchback or bus, or the new premium cars, drop in as a
GLB plus manifest. The ported vehicles' manifests are the Models agent's files, unchanged.
Update (24 Nov 2026, the Tamil Nadu redesigns): the kinds draw the redesigned models
(`hatchback`, `auto_rickshaw`, `ambulance`, `bus_city`; the taxi variant its own `taxi`), the
Three.js ones stay in `legacy/` as fallbacks. Leaf 0 is the driver's door (named by the driver's
seat, else the entry-side door whose hinge is about 0.8 m ahead of the hips); rear double doors
and folding leaves of one doorway swing together; passenger doors come from the model's seats.
Collision boxes are trimmed to ride at least 6 cm clear of the road when settled (the race car's
proxies reached 2 cm and it rested on its belly). A siren vehicle without beacon materials gets
the light bar. Speed and braking still match the Three.js numbers on the new geometry; ride
height now follows each model's wheels (the new ambulance sits 16 cm lower).

## G-74: Gearbox P/R/D and the HUD gear rule (Three.js `Gearbox.ts`)
GAS and BRAKE are pedals; the selector is P, R, D. A change needs the vehicle below 1 m/s; asked
for while moving, the gearbox brakes and shows N until it engages. The HUD shows P, R, N, D or
D1…Dn (`gearFor`: the share of top speed in `gears` steps). Getting in selects D. Getting out is
refused above 2.5 m/s ("Stop the vehicle first").

## G-75: Crash ejection (TD-29) with the rider's own character body
Impact = the vehicle's change of planar velocity in one step (above 1.6 m/s; driving never
exceeds 0.4). `CrashRules.judge` applies the per-kind thresholds and damage of TD-29 (table in
`docs/driving.md`). A thrown rider starts at the seat (pushed clear of walls), with collisions
on, passing through its own vehicle, and `CrashFlight` moves it with `move_and_slide` (swept, so
it cannot cross a wall), slides it to a stop at 9 m/s², lies, gets up; damage on landing. The
motorbike topples (drawn) and scrapes to a stop. No ragdoll (same trade-off as TD-29).

## G-76: Collision layers
The vehicles use the Player agent's bits (G-64): 1 world, 2 player (and a thrown rider), 4
people, 8 vehicles (`src/physics/physics_layers.gd`, the same values as `PlayerController`).
Wheel rays see world and vehicles; a vehicle collides with world, vehicles, player and people.

## G-77: Boarding is a timed sequence; the player is moved through a `RiderLink`
`Boarding` (port of `Boarding.ts`, with TD-30's `pull` phase for carjacking) times walk, door,
pull, aisle, sit, close; `Driving` turns it into the rider's place and pose and the door angle.
`Driving` talks to a `RiderLink` (vehicles may not use the player module); `PlayerRiderLink`
(`src/app/`) maps it onto the Player's hooks: `PlayerController.enter_vehicle(vehicle, anchor)`
when getting in starts (the anchor walks the path to the door, then sits on the driver's hip
point and rides with the vehicle), `exit_vehicle(feet, yaw)` when the rider is out. A crash throw
pauses the player's own step (`controls_enabled` off and its physics process) while
`CrashFlight` moves the same body; `knock()` is not used for it because the walking step blends
a push away within a fraction of a second (TD-29 wants a flight of about a second). The player has
no seated pose yet: an open-seat rider is drawn standing with the hips on the seat; closed
vehicles hide the driver.

## G-78: Touch driving controls and input
Layout (chennai-game-design §3): steering pad bottom-left (a thumb slides left/right, deadzone
8 %), GAS (largest) in the bottom-right corner, BRAKE beside it, P/R/D above GAS, HORN/SIREN above
BRAKE, EXIT top-right, speed and gear bottom-centre; GET IN only on foot next to a vehicle; nothing
while boarding or thrown. Buttons are multi-touch (`HoldButton` tracks every finger). Keyboard
and pad actions (`drive_*`, `gear_*`) are registered at run time by `DriveInput`, so
`project.godot` is untouched. Module boundaries: `ui` and `vehicles` do not know each other;
`src/app/driving_wiring.gd` connects them and the camera.

## G-79: The driving camera is the Player's `FollowCamera`
`DrivingWiring` (`src/app/`) points the player's `FollowCamera` at the vehicle (`follow`, `reach`
= the type's camera distance) and calls `chase(velocity, heading, forward_speed, top_speed, dt)`
every step while driving (G-65: behind the travel, pulled back and widened with speed, eased
round thin obstacles); on foot and while thrown it follows the player. A test drives past the
houses and into a turn and checks the camera never jumps more than 0.6 m in a step beyond the
car's own motion and settles behind the direction of travel. (The vehicles agent's own chase
camera was removed for it.)

## World: the streamed city (G-50 to G-59, agent/godot-world)

## G-50: 250 m chunks streamed round a focus, built off the main thread, added in steps
`ChunkStreamer` (`src/game_world/city/chunk_streamer.gd`, port of `ChunkManager.ts` with the
time-sliced build of `agent/gameplay-fixes` `eaf40d0`) keeps every chunk whose nearest edge is
within 260 m of the focus and frees those beyond 340 m. A chunk is read, decoded and **built
completely on a worker** (`ChunkBuilder.build`: meshes, MultiMeshes, collider shapes and the
node trees, none of them in the scene yet), nearest first, `in_flight` at once (cores − 2,
1…3). The main thread then spends at most `budget_usec` (2.5 ms) a frame, at least one step:
one step adds one collider body, or the chunk's whole visual node (only once all its colliders
are in), or frees one root. Each chunk has two roots (`Solids_c_r`, `Chunk_c_r`) at its centre
in scene space, both in `WorldOrigin.GROUP`; mesh and collider vertices are local to the centre.

## G-51: The streamer's own threads; nothing heavy is freed or asked on the main thread
- Builds run on `ChunkWorkers` (a queue and `in_flight` threads that live with the streamer),
  not `WorkerThreadPool`: its `add_task` took 1.5–7 ms on the main thread in the streaming test,
  and its low-priority tasks were starved by other background work.
- Never ask a mesh for data on a worker (`get_faces()`, `surface_get_arrays()`): it waits for
  the render thread while the main thread may be waiting for the worker (a deadlock in
  `fill_now`). Builders count triangles from their own arrays.
- A dropped chunk's decoded data (thousands of `Building`, tree and prop objects) is released
  on a worker (5–14 ms on the main thread otherwise); never-added parts are freed in steps.
- Materials are created once on the main thread (`CityMaterials`); workers only reference them.

## G-52: Baked texture atlases, one material per atlas, the ground in one surface
`tools/bake_city_textures.gd` (run under xvfb) paints the facade atlas and its night glow, the
kit atlas (Tamil-first signboards with HarfBuzz shaping and the embedded Noto Sans Tamil subset,
shutters, shop interiors, railing) and its glow, clay roof tiles and the ground atlas, as ports
of the canvas painters of `textures.ts`/`kitAtlas.ts`, into `assets/city/textures/*.png`
(committed, imported VRAM-compressed with mipmaps). Nothing is painted at run time. A chunk's
ground (earth, parks, water, sand, verges, tarmac, lane paint, kerbs) is **one surface** drawn by
`ground.gdshader`: the layer index rides in the texture's u (`layer * 1024 + repeats`, kept
small by counting repeats from a whole number left of the chunk), the shader repeats inside that
tile with explicit gradients. Walls, roofs (with water tanks), kit, far look and objects are one
surface each. A chunk is at most 8 surfaces; measured 19–39 draw calls for the whole view.

## G-53: Near and far looks switched by the streamer, not by visibility ranges
Each chunk view has `Near` (walls with chajjas and balconies, roofs and tanks, kit, objects:
poles, shelters, props, AC units, dishes) and `Far` (one quad per wall, flat roofs; about a
fifth of the triangles). The streamer shows Near when the chunk's nearest edge is within
`near_distance` (120 m, hysteresis 20 m), else Far; ground and trees always. Per-node
`visibility_range_end` hid walls 160 m from the camera under the Compatibility renderer, so the
switch is explicit and covered by `test_city_streaming.gd`. Trees and palms are MultiMeshes
(one draw each); the depth fog (90–360 m) hides the load edge.

## G-54: `world_ready_around(point)` gates whatever simulates
True only when every chunk within the radius (default the load distance) is shown with all its
colliders **and** a physics step has run since the last one was added. `wait_ready_around` awaits
it in game time. `main.gd` places the player only after it holds for the start; AI and combat
must check it before stepping (the §7 lesson of the walled-in enemy). Tested with a stand-in
actor that never steps with a chunk missing.

## G-55: Colliders: wall trimeshes, closed boxes, a moving ground plane
Walls (from 1 m below ground to the roof, both faces collide) as `ConcavePolygonShape3D` pieces
of at most 48 buildings, so adding one costs about a millisecond (Jolt builds the tree when the
body enters the space). Trees (0.28 m × scale), poles, shelter back and posts, and props are
closed boxes in one more trimesh per chunk: thin, as the follow camera's easing expects (G-65).
Kerbs are not solid (as in the Three.js game). The ground is one `WorldBoundaryShape3D` that
follows the focus in 100 m steps (Jolt caps a boundary plane's size); the map edge and the coast
(6 m past the surf) are invisible walls; the landmarks have their own prisms and boxes. Layer 1
(world), as G-64 says.

## G-56: The regional world (format 2) behind `WorldSource`; v1 kept for comparison
`RegionalWorldSource` (`src/game_world/regional_world_source.gd`) with `WorldCodecV2` reads
`world/`: `world.json` and every tile's table at open (on a worker, about 2 MB of JSON), chunk
records by seeking into the tile's `chunks.bin`, road pieces per tile on first use (cached,
thread-safe). It is checked against the Python reference reader (`tests/fixtures/
world_v2_reference.json`, counts per tile and sample buildings and roads). Road pieces carry
`offset_along`/`total_length`, so dashes, poles and props stay in step across tile edges.
`CityLayouts` builds the street layout (spans, junctions, shelters, segment grid) **per tile**,
with the neighbours' pieces and stops within 300 m, on first use, and starts the tiles within
1.5 km of the focus ahead of time. Additive interface: `get_grid_origin()`, `chunk_count()`,
`get_landmarks()`, `get_sea()`. `main.gd` uses the regional world when it is installed;
`--world=v1` (after `--`) streams today's files. The export presets include `world/`.

## G-57: Renderer-only variety is the Three.js game's, bit for bit
Which houses get clay roofs, which windows glow, which walls get shops and which sign, which
trees are palms, where poles and props stand: all from the ported `hash` functions (32-bit
maths emulated; tested against values printed by node), so a street looks the same in both games
(sizes, shares and placement rules copied from `ChunkView.ts`, `FacadeKit.ts`, `furniture.ts`,
`props.ts`). Signboards are invented generic shop words (`ShopSigns.SIGN_WORDS`, tested); heights,
colours, shops, poles, kerbs and props are estimated or invented, not mapped.

## G-58: Measuring the city
`tests/tools/city_shot.gd` loads the city at a reference place (spawn, T. Nagar, Marina, Anna
Salai, or `--at=x,z,heading`), builds it with `fill_now()` and prints draw calls, primitives and
objects from `RenderingServer.get_rendering_info` (all passes, shadows included) with the
streamer's timings, then saves a Compatibility screenshot. Main-thread streaming cost is
tested headless under CPU load (`test_main_thread_budget_under_cpu_load`). Wall-clock numbers on
a shared machine include pre-emption (a lock-free control loop took 12 ms when four cores were
oversubscribed), so that test fills the free cores without oversubscribing them.

## G-59: The player in the city; physics interpolation stays off
`main.gd` adds a `PlayerRig` to the city once the start is ready, places it on the road the
Three.js game starts on, makes its body the streaming focus and lets the city recentre the
floating origin on it (`manage_origin`; the rig is in `WorldOrigin.GROUP`, its camera snaps on
`shifted`). Touch controls and devices are on only in play. Physics interpolation stays off for
phase 1: the camera follows in the physics step (G-65), smooth at 60 fps; turning it on for
90/120 Hz screens needs the camera to read the interpolated transform in `_process`, a Player
change, so it is listed as open rather than half done.


## Missions in the game (G-130 to G-139, agent/godot-missions)

### G-130: One `MissionSession` (no nodes) and one `MissionsLayer` (glue)
The Three.js `Game`/`JobDesk`/`PlaceDesk` rules half is `MissionSession`; `MissionsLayer` reads the
player/vehicle state in the fixed step (priority 10, after `Driving`) and draws. No rules in the layer.

### G-131: Life places and short stories are part of the session and the one save file
### G-132: Goods and fares follow the rules' stages; figures only draw them (adult cast only)
### G-133: Job results hold the game (`paused`) until CONTINUE; the board is the same dialog
### G-134: A toast behind a full-screen dialog is hidden; toasts size to their wrapped text after one frame
### G-137: Map checks use the format-1 world files and a port of `kerbSpot` (`FareSpots`); 34 of 49 baked kerbs reproduce without the side hint (the rest were baked with it)

## Integration: parked vehicles, driving, day/night, pause (G-110…G-119)

- **G-110 Parked vehicles.** `src/app/parked_vehicles/`: the Three.js game's parking (read from
  the baked mission content) plus `parking_spots.json` for what it did not park (taxis at
  stations and in T. Nagar, premium cars in Nungambakkam, Poes Garden, Boat Club Road and
  Besant Nagar, the race car at Irungattukottai). A spot is a world point; it resolves to the
  nearest road kerb on a worker thread within 560 m, a vehicle is built on a worker and joins
  the scene within 200 m once its chunk is ready (`world_ready_around`) and nothing stands on
  the spot; freed beyond 310 m or with its chunk. Vehicles are in `WorldOrigin.GROUP`.
- **G-111 Driving glue.** `PlayWiring` (one node under the city) holds `Driving`, the touch
  `DrivingControls`, `ParkedVehicles`, sounds and the environment, so `Main` only runs the flow.
- **G-112 Crash ejection** uses the ported `CrashRules` (bike and auto riders thrown on hard
  impacts, car drivers through the windscreen at speed; damage by impact speed, TD-29).
- **G-113 Day/night and weather in the game.** `EnvironmentWiring` replaces the stand-in sun
  and sky with `CityEnvironment` driven by `GameLoop.clock` and the `Weather` autoload; lit
  windows, street lamps and wet streets follow. Emission colour of the facade and kit materials
  is black: Godot adds the colour to the emission texture, so white lit every wall at night.
- **G-114 Pause menu** (`src/ui/pause_menu/`): the tree pauses (game time, physics, clock);
  RESUME, Time, Weather, Sound, QUIT TO TITLE; Back in play pauses, in the menu resumes,
  at the title goes up one level then quits. Fits 915x412 and 640x320 (`test_ui_layout`).
- **G-115 Tests share autoloads.** Tests that change the clock, weather or floating origin
  restore them (an origin left shifted put the next test's ground out of reach).


## Mission design v2 (G-140 to G-149, agent/godot-missions; spec: docs/mission-design.md)

### G-140: Failure reasons, checkpoints and retry
`MissionFailure.Reason` (out of time, target escaped, cargo ruined, spotted, patient lost, vehicle destroyed, player down) with a text and an id. An objective with `checkpoint: true` makes the next one the retry point; a failure goes back there (`failed` event with `reason_id`, `checkpoint`), not to the start. The session offers RETRY / START OVER (`retry_offered`); the layer puts the player (and a driven vehicle) back where the checkpoint was reached. A retry starts fresh stats (`retries` + 1) and caps the medal at silver. `strict` objectives also fail on a wrecked vehicle or a downed player; the old 21 stages are not strict.
### G-141: W6, the kerb port was exact; the data lacked its hint
Every one of the 15 kerbs the first port missed reproduces exactly once the side (+1 right, -1 left of the road's drawn direction) and the shift the TS call used are given. They were baked from `fareAt(..., side)` calls whose side point (a real hospital, a bus stop's side) the table did not keep. The hint is now data (`kerbSide`, `kerbShift` on `fare` and `goods`); `FareSpots.kerb_spot_hinted` + `test_kerb_spot_reproduces_every_baked_kerb` demand 100 % of 49 within 0.15 m. `export_content.ts` does not emit the hint yet: re-baking from TS needs it added to `fareAt`/`goodsAt`.
### G-142: Medals, bonus goals, extras, choices and save version 2
Up to 3 goals per mission (`no_damage`, `par_time`, `time_left`, `no_police`, `cargo`, `quiet_zone`, `no_suspicion`, `no_retry`); all met gold, at least half silver, else bronze; no goals no medal. Best medal kept. A replay pays 25 % of the reward. The five new missions are `kind: "extra"`: open from the board's STAGES tab from the start, outside the 21 stage count. A `choice` objective waits (game held) for one of 2 to 3 options: money, reputation, a police heat signal, a flag saved in the file (a later brief reacts: `briefIf`), a `next` objective or `end`. Save version: the file gets `chennai-save-version: 2` when written; a file without it is version 1 and migrated on read (medals, flags, extrasDone added inside `cow-progress-v1`; `progress()` keeps exactly the Three.js shape); a newer file is left untouched.
### G-143: Stability, TailWatch, HazardZone numbers (estimates, to tune by play)
Stability: brake over 4.5 m/s^2 loses 3 per m/s^2 over per second; cornering over 3.5 loses 2.5; a breaker over 4 m/s loses 2.5 per m/s over; pothole 4 + 0.5 x speed (cap 12); crash 40 x impact; smooth driving recovers 1/s; ruined at 0. Breakers and potholes are data patches (`rough`) crossed by position. TailWatch: inside notice for over grace fills 25/s, notice to near 4/s, the safe band drains 8/s, a red light +15, spotted at 100, lost after 6 s beyond far. HazardZone: radius and depth grow with game time and rain; speed falls to 35 % from 0.35 m, stalls from 0.5 m; strike zones block, processions crawl at 40 %.
### G-144: Mission HUD parts
`MeterBar` (stability or suspicion, thin, in the objective panel), `MissionMinimap` (128 dp, north up, 300 m radius: flood depth, strikes, the marker, the tail's target, nearby roads; shown only with hazards or a tail), a choice dialog, a retry dialog, the medals screen (`MedalBadge` + ticked goals + pay), board tabs JOBS and STAGES, and a compact dialog so four rows show at 915x412 (W10).
### G-145: The five missions are data, built from the real roads at bake time
`tools/rules/bake_missions_v2.gd` snaps named places (district or landmark, optionally a named road) onto roads, slides them clear of buildings (checked on the regional world), bakes the kerb and the parking spot, and finds routes with Dijkstra over the roads' own points (`anchors.json`: the places table of the new missions). `tools/rules/build_missions_v2.py` composes `missions_v2.json` (Hall Ticket, Sambar for Sixty, Wrong Number, Monsoon Night, The Bandh). The graph exists only at bake time; the game plays the baked polylines.
### G-146: Dynamic events
`DynamicEvents` (seeded by job or mission id and attempt): first no earlier than 25 s, 40 to 90 s apart, one active, none in a fight, each kind once per run (detour, procession, rain, bandh, passenger change). They add or take seconds on the clock (`JobRunner.extend`, `MissionRunner.extend_time`), place a blocking or slowing zone ahead of the player toward the next stop, and ask the layer for rain. Stages run them only when the mission says `dynamic` and the player is in a vehicle.
### G-147: Sound cues go to the real autoload
`MissionsLayer._on_cue` calls `Sound.cue`; warnings play `hurt` or `click`; `Sound` counts cues (`state()["played"]["cue.fanfare"]`) so tests can check them.
### G-148: W5, content is checked on the regional (format 2) world
`test_content_v2.gd`: every marker of the five missions (and their kerbs, tail points, parking) is within 20 m (tail 8 m) of a street and not inside a building; the existing 21 stages and 13 jobs are within 60 m (stops 20 m) and not inside a building, except a park and two railway stations.
### G-149: Not done on purpose
W7 (the quarry on the live road graph and traffic signals) needs `RoadGraph` and `TrafficSignals` from the traffic branch, which is not in `feat/godot-chennai`: it is for `godot-complex` once merged; chases and tails play baked road polylines (new ones are real road routes). Hazard re-planning (routes around water) needs the same graph; the player re-routes by the minimap. A red-light run beside the tail target is in the rules (`red_light`) but not wired to signals. Police heat from a choice is only a signal (`heat_raised`) until combat is integrated. W8 and W9 are the coordinator's.

## G-120: The AI reads an area round the player, built off the main thread; `ai` stays pure
Traffic, walkers, signals and crowds (Phase 3, brief §5) run on an `AiArea`: the roads within
1.2 km of a centre, read through `WorldSource` (G-6: roads, the index's POIs, mapped
`traffic_signals` nodes and areas, landmarks, the sea, beaches from the regional world's chunks
near the coast, the rail stations), turned into a drive graph and a walk graph (`RoadGraph`,
port of `RoadGraph.ts`), spawn weights, signals and the kinds of place. It is built on a worker
thread (`BackgroundTask`) whenever the player moves 500 m from the centre; `AgentSystem.rebase`
moves everyone onto the new graphs where they are. Everything in `src/ai/` is `RefCounted` and
node-free (`AiArea`, `AiPopulation`, `AgentSystem`, `RoadGraph`, `TrafficSignals`, `PlaceMap`,
`CrowdField`, `CastPicker`, `TrafficDensity`, `AgentPresets`, `AiRandom`); the views are
`src/vehicles/traffic/` and `src/player/people/`, wired by `src/app/city_life/` (`CityLife`,
`Carjacking`). The game's agents are the Three.js `Agents.ts` rules, ported with their tests.

## G-121: Lanes from the map
A road's lanes each way come from OSM `lanes` (else the width, `CityLayout.lane_count`); each
vehicle keeps its own lane by its variation (the kerb lane for slower ones), a one-way street
uses its whole carriageway, a narrow two-way street is driven near its middle as in the
Three.js game. India drives on the left: lanes are left of the centre line.

## G-122: Road heights from day one
`RoadGraph.node_y` holds the road surface height at every node and agents carry `y`
(`height_on(edge, along)`), so traffic and walkers can use flyover decks and ramps (blueprint;
the Three.js AI assumed y = 0). Built with `decks`, bridges with OSM `layer >= 1` are raised to
`layer × 6 m` and the roads joining them ramp down at 1 in 20 (a highest-first search both ways
along every edge). Off today: the world draws flyovers flat (World agent's weak list), and
traffic must drive on what is drawn; switch it on in `AiArea.build(…, decks = true)` when decks
exist. Estimated, not mapped: OSM has no heights.

## G-123: Signals at main junctions, stop lines and heads drawn
Port of `Signals.ts`: junctions of three or more roads with a main road, or near a mapped OSM
`traffic_signals` node, clustered within 16 m; two groups of arms by direction take turns
(12 s green, 3 s amber, 1 s all-red), each junction offset by its position. Traffic stops at the
line on red, on amber when it can stop comfortably, and whenever someone is on the zebra.
`SignalHeads` draws a pole and a three-lamp head at the kerb before each stop line within 140 m
and the stop line itself, in three `MultiMesh`es (lamps unshaded with a colour per instance):
three draw calls for every junction in view.

## G-124: Chennai's traffic: the Tamil Nadu vehicles, rare premium cars, drawn as the drivable models
`AgentPresets.chennai_mix()`: motorbikes 34 %, autos 15 % and share autos 4 %, hatchbacks 17 %,
sedans 9 %, taxis 6 %, goods carriers 4 %, city, low-floor and mofussil buses 8 %, premium SUV,
saloon and coupé 3 % in all (brief §11 "rare traffic"); estimates of an arterial, not counts.
Each look is a vehicle variant (new: `sedan`, `share_auto`, `goods_carrier`, `bus_lowfloor`,
`bus_mofussil` in `vehicle_types.json`, additive), so the view is the same `VehicleModel` the
player drives, in a paint from the model's own Chennai colour list, with its footprint for the
AI's gaps. A view is an `AnimatableBody3D` on the vehicles layer (G-76) with the chassis box:
the player's vehicle hits it and the player cannot walk through it. Its driver (the cast's
auto-driver, cab-driver, bus-driver; delivery and young commuters on bikes) sits in the seat
from the manifest, within 45 m (95 m on open seats).

## G-125: Children and teens only beside an adult, off the road
`CastPicker` (brief §6, G-18): walkers (who can be hit) and drivers are adults; crowds anywhere
are adults; children and teens appear only as crowd spots marked as a child, beside an adult at
a station or on the sand, never on a carriageway; the cricket boy only at play on the sand.
Tested on the real manifest and on generated spots (`test_ai_population.gd`).

## G-126: People and traffic by place and hour (TD-31)
Port of `Places.ts`/`Crowds.ts` (`agent/crowd-density`): each stretch of pavement is a beach,
promenade, market (9 shops within 90 m), station (160 m), temple, main road, street or lane,
read from the map; each kind has a curve of people per 100 m by hour (beaches fill at sunset,
markets at noon and evening, stations at the rushes, lanes stay quiet). Every 2 s the place
within 250 m and the hour set how many of the pools are out (`AiPopulation`): walkers by the
people level, traffic by the hour's share and the roads' traffic share. Crowds are fixed spots
per 32 m square (the same every visit), thinned by the hour, at most 90, nearer ones first.
The spawn rings in the city are closer than the Three.js defaults (traffic 50–170 m, walkers
18–85 m): with the phone's haze a wider ring left the street in front of the player empty.

## G-127: The AI on its own thread at 30 Hz; what the frame pays
- The AI steps on a thread of its own (`CityLife._run_steps`, semaphores) every second physics
  frame (30 Hz); the main thread waits for the last step (usually done), copies positions into
  a snapshot and starts the next; views move on from the snapshot along heading × speed in
  between. A `WorkerThreadPool` task was tried first; the pool's threads are shared with the
  physics engine's jobs and the chunk builds, so a dedicated thread is used.
- Broad phase: obstacles and agents bucketed per 16 m square in `AgentSystem.update`
  (walker step cost fell from 2.4 ms to 1.4 ms at T. Nagar).
- Traffic models merged per look and paint into one mesh per material (`Lod0` keeps shadows,
  far LODs none; wheels apart to turn): about four draw calls a vehicle instead of 7–18.
- People: at most 36 walkers and crowd people drawn (the nearest), shadows only within 18 m,
  animation every third frame beyond 30 m, none beyond 85 m; models loaded during loading,
  views pooled per person (`PeoplePool`), a handful of the cast loaded (14 walkers, 10 more in
  crowds, 4 children, 3 drivers per kind).
- Measured on this container (4 cores, Godot 4.7.2; numbers in the traffic handoff): CityLife's
  main-thread work 0.65–1.4 ms a physics frame, the AI step 1.8–3.1 ms on its thread every
  other frame, draw calls +80…+136 over the city (121–166 in all at the reference places).
  `Performance.TIME_PHYSICS_PROCESS` was not usable here (it reported 3.5 ms for an idle
  headless frame); `tests/tools/traffic_shot.gd` measures the physics callbacks itself.

## G-128: Carjacking (TD-30) in the game
A traffic car, auto or bike that has all but stopped (< 1.2 m/s: in front of the player, at a
light, in a jam) within reach of the Get-in button is swapped for a real `Vehicle` of the same
variant and paint, with its driver seated; its agent is held. The vehicle carries the meta
`driver_aboard`, which makes `Driving.enter` play the boarding's pull phase (one additive line
in `driving.gd`). On "pulled" the crime is reported (`Wanted.report("carjacking")` when the game
has a `Wanted`) and `Carjacking.carjacked` is emitted; the driver runs off and walkers near are
scared; seated, the agent goes back to the pool out of sight. Walking away (5 m) undoes the
swap. Buses and ambulances cannot be taken (`Carjack.KINDS`).

## G-129: Walkers step aside; traffic stops for people crossing
Walkers coming towards each other, or catching up with a slower one, step up to 1.3 m to their
left (India keeps left) or away from someone already to one side, and back to their line after;
the player and vehicles are stepped round the same way; only someone right in front stops
them. Traffic treats every walker as an obstacle, so it stops for people crossing a street at an
unsignalled corner as well as on a zebra.

## G-160: Title fonts: Barlow Condensed and Noto Sans Tamil (SIL OFL)
The title uses Barlow Condensed Bold (menu rows, page names, the chip, spaced OPEN WORLD) and
ExtraBold (the big CHENNAI), and Noto Sans Tamil Bold for சென்னை, as the landing-page design
asks. Fetched from `raw.githubusercontent.com` (the google/fonts repository, `ofl/barlowcondensed`
and `ofl/notosanstamil`; that host is allowed from this container). Barlow is stored unmodified
(110 KB each). Noto Sans Tamil is a variable font (340 KB): it is frozen at weight 700 and cut to
Tamil, Latin and a few punctuation marks with fontTools (56 KB). Files are in `assets/fonts/title/`
(a folder of its own: the sync tool owns the `.woff2` files beside it), licence rows in
`assets/LICENSES.md`, licence texts beside the fonts. `TitleFonts` loads them lazily; a missing
file falls back to the theme font. The display face lists the Tamil face as its fallback, so one
font draws a mixed line. A test checks that every glyph of சென்னை exists (`has_char`) and a
screenshot shows them drawn.

## G-161: The title menu follows the landing-page design
Rows CONTINUE (only with a save; shows the real "Stage N · ₹money · D of T stages", or "Free
roam" when every stage is done), NEW GAME (first launch: "Begin in Chennai: Stage 1, <first
stage's title>"; with a save: "Start again from Stage 1"), SETTINGS, CONTROLS, ABOUT, QUIT (where an
app can quit). The primary row (CONTINUE, else NEW GAME) has the amber bar and a soft pulsing glow
and the focus. Every row is a `TitleRow` (a Button with a title and subtitle, ≥ 48 tall). Hover and
focus show a pale plate, an amber bar and a 4-unit nudge; rows slide in one by one (0.35 s + 0.08
s per row, 0.6 s tweens), the name parts rise, the chip comes last (0.9 s). The summary comes from
`Main.title_summary()` (live `MissionSession` and the save file), so `ui` knows no game system.
Layout budget: the screen is never shorter than 412 units, and six 48-unit rows are 288 of
them, so the brand is cropped to the height of its letters (`_slot`: Tamil 1.2, CHENNAI 0.9, OPEN
WORLD 1.15 times the font size) and the foot counts only the credit's 15 units (the chip rises
from the corner on the right, away from the menu). At 915x412 nothing scrolls; the rows sit in a
ScrollContainer for anything smaller. A test (`test_ui_layout`) checks every row is inside the
screen, off the credit, and needs no scrolling, at four screen sizes with and without a save.
The shade is one 192x96 texture (the prototype's left-to-right gradient plus the dark foot),
one full-screen quad; the prototype's radial vignette was left out (a second full-screen layer).
Node names changed: the first row is `Continue` or `NewGame` (was `Play`); `Main.title.primary_row()`
is the row with the focus.

## G-162: SETTINGS is the pause menu's settings, from one list
`Main._add_pause_menu` adds Time, Weather and Sound to the pause menu and to the title's SETTINGS
page in one loop (`add_setting(id, label, press)` on both), so they cannot drift apart. A press
relabels the button and tells the title (`settings_changed`), whose chip shows the clock and the
weather. Settings are plain buttons (≥ 48 tall) on dark plates so they read over a bright sky.

## G-163: CONTROLS is read-only and data-driven from `ControlsGuide`
The CONTROLS page draws `ControlsGuide.groups()` (ON FOOT, DRIVING, ANYWHERE; control and what it
does) in three columns, and nothing else on the title knows a control. When the controls scheme
is redesigned, change that one list (a test checks every row of it is on the page).

## G-164: The title camera tours a seeded spot of the live city
`TitleWiring` (`src/app/title_wiring/`) owns the title camera. At launch a seed (the clock, or
`Main.title_seed`) picks Marina, T. Nagar or Central (`TitleSpots`: target point, heading,
distance, height, a ±0.22 rad sine sweep over 64 s: the prototype's slow alternate drift, about
1 m/s). With `tour` on (default whenever there is a display; headless runs, so every other suite,
keep it off) the streaming focus moves to the spot during loading, behind the loading screen:
`CityWorld.focus_node` and `CityLife.focus_node` become a marker there, so the traffic, people
and parked vehicles are the real ones of that street. The player is frozen
(`process_mode` DISABLED) so they cannot fall through ground that is no longer streamed. CONTINUE
and NEW GAME call `release()`: focus goes back to the player, the loading screen shows its one
honest step ("Building the streets around you") and the player is let go when the chunks within
60 m of them are in (`world_ready_around`, game time). Coming back from play (QUIT TO TITLE) the
camera just drifts over where the player is (no focus move: a driven vehicle must keep its
ground). The chip's place name is the nearest landmark within 700 m, else the nearest district of
the tile's index (`TitlePlace`, only names in the data: Marina Beach, T. Nagar, "Evening Bazaar"
for the Central spot, because the data has no landmark at the station). The weather and light
come from `GameLoop.clock` and `Weather` through `CityEnvironment`; the title adds no world.
Cost of the tour: the wait on CONTINUE (a few seconds on a phone while the player's streets load).

## G-165: Rain, lightning and reduced motion on the title
The camera's own `CityEnvironment` rain (one box of 36 m round the camera) shows only as a few near
streaks from a camera 25 m up, so the title adds two `RainView` layers in front of the camera
(the prototype's middle and far drops): box 76x44x76 m, 32 m ahead, 900 drops; box 220x90x220 m,
120 m ahead, 1100 drops, longer, wider streaks. Same shader and code as the existing rain
(`RainView` got optional box, streak and width parameters); one draw call each, hidden when dry.
Lightning is a full-screen additive flash (0.55, 0.75, 0.35 with a fade, 4.5–12 s apart, from
a seed) only while it rains and the launch drew a storm (one launch in three): `Weather` stays
clear or rain (G-87), "storm" is a title decoration and the chip says "Storm" only then. Left out
and why: splash rings and ripples on the road (at 25 m up they are a pixel or two and need a
road-height decal pass), the drifting mist bands (the rain already thickens the haze and the
road shine in `Lighting`), thunder and rain sound (sound is suspended on the title by design),
the radial vignette. Reduced motion (`DisplayServer.accessibility_should_reduce_animation() == 1`: Godot
answers -1 when a platform cannot say, which must not count as on; read by the title menu and
the wiring, settable before they enter the tree): no slide, nudge, glow pulse,
camera drift or lightning; the chip says Rain. Nothing runs while loading: the wiring's `_process`
is off until the title is shown.

## G-166: The loading screen is restyled like the title
`LoadingScreen` keeps its contract (real steps from `Main.STEPS` in order, `begin_step` / `finish_step` /
`fail`, a frame between steps, TRY AGAIN and CLOSE, no percentage, nothing animated, no `_process`, no
fade over the first frames) and takes the title's look: the dark backdrop with one faint warm
gradient quad, சென்னை over CHENNAI over a spaced OPEN WORLD (the title's fonts), and on the right a
row per step with a mark (waiting: hollow ring, current: amber ring, done: filled amber, failed:
red), the English name and, where listed, the Tamil beneath. A thin bar moves by one share only in
`finish_step`. One tip (`TIPS`: public facts and control hints) changes only in `begin_step`. If a step
runs long `Main`'s existing 5 s heartbeat calls `show_slow(step, seconds)`: one dim line, no timer in
the screen. The screen is two columns so the failure (text and two 48-unit buttons) fits at 412 high.
Tamil lines (`LoadingScreen.TAMIL`): "சென்னை வரைபடத்தைப் படிக்கிறது", "தெருக்களைப் படிக்கிறது", "உங்களைச்
சுற்றியுள்ள தெருக்களை உருவாக்குகிறது", "வாகனங்களை நிறுத்துகிறது" were written by the model and **need
native review** before release; a step without an entry shows English alone.
