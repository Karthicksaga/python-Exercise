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
