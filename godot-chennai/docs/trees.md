# Trees: the kit, where it grows, what it costs (G-380 to G-389)

Owner request (phase 7): "trees need improvement". Photographs the owner supplied (palmyra rows, rain
trees leaning over a road, a hill road under forest canopy, coconut palms, dry scrub, laterite verges) are
looked at, never copied into the repository. What they showed, and what the kit does about it:

| In the photographs | In the kit |
|---|---|
| Palmyra: a tall, slim, straight trunk with a round head of stiff green fans and a skirt of dry brown fronds, planted in rows beside a narrow road | `palmyra`: 11 m trunk, 15 fan cards, nine hanging dry fans; rows come from the roads work (`RoadStyle`, G-312) |
| Rain tree: very wide, flat, yellow-green crown, a short trunk with heavy limbs, leaning over the carriageway | `rain`: 24 m outline, five limbs, feathery cards; leans towards the road beside it (up to about 9 degrees) |
| Hill road: tall straight trunks, dark dense crowns, an overhanging canopy | `peepal`, `mango`, `tamarind`, `banyan` (dark broad cards, aerial roots) |
| Coconut palms: curved trunks, drooping fronds | `coconut`: curved trunk, 12 arched frond strips, nuts under the crown |
| Dry scrub, bare and dead trees, tan grass beside the road | `scrub`, `grass_tuft`, `dead_bare`, `dead_snag`, `dead_palm`; commoner in the country palette |

## The kit

Eighteen species, three LODs each, in `src/game_engine/trees/`:

| Group | Species |
|---|---|
| Trees (10) | `neem`, `rain` (rain tree), `banyan`, `tamarind`, `gulmohar` (flame tree, red blossom cards), `coconut`, `palmyra`, `mango`, `peepal`, `casuarina` |
| Bushes and grass (5) | `oleander`, `bougainvillea` (magenta), `croton`, `grass_tuft`, `scrub` |
| Dead wood (3) | `dead_bare` (leafless, branching), `dead_snag` (broken trunk), `dead_palm` (bare trunk, dry fronds) |

Models are built **in code** (`TreeModels`): a few tapered tubes for trunks and limbs and alpha-cut
**leaf cards** over an ellipsoid shell for a crown, palms from arched frond strips and fan cards. They are plain
packed arrays, built on a worker in about 6 ms, deterministic (seeded by the species name), so there is nothing
to import and nothing to licence. Blender was not needed (G-380).

Triangles per LOD (the budget test holds `TreeModels.BUDGET`; the numbers below are the measured ones):

| | LOD 0 | LOD 1 | LOD 2 |
|---|---|---|---|
| neem, mango, tamarind, peepal, gulmohar | 215 to 240 | 57 to 65 | 21 to 23 |
| rain tree | 271 | 65 | 23 |
| banyan (with aerial roots) | 316 | 87 | 25 |
| coconut, palmyra | 160, 126 | 60, 54 | 21 |
| casuarina | about 170 | about 60 | about 24 |
| bushes | 12 to 18 | 6 to 8 | 4 |
| grass, scrub | 8 | 4 | 2 |
| dead trees | 66 to 186 | 28 to 62 | 9 to 15 |

## One atlas, one material

`assets/trees/tree_atlas.png` is **one** 1024 x 512 RGBA texture holding every leaf card, frond, blossom and the
bark. `tools/trees/bake_tree_atlas.py` paints it with Pillow (drawn shapes, no photographs, no third-party
art: CC0, row in `assets/LICENSES.md`) and writes `assets/trees/atlas_layout.json`, the tile rectangles that
`TreeAtlas` reads. It is imported **VRAM-compressed with mip maps** (ETC2 / ASTC on Android, S3TC on desktop):
about 0.7 MB in video memory, limit 1.5 MB (`TreeAtlas.BUDGET_BYTES`, tested). `assets/trees/*.json` is in the
export presets' include filter (without it the APK would lack the layout).

`trees.gdshader` is the only material (`CityMaterials.trees`): alpha-cut (no sorting, no blending), both sides
shaded the same from the crown's normals, tinted per instance by the MultiMesh colour, with the **wind in the
vertex stage**: a slow sway of the crown plus a quick small flutter, growing with the vertex's wind level
squared and the tree's own scale, phase from the instance's position. The level (0 to 8) rides in the integer
part of `UV.x / 2` (the same trick as the ground shader's layer: vertex colours and UV2 were not reliable under
the Compatibility renderer). Trunks are level 0, leaf tips 8. `sway` is a uniform: 0 on Low.

