# Handoff: where work stands and what to pick up next

Several engineers (and AI agents, on different accounts) work on this project at once. Read
this first, then `AGENTS.md`, `docs/architecture.md` and `docs/progress.md`. When you stop,
update this file: what you finished, what you left half-done, and the next step. Newest entry
first.

## Branches

- **`feat/chennai-open-world`** is the integration branch for this game. Feature work happens
  on a branch made from it (`agent/<topic>` or `claude/<name>`) and is merged back into it.
- `master` is the main branch of the whole repository (the Hop apps). The game reaches it only
  when the user decides.
- Before starting: `git fetch origin feat/chennai-open-world` and branch from the latest
  `origin/feat/chennai-open-world`. Before merging back: merge the latest
  `feat/chennai-open-world` into your branch, then run
  `npm run typecheck && npm test && npm run test:e2e`.

---

## 17 Nov 2026 (later): realism brief received, plan written, nothing implemented yet

The user asked for a realistic Tamil Nadu look (buildings, roads, real vehicles, realistic
people, PBR, phone performance) in eight phases. The analysis and phase plan are in
**`docs/realism-plan.md`**. Start there. Before Phase 1 can be done, it needs a real Android
phone. Before Phase 5 (vehicles), the user must decide on real brand names and the MTC livery
(section 5 of that file). Blender 5.2 must be installed on whichever machine builds models.
The "9 fps" the user saw came from headless software-rendered screenshots, not from a phone.

---

## 17 Nov 2026: street props placed (branch `claude/relaxed-wright-3t1vb2`, merged into `feat/chennai-open-world`)

### Done (tested; details and measurements in `progress.md`, "Street props in the streets")
- `packages/game-world/src/props.ts`: pavement props (handcart, crates, barrels, clay pots)
  along main roads, from road id and distance (no world-file change), plus `propSolids`.
  `furniture.ts` now exports `inBuilding`, `onOtherRoad` and `buildingBoxes` for it.
- `packages/game-engine/src/StreetProps.ts`: loads and bakes the optimised Blender models
  (fetch, then `GLTFLoader.parseAsync`, so it also works in Node tests), wall AC units and
  rooftop dishes (`buildingFixtures`), and one merged mesh per chunk for pavement props and
  one for fixtures.
- Wiring: `ChunkView` (optional `assets.props`, new `props` argument), `ChunkManager` passes
  `chunkProps`, `Game.ts` embeds the six models (`?inline`, TD-3) and adds the solids.
- Tests: `props.test.ts` (game-world), `StreetProps.test.ts` (game-engine),
  `apps/game/src/props.test.ts` (real city). `npm test`: 180/180; browser tests 38/38
  (`cd apps/game && PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test --trace off`;
  note `npm run test:e2e -- --trace off` passes "off" as a test filter through the nested npm
  scripts). Not run on the emulator or a phone.
- Cost at Anna Nagar spawn: +10 draw calls and +38k triangles (248k in all; budget 300k).

### Not done, in order of value
1. **Shop awnings and the shutter clip:** the awning model belongs over shop fronts, which are
   decided in `FacadeKit.ts` (`planFacade`, `shopsOnWall`). Place awnings there, not in game-world.
2. **Handcart `Roll` clip:** a vendor pushing a cart along the pavement would use it. Needs a
   skinned or per-object animated mesh, so not the merged one.
3. **Phone check:** draw calls and triangles were measured in headless Chromium only.
4. To make a prop group rarer or denser: `PROP_CHANCE` and `GROUPS` in `props.ts`. Keep
   `apps/game/src/props.test.ts` under 40k triangles per 3 × 3 chunks.

### Requests from the user, not started yet

