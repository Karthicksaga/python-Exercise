# Game development toolchain audit and phased roadmap

Written 16 Nov 2026, at the user's request, **before** any change it proposes. Nothing below is
built. Status words: *exists* (in the repository and tested as `progress.md` says), *missing*,
*proposed*. Licensing facts are marked with their source in the last section; check them again
before a release.

## 0. What the project actually is (inspected, not assumed)

| Question | Answer, and where it was checked |
|---|---|
| Rendering engine | **Three.js r187** (`apps/game/package.json`), WebGL 2, custom `SceneRenderer` with quality tiers (`packages/game-engine`). Not Godot, Unity or Unreal |
| Language, framework | TypeScript 5.9 strict, npm workspaces, Vite 7 builds one classic IIFE script (TD-3) |
| Physics and collision | Rapier 0.21 (`@dimforge/rapier3d-compat`, WebAssembly embedded in the script) in `packages/physics` only: kinematic character controller (TD-6), ray-cast vehicles locked upright (TD-8), static groups per chunk, kinematic boxes for AI |
| Player controller | `packages/player/src/PlayerController.ts`: walk, run, jump on the Rapier character |
| Animation | `HumanFigure`/`HumanAssets`: one `AnimationMixer` per figure, three clips (idle, walk, run) cross-faded in 0.22 s, playback speed scaled to ground speed (stride-matched, so feet don't slide at steady speeds). Clips are retargeted at load (TD-10). Seated, aiming and punching are **fixed poses**, not animations |
| Character asset | `assets/models/player.glb` (1.8 MB): a Ready Player Me sample avatar from the three.js examples, **a development placeholder not cleared for release** (`assets/README.md`). Pedestrians are copies of it with tinted clothes |
| Animation asset | `assets/animations/locomotion.glb` (190 KB): three Mixamo clips taken from the three.js `Xbot.glb` example |
| Vehicles | Procedural meshes in code (`packages/vehicles/src/models.ts`): hatchback, auto, motorbike, ambulance, bus; merged per material |
| Buildings | Procedural extrusions of real OSM footprints, facade atlas drawn on a canvas, clay-tile hip roofs, water tanks (`ChunkView.ts`) |
| Landmarks | Procedural: Anna Nagar Tower model, a gopuram profile for Kapaleeshwarar (data exists; model not yet drawn) |
| Textures | All generated in code on canvases; no image files, no compression |
| City streaming | 250 m chunks streamed from files since today's J2 work (TD-16): 1,877 chunk files, 4.6 MB for Anna Nagar → T. Nagar → Anna Salai → Marina → ECR |
| Browser / Android | Game runs in Android System WebView inside a React Native 0.88 shell (TD-1). Release APK about 23 MB at 0931329 |
| Tests | 103 unit tests (Vitest), 33 browser tests (Playwright, touch input, software GPU) |
| AGENTS.md | Only `chennai-open-world/AGENTS.md` applies (the other one is for the unrelated hop project). It is unchanged on the remote branch as of this audit |

### Baseline measured today (headless Chromium, software GPU, `?quality=lite`, this machine)

| Place | Draw calls | Triangles | Chunks | Load |
|---|---|---|---|---|
| Anna Nagar spawn, last tested commit 0931329 | 154 | 175k | 10 | world bundled in the script |
| Anna Nagar spawn, city build (uncommitted J2) | 149 | 165k | 9 | ready in 3.5–4.3 s |
| T. Nagar, Sir Thyagaraya Road | 105 | 164k | 9 | 0.9 s after teleport |
| Anna Salai | 90 | 152k | 8 | 0.3 s |
| Kapaleeshwarar Temple area | 97 | 149k | 9 | 0.2 s |

JS heap about 110–125 MB with the city (45 MB at 0931329: the always-loaded road graph and
signals for the whole city are the main growth; see Phase 1). Frame rate on this machine is
not meaningful: the baseline commit and the city build both run at 100–300 ms frames in
software rendering here. **Nothing has been measured on a phone.**

### Tools available where this audit was done

Installed: Node 22, Python 3.13, JDK 21, ffmpeg, ImageMagick, Chromium + Playwright.
**Not installed:** Blender, glTF Transform, gltfpack, KTX-Software (`toktx`), Android SDK,
`adb`, emulator. No Blender, Mixamo or Sketchfab integration is connected to this session; the
Figma connector exists but needs signing in. So no tool in sections 1–6 has been used yet.

## 1. Realistic 3D character modelling

- **Exists:** one placeholder avatar (Ready Player Me sample), unsuitable for release.
- **Missing:** an original, release-cleared character with face, hair, clothing and footwear;
  several pedestrian variants (sarees, veshtis, school uniforms, office wear, workers); LODs.
- **Recommended:**
  - **Blender 5.3** (GPL; the files you make are yours) as the hub for modelling, clothing,
    UVs, materials and glTF export. Automatable: `blender -b -P script.py` runs headless
    Python, so exports, decimation and LOD generation can be scripted and re-run in CI.
  - **MakeHuman / MPFB2** (Blender add-on) for a realistic, correctly proportioned base body
    with a game rig. Its exported characters are usable in commercial games (licence to be
    re-checked, section 9). Faster and more realistic than modelling anatomy by hand.
  - Clothing modelled in Blender over that body; Indian clothing (saree, veshti, lungi,
    salwar) needs custom work: no asset library has good free versions.
  - Alternatives for speed: Quaternius / Kenney characters (CC0, stylised, very light), or a
    paid, commercially licensed character from a marketplace. **Do not** take Sketchfab models
    marked NC, or anything whose licence forbids redistribution inside an app.
- **Automation:** Blender CLI + Python (yes); MPFB2 has a Python API (yes); a Blender MCP
  server could let an agent drive Blender interactively (exists as community projects; would
  need installing and trusting; not required, as plain `blender -b -P` scripts are reviewable
  and reproducible).
- **Dependencies:** Blender on the machine that builds assets (not in the game). Nothing new in
  the game: `GLTFLoader` already loads the character.
- **Performance:** today's character is about 1.8 MB. A "realistic" one (30–60k triangles,
  2k textures) is fine for the player but not for 7–10 pedestrians on a phone. Plan: player
  LOD0 ≤ 30k triangles; pedestrians ≤ 8–10k triangles sharing one texture atlas; draw no
  people beyond 90 m (already done); texture compression (section 7). Budget per skinned
  figure: 1–2 draw calls.

