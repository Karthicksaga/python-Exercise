# Handoff

## Rules (agent/godot-rules): where I left off
- **To wire on merge:** add `tests/rules/run_rules_tests.gd` to Foundation's test runner or CI
  (`godot --headless --audio-driver Dummy --path godot-chennai --script res://tests/rules/run_rules_tests.gd`,
  exit 1 on failure; also fail the step on `SCRIPT ERROR` in the log, as `tools/rules/run_tests.sh` does).
- **Class names to check for clashes** with other agents: `MissionData`, `MissionRunner`,
  `JobData`, `JobRunner`, `FareStop`, `GoodsStop`, `ShareShift`, `RouteLine`, `Chase`, `Life`,
  `StoryRunner`, `GameContent`, `SaveStore`, `Combat`, `CombatWorld`, `EnemySpot`, `Melee`,
  `Weapons`, `Arsenal`, `Gangs`, `PedestrianHits`, `Casualties`, `WeaponPickups`, `Wanted`,
  `PoliceFleet`, `Carjack`, `DayClock`, `DistrictIndex`, `VisitedDistricts`, `RulesMath`,
  `SeededRandom`. The clock is `DayClock` so it doesn't clash with a `GameClock` autoload. If the
  Data agent also ports `districts.ts`, keep one of the two.
- **Content is baked** (`src/missions/content/content.json`, G-41). Re-run
  `tools/rules/export_content.ts` (instructions in its header) when the world data or the TS
  content changes; once the Data agent's road reader exists, the placement in `content.ts` can be
  ported and the 5 map-checking content tests added.
- **Not done / weak:** the 5 map-dependent content tests; TD-28's numbers are still untuned by
  play (as in the TS game); the police cars' driving, search and spawn-point rules in `Police.ts`
  are game code with routing (`@cow/ai` Pursuit) and are not ported; crash thresholds
  (`vehicles/src/crash.ts`, TD-29) belong to the vehicles phase.