**A. Realistic vehicles (auto, cars, buses, trucks, bicycles, two-wheelers).** Today's vehicles
are procedural extrusions in `packages/vehicles/src/models.ts`, so they look like cartoons. It
can be done, within TD-18 (realistic look, original designs, no brands or liveries) and the
phone budget. Plan:
1. Models: Blender scripts like `tools/blender/street_props.py` (the script is the source),
   one per vehicle type, modelled on common real Indian types but with no brand marks: a
   three-wheeler auto, a small hatchback, a sedan, an MTC-style city bus without the real
   livery, a light goods truck, a bicycle, a scooter and a commuter motorbike. Realistic
   proportions, separate wheel nodes (the physics spins and steers them), glass, a 512 px
   texture each, under about 3–5k triangles. Run `npm run optimize:assets`, and record the
   licences in `assets/README.md`.
2. Loader: replace `models.ts` per kind with the glTF models, keeping the `VehicleModel`
   interface (`object`, `wheels`, `beacons`) so `Vehicle` and `TrafficCar` don't change.
   Instance the traffic copies.
3. Driving feel (`specs.ts`, `packages/physics`): realistic mass, gear ratios with an engine
   that uses them (today the gear display only shows a number, the engine has no gearbox),
   less grip for autos and two-wheelers, and a lean for two-wheelers. TD-8 (no roll or pitch)
   then needs revisiting for two-wheelers only.
4. New kinds in traffic (`packages/ai/src/presets.ts`): trucks, bicycles, scooters.
   Measure draw calls and triangles before and after, as for the props.

**B. Show the route on the map.** The minimap (`packages/ui/src/Minimap.ts`) draws only
markers: the objective is a dot pinned to the rim, and there is no path to it. Plan:
1. Routing in `packages/ai` (or `game-world`): A* over a light road graph of the whole city
   (`buildRoadGraph` with one-way streets respected when driving and ignored on foot). The AI
   graphs cover only 2.4 km round the player (TD-17), so routing needs its own city-wide graph
   with nodes and edges only (no spawn weights). Measure the heap.
2. `Minimap`: draw the route as a thick line under the markers, in the tiles' rotating view,
   and re-plan when the player leaves it by about 25 m or the objective moves.
3. Optional: arrows on the road ahead (instanced decals) and a "turn left in 120 m" hint in
   the HUD.
4. Tests: unit tests for A* (one-way streets, unreachable targets) and a browser test that a
   job's route starts at the player and ends at the objective.

### Chennai vehicle reference for A (web research, 17 Nov 2026; check before modelling)
Use these as generic types only. No makes, logos or real liveries (TD-18, AGENTS.md).
- **Mix:** two-wheelers dominate. In Chennai, about 36 lakh of 49 lakh vehicles are two-wheelers
  and about 13 lakh are four-wheelers (DT Next, undated). Across Tamil Nadu, two-wheelers and cars
  together are about 94 % of 4 crore vehicles (DT Next, 2026). Traffic should be mostly scooters and
  commuter motorbikes, then small hatchbacks and sedans, then autos, buses and goods vehicles.
- **Autos:** over one lakh autos operate in the city. Most are yellow with a black canopy.
  Battery autos must be bottle green with a 15 cm highway-yellow band round the middle of the
  body (TN Motor Vehicles Rules amendment, Dec 2021), but they are still rare. "Pink autos"
  driven by women serve railway stations and bus stands.
- **Buses (MTC):** low-floor electric buses are being added (625 in phase 1, 225 of them with AC;
  750 more planned), alongside older diesel high-floor buses, plus 5 m and 7 m AC feeder minibuses
  for the Metro. Model a high-floor diesel bus, a 12 m low-floor e-bus and a small feeder bus, each
  with an invented livery (no MTC logo).
- **Still to research:** goods vehicles (small three-wheeler and four-wheeler loaders, tempos,
  water tankers), cycles, delivery scooters with top boxes, and taxi plate colours (Indian
  commercial plates are yellow with black text, private plates white with black text; plates show
  no real numbers).

Sources: dtnext.in "TN's vehicle count crosses 4 crore" and "Chennai's vehicle population rivals
Tamil Nadu's count in 2000"; dtnext.in "Green autos, red signal"; stationeryprinting.tn.gov.in
gazette 2021/48 III 1a; dtnext.in MTC e-bus reports; sustainable-bus.com (Chennai MTC e-buses).

