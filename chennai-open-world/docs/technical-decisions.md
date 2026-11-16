# Technical decisions

Each entry: the decision, why, and what would make us revisit it. Newest last.

## TD-1: The game runs in the Android System WebView, inside a React Native shell

**Decision.** The 3D game is a TypeScript web runtime (Three.js + Rapier) built by Vite and
shipped inside the APK. A React Native app hosts it in `react-native-webview` and provides the
native menu, lifecycle (pause on background, Back button), orientation and full-screen mode.
The in-game HUD and touch controls are drawn by the game runtime, not by React Native.

**Why.** The brief asks for React Native + TypeScript + Three.js + Rapier, and warns that web
3D libraries don't all work in React Native. They don't:

| Option | Rendering | Rapier (WebAssembly) | JS speed for game code | Verdict |
|---|---|---|---|---|
| A. React Three Fiber on `expo-gl` (Hermes) | WebGL-like context, partial; texture/glTF loaders need shims | **Does not run: Hermes has no WebAssembly** | Hermes has no JIT; physics and AI in JS are several times slower than V8 | Rejected |
| B. `react-native-wgpu` (WebGPU) + Three.js WebGPU renderer | Promising, young; needs New Architecture | **Same Hermes limit** | Same as A | Rejected for now |
| C. `react-native-filament` (native renderer + Bullet) | Native quality | Uses Bullet, not Rapier | Native | Rejected: little support for procedural meshes (our whole OSM world), small ecosystem, no desktop test loop |
| **D. WebView runtime in a React Native shell** | Full WebGL 2 (Chromium) | **Runs** (Chromium has WebAssembly) | V8 with JIT | **Chosen** |
| E. Unity / Godot / Unreal | Best | Own physics | Native | Outside the brief (TypeScript, React Native) |

Options A and B fail on a hard fact, not a preference: Rapier is distributed as WebAssembly and
React Native's Hermes engine cannot execute WebAssembly. Replacing Rapier with a pure-JS engine
(cannon-es) would run, but without a JIT.

**What was validated, and how.**
- The production bundle (one classic script; see TD-3) renders the street, runs Rapier and
  passes the touch-driven browser tests in headless Chromium (Playwright 1.64, software WebGL).
- Android: the release APK runs on an Android 15 emulator (WebView 157) at 57–60 fps with the full game. Not yet run on a physical phone; see `docs/progress.md`.

**Costs we accept.**
- React Native's role is a shell. In-game UI is DOM/CSS, because sending 60 Hz joystick input
  across the React Native bridge adds latency for no gain.
- Performance depends on the device's WebView version (updatable through Play Store, Android
  7+). Very old or low-end devices may have WebGL blocklisted; the game shows a clear error.
- No direct access to native APIs from game code; anything needed goes through the bridge in
  `apps/game/src/nativeBridge.ts`.

**Revisit when** frame rate on a mid-range phone can't hold 30 fps after Phase 7 optimisation,
or Hermes gains WebAssembly support. The game runtime's packages do not depend on the WebView,
so moving them under another renderer host is possible; the rendering package would change most.

## TD-2: Local tangent-plane coordinates, +X east, -Z north

Latitude/longitude are converted to metres around a fixed origin with an equirectangular
projection (`packages/map-data/src/projection.ts`). Error is under 1 cm per km near Chennai,
well below OpenStreetMap's accuracy. Each streamed chunk will carry its own origin offset, so
32-bit float precision on the GPU stays fine however far the city extends.

## TD-3: The production build is one classic (non-module) script

A WebView refuses `<script type="module">` from `file://` URLs (treated as cross-origin), and
`fetch()` of a `.wasm` file from `file://` fails for the same reason. So Vite emits one IIFE
bundle and we use `@dimforge/rapier3d-compat`, which embeds the WebAssembly in the script. The
bundle is about 8.1 MB: Rapier, Three.js, the world file and the character model. Binary assets
are imported with `?inline` and embedded as base64 for the same `file://` reason. It is read from
the APK, not downloaded.
The alternative, serving assets through `WebViewAssetLoader` on a fake https origin, needs
native code and is worth doing when streamed world chunks are added (Phase 2/7).

## TD-4: Workspace packages are TypeScript source, not built libraries

