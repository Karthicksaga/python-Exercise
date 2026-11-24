# Coordinator handover, 24 Nov 2026 (second session)

Read this first, then `COORDINATOR_HANDOFF.md` (older: lessons in §5 and the toolchain note still apply),
`../MASTER_PROMPT.md`, `../MIGRATION_PROMPT.md`, `MODEL_SELECTION.md`, `handoff.md`, `technical-decisions.md`.
Draft PR #17 (`feat/godot-chennai` -> `feat/chennai-open-world`) carries the status table.

## 1. Standing rules from the owner
- Coordinator plans, spawns, steers and merges; writes little code; never edits `chennai-open-world/`.
- Only agent types `godot-complex` (Opus: physics, AI, streaming/perf, animation retargeting, architecture,
  root causes, real merge conflicts), `godot-standard` (Sonnet: default), `godot-light` (Haiku: docs, reports,
  running checks). Never override their model. At most 4-5 agents at once (16 GB machine; 8 agents caused an OOM kill).
- Per report: read it, look at 2-3 screenshots, check CI, merge in the coordinator worktree (keep every
  agent's doc sections, no duplicate G-numbers), run `./run_tests.sh` (0 broken), `tools/geo/run_tests.sh`,
  `python3 tools/sync_from_threejs.py --check`. Push to `feat/godot-chennai` only when all green, otherwise
  to `agent/godot-merge-N` and send the exact failures to the owning agent. CI failures: root cause, at most
  one re-run, never skip or loosen a test. Known load-sensitive test:
  `scene/test_city_streaming.gd::test_main_thread_budget_under_cpu_load` (passes alone on a quiet machine; never touch it).
- After each phase send the owner a short summary, APK artifact link and 3-4 screenshots; keep PR #17 current.
- Rules: free/open assets only (CC0, or CC-BY with credit); original content (no brands, logos, real business
  names, likenesses); children never anywhere they can be hurt; typed GDScript; tests wait in game time;
  screenshots never in the repo; commits end with the attribution lines; no model identifiers in commits/docs.
- Usage-limit stop: commit+push the agent's WIP, resume the same agent with a message.
- Ask the owner only for decisions that are theirs; otherwise decide and record a G-n decision.

## 2. State of `feat/godot-chennai` (head 777032e, CI run 45382150924)
Merged: foundation, cast, data, models, rules, world, player, vehicles, sound, Tamil Nadu vehicles (see older
handoff), plus this session: infrastructure (test isolation via per-run XDG_DATA_HOME), controls redesign,
title/loading page, landmarks (Kapaleeshwarar, Ripon, Chennai Central, lighthouse, Egmore, Anna Nagar tower),
areas (boundary palettes), OSM detail (speed breakers, props), CI limited to the Godot job on godot branches.
Tests at last merge: 611 GDScript tests, 0 failed, 0 broken; pytest 114; sync check 1978 files.

## 3. Agents and branches (all pushed; worktrees under /home/user/wt/<name>)
TOP PRIORITY wave (owner's phone bug report, started this session, nothing merged yet):
| Branch | Type | G-range | Task |
|---|---|---|---|
| agent/godot-anim | complex | 260-269 | seated driver/rider poses with hands on grips (auto, bike, car, bus); passengers visible seated; fall/crumple/get-up clips (`PersonView.play_fall(velocity)`, `play_getup()`); walking arm swing for player and NPCs; better run |
| agent/godot-crash | complex | 270-279 | bump vs fall vs throw thresholds (hitting a bike must only bump); crash effects: glass, sparks, damage, camera shake |
| agent/godot-nav | standard | 280-289 | missions 2-8 km apart across the city; minimap + full map; labelled beacons instead of plain circles; visible pickup passengers |
| agent/godot-ui | standard | 290-299 | FPS hidden by default behind a Performance overlay setting; round, smaller, translucent buttons; pause icon instead of yellow PAUSE |
| agent/godot-take | standard | 300-309 | wire `Carjacking.make(main.life, driving)` + ActionContext so the player pulls NPC drivers/riders off and takes over cars/bikes/autos |
Earlier wave, still running or stopped (check each branch's last commit before resuming):
| Branch | Task | Notes |
|---|---|---|
| agent/godot-perf | fix 4-28 FPS on POCO M6 Pro (bisect merges, CPU/GPU overlay, safe mode, presets, Compatibility-renderer A/B APK) | owner data: 28 FPS open daytime, 14 morning street, 13 night driving, 4 at 18:40 long street, random drops to 4-5; early move/jump build was smooth |
| agent/godot-transit | bus stops, routes, stations, bus travel, passengers | owner also wants better bus entering |
| agent/godot-fusion | fuse Overture, Microsoft, Google Open Buildings with OSM (OSM primary) | asked to save WIP and report |
| agent/godot-homes | buy/enter/furnish/extend homes, integration | asked to save WIP and report |
| agent/godot-sizediet | DONE, head 52b6720, CI green: APK 162.7 -> 115.1 MB, CI size budget 260 MB, docs/app-size.md | NOT merged yet: merge it with the first batch |
Sizediet forecast: 173 MB (low) to 371 MB (high) with planned content; plan `.aab` + install-time/on-demand
asset packs (docs/app-size.md section 6). Limits of Play need verifying.
Agents live only inside the session that spawned them: in a new session re-spawn from the branch heads with
"continue from the last commit".

## 4. Owner's open requests not yet started
- Trees improvement (tree kit); bus entering improvements.
- Phase 5 police/combat runtime; phase 6 railway runtime (Chennai trains, full-screen map, recorded sounds);
  phase 6b airport/aeroplane/helicopter/far-city; phase 7 reconstruction visuals and phone profiling;
  rings out to Chengalpattu-Pulicat; parity checklist vs the Three.js game.
- Culture and life (`suggestions/2026-11-24-chennai-culture-and-life.md`): Tamil+English `tr()` system,
  Kapaleeshwarar temple visit, heritage journal, swimming, bicycle and boat.
- Controls: tilt/two-button steering and action pad later (`suggestions/2026-11-24-godot-controls-redesign.md`).
- Realistic buildings/landmarks from OSM + researched references; malls (generic signs); bus stops/stations.
- RoadHeights into traffic AI; RoadBumps into fragile cargo; Egmore and Kathipara hero models.
- Missions redesign: see `mission-design.md` (W1-W10 audit, five new missions, checkpoints, fail-forward, medals).

## 5. Open owner decisions
Peace-zone/respect list for temples; second landmark after Kapaleeshwarar; who reviews Tamil text (machine
Tamil is not shipped unreviewed); beach pony rides; generic mall signs vs real names; home price scale;
owner to supply own photos (gopuram, Ripon, Egmore, bus, bus stop, apartment, houses) and optional
higher-resolution character images; which APK step first felt slow.

## 6. Environment notes
- Toolchain (not committed): Godot 4.7.2 `/opt/tools/godot`, Blender `/opt/tools/blender`, geo venv `/opt/tools/geo-venv`.
- Hosts opened for data: Overture, Microsoft, Google building data. Wikimedia returns 429 often (reference
  photos only, never committed); Overpass was unreachable.
- Owner screenshots: /tmp/claude-0/owner_shots/ (container only, lost on restart).
- APK: CI artifact `godot-chennai-apk` (arm64 release, debug-key signed). Do not give a link from a cancelled run;
  check the run's conclusion first.

## 7. Prompt for the next coordinating session
> You are the COORDINATOR for the Godot migration of the Chennai game in Karthicksaga/python-Exercise.
> Read `godot-chennai/docs/SESSION_HANDOVER.md` then the files it lists. Check each `agent/godot-*` branch
> in section 3 (git log, tests), resume unfinished ones with the right agent type, merge sizediet first,
> then the priority wave using the per-report loop. Keep 4-5 agents at once. Ask the owner only the open
> decisions in section 5.
