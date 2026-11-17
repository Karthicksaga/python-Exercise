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

## 17 Nov 2026 (evening): three more agent branches, realism phases 2 and 6; test timing fixes

Started in this session (TD-18, realistic look), each pushing to its own branch as it goes and
merged into `feat/chennai-open-world` only after its tests pass:
1. **`agent/materials`** — realism-plan Phase 2: CC0 photographic textures (Poly Haven,
   ambientCG) for roads, pavers, plaster, earth, Marina sand and roof tiles, measured.
2. **`agent/street-life`** — kolam at doorways (fades through the day), awnings over shop
   fronts and the `ShutterOpen` shutters following the hour (via `FacadeKit`), new realistic
   Blender props (tea stall, flower stall, pushcart, plastic chairs, parked two-wheeler) and
   overhead cables; reuses `props.ts` / `StreetProps.ts`, no second prop system.
3. **`agent/characters`** — realism-plan Phase 6 start: realistic Chennai men built with MPFB
   (MakeHuman CC0 assets) in Blender, replacing the placeholder player model, plus pedestrian
   variants; must keep the seated drivers working. Sarees need proper cloth modelling (later).
Avoid these areas until merged, or coordinate first. If this session stops, continue from those
branches: read the newest handoff entry on each, run the checks, merge one at a time.

