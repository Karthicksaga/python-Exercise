# Roads: what a Tamil Nadu street looks like, and what the game draws (G-310 to G-313)

Owner's request: the roads looked flat and plain; build the details of real Chennai and Tamil
Nadu streets. This page is the reference notes, the sources, and how the detail is built.

## Owner-supplied reference photos (not redistributed)

Ten photographs the owner supplied, **owner-supplied reference photos, not redistributed** (kept in a
scratch folder outside the repository, viewed, never copied in):

- Good and rural roads: 1 a highway with black-white painted kerb blocks along the median side and
  palms; 2 a hill bend with chevron boards, a W-beam guardrail, a white-black kerb on the outside of
  the bend and a whitewashed retaining wall; 3 a rural road with dashed centre line and red-brown dust
  shoulder under a storm sky; 4 a lane lined with palmyra palms with an overhead line; 5 a curving
  forest road under a dense canopy.
- Worst roads: 6 and 8 a city street with a milled-off tar patch showing the grey base course, loose chips
  along its edge and wheel ruts; 7 a mud lane with a large muddy puddle; 9 an aerial hill hairpin road with a
  white-black kerb on the outer edge and thin edge lines; 10 a rubble lane with brick fragments and mud.

What they changed (G-314, G-315): a **rural class** for arterials in open country (a chunk with fewer than
30 buildings): no kerb, a 1.4 m red-brown dust shoulder, kerb blocks in black and white on the outside of
bends (turning 20 degrees or more), a W-beam barrier and chevron boards on sharper bends (34 degrees or more),
kilometre stones, rows of palmyra palms every 9 m; and a **condition** per road (good, worn, damaged, unpaved)
from the class, a hash of the way id and a hash of the 600 m square: damaged roads get large stripped-tar
patches, water-filled holes, wheel ruts, a soil lip along the edges and rubble; unpaved lanes are laterite mud with
ruts, puddles, brick and stone scatter and no kerb. Puddles are flat shiny ground polygons (one tile, shinier
after rain), not a reflection pass. The conditions' effect on vehicles (`RoadStyle.feel`: top speed,
bump, grip) is wired into the driven vehicle since G-450 (`RoadSurface`, `GroundFeel`, puddles splash).

## Reference research (honest status)

