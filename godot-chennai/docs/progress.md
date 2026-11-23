# Progress

## Rules (agent/godot-rules, 23 Nov 2026)
- **Done:** typed GDScript ports of the missions package (stages runner, chase, fares, goods,
  city jobs, share auto, life, stories), the combat package (TD-27 combat with `hurt` from TD-29,
  weapons and arsenal, gangs, pedestrian hits and casualties, pickups), the wanted level with
  TD-28 heat before stars and the TD-30 carjacking crime, TD-28's police crew rules finished as
  `PoliceFleet`, the carjacking rules, the game clock and districts; the 21 stages, 13 city jobs,
  9 enemy groups, parking, gangs, crews and pickups as a baked JSON table; the save file.
- **Tests:** 251 cases (236 of 241 relevant TS cases ported, 15 new), all passing headless with
  Godot 4.7.2 (`tools/rules/run_tests.sh`); the runner was checked to exit 1 on a broken
  assertion and on a test that dies, and the log is scanned for script errors.
- **Details:** `docs/rules.md`; decisions G-40 to G-49.