## Where each species grows (`TreeStyle`, `TreePlan`)

The chunk files give a tree's position, size and whether OpenStreetMap mapped it (`natural=tree`, tree
rows); there is **no species or leaf-type tag and no landuse=forest** in them (areas are park, water, beach).
So the species is estimated, with a hash of the position (`CityHash.tree_unit`), the same every time a chunk
loads:

1. A species the roads work already chose (palmyra rows, rain and neem avenues, `WorldTree.species`) stays.
2. Otherwise the weights come from the place: the district's palette (`data/areas/palettes.json` boundary
   circles and corridors, mapped to `urban`, `leafy`, `dense`, `coastal`, `rural`), replaced by the park or beach
   under the tree, or the avenue profile beside a main road; a chunk with under 30 buildings is `rural`; a mapped
   `natural=tree` boosts the old large species (banyan, peepal, rain tree, tamarind).
3. About one tree in six to three gets a bush or tuft beside it (park 55 %, leafy and country 30 %, dense old
   city 8 %); bougainvillea stands against some building walls; open country gets scrub on a jittered grid.
4. At most 7 tree species and 3 understory species a chunk: rarer ones take the species of a commoner one of the
   same kind (draw calls).
5. Nothing stands inside a building, on a carriageway (half the road width plus 0.55 m), in water, through a
   deck, or within 3.4 m of a railway track (`ChunkBuilder.Kit.rail_index`; the railway sets it when it is built and
   `CityWorld.set_rail_index` prunes the chunks already in the scene).
6. Rain trees and palms beside a road lean towards it; every plant has its own size, yaw and tint; the dry
   country tints leaves yellower.

## Per chunk: `TreeBatch`

One `TreeBatch` per chunk (node `Trees` under the chunk's view): per species three `MultiMeshInstance3D`, one per
LOD mesh, instance count = the species' plants, `visible_instance_count` = those at that LOD. The instances are
sorted by distance from the camera (`TreeLod.pick`, hysteresis 3 m, no cross-fade: the swap is one frame and the
three LODs are built to look alike) about four times a second, and only when the camera moved 1.5 m or the quality
changed; a sort that changed something is a few slices and one buffer upload per species. The first sort runs on
the worker (the streamer passes the camera's place), so adding a chunk costs the main thread no sorting.

- **Draw calls:** one per LOD in use, at most **two per species** (when all three LODs would be in use the far
  instances take the middle mesh, `TreeLod.limit_meshes`). Far chunks draw one per species.
- **Shadows:** only LOD 0, and only on High (`TreeQuality.shadows`).
- Statistics: `Build.triangles["trees"]`, `["palms"]` (LOD 0 of the chunk), `detail["tree_species"]`,
  `detail["tree_instances"]`; colliders are boxes for trees, palms and dead trunks only (radius from the species).

## Quality presets (`QualitySettings.TABLE`, `TreeQuality`)

| | Low | Medium | High |
|---|---|---|---|
| Trees kept (`tree_density`) / bushes and grass kept (`scrub_density`) | 55 % / 30 % | 80 % / 65 % | 100 % / 100 % |
| LOD 0 within / LOD 1 within / drawn to (`tree_lod0`, `tree_lod1`, `tree_far`) | 22 / 75 / 180 m | 32 / 105 / 250 m | 45 / 140 / 340 m |
| Wind (`tree_sway`) | off | on | on |
| Shadows from LOD 0 (`tree_shadows`) | off | off | on |

Bushes and grass are drawn only within 45 % of the preset's far distance (and their own 70 to 110 m).
Density is a rank per plant (a hash), so the plants kept on Low are also kept on Medium and High and a preset
change is live.

## Measured (same harness, same places)

See the table in `docs/handoff.md` (Trees section) for the numbers of the run that closed the branch.

## Not done, weak

- Species are estimated, not mapped (no tag in the data); forests and hills have no landuse in the files, so a
  hill road gets the city mix unless its district palette says `rural`.
- No impostors beyond LOD 2 (a few cards each); no cross-fade (a LOD swap pops, at 45 m and more).
- Wind is a vertex sway only: no gust map, no interaction with the player or vehicles.
- The atlas is drawn by script: crisp but stylised next to the photographs; no real leaf scans.
- Seen only under the Compatibility renderer on llvmpipe, not on a phone.
