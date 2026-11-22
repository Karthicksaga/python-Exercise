# Chennai Open World: stage 12 and stage 15 browser tests fail intermittently

Date: 22 Nov 2026 · Status: Proposed · Scope: `chennai-open-world` (`apps/game/tests/missions2.spec.ts`, combat)

## Summary
Two combat-stage browser tests fail now and then on the unchanged base branch, so they turn CI
red on unrelated pull requests:
- **Stage 12** (the racket at the tea shop): the shoot-out helper beats three of the four
  enemies, then the last one (armed with a pistol) stays at full health for 40+ rounds of
  firing from 6 m until the wait runs out.
- **Stage 15** (turf war at the clock tower): fails in CI on `feat/chennai-open-world` itself.

## Evidence
- `feat/chennai-open-world` at 973deed, untouched: stage 12 run three times locally,
  1 failed, 2 passed; log shows `racket round 5…15: standing pistol:100` (no damage).
- The same symptom on `agent/loading-screen` (1 of 3) and `agent/sound-design` (2 of 3).
- Stage 15 red on the base's own CI run 184 (shard 2), and on PR #13's runs.

## Recommendation
Find why the last pistol enemy takes no hits: likely the shot ray is blocked (the helper
probes for a clear line from 0.7 m off the enemy, but the player's own position, height or the
enemy's cover may differ), or the enemy stands where the camera's aim does not reach. Log the
shot ray's hit (what it struck) in the helper on failure. Fix the cause in the game or the
helper; do not loosen the assertions.

## Open questions
- Does the same happen to a player (an enemy that cannot be hit), or only to the test's aim?