## 2. Character rigging and animation

- **Exists:** retargeting of Mixamo-named skeletons at load (TD-10), idle/walk/run with
  speed-matched playback and cross-fades, fixed poses for sitting, aiming and punching.
- **Missing:** jog/sprint, start/stop, turn-in-place, jump/fall/land, walk backwards, stairs,
  enter/exit vehicle, sitting, talking, pick up, punch/kick/block/hit reactions, foot IK.
- **Recommended:**
  - **Mixamo** for auto-rigging the Blender character and for the clip library (locomotion,
    jumps, fighting, sitting, talking, vehicle entry). Free with an Adobe account; usable in
    games; raw files must not be redistributed on their own. **No API**: clips are
    downloaded by hand from the website (an agent cannot do it unattended).
  - **Blender** to trim, loop, rename and pack clips into one `animations.glb` per rig, by a
    Python script (`scripts/` already has `extract-animations.py` as a pattern).
  - In the game, keep Three.js `AnimationMixer` and grow `HumanFigure` into a small
    **animation state machine**: locomotion blend (idle↔walk↔jog↔run by speed, already
    stride-matched), one-shot layers (punch, kick, hit reaction) with upper-body masks,
    full-body states (jump, fall, land, enter/exit vehicle, sit).
  - **Foot IK:** the city is flat (TD-8), so feet only need IK on stairs, kerbs and the tower
    plinth: a two-bone IK solver (about 100 lines; three.js `CCDIKSolver` in the examples is
    an option) with one ray per foot, for the player only.
  - **Motion matching:** not recommended. No maintained web library exists, and it needs a large
    motion database and CPU that phones in a WebView don't have. A blend state machine with good
    clips gets most of the benefit.
- **Automation:** Blender scripts (yes); Mixamo (manual download only).
- **Performance:** each clip is small (tens of KB). The cost is per figure per frame: one
  mixer update. Animate pedestrians beyond about 40 m at half rate.

## 3. Chennai-specific building generation

- **Exists:** OSM footprints extruded to OSM `height` / `building:levels` or 2 floors
  (estimated and labelled), procedural facade atlas, clay-tile roofs, water tanks, one merged
  mesh per chunk for walls and one for roofs (TD-11), Anna Nagar Tower model.
- **Missing:** balconies, sunshades (chajjas), grilles, shop fronts with shutters and awnings,
  Tamil signage, compound walls and gates, street furniture (electricity poles and wires, bus
  shelters, kerbs and medians, temple car streets), landmark models for Kapaleeshwarar
  (gopuram profile data exists), Marina lighthouse, LIC building, Central station, Ripon
  building.
