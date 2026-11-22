# Assets and their licences

| File | What | Source | Licence / status |
|---|---|---|---|
| `models/player.glb` | The player: a Chennai man of about 32 (light blue cotton shirt, dark trousers, sandals, moustache), 29,092 triangles, 2 materials (skin and outfit atlas, 1024 px), 52-bone MPFB `mixamo` skeleton | Original, made by `tools/blender/characters.py` (`npm run blender:characters`) with MPFB from MakeHuman CC0 assets; see `docs/characters.md` | CC0 MakeHuman assets; garment recolouring, painted moustache and sandals are original work. Replaces the earlier Ready Player Me placeholder, which is no longer used |
| `models/people/<id>.glb`, `<id>_lod1.glb`, `people.json` | The Chennai cast: 37 pedestrians (men, women and children, everyday dress and work roles), each at most 10k triangles (512 px) with an LOD1 of at most 3.5k on the same 52-bone skeleton; `people.json` lists sex, age group, roles, height and triangle counts. Table in `docs/characters.md` | Original, made by `tools/blender/characters.py` with MPFB | MakeHuman assets, CC0 except one **CC-BY** garment: `elvs_male_athletic_tank1` (banian vest) by Elvaerwyn, MakeHuman community asset repository (pack shirts03). Garments modelled in code, patterns, skin tones and facial hair are original. The older `elder`, `lungi`, `tshirt`, `worker` files are superseded and kept only until the game stops importing them |
| `animations/locomotion.glb` | Idle, walk and run clips | Extracted from the three.js example `Xbot.glb` (Mixamo animations) with `scripts/extract-animations.py` | Mixamo animations may be used in games royalty-free under Adobe's terms; check them before a commercial release |
| `fonts/noto-sans-tamil-signs.woff2` | Tamil text on the invented shop signboards (7 KB, embedded with `?inline`, TD-3) | Noto Sans Tamil Bold (v31, via `@fontsource/noto-sans-tamil` 5.3.0, file `noto-sans-tamil-tamil-700-normal.woff2`), cut to the 30 characters the signs use (plus their layout tables) with `pyftsubset <file> --text="<signGlyphs()>" --layout-features='*' --flavor=woff2` | SIL Open Font Licence 1.1, © 2022 The Noto Project Authors; licence text in `fonts/OFL.txt`. Re-cut it when the sign text in `packages/game-engine/src/shopSigns.ts` changes (a unit test lists the glyphs) |
| `osm/anna-nagar.osm.json` | Map extract | OpenStreetMap via Overpass API | ODbL 1.0, © OpenStreetMap contributors; see `osm/README.md` |

