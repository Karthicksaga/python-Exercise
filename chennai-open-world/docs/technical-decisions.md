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
The Android app now serves the game through `WebViewAssetLoader` on an https origin (TD-16),
where module scripts and `fetch` would work. The classic script and `base: "./"` stay anyway: the
build still opens from disk, and changing them buys nothing yet.

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

**Loading on Android.** The APK serves the game at
`https://appassets.androidplatform.net/assets/game/index.html` through
`androidx.webkit.WebViewAssetLoader` with an `AssetsPathHandler` on `/assets/`: requests to that
host are answered from the APK's `assets/` folder (where `npm run sync:android` copies the
build), on the device, and never reach the network (the host is reserved by Android for this;
paths outside `/assets/` get a 404). The page has a normal https origin, so
`apps/game/src/WorldFiles.ts` reads the world with `fetch`, as in the browser, and later
fetch-based three.js loaders (GLTF, KTX2 with its `.wasm` transcoder) will work too. File access
is off: the shell no longer sets `allowFileAccess` or `allowFileAccessFromFileURLs`
(react-native-webview defaults both to off), so a page in the WebView cannot read app-private
files.

How it is wired:
- `react-native-webview` (14.0.1, pinned) has no hook for this, so
  `apps/mobile/patches/react-native-webview+14.0.1.patch` (applied by `patch-package` on
  `npm install`, a `postinstall` script) adds `shouldInterceptRequest` to its `RNCWebViewClient`.
  It handles only `https://appassets.androidplatform.net` and passes every other request to the
  default (unchanged behaviour). The library already depends on `androidx.webkit` 1.14, so the
  app needs no new dependency. A patch was chosen over a native module or a WebView subclass
  because `RNCWebViewClient` is shared by the old and new architecture managers (the app runs
  with `newArchEnabled=true`), while replacing the Fabric view manager would mean registering a
  second `RNCWebView` component against the autolinked one. Cost: the patch must be redone when
  react-native-webview is upgraded (patch-package fails the install if it no longer applies).
- `apps/mobile/src/GameScreen.tsx` loads that URL, whitelists only that origin and also checks the
  exact origin in `onShouldStartLoadWithRequest` (the whitelist is a prefix match), so the
  WebView never navigates elsewhere.
- `WorldFiles.ts` keeps an XHR branch for `file:` pages, only for someone opening the built
  `dist/index.html` from disk; the app no longer uses it.

This replaced an interim setup (page at `file:///android_asset/game/index.html`, world files read
with XHR under `allowFileAccessFromFileURLs`), which let file pages read app-private data and
could not serve `fetch`.

**Verified on an emulator** (not yet on a phone). Browser loading is tested (`npm run
test:e2e`, headless Chromium). The CI job `android-smoke` (`.github/workflows/chennai-open-world.yml`,
`scripts/android-smoke.mjs`) installs an x86_64 test APK on an API 34 emulator, opens the game
and fails unless the page on the appassets origin reaches `data-ready="true"` with
`snapshot().chunksLoaded > 0` within 120 s. It passed: CI run 43842951826 on 8009db6, 16 Nov 2026: Android 14 (API 34, x86_64, software GPU) emulator; the page at `https://appassets.androidplatform.net/assets/game/index.html` reached `data-ready="true"` with 9 chunks loaded about 60 s after launch. The patch's Java and the new
Kotlin compiled in the same run. The test APK is built with `-PcowTestHooks=true`,
which turns on WebView debugging (Chrome DevTools, which the smoke script reads) and a
`com.chennaiopenworld.TEST_AUTOPLAY` launch extra that skips the menu; the normal release APK
has neither (`BuildConfig.TEST_HOOKS` is false). Debug builds have WebView debugging on anyway
(react-native-webview enables it).

**Revisit when** react-native-webview gains built-in asset-loader support (drop the patch), or
the patch stops applying after an upgrade.

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

## TD-18: Realistic art direction, modelled on real Chennai streets