- **Recommended (two tiers, as you suggested):**
  1. **Ordinary buildings stay procedural, in the game.** Extend `ChunkView` with facade
     "kits" chosen by building kind and district: residential (balconies, grilles, sunshades),
     commercial (ground-floor shop fronts, shutters, painted signboards), apartments. Kits are
     small instanced meshes (a balcony, an awning) placed along facades at build time, plus a
     better facade atlas. Tamil signage: **invented shop names and words** (no real business
     names, AGENTS.md) drawn into the atlas with a Tamil font that allows embedding (e.g. Noto
     Sans Tamil, SIL Open Font Licence).
  2. **Landmarks are modelled in Blender** from photos and published dimensions, exported as
     GLB, compressed (section 7), and placed by the existing landmark system
     (`packages/game-world/src/landmarks.ts`). Original models only.
  - Street furniture from **Kenney** (CC0) or Blender-made, instanced per chunk.
- **Pipeline:** OSM → `build-world.ts` (Node) → chunk files → procedural meshes in the game.
  Blender is only for kit pieces and landmarks. Running Blender over the whole city
  ("OSM → Python → Blender → GLB") is **not** recommended for ordinary buildings: it would
  turn a 4.6 MB city into hundreds of MB of meshes, lose streaming flexibility, and every OSM
  refresh would need Blender. The pipeline you proposed fits landmarks and kit pieces exactly.
- **Performance:** kits as instanced meshes add about 3–5 draw calls per chunk; balconies and
  awnings are low-poly. Budget: stay under 300 draw calls and 300k triangles in T. Nagar
  (measured: 105 calls, 164k triangles now), so there is room, but each kit must be measured.

## 4. Realistic vehicles and animations

- **Exists:** five procedural vehicles; ray-cast suspension; drift, gears, siren, crash
  thud; rider shown on the bike and auto; night lamps; traffic uses the same models.
- **Missing:** detailed bodies and interiors, rotating steering wheels, brake lights and
  indicators driven by input, damage, door animation and the enter/exit sequence, recorded
  engine sounds.
- **Recommended:**
  - **Blender** for original models of each vehicle at LOD0 (player, about 10–20k triangles)
    and LOD1 (traffic, 2–4k triangles), with named nodes (`wheel_fl`, `steering`, `door_l`,
    `brake_lamp`) so the game animates them. Original designs only: no real brand logos.
  - In the game: brake/indicator/reverse lamps as emissive materials switched by input
    (cheap); wheel and steering node rotation already have the data (`VehicleBody`).
  - Vehicle sound: recorded engine loops (CC0 from Freesound, licence checked per file) with
    pitch by speed, replacing the synthesised tones (TD-14) when you want.
- **Performance:** today the hatchback is a few hundred triangles. LOD0 for the player's
  vehicle only, LOD1 for the 9–12 traffic vehicles: about +30k triangles in all.

## 5. Environmental assets and materials

- **Exists:** canvas-generated textures (asphalt, paving, grass, earth, facades, roof tiles),
  procedural trees and palms, golden hour, day/night, rain, the sea (from the OSM coastline,
  added in J2), sea haze near the coast.
- **Missing:** PBR texture sets (normal and roughness maps), better water (waves, foam on the
  beach), vegetation variety (neem, banyan, gulmohar), street lights at night, kerb and median
  geometry, sky with clouds.
- **Recommended:** **Poly Haven** and **ambientCG** PBR textures (CC0) for asphalt, concrete,
  plaster, sand and laterite, resized to 512–1k and compressed (section 7). Trees from Blender
  (or Quaternius CC0) as instanced low-poly models with LOD billboards. Water: a small custom
  shader on the existing sea mesh (normal-map scroll and a shoreline foam band from the coast
  distance). Keep `MeshStandardMaterial` (already PBR) so nothing in the renderer changes.
- **Performance:** textures are the main memory risk in a WebView. Compressed 1k textures cost
  about 0.7 MB GPU each versus 4 MB uncompressed. Normal maps on buildings cost fill rate on
  phones; use them on the ground and landmarks only, and measure.

## 6. Game UI and HUD design

- **Exists:** DOM/CSS HUD, touch controls, minimap (tiled since J2), pause menu, job board,
  result screen, landmark labels. All in code (`packages/ui`).
