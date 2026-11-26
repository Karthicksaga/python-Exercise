# Project Architecture — Chennai Open World (Godot 4.7.2)

> **Scope:** `godot-chennai/` on branch `feat/godot-chennai`.
> **Engine & Target:** Godot 4.7.2 stable, Mobile renderer (Vulkan with OpenGL ES 3 fallback), Jolt Physics (60 Hz fixed step, max 5 steps/frame), Android `arm64-v8a` landscape (`915×412` base UI, `canvas_items` stretch, `expand` aspect).

---

## 1. High-Level Architecture

`godot-chennai` follows a strict modular architecture (decision `G-5`) mirroring the original Three.js packages while keeping pure-data/logic modules free of scene `Node` dependencies so they can run on worker threads and in fast headless unit tests.

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          src/app/ (Composition Root)                    │
│  main.tscn / main.gd · play_wiring · driving_wiring · environment_wiring│
│  missions_layer · railway · city_life · perf · benchmark · title_wiring │
└────┬──────────┬──────────┬──────────┬──────────┬──────────┬─────────────┘
     │          │          │          │          │          │
     ▼          ▼          ▼          ▼          ▼          ▼
┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐┌─────────┐
│   ui    ││ player  ││vehicles ││  audio  ││game_eng ││   ai    │
│HUD/Touch││Rig/Ctrl ││RaycastV ││Sound/Amb││City/Env ││RoadGraph│
│Minimap  ││Poses/Cam││Catalog  ││EngineV  ││Streaming││Agents   │
└────┬────┘└────┬────┘└────┬────┘└────┬────┘└────┬────┘└────┬────┘
     │          │          │          │          │          │
     │          └────┬─────┘          │          │          │
     │               ▼                │          │          │
     │         ┌───────────┐          │          │          │
     │         │  physics  │          │          │          │
     │         │Jolt Layers│          │          │          │
     │         └───────────┘          │          │          │
     │                                │          ▼          │
     │                                │    ┌───────────┐    │
     │                                └───►│game_world │◄───┘
     │                                     │WorldSource│
     │                                     │Codec/Clock│
     │                                     └─────┬─────┘
     │                                           ▼
     │                                     ┌───────────┐
     │                                     │ map_data  │
     │                                     │Projection │
     │                                     └───────────┘
     │
     └── Pure logic modules (no Nodes): missions, combat, rail, ai, game_world, map_data
