# Performance on phones

How the game is measured, what the quality presets change, what each feature costs, and what
the owner does on the phone. Decisions G-250…G-259 (`technical-decisions.md`).

## For the owner: what to install and what to send back

1. From the CI run of branch `agent/godot-perf` (Actions → Godot Chennai → the latest green run →
   Artifacts) install **both**:
   - `godot-chennai-apk` → `chennai-open-world.apk`, the Mobile renderer (Vulkan);
   - `godot-chennai-apk-compat` → `chennai-open-world-compat.apk`, the Compatibility renderer
     (OpenGL ES 3), named "Chennai Open World (GL)". It installs beside the other one.
2. Start one, play, and **tap the screen with three fingers at once** (or Pause → "Performance
   overlay: On"). The overlay shows FPS, frame time, the CPU and GPU times, the verdict
   (GPU-bound / CPU-bound / both), draw calls, traffic, streaming and the renderer and GPU name.
3. Press **SWITCHES**: every optional part of the game has an ON/OFF button. Press **SAFE MODE**
   (all off, about the early build), wait 5 s, then turn the switches back on one at a time,
   waiting about 5 s after each. The amber line says what each press changed ("Traffic and
   walkers ON changed the frame by +21.0 ms"), and the list is ranked by cost.
4. Pause → the row "Perf: … (tap: copy log)" copies the whole log (also saved every 10 s in the
   app's data as `perf.log`). Paste it back to us, once for each APK, at the same places: the
   morning street with traffic, the 18:40 long street, night driving.
5. Pause → "Graphics: Low/Medium/High" changes the preset live. The first start picks one by
   itself (an Adreno 613 starts at Low).

## How it is measured here (and what that is worth)

- **Harness:** a scratch script boots the real `Main` (`--start=play`), moves the player to a
  place (T. Nagar, Mylapore, Marina, Anna Salai, the spawn), lets it run 10 s of game time,
  then measures. Headless with `--fixed-fps 60` gives the main thread's work per frame (one
  physics step, no drawing); under xvfb with the Compatibility renderer on Mesa llvmpipe at
  915x412 it gives draw calls, primitives, objects and texture memory. The same script ran on
  every merge (throwaway worktrees), never committed.
- **Software rendering is not a phone.** llvmpipe milliseconds only compare runs with each other
  (they scale with pixels, overdraw and lights, like a fill-bound phone GPU, but not in the same
  proportions). The build machine is shared: load average 12-17 on 4 cores while measuring, so
  CPU milliseconds below 1 ms apart are noise. Draw calls, primitives, objects, nodes, bodies
  and skeletons are exact.
- The phone itself is measured only by the overlay and the log above.

## Bisect: which merge made it slow (24 Nov 2026)

Same harness, same places. CPU: main-thread ms per frame, headless, average of five places.
Counts at T. Nagar (xvfb, 915x412). llvmpipe ms is the frame time under software rendering.

| Commit (merge) | CPU ms | Nodes | Skeletons | Shadow casters | Draws | Primitives | Objects | Textures | llvmpipe ms |
|---|---|---|---|---|---|---|---|---|---|
| 4c6dc0e (world + player only: "smooth") | 0.57 | 242 | 1 | 32 | 53 | 172k | 117 | 15 MB | 242 |
| 1e87bba (+ parked vehicles, day and night) | 0.91 | 418 | 1 | 54 | 73 | 170k | 189 | 45 MB | 314 |
| **74a63a1 (+ traffic, walkers, crowds, AI)** | **1.85** | **1,895** | **33** | **205** | **107** | 195k | 223 | 80 MB | **519** |
| 7598647 (HEAD before this work) | 2.32 | 2,340 | 38 | 284 | 115 | 252k | 234 | 88 MB | 352 (noisy) |

The cost first jumps at **74a63a1**, the traffic merge: 30-50 skinned figures (walkers, crowds,
drivers), 34 traffic vehicle views and the AI. Mylapore: 82 → 176 draw calls at that commit.
Texture memory grows 15 → 88 MB, but every texture is VRAM-compressed (ETC2/ASTC on Android):
not a cause. Physics bodies 26 → 75: no explosion. The commits after 74a63a1 were not all
measured (stopped on request to start fixing).

The owner's phone numbers agree: 28 fps on an open daytime street, 14 with traffic and people,
4 at 18:40 on a long street. The 18:40 figure has a second cause: at dusk the six real street
lights light every pixel of the merged chunk meshes (each mesh spans 250 m, so every lamp touches
it). Under llvmpipe, T. Nagar at 18:40 took 1378 ms a frame against 697 ms at 08:30, the same
place, the same counts.

## What it costs, per feature (T. Nagar, counts exact, ms noisy)

From the feature switches turned off one at a time (headless CPU) and on one at a time from safe
mode (xvfb counts):

| Feature | Draws | Primitives | Main-thread CPU | Lighter version on Low |
|---|---|---|---|---|
| Traffic and walkers | +21-28 | +9-11k | +0.7-1.6 ms (largest) | 18 vehicles, 14 walkers, 12 figures drawn, frozen pose beyond 25 m and out of view, no walker shadows, AI step may lag 6 frames |
| Crowds | +0-3 | +2k | +0.3-1.1 ms | inside the 12-figure cap |
| Parked vehicles | +5-6 | +1-5k | +0.3-1.3 ms | only within 100 m, shadows only from LOD 0 |
| Street lights (night) | 0 | 0 | — | no real lights (High 6, now never on the merged chunks); ground glow pools instead |
| Landmarks | +1-11 | +10-15k | +0.6 ms | LOD ranges at 0.6 |
| Trees and palms | +5-7 | +9-16k | ~0.3 ms | no tree shadows (whole chunk MultiMesh in the shadow map) |
| Street objects (gates, towers, poles, props) | +1-6 | +7-17k | ~0.2 ms | no shadows |
| Bridges and decks | +2-8 | +2-7k | ~0.4 ms | — |
| Water ripples, ground cover noise | 0 | 0 | — | still water, no cover noise |
| Sun shadows | — | shadow pass | — | 1024 map, 20 m |
| Mission markers | +17 | +1k | — | entrance rings share one mesh, none beyond 120 m |

## The presets (`QualitySettings.TABLE`)

| | Low | Medium | High (as before) |
|---|---|---|---|
| 3D resolution | 75 %, bilinear | 80 %, FSR 1 | 100 % |
| MSAA | off | off | 2x |
| Sun shadows | 1024, 20 m | 1024, 28 m | 2048, 40 m |
| Shadows of trees, objects, walkers | none | none | trees and objects; walkers within 18 m |
| View: load / near look / haze / far plane | 200 / 80 / 240 / 330 m | 240 / 100 / 300 / 480 m | 260 / 120 / 340 / 1500 m |
| Traffic / walkers / figures drawn | 18 / 14 / 12 | 26 / 24 / 24 | 34 / 34 / 36 |
| Figures animate within | 25 m, in view | 35 m, in view | 45 m, in view |
| Parked vehicles within | 100 m | 150 m | 200 m |
| Street lights (real) | 0 | 2 | 6 (not on chunk meshes) |
| Rain drops / title rain layers | 40 % / 0 | 70 % / 1 | 100 % / 2 |
| Water, ground shaders | light | full | full |
| Anisotropic filtering, mesh LOD bias, landmark LOD | off, 4, 0.6 | 2x, 2, 0.8 | 4x, 1, 1 |
| Frame cap, physics catch-up steps | 30 fps, 2 | 60 fps, 3 | vsync, 5 |
| Chunk builds at once, AI lag allowed | 1, 6 frames | 2, 4 frames | 3, 2 frames |

Auto-detect (`QualitySettings.detect`): unknown or software GPUs, Adreno 610-639, Mali below G68,
PowerVR, and anything under 7 GiB of memory start at Low; Adreno 640s, 700-729 and Mali-G68+
at Medium (Low on screens over 3 Mpx); Adreno 650/660, 730+, Mali-G710+, Immortalis, Xclipse and
desktop GPUs at High. Headless runs use High, so tests and tools measure the full game.

## Before and after (same harness, T. Nagar, xvfb 915x412)

| Hour | Build | llvmpipe ms | Draws | Primitives | Objects | Shadow casters |
|---|---|---|---|---|---|---|
| 08:30 | HEAD 7598647 | 697 | 111 | 265k | 230 | 166 |
| 08:30 | this branch, High | 635 | 113 | 256k | 232 | 163 |
| 08:30 | this branch, Low | 135 | 94 | 237k | 213 | 124 |
| 18:40 | HEAD 7598647 | 1378 | 108 | 244k | 227 | 167 |
| 18:40 | this branch, High | 800 | 84 | 225k | 203 | 162 |
| 18:40 | this branch, Low | 78 | 89 | 191k | 209 | 110 |

(First pass of the fixes; the street lights' cull mask and the prop shadows came after these
runs: see the handoff for the last numbers.) Low draws about the same number of things: the
gain is per pixel (resolution, MSAA, lights, shadow reach). Draw calls stay far under the phone
budget of the brief (230-300); halving them needs fewer chunk layers, which was not done.

## Not known yet

- Whether the phone is GPU-bound or CPU-bound: the overlay's verdict will say. Vulkan GPU time
  is measured by the renderer; under Compatibility it may read "n/a".
- Android exposes no thermal state to Godot; the log's "drift" line compares the first and last
  minute at the same settings instead.
- Godot's thread priorities do not reach Android's scheduler; the worker cap (one chunk build at
  a time on Low) is the lever left for the two fast cores.