## Decision pending: mobile only (user, 17 Nov 2026)
The user wants to support the Android app only, not the browser. Note that the Android app
**is** the web build running in a WebView (TD-1). So "no browser support" can only mean:
dropping the public GitHub Pages deploy and the desktop keyboard and mouse controls as player
features. It cannot mean removing the web build: the APK is made from it, and the browser tests
(`npm run test:e2e`, touch input at phone size) are the main automated check. Nothing has been
removed yet. Confirm with the user which of these to drop: (1) the Pages deploy job in
`.github/workflows/chennai-open-world.yml`, (2) `apps/game/src/KeyboardInput.ts` and the README's
desktop instructions.

## 17 Nov 2026 (later): vehicle prototype 1 for review
- `prototypes/auto-rickshaw.html`: a page-only three.js prototype (not part of the game build)
  of an original Chennai auto-rickshaw: real proportions (2.63 × 1.30 × 1.71 m, 2.00 m
  wheelbase), clearcoat paint, chrome, glass, fabric canopy, tyres; petrol yellow, battery
  green with the 15 cm yellow band, and pink liveries; noon haze and golden hour. About
  19k triangles and 178 meshes as built, so the game version needs merging by material and a
  low-detail version for traffic. Published for the user's review as a private artifact. Wait
  for their feedback before building vehicles in Blender.
- **Blender MCP:** the user pointed out that Blender can be driven over MCP (a Blender add-on
  plus an MCP server, so an agent can inspect scenes and run Python in Blender). That needs
  Blender running on a machine the agent can reach: the user's own computer (a local Claude
  Code session, or a cloud session connected to that computer) or a build host with Blender
  installed. This cloud container has no Blender. The repository's pipeline stays
  script-first either way: whatever is built through MCP should end up as a
  `tools/blender/*.py` script, so the models can be rebuilt without the agent.

## 17 Nov 2026 (latest): realistic auto in the game; open requests

- **Done:** `packages/vehicles/src/autoModel.ts` (+ `autoModel.test.ts`), wired in `models.ts`.
  Unit tests 184/184; screenshot at the spawn parking spot; measured in `progress.md`.
  Browser tests 38/38 on this change (7.1 min, headless Chromium).
- **User asked: "use the real auto, like other games do".** Other games either license real
  vehicles from the makers (racing games), or make look-alikes with invented brands (most open-world
  games), or use bought/CC-BY 3D models by professional artists. The look the user wants comes
  from modelling quality (an artist in Blender, textures, many hours per vehicle), which
  code-built geometry cannot match. Options to put to the user: (a) download legally usable
  models (Sketchfab CC-BY or CC0, CGTrader or TurboSquid with a game licence) of a generic
  Indian auto, bus, scooter and motorbike, with logos removed and the author credited in
  `assets/README.md`; (b) commission or build them in Blender (Blender MCP on the user's
  computer); (c) license real brands. The loader is ready for (a) and (b): any GLB with wheels as
  separate nodes can replace `buildAutoParts` the way `StreetProps.ts` loads props.
- **User asked for realistic Chennai roads.** OpenStreetMap is a crowd-mapped snapshot (our extract
  is from 15 Nov 2026), not real-time, and it does not map road condition: in the Anna Nagar
  extract only 10 of 136 road pieces have `lanes` and 20 have `surface`; none have
  `smoothness`, `traffic_calming` (speed breakers) or `sidewalk`. So road wear has to be invented
  by rule, and described as estimated (AGENTS.md). Proposed for realism-plan Phase 2: worn,
  patched asphalt textures by road class; broken and dusty edges where there is no kerb; potholes
  and patches on residential and service roads (by road id, more after rain); speed breakers
  painted black and yellow near schools, temples and junctions; faded or missing lane paint on
  minor roads; concrete medians with gaps on main roads; open storm-water drains with slab
  covers along the kerb; lane counts from OSM `lanes` where tagged, from road width otherwise.
  Research the real look (Chennai Corporation road standards, IRC codes for markings and speed
  breakers, street photos) before modelling.