**Decision (the user's, 16 Nov 2026).** The game aims for a realistic look, not a stylised or
cartoon one: real proportions and materials, photographic CC0 textures (Poly Haven,
ambientCG), realistic humans (MakeHuman/MPFB base bodies in Blender, Mixamo-compatible rigs),
and the details that make Chennai streets recognisable: petty shops and tea stalls, flower
sellers, kolam at doorways, Tamil signboards, cable tangles, parked two-wheelers, autos and
buses. Reference is real-life Chennai, from knowledge and general observation, but the
content stays original: no real business names, logos or brand liveries, no copied photos
or models, and no real people's likenesses.

**Within the phone budget.** Realism is pursued with materials, proportions and detail
placement first, not with polygon counts: every change is measured against about 230–300
draw calls and 300k triangles in dense T. Nagar, and textures default to 512 px on phones.

**Revisit when** phone profiling shows the budget cannot hold, or the user asks for another style.

## TD-19: Trains are a function of a railway clock; the railway is one small file

**Decision.** The suburban railway is data like the rest of the world: `npm run build:rail`
turns the OSM railway extract into `apps/game/public/world/rail.json` (40 KB, committed, loaded
with the world and through the APK's asset loader, TD-16). A passenger line is one direction of
an OSM route relation (its ways chained in order, its stop positions named after the nearest
station), so each direction runs on its own mapped track. Each line's run (enter at line speed or
leave a terminus, brake to each stop, 30 s there, accelerate away, leave at the far end) is worked
out once as phases of constant acceleration (`RunProfile`); a timetable (headway and offset per
line, estimated) then gives every train's position as a function of one railway clock. Nothing
about a train is simulated or stored: the game asks "which trains are on the line now, and
where", builds instanced models for those within 900 m and kinematic boxes per coach for those
within 400 m, and drops them when they go. Riding a train is just "follow train *k* of line *L*".

**Why.** Trains on a timetable cannot drift, bunch or collide (identical profiles shifted in
time; a unit test checks the spacing over three hours), cost nothing when out of sight, survive
a teleport or a pause unchanged, and a test can move the clock forward (`railAdvance`, tests
only) instead of waiting minutes for a train. A merged railway in the chunk files would have
meant rebuilding the whole world (and the 58 MB extract) for every railway change.

**Estimated, not real:** headways (8 min each way), the motion figures, 4-coach trains, platform
length, height, width and side (island platforms where the two directions' tracks are 6.5–17.5 m
apart with no other track between), the fare (₹5), the train and its livery, and the board design.

**Revisit when** more lines are wanted (the MRTS and Metro need viaducts and tunnels), when
trains should react to the player (they do not brake for anything on the track), or when a
real timetable is used.

## TD-20: Android only; no browser release

**Decision (the user's, 17 Nov 2026).** The game is released only as the Android app. Removed:
the GitHub Pages deploy and the downloadable web build in CI, the keyboard and mouse controls
(`KeyboardInput`), the "run" key in `PlayerController` (running comes from pushing the stick
far), and the desktop "high" quality default (every device gets the phone tier unless `?quality=`
says otherwise).

**What stays, and why.** The APK *is* the web build running in Android's WebView (TD-1), so the
web build, Vite and `npm run dev` remain as the way to build and develop the game. The browser
tests (`npm run test:e2e`) stay too: they drive that same build at phone size with touch input
and are the main automated check, alongside the CI emulator job.

**Revisit when** an iOS or desktop release is wanted.

## TD-21: Police officers are combat enemies; police cars are kinematic chasers on the road graph

**Decision (17 Nov 2026, `agent/police`).** Officers on foot are ordinary `Combat` enemies in
groups named `police:<car>-<n>` (`isPoliceGroup` in `@cow/combat`), not a second kind of fighter.
The player's punches and pistol, being run over, the enemy shooting rules at three stars and up,
health, knock-downs and the figures (`Fighters`, khaki for police) all come for free and stay
identical to the story fights. Below three stars `Police.ts` holds their attack cooldown each
step, so they walk up to make an arrest instead of punching. `Game.fight` keeps the police groups
when it tidies story enemies, and the snapshot's `enemies` lists story enemies only (officers are
under `police`).

Police cars are kinematic, like the AI traffic: `Pursuer` (`@cow/ai`, pure) follows an A* route
on the same drive graph as the traffic, replanned every 1.5 s, and drives straight at the player
once within 35 m with a clear line; the game moves a kinematic box there, which shoves the
player's car when it rams. A physical (Rapier) police car with an AI driver was not chosen: it
would need steering and grip tuning and a vehicle simulation per unit on a phone.

**Rules apart from glue.** What counts as a crime, how stars rise and fall, busted, unit caps and
the theft rule are pure (`packages/combat/src/Wanted.ts`, unit-tested); `apps/game/src/Police.ts`
only connects them to the scene, physics, HUD and sound.

**Revisit when** officers need behaviour of their own (cover, an arrest animation), or when a
weapon inventory replaces `Combat.ammo` (an arrest must then empty it too: see `Game.arrested`).
## TD-22: Weapons are a table plus an arsenal inside `Combat`; gangs are calm enemy groups

**Decision (17 Nov 2026, branch `agent/gangs`).** Every weapon is a row of numbers in
`packages/combat/src/Weapons.ts` (`WEAPONS`: damage, range, fire interval, pellets, spread, aim
assist, damage fall-off, rounds carried, price; all game-design estimates) read by one
`Arsenal` (owned weapons, rounds per gun, the gun in hand, cooldowns) that `Combat` owns.
`Combat.shoot` and `Combat.punch` take their numbers from it. Rival gang members are ordinary
`Enemy` entries with `calm: true` and a `group` of `gang:<gang>:<corner>`: the rules in
`Gangs.ts` decide when a calm group turns (`provoke`) and which crews are on the street
(`crewsToField`). No new enemy system, no new figure type.

**Why.** One code path for all fights keeps stages 7–10 exactly as they were (the pistol row
holds the old constants; `Combat.ammo` is still the pistol's rounds) while new weapons are only
data. Gangs reusing `Enemy` and `Fighters` means the police branch, which reads `Combat`, sees
gang members and stage enemies the same way, and a gang member costs what any enemy figure
costs to draw. `Combat` emits `playerShot {x, z, weapon}` for every shot, for the wanted level.

**Trade-offs.** FIRE always uses the gun in hand and HIT the best melee weapon (the bat once
owned), so there is no holster: a player carrying a loaded gun or the bat counts as armed near
gang corners. The weapon button cycles guns only. The arsenal is saved under its own key
(`cow-weapons-v1`) rather than inside `cow-progress-v1`, so the many `saveProgress` calls and
the tests that seed progress stay unchanged.

**Revisit when** weapons need their own poses (two-handed shotgun) or the police need to tell
gang members from other people.

## TD-23: Stations are built in code into the railway's cell meshes; platform crowds are baked, instanced poses

**Decision (18 Nov 2026, branch `agent/stations`).** Each drawn platform's station (deck,
yellow line and tactile strip, sheet-roof shelter, benches, lamps, bins, tea stall, boards,
foot-over-bridge, booking office) is generated by `StationKit` from a pure layout
(`stationPlatforms` in `@cow/rail`: the FOB spans the main tracks mapped within 32 m and lands
5 m beyond the outermost; the booking office stands at its outer landing; platform numbers and
exits) and merged into the railway cell's existing two meshes (vertex colours, and the board
atlas). Overhead wires and masts are generated the same way along the running lines. The live
parts (departure board screen, clock hands) exist once, at the platform nearest the player
(`StationLife`). People on the platforms are the game's human model baked into seven still
poses (standing and six moments of the walk cycle), simplified at load time with
meshoptimizer's simplifier to about 700 triangles, and drawn as one instanced mesh per pose
(`CrowdFigures`). The crowd itself is pure rules (`StationCrowd`: waiting by time of day,
boarding and alighting with caps), stepped on a render clock that follows the railway clock
between physics steps.

