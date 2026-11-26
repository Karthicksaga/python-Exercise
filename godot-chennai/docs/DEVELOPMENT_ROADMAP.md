# Development Roadmap — Chennai Open World (`godot-chennai`)

> Aligned with the project's **preserve-existing-work** policy and prioritized development order:
> **Priority 1: Visual Quality → Priority 2: Character Quality → Priority 3: Vehicles & Traffic → Priority 4: Gameplay Completion & Device Polish**.

---

## Priority 1 — Visual Quality (Immediate Focus)

1. **Fix Building Flickering, Z-Fighting & Draw-Distance Transitions**
   - Audit `BuildingMeshes` (`src/game_engine/city/building_meshes.gd`) and `ChunkBuilder` (`src/game_engine/city/chunk_builder.gd`) for coplanar wall/roof/shutter/sign offsets (`SHUTTER_OFFSET = 0.03`, `SIGN_DEPTH = 0.14`) and `Near`/`Far` transition pops at `near_distance` (80–120 m).
   - Add subtle polygon offset / depth separation where shutters, chajjas, and balconies meet walls, and smooth alpha/scale or fog-blended `Near`↔`Far` transitions.
2. **Realistic Chennai Buildings, Materials & Textures**
   - Upgrade `tools/bake_city_textures.gd` and `assets/city/textures/` (`facade.png`, `facade_glow.png`, `roof_tiles.png`, `kit.png`, `ground.png`) with richer weathering, plaster variation, terracotta/Mangalore tile detail, and grime/dampness near plinths.
   - Expand `AreaPalettes` (`src/game_engine/city/`) so neighborhoods (Mylapore, T. Nagar, George Town, Marina, Anna Nagar) have distinct architectural color/roof/height character.
3. **Tamil Signboards & Shop Signage**
   - Enhance `ShopSigns` & `SignCategories` (`assets/city/sign_categories.json`, `noto-sans-tamil-categories.woff2`) with higher-contrast hand-painted board styles, varied aspect ratios, and proper night-time emissive illumination (`kit_glow.png`) for open shops.
4. **Realistic Roads, Sidewalks & Street Furniture**
   - Improve `GroundMeshes` (`ground.gdshader`) and `RoadDetail` (`mesh_builder.gd`) with worn asphalt aggregates, faded lane paint, paver-block footpaths, stormwater grates, and kerbs.
   - Enrich `StreetFurniture` (`src/game_world/city/street_furniture.gd`) and `RoadObjects` with Chennai-authentic **streetlights, EB electric poles, overhead cables, compound walls, MTC bus shelters, and traffic barricades** while respecting `road_extras` quality caps (`Low`/`Medium`/`High`).
5. **Environmental Lighting & Shadows**
   - Tune `Lighting.KEYS` (`src/game_engine/environment/lighting.gd`) and `CityEnvironment` (`sky.gdshader`) for realistic tropical coastal haze, crisp golden-hour shadows, and balanced night street-lamp pools without blowing out Mobile Vulkan fill rate.

---

## Priority 2 — Character Quality

1. **Proportions & Chennai-Inspired Clothing Variations**
   - Audit the 70+ Blender GLBs in `assets/people/` (`tools/blender/`) for consistent scale (1.75 m reference), clean topology, and authentic Chennai attire (veshti/lungi, sarees, salwar kameez, office formals, college uniforms, auto/bus/delivery uniforms).
   - Implement modular material/palette tinting in `PersonView` / `PeoplePool` (`src/player/people/`) so a compact set of meshes yields wide visual variety without inflating APK size.
2. **Natural Locomotion & Smooth Animation Blending**
   - Upgrade `HumanFigure` (`src/player/human_figure.gd`) and `LocomotionClips` (`locomotion_clips.gd`) with proper cross-fade blending (`AnimationPlayer` blend times / `AnimationTree` state transitions) between idle, walk, run, jump, fall, and land.
   - Ensure `StrikePose`, `CarryPose`, and `SeatPose` (`src/player/poses/`) blend cleanly into and out of locomotion without bone snapping.

---

## Priority 3 — Vehicles & Traffic

1. **Realistic Chennai Vehicle Fleet & Handling**
   - Polish `VehicleModel` (`src/vehicles/vehicle_model.gd`) and `assets/vehicles/` (cars, motorbikes, auto-rickshaws, share autos, MTC/mofussil/school buses, ambulances, goods carriers) with wheel spin/steer pivots, suspension travel visual sync, brake/headlight emissives, and LOD1/LOD2 transitions.
   - Tune `VehicleSpec` & `RaycastVehicle` (`src/physics/raycast_vehicle.gd`) per vehicle class (e.g., nimble 3-wheeler auto-rickshaw turning radius vs heavy bus inertia and braking).
2. **Traffic AI & Flyover/Deck Support**
   - Wire `RoadHeights` into `AgentSystem` (`src/ai/agent_system.gd`) so traffic vehicles and pedestrians traverse flyovers (e.g., Anna Flyover, Kathipara) at deck height rather than ground `y = 0`.
   - Integrate premium/variety vehicles into `AgentPresets` traffic spawn shares while respecting `QualitySettings` vehicle caps.

---

## Priority 4 — Gameplay Completion & Android Release Readiness

1. **Wire Combat, Wanted System & Police (`src/combat/` → `Main`)**
   - Connect `ActionContext` / `TouchControls` melee & weapon inputs, `StrikePose`, `WeaponModels`, `Wanted` stars HUD, player health bar, and `PoliceFleet` pursuit AI.
   - Unblocks story stages 7–15, 18, and 21.
2. **Complete Railway & Aviation**
   - Add train horn, Hindi/Tamil/English station boards, and stage 18 train rider scene.
   - Build flight physics and airport gameplay for `assets/aircraft/` (Phase 6b).
3. **World Fusion & Android Device Profiling**
   - Run `tools/geo/chennai_geo/fusion.py` (Overture + Google Open Buildings) to populate outer rings (2–3).
   - Profile both `Android` (Mobile Vulkan) and `Android Smoke`/Compat APKs on target mid-range hardware (Adreno 613) using `BenchmarkRunner` (`benchmark.json`), and trim unused `assets/people/legacy/` from `export_presets.cfg`.
