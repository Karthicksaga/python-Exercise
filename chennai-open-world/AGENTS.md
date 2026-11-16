# Instructions for AI coding agents

Read this, then `docs/architecture.md` and `docs/progress.md`, before changing anything.

## What this is
An original Android open-world game set in real Chennai. TypeScript game runtime (Three.js +
Rapier) hosted in a WebView by a React Native shell. Why: `docs/technical-decisions.md` TD-1.
Do not move rendering into React Native/Hermes: Rapier (WebAssembly) cannot run there.

## Rules
- TypeScript strict everywhere. No `any`, no `@ts-ignore`.
- Respect package boundaries (table in `docs/architecture.md`). Only `packages/physics` imports
  Rapier. `map-data` and `game-world` never import Three.js or Rapier.
- New feature = new module in the right package, wired in `apps/game/src/Game.ts`. Keep `Game.ts`
  a composition root; no gameplay logic there.
- World content is data (`WorldMap`, missions, parking). Don't hand-place meshes in the renderer.
- What OSM doesn't provide (heights, colours, widths) is invented in `game-world` and must be
  described as estimated, never as real.
- Performance is a feature: instance repeated objects, share materials, dispose what you remove.
- Original content only: no names, characters, logos, missions or assets from existing games,
  and no real business names on signs.
- OpenStreetMap data needs attribution ("© OpenStreetMap contributors") and the extract date.
- Never mark something done in the docs unless it was run and tested; say how it was tested.
  "Tested on the emulator" and "tested on a phone" are different statements.
- Don't relax a test to make it pass. If the world changed on purpose, update the expectation
  and say why.

## Before a major feature
1. Read the relevant packages and docs. 2. List dependencies and Android/WebView limits.
3. Write the plan in `docs/development-roadmap.md`. 4. Build in small steps.
5. `npm run typecheck && npm test && npm run test:e2e`. 6. Build the APK and run it
(emulator at least; a real phone for anything touching performance or touch input).
7. Update `docs/progress.md`, and `docs/technical-decisions.md` if a decision was made.

## Commands
See `README.md`. Android builds need `JAVA_HOME` set to JDK 17–21.

## Testing notes
- `window.__cow` is for tests and debugging only: `snapshot()` (position, mode, money, mission,
  traffic…), `teleport(x, z, yaw)` and `probe(...)` (ray cast). Gameplay code must not use it.
- Tests hold controls for **game** time (`waitGameTime`, `waitFrames` in `support.ts`), never a
  fixed number of wall-clock milliseconds: software-rendered machines run the game slower than
  real time. Wall-clock timeouts only bound how long to wait.
- Browser tests open `/?quality=lite` and run one at a time (TD-12); helpers are in
  `apps/game/tests/support.ts`. They send touch pointer events to `move-zone` and `look-zone`.
- Places in `apps/game/src/content.ts` are snapped to the nearest road, so tests read targets
  from `snapshot()` instead of hard-coding coordinates.
- When placing vehicles, check nothing is parked in another's lane: the motorbike once sat
  directly behind the hatchback and drove into it.
- After changing `packages/game-world` rules or the extract, run `npm run build:world`.
- Asset licences are tracked in `assets/README.md`; update it when adding any file.
- To test a later stage, seed `localStorage["cow-progress-v1"]` with the completed stage ids
  (see `apps/game/tests/combat.spec.ts`) instead of playing through.
- Screenshots and logs taken while working go in a scratch folder and are deleted afterwards;
  none are kept in the repository.
