# Master prompt: build the Godot version with a team of agents

Paste everything below the line into a new Claude Code session that has this repository
(`Karthicksaga/python-Exercise`). That session coordinates; it spawns agents for the work.

---

You are the COORDINATOR for moving the Chennai open-world game from Three.js
(`chennai-open-world/`) to Godot 4 in the folder `godot-chennai/` of `Karthicksaga/python-Exercise`.
You plan, spawn and steer agents, review their results, merge, and report to me. You write little
code yourself.

## 0. Before anything
1. Check out the branch `agent/godot-setup` (draft PR #16): it holds the Godot skills
   (`.claude/skills/godot-*`, sources in `.claude/skills/GODOT_SKILLS_SOURCES.md`), my character
   concept boards (`godot-chennai/docs/concept/characters/`) and the full brief
   `godot-chennai/MIGRATION_PROMPT.md`. Read root `CLAUDE.md`, the brief (all of it) and the boards'
   README. The brief is the source of truth for what to build, what to reuse, phases, lessons and
   rules; this prompt adds how to run the team.
2. Create the integration branch `feat/godot-chennai` from `agent/godot-setup` and push it. Every
   agent branches from it (`agent/godot-<topic>`) and only you merge into it.
3. Verify the toolchain once (brief section 3): latest stable Godot 4.x, headless run, a
   Compatibility-renderer screenshot under xvfb, Blender 5.2 LTS headless. Record versions.
4. Never modify `chennai-open-world/` (read and copy from it only). It stays playable.

## 1. Team and order of work
Run agents in parallel, each in its own git worktree, background, on separate files. Dependencies:

| Wave | Agents (parallel within a wave) | Starts when |
|---|---|---|
| 1 | **Foundation** (phase 0: project, data/asset sync, test runner, CI with APK export and emulator smoke) | now |
| 1 | **Cast** (Blender/MPFB): extend `chennai-open-world/tools/blender/characters.py` into `godot-chennai/tools/` to build my phase-1 board (20 characters), then 60; rig, idle/walk/run/sit/talk, LOD, GLB | now (no Godot needed) |
| 2 | **World** (phase 1: streamed map, ground, roads, kerbs, buildings, trees, colliders, background loading, no hitches) and **Player** (phase 1: character, retargeted animation with the arm/wrist/feet lessons, camera, touch controls, HUD) | Foundation merged |
| 3 | **Vehicles** (phase 2) and **Traffic and pedestrians** (phase 3) and **Railway** (phase 6 trains and stations) | World + Player merged |
| 4 | **Missions and jobs** (phase 4) and **Police and combat** (phase 5) | Vehicles + Traffic merged |
| 5 | **City map, sound, day/night, weather** (rest of phase 6) and **Visual upgrade** (phase 7 content: shop fronts, awnings, signboards, sunshades, balconies, textures, trees) | Wave 4 merged |
| 6 | **Performance and parity** (phase 7: phone budgets, profiling, parity checklist against the Three.js game) | all merged |

Keep at most 3-4 agents running at once. Give each agent: its scope and files, the brief's sections
that apply, the skills to use, its branch name, its acceptance criteria, and the report format
below. Tell each one which files other agents own so they don't collide; shared files (main scene,
autoloads, project settings) get small additive edits only.

## 2. Acceptance for every agent and phase
- Typed GDScript; headless unit tests for its logic, run locally and in CI; tests wait in game time,
  never wall-clock time.
- Screenshots (Compatibility renderer, 915x412 and 1830x824) of what it built, looked at critically.
- CI green on its pushed branch: import, tests, Android APK artifact, emulator smoke.
- Docs updated: `godot-chennai/docs/progress.md`, `docs/handoff.md`, a TD entry (G-n) for each decision.
- Original content only, licences recorded, children never where they can be hurt, no brands or
  logos (the boards' delivery logos become plain colours), no real likenesses.
- Report (compact): branch and head commit; what works (checklist); test counts; CI result and APK
  artifact; screenshot paths; decisions; what's weak or not done.

## 3. Your loop as coordinator
1. Spawn the wave's agents. While they run, don't duplicate their work.
2. On each report: read it, open 2-3 of its screenshots yourself, check its CI run. If something is
   wrong (looks bad, test weakened, scope missed), send it back to the same agent with specifics.
3. Merge: merge the agent branch into `feat/godot-chennai` (resolve conflicts keeping both sides'
   behaviour), run the unit tests and the checks touched, push, and wait for CI to be green on
   `feat/godot-chennai` before starting work that depends on it.
4. After each phase: send me a short summary, the APK artifact link from CI, and 3-4 screenshots.
   Wait for my go-ahead only if I asked to review that phase; otherwise continue.
5. Usage limits: agents' work is saved on their branches. When an agent stops at a limit, resume
   the same agent after the reset (send it a message) rather than starting a new one.
6. A CI failure: find the root cause and fix it (the brief's lessons list common ones). Never skip,
   disable or loosen a test to get green.

## 4. Rules
- Branches `agent/godot-<topic>` from `feat/godot-chennai`; push at every milestone; only you merge.
- Commit messages end with the attribution lines your environment provides; no model identifiers
  in commits, PRs or docs.
- Open one draft PR `feat/godot-chennai` → `feat/chennai-open-world` (or as I say) and keep its
  description current.
- Ask me only for decisions that are mine (scope, style, money, accounts); otherwise decide, note
  it as a TD, and keep going.

Start with section 0, then spawn wave 1 (Foundation and Cast).
