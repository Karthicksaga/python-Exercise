# Progress (Godot version)

Sections per agent; keep edits in your own section.

## Cast (people)

**23 Nov 2026: the phase-1 board (20) and the phase-2 board (60) built, rigged and tested.**
- [x] Blender pipeline: `tools/blender/characters.py` (from the Three.js version, extended),
  `cast_people.py` (the cast, one person per board figure), `cast_animation.py` (clips),
  `optimize_people.py`; `tools/build_people.sh` builds everything.
- [x] 20 phase-1 people, 10 men and 10 women, one per figure of `phase1-20-characters.webp`.
- [x] 60 people for `phase2-60-characters.webp`: the 20 plus 40 new, 30 men and 30 women;
  64 of the 74 board figures played (10 not cast yet, listed in `docs/characters.md`).
- [x] One shared 52-bone skeleton; LOD0 ≤ 10k triangles, LOD1 ≤ 3.5k, 512 px textures; five
  clips idle, walk, run (Mixamo, retargeted per person), sit, talk (authored).
- [x] Manifest `assets/people/people.json` (board figure, roles, clothing, LODs, licence, child flag).
- [x] Headless tests `tests/people/test_people.gd` (run with `tools/run_people_tests.sh`):
  manifest, shared skeleton, budgets, clips, soles on the ground in every clip and through
  gait blends (with `sole_plant.gd`), wrists, no vertex colours. All pass locally.
- [x] Review renders (Compatibility renderer, xvfb) and board side-by-side sheets looked at.
- [ ] Wiring into Foundation's test runner and CI (the coordinator, on merge).
- [ ] Props (bags, helmet, baskets, stick, bicycle), the 10 uncast phase-2 figures, the player.
- [ ] The game's use of them (pedestrians, drivers, crowds) is phase 3.
