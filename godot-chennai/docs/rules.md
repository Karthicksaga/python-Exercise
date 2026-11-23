# Game rules in Godot (Rules agent, `agent/godot-rules`)

The pure game rules and content tables of the Three.js game, ported to typed GDScript with
their unit tests. No scenes, no rendering, no physics: the game (later phases) feeds them game
time, the player's state and answers about the world, and acts on the events they return.

Run the tests: `tools/rules/run_tests.sh` (headless; exit 0 = all passed). It uses
`project.godot` when Foundation's project is present, otherwise a throwaway copy, so nothing is
written into the repo. 251 cases, about 1 500 checks, about 12 s including the import.

## Layout (owner's decision §9: the same modules as the existing game)

| TypeScript (branch) | GDScript |
|---|---|
| `packages/missions/src/types.ts` (feat/godot-chennai) | `src/missions/mission_data.gd` (`MissionData.Mission`, `.Objective`, `.Fare`, `.Goods`, `.PlayerStatus`) |
| `missions/src/MissionRunner.ts` | `src/missions/mission_runner.gd` (`MissionRunner`) |
| `missions/src/chase.ts` | `src/missions/chase.gd` (`Chase`) |
| `missions/src/fares.ts` | `src/missions/fare_stop.gd` (`FareStop`, `walk_time`, `door_time`, `bus_crowd`) |
| `missions/src/goods.ts` | `src/missions/goods_stop.gd` (`GoodsStop`, `goods_name`, `cargo_aboard`) |
| `missions/src/jobs.ts` | `src/missions/job_data.gd` (`JobData.Job`, `.Stop`, `.AvoidZone`, `.ShareRoute`), `src/missions/job_runner.gd` (`JobRunner`, `open_at`, `hours_text`, `inside_zone`, `avoid_penalty`) |
| `missions/src/shareAuto.ts` | `src/missions/share_shift.gd` (`ShareShift`, fares, rating), `src/missions/route_line.gd` (`RouteLine`) |
| `missions/src/life.ts` | `src/missions/life.gd` (`Life`) |
| `missions/src/stories.ts` | `src/missions/story_runner.gd` (`StoryRunner`, `.Story`, `.Step`) |
| `apps/game/src/content.ts`, `streetWar.ts`, `laterStages.ts`, `cityJobs.ts`, `fareSpots.ts`, `shareAutoRoute.ts` | baked by `tools/rules/export_content.ts` into `src/missions/content/content.json`, loaded by `src/missions/game_content.gd` (`GameContent`) |
| save keys in `Game.ts`, `JobDesk.ts`, `Arms.ts` (`cow-*-v1`) | `src/missions/save_store.gd` (`SaveStore`) |
| `packages/combat/src/Combat.ts` (agent/combat-redesign; `hurt` from agent/crash-ejection) | `src/combat/combat.gd` (`Combat`, `.Enemy`, `.PlayerState`), `src/combat/combat_world.gd`, `src/combat/enemy_spot.gd` |
| `combat/src/Melee.ts` (TD-27, `COMBAT_FEEL`) | `src/combat/melee.gd` (`Melee`) |
| `combat/src/Weapons.ts` | `src/combat/weapons.gd` (`Weapons`), `src/combat/arsenal.gd` (`Arsenal`) |
| `combat/src/Gangs.ts` | `src/combat/gangs.gd` (`Gangs`) |
| `combat/src/PedestrianHits.ts` | `src/combat/pedestrian_hits.gd` (`PedestrianHits`), `src/combat/casualties.gd` (`Casualties`) |
| `combat/src/Pickups.ts` | `src/combat/weapon_pickups.gd` (`WeaponPickups`) |
| `combat/src/Wanted.ts` (agent/police-tuning + agent/carjacking) | `src/combat/wanted.gd` (`Wanted`) |
| crew rules inside `apps/game/src/Police.ts` (agent/police-tuning, TD-28) | `src/combat/police_fleet.gd` (`PoliceFleet`, new: finished as pure rules) |
| `packages/ai/src/Carjack.ts` (agent/carjacking, TD-30) | `src/ai/carjack.gd` (`Carjack`) |
| `packages/game-world/src/clock.ts` | `src/game_world/day_clock.gd` (`DayClock`) |
| `game-world/src/districts.ts` | `src/game_world/district_index.gd`, `visited_districts.gd` |
| (helpers) `Math.round`, mulberry32 `seededRandom` | `src/game_world/rules_math.gd` (`RulesMath`), `src/game_world/seeded_random.gd` (`SeededRandom`) |

Tests: `tests/rules/test_*.gd` (one GDScript method per TS `it(...)`, same names in words, same
numbers), runner `tests/rules/run_rules_tests.gd`, helpers `rules_test.gd`, `combat_helpers.gd`.

## Which branch each part comes from
- **Missions and jobs:** `feat/godot-chennai` (newest: it has `goods.ts`, the goods handed over at
  stops and the ambulance stretcher; `agent/combat-redesign` predates it).
- **Combat:** `agent/combat-redesign` (TD-27). `feat/godot-chennai` also has the older TD-25
  `Strikes.ts` (a wind-up and a wall-aware knock-back added to the pre-redesign `Combat`); TD-27
  supersedes it with its own wind-up (`COMBAT_FEEL.windup`), stun and knock-back (stopped by
  walls), so `Strikes.ts` is not ported (G-45).
