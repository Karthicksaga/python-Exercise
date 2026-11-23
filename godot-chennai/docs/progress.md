# Progress

What runs and how it was tested. "Emulator" and "phone" are different statements.

## Phase 0: Foundation (23 Nov 2026, branch `agent/godot-foundation`)
| Item | State | How it was tested |
|---|---|---|
| Project skeleton: Godot 4.7.2, Mobile renderer (OpenGL fallback), sensor landscape, 915×412 base UI, touch from mouse, Jolt, 60 Hz / 5 steps per frame, typed GDScript as errors (G-1, G-2) | Done | `tests/scene/test_game_loop.gd` reads the settings; every script compiles under the strict warnings |
| Module folders as the Three.js packages, `src/app/` composition root (G-5) | Done (empty modules hold a `.gitkeep`) | Review |
| Boot flow: loading screen with three real steps (read the index, read the roads, prepare the test ground; each on a worker thread, a frame between steps), TRY AGAIN / CLOSE on failure, title menu (PLAY, ABOUT with OSM credit and extract date, QUIT), test ground (ground with collider, sun, haze, camera, scale objects), debug HUD (FPS, time of day, roads and chunks loaded, OSM credit), Back routing | Done | `tests/scene/test_boot.gd` (whole flow headless, failure and retry), screenshots at 915×412, 1830×824, 640×320 (Compatibility, xvfb) |
| UI layout: nothing off-screen or overlapping, buttons ≥ 48 tall, focus on every menu page, at 915×412, 915×458, 1098×412, 915×686 UI sizes | Done | `tests/scene/test_ui_layout.gd` |
| Data and asset sync from `chennai-open-world` with licence rows (G-3) | Done: 1,979 files | `tools/sync_from_threejs.py --check` (CI) |
| World reader: `WorldCodec`, `WorldIndex`, `WorldFiles`, `WorldSource`/`FileWorldSource`, format-version check (G-4, G-6) | Done | `tests/unit/test_world_codec.gd`, `test_world_index.gd`, `test_world_source.gd`: values from the TS decoder on the same files, every chunk decoded, hand-made and truncated files, other versions refused |
| Floating origin `WorldOrigin` (G-7) | Done (not yet used by moving things) | `tests/unit/test_world_source.gd::test_floating_origin` |
| Headless test runner (G-8) | Done: 21 tests, 432 assertions | `./run_tests.sh` locally and in CI; a broken assertion exits 1 |
| CI: import, tests, Android APK, emulator smoke (G-9) | See `handoff.md` for the latest run | GitHub Actions `Godot Chennai` |
