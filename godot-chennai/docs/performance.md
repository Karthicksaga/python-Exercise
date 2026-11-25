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
5. Pause → "Graphics: Auto (Low)" changes the level live: Auto → Low → Medium → High → Auto.
   Auto picks from the GPU name, the memory and the screen (an Adreno 613 starts at Low), and
   drops one level by itself if play stays under 24 fps for 10 s (a message says so).

## The benchmark: one tap, one screenshot (G-400…G-405)

1. Install the APK from the latest green CI run (and the "(GL)" one, see above). Start it, then
   **Settings → "Run benchmark"** (on the title's SETTINGS or the pause menu). Put the phone down,
   plugged in or not, but write down which. It takes about 7 minutes: the same 90-second route
   (morning street, 18:40 long street, night street, the Egmore platform, the T. Nagar market,
   over the Anna flyover, a fast drive into new streets) at your level, then at the other two.
   The line at the top says where it is; Back pauses it.
2. At the end a results card fills the screen: **take one screenshot** and send it. It says in
   one line what to use ("Use Low", "Medium is fine"), which renderer ran, the phone, the GPU and
   the build, and a table per level.
3. Do the same on the other APK ("Chennai Open World (GL)", the Compatibility renderer) and send
   that screenshot too: the card names the renderer, so the two can be compared.
4. If you can, also send the text file: the same numbers are saved in the app's data as
   `benchmark.txt` (readable) and `benchmark.json`.

The card's columns: avg, p95 and p99 frame time in ms (p95: one frame in 20 is slower than this),
frames over 50 ms (a visible stutter), and the GPU and CPU time of a frame; the side that limits
the frame is in amber. Under each table: draw calls, triangles, video memory and the chunks built
while driving.

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
| Street lights (night) | 0 | 0 | — | no real lights on Low (High 6, never on the merged chunks); one additive glow mesh (halo and ground pool per lamp) |
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
| 3D resolution | 65 %, bilinear | 80 %, bilinear (FSR 1 is Forward+ only; G-405) | 100 % |
| City lighting | per vertex, no glint | per pixel | per pixel |
| MSAA | off | off | 2x |
| Sun shadows | 1024, 18 m, hard | 1024, 28 m, hard | 2048, 40 m, soft |
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

## Before and after (same harness, T. Nagar)

Rendering under llvmpipe (xvfb, Compatibility, 915x412): ms per frame, draw calls, primitives,
objects, shadow casters. "After" is the branch with every fix of G-256…G-259.

| Hour | Build | llvmpipe ms | Draws | Primitives | Objects | Shadow casters |
|---|---|---|---|---|---|---|
| 08:30 | HEAD 7598647 | 697 | 111 | 265k | 230 | 166 |
| 08:30 | after, High | 654 | 116 | 262k | 235 | 163 |
| 08:30 | after, Medium | 142 | 119 | 235k | 238 | 144 |
| 08:30 | after, Low | 105 | 93 | 229k | 212 | 110 |
| 18:40 | HEAD 7598647 | 1378 | 108 | 244k | 227 | 167 |
| 18:40 | after, High | 662 | 128 | 242k | 247 | 162 |
| 18:40 | after, Medium | 165 | 118 | 206k | 237 | 144 |
| 18:40 | after, Low | 78-139 (two runs) | 102 | 195k | 221 | 110 |

Main thread (headless, `--fixed-fps 60`, 900 frames, the box mostly quiet; script, physics and
engine work, no drawing):

| Place, hour | HEAD | after, High | after, Low | AI step HEAD → Low |
|---|---|---|---|---|
| T. Nagar 18:40 | 7.9 ms | 6.5 ms | 3.3 ms | 6.1 → 1.8 ms |
| Mylapore 08:30 | 4.6 ms | 3.8 ms | 2.0 ms | 3.3 → 1.6 ms |
| Mylapore 18:40 | 2.8 ms | 3.6 ms (noise) | 1.7 ms | 1.8 → 1.6 ms |

Driving the focus at 15 m/s for 40 s (two headings): the streamer's main-thread work per frame
peaked at 4.0-5.1 ms before and 2.7-4.2 ms after on High, 1.3-13 ms on Low (one collider add);
every single step stayed under 4 ms. Frames over 50 ms: 0-3 before, 1-3 after on High, 0 on Low;
in those frames the scripts took 1-3 ms (the hitch line), so the rest was the engine or the OS.

Low draws about the same number of things: its gain is per pixel (resolution, MSAA, shadow
reach and casters, lights). Draw calls stay far under the phone budget of the brief (230-300);
halving them needs fewer chunk layers or merged materials, which was not done.

## Second round: after the owner's phone (24 Nov 2026, G-340…G-346)

**What the phone said (build afed12f, POCO M6 Pro, Adreno 613):** High, 16-19 fps, 56 ms of GPU
time a frame at 2460x1080 with MSAA 2x: the GPU was the limit. It ran High because an earlier build
saved the level; detection gives Low for this phone.

**What changes for you:** start the new build once. It starts at "Graphics: Auto (Low)" (old
saved levels are ignored once; a level you pick from now on is kept). The overlay's level line
reads "Low (auto) · 3D 1599x702 (65% bilinear) · MSAA off · shadows 18 m · max fps 30". Low:

- draws the 3D world at 65 % of the screen (42 % of the pixels; the HUD stays sharp);
- lights buildings, roofs and ground per corner instead of per pixel (flat walls look the same;
  the glossy glint goes);
- keeps the sun's shadow but short (18 m) and hard-edged;
- no MSAA, 0 real street lights, short view and less traffic, as before.

**What it costs here** (software Vulkan, the Mobile renderer, 1230x540, the start of play, 10:20
and 19:30; median of three runs, ms a frame; a quiet build machine; a phone is faster, the ratios
are the point):

| | Day | Night |
|---|---|---|
| High | 158 | 176 |
| Medium | 91 | — |
| Low (new) | 63 | 82 (58-103) |
| Low before this round (75 %, per-pixel lighting) | 73-138 (noisy runs) | — |

Draw calls at that place: High 113, Medium 97, Low 94. Pixel count is the lever: per-vertex
lighting alone saved 5-10 % at the same resolution (A/B at 65 %: 52-54 ms against 55-59 ms of
render time). At night on Low the lit windows (emission) cost about a fifth of the frame; the
ground pools under the lamps cost nothing measurable.

**Hitches (the 66-190 ms drops):** two causes found and fixed.
1. Every change of game state (play start, pause, resume, title) re-applied the graphics level and
   set the shadow map size again, which made the renderer compile its pipelines again: the first
   frame of play took 2 s here. Now only a real change sets it; 0-2 compiles in play.
2. Every 500 m and at every jump the traffic AI moved all its vehicles and people onto the new
   streets on the main thread (70-340 ms). It now does it on its own thread.
Driving 70 s at 15 m/s on High (headless, the frame's own work): 4-8 frames over 50 ms
(worst 340-420 ms) before, 0 after (worst 37-40 ms), with the machine quieter in the second
measurement. One 244 ms frame remains at play start: the physics engine, with the main thread
blocked (not working) for 203 ms of it; under investigation.

**New in the overlay and the log:** every hitch line says which part of the frame took the time
(physics engine, scripts, deferred calls, frees, render, between frames), what was created, freed
or uploaded in it, and whether the phone's main thread was working, waiting for a core or blocked.
"hitches led by: …" counts the causes. Please send the log again from the new build.

## Profile on desktop vs what the phone showed (25 Nov 2026, G-400…G-406)

**How.** The benchmark route (`--benchmark`, the seven segments of the card) on the build machine,
Mobile renderer on software Vulkan (lavapipe) under xvfb at 1230x540, every segment measured with
the interleaved A/B (`--benchmark-ab=shadows,traffic,crowds,parked,trees,kit,far,landmarks,objects`,
G-406): inside each segment the run cycles everything-on and each feature off, 40 steps each, so
the build machine's load (it swung 4x within an hour: the same High configuration measured 542 and
121 ms a frame in two separate runs) falls on every phase alike. One run at High, one at Low, 90 s
of game time each, about 12-18 frames per phase per segment.

**Calibration.** The owner's overlay on the POCO M6 Pro (Adreno 613, build afed12f, High,
2460x1080, MSAA 2x): 55-58 ms of GPU time a frame, GPU-bound, render CPU 1.2-1.4 ms. The High run
here averaged 118 ms of GPU time over the route with everything on, so the rough phone estimate is
**software ms × 0.47** (56 / 118). It assumes the phone spends its time in the same proportions as
a software rasteriser, which a tile-based mobile GPU does not exactly do (shadow passes and overdraw
cost it relatively more bandwidth): read the estimates as a ranking with a size, not a forecast.