**Why.** A station repeats, but each follows its own curve, platform width and yard, so a fixed
instanced kit would not fit the track. Merging into the cell mesh costs no draw calls (the cell
is already one call) and is freed with the cell. A detailed side-platform station is about
2.9k triangles (unit test). An animated figure costs 8 draw calls and about 15k triangles, so
ten would break the 300k budget; the baked poses cost at most 7 calls in all and about 0.7k
triangles a person.

**Trade-offs.** Waiting people stand still in one pose, and walkers change pose six times a
stride (a flip-book that shows up close). Colours are sampled from the textures once per
vertex, so faces and clothes are flat. The FOB, its stairs and the booking office are scenery,
not solid (the platform ramps are still the way up). The layout is invented, not the real
stations' plans, and the booking office can stand on an OSM building or street in places (it
is not solid, so nothing is blocked). `meshoptimizer` becomes a runtime dependency of
`@cow/player` (it was only a build tool before).

**Revisit when** the FOB should be walkable, real station plans are wanted (OSM
`railway=platform` areas), or the platform crowd should share the city pedestrians' LOD.

## TD-24: People come from a manifest and are cast by role; LOD1 past 30 m

**Decision (22 Nov 2026, branch `agent/people-game`).** Everyone but the player is a person from
`assets/models/people/people.json` (the assets pipeline's manifest: file, LOD1, sex, age, roles,
height). The game only assigns them: pure casting rules in `@cow/player` `people.ts` (`CASTS`,
`castPool`, `pickPerson`) decide who walks, drives, polices, fights, waits on a platform or rides
as a fare; who spawns where and how they move is unchanged. Models are lazy `?inline` imports
(still embedded, TD-3), loaded per person the first time a cast needs them, retargeted once per
skeleton, fitted to their manifest height with the soles on the ground, and given a LOD1 (the
manifest's, or simplified at load time) shown beyond 30 m without shadows. Children and
teenagers are never cast where anything can hit, shoot or hurt them. The retargeted clips lower
the hips so the lower foot keeps its rest height. Tints on manifest people are a dye (brightness
times colour), since their outfits are one coloured atlas. Details and numbers: `docs/characters.md`.

**Why.** Data-driven casting lets the assets branch add people without code changes and keeps
the safety rule (no children in harm's way) in one tested place. Lazy loading keeps start-up to
the people the street needs. MPFB people are 2 draw calls and about 9k triangles against the
placeholder's 8-10 calls and 15k, so both budgets went down (spawn 207 -> 187 calls, 300k ->
258k triangles).

**Trade-offs.** A figure made before its person loaded is a stand-in (enemies are swapped once
the person loads; pedestrians and drivers are loaded before they are made). The script grows by
each person's optimised size (about 150 kB, plus LOD1). Planting the lower foot removes the
running flight phase, and during the 0.22 s blend between two clips (a sudden stop) a sole can
dip up to about 5 cm. The dye colours a whole outfit, trousers and all.

**Revisit when** the cast grows past what fits in the script (stream people as files, TD-16), or
people need per-garment colours (a mask channel in the atlas).

## TD-25: A blow's damage lands at its strike frame; knock-back is a rule; people keep their room

**Decision (23 Nov 2026, branch `agent/combat-pose`).** A punch or bat swing is a wind-up, the
blow and a recovery (`@cow/combat` `Strikes.ts`: punch 0.12 s + 0.26 s, bat 0.22 s + 0.38 s,
inside each weapon's interval). Pressing HIT starts the swing (`SwingClock`); `Combat.punch` is
called when the wind-up ends, so the damage, the sound, the puff and the camera shake come at
the frame the arm is out or the bat is across the front. Enemies do the same: `enemySwing`
starts the figure's wind-up and `enemyPunch` (the damage) follows when it ends, and misses if
the player has stepped more than 0.6 m beyond reach. A hit also pushes the person struck
straight back over 0.22 s (0.4 m for a fist, 0.65 m for the bat, 0.12 m for a bullet), never
into a building, tree or vehicle (`knockBackRoom` asks `CombatWorld.solidDistance`), and they
do nothing else while it lasts. The figures draw it: arm poses solved per skeleton and blended
over the clip, a turn of the upper body, a fist, and a flinch away from the blow
(`packages/player/src/strikePose.ts`, `HumanFigure.strike`/`flinch`). Pedestrians
(`AgentSettings.personalSpace`, 0.3 m) step sideways round the player and round people coming
the other way, and are moved out if they ever stand inside them.

**Why.** The user played on a phone and saw no impact: damage landed on the press while the arm
snapped straight for 0.22 s and nobody reacted. Timing the damage to the drawn strike is what
makes a hit read as one; the knock-back is a position change, so it belongs to the rules, where
walls are known and it can be tested. A pedestrian stood inside the player in the same session:
walkers only stopped for what was ahead of them, so one coming from the side or turning walked
into the player, and people coming the other way walked through each other (TD-15).

**Trade-offs.** The first blow lands 0.12 s (0.22 s with the bat) after the press; the rate of
blows is unchanged (the next may start while the last recovers). A hit enemy loses 0.22 s of
moving; a fist's knock-back takes them just out of a fist's reach, so they step back in. Routes
are unchanged: the sidestep only moves a person sideways and steering brings them back.

**Revisit when** fights need combos or blocks (the swing clock becomes a small state machine), or
a phone test shows the wind-up feels late.
