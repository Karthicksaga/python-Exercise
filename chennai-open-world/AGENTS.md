# Instructions for AI coding agents

Read this, then `docs/handoff.md` (who did what last, what is next), `docs/architecture.md` and
`docs/progress.md`, before changing anything. Update `docs/handoff.md` when you stop.

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
5. `npm run typecheck && npm test`, and the browser specs your change touches
(`npm run test:e2e -- tests/<spec>.spec.ts`). The full browser suite runs in CI (below). 6. Build the APK and run it
(emulator at least; a real phone for anything touching performance or touch input).
7. Update `docs/progress.md`, and `docs/technical-decisions.md` if a decision was made.

## Commands
See `README.md`. Android builds need `JAVA_HOME` set to JDK 17–21.

## Several agents at once (read this if you were started alongside others)
Browser tests are the bottleneck: each run is software-rendered Chromium and uses most of the CPU.
- **Always run browser tests with `npm run test:e2e`** (never `npx playwright test` directly). It
  holds a machine-wide lock, so runs take turns instead of slowing each other into flaky timing
  failures, and it picks a free port, so you never test another checkout's build.
- **Run only your own browser specs** while you work: `npm run test:e2e -- tests/<yours>.spec.ts`,
  plus any existing spec your change touches (for example the driving specs if you change
  driving input). Typecheck and unit tests are cheap: run them as often as you like.
- **The full browser suite runs in CI, not on this machine** (the user's decision, 22 Nov 2026).
  CI splits it into 4 shards on 4 runners (about a quarter of the 37-minute local run). Whoever
  merges: run typecheck, unit tests and the specs the merged branches touched locally, push the
  merge to an `agent/merge-*` branch, and fast-forward `feat/chennai-open-world` only when that
  push's CI run is green (`test`, all 4 `e2e` shards). Run the full suite locally
  (`npm run test:e2e`) only to chase a CI failure you cannot reproduce with one spec.
- **Branches:** work on `agent/<topic>` made from the latest `feat/chennai-open-world`; push it
  after every working milestone (`git push -u origin HEAD:agent/<topic>`); only the coordinator
  merges into `feat/chennai-open-world`.
- **Shared files** (`apps/game/src/Game.ts`, `main.ts`, `Population.ts`, `packages/ui`, `index.ts`
  export lists, `docs/*.md`): keep edits small and additive (append, don't reorganise) so branches
  merge cleanly.
- **Stopping:** commit and push what you have (WIP is fine), and add a "where I left off" entry at
  the end of `docs/handoff.md`.

## Testing notes
- Browser specs open `/?quality=lite&start=play`: `start=play` skips the title menu (the
  smoke-test APK does the same). Only `title.spec.ts` opens the game as a player does.
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
