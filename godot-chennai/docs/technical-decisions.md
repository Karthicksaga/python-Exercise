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

## Infrastructure: decks, water, ground covers, road details (G-150…G-159, agent/godot-infrastructure)

### G-150: Format 2.1 adds `infra.bin`; every 2.0 file stays byte for byte
Bridges, waterways and street spots go into one new per-tile file, `tiles/<tc>_<tr>/infra.bin`
(sections `DECK`, `WATR`, `SPOT`; `docs/world-format.md` §3.7), and `world.json` gains `minor: 1`
and `infra`. Nothing else changes: rebuilding with the same PBF (sha256 in `data/MANIFEST.json`)
gives every 2.0 file unchanged (checked with `diff -r`), so the chunk packs, roads and areas
already committed and the readers of the other agents are untouched. The parser keeps waterway
lines, railway lines and crossing/traffic-calming nodes in lists of their own for the same reason.
1.3 MB for 47 tiles, committed. A 2.0 reader ignores the file; the GDScript reader
(`InfraTile`) attaches heights to the road pieces when a tile's roads are read
(`RegionalWorldSource.tile_infra`), before the network is shared between threads.

### G-151: Decks and ramps from bridge + layer, heights estimated at build time
OSM maps no heights. `chennai_geo/infra.py` raises bridge chains to clear what they cross
(6.5 m per layer over roads and railways, 6 m footbridges, level 100 m either side of a
crossing; 1.2–5 m over water or nothing mapped) and gives every other road the lowest heights that
keep its grade within 1:20 (arterials), 1:14 (streets) or 1:3.3 (footway stairs) by a
max-propagation over the whole region's road graph. Heights are sampled every 5 m along each road
piece, so a ramp's foot inside a long segment is exact and both chunks at an edge read the same
numbers (tested). Why at build time: the propagation needs the whole graph (a ramp often crosses
tile edges), it is deterministic and testable with pytest, and the game only interpolates.
- **Drawn:** `GroundMeshes` lays a raised road's surface and markings at its height in the same
  ground surface; `DeckMeshes` adds slabs with fascia and underside, parapets 1 m (railings on
  footbridges), retaining walls on ramps, piers every 30 m along the whole road (two under decks
  12 m and wider) never on a lower carriageway, and covers over covered roads: one more
  vertex-coloured, double-sided surface per chunk. Parapets open where another raised
  carriageway at about the same height meets them (ramps leaving the deck).
