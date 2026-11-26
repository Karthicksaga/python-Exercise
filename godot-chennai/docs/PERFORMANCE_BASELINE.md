# Performance Baseline — Chennai Open World (`godot-chennai`)

> **Target Hardware:** Mid-range Android devices (baseline reference: POCO M6 Pro 5G / Adreno 613, landscape `915×412` base UI).
> **Renderer:** Godot 4.7.2 Mobile (Vulkan) with OpenGL ES 3 (`gl_compatibility`) fallback.

---

## 1. Existing Quality Presets (`src/game_engine/quality/quality_settings.gd`)

Auto-detection selects `Low` for Adreno 613-class GPUs and automatically steps down one tier if play stays below 24 fps for 10 seconds.

| Setting | `Low` | `Medium` | `High` |
|---|---|---|---|
| **3D Resolution Scale** | 65% (bilinear) | 80% (bilinear) | 100% |
| **City Shading Mode** | Per-vertex (`SHADING_MODE_PER_VERTEX`, no specular) | Per-pixel (`SPECULAR_DISABLED` on rough city mats) | Per-pixel (`SPECULAR_DISABLED` on rough city mats) |
| **MSAA 3D** | Off | Off | 2x |
| **Directional Sun Shadows** | 1024px, 18 m, hard | 1024px, 28 m, hard | 2048px, 40 m, soft |
| **Entity Shadows** | None | None | Trees, street objects, walkers ≤ 18 m |
| **Streaming Load / Near / Haze / Far** | 200 / 80 / 240 / 330 m | 240 / 100 / 300 / 480 m | 260 / 120 / 340 / 1500 m |
| **Traffic / Walkers / Drawn Figures** | 18 / 14 / 12 | 26 / 24 / 24 | 34 / 34 / 36 |
| **Figure Animation Distance** | ≤ 25 m (in view) | ≤ 35 m (in view) | ≤ 45 m (in view) |
| **Parked Vehicles Radius** | 100 m | 150 m | 200 m |
| **Real Street Lights** | 0 (additive glow mesh only) | 2 (excl. chunk layer 2) | 6 (excl. chunk layer 2) |
| **Road Extras (`road_extras`)** | 0 (no guards/shrubs/wires/rubble) | 1 (keeps wires, drops guards/shrubs/rubble) | 2 (all) |
| **Rain Drops / Title Rain Layers** | 40% / 0 | 70% / 1 | 100% / 2 |

---

## 2. Measured Baseline & Bottlenecks (`docs/performance.md`)

### Desktop / Headless & Software-Renderer Bisect (T. Nagar)
| Stage | Main-Thread CPU (ms) | Nodes | Skeletons | Shadow Casters | Draw Calls | Primitives | Textures |
|---|---|---|---|---|---|---|---|
| World + Player only (`4c6dc0e`) | 0.57 ms | 242 | 1 | 32 | 53 | 172k | 15 MB |
| + Parked vehicles & Day/Night (`1e87bba`) | 0.91 ms | 418 | 1 | 54 | 73 | 170k | 45 MB |
| + Traffic, Walkers, Crowds, AI (`74a63a1`) | **1.85 ms** | **1,895** | **33** | **205** | **107** | 195k | 80 MB |
| Pre-optimization HEAD (`7598647`) | 2.32 ms | 2,340 | 38 | 284 | 115 | 252k | 88 MB |

### Documented Phone Observations (Adreno 613, Pre-Preset Build)
- **Open daytime street:** ~28 fps
- **With traffic and pedestrians:** ~14 fps
- **Dusk (18:40) on a long street:** ~4 fps

### Primary Performance Bottlenecks
1. **Skinned Characters & Skeletons (CPU + Draw Calls):** 30–50 active `Skeleton3D` instances (`walkers`, `crowds`, `drivers`) drove the largest CPU jump (+0.7–1.6 ms headless, +21–28 draw calls). Mitigated on `Low` by capping drawn figures to 12 and freezing animations beyond 25 m or outside the camera frustum.
2. **250 m Chunk Mesh Pixel Overdraw at Dusk/Night (GPU):** Real `OmniLight3D`/`SpotLight3D` street lamps originally shaded every pixel of the 250 m merged chunk meshes. Mitigated via `ChunkBuilder.RENDER_LAYER = 2` cull-mask exclusion (`G-259`) and 0 real street lights on `Low`.
3. **Half-Precision Specular Artifacts & Cost on Adreno 613:** Mitigated by `SPECULAR_DISABLED` (`G-343`) and `set_flat(true)` per-vertex shading on `Low` (`G-342`).
4. **Main-Thread Chunk Stalls:** Mitigated by `ChunkWorkers` off-thread mesh/trimesh generation + 2.5 ms/frame `ChunkStreamer.budget_usec` time-slicing + `ShaderWarmup` behind the loading screen (`G-346`).
5. **APK / Storage Footprint:** `assets/people/` (133 MB) + `world/` (38 MB) + `assets/vehicles/` (11 MB) + `assets/world/` (9.1 MB) total ~200+ MB raw before compression/exclusions.

---

## 3. Built-In Profiling & Benchmarking Tools

- **Live Perf Overlay:** Three-finger tap (or Pause → `Performance overlay: On`) displays FPS, frame time, CPU/GPU split, draw calls, primitives, VRAM, and streaming counts (`src/ui/debug_hud/perf_overlay.gd`).
- **Feature Switches (`SWITCHES`):** Live ON/OFF toggles + `SAFE MODE` to isolate per-feature ms deltas (`src/app/perf/feature_switches.gd`).
- **Automated 7-Minute Route Benchmark:** `Settings → Run benchmark` (`src/app/benchmark/benchmark_runner.gd`) runs a deterministic 90-second city route across all 3 quality presets (`Low`, `Medium`, `High`), outputting `benchmark.txt`, `benchmark.json`, and an on-screen `BenchmarkCard` with avg / p95 / p99 frame times and `>50 ms` stutter counts.
- **Pending Action:** Run `BenchmarkRunner` on both the Mobile Vulkan APK (`godot-chennai-apk`) and Compatibility GL APK (`godot-chennai-apk-compat`) on a real mid-range Android device to establish post-optimization phone numbers.