The Wikimedia Commons API answered (search, licence metadata), but **both image hosts
(`upload.wikimedia.org`, `thumb.wikimedia.org`) refused the downloads**: `thumb` is not allowed by
the session's network policy (HTTP 403) and `upload` answered HTTP 429 with `Retry-After: 600`, then
120, then 600 again, for the whole research window. **No Commons image was downloaded or viewed** (the owner's ten photographs above were).
What follows comes from the OpenStreetMap tags in the world files (`docs/osm-detail.md`) and from
general knowledge of the streets, so treat the colours and dimensions as estimates. The owner can
supply photos (any of the streets below); they would go in a scratch folder, never in the repository.

Candidate images found by the Commons search (licence as the API reports it; links only, nothing
copied into the repository). Re-fetch them when the host allows, view them, and tick off each
characteristic in the next section against them.

| Image | Licence | Author | Shows |
|---|---|---|---|
| [Porur Flyover](https://commons.wikimedia.org/wiki/File:Porur_Flyover.jpg) | CC BY-SA 4.0 | Samrocknroll94 | flyover, pillars |
| [Triplicane High Road](https://commons.wikimedia.org/wiki/File:Triplicane_High_Road_(244391773).jpeg) | CC BY 3.0 | Francisco Anzola | busy street, footpath |
| [Avenue, Coimbatore](https://commons.wikimedia.org/wiki/File:Avenue_GRD_CS_Coimbatore_Dec23_R16_07585.jpg) | CC BY-SA 4.0 | Timothy A. Gonsalves | tree-lined avenue |
| [Avenue of banyan trees, Srirangam](https://commons.wikimedia.org/wiki/File:Avenue_of_Banyan_Trees,_Srirangam_(Tamil_Nadu).jpg) | CC0 | Captain Linnaeus Tripe | banyan avenue (old photograph) |
| [VGP 1st Main Road, Uthandi](https://commons.wikimedia.org/wiki/File:VGP_1stMainRd_Uthandi_TN_Feb21_A7C_00136.jpg) | CC BY-SA 4.0 | Timothy A. Gonsalves | coastal lane, verge |
| [Diwali shopping, T. Nagar](https://commons.wikimedia.org/wiki/File:Diwali_Urban_Shopping,_Thiyagaraja_Nagar,_Chennai.jpg) | CC BY-SA 4.0 | Arunsarv | shop street, signboards |
| [Adampakkam](https://commons.wikimedia.org/wiki/File:Adampakkam,_Chennai.jpg) | CC BY-SA 4.0 | SnapMeUp | residential roads |
| [Zebra crossing at AU](https://commons.wikimedia.org/wiki/File:Zebra_crossing_at_AU.JPG) | CC BY-SA 3.0 | Surya Prakash.S.A. | zebra crossing |
| [Roadside shop](https://commons.wikimedia.org/wiki/File:Roadside_shop.JPG), [snacks](https://commons.wikimedia.org/wiki/File:Roadside_snacks.JPG) | CC BY-SA 3.0 | Surya Prakash.S.A. | roadside stalls |
| [Anna Salai](https://commons.wikimedia.org/wiki/File:Anna_Salai_Chennai.JPG), [shops](https://commons.wikimedia.org/wiki/File:Anna_Salai_shops.jpg), [view](https://commons.wikimedia.org/wiki/File:Anna_Salai_view.jpg) | public domain | L. Vivian Richard | arterial road |
| [Anna Salai, strada](https://commons.wikimedia.org/wiki/File:Chennai,_strada_anna_salai,_04.jpg) | CC BY 3.0 | Sailko | arterial road |
| [Central Square](https://commons.wikimedia.org/wiki/File:Central_Square_Chennai_Central_Station_Complex_Chennai_India.jpg) | CC BY-SA 4.0 | N. Vivekananthamoorthy | junction, flyover |

## What is characteristic (from knowledge, not yet checked against the photos)

- **Asphalt**: dark grey when fresh, pale and rough when worn; old roads carry black repair patches,
  crack networks and potholes near the edges and at drains; manhole covers in the lanes.
- **Paint**: white dashed centre and lane lines, solid white edge lines, often faded or worn away
  in pieces; yellow double lines on some undivided roads. Zebra crossings and stop lines at signalled
  junctions. Speed breakers painted in black and white or yellow and black bands.
- **Kerbs**: painted black and white (most streets) or yellow and black (main roads, medians).
- **Footpaths**: cement slabs or interlocking pavers, 1.5 to 2.5 m, some slabs broken or missing,
  drain covers; broken at every side-street mouth where the road is simply dusty.
- **Verge**: red-brown laterite dust beside the road where there is no footpath.
- **Medians**: raised kerbed strips (about 1 m) planted with shrubs, bougainvillea, small palms.
- **Drains**: open channels along lanes and residential streets.
- **Poles and wires**: street-light poles and concrete electric poles with overhead wires (not
  mapped in OSM beyond `man_made=street_lamp` and `power=pole`); wires sag between poles.
- **Trees**: rain tree (broad flat umbrella), neem (rounded dense crown), coconut and palmyra palms
  (tall slim), also banyan and tamarind in older avenues; many avenue trees wear a tree guard.
- Also seen but not built: roadside stalls and hoardings, flyover pillars under decks (decks exist,
  G-151), bus bays, Tamil-over-English road signs.

## What OSM maps and what is estimated

Mapped: highway class, width, lanes, one-way, bridge or tunnel and layer, mapped crossings and
traffic-calming (`infra.bin`, G-153), mapped street lamps and power poles (G-190). **Everything
else here is estimated**: surfaces and wear (hash of the way id), paint fade, kerb colours, footpath
widths by class, drains, manholes, patches and potholes, planted trees and species, poles of streets
that have none. `docs/osm-detail.md` says how little of this Chennai OSM maps.

## Road classes (`RoadStyle`, `src/game_world/city/road_style.gd`)

| Class | Which roads | Surface | Paint | Kerb / footpath | Trees and poles |
|---|---|---|---|---|---|
| arterial | primary, secondary, tertiary, motorway | tar, 30 % worn | dashes, lanes, faded edge lines (6.5 m and up), 35 % of undivided secondary and tertiary roads get double yellow | painted kerb (yellow-black on primary and half of secondary, else black-white), slab footpath 2.4 / 2.0 / 1.6 m, broken at junctions | data trees (re-shaped by species), tree guards on 1 in 4 near the edge, poles from the world builder with wires, shrubs on medians |
| residential | residential, unclassified, 4.4 m and wider | tar, 55 % worn, 22 % concrete | none (kept) | 1.2 m laterite verge, open drain on one side for half of the streets | neem, coconut, rain, palmyra every 15 m (55 % stand), poles every 30 m on one side for three streets in four, with wires |
| lane | service, narrower than 4.4 m | concrete 60 %, else worn tar | none | 0.7 m verge, drains | trees every 22 m (40 %) |
| flyover | any raised road | tar | as arterial (edge lines follow the ramp) | deck kerbs (G-151) | none |

Marks (manholes, repair patches on worn roads, potholes) are at distances fixed by the way id so
chunks agree. **Crossings**: one zebra and a stop line on each arm of every junction node (degree 3
or more) of an arterial 6 m or wider, set back from the node by half the widest road plus 2 m, skipped
when a mapped or signalised crossing is within 10 m.

## Street lights (G-316)

Five kinds from the owner's description of five lamp photographs (the files could not be saved): high mast at big
junctions, single-arm maroon pole on arterials and streets, twin-arm pole on medians, thin rural pole (country roads,
lanes, unpaved). Cool white-blue glow with a halo and a pool of light on the road, warmer on residential streets.

## How it is built (no new draw call)

- Ground atlas `ground.png` grew from 8 to 16 tiles: worn asphalt, concrete, footpath slabs, laterite,
  black-white kerb, dark iron and tar, yellow paint, faded paint (original, painted by
  `tools/bake_city_textures.gd --only=ground`; VRAM compressed like the rest). Layers 20 to 27.
  The shader (`ground.gdshader`) adds one octave of continuous noise to the road surfaces.
- Everything flat stays in the chunk's one ground surface; wires, shrubs and guards go into the one
  objects surface; trees were two MultiMeshes (the rain tree the neem mesh stretched wide and flat, the
  palmyra the coconut mesh stretched tall and slim). Since the tree kit (G-380..G-388, `docs/trees.md`) every
  species has its own model with three LODs; this module still chooses the species of the trees it plants
  (`WorldTree.species`, the weights in `RoadStyle`).
- All of it is built in `ChunkBuilder.build` on the worker thread. `RoadDetail` (plain data) plans a
  chunk; `GroundMeshes`, `RoadObjects` and `RoadModels` draw it.

## Cost

`tests/tools/city_shot.gd` (new `--no-roads` switch is the before), Compatibility on llvmpipe, 915 x 412,
camera 9 to 14 m back, the same world and tool; the machine was shared with other agents, so the
milliseconds are noisy and only the counts are exact.

| Place | Draw calls | Primitives | Worst chunk build (worker) | Worst main-thread frame |
|---|---|---|---|---|
| T. Nagar (`--place=t_nagar`) | 41 / 43 | 255,862 / 303,704 (+19 %) | 266 / 211 ms | 0.23 / 0.78 ms |
| Divided road (2709, 5624) | 35 / 35 | 248,925 / 280,417 (+13 %) | 736 / 772 ms | 0.22 / 0.88 ms |

Per chunk (`tests/unit/test_road_detail.gd::test_chunk_cost_budget`): the densest chunk keeps its 8
surfaces (6 before, 8 when planted trees appear); the extra T. Nagar draws are the tree MultiMeshes of
chunks that had no trees. The main-thread step is the same `add_child` as before: nothing is built
there (worst frame below the 2.5 ms budget in every run; the 0.78 and 0.88 ms are single frames under
load). Triangles are the cost: +13 to +19 % in view, from the trees (neem crown 132 triangles, was 92),
guards, shrubs and wires; the 300k frame budget is touched at T. Nagar (304k, was 256k).

## Weak or not done

- Only the owner's ten photographs were viewed (Commons blocked): everything else is from knowledge.
- Hill bends have no terrain: kerb blocks, barriers and chevrons follow the road's own curvature, rural chunks only. No whitewashed retaining wall, no forest canopy (trees are the two meshes), no motorbike riders on the road.
- Surface feel (`RoadStyle.feel`) drives the player's vehicle (G-450); traffic and parked vehicles ignore it; no barrier or chevron collider.
- Footpaths are 0.12 m high but have no collider: the player's feet sink into them as they do into the
  kerbs. Concrete panels' joints follow the world axes, not the road's direction.
- No flyover pillars beyond what decks already draw, no hoardings, stalls, bus bays or Tamil road
  signs; median railings were not built; tree guards and wires are small and thin at distance.
- Poles added on residential streets do not light up at night (the night lights read the world
  builder's poles). Seen only on llvmpipe, not on a phone.