- **Missing:** a consistent visual system, main menu art, settings (volume/mute, quality,
  controls), mission intro and completion screens with art, vehicle selection, a map screen.
- **Recommended:** **Figma** for the screens (there is a Figma connector for this
  workspace; it needs signing in first), then implement in the existing DOM/CSS UI. No UI
  framework is needed in the game: the HUD is light and touch-first by design (TD-1).
  Simple changes (a mute switch, a settings list) go straight into code without Figma.
- **Performance:** none worth measuring if the HUD stays DOM; avoid per-frame DOM layout.

## 7. Asset optimisation

- **Exists:** merging and instancing (TD-11), chunk streaming and disposal, quality tiers,
  5 cm quantised world files.
- **Missing:** a glTF optimisation step; compressed textures; mesh LODs.
- **Recommended:**
  - **glTF Transform** (MIT, Node; CLI and scripting API) as the single asset step in
    `scripts/optimize-assets.mjs`: `dedup`, `prune`, `weld`, `simplify` (LODs),
    `meshopt` (geometry compression) and KTX2 textures (`uastc` for normals, `etc1s` for
    colour; needs the **KTX-Software `ktx` CLI 4.4+**, Apache 2.0). Runs in CI.
  - In the game: `MeshoptDecoder` (embeds its own wasm) and `KTX2Loader` (fetches the Basis
    transcoder `.js` and `.wasm`, which needs `WebViewAssetLoader` on Android, TD-16).
- **Dependencies:** `@gltf-transform/cli` as a dev dependency; `toktx` binary on the
  asset-building machine and CI. Nothing heavy in the shipped game.
- **Performance:** typically 50–80% smaller GLBs and 4–6× less texture memory. APK budget
  60 MB: today about 23 MB; the city adds about 5 MB.

## 8. Browser and Android testing

- **Exists:** Vitest unit tests, Playwright browser tests with touch events and a software
  GPU, the `window.__cow` debug handle, Android build (Gradle) and emulator runs done earlier
  on another machine.
- **Missing:** CI (being added now: `.github/workflows/chennai-open-world.yml`, typecheck,
  unit and browser tests, a web build on GitHub Pages and a test APK as a download);
  automated emulator smoke test; performance capture on a real phone.
