# Technical decisions

## Rules (G-40 to G-49, agent/godot-rules)

### G-40: Rules are typed RefCounted GDScript in the old packages' modules, stepped with game time
`src/missions`, `src/combat`, `src/ai`, `src/game_world` (pure helpers only), mirroring
`packages/missions`, `combat`, `ai`, `game-world` (owner's §9 decision). No autoloads, no nodes,
no scenes: every rule takes `dt` in game seconds and, where it needs it, the game hour from an
injected `DayClock`; nothing reads the wall clock. **Why:** the TS rules were pure and fully
unit-tested; keeping them pure keeps the tests exact and lets the game wire them freely.

### G-41: Content tables are baked to JSON from the TS game and loaded into typed classes
`tools/rules/export_content.ts` runs the TS `buildContent` on the same world files and writes
`src/missions/content/content.json` (format `chennai-rules-content`, version 1); `GameContent`
loads it into `MissionData`/`JobData`/`EnemySpot`. Not `.tres`: one diffable generated file, no
uid churn, and the numbers are the TS game's to the last digit. **Why not port `content.ts` now:**
it snaps every place to roads, kerbs, POIs and districts, which needs the Data agent's world
reader. **Revisit** when that reader lands: port the placement and the 5 map tests.

### G-42: Runners return events and emit signals
`update()` returns event Dictionaries in the TS shapes (tests compare them like the TS tests);
each is also emitted as a typed signal (`godot-signals-groups`), so HUD, sound and save listen
without references to the runner.

### G-43: One save file keyed by the Three.js game's localStorage keys
`user://chennai-save-v1.json`; top-level keys `cow-progress-v1` ({completed, money, life}),
`cow-jobs-v1`, `cow-weapons-v1`, `cow-districts-v1`, `cow-hour-v1`, `cow-weather-v1`, each with the
JSON the TS game stored, so a save can be imported 1:1. Written to a temporary file and renamed;
a missing or damaged file is a new game. **Why:** the same progress shape was asked for; one file
is one atomic write.

### G-44: Numbers are bit-faithful to the TS rules
Doubles everywhere (positions as `{x, z}` Dictionaries, never 32-bit `Vector2`), `Math.round`
as `floor(x + 0.5)` (`RulesMath.js_round`), stable sorts where TS sorted, and mulberry32 ported
bit for bit (`SeededRandom`, checked against node's output). **Why:** the ported tests assert the
TS numbers; a share auto shift replays the same crowd for the same save.

### G-45: Combat is the TD-27 redesign; TD-25 `Strikes.ts` is superseded
`feat/godot-chennai` has the TD-25 strikes (wind-up and wall-aware knock-back on the old
`Combat`); `agent/combat-redesign` (TD-27) branched before it and does the same jobs with its own
wind-up, stun and knock-back stopped by walls, plus block, dodge, combos and lock-on. Porting both
would give two wind-ups; TD-27 is the newer design the coordinator named. `Combat.hurt` (TD-29) is
added.

### G-46: The wanted level merges TD-28 and TD-30; TD-29 adds no crime
`Wanted` is `agent/police-tuning`'s rules (heat before stars, witnessed stars, police crews) plus
`agent/carjacking`'s `carjacking` crime (3 points, at least a star, every take counts).
`agent/crash-ejection` only adds crash damage (`Combat.hurt`); crashing into things is no crime.

### G-47: TD-28's police crews finished as a pure `PoliceFleet`
In the TS game the crew, abandoned-car and dispatch rules lived in `Police.ts` next to models and
routing, tested only in the browser. `PoliceFleet` holds them as data and rules (crew, out,
abandoned, the abandoned cap and which car makes way, deploy and recall conditions), using
`Wanted.crew_left`/`officers_to_deploy`; the game supplies sight and distances. 8 new tests.

### G-48: The rules tests have their own small headless runner
`tests/rules/run_rules_tests.gd` (a SceneTree script) runs every `test_*` method of
`tests/rules/test_*.gd`, counts checks, and exits 1 on a failed check or a test that dies;
`tools/rules/run_tests.sh` also fails on `SCRIPT ERROR` in the log and works without
Foundation's `project.godot` (throwaway copy). One GDScript case per TS `it`, same numbers.
To be wired into Foundation's runner on merge.

### G-49: Optional values are sentinels; names are snake_case; event names stay as in TS
`-1`, `""`, `{}` or `null` stand for TS `undefined` (documented per field). Methods and fields are
snake_case (GDScript style); event `type` strings and their keys keep the TS names so the game
logic reads the same as the TS game's.
