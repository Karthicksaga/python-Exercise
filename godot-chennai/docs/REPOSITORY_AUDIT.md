# Repository Audit — Chennai Open World (`godot-chennai`)

> **Audit Date:** 25 Nov 2026 | **Branch:** `feat/godot-chennai` (`4f93f7a9`)
> **Codebase Scale:** 282 GDScript files (`src/`), 6 `.tscn` scenes, 5 `.gdshader` files, 118 test files (`tests/`), 47 world tiles (`world/`), 250+ GLB models (`assets/`).
> **Verification Note:** Findings are based on direct inspection of `project.godot`, `export_presets.cfg`, `src/`, `tests/`, `assets/`, `world/`, `tools/`, and `docs/` (`parity.md`, `performance.md`, `progress.md`, `handoff.md`). Godot binary is not installed in this local audit shell, so headless test execution was not re-run here.

---

## 1. Feature Classification Matrix

Status definitions:
- **COMPLETED** — Implemented, wired into `Main` / gameplay, and covered by automated tests.
- **PARTIALLY IMPLEMENTED** — Implemented in part or tested in isolation, but missing wiring, assets, or full coverage.
- **NOT IMPLEMENTED** — Missing from `godot-chennai/src/`.
- **NEEDS INVESTIGATION** — Implemented/claimed but unverified on target Android hardware (Adreno 613) or requires deeper runtime inspection.
- **BROKEN** — Known failure or regression documented in repo/CI.

| System / Feature | Classification | Evidence & Notes |
|---|---|---|
| **1. Project Config & Export** | **COMPLETED** | `project.godot` (Godot 4.7.2, Mobile renderer, Jolt 60 Hz, strict typed GDScript warnings as errors); `export_presets.cfg` (`Android` arm64-v8a & `Android Smoke` x86_64). |
| **2. Boot Flow & Loading Screen** | **COMPLETED** | `src/app/main.gd`, `src/ui/loading_screen/loading_screen.gd`. 5 real background steps, retry/close on error, watchdog thread. |
| **3. Floating Origin (`WorldOrigin`)** | **COMPLETED** | `src/game_engine/world_origin.gd`. `origin_shifted` group, `to_scene()` conversion, tested in `test_world_source.gd`. |
| **4. OSM World Pipeline & Codecs** | **COMPLETED** | `tools/geo/chennai_geo/` (Python, 43 pytest tests), `src/game_world/world_codec.gd`, `regional_world_source.gd` (v2, 47 tiles, 391k buildings, 151k road pieces). |
| **5. Overture / Open Buildings Fusion** | **NOT IMPLEMENTED** | Designed in `tools/geo/chennai_geo/fusion.py` (`G-28`), but not run due to network host restrictions. Outer rings (2–3) remain sparse (97.8% estimated heights). |
| **6. Chunk Streaming & LOD** | **COMPLETED** | `src/game_world/city/chunk_streamer.gd`, `src/game_engine/city/chunk_builder.gd`. Off-thread `ChunkWorkers`, 2.5 ms main-thread budget, explicit `Near`/`Far` swap. |
| **7. Buildings, Facades & Tamil Signs** | **PARTIALLY IMPLEMENTED** | `building_meshes.gd`, `city_materials.gd`, `shop_signs.gd`, `sign_categories.gd` work with vertex colors + baked atlases (`facade.png`, `kit.png`, `roof_tiles.png`). Visual quality is still low-poly/flat-shaded on many walls; z-fighting/flickering on coplanar/far surfaces and texture detail need visual polish. |
| **8. Roads, Sidewalks & Detail** | **PARTIALLY IMPLEMENTED** | `ground_meshes.gd`, `mesh_builder.gd`, `road_models.gd`, `road_objects.gd`, `deck_meshes.gd`. Markings, kerbs, footpaths, flyovers exist; `RoadHeights` not yet queried by AI traffic (`handoff.md`), and street furniture/cables/compound walls need visual enrichment. |
| **9. Landmarks** | **COMPLETED** | `landmark_models.gd`, `assets/landmarks/` (8 hero landmarks: Chennai Central, Egmore, Ripon Building, Lighthouse, Kapaleeshwarar Temple, Anna Nagar Tower, Kathipara Junction, Royapettah Mall). |
| **10. Trees & Vegetation** | **COMPLETED** | `src/game_engine/trees/` (`tree_kit.gd`, `tree_batch.gd`), 18 species × 3 LODs in one `MultiMesh` atlas shader (`trees.gdshader`). |
| **11. Environment, Lighting & Weather** | **COMPLETED** | `lighting.gd`, `city_environment.gd`, `sky.gdshader`, `rain_view.gd`, `rain.gdshader`, `street_lights.gd`, `weather.gd`. Day/night cycle, golden-hour defaults, additive lamp glow + culled real lights. |
| **12. Player Controller & Camera** | **COMPLETED** | `player_controller.gd` (walk/run/jump/step-up), `player_rig.gd`, `follow_camera.gd` (raycast occlusion). |
| **13. Characters, Rigging & Poses** | **PARTIALLY IMPLEMENTED** | `human_figure.gd`, `retarget.gd`, `locomotion_clips.gd`, `people_pool.gd`, `poses/*` (seat, strike, carry, knockdown). 70+ Blender GLB people exist in `assets/people/`, but animation blending, proportions, and Chennai clothing variety need visual polish; `StrikePose` and `CarryPose` have no callers in active play yet. |
| **14. Vehicles & Driving Physics** | **COMPLETED** | `raycast_vehicle.gd`, `vehicle.gd`, `driving.gd`, `gearbox.gd`, `boarding.gd`, `crash_rules.gd`, `crash_flight.gd`. 19+ vehicle types/variants with LODs and manifests. |
| **15. Traffic AI & Pedestrians** | **PARTIALLY IMPLEMENTED** | `road_graph.gd`, `agent_system.gd`, `traffic_signals.gd`, `crowd_field.gd`, `city_life.gd`, `carjacking.gd`. Lane-aware traffic, signals, walkers, crowds, and TAKE OVER carjacking work; however, AI does not query `RoadHeights` (flyovers/decks) and premium cars are not in traffic pool. |
| **16. Missions & City Jobs** | **PARTIALLY IMPLEMENTED** | `src/missions/`, `src/app/missions_layer/`. 21+ stages, 13 jobs, save store, job board, medals, fare spots work; combat/chase/gun stages (7–15, 18, 21) cannot complete without wired combat/police, and stage 18 train rider scene is missing. |
| **17. Combat, Weapons, Wanted & Police** | **PARTIALLY IMPLEMENTED** | Pure-logic rules (`src/combat/`) and low-poly weapon models (`src/weapons_view/`) are ported and unit-tested, but **NOT wired into `Main`**: no punch/fire input, no active police chase/spawning, no player health bar or wanted stars HUD. |
| **18. Suburban Railway & MRTS** | **PARTIALLY IMPLEMENTED** | `src/rail/`, `src/app/railway/`, `src/ui/rail_hud/`, `assets/trains/` (30 GLBs). Trains, stations, cab drive, and Rail HUD work; train horn, recorded audio, Hindi station board rendering, and stage 18 train rider scene remain incomplete. |
| **19. Aviation (Airport & Aircraft)** | **NOT IMPLEMENTED** | `assets/aircraft/` has 9 GLBs (airliner, helicopter, light aircraft + LODs) and Meenambakkam/Tambaram exist in OSM data, but no flight physics, airport gameplay, or far-city layer exists. |
| **20. Audio System** | **PARTIALLY IMPLEMENTED** | `src/audio/` (`sound.gd`, `engine_blend.gd`, `ambience.gd`, `player_sounds.gd`, `rail_sounds.gd`, `synth.gd`). Full bus mix and procedural stand-ins work; real Chennai field recordings and train horn are pending. |
| **21. UI, HUD & Touch Controls** | **COMPLETED** | `src/ui/` (`touch_controls`, `driving_controls`, `minimap`, `full_map`, `mission_hud`, `title_menu`, `pause_menu`, `debug_hud`, `perf_overlay`, `benchmark_card`). Missing only health/wanted HUD widgets. |
| **22. Quality Presets & Benchmarking** | **COMPLETED** | `quality_settings.gd`, `quality_applier.gd`, `feature_switches.gd`, `shader_warmup.gd`, `benchmark_runner.gd`. |
| **23. On-Device Android Verification** | **NEEDS INVESTIGATION** | Mobile Vulkan renderer has not been verified on target phone (POCO M6 Pro 5G / Adreno 613) since perf/benchmark merges; CI emulator runs Compatibility (GL) only. |
| **24. City Streaming Test on Base** | **BROKEN** | Git history (`a6b90922`) notes `test_city_streaming` had a failure on the base commit prior to `godot-bench` merge — needs verification with `godot` locally. |