- **Solid:** the deck surface (flush with the ground at a ramp's foot), parapets, ramp walls and
  piers are `ConcavePolygonShape3D` pieces of at most 1,200 triangles (2,400 cost 1.7–1.9 ms a step), added one per step like the
  wall pieces (G-55). Measured: a car (the catalogue's ray-cast hatchback, unchanged handling)
  drives the Anna flyover up, over and down at 70 km/h staying on the surface (`test_decks_driving`).
- **Kept off decks:** kerbs, poles and props (raised stretches join the blocked stretches), trees
  in the water or within 2.5 m of a deck above 1 m, mapped spots.
- **Tunnels and underpasses are covered sections, not lowered roads:** the ground is one flat
  `WorldBoundaryShape3D` (G-55) that cannot have holes, so a covered drivable road keeps its ground
  level and gets side walls and a roof 5 m up, open where another road crosses at ground level
  (the railway subways read as the line's bridge). Lowering roads needs a ground collider with
  holes: listed as not done.

### G-152: Water is sunk 0.75 m, drawn with one cheap shader, and blocked at the bank
Water areas (`natural=water`, reservoirs, riverbanks) and the rivers, canals and streams of
`infra.bin` (widened to OSM `width`, else river 30 m, canal 18 m, stream 6 m) are cut out of the
earth and ground covers (simple polygons; a pond inside a piece is handled by splitting the piece
through it) and drawn 0.75 m below the ground with a bank face, a shore band and `water.gdshader`
(flat colour, shore tint in vertex alpha, a small moving ripple in colour and normal; no
reflections, no refraction, cheap on Mobile and Compatibility). Drains and ditches are kept in the
data but not drawn (most are covered or a metre wide). **The rule for people and vehicles:
blocked, never in the water.** A stone bund 0.55 m high stands on every bank with an invisible
collider up to 2.2 m, open only where a road or path crosses at ground level; bridges pass over
it. Nobody can walk, jump or drive into water, so nobody drowns and no respawn rule is needed
(children included, AGENTS.md). The sea keeps its coast wall (G-55).

### G-153: Zebras, speed breakers, medians; `RoadBumps` for the cargo
- **Zebras:** mapped crossings (`crossing=zebra|marked|uncontrolled|traffic_signals`, zebra
  markings) and, by rule, every arm of the junction nearest each mapped traffic signal, set back
  half the widest road plus 2.5 m: 3 m bars, 0.5 m wide, 1 m pitch, across the carriageway.
- **Speed breakers:** mapped `traffic_calming=*` and, by rule (invented), one 14 m from the
  main-road end of 40 % of side streets over 60 m long. Sizes are estimated: bump 1.2 m × 10 cm,
  hump 3.7 m × 10 cm (IRC style), table 6 m × 8 cm, cushion 1.8 m × 7 cm, rumble strip
  2.4 m × 2 cm; painted in the kerb's yellow and black; the hump surface is a trimesh in the
  deck collider, so the suspension rides over it.
- **`RoadBumps`** (`src/game_world/infra/road_bumps.gd`, node-free): `crossed(from, to)` returns
  the breaker a step's move went over (or null), `surface_at(p)`, `near(p, r)`. The missions'
  fragile cargo should call `crossed()` with the vehicle's previous and current positions each
  physics step and judge by speed.
- **Medians:** wide two-way arterials (primary, secondary, motorway; 14 m and wider, not
  one-way) get a yellow-black median 0.9 m wide and 0.22 m high, broken round junctions and off
  decks. Not solid, like the kerbs (G-55), so traffic and the player cross at junctions as before;
  the Three.js centre line rule is unchanged under it (the marking test pins it).
- **Footbridges and rail overbridges** are decks like any other (footway bridges over roads at
  6 m with stairs at 1:3.3; road bridges over railway lines clear them at 6.5 m).

### G-154: Ground covers are tinted layers of the ground shader with continuous noise
Parks, meadows and orchards, scrub, forest, wetland and mangrove, farmland, pitches, cemeteries
and bare ground or salt pans are layers 8–16 of `ground.gdshader`: the grass (or sand) tile tinted
per cover with two octaves of value noise (patches of about 24 m and 6 m), still one draw call per
chunk. The noise repeats every 16 texture repeats and `GroundMeshes` now counts repeats from a
multiple of 16, so it continues across chunk edges (texture tiling is unchanged). Parks, pitches
and cemeteries get a 12 cm paved kerb on their real edges (not on chunk clip edges). No new
texture bake was needed.

### G-155: Measuring the infrastructure
`tests/tools/infra_measure.gd` fills the city round a point (Compatibility, xvfb: draw calls,
primitives, objects; triangles per layer of the chunks in reach), then moves the focus 800 m
through it at 20 m/s in game frames (headless: the streamer's main-thread maxima). Baseline is the
same tool on the code before these changes with the same world files. Numbers in `handoff.md`.

## OSM detail (agent/godot-osmdetail, 24 Nov 2026)

### G-190: Format 2.2 adds `detail.bin`; every 2.0 and 2.1 file stays byte for byte
Same recipe as G-150: one `detail.bin` per tile ("COWD", sections `BLDG PART OBJ_ LINE ZONE SIGN`),
`world.json` `minor` 2 and a `detail` key; nothing in the 2.0 chunk, road, area or `infra.bin`
files changes, so a 2.0 or 2.1 reader still works (`diff -r` of a rebuild: only `detail.bin`,
`DETAIL.md` and the `world.json` keys are new). It is a new file rather than new sections of
`infra.bin` so the infrastructure and detail work version separately. The parser keeps the new
OSM objects in their own lists (`OsmFeatures.detail_*`, `parts`) so the 2.0 selection is untouched.
Positions in 5 cm steps, lines cut at tile edges, everything else by the tile of its centroid.
Layout: `docs/world-format.md` §3.8. What OSM maps in Chennai is sparse (`docs/osm-detail.md`):
`building:colour` on 0.04 % of buildings, `roof:shape` on 0.01 %, 65 `building:part`s; benches
85, waste baskets 62, mapped street lamps 1,745, power towers 7,544, walls 620 ways. The renderer
estimates the rest and the coverage report counts both.

### G-191: Building tags in the mesh: mapped wins, estimated is marked, the legacy rule stays the default
- Wall colour: `building:colour` exactly; else the colour of `building:material` (brick, concrete,
  stone, glass, metal, wood; estimated); else the data's hash colour (today's 12 plasters) or, where
  an area palette exists (G-194), a hash into that palette.
- Roof kind (`BuildingMeshes.assign_roof`): `roof:shape` flat, gabled (+ gambrel, mansard,
  saltbox), hipped (+ half-hipped), pyramidal (+ cone), skillion, dome (+ round, onion), when the
  footprint can carry it (a gable and a skillion need a four-corner convex footprint, a hip or a
  pyramid a convex one, a dome a convex one; else a flat terrace); not mapped: today's rule (a third
  of low convex houses get the clay-tile hip roof) with the default palette, or the area's
  `roof_types` weights for houses of at most three storeys. Flat roofs keep the parapet and the
  black water tank; a dome sits on a flat roof; pitched roofs have no parapet. `roof:colour` exactly,
  else `roof:material` (tiles, metal, concrete, glass, thatch), else the roof kind's own colour.
- Parts: `building:part` polygons are drawn as buildings from `min_height` up (walls from there, no
  shops, no wall fixtures, the collider from there so a car passes under an overhang). A building
  whose parts cover 60 % of it is not drawn (the parts are its 3D form, as OSM's rule says); a part
  without height takes the host's. A building at a landmark footprint is left out of the world
  already (G-27) and so are its parts and signs.
- Triangle budget (measured, G-195): +0.6…0.8 % primitives, no new draw calls. A gable and a skillion are 6
  triangles, a dome 96, a pyramid or hip as before.

### G-192: Signs say the category, never the name (TD-18), one atlas, Tamil on top
`assets/city/sign_categories.json` is the one table (47 categories: grocery, supermarket, bakery,
sweets, tea shop, coffee shop, restaurant, snacks, vegetables, meat, fish, flowers, pharmacy,
clinic, dental, hospital, bank, ATM, textiles, tailor, jewellery, footwear, electronics, mobile,
hardware, furniture, stationery, books, salon, laundry, petrol, vehicle repair, bus stand, railway
station, school, college, temple, church, mosque, police, post office, library, cinema, lodge,
marriage hall, office, shop). The world build maps OSM tags to a category id (the `name` tag is
never read), the game bakes the kit atlas from it (`tools/bake_city_textures.gd`: 2 columns x 24
rows of 512 x 88 px signs, then the shutter, interior and railing cells; the atlas grew from
1024 x 1024 to 1024 x 2368: about 26 MB with its glow partner and mipmaps if left uncompressed,
to be compressed for the phone later). Text is drawn once at build time with Noto Sans Tamil Bold (the full Tamil
range, `assets/city/noto-sans-tamil-categories.woff2`: the two older subsets lacked ய ர ற ங ஜ ே ொ,
which fell back to a thin font), Tamil 34 px above English 19 px, squeezed to fit.
A shop front gets the category of the building when OSM maps a shop, amenity, office or tourism tag
on it, else of the nearest mapped shop node within 14 m of the shop, else an everyday street shop
chosen by hash (estimated, counted). A building mapped as a shop gets fronts even with one
storey. A two-bay shop shows the same board twice. Public places keep `name:ta` and `name:en` in
`detail.bin` (786 in the world) for a later name plate; no sign draws them yet. 39 mapped places
are themselves named with a category word ("Temple", "Tea Shop"): their sign says the same word
because the table does. The ten invented signs of `shopSigns.ts` ("NILA TIFFIN CENTRE", "NEW STORES")
are gone; `ShopSigns.SIGN_WORDS` guards the English words in a test.

### G-193: Street objects, barriers, zones and platforms: near only, no new draw calls, blocked only where it should be
Drawn into the chunk's existing surfaces (objects, ground, water), so the draw-call count does not
change; the objects and barriers sit under `Near` (shown by the streamer's distance switch, G-53),
the zone paint in the ground surface. Benches, waste baskets, drinking water, post boxes, toilets,
power poles and towers, bollards, gates are small procedural models (`DetailModels`: 24 to 96 triangles, the lattice tower 504). Mapped street lamps replace generated poles within 14 m. A shelter is added for a
`public_transport=platform` node with none within 20 m, and every shelter gets a bus-stop pole.
Walls (with a pilaster every 4 m), retaining walls, hedges, fences (posts and two rails), kerbs,
jersey barriers and guard rails are thin merged boxes; a segment is cut where it would stand in a
carriageway and drawn only by the chunk holding its middle. Walls, fences, hedges, jersey barriers
and guard rails block walking (closed boxes); kerbs do not. Heights: the mapped `height`, else wall
1.9, fence 1.5, hedge 1.2, retaining wall 1.6, kerb 0.15, jersey 0.8 m (estimated). Tree rows are
trees every 7 m. Platforms: a railway platform is a 0.9 m slab with a yellow edge line and a shelter
every 40 m, a bus platform 0.18 m; both have colliders. Pitches are marked ground (grass, or rubber
for courts, clay for kabaddi) with the lines of the mapped sport (football and hockey with boxes
and circle, cricket the pitch strip and creases, basketball, tennis, volleyball and badminton,
kabaddi; a plain marked field when no sport is mapped); playgrounds, running tracks and allotments
are covers of the ground shader (`COVER_TRACK`, `COVER_PLAYGROUND`, `COVER_ALLOTMENT`); a swimming
pool is flat water on the ground with the water shader (clear aqua, `pool_water`, vertex red 0) and
a paving rim. Nobody swims yet (the culture note's swimming is a later task).

### G-194: Area character comes from `data/areas/palettes.json`, one loader, by boundary
`AreaPalettes` (`src/game_world/city/area_palettes.gd`) is the only reader of the godot-areas file
(format 1, derived from `areas.json`, never hand-edited): `default` and `areas.<id>` with `walls`,
`roofs`, `roof_types` (shape: weight), `storeys` (bins "1", "2", "3", "4-5", "6-9", "10+": weight)
and a `boundary` (circle: centre, radius; corridor: spine, half width; world metres). The area of a
building is the one whose boundary contains its footprint centre with the smallest distance over
radius (or half width); none: `default`. A storey count is the bin by weight, then a count inside the
bin (10+ is 10 to 12). The palette is applied only to what OSM does not map: houses with an
estimated height (storeys), buildings without `roof:shape` (roof types, houses up to three
storeys), without `building:colour` or `roof:colour` (walls, roofs); mapped tags always win. The
`default` entry changes nothing: outside every area the 12 plasters, the legacy roof rule and the
data's storeys apply as before G-190.

### G-195: Measuring the detail
`tests/tools/city_shot.gd` (draw calls, primitives, objects, worst build and main-thread ms) at
T. Nagar, Mylapore and the Marina, the same tool and world on `ab3acba` and on this branch; numbers
in `handoff.md`. The machine was loaded by other agents (load average 8 to 9), so the milliseconds
are worse than a quiet run; the counts are exact.


### G-200: The area atlas is researched data in `data/areas/`, one claim at a time
`areas.json` (31 areas), `landmarks_shortlist.json` (83 landmarks), `palettes.json` and
`coverage.json`, with JSON schemas and `tools/geo/tests/test_areas_data.py`. Every statement that
looks like a fact is a claim `{text, status, source}`: `sourced` (a URL says it), `osm` (read from
the extract or the built world), `estimated` (with a `basis`) or `unverified` (no source, never to
be shown as fact). Wall colours, roof weights, storey weights and street widths are always
`estimated`. Tamil names are only OSM's `name:ta` (or the Tamil `name`) and every one says "needs
native review". No business or brand names: malls and IT parks are generic entries that keep only
their OSM id. `docs/areas.md` is generated from this data.

### G-201: Area boundaries are circles and corridors from the district data
Centres are the world's own district and settlement points (or OSM place nodes and polygon
centroids); a circle's radius is half the distance to the nearest other centre, clamped 450 to
2200 m, or set from an OSM polygon; linear areas (Marina, OMR, Ennore port, airport axis, Anna
Nagar, Kodambakkam to Vadapalani) are corridors round a spine of those points. A building belongs
to the containing area with the smallest distance / radius. Not administrative borders; they exist
to pick a palette.

### G-202: `palettes.json` schema
`{format, roof_shapes, storey_bins, default, areas: {id: {type, walls[hex], roofs[hex],
roof_types{shape: weight}, storeys{bin: weight}, boundary}}}`. Roof shape keys are
`enums.ROOF_SHAPES`; storey bins are `1, 2, 3, 4-5, 6-9, 10+`; weights sum to 1. Derived from
`areas.json` by `python -m chennai_geo.area_palettes` (a test fails if it is stale), never edited
by hand.

### G-203: Landmarks are found by name in the PBF, not by hand-copied coordinates
`tools/geo/chennai_geo/area_lookup.py` (pyosmium, one pass, no Overpass) returns candidates with
centre, footprint, area and key tags; the shortlist keeps the checked best candidate per
landmark with its OSM type and id, footprint, levels and height tags, Wikidata id from OSM and
Commons file titles with licences (titles only, no images). Tiers: A hand-made hero, B parametric
kit (parameters in `tier.params`), C recoloured standard building. Not found by name (Pulicat Lake
as a polygon, the Egmore station building, the Mylapore tank water) is listed in
`not_found_in_osm`.

### G-204: Coverage numbers come from two places
`area_coverage.py` counts levels, height, roof shape and use from the built world, and colour,
material and roof tags from the extract (the world format keeps no colour or material). In the 31
areas levels are mapped for 3.9 % of buildings (four fifths of them in George Town and Parry's
Corner); height, roof shape, colour and material tags are each under 0.2 %.



## G-170: Control settings: one shared object, one save section, live
`ControlSettings` (`src/ui/touch_controls/`) holds the preferences: driving scheme (only `wheel`
exists; the tilt and buttons schemes are named in the proposal but not built, by the owner's
decision), left-handed, look sensitivity (0.5 to 2.0), invert-Y, button size (small 0.85,
medium 1.0, large 1.15 of the 915x412 dp sizes), opacity, haptics, run toggle. `shared()` is the
instance the game uses (loaded once from the save file); a setter saves and emits `changed`, and
the walking and driving controls re-lay themselves out at once. Saved in the existing save file
(`SaveStore`) as its own section `chennai-controls-v1` with `version: 1`: additive (`SaveStore`
keeps sections it does not know, so `src/missions` is untouched), each field falls back to its
default when missing, wrong-typed or out of range, and a newer file is read field by field. The
pause menu gets one row per setting (`ControlSettingsRows`, same one-button-cycles-the-value
pattern as time, weather and sound). Tests give their own instance with its own `path`.

## G-171: Walking stick: dead zone 0.12, auto-run with hysteresis, no RUN button
`MoveState` (pure): radial dead zone 0.12 (the rest rescaled from zero), run above 0.85 of the
stick's travel, back to walking under 0.70 (between the two nothing changes, so a wobbling thumb
does not flicker between gaits). The RUN button is gone. A walking stick is capped at 0.80 so
`PlayerController`'s own 0.82 rule never contradicts it (it is the controller's `run` flag that
decides). With "toggle run" on, the edge of the stick no longer runs; a RUN button (shown only
then; a press of the pad's left-stick click on a pad) latches running until the stick is let go.
`TouchControls.move` is still the raw stick (the existing G-66 test reads it); the rig applies
`MoveState` to touch, pad and keys alike.

## G-172: Look: sensitivity, invert-Y and a glide that adds no distance
`LookState` (pure): a drag is pushed in UI units, scaled by sensitivity, vertical flipped when
invert-Y is on, and delivered through a 30 ms low-pass (`step(dt)`). The glide is the inertia: the
view settles for about a tenth of a second after the thumb leaves, but a 286-unit drag turns the
camera exactly as far as before (the G-66 test's 1.4 to 1.75 rad still holds), so there is no
overshoot to fight and sensitivity 1.0 is the old feel. The right stick pushes 440 units a second
at full tilt through the same object.

## G-173: Jump: 100 ms buffer, 80 ms coyote time, in the body
`JumpState` (pure) is kept by `PlayerController` (three additive lines in `step`, plus
`press_jump()` for the rig). A press up to 0.10 s before landing jumps on landing; a press up to
0.08 s after walking off a kerb still jumps; one jump per press and per leaving the ground. The
rig no longer decides when to jump, only when a press happened. JUMP is a smaller button above
ACTION (70 dp at medium).

## G-174: Steering by sliding: relative drag, auto-centre, progressive and speed-sensitive
`SteerState` (pure) and `SteerZone` (the node over the steering side of the screen). The thumb
lands anywhere (a ring shows where); 70 UI units of sideways drag from that point is full lock;
the value eases to the drag at 15 a second and back to centre at 7 a second on release; a slide
under 0.04 is a resting thumb. `SteerState.shape(x, speed_share)` is applied in `DriveInput` to
touch and stick (the keys steer fully, as before): `|x|^1.6` (progressive) times a speed factor
that falls smoothly from 1 at a standstill to 0.65 at top speed. Full lock at a standstill is
exactly 1, and a firm slide (1.0) at a third of top speed still gives 0.9 or more, so what
the Three.js handling tests measure (steer set directly on the vehicle, `test_vehicle_handling`)
is untouched and a driver sliding fully in town gets within 10 % of the old full lock. The
vehicle's own lock already narrows with speed (`max_steer / (1 + 0.09 v)`), which is why the
extra reduction is gentle. Needs a real thumb to tune: the exponent and the 0.65 are first
guesses from the prototype, in one place each.

## G-175: Reverse by holding BRAKE; the gear is a readout
`ReverseHold` (pure): BRAKE held 0.4 s while `|speed| < 0.3 m/s` starts reversing; releasing
BRAKE, or pressing GAS, stops it; braking from speed never reverses (the 0.4 s only counts once
stopped). `Driving.reverse_on_hold` (off by default so every earlier test and tool is
unchanged; `PlayWiring` turns it on) drives `Gearbox` through one new method, `set_now`: R while
reversing (throttle `-brake_amount`, so a half-pulled pad trigger reverses gently), D after. The
P / R / D chips, the `gear_*` actions and the D-pad gears are gone; `Driving.select_gear` stays
for tests and scripted use. `DrivingControls` shows REVERSE on BRAKE while it happens and a
"hold to reverse" hint on it otherwise. Analogue triggers: `Driving.gas_amount` and
`brake_amount` (1.0 for a key or a touch) scale throttle and brake.

## G-176: ACTION is one button fed by `ActionContext`; GET IN is a source
`ActionContext` (pure) is the small interface: `add_source(Callable)` where the Callable returns
an `ActionCandidate` (label, priority, distance, activate), an Array of them or null;
`best()` takes the highest priority and then the nearest; `trigger()` runs it; dead Callables
(freed owners) are dropped. Priorities are constants: ENTER 20, BOARD 30, TALK 40, PICK UP 50,
HAND OVER 60 (a waiting fare beats a car beside you). `TouchControls` owns one
(`action_context`); the big round ACTION button shows the best label, dims (not hidden, so the
layout is stable and the thumb finds it) and ignores presses when there is none. `DrivingWiring`
registers GET IN. The missions layer, boarding of fares and the dialogue have no talk, pick-up
or hand-over interaction in the game yet (fares are automatic), and `src/missions` is closed to
this task, so nothing else registers today; each is one `add_source` call when it exists. The
keyboard's E and the pad's A press the same button (`player_action`).

## G-177: One pure layout for every control set; left-handed is its mirror
`ControlsLayout.foot(area, settings)` and `.driving(...)` return every rectangle (buttons, the
stick's resting ring, the stick/look and steering zones) from the size of the play area. The
right-handed layout is computed, the left-handed one is `x' = width - x - w` of it, so the mirror
is exact by construction and the nodes only copy rectangles. Sizes are dp at the 915x412 base
(ACTION 104, JUMP 70, RUN 70, GAS 100x124, BRAKE 100x100, HORN 56, EXIT 100x52), scaled by the
button-size setting and never under 48. New schemes or combat buttons add keys here. Medium
buttons are at least 48 px on a 640x320 screen (the old G-66 rule); small is 0.85 and is under
48 px there (48 dp at the base): noted, not tested.

## G-178: Gamepad through named actions; glyphs follow the last device; vibration on crashes
`ControlActions` registers at run time (keyboard kept): `player_action` (E, A), `player_jump`
(Space, X), `player_run_toggle` (left-stick click), `pad_pause` (Start), and the raw stick
actions `pad_move_*` and `pad_look_*` with dead zone 0 (consumers apply their own once).
`DriveInput`: RT gas and LT brake (analogue), Y horn, B exit; the left stick steers through the
same curve as a touch. Start pauses and resumes (`Main._unhandled_input`, five additive lines).
Synthetic `InputEventJoypadMotion` / `Button` events parsed into `Input` drive all of it in the
tests, through the same `MoveState`, `LookState`, `JumpState`, `SteerState` as touch.
`DeviceTracker` notes which device sent the last event (a stick must move 0.5 to count); the
ACTION, JUMP, GAS, BRAKE, HORN and EXIT buttons show a small badge (A, X, RT, LT, Y, B; keys on
a keyboard) when it is not touch. `HapticsPlan` turns a crash outcome into a phone buzz or a pad
rumble (thrown strongest); `DrivingWiring` plays it on `Driving.crashed` unless haptics are off.
Kerb and speed-breaker ticks are not built. The D-pad is left to menu focus.

## G-179: `ControlsGuide`: one data source for "what do the controls do"
`ControlsGuide.rows(mode, device, settings)` returns `[control, what it does]` rows for walking or
driving on touch, pad or keyboard, following left-handed and toggle-run. The pause menu and the
title's CONTROLS page can both read it (the title agent may stub the same name; reconcile at
merge: this one is `src/ui/touch_controls/controls_guide.gd`).


### G-205: Malls are generic entries with a research-only name field (TD-18)
`landmarks_shortlist.json` holds 16 shopping complexes (kind `mall`, tier B), found by scanning the
extract for `shop=mall` and for `building=retail|commercial` of 8,000 m2 or more or five levels or
more. `names.en` is "Shopping complex, <area>", the sign is `sign` = `வணிக வளாகம் / SHOPPING COMPLEX`,
`osm.osm_name` is null, and the OSM name sits only in `research_name` (marked research only; a test
keeps it out of every other field). Also added: Sowcarpet and Flower Bazaar, Marina Beach Market.

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


### G-180: Landmark candidates are ranked from the same OSM extract, not Overpass
`python -m chennai_geo.cli landmarks-rank` reads the clipped Tamil Nadu PBF (`world.osm.pbf`) with
pyosmium (nodes and assembled areas, ways and multipolygons) and keeps objects inside the world
(ring 3 playable shape) that carry `wikidata` or `wikipedia`, or are a landmark kind: tourism
attraction or museum, `historic=*`, place of worship (temple, church, mosque by `religion`),
railway station, lighthouse, tower, and temple/church/mosque/stadium/civic/government/
university/hospital buildings. Linked objects that are not buildings to model (places,
boundaries, roads, water, land use) and businesses (`brand`, `shop`, hotels; TD-18) are not
candidates. A point inside a polygon of the same kind joins it (Chennai Central's station node
gives the station area its `wikidata`), then objects sharing a `wikidata` merge (the largest
polygon is the footprint). The score (Wikidata 40, Wikipedia 30, Commons 6, kind 0-22, footprint
area up to 20 on a log scale, Tamil name 5, height or levels 4, unnamed -30) only orders the
list for choosing what to model next. Output `data/landmarks/candidates.json` (footprints for
the top 400) and `COVERAGE.md`. Overpass is not used: it was unreliable from the build container
and the PBF is already the world's single source.

### G-181: One spec per landmark, the OSM part filled by a tool, the rest by research
`assets/landmarks/<id>/spec.json` (format 1). OSM parts are named with roles: `model` (drawn on
its OSM outline), `model_rect` (drawn on the outline's minimum rectangle where OSM's outline is
not the building's own), `area` (under the model), `info` (names and links only). `cli
landmark-osm` writes each part's footprint, tags, centroid, area and minimum rectangle, and the
landmark's `origin` (main part's area centroid) and `yaw_deg`; OSM's `height` tag goes to
`height.osm_tag`. By hand: names in Tamil and English with their sources (OSM first; a Tamil name
not from OSM is marked for native-speaker review), the height with its source, alternatives and
the reason for the choice, style (with disagreeing sources recorded), colours, materials, facts
each with a source URL, Commons references (title, author, licence, URL, use), the kit and its
parameters, budget, LOD distances, collision plan, what is estimated, and for temples the respect
rule. `LandmarkSpec.validate()` checks all of it; the game lists landmarks in `index.json`.

### G-182: Reference photos are listed from Commons, never committed
`chennai_geo/landmark_refs.py` lists Commons files (category members, search, `imageinfo` with
`extmetadata` licences), one request every 3.5 s or slower, a descriptive User-Agent with no
personal data, an on-disk cache, and on HTTP 429/503 one wait of `Retry-After` (else 120 s) and
then stop. Thumbnails come from `upload.wikimedia.org` (the API's thumb host is not reachable).
Downloads go to a scratch folder outside the repository. A photo may become a texture only if
CC0 or public domain (`usable_as_texture`); none is used today. The host rate-limited thumbnail
downloads hard during this work (shared with the coordinator), so few photos were seen.

### G-183: Landmark models are GLBs built by parametric Blender kits from the spec
`tools/blender/landmarks/<kit>.py` builds every spec naming the kit: geometry is collected in
plain Python lists and written as three flat-shaded meshes `LOD0`/`LOD1`/`LOD2` with a linear
vertex colour per face corner, plus `COL_*` boxes (an axis-aligned mesh on a node carrying
position and yaw). The GLB's origin is the spec origin and the model is built in world
orientation, so the game places it with a translation only. `build.json` records the spec's and
the GLB's SHA-256 and the triangle counts; `build_all.sh` builds twice and fails if any byte
differs (deterministic: no random numbers, no timestamps, no set iteration). The game test
compares the hashes, so a spec edited without rebuilding fails CI (CI has no Blender).

### G-184: Five kits, shaped by OSM outlines and the references
`gopuram_complex` (gopurams on their OSM footprints with stone base and passage, tapering
painted tiers with cornices, corner and mid-face pavilions, pilasters, niches and abstract
coloured stucco forms, barrel crown and finials; the compound wall with ochre bands, open at the
gateways; shrine towers; mandapams on the OSM buildings inside the compound; flagstaff; the
tank's striped steps above the city's water and its central mandapam), `colonial_clocktower`
(Ripon Building), `station` (Chennai Central and Egmore: arcaded storeys, arch hoods, pilasters,
corbel-arch frieze, pavilions and towers with pyramid caps or onion domes and chhatris, clock
faces, belfry, roof sign boards, a three-span train shed), `tower` (Anna Nagar Tower, ported
from the retired GDScript `LandmarkMeshes`/`LandmarkProfiles` so there is one landmark system),
`lighthouse` (banded triangular tower on its OSM outline, gallery, lantern, and the base blocks OSM maps as building parts at their tagged heights). The modern mall kit
was not built (no landmark mall chosen; a mall's name is a business name).

### G-185: Placement, LODs, collision and the buildings a landmark replaces
`CityWorld` reads the specs on a worker and `LandmarkModels.build` loads and instantiates each GLB
on the same worker (`ResourceLoader.load` off the main thread), outside the tree: a `Placed` node
at the spec origin in `WorldOrigin.GROUP`, the three LODs with contiguous visibility ranges from
the spec (each LOD ends where the next begins, 12 m margins) and the shared vertex-coloured
landmark material (one draw call per landmark), the `COL_*` boxes as `BoxShape3D`s on one
`StaticBody3D` (Jolt), and only the real public name as `Label3D` signs (Tamil above English).
`ChunkBuilder` drops every chunk building whose vertex average lies in a landmark's exclude
outline before building meshes, colliders and furniture; the world builder does the same when
the world is rebuilt (`build --max-ring 3` passes `exclude_outlines()`). The committed world was
not rebuilt in this branch (binary diffs shared with other agents); the run-time filter covers it.

### G-186: Where references disagree
Kapaleeshwarar east gopuram 37 m (two sources: 120 ft) over Wikipedia's 40 m; Ripon Building
43 m (Wikipedia) over 41.5 m and an outlier 58 m, neoclassical (two sources) over
"Indo-Saracenic and neoclassical"; Ripon's size 85 x 32 m (Wikipedia) against OSM's 68 x 20 m: the
model follows OSM. Chennai Central 41.5 m (136 ft). Egmore: no published height; 24 m estimated.
Chennai Lighthouse 45.72 m from OSM's tag (agrees with the Directorate's 46 m). Chennai Central:
OSM maps no outline for the heritage building, only the frontage way 214739119 (`building=roof`);
the model stands on that way's minimum rectangle (`model_rect`), and the clock tower is placed
about two thirds along the front from the west, where the reference photo has it and where the
frontage outline has a bump.

### G-187: Temples are architecture only
No deity figures, images or sanctum; tier stucco is abstract coloured forms; the tank is not
entered (G-152's bund stays). The spec records the rule and a test checks it is there.

### G-189: Malls are generic, named only by their category
The `mall` kit (podium on the OSM outline, glass atrium front with mullions and transoms,
cladding fins, shopfront glazing, entrance canopy, atrium roof light, rooftop parking or plant, a
plaza strip within the outline's tolerance) builds the shortlist's malls (godot-areas,
`kind: mall`): the first is OSM way 154030370 in Royapettah. No real name, logo or livery
anywhere: the spec's names and sign are "வணிக வளாகம் / SHOPPING COMPLEX", `osm.withhold_names`
keeps the way's name, brand and links out of the spec, the validator rejects them for any mall,
and no Commons reference is listed (their titles name the business). Heights are estimated.

### G-188: Measuring landmarks
`tests/tools/city_shot.gd --no-landmarks` builds the same city without landmark models (OSM
buildings in place); `--frames=N` prints average and worst frame time over N rendered frames.
Numbers in `handoff.md`.

## Navigation and spread (G-280 to G-289, agent/godot-nav), 24 Nov 2026

Owner's phone report: every mission started next to the last one, there was no map, the circles on
the ground were unexplained, and the people to pick up could not be seen.

### G-280: Stages are spread over the whole city; consecutive ones start 2 to 8 km apart
Ten of the 21 stages left the Anna Nagar test box for real districts: Kilpauk, Perambur, Chetpet,
Saidapet, Vadapalani, Ambattur Industrial Estate, Flower Bazaar, T. Nagar, Besant Nagar and
Santhome. Four stay in Anna Nagar because the fiction is there (the walk from home, the cross-town
race, Tower Park, the Roundtana). Stages 16 to 21 changed order (stadium biryani, wedding,
planted chain, Mumbai Mail, beach road brawl, harmonium thief) so the Central and Egmore stages
are no longer back to back. The rule, tested for all 26 (`test_stage_spread.gd`): the first marker
of a stage is 2 000 to 8 200 m from the last marker of the one before, the stages use at least 15
districts and span more than 10 km both ways, and everything a moved stage places (markers,
kerbs, enemies, the vehicle parked for it) is on a street, outside buildings, on chunks the
regional world decodes.
How: `tools/rules/respace_stages.gd` moves each stage as a whole (first marker to the nearest
main road of the chosen district, the others at their original distances, the bearing searched in
15 degree steps for the least change, slid along the road until neither the marker, its kerb nor
the parked vehicle is in a building) and writes `tools/rules/stage_sites.json`;
`tools/rules/apply_stage_sites.py` folds it into `content.json` with the new texts. Kerbs for the
moved stops carry no hint (`kerbSide` 0) and are reproduced by `FareSpots` on the regional layout
(the v1 box does not reach Perambur or Besant Nagar). Parking: `auto-park` moved to the Perambur
pick-up; `car-chetpet`, `bike-saidapet` and `bike-kodambakkam` are new. Changed expectations in
the ported tests (stage order, "later stages start near the last end", district names of two
stages, the label of stage 2) are marked CHANGED with the reason.
Not moved: the 13 city jobs (their stops are still in Anna Nagar except four), life places and
the stories; the stage text for 13 stages names real roads and districts from the data.

### G-281: The minimap and the full map draw the world's own road data, at 10 Hz
`Minimap` (src/ui/minimap): a round translucent plate (`clip_children` on a disc, so no per-segment
clipping), roads in two weights as one `draw_multiline` each under one canvas transform, an arrow
for the player, the mission's marker as a glyph (shape per kind, colour per kind, see G-282),
and, off the plate, an arrow pinned to the rim with the distance in metres (`MapProjection`, pure
and tested). Turns with the player (what is ahead is up) or north-up: one saved option
(`MapSettings`), a row on the pause menu and the title's settings. Hazard zones and a followed
target (G-144) are drawn on it as before. The layer refreshes it at 10 Hz of game time and the
roads only after 100 m of travel (`MapRoadFeed.nearby`, from the layout's segment grid; no second
data source). Tapping it opens the full map.
`FullMap` (CanvasLayer 8): north-up roads of the neighbourhood (every street within 4 km, the main
roads of 12.5 km, read on a worker thread by `MapRoadFeed.wide_task`), the places with their names,
the mission's marker pinned to the edge with its distance, a legend of the kinds on the map, a
scale bar, drag to pan, + and - to zoom (four steps, 450 m to 5.2 km from the centre to the top),
ME to recentre, CLOSE and Back. It holds the game while open (unless the pause menu already has),
and carries "© OpenStreetMap contributors". Pause menu: MAP button.
The corner map sits under the PAUSE row, as large as fits without covering a button of either
control set (tested at 915x412, 640x320, 1830x824, right- and left-handed); on 640x320 there is no
such place and it is hidden (MAP in the pause menu still works). JOBS was under PAUSE since G-115
(same rectangle): it is now left of it.

### G-282: Markers say what they are
`MarkerKind` (src/missions): PICKUP, DROPOFF, MISSION, FIGHT, VEHICLE, PLACE, TARGET, each with
words ("Pick up", "Drop off", ...) and a colour (green, blue, amber, red, light blue, teal, white);
`MissionSession.target()` carries the kind. `MissionBeacon` was redrawn: a tall thin beam of light
whose width follows the distance (readable from 1 km), fainter near the camera; a floating icon
whose shape is the kind (arrow down, cube, diamond, cross, sphere, dot); a label that stays one
size on screen ("Pick up - 420 m"); a thin ring of the target's real size only inside 45 m (gone by
70 m); no filled discs. A target beyond 1 000 m is drawn at 1 000 m in its direction (the camera's
far plane is 1 500 m), with the true distance in its label. Places you can enter show their name
and a small ring only within 90 m (they were five teal rings visible all over the neighbourhood).

### G-283: Passengers are visible at the pick-up and on board
`MissionSession.upcoming_fare()` shows the people waiting at a stage's pick-up while the player is
still on the "get in the vehicle" objective (they used to appear only once the pick-up objective
was current). `FareFigures`: a waiting person faces the player and, within 220 m, waves
(`FareWave`: right arm raised, forearm swaying, set on the skeleton after each advance; there is
no wave clip in the cast, so it is procedural, and one call to replace); people inside the vehicle
are seated with the pose of agent/godot-anim (`SeatPose`, merged: hips on the seat anchor, `sit` 1.0), and
disappear after they step out at the drop. A patient is still not drawn inside the ambulance.

### G-290: One glass look for every HUD and touch button
Owner feedback on a phone: buttons boxy, too big, heavy yellow fill, the yellow PAUSE block ugly.
`UiTheme` is now the one factory (`glass_box`, `glass_plate`, `style_glass`, `icon_button`) and
`UiIcons` draws the few icons (pause, exit, jump) from lines, so no asset licence. A button is a
circle or pill of dark translucent glass (alpha 0.42) with a 1 px light outline and white
text or icon; the accent (amber) is only the thin outline of the primary action (ACTION on foot,
GO INSIDE, a dialog's main button) and the translucent fill of a pressed or held button. The drawn
shape is inset inside a larger hit area (`StyleBoxFlat.expand_margin` negative, or `TouchButton.VISUAL`
= 0.8), so PAUSE is 40 to the eye on a 48 target, ACTION 70 to the eye on 88 (was 104), GAS and
BRAKE are circles of 92 and 76 (were 100x124 and 100x100 boxes). JUMP and RUN keep a 70 hit
area because the 640x320 test needs 48 real pixels. EXIT and PAUSE are icon buttons, 48 each.
Nothing in `test_*_layout.gd` was loosened; `test_hud_glass.gd` adds the same checks (inside the
screen, 48 target, no overlap) for 915x412, 1830x824 and 2400x1080 on foot and driving.

### G-291: The performance overlay is off by default
The FPS line was on screen in play. `DebugSettings` (one class, save section `chennai-debug-v1`)
holds `perf_overlay`; `DebugHud` shows its panel (now top-centre, not top-left) only when it is on.
Switches: the pause menu row "Performance overlay: On/Off" and a hidden gesture, five taps within
0.8 s of each other on the top-left 64x64 (`CornerTaps`, pure, tested in game time).
`TouchControls` leaves touches in that corner unhandled so they reach the HUD. The perf agent's
overlay (`PerfOverlay`, `PerfWiring`) now reads `DebugSettings.shared().perf_overlay` and listens to
its `changed`; its Settings row and three-finger tap call `DebugSettings.toggle`. `QualitySettings.overlay`
is no longer read (the field stays, saved, so old saves load). One switch, one row id (`PerfOverlay`),
added by `PerfWiring` to both the pause menu and the title. The overlay's numbers and SWITCHES button
moved to top-centre under the FPS line (they sat top-left over the mission column).

### G-292: The top-right row no longer stacks JOBS under PAUSE
`MissionHud`'s JOBS button and the PAUSE button had the same rectangle (JOBS was hidden under
PAUSE and could not be pressed). The row is now, right to left: EXIT (driving), PAUSE, JOBS, with
8 apart and tests for it. The mission column moved up to the corner now that the FPS line is gone.

### G-240: The export leaves out what nothing loads
`export_presets.cfg` `exclude_filter` (both presets) drops `docs/*`, the legacy Three.js cast and
road vehicles (except `player.glb`, `people.json` and the motorbike) and the v1 world chunks
(`assets/world/c/*`). The sync tool's files stay in the repository unchanged. The filter has no
negation, so legacy people are listed by first letter. `tests/unit/test_export_size.gd` resolves
every cast member and vehicle through the real catalogs and fails if one is excluded, if shipped
text names an excluded file, or if a new legacy file would ship unreviewed. Release arm64 APK
162.68 to 115.00 MB locally (`docs/app-size.md`).

### G-241: Size guards on assets
`tests/unit/test_asset_budget.gd`: textures of 256 x 256 or more import VRAM compressed (flat
palettes under 16 KB excepted), no WAV over 200 KB (long sounds are Ogg Vorbis), no GLB embeds a
texture over 1024 px. Textures, audio and meshes were already within these rules, so nothing was
converted.

### G-242: What was measured and not cut
Generated LODs on models that author their LODs (-7 % per cast scene), tangents and shadow meshes
(under 1 %), the world tiles (deflate 2:1, xz would save only 17 %) and the cast's five animations
repeated in every GLB (0.1 MB each, 6.5 MB for 63) are documented with numbers in
`docs/app-size.md`; each needs a phone measurement or an architecture change, so none was applied.

### G-243: Budget in CI
`APK_BUDGET_MB` (260) at the top of `.github/workflows/godot-chennai.yml`: the "APK size against
the budget" step prints the phone APK size and the biggest items (`tools/apk_size_report.sh`) in
the job summary and fails above it; `PLAY_BASE_LIMIT_MB` (200) only warns. The phone APK is the
release export of the "Android" preset (arm64); the smoke APK is not budgeted.
## Taking over traffic (G-300 to G-309)

### G-300: TAKE OVER works on moving traffic and is wired in `Main`
Owner report: the player could not pull a driver off a running car or bike. `Carjacking` (G-128)
existed but nothing added it to the game, and its rule only took vehicles under 1.2 m/s.
`Main._add_carjacking` now makes `Carjacking.make(life, driving)` at the end of the "Parking the
vehicles" step and registers `Carjacking.offer` with the walking controls' `ActionContext` at
`P_TAKE_OVER` (35: above GET IN, below TALK). Rules: car, auto and bike only (`Carjack.KINDS`;
buses and ambulances carry passengers or crews, no rule for them), up to `Carjack.MAX_TAKE_SPEED`
(11 m/s, an estimate) within the usual reach, player on foot and not boarding. Stopped ones are
still swapped in automatically as before and the button then reads TAKE OVER for that vehicle.
For a moving one the AI step caches the candidate; pressing calls `request(id)`, and the next gap
between AI steps re-checks it, swaps the vehicle in where it is drawn (stopped dead, driver at the
wheel) and starts `Driving.enter` with the pull phase; the right-hand door and seat come from
`Boarding`. AI agents are never read from the UI thread. Pulled drivers (adults only by
`CastPicker`, tested) stagger leaning for 0.6 s, then run off; the agent returns to the pool out
of sight once the player is seated, and the player's `Vehicle` is a plain node the traffic pool
never owns (freed only when parked more than `Carjacking.FORGET` m away). `Wanted` has no
instance in the game yet, so `Carjacking.wanted` stays null and only `carjacked` is signalled;
the fall clips come with the animation work (staggering is the fallback).

## G-270: Crash bands by severity, mass share against traffic, contact angle
Owner's phone bug (24 Nov): hitting another bike threw the rider far. Cause: AI traffic is an
`AnimatableBody3D` (kinematic), so Jolt stops the player's vehicle dead as at a wall; the old rule
judged the vehicle's own change of velocity, so a motorbike at 40 km/h into a traffic motorbike
measured 40.7 km/h and was thrown (measured in the yard). Against a parked vehicle (a free rigid
body) the solver already shares the change by mass (35 km/h in: 19 km/h). Now `Vehicle` reports
the hit's other body through contacts (`contact_monitor` while driven, four contacts) and
`CrashRules.severity` scales the measured change by `m_other / (m_self + m_other)` when the other
body is fixed (traffic: the type's mass; the world: unscaled). Bands per kind: under 4 km/h
nothing; under `hurt_from` a **bump** (a wobble, no damage, the `bumped` signal, not a crash for
missions); under `fall_from` **shaken**; under `throw_from` a **fall** (open seats only: off to
the side at 35 % of the speed, 1 m/s up, lies 0.6 s and more); then **thrown** (keeps 70 % of the
speed, never more than the hit took). Bike: 18 / 27 / 35 km/h; auto: 18 / 24 / 38 (TD-29 threw
from 30); closed bodies have no fall band. Contact angle from the push the vehicle got: a
two-wheeler hit from the side falls from 75 % of `fall_from`; a hit from behind never throws.
Measured after (yard, `test_crash_ejection`): bike into a parked bike at 20 km/h, bump 9.3; into a
traffic bike at 20, bump 8.5; at 40, shaken 20.3 (was thrown 40.7); into a parked bike at 55,
fall 31.4 (rider peak under 0.9 m, slides under 5 m); into a traffic bus at 55, thrown 56.9; walls
unchanged (bike 24: shaken, 50: thrown; hatchback 50 shaken, 78 thrown).

## G-271: A wobble, not a launch, for small hits
Every felt hit rocks both vehicles (`Vehicle.wobble`): a decaying roll at 14 rad/s, up to 0.16 rad
on two-wheelers and a third of it on four wheels, gone in about a second; drawn only (the model,
and the rider who rides on it). The parked vehicle hit is shoved by the physics itself; traffic is
moved by the AI and does not yield (weak: no AI reaction to being hit).

## G-272: Crash effects are pooled multimeshes; damage stages on the body
`CrashEffects` (one per `DrivingWiring`, in `WorldOrigin.GROUP`): sparks (48), glass shards (48)
and smoke puffs (24) as three `MultiMeshInstance3D`s with fixed instance counts, moved on the CPU
from preallocated packed arrays and uploaded with one `multimesh_set_buffer` per pool and frame;
hidden while empty (no draw calls). No GPU particles: they compile a particle shader on first use,
do not run headless (untestable) and cost a process material each. The materials are warmed by
one hidden piece each for the first two frames. `DrivingWiring.burst_plan`: sparks 3 to 30 by
severity, glass for cars, autos and buses (a quarter for a bike's lamp, half the other's glass
when hitting a vehicle), none on a bump. Body damage (`Vehicle.damage`, 0.9 per km/h above 4):
from 15 dented (paint 20 % darker through the shared per-colour materials, the body sags 0.025 rad
and leans 0.015), from 55 wrecked (darker again, sags more, smokes from the engine).

## G-273: Effect cost
Measured headless on the desktop (bench, not committed): idle step 1 µs; all three pools full
(103 pieces) 94 µs mean per frame, no static memory growth and no new objects over 600 frames.
A real crash uses about 30 sparks and 36 shards for two seconds. On a phone (4 to 6 times slower
GDScript) that is about 0.5 ms for two seconds after a crash, inside the 2.5 ms budget; not
measured on a phone.

## G-274: Camera shake by trauma
`FollowCamera.add_trauma` (game-feel): offset ±0.16 m and roll ±0.04 rad scaled by trauma², three
sines per axis (no Noise resource, no allocation), decay 1.6 per second; written to the
`Camera3D`'s `h_offset`/`v_offset`/roll so the rig and the collision probe never move. Trauma by
band: bump 0.18, shaken 0.45, fall 0.65, thrown 0.9. `shake_strength` 0 with reduced motion
(`TitleMenu.platform_reduces_motion()` by default).

## G-275: Knockdown poses through a thin interface, with a fallback
`RiderLink` fires hooks `_show_fall(velocity)`, `_show_landed()`, `_show_getup()` on
`CrashFlight`'s phase changes (a link for any body can drive its figure from them). The player's
link is left to agent/godot-anim, whose `PlayerRiderLink._show_knockdown` calls the figures'
`play_fall`, `play_landed`, `play_getup` itself (its G-262); this branch keeps that file as on
feat/godot-chennai so the two merge without a double call (trial merge: no conflicts). Until
that lands the old tipped figure is the fallback. `CrashFlight.RISE_TIME` is 1.2 s, the figures'
`GETUP_TIME` (the same hunk as the anim branch).

### G-260: Procedural poses on the skeleton, after the clip, shared by every person
Seated, falling and the arm swing are poses written to the skeleton's local bone rotations after
the clip each update (`PoseRig`), not new clips: the CC0 library has no seated driving, fall or
get-up clips that match our vehicles, and a pose built from the vehicle's own measured grips fits
every vehicle and every member of the cast (different heights) without retargeting. One rig
helper serves the player (`HumanFigure`) and the streets (`PersonView`). Limbs use an analytic
two-bone solve that turns the current bend plane onto the wanted one, so knees and elbows keep
their hinge.

### G-261: Seats from the vehicle's model, hands follow the steering
`SeatPose`: hips on the seat, spine lean (40 % from the pelvis), legs and arms solved onto the
ride pose's footrests and grips, feet laid flat or onto pedals, fingers closed, head level and
turned into the steering (0.55 × wheel angle, at most 20°). The palms turn with the handlebar (1:1)
or wheel (2.5:1) about the manifest's steering axis; the model's `steering` node turns the same
way. Hand, foot and hub come from the model's nodes (`VehicleModel.measure_ride_pose`), because
the typed pose disagreed with the city bus's grips by 22 cm. A driver who cannot reach leans
further. The driver is drawn in closed vehicles too (G-265). Solves are cached per seat version.

### G-262: Falls dive, roll and lie on the back; get-up in 1.2 s
`Knockdown`: a throw faster than 4 m/s (or one from behind) dives head first and rolls three
quarters of a turn over its air time, landing on the back; a push falls backwards. Landing early
in the dive becomes a forward roll at 5 rad/s. Down: crumple, then lie (one knee raised, head
turned). Up: sit up on the hands, crouch on the knees, one knee, then blend into the clip;
GETUP_TIME 1.2 s, and `CrashFlight.RISE_TIME` was raised from 0.75 s to the same (0.75 s could not
show the four poses without the legs passing through the ground). Joints are kept 6 cm above the
ground once down. API: `play_fall(velocity)`, `play_landed()`, `play_getup()`,
`knockdown_state()`, `got_up` on `HumanFigure` and `PersonView` (docs/handoff.md).

### G-263: Arm swing read from the legs
`GaitSwing` reads each thigh's angle in the hips' frame and swings the arms with the opposite leg
(0.8 rad per radian of leg split while walking), turns the shoulders against the hips (0.3), nods
the head at footfalls and leans the spine (3° walking, 7° added running). Reading the legs keeps
it in step with any clip, rate or blend with no phase bookkeeping; it touches only local
rotations and value types (no allocation, no skeleton-wide update). The jog clip already swings
its arms far back, so the run adds no swing or shoulder turn (adding them crossed the arms into
the body), only lean and elbows bent to ~86°.

### G-264: Walk to run by speed on one stride cycle; quicker run cadence
Walk and run play on normalised one-stride timelines (`use_custom_timeline`), aligned on the
left leg's furthest-forward moment and advanced together at a blended stride rate, so a blend of
the two keeps the legs in step; the run's share follows speed from 2.6 to 4.0 m/s. Run clip speed
4.6 → 4.2 (about 186 steps a minute at 6.2 m/s); `PersonView` run 3.4 → 3.0.

### G-265: Drivers are drawn in every vehicle
With a seated pose, a driver in a car or bus no longer needs hiding; one figure costs what the
player on foot costs and shows through open doors and in screenshots.

### G-266: Passengers sit in the vehicle's own passenger seats
Fares take the model's passenger seats in order (`VehicleType.seats`), not the door anchor, so
two passengers never share a place; they sit down over the last two thirds of entering and stand
up in the first two thirds of getting out. Feet go to a floor about 0.32 m above the road (the
drop capped at 0.5 m for buses).

### G-267: Seat anchors from the model's drawn ground
The driver's seat, aisle, passenger doors and seats were measured from `chassis_to_model_y`, but
the model is drawn at the settled ride height (lower by the springs' sag): riders sank 7–10 cm
into seats. They are now measured from `VehicleModel.settled_ground`. Collision boxes keep their
frame (physics, not changed here).

## Performance on phones (G-250…G-259, branch `agent/godot-perf`, 24 Nov 2026)
Measurements and the owner's instructions are in `docs/performance.md`.

### G-250: One `QualitySettings` with three presets, High is the game as it was
`src/game_engine/quality/quality_settings.gd`: Low / Medium / High as one table of values, saved
in its own save-file section `chennai-quality-v1` (versioned, additive, like G-170), applied
live. High keeps every value the game had before presets (resolution, MSAA 2x, 2048 shadows at
40 m, 260 m streaming, 34/34 pools, six street lights, five physics catch-up steps), so tests
and tools measure the same game; headless runs always start at High.

### G-251: The default comes from the GPU name, the memory and the screen
`QualitySettings.detect(gpu, memory, pixels)` is a pure table with a unit test: unknown and
software GPUs, Adreno 610-639 (the Snapdragon 4/6 class, the owner's Adreno 613), Mali below
G68 and PowerVR start at Low; Adreno 640s/700-729 and Mali-G68+ at Medium (Low on screens over
3 Mpx); flagships at High; anything under 7 GiB of physical memory at Low (phones sold as 8 GB
report about 7.3 GiB). A preset the player picks is kept and never re-detected. The Settings row
cycles Auto → Low → Medium → High → Auto and shows what the level trades in a second line. Auto
also watches play: after a 5 s warm-up, ten seconds under 24 fps drop it one level (a toast says
so) and the lower level is saved as Auto's cap, so a weak phone that the table misjudged settles
on its own; a level the player chose is never changed.

### G-252: `QualityApplier` applies the engine part; the composition root the rest
3D resolution scale (FSR 1 on Medium under Vulkan, bilinear otherwise: Compatibility has no
FSR), MSAA, anisotropy, mesh LOD threshold, no positional shadow atlas (no light casts one), the
shadow atlas size and the sun's reach, the frame cap and physics catch-up steps, streaming
distances and builds at once, haze distance and far plane, rain density, real street lights.
`PerfWiring` (app) adds the traffic caps, figure rules, parked-vehicle reach, title rain layers,
landmark LOD ranges and the light ground/water shaders. The HUD and touch controls stay at the
screen's resolution (only the 3D buffer scales). The coordinator set Low at 75 % with short
1024 shadows for the Adreno 613 (the first brief said 60-70 %).

### G-253: The performance overlay and the perf log
`PerfOverlay` (ui) shows the numbers `PerfWiring` composes: frame average and worst of 120
frames, the scripts' main-thread time (two probe nodes that run first and last in each frame's
process and physics callbacks), the renderer's CPU and GPU time
(`viewport_set_measure_render_time`), physics catch-up steps, `Performance` maxima of the last
second (they are maxima, not averages: Godot resets them once a second), draw calls, primitives,
objects, video and texture memory, AI step and wait, traffic counts, chunk queues and worker
tasks, preset, 3D size, renderer, driver and GPU, a software-renderer or Vulkan-fallback warning,
hitches over 50 ms with what the last one was made of, and a verdict (`FrameStats.verdict`: a side
is busy at 75 % of the frame). Off by default; a three-finger tap or the Settings row toggles it.
Hidden, it builds no text and reads no monitors; the frame sampler, probes and GPU timer stay on
(a few µs) because the log needs them. `user://perf.log` is rewritten every 10 s (header with the
device, then one line per 10 s, the last 15 minutes, a first-against-last-minute drift line in
place of a thermal state Godot does not expose), and printed as `[perf]` lines (logcat). The pause
menu's summary row copies the log. When agent/godot-ui's DebugSettings key lands, the overlay's
on/off moves to it (one line in `PerfWiring`).

### G-254: Live feature switches and a safe mode
`FeatureSwitches` (app): twenty switches (traffic, crowds, parked vehicles, missions layer,
landmarks, decks, street objects, facade kit, trees, far buildings, water, prop colliders, ground
cover detail, water ripples, rain, shadows, street lights, sky, haze, the title's live city). Each
only hides, pauses or simplifies, never frees, so it is instant both ways; chunk layers are
applied to chunks shown later too. SAFE MODE turns all off, ALL ON back on. After each press the
frame time 1 s later is averaged over 3 s and compared with the average before the press; the
overlay ranks the measured costs. Switched-off features are saved (the owner can restart and
keep a configuration).

### G-255: The A/B APK on the Compatibility renderer is derived, not committed
`tools/compat_preset.py` copies the "Android" preset in CI to "Android Compatibility": the same
filters (the size work owns them), package name `…godot.compat`, label "Chennai Open World (GL)",
launch arguments `--rendering-method gl_compatibility --rendering-driver opengl3` (as the smoke
APK proves they work). The workflow exports it after the two others and restores
`export_presets.cfg`. Artifact `godot-chennai-apk-compat`.

### G-256: The AI step may lag on slow cores; physics catch-up is capped per preset
`CityLife.ai_patience`: the main thread waits for a running AI step only when it is that many
physics frames late (2, the old behaviour, on High; 6 on Low), moving the views on by
extrapolation meanwhile. `Engine.max_physics_steps_per_frame` 2 on Low with a 30 fps cap: when a
frame is slow the game slows down instead of running ever more physics steps per frame.

### G-257: Cheap, certain fixes
Street lights pick the nearest lamps with one scan instead of sorting every lamp four times a
second; mission entrance rings share one torus and material and are not drawn beyond 120 m.

### G-258: Figures and vehicles cost only where they show
`PersonView.animate_reach` (25 / 35 / 45 m) and the camera's frustum: a figure further or out of
view holds its pose (no clip, skeleton or skin update). `PersonView.shadow_near` 0 on Low and
Medium. Vehicle models cast shadows only from LOD 0 (within 28 m). Parked vehicles appear within
100 / 150 / 200 m. Trees, palms and street objects cast shadows only on High (each is one mesh
or MultiMesh per chunk, so any part inside the shadow's reach drew the whole chunk into it).

### G-259: Street lights never light the merged chunk meshes
Chunk meshes are on render layer 2 (`ChunkBuilder.RENDER_LAYER`) and the street lights' cull mask
leaves it out: a chunk mesh spans 250 m, so every lamp touched it and the Mobile renderer
evaluated it for every pixel of the chunk's ground and walls. The ground under a lamp gets an
additive glow pool instead (one MultiMesh, one draw call at night). Real lights still light
vehicles, people and loose props. T. Nagar at 18:40 under llvmpipe: 1378 ms a frame before, 662
ms after on High, about the 08:30 cost (654 ms).

### G-293: Settings lists scroll under a thumb, with a visible bar
Both settings lists (pause menu, title SETTINGS) are `ScrollContainer`s set up by
`UiTheme.touch_scroll`: `scroll_deadzone` 12 so a drag that starts on a row scrolls instead of
pressing it, `follow_focus`, and a 10-wide light scrollbar from the theme (the default was a
hairline). `test_settings_scroll.gd` scrolls to the last row in both at 915x412 and 915x458 and checks
it is inside the list and the screen. Every top-right button takes a real click at its centre and in
its padding (`test_hud_glass.gd`). Rows now in both menus: Time, Weather, Sound, (pause: the controls
rows), Graphics (`PerfWiring`, QualitySettings Low/Medium/High, "(auto)" when detected), Performance overlay.

## Performance, second round: the owner's phone (G-340…G-346, branch `agent/godot-perf`, 24 Nov 2026)

### G-340: A frame timeline names what a slow frame was made of
`FrameTimeline` (`src/game_engine/quality/`) cuts every frame at its edges: two probe nodes run
first and last in every physics and process callback, each queues a deferred call that marks the
end of the deferred calls, and the renderer's `frame_pre_draw` / `frame_post_draw` signals mark
drawing (order checked on 4.7.2: process callbacks, deferred calls, timers, tweens, the delete
queue, then drawing). Parts: physics scripts, physics deferred calls, physics engine (step, sync,
contact signals), scripts, deferred calls, timers/tweens/frees, render, between frames. A frame
over 50 ms in play logs a hitch line with the parts largest first, the streamer's frees, bodies
and views that frame, the traffic's share (and how long the frame waited for the AI step), the
change in nodes, objects, pipeline compilations (Vulkan only), mesh and texture memory, and the
main thread's own time on a core against its time waiting for one (`ThreadClock`, the kernel's
`/proc/<pid>/task/<tid>/schedstat`, Linux and Android; about 2 µs a read). The log keeps the last
eight hitch lines and a tally of which part led each. Cost: a few µs a frame.

### G-341: An Adreno 613 starts at Low; old saves do not keep their level; the overlay steps aside
The owner's POCO M6 Pro ran High. The detection table gives Low for "Adreno (TM) 613" (tested with
that exact string); the level came from a save of an earlier build whose Settings row cycled
Low → Medium → High with no way back to Auto. The save section is now `chennai-quality-v2`: a v1
section keeps its feature switches, never its level (back to Auto, detected again). Auto is also
detected again once the renderer is up (`refresh_auto`). The overlay names the level and how it was
set ("Low (auto)", "High (chosen)"). Auto's first check after the 5 s warm-up is a 4 s window (then
10 s windows), so a level the table guessed wrong is left within seconds. The overlay (layer 7) is
under the title and pause menus (layer 8, G-350) and hidden while paused or while a menu or the
Jobs list is open.

### G-342: Low cuts the pixel cost: 65 % resolution, per-vertex lighting, hard shadows
The phone was GPU-bound (56 ms GPU at 2460x1080, MSAA 2x). Low now renders 3D at 65 % with the
bilinear upscale (FSR 1 is an extra full-screen pass), no MSAA, an 18 m hard-filtered shadow, and
lights the city per vertex: `CityMaterials.set_flat` sets the shared walls, roofs, kit, objects,
foliage, landmark and deck materials to `SHADING_MODE_PER_VERTEX` and swaps the ground and water
to a copy of their shader with `vertex_lighting` and no specular. The city is flat faces, so the
sun and ambient look the same; what is lost is the glint. Medium and High keep per-pixel lighting;
Medium also takes hard shadows. Applied live with the preset.

### G-343: No specular on the city's rough materials
Every vertex-coloured city material (roughness 0.8-1) has `specular_mode` disabled at every level:
it added almost nothing by day and cost a GGX term a pixel. It is also the first suspect for the
single-pixel white dots the owner's Adreno 613 drew along the glass streaks and on walls
(half-precision specular on the Mobile renderer); that cause is not proven: the software Vulkan
here does not reproduce the dots.

### G-344: A new AI area is adopted on the AI thread
`AiPopulation.adopt` (every agent moved onto the new road graphs, the crowd field rebuilt) ran on
the main thread whenever the player had moved 500 m or jumped (play start, missions): 70-340 ms
frames on the desktop. CityLife now hands the finished area to its AI thread together with the
next step (`_adopt_and_step`); that step may lag up to `ADOPT_PATIENCE` physics frames before the
frame waits for it (the views extrapolate meanwhile), and the signal heads switch when it is done.
No new area is requested while one is pending or being adopted, so `population.area` is only
written by the thread that owns the step.

### G-345: The title reads the night level without asking the render thread
`TitleWiring._rain` read `RenderingServer.global_shader_parameter_get` every frame: on Vulkan that
is an editor-only call that syncs with the render thread (the engine prints an error). It reads
`CityEnvironment.night_level`, set beside the global parameter, instead.

### G-346: Pipelines compile at load, never on a state change
Found with the timeline under software Vulkan: the first frame of play took 2.0-2.2 s, all of it
"render", with 17 draw-time pipeline compiles (32 in the first 1.5 s of play). `PerfWiring.apply`
runs at every state change (loading, title, play, pause, resume) and set the directional shadow
atlas size each time; with the soft-shadow filter level it is a renderer-wide setting, and setting
it again recompiled the scene's pipelines. `QualityApplier.apply_engine` now sets both only when
they change: the same run's first frame of play is 95 ms and no pipeline compiles in play (0-2 in
4 s driving). On the phone this would be a freeze at every play start, pause and resume (not yet
confirmed there). At the end of loading `ShaderWarmup` also draws a walker and one traffic vehicle
of every kind in front of the camera for three frames (with the play HUD) behind the loading
screen; measured, it changes little after the fix above (pipelines in the first 4 s of driving:
2 without, 1 with). It stays for the Compatibility renderer, whose GL shaders compile on first
draw and are not counted. `CHENNAI_NO_WARMUP=1` skips it for measuring.

## G-350: TouchScroll, one gesture owner for every scrolling menu
Owner bug (phone, build afed12f): menu lists moved a little or jumped under a finger. The engine's
`ScrollContainer` drag depends on which child takes the press and on touch versus emulated mouse
events (the project has `emulate_touch_from_mouse`; Android also emulates mouse from touch, so one
finger arrives as both). `TouchScroll` (`src/ui/touch_scroll/`) owns the gesture in `_input`: the
first family (touch or mouse) to press owns it and the other's events are swallowed; a press is held
back, over 10 px it becomes a one-to-one drag (rubber band past the ends, 0.45 of the finger),
a release then flicks (friction 3.2/s) and springs back from an overscroll; under 10 px it is a tap and
a mouse click is replayed at that spot so the right row presses. The bar (18 px, `BAR_WIDTH`, plus 6 px
of slop) is dragged by the same code, so it works with pure touch too. When the list fits, nothing is
intercepted. `UiTheme.touch_scroll()` makes one; pause, title SETTINGS and CONTROLS, the Jobs dialog and
the overlay list use it. `step(delta)` is the clock, so tests drive it with 1/60.
Layers: pause and title are CanvasLayer 8, above the performance overlay (7); the overlay also hides
while the pause menu or the Jobs dialog is open (`PerfWiring._modal_open`).
### G-360: A kinematic body that jumps does so with its box off
Root cause of the owner's report on afed12f ("when I entered the bike I was thrown away for a long
distance"). Jolt moves every kinematic body to a transform set from code with `MoveKinematic`
(velocity = jump / step), even an `AnimatableBody3D` with `sync_to_physics` off. `Carjacking` hides
the taken agent's `TrafficVehicleView` (box disabled) and puts the drivable bike exactly where it
was drawn; when the player sits down, the agent is let go to a new place out of sight
(`AgentSystem.let_go(respawn)`) and `CityLife` shows the view again (box on) and poses it there in
the same frame. In that step the view swept from inside the bike's box to its new place at
thousands of m/s: whenever the way out lay along the contact normal, the bike got 133 to 500 m/s
(Jolt's cap), the hit judge measured 230 to 1950 km/h against a traffic view and the rider was
thrown tens of metres (reproduced: `test_traffic_view_teleport.gd`, 499.6 m/s; in `main.tscn` 2
of 3 runs of four take-overs). The same happened to anything touching a visible view that the AI
re-placed (a stuck agent respawned). Fix: `TrafficVehicleView.set_shown` and `set_pose` turn the
box off for the step of any jump (shown again, or moved more than `JUMP` 1.5 m beyond its speed)
and back on one physics step later at the new place. Rejected: `sync_to_physics` (already off;
it is not what decides), teleporting through `PhysicsServer3D.body_set_state` (the same path).

### G-361: The player's body becomes solid a step after leaving a vehicle
The player's `CharacterBody3D` is kinematic too: put on its feet with collisions back on in the
same frame, it swept from the seat inside the vehicle's box and shoved the vehicle (a hatchback
left through the far side got 82 m/s). `PlayerController.exit_vehicle` now restores the layers one
physics step after the move (the body neither moves nor falls that step); a crash throw
(`PlayerRiderLink.throw_off`) stays solid at once: it already passes through its own vehicle by
a collision exception and must collide to fly.

### G-362: People hit by the player's vehicle react, by band; never a child
`StreetHits` (pure, `src/ai/`) and `StreetReactions` (`src/app/city_life/`). The driven vehicle's
box, swept over the AI step (30 Hz), is tested against walkers and crowd people within 8 m.
Bands by its speed: below 1 m/s nothing (people already make way), 1–4 m/s a **stagger** (the
walker leans back and the AI's fear makes them step back or hurry on), from 4 m/s (14 km/h) a
**fall**: `PersonView.play_fall(launch)` (60 % of the vehicle's speed, a little away from its line,
1.2–3.2 m/s up), a ballistic flight and slide stopped by walls and following kerbs (rays only
while in motion), `play_landed`, lying 2.2 s, `play_getup`, then the walker agent (held meanwhile,
moved to where they lie so traffic stops for them) is handed back where they stood up. The
vehicle loses 10 % of its speed (`Vehicle.knock`); it is not a crash for the driver. A traffic
**rider** (open seat) whose vehicle takes at least its kind's `fall_from` (the other side's share
of the severity) falls off; the agent is held and its view leans (a bike on its side, an auto
0.12 rad) until the rider has got up and walked back (at most 4 s), then rides on. Car and bus
drivers only honk (G-273). **Children:** `StreetHits.can_be_hit` is false for a child or a spot at
play and is checked before any touch test; figures are checked again against the cast's minors;
walkers and drivers are adults by `CastPicker`. All speeds are game-design estimates.

### G-363: CityLife's incident hook
`CityLife.incident(what, at)` (`person_down`, `stagger`, `rider_down`) through `report_incident`,
which also makes crowd people within 8 m turn to face the spot for 4 s; `StreetReactions` scares
walkers within 8 m (stop and step back if facing, else run off), makes the nearest traffic vehicle
within 30 m honk 0.6 s later (`honk` → `VehicleSounds.on_reaction`) and reports
`pedestrianInjured` to `wanted` only when the game has a `Wanted` (none yet). `CityLife.downed`,
`downed_crowd` and `stagger` tell the views who is drawn elsewhere or leaning. Cost: the touch
test 44–48 µs per AI step when nobody is touched (desktop, headless), only while driving faster
than 1 m/s; a knockdown costs 1.1–1.8 ms once (the first figure of a person is instantiated; it
is kept for the next incident).

## The railway (G-320 to G-334), branch `agent/godot-railway`

### G-320: The Three.js railway is reused through a Python port of its builder
`tools/rail/build_rail.py` is a line-by-line port of `packages/rail/src/build.ts` with the line
specs of `scripts/build-rail.ts`. `--threejs` rebuilds the Three.js `rail.json` from the same OSM
extract (`chennai-open-world/assets/osm/rail/chennai-rail.osm.json`, read in place) and the tests
(`tools/rail/test_build_rail.py`, run in CI) check it matches the committed file value for value.
Nothing about the lines is derived again. Lines are clipped to the Three.js map box as before
(trains appear and vanish 150 m beyond it): the extract only covers that box (plus 500 m), so a
larger box would only end lines at the data's edge, and the Beach end would turn into a terminus
with no station in the data. Running trains to Tambaram, Chengalpattu or Gummidipoondi needs a
rebuild from the regional Tamil Nadu extract (the transit branch has the lines; not merged).

### G-321: One network file, `world/rail/rail.json`
The game, the AI's station places (`AiArea.RAIL`) and the tests read one file. It holds the
Three.js file's two lines, tracks and stations unchanged (test `test_rail_file`) plus every other
passenger route relation the extract covers with track and a stop on the map: Chennai MRTS both
ways (13 stations), Chennai Central to Arakkonam and to Sullurpeta, and the express services out
of Central (Coromandel both ways, Charminar both ways, Shatabdi both ways, Rajdhani, Saptagiri).
The format is the Three.js one with additive keys (`format`, `note`, `crossings`, per line
`system`, `train`, `motion`, `heights`); the synced `assets/world/rail.json` stays for comparison.
Not included because the data does not have them: Chennai Metro (stations only), the
Tambaram–Chengalpattu line, Chennai Fort and Beach stations, MRTS stops south of Indira Nagar.
Coverage table: `world/rail/RAIL.md`.

### G-322: Termini on the map, train types, conflict-free offsets
Lines that start or end at Chennai Central (not beyond the map) stand at the platform for a
terminus dwell (120 s EMU, 150 s express) instead of entering at line speed from the buffers
(`RunProfile` `start_standing`/`end_standing`; both off is motion.ts exactly). Each line carries a
train type and its motion figures (estimated): EMU/AC EMU 0.8/0.9 m/s², 22 m/s; express 0.4/0.6,
25 m/s. Headways are estimates (MRTS 15 min, Central suburban 20, each express every 2 game hours;
the real expresses run daily). The builder moves each new line's offset a minute at a time until
no train comes within 130 m of another line's train on shared track over the two-hour cycle; a
GDScript test checks the same on the game's own timetable.

### G-323: The MRTS on its viaduct (estimated height)
OSM tags the MRTS as `bridge=viaduct`/`layer=1`, without heights. Points whose nearest member way
is elevated stand at a rail-top formation of 9 m (estimated), ramps at 1 in 40; platforms are
level (points added at their ends). The view draws a deck, parapets and piers every 30 m; the deck
is solid; each MRTS platform has a stair to the street. Ground tracks are drawn flat as in Three.js.

### G-324: Tamil names not in OSM are transliterations that need native review
Eight MRTS stations have no `name:ta`; `TAMIL_ESTIMATED` in the builder gives transliterations,
marked * in `RAIL.md`. Boards draw Tamil above English with the full Tamil Noto font already in the
project (`assets/city/noto-sans-tamil-categories.woff2`). Hindi names from the Three.js file are
kept in the data, not drawn (the owner asked for Tamil and English).

### G-325: Track as merged chunk meshes on worker threads
`RailIndex` cuts tracks and elevated lines into ≤20 m pieces per 250 m world chunk (the world's
own grid) with the distance along each track. `RailGeometry` builds a chunk on a worker thread:
ballast with a sleeper texture (concrete sleepers every 0.65 m drawn into a 128×64 texture made
by code, not geometry), two rails per track, the viaduct, all one vertex-coloured material: one
draw call. The overhead line (masts every 60 m on the side with room, cantilevers, contact wire
5.5 m and catenary 6.9 m above the rail) is a second mesh with its own visibility range, not
built at all on Low. `RailTracksView` streams its own chunks round the player (600 m on High), at
most two builds at once, one chunk added per frame. No per-object nodes, no lights.

### G-326: The owner's cab prototype, ported as rules
`CabDrive` is the prototype's simulation on a real `RailLine`: nine notches EMG…P4, effort ramping
at 2.2/s up and 1.6/s down, power fading towards 29 m/s, resistance 0.02 + 0.00045 v², doors
interlock, limits 40/60/80 km/h by distance to a stop (prototype rule, estimated), overspeed −10
after 2.5 s, stop scoring (±3 m perfect +100, ±8 good +60, short +25, far 0, overrun −40, missed
−60), moving with doors open −30, a starter signal 6 m past each stop mark: red while this train
stands with its doors open or a timetabled train is within 400 m beyond it, yellow within 900 m;
passing it at danger −80. Taking over a standing timetabled train hides that departure for the
rest of its run; same-line trains up to 400 m behind wait out of sight; a train the player leaves
stands at the platform 4 minutes or until the player is 300 m away.

### G-327: Level crossings from OSM, closed by the timetable
Mapped `railway=level_crossing` nodes within 3 m of a drawn track (five on the map; one on the
Beach–Tambaram line, the others on yard and freight tracks without timetabled trains). Booms come
down 35 s before a train's front reaches the road and go up once its rear is 8 m past; they swing
in 6 s. The road is taken as square to the track (OSM's crossing node gives no road direction).
While a boom is not up, `CityLife` holds traffic at points across the road (an additive
`extra_obstacles` hook). There is no bell recording: rings are counted, not heard.

### G-328: Trains as MultiMeshes of merged cars
`TrainModels` merges each car GLB (all LODs) into one mesh per material, keeping the sliding door
leaves apart; `TrainsView` draws every car of a type and LOD as one instance of one `MultiMesh`
and the doors of near cars as another, so all trains in view are a handful of draw calls. Rakes
are four cars (cab, motor, trailer, cab reversed; WAP-7 and three LHB coaches), as the Three.js
game, because the estimated 110 m platforms and the timetable are sized for that; real EMUs run
9 or 12 cars. Wheels and bogies do not turn. Cars within the solid range get pooled kinematic
boxes.

### G-329: Stations from the Three.js layout
`StationLayout` (port of station.ts) gives each drawn platform its services, numbering and exits.
The view builds the deck along the curve, yellow edge lines, ramps, a shed, yellow name boards
with black letters (the Indian Railways scheme, no emblem), the departure board, the drivers'
red STOP board where a train's front stands and the starter signal. OSM's own `platform` outlines
from the detail layer are still drawn by `DetailMeshes` where mapped; they are not merged with
these (a duplicate slab can show at some stations: weak spot).

### G-330: Railway HUD in the glass style
`RailHud` (ui module, plain data in, signals out): station chip with the next train, TIMETABLE
sheet with departures and a route map of every line (until the nav agent's map is merged), the
passenger's STEP OFF / SIT / VIEW, the cab's lever, dial, HORN, EMG, doors and LEAVE CAB. Panels and
buttons are `UiTheme.glass_box` (`RailHudStyle` adds only margins). The info chip and TIMETABLE sit
bottom centre: the top-left belongs to the mission HUD and the top-right to PAUSE.

### G-331: Riding inside a car
The player's body follows an anchor moved through the doorway (an additive
`PlayerController.vehicle_gait` makes the figure walk while held), then on a bench or by the door.
The car models are outside shells with painted windows, so `CoachInterior` draws a small interior
(floor, ceiling, walls with window openings, benches, poles; a cab desk and windscreen frame)
round the rider; the inside camera looks out on drag. VIEW switches to the chase camera outside.

### G-332: Platform crowds through `CityLife`'s figures
`StationCrowd` (port of crowd.ts) runs for the two platforms nearest the player; its people are
drawn by `CityLife`'s pool through an additive `extra_people` hook, adults only (no child is ever
on a platform edge or in the railway's crowd), at most 16 within 70 m (8 on Low).

### G-333: Wiring
`Main` gets a fifth loading step, "Running the trains" (real work: the network, index, layout and
car models on worker threads). `RailwayWiring` adds the HUD layer, tickets from the mission
session's balance (saved), BOARD THE TRAIN on the ACTION button, the crowd and crossing hooks.

### G-334: Quality presets
`Railway.PRESETS` by `QualitySettings` level (Low/Medium/High): trains drawn 4/6/8 within
520/700/900 m, LOD distances ×0.6/0.8/1, track 450/520/600 m, overhead line off/160/220 m, crowd
figures 8/12/16. `RailwayWiring` applies `QualitySettings.shared().preset` and follows its
`changed` signal, so the level changes live with the rest of the game.


## Hero landmark models (G-390 to G-393, agent/godot-hero), 25 Nov 2026

### G-390: A hero model is textured by one atlas, not drawn in triangles
Chennai Egmore and Kathipara Junction are `hero: true` specs. Their kit scripts (`hero_station.py`,
`hero_flyover.py`) paint ONE 512 px atlas (`<id>_atlas.png`, numpy, seeded noise, PNG written by hand so
the bytes repeat; `tools/blender/landmarks/atlas.py`) and give every face a `Tile` (region, tint, part of
the region). `lkit.export` turns tiles into UVs: each face is laid flat on its own plane (walls: u to the
right seen from outside, v up) and its bounding box is stretched over the tile; patterns that repeat along a
wall or deck are painted for a fixed length and laid end to end (`Acc.strip`, last piece cropped, so the
pattern is never stretched). Windows, arches, brick, balustrades, kerb stripes and clock faces are paint on
bay quads: Egmore is 3,676 / 770 / 124 triangles (LOD0 / LOD1 / LOD2), Kathipara 4,180 / 1,465 / 336, against
the budgets LOD0 < 6,000 and LOD1 < 1,500 (`LandmarkSpec.HERO_LOD0_MAX`, `HERO_LOD1_MAX`; other landmarks keep
5k..15k). The PNG is imported VRAM compressed with mipmaps (the kit writes the `.import`); 140 KB PNG and
about 350 KB in VRAM each. The GLB has UVs and vertex colour as a tint, no embedded image; `LandmarkModels`
builds the material (`atlas_material`: albedo atlas x vertex colour, no specular) from `spec.atlas.file`.
Non-hero landmarks are untouched (vertex colours, shared material).

### G-391: Entrances, peace zone and facts card are spec data
`spec.hooks` = `entrances` (id, world point, outward normal, width), `peace_zone` (centre, radius, reason) and
`facts_card` (titles, `facts` = the spec's sourced facts). The spec had none of these, so they are new; no
system reads the peace zone yet (data only, stated in its `reason`). Egmore's two entrances are the carriage
portals on the south faces of the porch towers; the kit prints their points (`HOOK` lines) and the spec holds
them; a test checks they stand on the building front and face the nearest drawn road (cos > 0.6).

### G-392: Kathipara is a detail layer on the chunk builder's own decks
`DeckMeshes` already draws slab, fascia, 1 m parapets and plain piers from `Road.heights` (G-150, G-151). The
model repeats none of that. The spec keeps a copy of the 83 road pieces within 300 m (`decks`, written by
`tools/landmarks/make_kathipara_spec.py` from `tools/landmarks/dump_decks.gd`); the kit ports DeckMeshes' rules
(profile samples, mitred normals, piers every 30 m of the whole road, columns at a quarter of the width, none on
a lower road, no parapet where a ramp leaves a deck) and adds, within 200 m of the junction: coping on both
parapets, black-and-white painted kerb stripes (16 m tiles), steel expansion-joint plates over the piers, red
and white painted guards round the pier feet, lamp posts every 30 m on alternate sides (collision boxes), and
six gantry boards (`spec.boards`). The boards' Tamil and English lines are `Label3D` (the sign font), three
approach boards with the junction's own name, three exit boards with place names (Guindy, Pallavaram, Ashok
Nagar) whose direction comes from the road bearing, not from a sign; Tamil needs native review. A test compares
the copied pieces with the live world, so a rebuilt world fails it until the spec is regenerated. Heights are
the world's estimate (13 m upper deck); the model top (20 m) is the lamp heads over it.

### G-393: Tests and what "no overlap with roads" means
`tests/unit/test_hero_landmarks.gd`: budgets, one VRAM-compressed atlas under 1.5 MB in total, UVs inside the
atlas, same hashes and same meshes twice, one shared material and nothing running per frame, footprint fit
(Egmore ground geometry within 0.35 m of the OSM outlines), doors facing the road, no ground geometry on a
drawn carriageway, Kathipara details on the live decks, boards Tamil and English, licence rows. OSM's own
Egmore outline already touches the (estimated 14 m wide) Gandhi Irwin Road at the east porch, so only geometry
more than 0.4 m outside the outlines is tested against carriageways. `test_landmarks.gd` skips the outline
checks for `overlay` specs (no outline).

## Road detail (G-310 to G-313)

### G-310: Roads are styled by class, from data, not by hand
`RoadStyle` maps a road to arterial, residential, lane or flyover (kind, width, raised) and holds
the numbers (footpath width, verge, tree and pole pitch, species weights). Surface, wear, paint fade
and kerb colour come from a hash of the way id (`id / 10`), so a road looks the same in every chunk
and every piece. `RoadDetail` plans a chunk from it (plain data, worker thread); nothing is stored in
the world files. Everything OSM does not map is estimated and said so (`docs/roads.md`).

### G-311: One ground surface, sixteen atlas tiles
The ground atlas grew from 8 to 16 tiles (worn asphalt, concrete, footpath slabs, laterite, black-white
kerb, dark iron, yellow and faded paint), layers 20 to 27 (8 to 19 stay the covers). Paint pieces are
chosen fresh or faded by hash, solid lines come in 6 m pieces with a few worn away, crossings and
stop lines stand on junction nodes. All of it is flat geometry in the chunk's one ground surface; the
shader adds one noise octave on the road surfaces only. Footpaths are 0.12 m (the kerb stays 0.15)
and have no collider, like the kerbs.

### G-312: Four tree silhouettes, two draw calls
A MultiMesh holds one mesh, so the rain tree is the neem mesh stretched 1.55 wide and 0.82 high
and the palmyra the coconut mesh stretched 0.72 wide and 1.3 high, with a tint per species; a chunk
keeps its two tree draws. Streets that the world builder planted nothing along (residential, lane)
get trees from `RoadDetail.trees_on`, kept 1.5 m clear of every carriageway and out of buildings.

### G-313: Wires, shrubs and guards ride in the objects surface
Overhead wires (two per span, four steps of sag), median shrubs and tree guards are appended to the
chunk's objects mesh; poles of streets that had none join the colliders. No per-object light.

### G-314: A rural class for open country
A chunk with fewer than 30 buildings is open country: its arterials lose the kerb and footpath and gain a
narrow dust shoulder, kerb blocks on the outside of bends, W-beam barriers and chevron boards on sharp bends,
kilometre stones and palmyra rows (from the owner's photographs, `docs/roads.md`). All geometry merges into the
chunk's ground and objects surfaces; barriers and chevrons have no colliders.

### G-315: Road condition from class and a seeded area hash
`RoadStyle.condition` gives good, worn, damaged or unpaved from the class shares, a hash of the way id and a hash
of the 600 m square the road starts in. Five more ground tiles (stripped tar, mud, muddy water, brick, wet ruts)
make the atlas 21 tiles; ruts, edge lips, stripped patches, puddles and rubble are flat ground geometry. Puddles
are a shiny tile, not a reflection. `RoadStyle.feel` is the data the vehicles may read (speed, bump, grip); wiring
it into `RaycastVehicle` is left to the driving owner.

### G-316: Five lamp kinds by road, one glow draw call
Poles are `StreetFurniture.Pole.kind`: `arm` (single-arm maroon steel 9 m, 2.5 m curved arm, cobra head, concrete
base; arterials and residential streets), `twin` (10 m, two arms in opposite directions, every 30 m on medians),
`mast` (25 m, ring platform with twelve flood panels, one per junction of four arms or a three-arm junction on a
road of 12 m or more), `rural` (7.5 m thin pole with a sign plate; open country, lanes and unpaved roads). All
are merged into the chunk's objects surface (no new draw call). At night `StreetLights` draws every lamp as one
instance of one additive mesh (crossed halo quads and a ground pool quad, unshaded, tinted per lamp: cool white-blue,
warmer on residential streets): one draw call whatever the count; the six real lights near the camera stay as in G-88.
Lamp heads are `RoadLamps.heads` (`Build.lamp_points`, built on the worker); `set_lamps` takes the head height in y.
With the performance work merged (G-259) the one glow mesh is also the ground's only street light: the real
lights' cull mask leaves out `ChunkBuilder.RENDER_LAYER`, their number follows `pool` (0 / 2 / 6 by preset), and
the glow node is hidden while the night level is under the threshold (no additive draw by day). The separate sodium
pool MultiMesh of G-259 and its 140 m `visibility_range_end` are gone: one node spans every lamp of the city, so a
node-level range could only hide all pools or none. The pool quad is 13 m across under a 9 m head (G-259's size; it
was 9 m on the roads branch, where the real lights still lit the ground) and sits 0.2 m higher in the shared mesh so it
clears the 0.15 m footpath a lamp stands on.

### G-317: Optional road detail follows the quality preset
`ChunkBuilder.Kit.road_extras` (0 Low, 1 Medium, 2 High, the same numbers as `QualitySettings` in agent/godot-perf) gates
the optional detail: Low drops tree guards, median shrubs, overhead wires and rubble; Medium drops guards, shrubs and
rubble but keeps wires; High keeps everything. Markings, kerbs, footpaths, ground tiles and lamps stay at every level.
`CityWorld.road_extras` carries it (default 2, so tests and tools see High). The perf wiring should set it from the
preset: `city.road_extras = QualitySettings.shared().preset`; this branch does not reference `QualitySettings` (not in
`feat/godot-chennai` yet). Chunks already built keep the level they were built with.
Merged with the performance branch: `PerfWiring.set_road_extras` sets `CityWorld.road_extras` and the streamer's kit from
`QualitySettings.preset` when the city joins Main and on every apply. `test_perf_wiring.gd` checks it on Low and that a
game started at Low builds chunks with no wires, shrubs, guards or rubble but with lamps and crossings;
`test_road_detail.gd` checks the same per level on plans and builds.


## Hero landmark models (G-390 to G-393, agent/godot-hero), 25 Nov 2026

### G-364: Agents change only between the AI's steps (the signal-11 crash)
Root cause of the segfault in the full run on agent/godot-merge-12 (in
`test_taking_over_traffic_in_a_crowded_street_never_throws`, after "The caller thread can't call
the function propagate_notification() on /root"). `Carjacking._on_boarding` scared the walkers
(`AgentSystem.scare`, an insert into the `_fears` dictionary) on the "pulled" boarding event, which
`Driving` emits from its physics step: while `CityLife`'s AI thread may be running
`population.step`, which reads and erases the same dictionary. A concurrent insert and erase can
rehash the dictionary under the reader and crash the AI thread; Godot's crash handler then sends
`NOTIFICATION_CRASH` to the root from that thread, which is the thread-guard ERROR line printed just
before "Program crashed with signal 11". It came from agent/godot-take; the take-over tests made
it frequent (several pulls per run), and the AI step overlapping more frames since the
performance round (areas adopted on the AI thread) widened the window. Fix: the scare is queued and
done in `Carjacking._step` (between steps). Guard: every `AgentSystem` method that changes agents
from outside the step calls `on_change`; `CityLife` counts and `push_error`s a call while its step
may run (`stats.off_step_changes`), and the take-over, boarding-safety and street-reaction tests
assert it stays 0 (with the old code both take-over tests read 1).
## G-380 to G-389: The tree kit (phase 7, branch `agent/godot-trees`)
Owner: "trees need improvement". Details, the photograph notes and the measurements are in `docs/trees.md`.

### G-380: Models in code, one atlas painted by script; no Blender, no downloaded assets
Eighteen species with three LODs each are built from leaf cards and tapered tubes by `TreeModels` (packed arrays,
a worker thread, about 6 ms, deterministic), not exported from Blender: the brief allowed either, and code needs no
GLB import, no version of Blender in CI and no third-party licence. The leaves, fronds, blossoms and bark are one
1024 x 512 atlas painted by `tools/trees/bake_tree_atlas.py` (Pillow, drawn shapes): CC0, original, row in
`assets/LICENSES.md`. Imported VRAM-compressed with mip maps: 0.7 MB in video memory against a 1.5 MB limit (tested).
`assets/trees/atlas_layout.json` is the one source of the tile rectangles and is in the export include filter.

### G-381: Species, silhouettes and triangle budgets per LOD
neem, rain tree (wide flat crown, limbs), banyan (aerial roots, prop roots, huge crown), tamarind, gulmohar (red
blossom cards), coconut (curved trunk, arched fronds), palmyra (tall slim trunk, fans, dry skirt), mango, peepal,
casuarina (drooping needle tiers); oleander, bougainvillea, croton, grass tuft, dry scrub; three dead trees. Budgets
(`TreeModels.BUDGET`): trees and palms 330 / 110 / 36, bushes 90 / 36 / 12, grass 30 / 14 / 6, dead wood 220 / 70 / 24;
each LOD lighter than the one before (tested). The old two meshes (`CityModels.tree`, `.palm`, G-312's four silhouettes
by scale) are replaced; the roads work's species names (`neem`, `rain`, `coconut`, `palmyra`) are kept.

### G-382: One alpha-cut shader, wind in the vertex stage, wind level in UV.x
`trees.gdshader`: alpha scissor (no sorting), both faces shaded from the crown's normals, the MultiMesh colour as the
tint. Wind weight per vertex rides in the integer part of `UV.x / 2` (0..8), because vertex colours and UV2 did not
reach shaders reliably under Compatibility (G-52). `sway` 0 turns the wind off (Low). `CityMaterials.trees` replaces
`foliage` and follows `set_flat` (per-vertex lighting on Low), `set_wet` and `set_night`.

### G-383: Species from the place, plants kept clear, a species cap per chunk
`TreeStyle` (weights by district palette, park or beach under the tree, avenue beside it, mapped tree) and `TreePlan`
(filters, size, lean, tint, rank, bushes and scrub, at most 7 tree and 3 understory species a chunk). The files carry no
species tag and no landuse=forest, so the species is an estimate from a hash of the position; the palette's boundary
circles give the district. Nothing stands in a building, on a carriageway, in water, through a deck or near a track:
`Kit.rail_index` is set by the railway when it is built and `CityWorld.set_rail_index` prunes chunks already shown.
The old `PALMS := 0.4` share and `SPECIES_SCALE`/`SPECIES_TINT` of G-312 are gone.

### G-384: One `TreeBatch` a chunk, a MultiMesh per species and LOD
`Build.tree_batch` (node `Trees`). `Build.surfaces` still counts only the merged geometry (the 8-draw test); tree
draws are reported by `TreeBatch.draw_calls()`. Colliders are boxes for trees, palms and dead trunks only.
`feature_switches` "trees" still hides the node; `PerfWiring.PROP_LAYERS` no longer lists trees (G-385).

### G-385: LOD by distance without cross-fade, shadows from LOD 0 on High
`TreeLod.pick` with a 3 m hysteresis, sorted about four times a second and only after the camera moved 1.5 m; the first
sort runs on the worker with the camera's place from the streamer (`Kit.focus`), so adding a chunk sorts nothing on the
main thread. At most two meshes per species per chunk: when all three LODs are in use the far instances take the middle
mesh. Only LOD 0 casts a shadow, only when `tree_shadows` (High).

### G-386: Tree caps in `QualitySettings.TABLE`
`tree_density`, `scrub_density` (shares kept, by a per-plant hash rank so a preset change is live and the plants kept on
Low are kept everywhere), `tree_lod0`, `tree_lod1`, `tree_far`, `tree_sway`, `tree_shadows` (table in `docs/trees.md`);
`TreeQuality.apply` from `PerfWiring.apply`; the wind uniform follows it.

### G-387: Budget
No more than two draw calls per species per chunk; at most ten species a chunk, so about 20 draws in the chunk the camera
stands in and about 8 in a far one; measured before and after in `docs/trees.md` and the handoff.

### G-388: What the data cannot say
No species or leaf-type tag, no landuse=forest or hill height in the chunk files: a hill road is only as leafy as its
district's palette. Listed under weak spots; a data change (species tag in `build-world`, forest areas) would plug in at
`TreeStyle.weights_for`.
## Sounds, phase 6 leftovers (G-370 to G-379, agent/godot-sounds), 25 Nov 2026

### G-370: Real recordings where a free one exists, documented synthesis where none does, 6 MB at most
Sources allowed: CC0, public domain, CC-BY (never -SA, -NC, -ND, Sampling+, unknown). Searched:
Wikimedia Commons (API and files; its servers answer HTTP 429 with `Retry-After: 600` after about
three downloads from this network, so downloads are slow: `tools/audio/fetch_commons.py` waits
politely, one file at a time, with a descriptive User-Agent that names no person), OpenGameArt
(reachable, no limit). Blocked by the network policy (HTTP 403 from the proxy): archive.org,
freesound.org, soundjay, the British Library. A sound with no acceptable recording is synthesised
by `tools/audio/synth_extras.py` (deterministic, CC0, marked `"source": "synth"` in the manifest and
"synthetic" in LICENSES.md) and listed in `docs/sound-recordings.md` as the first to replace with a
phone recording. The new audio (Ogg Vorbis mono 22.05 kHz, engine loops WAV as before) is held to
`AUDIO_BUDGET_BYTES` by a test (the folder was 2.9 MB; the budget adds 6 MB at most).

### G-371: Every new sound is measured on the shipped file
`tools/audio/audio_dsp.py::measure` decodes the file and stores `metrics` in the manifest:
channels, sha256, bytes, RMS and peak dBFS, integrated loudness (BS.1770, ffmpeg `ebur128`) and
`loop_jump` (the step across the loop point over an ordinary sample step; about 1 is clean, a click is
tens). New sounds are normalised to -16 LUFS with the peak at most -2.2 dBFS before the Ogg encode
(a peaky sound is limited by its peak and flagged `peak limited`); a recording that replaces a
stand-in keeps the stand-in's RMS (the mix and its tests were tuned on it). The tests hold the
stored numbers to limits (mono, peak at most -1 dBFS after the encode, loop jump at most 5, RMS
-46 to -8 dBFS, LUFS within 3 LU of -16) and tie them to the shipped bytes by sha256;
`tools/audio/test_audio_files.py` (CI, needs numpy and ffmpeg) measures the files again from scratch.
WAV engine loops are also checked on their samples in GDScript.

### G-372: What is synthetic
`rail.announce`, `rail.squeal`, `rail.clatter`, `rail.rumble`, `bus.airbrake`, `bed.market` and
`bed.tea` (and any sound the table in `docs/sound-recordings.md` marks synthetic). Loops are made
periodic by construction (noise in the frequency domain, whole cycles per loop, hits added into a
circular buffer), so the wrap is exact.

### G-373: A goods carrier kind
`SoundProfiles.KINDS` gains `goods` (two-cylinder diesel, its own horn, the engine loops and
start/stop). Names map to kinds: `share_auto` to `auto`, `goods_carrier` and `truck` to `goods`,
every `bus_*` variant to `bus` (they all sounded like a hatchback before: `kind_of` passes the vehicle
variant id).

### G-374: `RailSounds`, a child of the `Sound` autoload
`Sound.rail`: `horn(distance)`, `announce()`, `door(open, chime)`, `boom(closing, distance)`,
`set_motion(speed, brake, inside, distance)`, `set_bell(level)`. The levels are static functions
(`motion_levels`, `bell_level`, `horn_level`, `reach`), unit-tested: rumble and clatter grow with
speed and the clatter's pitch keeps time (the recording has a joint pair every 0.75 s at 20 m/s),
the squeal comes only when braking below about 12 m/s, inside is louder than outside, a train is
heard to 260 m, its horn to 480 m, a crossing bell to 170 m. The railway layer
(`src/app/railway/railway.gd`) calls it; `src/rail` stays free of sound.

### G-375: The railway's stand-ins are gone
The bus horn that stood in for the train horn, the bus door for the train doors, the generic
"chime" cue for the platform announcement and the counted-only crossing bell now play
`rail.horn.emu`, `rail.door.*`, `rail.announce` and `crossing.bell`/`crossing.boom`. The nearest
train outside the player's is heard from its distance and speed (brake from its falling speed);
inside a ridden or driven train the motion is the train's own.

### G-376: Street beds and the far temple bell follow the kind of street
`CityLife` passes `PlaceMap`'s place kind to `Sound.set_street`; `SoundProfiles.street_levels`
turns it into the market murmur (loudest in a market, a little in a station and a busy street) and the tea stall (shopfronts on
streets and lanes, busier at the morning and evening rush), both by the day's crowd; a temple
bell sounds 110 to 240 m away every 18 to 60 s near a temple (sooner at the 6 and 18 hour pooja).

### G-377: Credits on the ABOUT page
`SoundCredits.text` lists every CC-BY recording (original file, author, licence, site) and counts
the CC0, public-domain and synthetic ones; `Main` passes it to `TitleMenu.set_credits`; the ABOUT
page now scrolls. A test fails if a CC-BY author is missing from it.

### G-378: Mix limits, written as tests
Against the player's idling hatchback: the bus idles 0 to 6 dB over it, the goods carrier between
it and the bus, bus and truck horns cut through their engines and are not the loudest horn by more
than 6 dB, the air-brake hiss is under the bus horn, a train at full speed with the player inside is
0 to 9 dB over, the squeal never drowns the train, the market sits under the idling car and about
the rush's loudness (`tests/unit/test_sound_mix.gd`).

### G-379: A licence row per file, in the file's own name
`tests/unit/test_sound_recordings.gd`: every sound under `assets/audio/rec/` and `synthetic/` needs
a row naming its exact path in LICENSES.md (the stand-ins keep their folder row), a manifest row,
a source link for recordings, and CC-BY authors must be on the ABOUT page.
### G-430: Fight poses are targets on the shared `PoseRig`; every person extends `CombatFigure`
`HumanFigure` and `PersonView` extend `CombatFigure` (`src/player/combat_figure.gd`), which owns `play_strike`,
`is_striking`, `cancel_strike`, `strike_point`, `play_flinch`, `carry`, the signal `strike_hit(kind, side)` and the
`poser`, so the combat code calls the same methods on the player, a fare passenger, a walker or a gangster, and
`WeaponModels` takes either. `StrikePose` (`src/player/poses/strike_pose.gd`) is a port of `strikePose.ts`: the key
lists, the timings (punch 0.12 s wind-up + 0.26 s recovery, bat 0.22 + 0.38, the Three.js `STRIKES`; the hook has
the punch's), the eased stretches with the blow itself accelerating as x squared, the fist closing and the flinch.
Where the Three.js game stored arm bone directions judged by eye, the Godot poses store **targets**: the striking
wrist goes to a point given in arm lengths from its shoulder (a jab 0.93 forwards and 0.18 inwards, so the fist
ends on the centre line), the bat's hands move on a circle about the chest (yaw, radius, height keys) with the bat's
own direction keyed too and the hands turned so the thumb side lies along it (`HandReach`). The two-bone solver
(`PoseRig.reach`) puts the arm on the point, so a test can measure that the fist is out at the hit frame and the
bat comes round in one sweep. The poses are laid on after the clip and the walk's swing, blended from the clip's
own rotations (captured each step, so the fingers and arms return exactly when the blow ends). The hit frame
(`strike_hit`) is signalled once, on the step that reaches the wind-up time, with the pose already on the skeleton;
an unseen street person (`PersonView` outside the camera or beyond `animate_reach`) still runs the blow's clock so
it lands on time. `play_strike(kind, side, windup, recover)` takes optional timings for an enemy's slower telegraphed
swing (`Melee` wind-up 0.4 s). Kinds: `jab`, `cross`, `hook` (fists, `side` is the striking hand) and `bat`
(always from the right). Seated or knocked-down figures drop their blow.

### G-431: Carrying puts the palms on the prop's anchors
`CarryPose` (`src/player/poses/carry_pose.gd`): `box` (both hands at the sides of a 36 x 26 x 28 cm carton in front
of the waist, fingers forwards and under, palms inwards), `shoulder` (a 26 x 20 x 24 cm box on the right shoulder
steadied by the right hand, the left arm still swings), `bag` (right hand by the hip) and `push` (both hands on a
trolley bar). The carton is built by script (`LowPoly`, cardboard, a tape band and a label, one mesh) and follows
the chest height. The palms are solved onto the anchors (`HandReach.place_palm`, `roll_palm`), so the walking arm
swing is damped to nothing on the carrying arms (a hand moves under 8 cm, 47 cm free). The arms blend in over 0.3 s.

### G-432: Hit puffs are one MultiMesh
`HitPuffs` (`src/app/combat_fx/hit_puffs.gd`) is a port of `HitPuffs.ts` without sprites: a pool of puffs (the
`hit_puffs` key of `QualitySettings`: 4 Low, 6 Medium, 8 High), each a dust ring (camera-facing, spreads
0.22 to 0.77 m, drifts up 15 cm, 0.4 s) and a star flash (billboard, 0.12 s) as two instances of one
`MultiMesh` of quads with one 128 x 64 generated atlas (ring and star) and one unshaded billboard shader whose
per-instance custom data carries the age, the atlas cell, the billboard flag and the opacity. One draw call while a
blow shows; none when nothing does (the node hides itself and stops processing). Nothing is allocated after
`_ready`; the oldest puff is reused. No blood or marks: stylised dust and a star only.

### G-433: Weapons are palette-textured low-poly meshes on the hand bone
`WeaponModels` (`src/weapons_view/weapon_models.gd`): the Three.js bat, pistol, pump shotgun and SMG (the game
did have firearms) plus a stick and a bottle, each a few boxes or prisms merged into one `ArrayMesh` (under 160
triangles) coloured from one shared 16-colour palette image (`LowPoly`: one texture, one material for every weapon
and carried box). `attach` makes a `BoneAttachment3D` on the right hand bone whose grip node is turned to the hand's
own axes (`HandReach.axes`, read from the rest pose: fingers, thumb side, palm normal): a club lies across the palm
with its blade beyond the thumb side, a gun's barrel runs along the fingers. A one-box silhouette takes over
beyond 25 m. The hand closes round a held weapon every step.

### G-434: Quality keys for the new effects
`QualitySettings.TABLE` gains `hit_puffs` (4, 6, 8) and `motion_blur` (false, false, true: High may have it).

### G-435: Motion blur is kept, as a cheap radial blur, off by default
The Three.js `MotionBlur` blended each frame with the previous one through three full-resolution half-float render
targets and two full-screen passes. On an Adreno 613 at 1080 x 2400 that is about 3 x 8 bytes per pixel of tile
memory traffic for a nicety, so it is **not** ported as it was. The same effect (nothing below 16 m/s, full
strength from 32 m/s, at most 0.42, following the speed at 4 per second) is a single five-tap radial blur of the
screen texture (`src/game_engine/post/motion_blur.gd`, a `CanvasLayer` with a `hint_screen_texture` shader): no
history buffer, no render target. It is **off by default** (`wanted` is false and nothing sets it), **never on
Low or Medium** (the preset's `motion_blur` is false), and **free while off**: the layer and shader are only made
when it is turned on, `update` returns at once and the node does not process (tested). No Settings row yet; it
needs the owner's call and a measurement on the phone first.