`packages/*` export `src/index.ts` directly; Vite and `tsc` consume the source. No per-package
build step, instant edits. `apps/mobile` is deliberately **not** an npm workspace: React Native's
Metro bundler and Gradle autolinking expect their own `node_modules`, and the shell needs none
of the game packages (it only loads the built bundle).

## TD-5: World data is plain data; rendering and physics read it separately

A `WorldChunk` (`packages/game-world`) has no Three.js or Rapier types. `ChunkView` makes meshes
from it and `chunkColliders` makes solids from it. This keeps the OSM pipeline testable without
a GPU and lets collision be unit-tested.

## TD-6: Kinematic character controller, fixed 60 Hz step

The player is a capsule moved by Rapier's character controller (slides on walls, climbs kerbs
up to 0.35 m, snaps to ground), not a dynamic rigid body: predictable and cheap. Gameplay and
physics run in fixed 1/60 s steps, rendering once per display frame.

## TD-7: The world is built from OSM at build time, with invented detail clearly separated

`npm run build:world` turns the saved extract into the world files (TD-16; originally one bundled `anna-nagar.json`).
`packages/map-data` only translates OSM into geometry with its tags; `packages/game-world`
decides what things look like. Where OSM has no data for this area the game invents it
deterministically and says so in the code: road widths from the road class, building heights
and floors from footprint size and type, wall colours, and extra trees along avenues and in
parks. Trees mapped on a carriageway (medians) are dropped until medians are modelled.

## TD-8: Arcade vehicles: ray-cast wheels, chassis cannot roll or pitch

Vehicles use Rapier's ray-cast vehicle controller with rotation locked to the vertical axis.
They cannot flip, which suits touch controls and a flat map, and lets a two-wheeler stand up
without balancing physics (its lean is drawn, not simulated). Revisit if terrain gets slopes.

## TD-9: AI agents are kinematic and steer towards a point ahead

Traffic and pedestrians are not simulated vehicles or characters. Each follows the road graph
by steering at a "carrot" a few metres ahead in its lane, slows for anything in its path, and
carries a kinematic collision box so the player's vehicle hits it. This costs almost nothing
per agent and is fully unit-tested without a renderer. Agents far from the player are moved to
a road near them, so about ten vehicles and seven people populate the whole map.

## TD-10: Animations are retargeted at load time

The character and the animation clips come from different rigs with the same bone names but
different rest orientations and rest poses (A-pose versus T-pose). `retargetClips` transfers
each bone's rotation in world space and first aligns each limb's rest direction, so any
Mixamo-compatible character can be dropped in without re-exporting animations.

## TD-11: Draw-call budget by merging and sharing

Every building in a chunk is merged into two meshes (walls, roofs) sharing one facade atlas;
roads for the whole map are a few meshes; each vehicle is merged to one mesh per material with
materials shared between vehicles; trees and water tanks are instanced; pedestrians further
than 90 m are not drawn. The whole scene is about 270 draw calls.

## TD-12: A "lite" render quality for automated tests

`?quality=lite` draws at a quarter of the pixels without shadows. Software WebGL on a machine
with no GPU otherwise runs the scene below real time, which makes timing-based gameplay tests
fail for reasons unrelated to gameplay. Physics, AI and missions are identical in every quality.

## TD-13: Combat is rules without a renderer

`packages/combat` knows positions, health and cooldowns and nothing else. It asks the game two
questions (is there a clear line between two points; how far to the first wall) and returns
events (shot fired, enemy down, player hurt) that the game turns into tracers, poses and sound.
Shots are instant ray tests with aim assistance, which suits a touchscreen where precise aiming
is hard. Enemy accuracy takes an injectable random source, so every rule is tested exactly.
Enemies exist only while a "defeat" objective for their group is current.

## TD-14: Sound is synthesised

`packages/audio` makes every effect from oscillators and filtered noise: nothing to download,
embed (TD-3) or license. It is a stand-in; recorded sound is on the roadmap. Audio starts on the
first touch because browsers forbid sound before a user gesture.

## TD-15: Road-following agents aim at the corner before sharp turns

An agent normally steers at a point a few metres ahead, round the next corner if need be. When
the next stretch doubles back (a dead end or a turn sharper than about 70°) that point would
move towards the agent as it approached, and it would orbit without arriving; so there it aims
at the end of the current stretch and turns after reaching it. Pedestrians do not treat people
walking the other way as obstacles, or two of them would stand face to face indefinitely. Both
were real bugs seen in play and are covered by tests on a dead-end street.

