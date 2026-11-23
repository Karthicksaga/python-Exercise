# godot-chennai

The Chennai open-world game in **Godot 4.7.2**, for Android phones in landscape, migrated phase
by phase from the Three.js game in `../chennai-open-world/` (which stays playable until this
version reaches parity). Phase 0 (foundation) is in: the game boots through a loading screen
that reads the real world files, a title menu, and an empty test ground with a debug HUD.

- `MIGRATION_PROMPT.md`: the brief (phases, what to reuse, lessons, owner decisions).
- `AGENTS.md`: rules for agents, module boundaries. `docs/`: decisions (G-n), progress, handoff.
- `docs/concept/characters/`: the owner's character concept boards.

## Layout
```
project.godot, export_presets.cfg, run_tests.sh, icon.svg
src/<module>/      game_engine, game_world, map_data, physics, player, vehicles, ai, combat,
                   missions, rail, audio, ui (as the Three.js packages), app (composition root)
assets/            world/ (index.json, roads.bin, rail.json, c/*.bin), people/legacy/,
                   animations/, vehicles/, props/, fonts/, LICENSES.md
tests/             test_runner.gd, test_case.gd, unit/, scene/, tools/screenshot.gd
tools/             sync_from_threejs.py, ci_install_godot.sh, android_smoke.sh
```

## Run
Godot 4.7.2 stable (`godot` on the PATH; in the cloud container it is `/opt/tools/godot`).
```bash
cd godot-chennai
godot --headless --audio-driver Dummy --path . --import      # once on a fresh checkout
godot --path .                                                # play (desktop window, mouse = touch)
godot --path . -- --start=play                                # skip the title menu
```
Android Back / Escape: play → title menu; ABOUT → menu; menu → quit.

## Test
```bash
./run_tests.sh                    # imports, compiles every script, runs every test; exit 1 on failure
./run_tests.sh --filter=codec     # only tests whose "file::name" contains "codec"
SKIP_IMPORT=1 ./run_tests.sh      # skip the import when nothing new was added
```
Log in `tests/out/test.log`. Tests are `TestCase` subclasses in `tests/unit/` (plain data and
logic) and `tests/scene/` (scenes, game flow, UI layout); see G-8.

Screenshots (Compatibility renderer under xvfb; states: loading, title, about, play, failed):
```bash
xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
  --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
  --script res://tests/tools/screenshot.gd -- --state=play --out=/tmp/shots/play.png
```

## Data and assets
`python3 tools/sync_from_threejs.py` copies the world, the legacy cast, animations, vehicles,
props and fonts from `chennai-open-world/` (byte for byte) and refreshes their licence rows in
`assets/LICENSES.md`; `--check` reports drift (CI runs it). After the Three.js world is rebuilt
(`npm run build:world` there), run the sync and commit. Licences: `assets/LICENSES.md`; map data
© OpenStreetMap contributors, ODbL 1.0.

## Export (Android)
CI builds the APKs (`.github/workflows/godot-chennai.yml`): artifact **`godot-chennai-apk`**
(arm64-v8a, signed with a debug key made in CI: for testing, not for the Play Store) and a
smoke APK (x86_64) that an emulator launches. Locally, with the Android SDK, JDK 17 and the
4.7.2 export templates installed (`tools/ci_install_godot.sh --android` fetches the templates):
```bash
export GODOT_ANDROID_KEYSTORE_RELEASE_PATH=~/debug.keystore GODOT_ANDROID_KEYSTORE_RELEASE_USER=androiddebugkey GODOT_ANDROID_KEYSTORE_RELEASE_PASSWORD=android
mkdir -p build/android && godot --headless --path . --export-release "Android" build/android/chennai-open-world.apk
```
Without templates, `godot --headless --path . --export-pack "Android" build/game.pck` and
`godot --headless --main-pack build/game.pck -- --start=play` check what the export contains.
