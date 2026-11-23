# Technical decisions (Godot version)

Numbered G-n. Ranges per agent: Foundation G-1 … G-9, Cast G-10 … G-19. Keep edits in your
own section.

## Cast (people), G-10 … G-19

### G-10: One GLB per person, both LODs on one skeleton, clips inside
Each person is `assets/people/<id>.glb`: a `Skeleton3D` with two skinned meshes, `Body` (LOD0,
at most 10,000 triangles) and `Body_LOD1` (at most 3,500), the same two materials (`Skin`,
`Outfit`, 512 px each) and an `AnimationPlayer` with five clips. The game shows one mesh at a
time by distance (`visibility_range_end`/`begin` at 30 m with a little hysteresis; the value is
in `people.json`, `lods[].until/from`). Why: one skeleton and one AnimationPlayer drive both
LODs (no second skeleton to keep in step), textures are stored once, and the LOD swap is a
visibility change. Cost: a far-only crowd still loads LOD0 (~0.3 MB of vertices per person).
The Three.js version used separate `_lod1.glb` files; the manifest records mesh names instead.

### G-11: Clips are baked per person in Blender, not retargeted at run time
idle, walk and run come from `chennai-open-world/assets/animations/locomotion.glb` (Mixamo, T-pose
rest) and are retargeted onto each person's own MPFB A-pose skeleton in
`tools/blender/cast_animation.py`, then exported with the person. Method: spine, neck, head and
legs take the source's world-space rotation away from its rest onto the target's own rest (both
rest upright); shoulders, arms, hands and fingers are first aligned with a **full frame** (bone
direction plus a second axis: palm index-to-pinky line for hands and fingers, forward for arms),
so wrists keep their twist (the Three.js version bent every wrist ~70° before this); upper arms
are then turned 9° in towards the body, and in idle the thighs 7° in (the Mixamo idle stands wide
on top of MakeHuman's open rest). Why bake: every person has different bone lengths and rest
angles; baking gives exact per-person clips and the game needs no retarget code. Cost: ~60 KB of
animation per file.

### G-12: Soles planted per frame when baking, and at run time during blends
Each baked frame moves the hips so the lowest sole vertex of the real mesh (shoes and sandals
included, skinned with its own weights) is at 0. A cross-fade between two planted clips still
dips a sole up to 7.7 cm (measured: worst over the cast), so `assets/people/sole_plant.gd`
re-plants at run time from up to 96 sole vertices (call `apply()` after the animation update;
near people only). Tested: soles within 1.3 cm of the ground in every clip and through 0.22 s
blends between idle, walk, run and talk.

### G-13: sit and talk are authored by script
No CC0 sit/talk clips were available offline; both are written in `cast_animation.py` from the
retargeted idle pose: sit (thighs forward, shins down, hands towards the thighs, slow breathing,
4 s loop) and talk (idle twice over, right-hand beats, left hand joining, nods and a head turn,
5 s loop). Original work, CC0. `seatHeightM` in the manifest gives the seat height under each
person's hips for benches and vehicle seats.

### G-14: No vertex colours anywhere
MPFB meshes carry a black vertex-colour channel; the exporter drops all colour attributes
(`export_vertex_color="NONE"`) and the tests check that no surface has `ARRAY_COLOR` and no
material has `vertex_color_use_as_albedo`.

### G-15: Plain float geometry, WebP textures
Godot 4.7.2 refuses `EXT_meshopt_compression` and `KHR_mesh_quantization` (checked headless:
"required extension … is not supported"), so the Three.js pipeline's meshopt step cannot be
used. `tools/blender/optimize_people.py` runs glTF Transform dedup, prune, resample and WebP
(quality 85; Godot reads `EXT_texture_webp`). About 0.9 MB per person, 55.3 MB for the 60; Godot recompresses
textures to ETC2/ASTC on import for Android.

### G-16: People tests read GLBs with GLTFDocument at run time
`tests/people/test_people.gd` loads each file with `GLTFDocument.append_from_file` (the
importer's own parser, same `mixamorig_X` bone names), so it needs no `--import` step and runs in
a throwaway project (`tools/run_people_tests.sh`) or in Foundation's project unchanged (it reads
`res://assets/people/`). All timing is game time: clips are sampled with `seek()`, blends advanced
with `AnimationPlayer.advance()`.

### G-17: The boards are the casting list; 60 people for 74 board figures
Phase 1: one person per figure of `phase1-20-characters.webp` (20). Phase 2: the 60 board shows
74 figures (two couples, more men than women) under "30 Male + 30 Female". The 20 phase-1 people
play their matching phase-2 figures (`alsoFigures` in the manifest), 40 new people play most of
the rest, four figures drawn as men are cast as women to reach 30 + 30 (Doctor, Teacher, Bank
Employee, Sanitation Worker; `note` says so), and ten figures are not cast yet (listed in
`docs/characters.md`). Every manifest entry records board, figure id and label.

### G-18: Children are marked and kept out of harm by data
`age: "child"` (under 13) and `child: true`; their roles are limited to `school`, `passenger`,
`family` (checked by the tests). The game must never cast a child as a street pedestrian, enemy,
driver or anyone who can be hit; teens likewise stay out of combat casting (rule carried over
from the Three.js `CASTS`).

### G-19: One shared skeleton, MPFB `mixamo`, A-pose rest
52 bones, Godot names `mixamorig_<Bone>` (the importer turns `:` into `_`), identical names and
hierarchy in all 60 files (tested). Rest pose MakeHuman A-pose, metres, soles at y = 0, facing
glTF +Z. Clips from elsewhere must be retargeted to this rest (or baked by the Blender script).
