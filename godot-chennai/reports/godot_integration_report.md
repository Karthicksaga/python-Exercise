# Godot 4.7 Mobile Integration Architecture Report

**Target Engine & Hardware:** Godot 4.7.2 · Mobile Renderer · Android (Adreno 613 mid-range)  
**Golden Rule:** Preserve roads, world origin (`WorldOrigin`), chunk streaming (`ChunkStreamer`), vehicles, traffic AI, NPCs, missions, and all **8 protected custom landmarks**.

---

## 1. Why Naive Scene Instancing Will Fail on Android

The Chennai map holds **391,283** buildings (`107,098` in Ring 0 central Chennai alone; ~`100–600` buildings per 250 m chunk). Instantiating each matched building as an individual `.glb` `PackedScene` (`MeshInstance3D` + `StaticBody3D`) per chunk would create `300+` draw calls per chunk and hundreds of physics nodes during chunk streaming, stalling frame times on mid-range Android devices.

## 2. Recommended Incremental Integration Architecture

Integrate cleanly with the existing worker-thread pipeline in [chunk_builder.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/src/game_engine/city/chunk_builder.gd):

1. **Shared Atlas Memory Budget (`5` Textures Total):**
   - All `100` models in `assets/buildings/pack_100/` share **5** `512×512` VRAM-compressed (`compress/mode=2`, ETC2/S3TC) albedo atlases + **1** shared `512×512` emissive atlas (~`1.5 MB` GPU VRAM total across the entire 100-building kit).
   - Enable night lighting via `StandardMaterial3D.emission_energy_multiplier` wired to `CityMaterials.set_night()`.

2. **Chunk-Level Instancing via `MultiMeshInstance3D` (or Merged Pack Surfaces):**
   - At chunk build time (`ChunkBuilder.build` on worker thread):
     1. Run `without_landmark_buildings()` AND skip any `Building` whose `source_id` / `id` is listed in `data/protected_buildings.json`.
     2. Look up `selected_asset_id` from a compact binary/JSON lookup indexed by chunk `(col, row)` (generated from `data/building_replacement_manifest.json`).
     3. For matched buildings: compute centroid `(cx, cz)`, foot rotation aligned to the longest OSM outline edge yaw, and safe scale factor clamped to `[0.65, 1.45]` (matching footprint `(w, d)` and `height`).
     4. Group instances inside that 250 m chunk by `(asset_id, lod_level)` into **`MultiMeshInstance3D`** batches (1 draw call per active archetype in that chunk — typically `8–18` draw calls per chunk) OR bake transformed archetype `ArrayMesh` surfaces per shared atlas (`<= 5` draw calls per chunk!).
     5. Build physics colliders (`BoxShape3D` / trimesh piece) into `ChunkBuilder.Build.bodies` using the exact same `PIECE_BUILDINGS` pattern so Traffic/Player/Vehicles collide cleanly without per-building `StaticBody3D` overhead.
     6. Unmatched (`retain_procedural`) and minor buildings fall through untouched to `BuildingMeshes.add()`.

3. **Zero-Overlap LOD Visibility Ranges:**
   - Attach **3** `MultiMesh` / merged LOD tiers per chunk matching game presets (`LOD0`: `0..90 m`, `LOD1`: `90..220 m`, `LOD2`: `220..550 m`) with **zero overlap margins (`margin = 0.0`)** to eliminate Adreno 613 LOD Z-fighting.

## 3. Stage 8 Implementation Completed

1. **Compiled Binary Lookup (`compile_runtime_lookup.py` → `assets/buildings/pack_100/lookup.bin`):**
   - `3,876,202` bytes (`3.70 MB`) containing `100` archetype dimension records, `117` sorted `u64` protected landmark/religious/historic OSM IDs, and `386,885` sorted `(source_id, asset_idx)` replacement records (`O(log N)` binary search directly on `PackedByteArray`, zero JSON/Dictionary RAM bloat).
2. **`BuildingPack` Worker-Thread Loader ([building_pack.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/src/game_engine/city/building_pack.gd)):**
   - Caches `LOD0` `ArrayMesh` (preserving linear `COLOR_0`) + `LOD1` & `LOD2` `MeshBuilder`s and computes street-aligned placement (`BuildingMeshes.wall_faces_road`) with clamped proportions.
3. **`ChunkBuilder` & `CityWorld` Hybrid Integration ([chunk_builder.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/src/game_engine/city/chunk_builder.gd), [city_world.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/src/game_world/city/city_world.gd)):**
   - Replaced buildings are skipped before `meshes.add(b, plan)` (keeping exact OSM perimeter colliders in `"Walls"` intact and zero Z-fighting), instantiated via per-archetype `MultiMeshInstance3D` (`Near/PackBuildings`, `0..90 m`) and merged into `Near/PackMid` (`>= 90 m`) + `Far/PackFar`, toggled live via `FeatureSwitches` `"pack100_buildings"`.
4. **Landmark Z-Fighting Fix ([landmark_models.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/src/game_engine/city/landmark_models.gd#L18)):**
   - Updated `const FADE := 0.0` to eliminate simultaneous `LOD0`/`LOD1` overlap rendering when `VISIBILITY_RANGE_FADE_DISABLED` is active.
5. **Android Export Rules & Tests:**
   - Updated [export_presets.cfg](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/export_presets.cfg) (`preset.0` & `preset.1`) to ship `lookup.bin`, `catalog.json`, and `protected_buildings.json` while excluding `72.89 MB` offline reports/mapping dumps, and added [test_building_pack.gd](file:///Users/kjayap419@apac.comcast.com/Desktop/workspace/test_2/python-Exercise/godot-chennai/tests/unit/test_building_pack.gd).

## 4. Stage 9 — Next Step (Requires Godot 4.7.2 + Android Device)

1. Run `godot-chennai/run_tests.sh` in Godot 4.7.2 to verify `test_building_pack.gd`, `test_city_meshes.gd`, `test_landmarks.gd`, `test_asset_budget.gd`, and `test_export_size.gd`.
2. Export & profile FPS / frame times (`<= 16.6 ms / 33 ms`) and draw calls on target mid-range Android (Adreno 613).
