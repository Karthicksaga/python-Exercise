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
`[boot] failed`, a crash of this app or a timeout, then check it still runs 10 s later). The emulator starts **without Vulkan** (`-feature
-Vulkan`): its SwiftShader Vulkan failed to present on the runner and Godot's main loop stopped
after the first step, so the smoke run takes the OpenGL fallback and thereby proves it; the
Mobile renderer is judged on real phones. While loading, a watchdog thread prints
`[boot] no frame for N s` if the main loop stalls, so a device log never goes silent. No
Gradle build: Godot's prebuilt template, so the minimum SDK is the template's: API 24
(Android 7.0), target 36 (printed by CI). Package `com.chennaiopenworld.godot`, so it installs beside the Three.js app.