Also on `feat/chennai-open-world`: browser tests that wait on something the game does in its own
time (a stop's dwell, a fight, a reward, the knock-out) now poll game state with `GAME_WAIT` or
longer limits instead of short wall-clock waits; this fixes the `test` failures seen on CI for
49e9ff2 and 4a6b2c2 (slow runner, not a game bug). Rule: AGENTS.md "Testing notes".

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

## Decided: Android only (user, 17 Nov 2026), TD-20
Done on `feat/chennai-open-world`: the Pages deploy and web-build artifact are gone from CI,
`KeyboardInput.ts` and the desktop instructions are removed, and every device defaults to the
phone quality tier. The web build and the browser tests stay (the APK runs the web build).

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

**Where their work is saved:** each agent commits and pushes as it goes to its own branch:
`agent/share-auto`, `agent/pedestrian-hits`, `agent/places-activities`, `agent/railway`.
A fifth branch, `agent/controls-poses`, fixes the user's phone-test reports: riders don't grip the
handlebar or steering wheel, and new P / R / D gear buttons beside GAS and BRAKE.
Some agent commits could not be pushed (the permission system refused the agents' pushes). If a
branch on GitHub is behind, the newest work is in the agent's worktree under
`.claude/worktrees/` on the machine that ran this session.
**Backups of unfinished work:** `agent/<topic>-snapshot` branches (pedestrian-hits, controls-poses,
railway, …) hold the agents' worktrees as they were at the last check-in, including uncommitted
files, as one commit on top of the agent's last commit. They are force-updated at each check-in.
If an agent branch is behind its snapshot, start from the snapshot.
If this session stops, continue from those branches. Read the newest entry at the end of this
file on each branch (its "where I left off"), run `npm run typecheck && npm test` and the
browser tests, then merge into `feat/chennai-open-world` one at a time.

## 17 Nov 2026: all agents stopped by the user; state of each branch
Every agent's work is committed and pushed. None is merged into `feat/chennai-open-world` yet.
| Branch | Head | State |
|---|---|---|
| `agent/places-activities` | 2768287 | Ready: typecheck, unit 219/219, own browser spec 6/6. Risk: `jobs.spec.ts` (ambulance run, Marina drive) failed in a loaded shared-port run; check it first |
| `agent/railway` | 1b036f9 | Ready: typecheck, unit 218/218, own browser spec 3/3; +5 draw calls, +23k triangles beside Egmore |
| `agent/share-auto` | ae9a205 | Unfinished: rules and own spec passed earlier; kerb passengers were not showing; full suite not passed |
| `agent/pedestrian-hits` | 45c680f | Unfinished (WIP): injured case passed; the killed-case browser test had not passed |
| `agent/controls-poses` | fa15c1f | Unfinished (WIP): riding poses and P/R/D gear buttons in progress; edits to `handling.spec.ts` and `jobs.spec.ts` uncommitted until the stop, unverified |
Each branch's own `docs/handoff.md` has the agent's "where I left off" notes. The `*-snapshot` branches are older backups; the branches above supersede them.

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

## 17 Nov 2026 (latest): places, everyday activities and short stories (branch `agent/places-activities`)
- **Done:** home, hospital, gym, mall and cinema with ENTER at their entrances, activities that
  cost money and game time, fitness that raises sprint speed a little, clothes, three short
  stories. Details and tests in `progress.md` ("Places, everyday activities and short stories").
- **Where things are:** rules `packages/missions/src/life.ts`, `stories.ts`; screen
  `packages/ui/src/PlaceScreen.ts`, `placeIcons.ts`; markers `packages/game-engine/src/PlaceMarkers.ts`;
  placement and stories `apps/game/src/places.ts`; glue `apps/game/src/PlaceDesk.ts`. Shared
  files were touched additively only: `Game.ts` (desk, markers, snapshot fields, merging save),
  `main.ts` (`__cow.setHealth`, tests only), `TouchControls.setAction` (optional spoken name),
  `Minimap` (optional `icon` on markers), `PlayerController.runScale`, `HumanFigure.setClothes`,
  and the `index.ts` export lists.
- **Merge note:** the share-auto and pedestrian branches also edit `Game.ts` and
  `packages/missions`; this branch does not edit `content.ts`, `cityJobs.ts`, `JobDesk.ts`,
  `jobs.ts`, `Population.ts` or `packages/combat`.
- **Test status:** typecheck clean, unit 219/219, `places.spec.ts` 6/6 on its own port
  (`PW_PORT=4293`, new in `playwright.config.ts`). The full browser suite has not passed on
  this branch yet: one loaded run was 42/44 and reruns of `jobs.spec.ts` failed the two jobs
  whose first stop needs a wait. Those runs shared port 4173 with other agents'
  `reuseExistingServer` servers, so they may not have tested this build. First step for whoever
  picks this up: `PW_PORT=4294 npx playwright test tests/jobs.spec.ts` on a quiet machine. If
  it still fails, look at `Game.fixedUpdate` (the `placeDesk.fixedUpdate` call and the
  story check before `missions.update`).
- **Not done / next:** play it on the emulator and a phone (the place screen's layout at small
  heights, the TAP timing by touch); sounds don't play inside places because holding the game
  suspends audio; a browser test for the gym bet and first-show stories; the knock-out bill could
  send the player to the hospital place instead of the start.

## 17 Nov 2026 (latest): Share auto job done
- Built and tested; details in `progress.md` (first entry). Unit 202/202, browser PENDING_BROWSER.
- The "kerb figures don't render" note from the WIP stop was wrong: they render; in that
  screenshot they were under the HUD toast. `snapshot().shareFigures` now counts the figures
  drawn and the browser test checks them.
- Browser tests take `PW_PORT` (`apps/game/playwright.config.ts`) so two checkouts can run them at
  once; another agent's preview server held 4173.
- Not done: a full shift driven with the controls, the emulator, a phone. The seat positions in
  the auto (`SEATS` in `ShareRiders.ts`) were only looked at from 7–10 m at lite quality.
- Ideas: show the destination as a street name in the "Passenger in" toast; a few people waving
  in groups of two; the opposite direction as a second route.

## 17 Nov 2026: pedestrians hurt when hit (WIP, where I left off)
- **Built:** rules in `packages/combat/src/PedestrianHits.ts` (`PEDESTRIAN_HIT`: thresholds 2 / 4.5 / 12.5 m/s
  for stumble / injured / killed, game-design estimates; fines ₹0 / 1,500 / 5,000; reputation 0 / 8 / 20;
  throw distance, speed kept by momentum, `vehicleTouches` box test with a one-step lead, `Casualties`
  timers: injured lie 5 s then limp at 0.6 m/s for 30 s, the dead stay 25 s then are removed once the
  player is 35 m away or after 90 s). `AgentSystem` (`packages/ai`) gained `hold`, `letGo` (optionally
  respawning), `moveAgent`, `slow`, `scare` (people walking towards a hit stop and step back 1.2 m, others
  run at 3.8 m/s for 6 s). `Population` detects hits by position and speed before the physics step,
  removes a lying person's collision box, throws them (ray-checked against walls) and tells traffic about
  them as a 1 m obstacle. `Game` slows the car (`Vehicle.knock`, not counted as a crash), plays the crash
  thud, fines (`missions.charge`), takes reputation (`JobRunner.loseReputation`), saves and shows the
  toast. Test hooks: `__cow.stagePedestrian(x, z, heading)`, snapshot `casualties` and `lastPedestrianHit`.
- **Tested:** `npm run typecheck` clean; unit tests 205/205 (new: `PedestrianHits.test.ts`,
  `ai/Reactions.test.ts`, `missions/reputation.test.ts`). Browser test `apps/game/tests/pedestrians.spec.ts`:
  the **injured** case passed once. The **killed** case failed: the old single-ray `lineUp` picked a line
  with a solid (probably a pole) inside the car's width, so the car crashed and was deflected past the
  person. I changed the test's `lineUp` to three parallel rays, but **that rerun was stopped before it
  finished**.
- **Not done:** the rerun of `pedestrians.spec.ts`; the full Playwright run (38 existing + 2 new);
  the `docs/progress.md` update (the "pedestrians can't be hurt" known issue is still listed). Not pushed:
  the session's permission system refused the push to `agent/pedestrian-hits`.
- **Next step:** `cd apps/game && PW_CHROMIUM=/opt/pw-browsers/chromium npx playwright test tests/pedestrians.spec.ts --trace off`;
  if the killed case passes, run the full suite, then update `progress.md` (what was built and how it was
  tested; remove the known issue).

## 17 Nov 2026 (later): pedestrians hurt when hit, finished
- Picks up the WIP entry above. Done and tested; details and test list in `progress.md`.
- The killed case failed only because the test's `lineUp` probed one ray down the middle; it now probes
  three rays across the vehicle's width (a pole inside the car's width deflected it).
- Hardening for normal play: if a person's collision box stops the vehicle in the physics step before
  the game sees the hit, the hit uses the speed it came in at (`Vehicle.approachVelocity`). New browser
  tests: auto and bike hitting people off-centre at an angle, and a hit with the CPU slowed six times
  (about 17 fps). The hit check runs every fixed 1/60 s step, so it does not depend on frame rate.
- `apps/game/playwright.config.ts` reads `PW_PORT` (default 4173) so several checkouts can run tests at once.
- Results: typecheck clean, unit 205/205, `pedestrians.spec.ts` 4/4. A full browser run under five
  parallel suites on 4 CPUs had wall-clock poll timeouts in three older tests (see the report); they
  were rerun on their own.
- Not tested on a phone. Next: try it on the phone build the user reported from ("hitting NPC does not work
  properly" was before this feature).

## 17 Nov 2026: riding poses and P / R / D gears (branch `agent/controls-poses`)
- **Done and tested** (details and tests in `progress.md`): a riding pose per vehicle kind solved
  with two-bone IK (`packages/player/src/ridingPose.ts`, data in `VehicleType.pose` and
  `VehicleType.driver`, now the hip point for every kind; `seat` was removed and `openSeat` says
  whether the rider is drawn), used by the player and AI drivers; the motorbike's forks fixed;
  a P / R / D selector with the rules in `packages/vehicles/src/Gearbox.ts`.
- **Behaviour change:** holding BRAKE no longer reverses on the touch controls; select R. The
  keyboard's W/S still drive and reverse by themselves.
- **For merging:** shared files touched: `Game.ts` (gearbox wiring, seated pose), `Vehicle.ts`
  (`riderPose` uses `driver`), `TrafficCar.ts`, `Population.ts` (one line: `seatedStatic` takes
  the pose), `TouchControls.ts` (selector), `KeyboardInput.ts`, `specs.ts`, `models.ts` (bike).
  `HumanFigure.setSeated` now takes a pose or null instead of a boolean. A seated figure's root
  is its hip joints, not its feet: code that seats people (Share auto passengers) should give
  a hip point and a `RidingPose`. `playwright.config.ts` takes `PW_PORT` (default 4173).
- **Not done:** no steering animation (the bars and wheel don't turn the hands); passengers
  have no pose of their own; closed vehicles have no modelled steering wheel (the driver is
  hidden there). Seen in the screenshots, not fixed: the HORN button sits under the minimap's
  lower edge while driving (it was there before this change).
- **Not tested on a phone.** Check the selector's reach and the poses on a real device.

## 17 Nov 2026: all five agent branches merged into `feat/chennai-open-world` (browser tests NOT run)
Merged on the user's instruction, in this order, with typecheck, unit tests and build after each
(final: typecheck clean, unit **305/305**, build OK): `agent/railway`, `agent/places-activities`,
`agent/share-auto`, `agent/pedestrian-hits`, `agent/controls-poses`. **The browser suite was not
run on the merged code** (the user chose to skip it); other agents are expected to fix what breaks.

Conflict resolutions to check (all are in the merge commits' messages):
- Context button: the train's BOARD / STEP OFF first, then a vehicle's ENTER, then a place's "Go inside".
- Driving input now goes through the Gearbox (P / R / D) from `agent/controls-poses`; the
  railway's "not while riding" branch is kept. Existing driving and job tests were edited on that
  branch and never verified.
- `ShareRiders.ts`: seated figures are now placed by their hips with a pose; share-auto passengers
  got an estimated `PASSENGER` pose and hip-height seats. Not checked by eye.

Run first: `PW_CHROMIUM=/opt/pw-browsers/chromium npm run test:e2e` from `chennai-open-world/` (it
waits for any other run on the machine and picks a free port; see AGENTS.md). Known risks: `jobs.spec.ts` (ambulance run, Marina drive),
`pedestrians.spec.ts` killed case, `shareAuto.spec.ts` kerb passengers, `handling.spec.ts`.

## 17 Nov 2026: stabilise merge (branch `agent/stabilise-merge`): where I left off
- **Done:** the five merged features plus Android only (TD-20) pass the full browser suite run alone:
  55/55 on the first run, no test changed to pass. Then HORN / SIREN moved out from under the
  minimap (it was unreachable while driving) with a new layout test that fails on the old CSS; the
  final run is 56/56 (16.6 min). Unit 303/303 (four keyboard Gearbox tests removed with the keyboard,
  two grip tests added), typecheck clean.
- **Checked by eye** (screenshots, not committed): bike, auto and share-auto poses and seats, the
  P / R / D column at 915×412; details in `progress.md`. The kerb passengers and the pedestrian
  killed case pass in the suite.
- **Cost at `?quality=lite`** (production build, software GPU): spawn 207 draw calls / 300k
  triangles, T. Nagar 158 / 271k, Anna Salai 154 / 230k, Egmore 164 / 216k. Spawn is at the
  300k triangle budget: profile which meshes grew since 16 Nov (165k) before adding more there.
- **Fixed after a screenshot from the user:** the hands sat open and flat on the auto's handlebar; the
  solver now closes the fingers round the grip (`RidingPose.grip`).
- **Not done:** steering animation (hands do not turn the bars or wheel); no modelled steering
  wheel, so car and bus drivers stay hidden; nothing tried on a real phone.
- **Next:** asked by the user: an animated get-in / get-out (doors opening and closing on the car,
  bus and train) and more missions with police, gangsters and more weapons. Then profile
  triangles at spawn; play on a phone (selector reach, poses, frame rate).

## 17 Nov 2026: weapons, rival gangs, stages 11–15 (branch `agent/gangs`): where I left off
- **Done and tested** (details in `progress.md`, decision TD-21): weapon table and arsenal
  (fists, cricket bat, pistol, shotgun, SMG) in `packages/combat/src/Weapons.ts`; gang hostility
  and crew fielding in `Gangs.ts`; pickups in `Pickups.ts`; held weapon meshes in
  `packages/player/src/weaponModels.ts`; the weapon button; three invented gangs and stages 11–15
  in `apps/game/src/streetWar.ts`; game wiring in `apps/game/src/Arms.ts`.
- **For the police branch:** `Combat` emits `{ type: "playerShot", x, z, weapon }` on every shot,
  plus `crewWarning` / `crewProvoked` for gangs. `Combat.ammo` is still the pistol's rounds; other
  guns are in `combat.arsenal`. Gang members are `Enemy` entries with `group` `gang:<gang>:<n>`
  and `calm`.
- **Bugs found by the browser tests and fixed:** spread weapons never hit in the real game (the
  wall ray stops at the target's own collision box; `CombatWorld.wallDistance` in `Fighters.ts`
  now measures from the point itself, and pellets allow a body's depth); stage enemies placed 2 m
  off the kerb stood inside building solids on some streets and could not be beaten (now 0.5–1 m).
- **Shared files touched:** `Game.ts` (Arms wiring in `fight`, `frame`, `announce`, `snapshot`,
  `newGame`, `setPaused`, `target`; `debugGiveWeapon`), `main.ts` (`__cow.giveWeapon`, tests only),
  `content.ts` (append stages 11–15, `gangs` / `crews` / `pickups` in `GameContent`),
  `content.test.ts` (10 → 15 stages on purpose), `Fighters.ts`, `HumanFigure.ts` (weapon in the
  right-hand bone, `setWeapon`, `shownWeapon`), `TouchControls.ts` (weapon button),
  `packages/missions` `types.ts` (`chase` objective, `hostiles`, `weapons` reward),
  `MissionRunner.ts` (`quarry`), `stories.ts` (one line), index export lists, `docs/*.md`.
- **Tests:** typecheck clean; unit 351/351; my specs `weapons.spec.ts` 4/4, `gangs.spec.ts` 4/4,
  `missions2.spec.ts` 5/5; `combat.spec.ts` 4/4; full suite: see the final report of this branch.
- **Measured at `?quality=lite`** (preview build, software GPU): gang corners 107 draw calls /
  208k triangles (Royapettah), 162 / 164k (Triplicane), 129 / 254k (Egmore); the gangs spec saw
  130 / 237k at Royapettah.
- **Checked by eye** (screenshots, not committed): the weapon button sits left of FIRE / HIT, clear
  of them; crews stand at the kerb in their colours with the bat in hand; the player's bat is in
  the hand. Guns are small and dark at lite quality: visible as a dark shape at the hand, hard to
  judge closely.
- **Not done:** the back-street dealer (needs a new place kind across shared files); a holster
  (a loaded gun always counts as armed near gangs); two-handed poses for the shotgun and SMG;
  nothing tried on the emulator or a phone.
