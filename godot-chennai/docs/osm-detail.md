# OSM detail (format 2.2): what the game draws from what OpenStreetMap carries

Owner's direction: always stick with OpenStreetMap, and bring its nitty-gritty into the game, in
the same data-driven way as the infrastructure (`infra.bin`). Decisions G-190…G-195 in
`technical-decisions.md`; the file format is `world-format.md` §3.8; the reference writer is
`tools/geo/chennai_geo/detail.py`, the readers are `DetailTile` (data) and `DetailMeshes`,
`BuildingMeshes`, `ShopSigns` (drawing). Read this page for **how much of Chennai OSM actually maps**
(little, honestly) and what the renderer estimates for the rest.

## What is drawn, from which tags

| OSM | In the game | When OSM maps none |
|---|---|---|
| `building:colour`, `roof:colour` | the exact colour | wall: the colour of `building:material`, else the 12 plasters (or an area palette, G-194); roof: `roof:material`, else the kind's own colour |
| `building:material`, `roof:material` | brick, concrete, stone, glass, metal, wood walls; tile, metal, concrete, glass, thatch roofs | plaster facade, terracotta or grey roof |
| `roof:shape` | flat (parapet and water tank), gabled, hipped, pyramidal, skillion, dome (gambrel, mansard, saltbox, half-hipped, cone, round, onion map to the nearest) | today's rule: a third of low houses get a clay-tile hip roof; an area palette's `roof_types` weights |
| `building:levels`, `height` | storeys and height (as before) | 2 storeys, apartments 3 to 5, commercial 2 to 4 (hash) |
| `building:part`, `min_height`, `building:min_level` | parts drawn from `min_height` up; the host outline is not drawn when its parts cover 60 % | the host as one block |
| `shop`, `amenity`, `office`, `tourism`, `healthcare`, `religion` on a node, an area or a building | a signboard with the **category** word, Tamil above English (47 categories, `assets/city/sign_categories.json`); never the name | an everyday street shop picked by hash |
| `public_transport=platform` | a shelter (when none within 20 m) and a bus-stop pole at every shelter | none |
| `amenity=bench`, `waste_basket`, `drinking_water`, `post_box`, `toilets` | small models facing the nearest road | none |
| `man_made=street_lamp`, `highway=street_lamp` | the street-light pole; replaces generated poles within 14 m | generated poles every 38 m along main roads |
| `power=pole`, `power=tower` | a pole, a lattice tower | none |
| `barrier=wall`, `retaining_wall`, `fence`, `hedge`, `kerb`, `jersey_barrier`, `guard_rail`, `bollard`, `gate` | thin boxes (with colliders except kerbs), posts, gates | height 1.9 / 1.6 / 1.5 / 1.2 / 0.15 / 0.8 / 0.8 m when no `height` |
| `natural=tree_row` | a tree every 7 m | none |
| `railway=platform` | a 0.9 m slab, yellow edge line, shelter every 40 m | bus platforms 0.18 m |
| `leisure=pitch` + `sport` | marked ground with the sport's lines; cricket shows the pitch strip | a plain marked field |
| `leisure=playground`, `track`, `landuse=allotments` | rubber, clay, tilled-soil ground covers | none |
| `leisure=swimming_pool` | flat clear-aqua water with a paving rim (not swum yet) | none |

## Coverage (generated with the world: `world/DETAIL.md`)


## Buildings (what OSM maps vs what the renderer estimates)

| Field | Mapped | Estimated by the renderer |
|---|---|---|
| height or building:levels | 8,697 (2.2 %) | estimated storeys (2; apartments 3-5, commercial 2-4) x 3.1 m |
| building:colour | 147 (0.04 %) | hash into 12 plaster colours |
| building:material | 55 (0.01 %) | plaster (the facade picture) |
| roof:shape | 45 (0.01 %) | flat terrace with parapet and water tank; a third of low houses get a tiled hip roof (hash) |
| roof:colour | 166 (0.04 %) | terracotta for tiles, grey for terraces (hash) |
| roof:material | 2 (0.00 %) | from the roof shape |
| min_height | 2 (0.00 %) | from the ground |
| shop / amenity / office / tourism / religion category | 2,455 (0.63 %) | hash among everyday shop categories on the street walls |