## TD-16: The city is streamed from files: a JSON index, one roads file, one small file per chunk

**Decision.** `npm run build:world` turns the city extract into `apps/game/public/world/`:
`index.json` (bounds, origin, places, landmarks, districts, bus stops, mapped signals, the sea
and the chunk table, about 0.5 MB), `roads.bin` (every road's centre line, 0.8 MB) and
`c/<col>_<row>.bin`, one per 250 m square that has buildings, trees or areas (1,877 files,
3.4 MB). Binary files are little-endian with coordinates quantised to 5 cm
(`packages/game-world/src/codec.ts`). Squares with only road surface are listed with size 0
and have no file. The generated files are committed, so the game builds without the 58 MB
extract.

At start-up the game reads the index and the roads, then `ChunkManager` fetches the chunks
in range, nearest first, four at a time, and waits only for the ones round the spawn before
the first frame. Meshes and solids are built one chunk per frame; chunks beyond the unload
distance are disposed and a fetch for a chunk no longer wanted is thrown away. Road surface,
markings, parks and sand are built per chunk too (`roadSpansByChunk`, `GroundMeshes`).

**Loading on Android.** The APK page is `file:///android_asset/game/index.html`. Chromium's
`fetch` never reads `file:` URLs, whatever the WebView settings. `XMLHttpRequest` does, when
the WebView allows file access from file URLs (deprecated since Android 11, still working).
So `apps/game/src/WorldFiles.ts` uses `fetch` on http(s) and XHR on `file:`, and the shell
sets `allowFileAccessFromFileURLs` (a `react-native-webview` prop) on its WebView. **This is
an interim choice.** It needs no native code, but:
- That setting lets script in a `file:` page read any file the app can read, including
  app-private data. Our WebView loads only our own bundled page (`originWhitelist` is
  `file://*`, no multiple windows, no external navigation), which limits the risk; it does not
  remove it. Android's own guidance is to use `WebViewAssetLoader` instead.
- Three.js loaders (GLTF, KTX2 and its Basis transcoder `.wasm`) use `fetch`, so streamed
  models and compressed textures will not load this way.

The intended replacement is `androidx.webkit.WebViewAssetLoader`, serving the game from
`https://appassets.androidplatform.net/assets/game/`: one origin for `fetch`, XHR and wasm,
and no file access. `react-native-webview` has no support for it, so it needs native code
(a patch of its WebView client or a small native WebView module). It is Phase 1 of
`docs/toolchain-audit.md`, waiting for approval.

**Not yet verified.** Browser loading is tested (`npm run test:e2e`, headless Chromium). Loading
from the APK has **not** been run: there was no Android SDK or emulator where this was built.
First thing to check on the emulator: the city appears (if chunk files fail, the game shows
empty streets and `snapshot().chunksLoaded` stays 0).

**Revisit when** the first streamed model or KTX2 texture is added (they need `fetch`), or
when XHR from `file:` stops working in a WebView release. Either way the answer is
`WebViewAssetLoader`.

## TD-17: The AI works on the roads round the player, not the whole city

**Decision.** Traffic and pedestrians navigate road graphs built from the roads within 1.2 km
of the player (a 2.4 km square), with spawn weights and signals for the same area. When the
player is 500 m from the square's centre, the graphs are rebuilt round them.
`AgentSystem.rebase` finds each agent's stretch of road in the new graph by its end points
(junction coordinates are the same in both), so nobody on screen moves; agents whose road is
not in the new area are sent to the spawn ring. The signal clock carries over and each
junction's phase offset comes from its position, so the lights don't jump.

**Why.** Whole-city graphs (105,000 drive and 128,000 walk edges) and 13,500 signal approaches
took about 70 MB of the JS heap, for agents that only ever exist within 300 m of the player.
With areas the heap went from 110–125 MB to 51–62 MB (headless Chromium, measured at four
places). A rebuild costs a short pause (tens of milliseconds) every 500 m.

**Revisit when** agents need to plan routes longer than about 700 m (route planning would
need a light whole-city graph, for example in typed arrays).
