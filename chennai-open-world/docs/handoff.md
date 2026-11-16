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