```

### Autoload Singletons (`project.godot`)
| Autoload | Script | Responsibility |
|---|---|---|
| `GameLoop` | `src/game_engine/game_loop.gd` | Fixed-step 60 Hz physics clock (`physics_frames`, `game_seconds`, `GameClock` time-of-day, deterministic test `wait_physics_frames` / `wait_game_seconds`). |
| `WorldOrigin` | `src/game_engine/world_origin.gd` | Floating origin shifting (`origin_shifted` node group) converting world metres (`+X` east, `-Z` north) into local scene coordinates via `to_scene()`. |
| `Weather` | `src/game_engine/environment/weather.gd` | Persistent rain/weather state (`cow-weather-v1`) shared with environment shaders and audio. |
| `Sound` | `src/audio/sound.gd` | Centralized audio bus manager (`Vehicles`, `World`, `Ambience`, `UI` → `Master` with compressor/limiter in `default_bus_layout.tres`). |

---

## 2. Module Responsibilities & Boundaries

| Module (`src/`) | Owns | Allowed Dependencies |
|---|---|---|
| `map_data` | Geographic projection (OSM lat/lon ↔ world metres, TD-2 coordinates). | None (pure `RefCounted`) |
| `game_world` | World data model & readers (`WorldSource`, `FileWorldSource` v1, `RegionalWorldSource` v2), `WorldCodec`, `WorldIndex`, `ChunkData`, `Building`, `Road`, `GameClock`, `DistrictIndex`, `ChunkStreamer`. | `map_data` |
| `physics` | Jolt physics layers (`LAYER_WORLD=1`, `LAYER_PLAYER=2`, `LAYER_PEOPLE=4`, `LAYER_VEHICLES=8`), `RaycastVehicle`, `VehicleSpec`. | Engine |
| `game_engine` | Scene management, `CityWorld`, `ChunkBuilder` (worker-thread mesh + collider assembly), `BuildingMeshes`, `GroundMeshes`, `WaterMeshes`, `DeckMeshes`, `DetailMeshes`, `CityMaterials`, `CityAtlas`, `ShopSigns`, `LandmarkModels`, `TreeKit`, `environment/` (`Lighting`, `CityEnvironment`, `StreetLights`, `RainView`), `quality/` (`QualitySettings`, `QualityApplier`, `FrameTimeline`), `post/` (`MotionBlur`), `BackgroundTask`. | `game_world`, `physics`, `rail` |
| `player` | `PlayerController` (kinematic `CharacterBody3D`, walk 2.4 / run 6.2 m/s, jump 7.2 m/s, 0.35 m autostep), `PlayerRig`, `FollowCamera`, `HumanFigure`, `LocomotionClips`, `Retarget`, `PeopleManifest`, `people/` (`PeoplePool`, `PersonView`), `poses/` (`SeatPose`, `StrikePose`, `CarryPose`, `Knockdown`, `PoseRig`). | `physics` |
| `vehicles` | `Vehicle` (extends `RaycastVehicle`), `VehicleCatalog`, `VehicleType`, `VehicleModel`, `Driving`, `Gearbox`, `Boarding`, `RiderLink`, `CrashRules`, `CrashFlight`, `crash_effects/`, `traffic/` (`TrafficVehicleView`, `SignalHeads`). | `physics` |
| `ai` | `RoadGraph`, `AgentSystem` (lane-aware vehicle & pedestrian steering, junction claims, zebra crossing & signal yielding, obstacle/player avoidance), `TrafficSignals`, `CrowdField`, `Density`, `Places`, `Carjack`, `StreetHits`. | `game_world` |
| `missions` | Pure-logic mission/job state (`MissionSession`, `StoryRunner`, `JobRunner`, `FareStop`, `GoodsStop`, `ShareShift`, `Chase`, `Life`, `SaveStore`, `content/content.json` with 21+ stages & 13 city jobs). | None (pure `RefCounted`) |
| `combat` | Pure-logic `Combat`, `CombatWorld`, `Weapons`, `Arsenal`, `Melee`, `Gangs`, `Wanted`, `PoliceFleet`, `PedestrianHits`, `Casualties`, `WeaponPickups`. | None (pure `RefCounted`) |
| `rail` | Pure-logic `RailNetwork`, `RailLine`, `RailPath`, `CabDrive`, `LevelCrossing`, `RunProfile`, `StationCrowd`, `StationLayout`. | `map_data` |
| `audio` | `SoundSystem` (`Sound`), `SoundLibrary`, `SoundProfiles`, `Synth` (procedural stand-ins), `EngineBlend`, `EngineVoice`, `Ambience`, `PlayerSounds`, `RailSounds`. | `game_engine` |
| `ui` | `LoadingScreen`, `TitleMenu`, `PauseMenu`, `TouchControls`, `DrivingControls`, `MissionHud`, `Minimap`, `FullMap`, `RailHud`, `DebugHud`, `PerfOverlay`, `BenchmarkCard`, `UiTheme`. | None (data pushed from `app`) |
| `weapons_view` | Procedural low-poly weapon meshes (`WeaponModels`, `LowPoly`) attached to hand bones. | Engine |
| `app` | Composition root (`main.tscn`, `main.gd`) and wiring layers (`PlayWiring`, `DrivingWiring`, `EnvironmentWiring`, `CityLife`, `Carjacking`, `StreetReactions`, `MissionsLayer`, `ParkedVehicles`, `Railway`, `TitleWiring`, `PerfWiring`, `BenchmarkWiring`). | All modules |

---

## 3. Scene Hierarchy & Boot Flow

### Main Scene (`src/app/main.tscn`)
```
Main (Node, src/app/main.gd) [PROCESS_MODE_ALWAYS]
├── CityWorld (Node3D, res://src/game_world/city/city_world.tscn) [PROCESS_MODE_PAUSABLE, added at index 0]
│   ├── ChunkStreamer
│   ├── Streamed Chunk Roots (origin_shifted)
│   └── Landmarks / Decks / StreetLights
├── PlayerRig (added by _add_player)
│   ├── PlayerController (CharacterBody3D, origin_shifted)
│   │   ├── CollisionShape3D (CylinderShape3D: r=0.32m, h=1.75m)
│   │   └── HumanFigure (Skeleton3D + MeshInstance3D + AnimationPlayer)
│   └── FollowCamera (Camera3D + RayCast occlusion)
├── CityLife (Node, traffic + walkers + crowds + signals)
├── PlayWiring (ParkedVehicles, DrivingWiring, EnvironmentWiring, VehicleSounds)
├── MissionsLayer (MissionUi CanvasLayer + MissionBeacon + FareFigures)
├── Railway (trains, stations, level crossings, RailHud)
├── Carjacking / StreetReactions
├── TitleWiring (live city camera tour behind title menu)
├── PerfWiring (QualityApplier, FrameTimeline, PerfOverlay, FeatureSwitches)
├── PauseMenu (CanvasLayer)
├── LoadingScreen (CanvasLayer, instance)
├── TitleMenu (CanvasLayer, instance)
└── DebugHud (CanvasLayer, instance)
```

### Boot Sequence (`Main._load`)
1. **Step 1:** `source.open_index` on `BackgroundTask` worker thread (`world/world.json` v2 or `assets/world/index.json` v1).
2. **Step 2:** `source.open_roads` on `BackgroundTask` worker thread (`roads.bin`).
3. **Step 3:** `_add_city()` — threaded load of `city_world.tscn`, wait for spawn chunks + colliders (`GROUND_WAIT_FRAMES = 120`), spawn `PlayerRig` (`_add_player`), spawn `CityLife` (`_add_life`).
4. **Step 4:** `_add_play()` — attach `PlayWiring` (parked vehicles, driving, environment, audio), `MissionsLayer`, `Carjacking`, `StreetReactions`.
5. **Step 5:** `_add_railway()` — attach `Railway` (suburban EMU / MRTS / Chennai Central trains and stations).
6. **Warm-up & Title:** `perf.warm_up()` compiles shaders behind loading screen, `_prepare_title()` streams the title tour spot (unless `--start=play`), then transitions to `&"title"` or `&"play"` (printing `[boot] play` for CI smoke tests).

---

## 4. World Data & Streaming Pipeline

1. **Offline Geo Pipeline (`tools/geo/chennai_geo/`):**
   - Clips OpenStreetMap extract (`world-boundary.geojson`, Chengalpattu to Pulicat).
   - Outputs Format 2 (`world/world.json` + 47 tiles in `world/tiles/<c>_<r>/` with `tile.json`, `chunks.bin`, `roads.bin`, `areas.bin`, `detail.bin`).
   - Legacy Format 1 (`assets/world/`) remains supported as fallback (`--world=v1`).
2. **Runtime Chunk Streaming (`ChunkStreamer` + `ChunkBuilder`):**
   - Chunks are `250 m × 250 m` squares around `ChunkData.centre`.
   - `ChunkWorkers` (1–3 worker threads depending on `OS.get_processor_count()`) decode binary chunks, apply `AreaPalettes` & `SignCategories`, compute `BuildingMeshes` / `GroundMeshes` / `WaterMeshes` / `RoadDetail` / `TreeBatch` (`MultiMesh`), and generate trimesh colliders (`PIECE_BUILDINGS = 48`).
   - Main thread time-slices `add_child` and `queue_free` within `budget_usec = 2500` (2.5 ms/frame).
   - **LOD Switching:** Explicit `Near` (`walls`, `roofs`, `kit`, `objects`) vs `Far` (single-quad walls + flat roofs) swap at `near_distance` (80–120 m depending on quality preset, +20 m hysteresis).
   - **Render Layer Isolation:** Merged chunk meshes use `RENDER_LAYER = 2`; street lights exclude layer 2 from their cull mask (`G-259`) to prevent per-pixel light evaluation across 250 m chunk meshes on Mobile Vulkan.
