# Assets and their licences

| File | What | Source | Licence / status |
|---|---|---|---|
| `models/player.glb` | Human character (player and pedestrians) | Ready Player Me sample avatar, as distributed with the three.js examples (`readyplayer.me.glb`) | **Development placeholder.** Ready Player Me avatars are not cleared for commercial release without their agreement. Replace before publishing |
| `animations/locomotion.glb` | Idle, walk and run clips | Extracted from the three.js example `Xbot.glb` (Mixamo animations) with `scripts/extract-animations.py` | Mixamo animations may be used in games royalty-free under Adobe's terms; check them before a commercial release |
| `osm/anna-nagar.osm.json` | Map extract | OpenStreetMap via Overpass API | ODbL 1.0, © OpenStreetMap contributors; see `osm/README.md` |

| `models/props/*.glb` | Street props: barrel, crates, clay pots, AC unit, dish antenna, awning, rolling shutter (`ShutterOpen` clip), vegetable handcart (`Roll` clip) | Original, made by `tools/blender/street_props.py` in Blender 5.2 LTS (`npm run blender:props`) | Original work for this project |
| `optimized/*.glb` | What the game embeds: the two files above after `npm run optimize:assets` (blend shapes dropped, textures 512 px WebP, meshopt-compressed geometry) | Generated from the sources above | Same licences as their sources |

Vehicles, buildings, trees and all textures are generated in code and are original.

## Optimising
`npm run optimize:assets` (`scripts/optimize-assets.mjs`, glTF Transform 4.5, MIT; meshoptimizer,
MIT; sharp, Apache 2.0) rewrites every `models/*.glb` and `animations/*.glb` into `optimized/`.
16 Nov 2026: player 1,796 KB → 484 KB, locomotion 189 KB → 123 KB; the game script went from
7.9 MB to 6.1 MB. Run it after changing any model and commit both the source and the output.

## Replacing the character
Any rigged humanoid `.glb` with Mixamo-style bone names (`Hips`, `Spine`, `LeftArm`, `LeftUpLeg`…,
with or without the `mixamorig` prefix) works: put it at `models/player.glb` and run `npm run optimize:assets`. The animations are
retargeted when the game loads (`packages/player/src/retarget.ts`), including the difference
between A-pose and T-pose rigs, so no re-export is needed. Clothing tints for pedestrians apply
to meshes whose names contain `Outfit`.

## Blender (build tool only)
`tools/blender/*.py` are Blender Python scripts: the script is the source of each model, so
`npm run blender:props` rebuilds the same files. It needs Blender 5.2 LTS on the build machine
(download the Linux, macOS or Windows build from blender.org; set `BLENDER` to the `blender`
binary if it is not on the PATH). It runs headless (`blender -b`). The game never needs Blender.
`tools/blender/preview_animation.py` renders a short Cycles preview of the props' animations.
After changing props, run `npm run optimize:assets` and commit both folders.
