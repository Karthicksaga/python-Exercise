# Coordinator handoff (24 Nov 2026)

Read this first in a new coordinating session, then `MIGRATION_PROMPT.md` (the brief; sections 9–11
hold the owner's later decisions), `MASTER_PROMPT.md` (how to run the team), `AGENTS.md`, and the
agent sections in `docs/handoff.md`. The previous session stopped here at the owner's request; all
work is pushed and nothing is lost.

## 1. Where things stand

**Integration branch:** `feat/godot-chennai` at **`4c6dc0e`**, CI green (tests, Android APK, emulator
smoke). Draft PR **#17** (`feat/godot-chennai` → `feat/chennai-open-world`) carries the status table.
Last APK: run 45317482821, artifact `godot-chennai-apk` (about 155 MB).

**Merged and verified** (each reviewed: tests run by the coordinator, screenshots looked at, CI green):

| Work | Decisions |
|---|---|
| Foundation: project, loading/title/About, boot watchdog, `GameLoop`, `WorldOrigin` (floating origin), `WorldSource` + v1 reader, sync tool, test runner, CI (APK + emulator smoke). Emulator flake root cause fixed (Android overlay relaunch during start-up; readiness waits) | G-1…G-9 |
| Cast: 70 people (owner's boards, phase 1 + phase 2 + the 10 extra), shared skeleton, idle/walk/run/sit/talk, LODs, board-faithful clothes, relaxed hands, feet/wrist/finger tests | G-10…G-19 |
| Data: Chengalpattu–Pulicat world, format 2 (47 tiles of 10 km), 391k buildings, airport aeroways; Python tools + pytest | G-20…G-29 |
| Models: premium saloon/SUV/coupé, race car, helicopter, airliner, light aircraft, detailed Chennai trains (EMU, AC EMU, WAP-7 + LHB, Vande Bharat style) | G-30…G-39 |
| Rules: 21 stages, 13 jobs, fares, goods, life places, combat (TD-27), wanted heat + `PoliceFleet` (TD-28), carjack crime; 251 tests | G-40…G-49 |
| World: streamed city (threaded build, ≤ 2.5 ms/frame main thread), facades, Tamil signs, trees, colliders, `RegionalWorldSource` for format 2; wired into `main.gd` with the player | G-50…G-59 |
| Player: controller, retargeting, sole planting, chase/orbit camera, touch controls | G-60…G-68 |
| Vehicles: all kinds drivable (Three.js handling parity within 10 %), doors/boarding, crash ejection, premium/race handling; reads the redesigned Tamil Nadu models | G-70…G-79 |
| Sound and environment: sample-based engines (recorded where available), horns, footsteps, ambience, mix; day/night, rain | G-80…G-89 |
| Tamil Nadu road vehicles: auto, share auto, goods carrier, hatchback, sedan, taxi, city/low-floor/intercity/mofussil/school buses, ambulance | G-90…G-99 |

Tests on `4c6dc0e`: 405 GDScript tests (about 22k assertions), 0 broken scripts; 43 pytest; sync check.

**Phases (brief §5):** 0 ✅, 1 ✅ (not yet checked on the owner's phone); 2 mostly done (vehicles not yet
placed in the city); 3, 4 in progress; 5 rules only; 6 parts; 6b models + data only; 7 mostly not started.

## 2. Branches in flight (WIP, unfinished, NOT verified — continue them, don't start over)

| Branch | Head | Agent's task (prompt is in this file's §5) | Where it stopped |
|---|---|---|---|
| `agent/godot-integration` | `560efcc` | Parked vehicles in the city, board/drive/exit, crash ejection to foot, day/night + weather in the game, pause menu (G-110…G-119) | updating `test_boot` for a 4th loading step and new Back routing |
| `agent/godot-traffic` | `daf2f9c` | AI traffic + signals, pedestrians from the 70-cast, crowd density by place (TD-31), carjacking runtime (G-120…G-129) | writing the area builder |
| `agent/godot-missions` | `c57b60c` | Stages/jobs playable: HUD, markers, saving, job board, passengers, the 5 map-dependent content checks (G-130…G-139) | writing scene tests |
| `agent/godot-cc0-anim` | `5bf78da` | Replace Mixamo idle/walk/run with CC0 locomotion (owner decision), rebuild 70 people + player clips, licence test (G-100+) | updating licence notes, sync tool, LICENSES rows, build script; GLBs partly rebuilt |

Each WIP branch is based on `4c6dc0e`. Before merging any of them: merge `feat/godot-chennai` into it,
run `./run_tests.sh` (0 broken, all pass), `python3 tools/sync_from_threejs.py --check`, look at its
screenshots, wait for CI green.

`agent/godot-merge-1` = `4c6dc0e` (the staging branch used for the six-branch merge; can be deleted).

## 3. Decisions still open (ask the owner)

1. **Overture buildings** to fill rings 2–3 (villages look empty): needs hosts
   `overturemaps-us-west-2.s3.us-west-2.amazonaws.com` (or `overturemapswestus2.blob.core.windows.net`),
   `extensions.duckdb.org`, optionally `stac.overturemaps.org`.
2. **Google Open Buildings 2.5D heights**: needs an Earth Engine account (owner's) or the owner exports
   the GeoTIFF once.
3. **CC0 animation source**: if the chosen set's host is blocked, the owner must approve it (network
   card). Quaternius's library was the first candidate; licence must be confirmed CC0.
4. Blueprint §21 leftovers: real business names on signs (TD-18 forbids; keep unless the owner says
   otherwise), street-imagery source, Open Buildings licence choice (ODbL recommended), pilot
   neighbourhoods.
5. **Sound recordings**: `upload.wikimedia.org` answered HTTP 429 for hours; only the car engine has a
   real recording. Retry slowly (respect `Retry-After`, a descriptive User-Agent without personal
   data), or the owner can record the missing vehicles (auto, bikes, bus, horns) on a phone.

Owner decisions already taken (recorded in the brief): Godot migration; world Chengalpattu → Pulicat
(Tamil Nadu border), floating origin, regional index, rings; same structure as the Three.js game;
reconstruction blueprint and all proposed Three.js solutions carried into Godot (§9, §10); premium
cars, race car, helicopter, aeroplane, airport (§11); real recorded sounds (no Freesound key); 4 board
figures cast as women; 70-person cast; replace Mixamo with CC0; free/open tools only.

## 4. Next waves after the four branches land

1. **Phase 5:** police and combat runtime (Rules' pure logic + Traffic's hooks + Player's `knock()`).
2. **Phase 6:** railway runtime (Beach–Tambaram first, Models' trains, stations, crowds), full-screen
   city map, sound recordings, day/night polish.
3. **Phase 6b:** airport (Data's aeroways), aeroplane and helicopter flight, far-city layer.
4. **Phase 7:** reconstruction visuals (archetypes, kits, roads, decks, landmarks), Overture fusion,
   phone profiling on the owner's POCO M6 Pro 5G (Adreno 613), parity checklist.
5. **World rings:** grow from today's box outward (format 2 is ready).

Keep 4–5 agents at once (the usage limit stopped every agent twice when 9 ran). Mechanical agents can
use a lighter model; World/Player/Vehicles/AI/combat/flight need the strongest.

## 5. How the coordinator worked (lessons)

- **Every merge:** fetch, merge into a staging or the coordinator worktree, resolve, run
  `./run_tests.sh`, pytest (`tools/geo/run_tests.sh`) and the sync check, look at 2–3 screenshots,
  then push; if anything fails, push to `agent/godot-merge-N` and send the owning agent back with the
  exact failures. Never push a red integration branch.
- **Doc conflicts** (`docs/handoff.md`, `progress.md`, `technical-decisions.md`, `assets/LICENSES.md`):
  keep every agent's section. Content conflicts: keep both sides of each hunk. Add/add conflicts
  (both created the file): concatenate, dropping the duplicate title. Then check no G-number heading
  appears twice.
- **Turn off `git rerere`** in the coordinator worktree (`git config rerere.enabled false`): it once
  replayed an undone merge's resolution and duplicated every Data decision.
- **Strict typing** is a project setting (untyped/unsafe access are errors). Agents writing standalone
  scripts outside Foundation's runner broke on merge twice; tell every agent to run `./run_tests.sh`.
- **Folder ownership:** the sync tool owns `assets/people/legacy/` and `assets/vehicles/legacy/` and the
  rows between its markers in `assets/LICENSES.md`; agents put new assets beside them.
- **Screenshots never in the repo** (AGENTS.md); review images live in scratch folders.
- **Usage limits:** when agents stop, commit their WIP (`wip(godot-chennai): … saved at a usage-limit
  stop`), push, and resume the same agents with a message naming the WIP commit.
- **The emulator smoke** was flaky until the overlay-relaunch root cause was fixed (G-9 amended). A
  single red smoke is still worth one look at the log via `mcp__github__get_job_logs` (the blob
  storage host for full logs is blocked from the container).
- **Toolchain in the cloud container** (not committed): Godot 4.7.2 at `/opt/tools/godot`, Blender
  5.2.4 at `/opt/tools/blender`, MPFB data at `/opt/tools/mpfb-data`, geo venv at
  `/opt/tools/geo-venv`. A fresh container needs them reinstalled (download hosts are allowed in the
  `python-Exercise` environment: downloads.godotengine.org + its storage host, download.blender.org,
  makehumancommunity hosts).

## 6. The Three.js game (`chennai-open-world/`)

Untouched by the migration. Open draft PRs #13 (loading/title + phone fixes), #14 (sound), #15
(combat), and branches `agent/gameplay-fixes` (ride-stutter fix, carjacking), `agent/police-tuning`,
`agent/crash-ejection`, `agent/crowd-density` (WIP specs). Their designs are being ported into Godot
(brief §10); merge them into the Three.js game only if the owner wants the old game updated.

## 7. Prompt for the next coordinating session

> You are the COORDINATOR for the Godot migration of the Chennai game in Karthicksaga/python-Exercise.
> Read `godot-chennai/docs/COORDINATOR_HANDOFF.md`, then `godot-chennai/MASTER_PROMPT.md` and
> `godot-chennai/MIGRATION_PROMPT.md` (all of it). Integration branch `feat/godot-chennai` (draft PR #17).
> First: reinstall the toolchain if missing (§5), then resume the four WIP branches in §2 with one
> agent each (give each its original task from §2 plus "continue from the WIP commit"), review and
> merge them as in §5, then start the next waves in §4, at most 4–5 agents at once. Ask the owner only
> the open decisions in §3.