**Per segment** (GPU / CPU ms a frame here with everything on; the four largest savings from
switching one feature off, ms of GPU here; the phone estimate of the GPU time; draws and primitives
a frame, High / Low). Single-segment savings carry about ±10 ms of noise at High and ±3 ms at Low
(a few phases measured "negative" costs that large); the whole-route means below are tighter.

| Segment | High here | High: largest items | Low here | Low: largest items | Phone High | Phone Low | Draws H / L | Prims H / L |
|---|---|---|---|---|---|---|---|---|
| Morning, Anna Salai | 175 / 10.2 | shadows 50, objects 26, far 26, kit 25 | 54 / 3.3 | shadows 9, trees 6, far 5, parked 4 | 83 | 25 | 140 / 123 | 164k / 119k |
| 18:40, Kamarajar Salai | 114 / 15.6 | traffic 32, crowds 28, objects 25, landmarks 25 | 41 / 3.9 | shadows 12, traffic 11, trees 10, crowds 10 | 54 | 19 | 160 / 121 | 136k / 64k |
| Night, EVR Periyar Salai | 107 / 8.9 | shadows 31, traffic 23, trees 23, parked 18 | 48 / 3.3 | shadows 12, traffic 8, trees 6, far 6 | 50 | 23 | 147 / 123 | 129k / 85k |
| Egmore platform | 83 / 18.6 | shadows 18, landmarks 12, traffic 9, trees 8 | 35 / 4.1 | landmarks 3, trees 3, shadows 3, objects 2 | 39 | 17 | 142 / 122 | 196k / 122k |
| T. Nagar market | 116 / 12.8 | shadows 25, far 22, landmarks 14, objects 9 | 49 / 3.8 | shadows 11, traffic 9 | 55 | 23 | 164 / 133 | 299k / 177k |
| Anna flyover | 122 / 12.6 | shadows 24, traffic 10, trees 2 | 60 / 4.3 | shadows 7, trees 2, traffic 2, kit 1 | 57 | 28 | 148 / 123 | 200k / 123k |
| Driving, new chunks | 113 / 9.2 | shadows 37, far 31, traffic 28, crowds 27 | 49 / 3.9 | far 9, shadows 6, traffic 6, kit 5 | 53 | 23 | 131 / 119 | 164k / 114k |