Buildings drawn: 391,283. `building:part` polygons: 65 (26 with a height or levels, 0 with min_height); buildings replaced by their parts: 17.

## Street objects (nodes)

| Kind | Count |
|---|---|
| bus_platform | 1,139 |
| bench | 85 |
| waste_basket | 62 |
| drinking_water | 42 |
| post_box | 36 |
| toilets | 142 |
| street_lamp | 1,745 |
| power_pole | 1,968 |
| power_tower | 7,544 |
| bollard | 53 |
| gate | 10,195 |

Mapped bus stops (`highway=bus_stop`) are in `tile.json` `busStops` as before (shelters, G-56); `bus_platform` here adds the `public_transport=platform` nodes.

## Lines (barriers, tree rows, platforms)

| Kind | Ways | Length (km) | With mapped height |
|---|---|---|---|
| wall | 620 | 182.7 | 204 |
| fence | 175 | 38.6 | 42 |
| hedge | 31 | 5.7 | 0 |
| retaining_wall | 49 | 4.4 | 0 |
| kerb | 120 | 26.0 | 0 |
| jersey_barrier | 157 | 31.9 | 3 |
| tree_row | 130 | 51.7 | 0 |
| platform | 19 | 6.6 | 0 |
| guard_rail | 8 | 2.6 | 0 |
| bus_platform | 5 | 0.2 | 0 |

A drawn height of 0 in the file means not mapped: walls 1.9 m, fences 1.5 m, hedges 1.2 m, retaining walls 1.6 m, kerbs 0.15 m, jersey barriers 0.8 m (estimated).

## Zones

| Kind | Count |
|---|---|
| pitch | 352 |
| playground | 104 |
| swimming_pool | 360 |
| track | 14 |
| allotments | 0 |
| platform | 112 |
| bus_platform | 33 |

Pitches with the sport mapped: 297; without (drawn as a plain marked field, estimated): 55.

## Sign categories (shops, amenities, offices, tourism; buildings and nodes)

| Category | Tamil | English | Nodes and areas | Buildings |
|---|---|---|---|---|
| grocery | மளிகை | GROCERY | 212 | 21 |
| supermarket | பல்பொருள் அங்காடி | SUPERMARKET | 276 | 63 |
| bakery | பேக்கரி | BAKERY | 128 | 8 |
| sweets | இனிப்பகம் | SWEETS | 80 | 3 |
| tea | தேநீர் கடை | TEA SHOP | 41 | 3 |
| coffee | காபி கடை | COFFEE SHOP | 267 | 26 |
| restaurant | உணவகம் | RESTAURANT | 767 | 124 |
| snacks | சிற்றுண்டி | SNACKS | 359 | 26 |
| vegetables | காய்கறி | VEGETABLES | 62 | 6 |
| meat | இறைச்சி | MEAT | 33 | 2 |
| fish | மீன் கடை | FISH | 14 | 0 |
| flowers | பூக்கடை | FLOWERS | 7 | 0 |
| pharmacy | மருந்தகம் | PHARMACY | 328 | 18 |
| clinic | மருத்துவ நிலையம் | CLINIC | 738 | 12 |
| dental | பல் மருத்துவம் | DENTAL | 203 | 0 |
| hospital | மருத்துவமனை | HOSPITAL | 967 | 120 |
| bank | வங்கி | BANK | 467 | 79 |
| atm | ஏடிஎம் | ATM | 444 | 0 |
| textiles | ஜவுளி | TEXTILES | 594 | 33 |
| tailor | தையலகம் | TAILOR | 46 | 3 |
| jewellery | நகைக்கடை | JEWELLERY | 191 | 20 |
| footwear | காலணிகள் | FOOTWEAR | 138 | 7 |
| electronics | மின்னணுப் பொருட்கள் | ELECTRONICS | 251 | 23 |
| mobile | கைபேசி | MOBILE | 103 | 4 |
| hardware | வன்பொருள் | HARDWARE | 69 | 9 |
| furniture | மரச்சாமான்கள் | FURNITURE | 48 | 6 |
| stationery | எழுதுபொருள் | STATIONERY | 152 | 9 |
| books | புத்தகங்கள் | BOOKS | 34 | 4 |
| salon | அழகு நிலையம் | SALON | 153 | 7 |
| laundry | சலவை | LAUNDRY | 20 | 1 |
| petrol | பெட்ரோல் நிலையம் | PETROL | 319 | 7 |
| repair | வாகன பழுது | VEHICLE REPAIR | 180 | 26 |
| bus_stand | பேருந்து நிலையம் | BUS STAND | 122 | 10 |
| railway | ரயில் நிலையம் | RAILWAY STATION | 189 | 68 |
| school | பள்ளி | SCHOOL | 747 | 374 |
| college | கல்லூரி | COLLEGE | 287 | 291 |
| temple | கோயில் | TEMPLE | 584 | 306 |
| church | தேவாலயம் | CHURCH | 116 | 156 |
| mosque | பள்ளிவாசல் | MOSQUE | 52 | 42 |
| police | காவல் நிலையம் | POLICE | 96 | 32 |
| post | அஞ்சல் அலுவலகம் | POST OFFICE | 57 | 14 |
| library | நூலகம் | LIBRARY | 92 | 18 |
| cinema | திரையரங்கம் | CINEMA | 108 | 30 |
| lodge | தங்கும் விடுதி | LODGE | 365 | 197 |
| hall | திருமண மண்டபம் | MARRIAGE HALL | 114 | 54 |
| office | அலுவலகம் | OFFICE | 505 | 146 |
| shop | கடை | SHOP | 548 | 47 |