---

## 2. Technical Debt & Known Bugs

1. **Unwired Combat & Police (`src/combat/`):** ~12 pure-logic files and 6 weapon models exist, plus `StrikePose` and `Knockdown`, but none are connected in `Main` or `TouchControls`/`ActionContext`.
2. **AI Height Awareness:** `AgentSystem` / `CityLife` does not sample `RoadHeights` for elevated flyovers/ramps, causing traffic/pedestrians on bridges to ignore deck elevation.
3. **250 m Chunk Lighting & Overdraw Risk:** Solved partially via `RENDER_LAYER = 2` exclusion for street lights (`G-259`), but distant/overlapping walls and flat roofs still risk z-fighting and draw-call spikes when multiple landmarks + trees + traffic overlap.
4. **APK Size & Legacy Assets:** `assets/people/` alone is **133 MB** (145 GLBs including `legacy/`), `world/` is **38 MB**, and `assets/world/` (v1) is **9.1 MB**. `export_presets.cfg` excludes some `legacy/` prefixes, but a unified asset diet is needed to keep the Android APK lean.
5. **Untested Mobile Vulkan Path:** `city_materials.gd` disables specular (`SPECULAR_DISABLED`) to mitigate Adreno 613 half-precision white-dot artifacts (`G-343`), but real device thermal/frame-time telemetry is still missing.
6. **Shader Warm-up Coverage:** `PerfWiring.warm_up()` runs behind the loading screen, but `MotionBlur` (`src/game_engine/post/motion_blur.gd`) is not yet wired into `Main` or Settings.
