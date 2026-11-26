# Mission design v2: audit and new missions

Owner request (24 Nov 2026): find every weak spot in the missions and fix it properly; don't copy
the old missions; invent new ones that are fun, challenging and true to the real city, in the way
GTA-style games build missions, but original. This file is the build spec for `agent/godot-missions`
(G-140…G-149). Pure logic stays node-free in `src/missions/`; glue in `src/app/missions_layer/`.

## 1. Audit: what is weak (measured on `content.json` at `66d88b9`)

| # | Weak spot | Evidence | Fix |
|---|---|---|---|
| W1 | **One-note verbs.** 61 objectives: 38 `reach` (62 %), 12 `enter`, 8 `defeat`, 2 `chase`, 1 `evade`. Seven stages are "walk there, fight a group". No stealth, no cargo care, no decisions, no hazards. | counted from `missions[].objectives[].type` | New objective types and mission kinds (§3, §4) |
| W2 | **No real failure flow.** The runner has two failure reasons only ("Out of time", "They got away"). No checkpoint, no retry, no fail-forward (a late exam dash just ends). | `mission_runner.gd:171,179` | Checkpoints, retry from checkpoint, more fail reasons, fail-forward branches (§2) |
| W3 | **No replay value.** Stages are one-shot; no medals, no optional bonus goals. | `mission_session.gd` has no replay | Medals and bonus goals; "Replay stage" on the board (§2) |
| W4 | **Jobs are five archetypes repeated** (ambulance, courier, cab, bus, share) with the same loop and no events. | `jobs[].kind` | Dynamic events during jobs: detours, rain, procession (§3.4) |
| W5 | **Coordinates baked to today's box** (format 1). The world is growing to Chengalpattu–Pulicat on a floating origin; content must be checked against the regional world and anchored by place, not by magic numbers. | `test_content_on_map.gd` uses format-1 files | Content validated against format 2 in a test; new content references named places (`places` table) |
| W6 | **Kerb spot port only 34 of 49 (69 %) exact**; the test accepts 60 %. The rest were baked with a side hint the port can't reproduce. A threshold that low hides real errors. | G-137 | Find the divergence; port exactly or bake the hint into the data; raise the test to 100 % of baked kerbs |
| W7 | **Chase quarry follows a baked polyline**, ignoring traffic, signals and the road graph. | `chase` objective `path` | Quarry follows the road graph at its speed (same agent type the traffic branch builds); polyline stays as fallback |
| W8 | **Seated passengers are hidden** (no seated pose). Train stages 18–19 have rules but no train rider scene. | missions report | Blocked on cc0-anim (sit clip) and the railway phase: tracked, don't fake it; passengers become visible when the clip exists |
| W9 | **Parked content vehicles are spawned twice** once integration lands (MissionsLayer and the integration spawner). | missions report | At merge: `spawn_parking=false`; one owner (integration). Coordinator does this |
| W10 | **Small UI gaps:** job board shows 3 rows at 412 px; sound cues only if `Sound.chime` exists; toast fit relies on a one-frame wait; no phone measurement. | missions report | Add Sound cue API calls through the real `Sound` autoload; layout test for toast without frame wait; board gets pinned header and 4 rows; phone numbers come in phase 7 |

W5–W7 and W10 are yours to fix now. W8 and W9 are tracked (they depend on other branches).

## 2. Systems every new mission gets (G-140…G-143)

1. **Checkpoints and retry.** A mission can mark checkpoints (after a stage objective). On failure
   the player chooses RETRY (from the last checkpoint: position, vehicle, money unchanged) or
   QUIT. Failure reasons are an enum with a text each: out of time, target escaped, cargo ruined,
   spotted, patient lost, vehicle destroyed, player down.
2. **Fail-forward.** Some failures branch instead of ending: a late exam dash moves to "the side
   gate" objective with a smaller reward. Branches are data (`on_fail: objective_id`).
3. **Medals and bonus goals.** Each mission has up to 3 optional goals (no damage taken, under par
   time, no police attention, cargo above 90 %). Bronze/silver/gold from how many are met. Stored in
   the save (one version bump, migrated). Replay from the job board's "Stages" tab.
4. **Choices.** A `choice` objective offers 2–3 labelled options with consequences
   (reward, reputation, wanted heat, which stage follows). Cheap to test: pure logic.

## 3. New objective types and hazards (pure logic, tested)

