# Assets and their licences

| File | What | Source | Licence / status |
|---|---|---|---|
| `models/player.glb` | Human character (player and pedestrians) | Ready Player Me sample avatar, as distributed with the three.js examples (`readyplayer.me.glb`) | **Development placeholder.** Ready Player Me avatars are not cleared for commercial release without their agreement. Replace before publishing |
| `animations/locomotion.glb` | Idle, walk and run clips | Extracted from the three.js example `Xbot.glb` (Mixamo animations) with `scripts/extract-animations.py` | Mixamo animations may be used in games royalty-free under Adobe's terms; check them before a commercial release |
| `fonts/noto-sans-tamil-signs.woff2` | Tamil text on the invented shop signboards (7 KB, embedded with `?inline`, TD-3) | Noto Sans Tamil Bold (v31, via `@fontsource/noto-sans-tamil` 5.3.0, file `noto-sans-tamil-tamil-700-normal.woff2`), cut to the 30 characters the signs use (plus their layout tables) with `pyftsubset <file> --text="<signGlyphs()>" --layout-features='*' --flavor=woff2` | SIL Open Font Licence 1.1, © 2022 The Noto Project Authors; licence text in `fonts/OFL.txt`. Re-cut it when the sign text in `packages/game-engine/src/shopSigns.ts` changes (a unit test lists the glyphs) |
| `osm/anna-nagar.osm.json` | Map extract | OpenStreetMap via Overpass API | ODbL 1.0, © OpenStreetMap contributors; see `osm/README.md` |

Vehicles, buildings, trees and all textures are generated in code and are original, including
the shop signboards: their words and names are invented (see `shopSigns.ts`), not real businesses.

## Replacing the character
Any rigged humanoid `.glb` with Mixamo-style bone names (`Hips`, `Spine`, `LeftArm`, `LeftUpLeg`…,
with or without the `mixamorig` prefix) works: put it at `models/player.glb`. The animations are
retargeted when the game loads (`packages/player/src/retarget.ts`), including the difference
between A-pose and T-pose rigs, so no re-export is needed. Clothing tints for pedestrians apply
to meshes whose names contain `Outfit`.