| `models/props/*.glb` | Street props: barrel, crates, clay pots, AC unit, dish antenna, awning, rolling shutter (`ShutterOpen` clip), vegetable handcart (`Roll` clip) | Original, made by `tools/blender/street_props.py` in Blender 5.2 LTS (`npm run blender:props`) | Original work for this project |
| `models/vehicles/auto_rickshaw.glb`, `auto_rickshaw_lod1.glb` | Auto-rickshaw (detailed 16k triangles; traffic 12k), wheels as separate nodes | Original, made by `tools/blender/auto_rickshaw.py` in Blender 5.2 LTS (`npm run blender:auto`) | Original work for this project. Not used by the game yet (awaiting review) |
| `optimized/*.glb` | What the game embeds: the models above after `npm run optimize:assets` (blend shapes dropped, textures 512 px WebP (the player's 1024 px, people LOD1 128 px), meshopt-compressed geometry) | Generated from the sources above | Same licences as their sources |

Vehicles, buildings, trees and all textures are generated in code and are original, including
the shop signboards: their words and names are invented (see `shopSigns.ts`), not real businesses.

## Optimising
`npm run optimize:assets` (`scripts/optimize-assets.mjs`, glTF Transform 4.5, MIT; meshoptimizer,
MIT; sharp, Apache 2.0) rewrites every `models/*.glb` and `animations/*.glb` into `optimized/` (and `models/props`, `models/vehicles`,
`models/people` into the folders of the same name). 17 Nov 2026, MPFB characters: player 2,798 KB → 351 KB;
elder 920 → 185 KB, lungi 986 → 161 KB, tshirt 808 → 148 KB, worker 889 → 162 KB.
22 Nov 2026, the full cast: 37 people, LOD0 + LOD1, 6,824 KB optimised (meshopt "high" for people); player 354 KB.
16 Nov 2026: player 1,796 KB → 484 KB, locomotion 189 KB → 123 KB; the game script went from
7.9 MB to 6.1 MB. Run it after changing any model and commit both the source and the output.

## Characters (player and pedestrians)
The full description (cast, garments, every MakeHuman asset and its licence, toolchain, rebuild steps) is in
`docs/characters.md`; the notes below are the short version.

`tools/blender/characters.py` builds the player and the whole cast in Blender 5.2 LTS with **MPFB 2.0.18**
(MakeHuman for Blender) through its Python API (`HumanService.deserialize_from_dict`, the same
path as loading a human preset), then bakes, dresses, joins and exports them. Nothing is edited
by hand; the script is the source.

| Tool / data | Version, where from | Licence |
|---|---|---|
| MPFB (Blender extension, build tool only, not shipped) | 2.0.18, `https://extensions.blender.org/download/sha256:c075b3e9b94b8e5556a5f03f4653602d02ea306de08126e8f55ed6dee28a2dad/add-on-mpfb-v2.0.18.zip` (sha256 of the zip checked: `c075b3e9…2dad`) | GPL-3.0-or-later (program code; the manifest says so). Characters it makes are not covered by the GPL |
| MakeHuman system assets (base mesh, targets, skins, eyes, eyebrows, eyelashes, hair, clothes, proxies) | `makehuman_system_assets_cc0.zip`, 280,737,770 bytes, sha256 `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`, from `https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip` (listed on `http://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html`) | **CC0**: every asset on that page is marked CC0, and each file's header says it "was explicitly released as CC0 in september 2020" (© Data Collection AB, Joel Palmius, Jonas Hauquier). The MPFB extension's own base mesh and targets carry the same CC0 release |

Used assets: skins `young_african_male`, `young_caucasian_male`, `middleage_caucasian_male`,
`old_african_male`, `old_caucasian_male` (blended pairwise to South Indian brown tones); clothes
`male_casualsuit01`, `male_casualsuit03`, `male_casualsuit04`, `male_casualsuit06`, `shoes06`
(recoloured; the printed MakeHuman logo on two T-shirts is painted out); hair `short02`,
`short04`; eyebrows `eyebrow001`; eyelashes `eyelashes01`; eyes `low-poly`; proxy `male1591`
(pedestrians' low-poly body); rig `mixamo` (built into MPFB). Made in the script: the skin
blends and tone, a painted moustache, the lungi (cloth tube with a woven-check texture) and the
sandals (soles and straps cut from the body's own feet).

**How to rebuild the characters**
1. Install Blender 5.2 LTS. Install the MPFB 2.0.18 extension from the zip above (Blender:
   Edit › Preferences › Get Extensions › Install from Disk, or headless
   `blender -b --python-expr "import bpy; bpy.ops.extensions.package_install_files(filepath='add-on-mpfb-v2.0.18.zip', repo='user_default', enable_on_install=True)"`).
2. Unzip `makehuman_system_assets_cc0.zip` into MPFB's user data folder
   (`~/.config/blender/5.2/extensions/.user/user_default/mpfb/data` on Linux; MPFB's
   "Load pack from zip" button does the same).
3. `BLENDER=/path/to/blender npm run blender:characters` (about 30 s), then
   `npm run optimize:assets`. Commit `models/` and `optimized/`.
To change a person, edit `CHARACTERS` in the script (phenotype, skin blend, clothes, colours).
The game loads `player.glb` plus the variants listed in `apps/game/src/Game.ts`; variant 1
(`elder`) also drives the autos in a khaki tint (`Population.ts`).

Any other rigged humanoid `.glb` with Mixamo-style bone names (`Hips`, `LeftArm`… with or
without a `mixamorig`/`mixamorig:` prefix) also works: the names are normalised and the
animations retargeted when the game loads (`packages/player/src/retarget.ts`), A-pose or T-pose.
Clothing tints apply to the `Outfit` material (and to meshes whose names contain `Outfit`).

## Blender (build tool only)
`tools/blender/*.py` are Blender Python scripts: the script is the source of each model, so
`npm run blender:props` rebuilds the same files. It needs Blender 5.2 LTS on the build machine
(download the Linux, macOS or Windows build from blender.org; set `BLENDER` to the `blender`
binary if it is not on the PATH). It runs headless (`blender -b`). The game never needs Blender.
`tools/blender/preview_animation.py` renders a short Cycles preview of the props' animations.
After changing props, run `npm run optimize:assets` and commit both folders.