1. **`tail`** (the inverse of `chase`): stay between `near` and `far` metres of a moving target
   without getting inside `notice` metres for more than `grace` seconds; a suspicion meter fills when
   too near or when you run a red light beside it; too far loses it. Target obeys the road graph.
2. **`fragile`** (cargo care): a stability meter 0–100. Drops from hard braking, hard cornering,
   speed breakers taken above a safe speed (Chennai has many), potholes, crashes; slow recovery
   when driving smoothly. Mission fails at 0; the bonus goal is "above 90 %". HUD: a thin meter.
3. **`hazard_zone`** (dynamic danger): a zone that grows or moves over time (flood water in an
   underpass, a procession filling a road). Driving into it slows the vehicle; deep water stalls it;
   routes re-plan around it. Driven by game time and the weather rain level.
4. **`dynamic_event`** for jobs: a seeded random event during a job (blocked road, passenger changes
   destination, rain starts, a bandh closes an arterial: TD-25 strikes already model these). Never
   more than one active, never during a fight.
5. Later wave (needs traffic AI, not in this task): `stealth` on foot and `race` against rivals.

## 4. The new missions (original, in the real city)

Each uses real places through the `places` table, original names and fiction, no brands, no real
businesses, no children in any danger. Each has a checkpoint, a bonus goal list and a fail-forward
or choice where noted. Names are working titles.

1. **Hall Ticket** (timed dash, fail-forward). A student's entrance-exam gates close at 9:00. Take an
   auto from the lodge to the centre across the city at rush hour. A procession and a waterlogged
   underpass appear as `dynamic_event`s (never the same twice: seeded). Late by under 5 min: the
   side-gate branch on foot, half reward. Bonus: arrive 10 min early, no horn at the hospital zone.
2. **Sambar for Sixty** (`fragile`). Carry a huge steaming vessel for a wedding feast from the
   caterer to the hall on a goods carrier. Speed breakers and potholes drain stability; a shortcut
   lane is rougher but shorter (a real route choice). Bonus: 90 % intact, in time.
3. **Wrong Number** (`tail` + `choice`). A parcel runner keeps changing scooters through Mount
   Road and T. Nagar. Tail him to the drop-off without being noticed. At the end choose: report it
   to the police station (reputation up, small reward), or take the envelope (money up, one star of
   wanted heat, a later stage reacts to it).
4. **Monsoon Night** (`hazard_zone`). Heavy rain; underpasses flood minute by minute. Drive an
   ambulance with a patient from the coast to the hospital; the shortest route floods first, so
   re-route (the flood map is visible on the minimap). Bonus: patient health above 70 % (a smooth
   drive keeps it up).
5. **The Bandh** (strike hazard). A general strike shuts the arterials (reuse the TD-25 strike
   zones). Deliver three urgent goods across the city using lanes and the beach road before noon;
   shops shut, so each handover spot is a back door. Bonus: no police attention.

Wave B, after the traffic and police branches have landed: **Night Watch** (on-foot stealth at a
godown, guard vision cones, noise from running) and **Marina Midnight Sprint** (street race against
three rivals with checkpoints on the Island Grounds circuit).

## 5. Acceptance

- Typed GDScript; pure logic tests wait in game time; each mechanic (`tail`, `fragile`,
  `hazard_zone`, `choice`, checkpoints, medals, fail-forward) has unit tests with numbers, including
  the fail and success edges. No test is weakened.
- W2–W7 and W10 fixed with tests that failed before and pass after (state which test).
- Content test: every new mission's positions resolve on the format-2 world; markers sit on
  road or kerb; no objective inside a building.
- Existing 21 stages and 13 jobs behave as before (the 428 tests still pass).
- Screenshots (915x412, 1830x824, Compatibility, scratch folder): fragile meter, tail suspicion,
  flood overlay, choice dialog, retry dialog, medals screen.
- Docs: handoff section, G-140…G-149 in `technical-decisions.md`, save-format version noted.
- `./run_tests.sh`, `tools/geo/run_tests.sh`, `sync_from_threejs.py --check` green; CI green.


## 6. Status (24 Nov 2026, G-140..G-149)
Built: W2 to W6 and W10, §2 (checkpoints and retry, fail-forward, medals with save version 2, choices), §3 (`tail`, `fragile`, `hazard_zone`, `dynamic_event`) and the five §4 missions, with HUD parts. Open: W7 (road-graph quarry; tails and chases play baked road routes), W8, W9, hazard re-planning, wave B. Details: `technical-decisions.md` G-140..G-149 and the Missions v2 section of `handoff.md`.