### User feedback, 17 Nov 2026 (latest): not started
- **The user does not like the code-built auto** (prototype and in game) and wants vehicles
  that look like the real ones, as in other games: auto, bus, truck, motorbike. Code-built
  geometry will not get there. Next step: get artist-quality models, either downloaded with a
  game-usable licence (Sketchfab CC-BY/CC0, CGTrader, TurboSquid; needs the user's account or
  files, since this container cannot sign in) or built in Blender by a person, or through Blender
  MCP on the user's computer. Then publish a review page of the downloaded models
  (three.js GLTF viewer, side by side, triangle counts) before putting any in the game.
- **Drivers and riders, men and women, in Tamil Nadu dress** for every moving vehicle: possible.
  It needs realistic rigged humans (MakeHuman/MPFB CC0 bodies in Blender, or licensed scanned
  people), clothing variants (shirt and veshti or trousers, lungi, saree, salwar, helmets on
  two-wheeler riders), and seated and riding poses. Cost: a skinned person per moving vehicle
  is expensive on phones. Plan: full people near the player, static posed meshes merged into
  the vehicle for traffic further away. `specs.ts` already has a `seat` position per vehicle.

## 17 Nov 2026 (latest): auto-rickshaw modelled in Blender, awaiting review
- The user rejected the code-built auto. They chose our own model, made realistic in Blender,
  over downloading one (they declined to give a Sketchfab token; scraping the viewer was refused
  because it breaks Sketchfab's terms).
- `tools/blender/auto_rickshaw.py` (`npm run blender:auto`): a subdivided body shell lofted
  through cross-sections at real dimensions, with the cabin, sides and wheel arches cut out by
  booleans. Lamps, plates and mirrors are placed by ray casting on the body. The canopy has hoops
  and a rear window. Outputs `assets/models/vehicles/auto_rickshaw.glb` (16,382 triangles) and
  `_lod1.glb` (12,306), with wheels as separate nodes (`wheel_front`, `wheel_rear_left`,
  `wheel_rear_right`) on the game's axle positions (front 1.0 m, rear 0.8 m, track 1.16 m).
  `--render <dir>` writes three Cycles review renders (about 1 minute on 4 CPUs).
- **Blender without installing Blender:** `python3.13 -m venv .bvenv && .bvenv/bin/pip install bpy==5.2.4`,
  then `.bvenv/bin/python tools/blender/auto_rickshaw.py -- <out> [--render <dir>]`. In the `bpy`
  module, `import bpy` must come before `bmesh`. `transform_apply` applies location too unless
  told not to.
- Review page published to the user (private artifact: renders and the GLB in 3D). **Not in the
  game yet.** After approval: lighten the LOD (under 5k triangles, fewer materials), add
  canopy fabric and dust textures (bake in Cycles), load it in `packages/vehicles` instead of
  `autoModel.ts` (wheel nodes by name; `KHR_materials_clearcoat` and transmission are costly on
  phones, so use MeshStandard in the game), then run the tests and measure as for the props.

## 17 Nov 2026 (latest): Blender auto in the game, drivers in all traffic
- Done and tested (unit 188/188, browser 38/38); details in `progress.md`. Assets: `npm run optimize:assets`
  now also handles `assets/models/vehicles`.
- Two lessons for loading optimised GLBs: convert quantised attributes to floats **before**
  applying a matrix (in-place transforms clamp to [-1, 1]); and mesh names inside wheel nodes
  repeat, so match wheel nodes by exact name.
- Next, requested by the user and started in parallel by separate agents: **Share auto** (a
  route job: picking up and dropping passengers anywhere along a fixed route, like the bus) and
  **pedestrians hurt when hit** (knocked down, injured or killed, with consequences).

## In progress (17 Nov 2026), four parallel agent branches, to be merged into `feat/chennai-open-world`
1. **Share auto job:** an auto runs a route; passengers wave it down and get off anywhere along it.
2. **Pedestrians hurt when hit:** knocked down, injured or killed by impact speed; fine,
   reputation, bystanders react, traffic avoids people lying on the road. Non-graphic.
3. **Places and activities:** home, hospital, gym, mall and cinema (invented films), with
   light activities and 2–3 short story missions.
4. **Suburban railway:** real OSM tracks and stations (Central, Egmore … St Thomas Mount),
   timetabled EMU trains, board and ride. Tambaram is beyond the map's southern edge, so lines
   to it end at the map edge. The environment now allows the OSM hosts (Overpass,
   download.openstreetmap.fr) for this.
Avoid these areas until they are merged, or coordinate first.

## Suburban railway (branch `agent/railway`): where I left off, WIP, stopped on the user's instruction

*Superseded by the next entry (the railway is now built); kept for the data notes.*

**Done:** only the data fetch. Nothing in the game changed, and no game code was written.
- `scripts/fetch-rail.mjs`: Overpass query for the railway in the map's box plus about 500 m
  (rail and light-rail ways, stations and halts, platforms, level crossings, and the route
  relations that use those ways). It tries overpass-api.de, then overpass.kumi.systems.
- `assets/osm/rail/chennai-rail.osm.json` (438 KB, committed): 4,379 nodes, 451 ways and 17
  relations, OSM data 2026-07-15 (kumi mirror). Attribution in `assets/osm/README.md`. This file
  has the relations' **tags only**. The script was then changed to `out body` (with members),
  but that re-fetch was stopped before it finished. Run it again first (see the proxy note in the README).

**Tested:** nothing beyond reading the extract with a throwaway Python script. Typecheck, unit
and browser tests were not run on this branch (no code changed).

**What the extract shows (for the builder):**
- Suburban stations on the map, in local metres (x, z): Central (7141, 285), Park (6830, 470),
  Park Town (7177, 599), Egmore (5547, 802), Chetpet (3505, 1178), Nungambakkam (2466, 2118),
  Kodambakkam (2232, 3686), Mambalam (1917, 5190), Saidapet (1477, 6821), Guindy (272, 8440),
  St Thomas Mount (-1163, 9978). Most have `name:ta`. Chennai Beach is just off the east edge
  (x ≈ 8960), so the Beach–Tambaram line leaves the map at **both** ends. Chennai Fort is not
  tagged as a station in this extract.
- Route relations: 1289050 "Chennai Beach - Tambaram suburban line" (Beach → Tambaram) and
  20986091 (Tambaram → Beach), one per direction, so each direction can follow its own track.
  1289122 is "Chennai Central - Thiruvallur suburban line", and 1289118 is an unnamed train route.
  The Central lines leave the map northwards soon after Central, with no other station on the map.
- The MRTS (60 ways named "MRTS", Chintadripet to Kasturiba Nagar) is mostly `bridge=yes`
  with layer 1 or 2, so it is elevated. Metro stations are `station=subway` (underground or
  elevated). Leave both out at first: drawing them at ground level would be wrong.
- The only level crossings in the box are 13 private ones inside the metro depot. The suburban
  line has **no level crossings on the map**, so crossings and barriers are not needed (roads
  cross it on bridges or in subways, which the user said need not be modelled).

**Plan for the next engineer (the brief is the task message for this branch):**
1. Re-run the fetch for relation members. Write a new pure package `packages/rail` (`@cow/rail`,
   imports `map-data` only; add it to `apps/game/package.json` and run `npm install` so the
   lockfile updates). It needs: a polyline with arc length, `at(s)` and projection; a builder
   that chains each direction relation's way members into one line, clipped a little beyond the
   bounds, with stations snapped to it (`s` along the line), and with which end leaves the map and
   where it goes (Tambaram south, Chennai Beach north-east); a motion profile (accelerate about
   0.8 m/s², brake about 0.9 m/s², about 22 m/s top, 30 s stops; trains enter at speed from
   beyond the map); a timetable (headway about 6 min per direction, train positions derived from
   one railway clock); and boarding rules (at a stopped train's station, flat fare about ₹5,
   estimated; the ride ends at the last station on the map with "The line continues to
   Tambaram beyond the map").
2. `scripts/build-rail.ts` → `apps/game/public/world/rail.json` (small, committed), loaded by
   a new `loadRail()` in `WorldFiles.ts` (additive).
3. Rendering in `packages/game-engine` (new files): track stretches merged per about 250 m
   (ballast, sleepers, rails in one mesh with vertex colours), platforms (solid, about 0.9 m
   high, with steps at the ends because the character autosteps only 0.35 m), and English and
   Tamil name boards. The Tamil glyphs need a **new** font subset file (do not re-cut the shop-sign
   font that other branches use). Trains are kinematic boxes per coach (`createKinematicBox`).
4. `apps/game/src/Railway.ts` owns the wiring. Keep `Game.ts` edits to a few lines: create,
   `fixedUpdate`, `frame`, the action button (BOARD / STEP OFF), `where()` while riding,
   `snapshot().rail`, and minimap markers. Add a test hook to move the railway clock forward.
5. Tests as listed in the brief: unit tests for the builder, motion and boarding, a browser
   test that boards and rides one stop, and draw calls and triangles before and after at Egmore
   and at the Anna Nagar spawn.

## 17 Nov 2026: suburban railway built (branch `agent/railway`), ready to merge

### Done (tested; details and measurements in `progress.md`, "Suburban railway")
- Data: `scripts/clip-rail.py` cuts the railway from the openstreetmap.fr Tamil Nadu PBF (same
  15 Nov extract as the city; Overpass was unreliable, `scripts/fetch-rail.mjs` kept as the
  other way), `assets/osm/rail/chennai-rail.osm.json` (466 KB), `npm run build:rail` →
  `apps/game/public/world/rail.json` (40 KB). How to rebuild: `assets/osm/README.md`.
- `packages/rail` (new, pure): types, `RailPath`, `buildRail` (route relations chained per
  direction, stops at the relation's stop positions, platform sides and islands, beyond-map ends),
  `RunProfile`, `RailLine`/`RailNetwork` timetable, `boarding`/`canStepOff`/`rideEndsAt` (TD-19).
- `packages/game-engine`: `RailView.ts` (tracks, platforms, boards in 250 m cells near the
  player), `TrainView.ts` (code-built EMU coaches, instanced). `packages/ui`: `RidePanel.ts`,
  `Minimap.addLines` (additive), `TouchControls.setAction` aria labels for BOARD and STEP OFF.
- `apps/game/src/Railway.ts` does the wiring; `Game.ts` has small additive hooks (create, action,
  `where()` while riding, ride camera, frame, minimap stations, `snapshot().rail`, teleport ends a
  ride); `WorldFiles.loadRail`; `main.ts` test hook `railAdvance(seconds)`.
- `apps/game/playwright.config.ts`: optional `PW_PORT`. **Why:** several checkouts on one machine;
  without it, `reuseExistingServer` silently tests whichever build holds port 4173.
- Tests: unit 218/218 (`npm test`), `railway.spec.ts` 3/3 (`PW_PORT=4294`). Full browser suite
  not run here (coordinator's instruction, to save CPU); run it after merging.

### Not done / known limits
1. **Level crossings and barriers:** none needed by the data (none on the suburban line in the
   map). Roads that cross on bridges or in subways are drawn at grade, so trains pass over them
   and AI traffic does not stop. Bridges would fix it (not requested).
2. **Trains do not react** to anything on the track (the player's car is pushed aside; a player
   on foot on the track is not hit). Coaches are kinematic boxes.
3. Only Beach–Tambaram. The Central lines (to Arakkonam/Tiruvallur and Gummidipoondi) leave the
   map soon after Central with no other stop on it; the MRTS (viaduct) and Metro need elevated
   or underground track.
4. The train is built in code, not in Blender. A Blender script like `tools/blender/auto_rickshaw.py`
   would look better; `TrainView` only needs a coach geometry (cab and trailer) facing -Z.
5. Not checked on the emulator or a phone (the APK serves `world/rail.json` like the chunk files;
   if the read fails the game starts without the railway).