- **Recommended:**
  - GitHub Actions for every push (in progress).
  - Emulator smoke test in CI (`reactivecircus/android-emulator-runner` on Linux runners
    with KVM) that installs the APK and checks the game reaches `data-ready` and loads chunks
    (proves TD-16's XHR loading). Proposed for Phase 1.
  - Real phone: a mid-range Android (e.g. 4–6 GB RAM) with Chrome remote debugging
    (`chrome://inspect`) for fps, memory and heat. Only you can do this.
- **Performance:** none in the game; CI minutes only.

## 9. Licensing summary (verify again before release)

Checked on 16 Nov 2026 by web research (secondhand where a primary page could not be read;
marked so). Rule for this project: an asset is used only if its licence allows use inside a
commercial app, and its source is written in `assets/README.md`.

| Source | Licence | Commercial game | Notes |
|---|---|---|---|
| Ready Player Me (today's player model) | Avatars CC BY-NC 4.0 unless a partner agreement; service shut down 31 Jan 2026 after Netflix bought it | **No** | The three.js sample avatar carries no licence of its own. Must be replaced before any release |
| Mixamo | Royalty-free in commercial games | Yes | Raw files may not be redistributed on their own (shipping inside the game is the accepted practice, per Adobe staff answers, not formal terms). Website only, no API; the official FAQ could not be read (403) |
| Poly Haven | CC0 | Yes | Models, textures, HDRIs |
| ambientCG | CC0 | Yes | Explicitly allows raw files in a game |
| Kenney | CC0 | Yes | Don't use the Kenney logo |
| Quaternius | CC0 | Yes | Stylised low-poly characters and animations |
| Sketchfab / Fab, Standard licence | Commercial use, no standalone redistribution | Yes | Per asset |
| Sketchfab CC-BY | Attribution required | Yes, with credits | Per asset |
| Sketchfab CC-BY-NC, Editorial | Non-commercial / editorial only | **No** | |
| MakeHuman / MPFB2 | Program AGPL/GPL; base mesh and assets CC0 since 2020 | Yes (exports CC0) | Only with an official, unmodified export path; primary licence text not read |
| Blender 5.3 (10 Nov 2026; LTS 5.2) | GPL program; your files and exports are yours | Yes | Runs headless: `blender -b --python script.py -- args` |
| blender-mcp (community, MIT) | MIT | n/a (a tool) | Drives a running Blender GUI over an unauthenticated local socket and runs arbitrary Python: interactive use only, not CI |
| glTF Transform 4.5 | MIT | n/a (a tool) | KTX2 commands now need the `ktx` CLI from KTX-Software 4.4+ (not `toktx`) |
| meshoptimizer / gltfpack | MIT | Yes (decoder ships in the game) | Texture compression only in the native gltfpack binary |
| KTX-Software | Apache 2.0 (some bundled parts differ) | n/a (a tool) | |
| Noto Sans Tamil (proposed) | SIL Open Font Licence | Yes | Embeddable |

Technical findings that change the plan:
- **Three.js `KTX2Loader` fetches `basis_transcoder.js` and `.wasm` with `fetch`**, which fails on
  `file:` in the WebView. Either embed both and hand out `blob:` URLs, or (better) serve the game
  through `WebViewAssetLoader` (TD-16). `MeshoptDecoder` embeds its wasm and works anywhere.
- **IK:** three.js has only the generic `CCDIKSolver`; no maintained two-bone or foot-IK library
  exists. A small analytic two-bone solver with Rapier rays is the plan.
- **Motion matching:** no maintained, commercially usable web library (the nearest is CC BY-NC
  and WebGPU-only). Not planned.
- **CI:** GitHub's Linux runners have KVM, so `reactivecircus/android-emulator-runner` can run
  an emulator smoke test; the runner image already has the Android SDK (build-tools 34–37,
  NDK 27).

## 10. Phased roadmap (for approval)

Each phase ends playable, tested in the browser, with measurements recorded in
`progress.md`. Nothing starts without your go-ahead.

| Phase | What | Tools | Needs from you |
|---|---|---|---|
| **0. Finish J2 (in progress)** | Commit the streamed city (done in the browser), gopuram model, Marina evening drive and city jobs, visited districts in Share progress, docs | Code only | Answer: keep, tone down or remove fight stages 7–10? |
| **1. Foundations** | CI (in progress); serve the game through `WebViewAssetLoader` (native code in the shell, replaces the interim file-access setting, TD-16); emulator smoke test for file loading; asset optimisation script; memory: road graph and signals built per area instead of the whole city (done, TD-17); performance overlay | glTF Transform, toktx, GitHub Actions | Enable GitHub Pages; run the APK on a real phone once |
| **2. Character pipeline** | Base character (MPFB2 or a licensed character), clothing, Mixamo rig and clip set, `HumanFigure` state machine (locomotion blend, jump/fall/land, enter/exit, sit, punch/kick/block/hit), player foot IK on steps; 3–4 pedestrian variants | Blender, MPFB2, Mixamo | A Mixamo/Adobe account to download clips; character look approval |
| **3. World look** | Facade kits (balconies, sunshades, shop fronts, invented Tamil signboards), electricity poles, bus shelters at the 533 real stops, kerbs and medians, PBR ground textures, water shader, street lights | Blender (kits), Poly Haven/ambientCG, Noto Sans Tamil | Look approval on screenshots |
| **4. Landmarks** | Blender models: Kapaleeshwarar gopuram, Marina lighthouse, Central station, Ripon building, LIC building | Blender | Reference photo choices |
| **5. Vehicles** | Blender models with LODs, lamps and indicators by input, steering and door animation, recorded engine sounds | Blender, Freesound (CC0) | — |
| **6. Gameplay** | Story and side missions across the city, exploration rewards, progression; pedestrians crossing at zebras and reacting to the player; traffic variety (police, emergency) | Code | Story direction, and the violence decision |
| **7. UI** | Figma designs for menu, HUD, mission screens, settings, map | Figma | Sign in to the Figma connector |

### Your three pipelines, as they would sit in this repository

1. **World production:** `assets/osm` → `scripts/clip-city.py` (Python) →
   `scripts/build-world.ts` → `apps/game/public/world` (exists). Blender joins only for
   landmark and kit GLBs in `assets/models/landmarks` and `assets/models/kits`, through
   `scripts/optimize-assets.mjs`.
2. **Character production:** Blender (+ MPFB2) → Mixamo rig and clips → Blender clean-up
   script → `assets/models/*.glb` + `assets/animations/*.glb` → glTF Transform → the game's
   `HumanAssets` (retargeting already supports Mixamo bone names).
3. **Game production:** TypeScript packages → Vite → browser (Playwright) → Android shell
   (Gradle) → CI artifacts.