Public places with a `name:ta` or `name:en` kept for a name plate: 786. No other OSM name is stored (TD-18). 25 mapped places are themselves named with a category word ("Temple", "Tea Shop"): their sign says the same word because the table says it, not because of the name.

## Per tile

| Tile | Buildings | Parts | Objects | Line km | Zones | Signs |
|---|---|---|---|---|---|---|
| 0_0 | 9 | 0 | 0 | 0.0 | 0 | 1 |
| 1_0 | 2 | 0 | 0 | 0.0 | 0 | 2 |
| 0_1 | 3 | 0 | 21 | 0.0 | 0 | 3 |
| 1_1 | 9 | 0 | 53 | 0.0 | 0 | 1 |
| 3_1 | 5 | 0 | 0 | 0.0 | 0 | 1 |
| 4_1 | 7 | 0 | 1 | 0.4 | 0 | 0 |
| 0_2 | 4 | 0 | 99 | 0.0 | 0 | 0 |
| 1_2 | 47 | 0 | 453 | 1.7 | 0 | 12 |
| 2_2 | 75 | 0 | 83 | 2.5 | 6 | 36 |
| 3_2 | 4 | 0 | 0 | 0.0 | 0 | 6 |
| 4_2 | 15 | 0 | 2 | 0.3 | 0 | 7 |
| 0_3 | 47 | 0 | 82 | 0.0 | 5 | 12 |
| 1_3 | 36 | 0 | 218 | 0.0 | 0 | 13 |
| 2_3 | 172 | 0 | 472 | 17.6 | 0 | 13 |
| 3_3 | 188 | 0 | 419 | 5.2 | 9 | 41 |
| 4_3 | 374 | 0 | 120 | 0.0 | 0 | 7 |
| 0_4 | 9 | 0 | 146 | 0.0 | 0 | 3 |
| 1_4 | 254 | 0 | 556 | 2.9 | 2 | 20 |
| 2_4 | 3,456 | 3 | 1,461 | 36.8 | 7 | 52 |
| 3_4 | 1,763 | 2 | 960 | 8.1 | 1 | 138 |
| 4_4 | 1,857 | 0 | 9 | 1.7 | 1 | 9 |
| 0_5 | 72 | 0 | 205 | 21.1 | 0 | 46 |
| 1_5 | 4,546 | 0 | 732 | 10.1 | 18 | 144 |
| 2_5 | 71,408 | 4 | 3,708 | 61.7 | 80 | 1,081 |
| 3_5 | 54,540 | 19 | 1,829 | 35.0 | 132 | 2,895 |
| 0_6 | 463 | 0 | 624 | 8.6 | 16 | 89 |
| 1_6 | 9,991 | 0 | 759 | 20.1 | 10 | 196 |
| 2_6 | 87,539 | 4 | 1,848 | 24.7 | 62 | 2,231 |
| 3_6 | 41,105 | 19 | 1,911 | 30.5 | 136 | 2,308 |
| 0_7 | 266 | 0 | 311 | 7.7 | 0 | 29 |
| 1_7 | 17,616 | 0 | 654 | 25.3 | 28 | 522 |
| 2_7 | 62,524 | 1 | 1,603 | 8.4 | 27 | 1,434 |
| 3_7 | 18,230 | 0 | 742 | 3.0 | 224 | 296 |
| 0_8 | 339 | 12 | 238 | 1.8 | 9 | 48 |
| 1_8 | 4,184 | 1 | 339 | 5.4 | 23 | 195 |
| 2_8 | 5,475 | 0 | 824 | 7.6 | 45 | 185 |
| 3_8 | 2,661 | 0 | 268 | 3.7 | 105 | 136 |
| 0_9 | 745 | 0 | 430 | 0.0 | 10 | 81 |
| 1_9 | 13 | 0 | 355 | 0.0 | 0 | 6 |
| 2_9 | 1,122 | 0 | 366 | 1.8 | 14 | 49 |
| 3_9 | 25 | 0 | 16 | 0.3 | 0 | 9 |
| 0_10 | 81 | 0 | 5 | 0.0 | 4 | 100 |
| 1_10 | 0 | 0 | 46 | 0.0 | 0 | 0 |
| 2_10 | 0 | 0 | 43 | 2.4 | 1 | 2 |