**Whole route, ranked** (mean GPU saved over the seven segments ± its standard error, the share of
the frame's GPU time, the phone estimate, and the exact change in draws and primitives):

| Feature off | High: GPU saved here | share | phone ms | draws, prims | Low: GPU saved here | share | phone ms |
|---|---|---|---|---|---|---|---|
| Sun shadows | 28.3 ± 4.6 | 24 % | 13 | −21, −56k | 8.5 ± 1.3 | 18 % | 4.0 |
| Traffic and walkers | 17.8 ± 3.8 | 15 % | 8 | −21, −38k (and the most CPU: −8.6 ms here) | 5.7 ± 1.5 | 12 % | 2.7 |
| Far buildings | 15.1 ± 5.2 | 13 % | 7 | −5 | 2.6 ± 1.6 | 5 % | 1.2 |
| Trees and palms | 14.1 ± 3.2 | 12 % | 7 | −8, −16k | 4.3 ± 1.3 | 9 % | 2.0 |
| Street objects | 10.5 ± 6.2 | 9 % | 5 | −1, −20k | 1.1 ± 1.7 | 2 % | (noise) |
| Landmarks | 10.3 ± 5.1 | 9 % | 5 | 0, −4k | 0.5 ± 1.6 | 1 % | (noise) |
| Crowds | 9.3 ± 5.1 | 8 % | 4 | 0 | 1.6 ± 1.5 | 3 % | (noise) |
| Parked vehicles | 9.2 ± 3.8 | 8 % | 4 | 0 | −0.4 ± 2.2 | 0 % | (noise) |
| Shop fronts (kit) | 8.2 ± 5.1 | 7 % | 4 | 0 | 1.2 ± 0.9 | 3 % | (noise) |

What it says, against the phone:
- **The phone is GPU-bound and so is this route**: CPU here is 9-19 ms at High and 3-4 ms at Low
  against 83-175 and 35-60 ms of GPU; on the phone the render CPU was 1.2-1.4 ms. Draw calls
  (119-164 a frame) stay under the brief's 230-300 budget at every level. Fewer draw calls alone
  would not move the phone's frame.
- **Low on the phone** (estimate): 17-28 ms of GPU a frame along the route (Low is 41 % of High's
  GPU time here, measured in the same quiet hour), under its 33 ms cap at 30 fps everywhere, the
  flyover and the morning street with the least headroom. Medium was not A/B-measured; in one
  three-level run it took 59 % of High's GPU time, about 33 ms on the phone: right at the 30 fps line.
- **High on the phone** (estimate): 39-83 ms, the morning street on Anna Salai the worst (tall
  frontages, low sun, long shadows: shadows alone are 50 ms of its 175 here).
- **Sun shadows are the largest single item at every level**; at Low they still cost about a fifth
  of the frame (15 draws and 29k primitives drawn again into the shadow map, even at 18 m).
- **Traffic and walkers** are the second item on the GPU and the largest on the CPU.
- What the A/B cannot show: the cost of the pixels themselves (resolution, MSAA, per-pixel
  lighting), which is what Low's 65 % scale already cuts (G-342); and the phone's own balance
  (only the owner's benchmark screenshot, both APKs, will show it).

**The next three optimisations (proposed, not built):**
1. **Only moving things in the sun's shadow map.** The merged chunk walls, roofs, decks and the
   ground draw again into the shadow map for a few shadows near the player; give static city
   geometry `cast_shadow = OFF` on Low and Medium (and the shadow look of buildings from a baked
   darkening at wall feet in the chunk's vertex colour), keep the sun shadow for the player,
   vehicles and people. Expected: most of the shadow item, about **−3 ms on Low and −8 to −10 ms on
   High on the phone** (−15 to −21 draws a frame). Check: the A/B with `shadows` again, then the
   owner's card.
2. **Traffic and walkers as instanced bodies.** One MultiMesh per traffic kind for the bodies
   (wheels and drivers only within 28 m) and baked-pose walkers beyond the animate reach: about
   −15 of the 21 draws and half the GPU item, **−1.5 ms on Low, −4 ms on High on the phone**, and
   most of the traffic's CPU (−0.5 to −1 ms of main thread on the phone, measured 1.2 ms headless).
3. **A shorter far layer and cheaper trees on Medium and High.** Far buildings and trees are 25 %
   of High's GPU time but 14 % of Low's (shorter view, no tree shadows): give Medium Low's tree
   material and far-layer reach and High a fade from 60 % of its view. Expected **−5 to −7 ms on
   Medium on the phone**, which with 1. would bring Medium from about 33 ms to about 25 ms: Medium at
   a steady 30 fps on the Adreno 613.

Measured on: build machine (4 cores, shared, load 1-13 while measuring), Godot 4.7.2, Mobile
renderer on lavapipe (Mesa 25.2.8) under xvfb, 1230x540; branch `agent/godot-bench`. Nothing here
ran on a phone.

## Not known yet

- Whether the phone is GPU-bound or CPU-bound: the overlay's verdict will say. Vulkan GPU time
  is measured by the renderer; under Compatibility it may read "n/a".
- Android exposes no thermal state to Godot; the log's "drift" line compares the first and last
  minute at the same settings instead. The benchmark asks Android itself (PowerManager's thermal
  status and headroom, the battery temperature, G-404); whether the POCO answers is unknown until
  its first card.
- Godot's thread priorities do not reach Android's scheduler; the worker cap (one chunk build at
  a time on Low) is the lever left for the two fast cores.

## Roads merged with the street-light rules (G-259, G-316, G-317)

The roads branch's one glow mesh (halo and ground pool per lamp, tinted) replaced the lamp head boxes and the
sodium pool MultiMesh: at night the street lights draw one MultiMesh instead of two. Same scene before (feat at
a6d299f) and after the merge: the game's spawn at 21:00, Compatibility on llvmpipe under xvfb, 915x412, preset set
after loading (so chunks are built at High in both), one run each; frame times on this shared box are noise.

| Preset | Build | Draw calls | Primitives | Lamps | Real lights lit | Glow MultiMeshes |
|---|---|---|---|---|---|---|
| High | before | 243 | 314k | 31 | 6 | 2 |
| High | after | 242-261 (two runs, traffic differs) | 366-367k | 48 | 6 | 1 |
| Low | before | 217 | 139k | 31 | 0 | 2 |
| Low | after | 216 | 166k | 48 | 0 | 1 |

More lamps (twin arms and high masts carry their own heads); the primitives are the road detail (G-310…G-316).
A game started at Low builds its chunks without guards, shrubs, wires or rubble (G-317), which this probe does not show.

