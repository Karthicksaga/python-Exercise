# Choosing a model for each agent

The owner's rule (24 Nov 2026): **use the strongest model only for complex tasks; everything else
runs on cheaper models to save the usage limit.** Running nine agents on the strongest model stopped
every agent twice in one day.

Three agent types in `.claude/agents/` carry their model in their definition, so spawning the type
picks the model. The coordinator passes the type as `subagent_type` and does **not** override the
model.

| Agent type | Model | Relative cost | Use for |
|---|---|---|---|
| `godot-complex` | Opus | highest | Hard engineering, below |
| `godot-standard` | Sonnet | medium | **The default** for implementation with a clear spec |
| `godot-light` | Haiku | lowest | Mechanical chores, no decisions |

The coordinator itself (the session that plans, reviews and merges) stays on the strongest model:
reviewing screenshots, resolving code conflicts and judging reports is where mistakes are expensive.

## Which type for which task (this project)

### `godot-complex` (Opus)
- **Physics and simulation:** vehicle handling and tuning, crash ejection, Jolt problems, flight models
  (aeroplane, helicopter), train motion on curved track.
- **AI:** traffic on the road graph (lanes, junctions, signals), pedestrian avoidance and crowds,
  police pursuit and search, combat AI (attackers, retreat, lock-on).
- **World streaming and performance:** threaded chunk building, frame-time budgets, LOD and far-city
  layers, floating origin, regional index, decks and ramps, phone profiling.
- **Animation:** retargeting, sole planting, blends, IK.
- **Architecture and formats:** new data formats, module boundaries, save-format changes.
- **Root causes:** CI failures nobody has explained (like the emulator relaunch), intermittent bugs.
- **Merges with real code conflicts** across systems (not doc conflicts).

### `godot-standard` (Sonnet), the default
- **Assets by Blender script** with a spec: vehicles, trains, aircraft, building kits, props, the cast's
  clothing and new characters from the boards.
- **Ports with a reference:** rules and their tests from the Three.js game, content tables, UI screens
  (HUD, menus, job board, map) with layout tests.
- **Glue with a clear interface:** wiring a finished system into `main.gd`, mission and job runtime
  on top of the ported rules, sound files and manifests, data-pipeline tools and coverage reports.
- **Review rounds** where the coordinator wrote the fix list (for example "short sleeves and pockets on
  these uniforms", "relax the fingers").
- **Fetching assets with licence checks** (CC0 animations, recordings): Sonnet, because each licence
  is a judgement; it reports anything doubtful.

### `godot-light` (Haiku)
- Docs: handoff, progress, decisions text, README, PR descriptions, the coordinator handoff.
- Licence rows and attribution files from a list the coordinator gives.
- Running `./run_tests.sh`, `tools/geo/run_tests.sh`, the sync check, or reading a CI job log with the
  GitHub tools, and reporting exact counts and failure lines.
- Regenerating screenshots with an existing tool; renames and moves with no logic change.
- Never: writing game logic, building assets, choosing between options.

## Escalation

1. Start with the cheapest type that fits the lists above.
2. A `godot-standard` or `godot-light` agent that hits something beyond its spec must **stop and
   report**, not guess (their definitions say so). The coordinator then re-runs that part on the next
   type up, continuing from the same branch.
3. If the same task fails review twice on `godot-standard`, move it to `godot-complex`.
4. Never move a task down a tier halfway through because the limit is close; finish it or save its
   work-in-progress and resume after the reset.

## How many at once

4–5 agents at a time, usually 1–2 `godot-complex` plus the rest `godot-standard`, with `godot-light`
for chores in between. Nine agents at once on the strongest model used the whole limit in a few hours.

## Spawning

```text
Agent(subagent_type: "godot-standard", description: "...", prompt: "...", run_in_background: true)
```

Give every agent: its worktree and branch command, the brief sections that apply, the files it owns,
its G-number range, acceptance criteria and the report format (see `COORDINATOR_HANDOFF.md`). Don't
pass a `model` override; the type decides.

## The four branches waiting in the handoff

| Branch | Type | Why |
|---|---|---|
| `agent/godot-integration` | `godot-standard` | Wiring finished systems into the game with clear interfaces; escalate if boarding or physics misbehave |
| `agent/godot-traffic` | `godot-complex` | Traffic and crowd AI, performance at the densest streets |
| `agent/godot-missions` | `godot-standard` | Runtime glue on rules already ported and tested |
| `agent/godot-cc0-anim` | `godot-complex` | Retargeting a new clip set onto 70 people and the player, keeping foot, wrist and finger tests |