## Cost (measured, G-195)

`tests/tools/city_shot.gd`, Compatibility on llvmpipe, 915 x 412, camera 9 m back and 3.2 m up,
the same world and tool on `ab3acba` (before) and on this branch (after); the machine was loaded
by other agents (load average 8 to 9), so the milliseconds are worse than a quiet run.

| Place | Draw calls | Primitives | Worst chunk build (worker) | Worst main-thread frame |
|---|---|---|---|---|
| T. Nagar (2599, 4803) | 40 / 40 | 140,064 / 140,920 (+0.6 %) | 584 / 673 ms | 0.28 / 0.23 ms |
| Mylapore (6444, 5682) | 51 / 51 | 149,900 / 151,160 (+0.8 %) | 533 / 590 ms | 0.21 / 0.21 ms |
| Marina (7895, 3891) | 22 / 22 | 27,824 / 28,116 (+1.0 %) | 513 / 596 ms | 0.24 / 0.22 ms |

No draw call is added: everything goes into the chunk's objects, ground and water surfaces. The
budget of 2.5 ms per frame on the main thread is not touched by this work (the chunk is built on a
worker, added in a few steps, G-51); the worst build is 10 to 16 % slower. The kit atlas is bigger
(1024 x 2368, about 26 MB with its glow partner and mipmaps uncompressed; was 1024 x 1024).

## Weak or not done

- Signs: the English line is small at street level (19 px of an 88 px board): Tamil reads first.
  Public place names (`name:ta`, `name:en`, 786 of them) are stored but no name plate is drawn.
  The estimated shop fronts still use a hash over everyday categories, so a street OSM does not
  map looks like a street of grocers, tea shops and textile shops.
- OSM maps very little of this in Chennai (table above), so on most streets the change is
  signboard words, walls, fences, platforms, pitches and poles; roofs and colours stay estimated
  until the area palettes (godot-areas) are merged.
- Walls are plain coloured boxes with a pilaster every 4 m, fences thin rails; no texture, no gates
  placed in walls (mapped gates are separate nodes), no wall caps or plaster damage.
- Railway platforms are 0.9 m high with no steps or ramps: the player cannot climb onto them.
  Platform lines have a fixed 3 m width. Tracks and trains are not part of this work.
- Pools are drawn flat on the ground without a rim wall, a ladder or swimming.
- Pitch lines assume a rectangular footprint (oriented bounding box); a round or irregular ground
  gets a rectangle's lines; stadiums over 4 ha get an outline only.
- Power towers are a lattice made of boxes (504 triangles); cables are not drawn.
- Seen only on llvmpipe (Compatibility), not on a phone or the Mobile renderer.