- **Wanted and police:** `agent/police-tuning` (TD-28) for `Wanted.ts`, plus the `carjacking`
  crime from `agent/carjacking` (TD-30). `agent/crash-ejection` (TD-29) adds no crime; its only
  rules change in the scope is `Combat.hurt` (a crash's damage, no dodge or block), ported.
- **Content:** `feat/godot-chennai` (with goods), built against its `apps/game/public/world`.

## Intentional changes (none change a number)
- **Names:** snake_case methods and fields (`seconds_left()`, `time_limit`); TS getters became
  methods. Event Dictionaries keep the TS `type` names and keys (`"enemyHit"`, `fromX`) so the
  game code reads like the TS game's.
- **Optional values** are sentinels: `-1` (job `max_bumps`, `start_radius`, stop `due`, no lock),
  `""` (no mode, no group), `{}` (no event, no hours, nothing picked), `null` (no fare, no
  quarry). `punch()` returns `false` where TS returned `undefined` (still recovering).
- **Positions are Dictionaries `{x, z}` of doubles,** never `Vector2` (32-bit floats changed the
  numbers: -1.8 became -1.79999995).
- **Events** are returned as in TS *and* emitted as signals (`MissionRunner.stage_completed`,
  `JobRunner.job_event`, `Combat.combat_event`, `Wanted.raised/lowered/busted`, ...).
- **Random sources** are injected: a `SeededRandom` (kept alive by the rule that holds it) or a
  Callable. `Combat` defaults to `randf` as TS defaulted to `Math.random`.
- **TD-28 police crews** were game code mixed with rendering; they are now `PoliceFleet`, pure
  and tested (G-47). `Wanted.witnessed()` is the TS `Police.report` witness rule.
- **Content** is baked, not rebuilt in Godot (G-41): `buildContent` snaps every place to the real
  roads, kerbs and mapped places, which needs the road graph and POIs the Data agent is porting.

## Content rules kept
- Original only: invented gangs, names, films, jokes; no real business names on stops (the TS
  content already strips them; the baked table is its output).
- **Children are never targets.** The rules take whatever people the game hands them
  (`civilians` in `punch`/`shoot`, `Casualties`, enemy groups); in the TS game `Population`
  never puts children in the street crowd that can be hit, and `Fighters` never makes an enemy a
  child or teenager. The Godot cast and population must keep that guard (Cast agent): children
  only in station crowds and as passengers with an adult.

## Tests ported
| TS file (cases) | Ported | Godot file |
|---|---|---|
| missions: MissionRunner 6, chase 6, fares 13, jobs 15, reputation 1, shareAuto 13, life 22, stories 3, goods 9 | 88 / 88 | test_mission_runner, test_fares, test_jobs, test_share_auto, test_life, test_goods |
| combat: Combat 9 + `hurt` 1 (crash-ejection), Melee 21, Weapons 20, Gangs 12, PedestrianHits 10 | 73 / 73 | test_combat, test_melee, test_weapons, test_gangs, test_pedestrian_hits |
| Wanted 34 (police-tuning) + carjacking 1 | 35 / 35 | test_wanted |
| ai Carjack 10 | 10 / 10 | test_carjack |
| game-world clock 2, districts 5 | 7 / 7 | test_game_world |
| content 9, streetWar 10, laterStages 6, fareSpots 3 | 23 / 28 (13 in full, 10 without their map checks) | test_content |
| **Total** | **236 / 241** | 251 Godot cases (15 new) |

Not ported (need the world reader: districts, rail stations, chunk buildings, roads): streetWar
"played in the districts the briefs name"; laterStages "set where the briefs say" and "names
stations exactly where the railway has them"; fareSpots "stand on the pavement..." and "picks
the side the real place is on". The partial cases leave out only their on-road, in-district,
landmark and road-width assertions. Out of scope: `apps/game/src/goods.test.ts` (goods models
and carrying poses: Models), `vehicles/src/crash.test.ts` (crash thresholds: Vehicles phase 2),
`Strikes.test.ts` (superseded, G-45).

New Godot cases (15): SeededRandom equals the TS mulberry32 bit for bit; runner signals; content
loads; **every one of the 21 stages completes from its baked data** (a scripted player meets each
objective in turn and the money adds up); the save file (3); the TD-28 police crews (8: dead
officers stay dead and their car is abandoned, a lone survivor deploys alone, an abandoned car
doesn't count so a new unit comes, abandoned cars go when far and unseen, at most two kept and
the unseen one makes way, deploy conditions, witnessed rule, the heat numbers TD-28 documents).

## Wiring into the game (for later phases)
- Fixed step: `mission_runner.update(dt, status)`, `job_runner.update(dt, x, z, mode, speed)`,
  `combat.update(dt, player_state)`, `wanted.update(dt, seen, held, responding)`, with `dt` in game
  seconds; `DayClock.advance(dt)` gives `hour` for `JobRunner.available/accept` and `Life`.
- `CombatWorld.make(los, wall, solid)`: Callables over Jolt raycasts (`godot-physics`).
- Content: `GameContent.load_file()`; enemy groups: `combat.spawn_group(name, content.enemies[name])`.
- Save: `SaveStore.new().read()`, sections by the TS keys; `write()` after a stage, a job, sleep.
