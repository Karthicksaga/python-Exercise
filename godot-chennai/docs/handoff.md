# Handoff (Godot version)

Sections per agent; add a dated entry at the end of your own section when you stop.

## Cast (people)

### 23 Nov 2026, cast agent (branch `agent/godot-cast`)
Where things are: `docs/characters.md` (everything about the people), decisions G-10 … G-19 in
`docs/technical-decisions.md`, licences in `assets/LICENSES.md` (People section).

For the coordinator / Foundation, on merge:
- Wire `tests/people/test_people.gd` into the test runner: it is a `SceneTree` script that quits
  with 1 on failure and reads `res://assets/people/`, so in the real project it runs as
  `godot --headless --path godot-chennai --script res://tests/people/test_people.gd`; it needs no
  import step (it parses the GLBs with `GLTFDocument`). About 15 s for 60 people.
- `assets/people/sole_plant.gd` is a run-time helper the character scenes should call after
  their AnimationTree each frame (move it to `entities/` if your layout prefers; update the
  test's preload path).
- After import, set the five clips to loop (import script or `.import` `_subresources`).
- Do not commit the `.godot/` folder; `.glb.import` files will appear next to the GLBs once the
  real project imports them, which is fine.

Rebuilding needs Blender 5.2, MPFB 2.0.18 and the MakeHuman packs (steps in
`docs/characters.md`); in this container they are at `/opt/tools/` with MPFB's data folder linked
to `/opt/tools/mpfb-data`.

Next: props and the 10 uncast figures; better faces (more face targets per person, women's faces
softer); the player model (richer budget); real-device check of the skinned look on the Mobile
renderer (only the Compatibility renderer could be judged here).
