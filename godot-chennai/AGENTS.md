# Instructions for agents working on the Godot version

Read this, then `docs/handoff.md` (who did what last, what is next), `docs/progress.md`,
`docs/technical-decisions.md` (G-n) and `MIGRATION_PROMPT.md` (the brief) before changing
anything. Update `docs/handoff.md` when you stop.

## What this is
The Chennai open-world game rebuilt in **Godot 4.7.2** for Android phones in landscape, migrated
phase by phase from the Three.js game in `../chennai-open-world/`. That game stays playable and
is the source of data, assets and rules until this version reaches parity.

## Rules
- **Never modify `chennai-open-world/`.** Read it; copy from it with
  `tools/sync_from_threejs.py` (byte-for-byte copies, G-3); port its rules and tests.
- **Typed GDScript.** Every variable, parameter and return is typed; untyped declarations and
  unsafe property or method access are errors in `project.godot`. Use `maxf`/`clampf`, not
  `max`/`clamp` (they return Variant).
- **Same structure as the Three.js game** (G-5): one module per old package under `src/`, the
  composition root in `src/app/` (wires systems, no gameplay logic, like `Game.ts`). New
  feature = new folder in the right module (`godot-project-organization`: one thing, one
  folder; scene and script share a snake_case name; `class_name` PascalCase).
- **World data only through `WorldSource`** (G-6). Bounds and the chunk grid come from the data;
  never hard-code today's box (the world grows to Chengalpattu–Pulicat). Positions in data are
  world metres (TD-2: +X east, -Z north); scene positions go through `WorldOrigin` (G-7), and
  top-level world nodes join the group `origin_shifted`.
- **Never block the main thread with loading:** decode on worker threads (`BackgroundTask`,
  `ResourceLoader` threaded requests), build meshes in time-sliced steps, add a chunk when it is
  complete. Nothing simulates on ground that has not loaded.
- **Tests wait in game time** (`GameLoop.wait_physics_frames`, `TestCase.wait_until`), never on
  the wall clock. Never weaken or delete a test to make it pass; if behaviour changes on
  purpose, update the expectation and say why in the commit.
- **Original content only.** No brands, logos, real business names, real insignia or likenesses;
  OpenStreetMap attribution ("© OpenStreetMap contributors" and the extract date) wherever the
  map is shown. Every asset gets a row in `assets/LICENSES.md` (CC0, CC-BY with credit, or
  original). What OSM does not provide (heights, colours, widths) is described as estimated.
- **Children** only where nothing can hurt them: station crowds and as passengers with an adult;
  never in anything that can be hit, shot or hurt.
- Mark something done in the docs only after it ran and was tested, and say how
  ("emulator" and "phone" are different statements).

## Modules (`src/`) and their boundaries
| Module | Owns (as in the Three.js package) | May use |
|---|---|---|
| `map_data` | Geographic projection; OSM → features in metres | nothing |
| `game_world` | World data model and reader (`WorldSource`, `WorldCodec`, `WorldIndex`, `ChunkData`, `Road`, `Building`…), time of day (`GameClock`) | `map_data` |
| `physics` | Jolt bodies, character and vehicle bodies, ray casts | engine |
| `game_engine` | Scene, light, camera, chunk meshes and streaming, the fixed step (`GameLoop`), floating origin (`WorldOrigin`), `BackgroundTask` | `game_world`, `physics`, `rail` data |
| `player` | Movement rules, animated humans, retargeting | `physics` |
| `vehicles` | Vehicle types, models, drivable vehicles, traffic views | `physics` |
| `ai` | Road graph, agents, traffic and pedestrians. Pure logic | `game_world` |
| `missions` | Missions, jobs, fares. Pure logic | nothing |
| `combat` | Health, weapons, fights, wanted level, gangs. Pure logic | nothing |
| `rail` | Railway data, train motion, timetable. Pure logic | `map_data` |
| `audio` | Sound | nothing |
| `ui` | Loading screen, title menu, HUD, touch controls, theme (`UiTheme`) | nothing (gets data from `app`) |
| `app` | Composition root `main.tscn`, the placeholder `test_world` | everything |

`game_world`, `map_data`, `rail`, `ai`, `missions` and `combat` stay free of nodes (plain
`RefCounted` data and logic), so they run on worker threads and in fast unit tests.

## Commands
See `README.md`: `./run_tests.sh`, screenshots with `tests/tools/screenshot.gd`, export.
Always run Godot with `timeout`, `--headless --audio-driver Dummy` (a parse error otherwise
leaves a run hanging).

## Branches and several agents at once
- Branch `agent/godot-<topic>` from `feat/godot-chennai`; push at every milestone
  (`git push -u origin HEAD:agent/godot-<topic>`); only the coordinator merges.
- Never use bare `git stash` (the stash is shared between worktrees).
- Shared files (`project.godot`, `src/app/main.gd`, `docs/*.md`, `assets/LICENSES.md`): keep
  edits small and additive so branches merge cleanly.
- The cast agent owns `tools/blender/` and `assets/people/` outside `legacy/`; the sync owns
  `assets/people/legacy/` and the rows between its markers in `assets/LICENSES.md`.
- Decision numbers: G-1…G-9 foundation, G-10…G-19 cast; later work continues after the highest.
- Screenshots and logs go in a scratch folder, never in the repository. Commit messages end
  with the attribution lines the environment provides; no model identifiers in commits or docs.
