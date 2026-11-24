# Landmarks

How the Chennai landmarks are researched, specified, modelled and placed (decisions G-180 to
G-189), and every reference used, with its licence. OpenStreetMap is the only geometry source
(positions, footprints, heights, tags; © OpenStreetMap contributors, ODbL 1.0, extract of
23 Nov 2026). Photos are **modelling references only**: they are listed here and in each spec,
looked at in a scratch folder outside the repository, and never committed. A photo may become a
texture only if it is CC0 or public domain; none is used as a texture today. No Google imagery or
3D tiles are used.

## Pipeline

1. **Choose** (`tools/geo`, G-180): `python -m chennai_geo.cli landmarks-rank` reads the clipped
   Tamil Nadu PBF and ranks OSM objects inside the world that carry `wikidata`/`wikipedia` or are
   landmark kinds (attraction, museum, historic, place of worship, station, lighthouse, tower,
   temple/church/mosque/stadium/civic/government/university/hospital buildings). Places,
   boundaries, roads, water, land use and businesses (`brand`, `shop`, hotels) are not candidates.
   A station or temple node inside a polygon of the same kind joins it; objects with the same
   `wikidata` merge. Output: `data/landmarks/candidates.json` and `data/landmarks/COVERAGE.md`.
2. **Specify** (G-181): `assets/landmarks/<id>/spec.json` names the OSM parts; `python -m
   chennai_geo.cli landmark-osm` fills their footprints (world metres), tags, rectangles, the
   landmark's origin and yaw from the PBF. The rest is written by hand from research: names in
   Tamil and English with their sources, height (OSM tag first, else researched, with the
   alternatives and why one was chosen), style, colours, materials, facts with source URLs,
   reference photos with author and licence, the kit and its parameters, triangle budget, LOD
   distances, collision plan, what is estimated.
3. **Model** (G-183, G-184): `tools/blender/landmarks/build_all.sh` runs each kit script
   (`gopuram_complex`, `colonial_clocktower`, `station`, `tower`, `lighthouse`, `mall`) in Blender 5.2 on every spec
   naming it, writes `<id>.glb` (`LOD0`, `LOD1`, `LOD2` meshes, vertex-coloured, plus `COL_*`
   boxes) and `build.json` (hashes of the spec and the GLB, triangle counts), builds everything
   twice and fails if the bytes differ.
4. **Place** (G-185): `CityWorld` loads the specs (`LandmarkSpec.load_all`, from `index.json`)
   and builds each model on a worker thread (`LandmarkModels.build`): placed at the spec origin
   in world orientation, LODs by visibility range, one shared vertex-coloured material,
   collision as Jolt boxes, real public names only on signs. `ChunkBuilder` leaves out every OSM
   building whose centroid lies in a landmark's exclude outline (the world builder does the same
   when the world is rebuilt).
5. **Check** (`tests/unit/test_landmarks.gd`, `tools/geo/tests/test_landmarks.py`): spec
   validation, names, sourced facts, references listed here, models built from the current spec,
   triangle budgets (LOD0 5k to 15k), height within 10 % of the spec (and of OSM's tag when
   present), ground geometry within 2 m of the OSM outlines and every modelled outline traced
   within 2 m, LOD ranges, collision hit by a ray, placement and the floating origin, loading on
   a worker, buildings left out, no business names or brands, temple architecture only.

## Adding a landmark

Pick it from `COVERAGE.md`; make `assets/landmarks/<id>/spec.json` (copy one with the same kit),
name its OSM parts and roles (`model`: drawn on its OSM outline; `model_rect`: drawn on the
outline's minimum rectangle when OSM's outline is not the building's own; `area`: under the
model; `info`: names and links only), run `landmark-osm`, research and fill the rest, list the
references below, add the id to `index.json`, run `build_all.sh`, take screenshots
(`tests/tools/city_shot.gd --at=x,z,heading --view=back,height`) and compare them with the
references.

## Rules

- Names on landmarks: only the real public name, Tamil above English (TD-18; culture note §1).
  Tamil names not taken from OSM are marked for review by a native speaker.
- Temples: architecture only. No deity figures or images; tier stucco is shown as abstract
  coloured forms; the sanctum is never modelled (culture note §3). The tank is not entered
  (the city's water bund, G-152).
- Everything OSM does not give is estimated and listed in the spec's `estimated`.

## The landmarks

### Anna Nagar Tower (அண்ணா நகர் கோபுரம்)

- Spec: `assets/landmarks/anna-nagar-tower/spec.json`; kit `tower`; OSM main part way/651861526 (role model).
- Names: English from OSM node 295552094 name:en; Tamil from OSM node 295552094 name.
- Style: 1960s concrete observation tower: a slender shaft with stacked circular viewing levels, a canopy and a finial, on a stepped round plinth.
- Height: 41.0 m, the tower to its finial (source: https://en.wikipedia.org/wiki/Anna_Nagar_Tower_Park). OSM tag: none. Alternatives: 41.1 m (135 ft, 12 floors, https://www.thenewsminute.com/article/chennai-s-iconic-anna-nagar-tower-reopens-public-after-12-years-174860); 42.0 m (138 ft, https://www.dtnext.in/city/2023/03/14/anna-nagar-tower-park-to-reopen-for-public-all-you-need-to-know). Why: 133-138 ft in three sources; 41 m is the middle and the value the game already used.
- Facts:
  - Built for the 1968 World Trade Fair; the park is officially Dr Visvesvaraya Tower Park. (https://en.wikipedia.org/wiki/Anna_Nagar_Tower_Park)
  - About 135 ft tall with 12 floors, a spiral ramp and a central lift. (https://www.thenewsminute.com/article/chennai-s-iconic-anna-nagar-tower-reopens-public-after-12-years-174860)
  - Closed in 2011 and reopened on 21 March 2023 after safety work. (https://www.thenewsminute.com/article/chennai-s-iconic-anna-nagar-tower-reopens-public-after-12-years-174860)
- Estimated: level count (12, from the press) and spacing; all radii except the plinth (OSM way 651861526); colours.
- References (modelling only, not committed):

| File (Wikimedia Commons) | Author | Licence | Use |
|---|---|---|---|
| [Anna Nagar Tower.jpg](https://commons.wikimedia.org/wiki/File:Anna_Nagar_Tower.jpg) | Hari Kumar Kasa | Public domain | modelling reference; public domain |
| [Annanagar-Tower-Near-View.jpg](https://commons.wikimedia.org/wiki/File:Annanagar-Tower-Near-View.jpg) | Destination8infinity | CC BY-SA 4.0 | modelling reference (proportions, colours) |
| [AnnaNagarTowerPark Tower 20Jan2013.jpg](https://commons.wikimedia.org/wiki/File:AnnaNagarTowerPark_Tower_20Jan2013.jpg) | Rasnaboy | CC BY-SA 3.0 | modelling reference (proportions, colours) |

### Chennai Central (சென்னை சென்ட்ரல்)

- Spec: `assets/landmarks/chennai-central/spec.json`; kit `station`; OSM main part way/214739119 (role model_rect).
- Names: English from OSM way 217845073 name; OSM node 2481969291 name and alt_name; Tamil from The station's own roof sign (reference photo) and OSM way 217845073 name:ta, which lacks the final pulli (சென்ட்ரல); OSM node 2481969291 name:ta gives the official name.
- Style: Gothic Revival and Romanesque: red-painted brick with white bands, an arcaded upper floor, end pavilions with pale pyramidal roofs, an off-centre clock tower.
- Height: 41.5 m, the clock tower (source: https://www.mintageworld.com/media/detail/5615-railway-stations-the-heritage-of-india-part-II/). OSM tag: none. Alternatives: 41.1 m (135 ft, https://structurae.net/fr/ouvrages/chennai-central). Why: 136 ft (41.5 m) is the figure most sources give; 135 ft is within 1 %.
- Facts:
  - The station opened in 1873; the original building was designed by George Harding. (https://en.wikipedia.org/wiki/Chennai_Central_railway_station)
  - Robert Chisholm remodelled it around 1900 and added the central clock tower, 136 ft (41.5 m) tall. (https://www.mintageworld.com/media/detail/5615-railway-stations-the-heritage-of-india-part-II/)
  - Renamed Puratchi Thalaivar Dr. M.G. Ramachandran Central in 2019; the old name was Madras Central. (https://www.openstreetmap.org/node/2481969291)
  - OpenStreetMap does not map the heritage building's outline; the model stands on the station's frontage outline (way 214739119), the only one along the road front. (https://www.openstreetmap.org/way/214739119)
- Estimated: the building's length and depth (OSM has only the frontage outline); storey heights; pavilion heights; the clock tower's position, about two thirds along the front from the west as in the reference photo.
- References (modelling only, not committed):

| File (Wikimedia Commons) | Author | Licence | Use |
|---|---|---|---|
| [Chennai train station.jpg](https://commons.wikimedia.org/wiki/File:Chennai_train_station.jpg) | Arian Zwegers (derivative work: MrPanyGoff) | CC BY 2.0 | modelling reference (proportions, colours) |
| [Chennai Central Puratchi Thalaivar Dr. M.G. Ramachandran Central Railway Station.jpg](https://commons.wikimedia.org/wiki/File:Chennai_Central_Puratchi_Thalaivar_Dr._M.G._Ramachandran_Central_Railway_Station.jpg) | Thamizhpparithi Maari | CC BY-SA 4.0 | modelling reference (proportions, colours) |
| [Chennai Centrail Railway Station.jpg](https://commons.wikimedia.org/wiki/File:Chennai_Centrail_Railway_Station.jpg) | Ganesh Mohan T | CC BY-SA 4.0 | modelling reference (proportions, colours) |
| [Central Railway Station, Madras 1880.jpg](https://commons.wikimedia.org/wiki/File:Central_Railway_Station,_Madras_1880.jpg) | Nicholas and Company | Public domain | modelling reference (the building before the clock tower); public domain |
| [Chennai central railway station night view.jpg](https://commons.wikimedia.org/wiki/File:Chennai_central_railway_station_night_view.jpg) | Sandhiya Rangasami | CC BY 4.0 | modelling reference (proportions, colours) |

### Chennai Egmore (சென்னை எழும்பூர்)

- Spec: `assets/landmarks/chennai-egmore/spec.json`; kit `station`; OSM main part way/209558519 (role model).
- Names: English from OSM node 5275790188 name; Tamil from OSM node 5275790188 name:ta.
- Style: Indo-Saracenic with Dravidian elements: red brick with cream trim, domes and pointed arches; a three-span train shed.
- Height: 24.0 m, the tops of the porch domes (source: estimated: two storeys of about 6.5 m plus domed porch towers, proportions from the reference photos). OSM tag: none. Why: No published height was found; estimated and marked as such.
- Facts:
  - Building began in September 1905 and the station opened on 11 June 1908. (https://en.wikipedia.org/wiki/Chennai_Egmore_railway_station)
  - Designed by Henry Irwin in the Indo-Saracenic style, the first to bring Dravidian motifs into it. (https://sriramv.com/2014/11/25/chennai-landmark-the-egmore-station/)
  - Its train shed has a three-span roof. (https://en.wikipedia.org/wiki/Chennai_Egmore_railway_station)
- Estimated: all heights (no published figure); positions of the domed towers (on the two porches OSM maps on the south front); shed height.
- References (modelling only, not committed):

| File (Wikimedia Commons) | Author | Licence | Use |
|---|---|---|---|
| [Chennai Egmore facade panorama.jpg](https://commons.wikimedia.org/wiki/File:Chennai_Egmore_facade_panorama.jpg) | Commons user (see file page) | CC BY-SA 3.0 | modelling reference (proportions, colours) |
| [Chennai Egmore Railway Station (view from the east).jpeg](https://commons.wikimedia.org/wiki/File:Chennai_Egmore_Railway_Station_(view_from_the_east).jpeg) | Pratyeka | CC BY-SA 3.0 | modelling reference (proportions, colours) |
| [02Madras Egmore Station.jpg](https://commons.wikimedia.org/wiki/File:02Madras_Egmore_Station.jpg) | Wiele & Klein | Public domain | modelling reference; public domain |
| [Chennai Egmore Station.jpg](https://commons.wikimedia.org/wiki/File:Chennai_Egmore_Station.jpg) | Ehteshaam Khatri | CC BY-SA 4.0 | modelling reference (proportions, colours) |
| [Chennai Egmore railway station in Chennai city 02.jpg](https://commons.wikimedia.org/wiki/File:Chennai_Egmore_railway_station_in_Chennai_city_02.jpg) | Pinakpani | CC BY 4.0 | modelling reference (proportions, colours) |

### Kapaleeshwarar Temple (கபாலீசுவரர் கோயில்)

- Spec: `assets/landmarks/kapaleeshwarar-temple/spec.json`; kit `gopuram_complex`; OSM main part way/1548155931 (role model).
- Names: English from OSM relation 21203725 name; Tamil from OSM relation 21203725 name:ta (the complex way 1548155931 carries the same name:ta).
- Style: Dravidian temple: gateway towers (gopurams) with painted stucco tiers, a walled compound with shrines and pillared halls, a stepped tank to the west.
- Height: 37.0 m, the east gopuram, ground to the top of its finials (source: https://www.ancient-history-sites.com/?p=133412). OSM tag: none. Alternatives: 36.6 m (120 ft, built 1906, https://www.ancient-history-sites.com/?p=133412); 40.0 m (about 40 m, https://en.wikipedia.org/wiki/Kapaleeshwarar_Temple). Why: Two sources give 120 ft (36.6 m); 37 m is that figure rounded and the value the game already used; Wikipedia's 40 m is recorded as the alternative. OSM carries no height.
- Facts:
  - A Hindu temple of Shiva (as Kapaleeshwarar) and Parvati (as Karpagambal) in Mylapore. (https://en.wikipedia.org/wiki/Kapaleeshwarar_Temple)
  - The east gateway tower, about 120 ft (37 m) tall, was built in 1906; a smaller west gopuram faces the tank. (https://www.ancient-history-sites.com/?p=133412)
  - The temple tank measures about 190 m by 143 m; a sixteen-pillared stone mandapam stands at its centre and is used in the three-day float festival. (https://en.wikipedia.org/wiki/Kapaleeshwarar_Temple)
  - OpenStreetMap maps the tank (way 24270420) as about 192 m by 138 m, matching the published size. (https://www.openstreetmap.org/way/24270420)
- Estimated: heights other than the east gopuram (west gopuram 24 m, shrines 13-15 m, halls 5.2 m, wall 5.4 m); tier counts of the west gopuram and shrines; which OSM buildings are the west gopuram and the two main shrines (identified by position); colours (painted stucco, from reference photos in general terms); number of finials.
- References (modelling only, not committed):

| File (Wikimedia Commons) | Author | Licence | Use |
|---|---|---|---|
| [Mylapore Kapaleeshwarar temple facade.jpg](https://commons.wikimedia.org/wiki/File:Mylapore_Kapaleeshwarar_temple_facade.jpg) | Commons user (see file page) | CC BY-SA 3.0 | modelling reference (proportions, colours) |
| [Gopurams of Kapaleeshwarar Temple, Mylapore, Chennai, Tamil Nadu, India (2012).jpg](https://commons.wikimedia.org/wiki/File:Gopurams_of_Kapaleeshwarar_Temple,_Mylapore,_Chennai,_Tamil_Nadu,_India_(2012).jpg) | H. Grobe | CC BY 3.0 | modelling reference (proportions, colours) |
| [Kapaleeshwarar Temple, East Gopuram.jpg](https://commons.wikimedia.org/wiki/File:Kapaleeshwarar_Temple,_East_Gopuram.jpg) | Roehan Rengadurai | CC BY-SA 3.0 | modelling reference (proportions, colours) |
| [Main tower at Kapaleeshwarar Temple.jpg](https://commons.wikimedia.org/wiki/File:Main_tower_at_Kapaleeshwarar_Temple.jpg) | KurinchiRays | CC BY 4.0 | modelling reference (proportions, colours) |
| [Mylapore tank at dawn panorama.jpg](https://commons.wikimedia.org/wiki/File:Mylapore_tank_at_dawn_panorama.jpg) | Commons user (see file page) | CC BY-SA 3.0 | modelling reference (proportions, colours) |
| [Temple-Tank-Mandapam-Kapaleeshwarar-Koil-Chennai-India.jpg](https://commons.wikimedia.org/wiki/File:Temple-Tank-Mandapam-Kapaleeshwarar-Koil-Chennai-India.jpg) | N. Vivekananthamoorthy | CC BY 4.0 | modelling reference (proportions, colours) |
| [Chennai, Arulmigu Kapaleeswarar, mandapa 00.jpg](https://commons.wikimedia.org/wiki/File:Chennai,_Arulmigu_Kapaleeswarar,_mandapa_00.jpg) | Sailko | CC BY 3.0 | modelling reference (proportions, colours) |
| [Chennai, Arulmigu Kapaleeswarar, portabandiere Dwajasthambam 01.jpg](https://commons.wikimedia.org/wiki/File:Chennai,_Arulmigu_Kapaleeswarar,_portabandiere_Dwajasthambam_01.jpg) | Sailko | CC BY 3.0 | modelling reference (proportions, colours) |
| [Kapaleeswarar Temple, Mylapore, Chennai.jpg](https://commons.wikimedia.org/wiki/File:Kapaleeswarar_Temple,_Mylapore,_Chennai.jpg) | Srinivasan G | CC BY-SA 2.0 | modelling reference (proportions, colours) |

### Ripon Building (ரிப்பன் மாளிகை)

- Spec: `assets/landmarks/ripon-building/spec.json`; kit `colonial_clocktower`; OSM main part way/27618298 (role model).
- Names: English from Wikipedia article title; the OSM way carries no name; Tamil from Tamil Wikipedia article title; not in OSM. Needs review by a native Tamil speaker (culture note §1)..
- Style: Neoclassical (white, colonnaded, central clock tower).
  Sources disagree: Neoclassical (https://en.wikipedia.org/wiki/Ripon_Building); Neoclassical (https://theculturetrip.com/asia/india/articles/8-heritage-buildings-and-structures-to-visit-in-chennai); Indo-Saracenic and neoclassical (https://navrangindia.blogspot.com/2015/08/ripon-building-heritage-structure.html). Chosen: Two sources say neoclassical and the building's columns, pediments and white render read as neoclassical; the Indo-Saracenic label is recorded.
- Height: 43.0 m, the central clock tower (source: https://en.wikipedia.org/wiki/Ripon_Building). OSM tag: none. Alternatives: 41.5 m (136 ft, https://theculturetrip.com/asia/india/articles/8-heritage-buildings-and-structures-to-visit-in-chennai); 58.0 m (building 30 m plus 28 m tower, quoted from an official; inconsistent with the others, https://www.deccanchronicle.com/131126/news-current-affairs/article/100-and-going-strong). Why: Wikipedia's 43 m (141 ft) lies between the other two figures and the 41.5 m is within 4 %; the 58 m figure is an outlier.
- Facts:
  - Seat of the Greater Chennai Corporation, named after Lord Ripon. (https://en.wikipedia.org/wiki/Ripon_Building)
  - The foundation stone was laid by the Viceroy, Lord Minto, on 11 December 1909. (https://www.dtnext.in/amp/story/news/chennai/those-were-the-days-how-the-ripon-building-transformed-into-a-seat-of-local-governance-over-100-years)
  - The clock was installed in 1913 by Oakes and Co. and chimes the Westminster Quarters. (https://en.wikipedia.org/wiki/Ripon_Building)
  - Published size: 85 m long and 32 m wide; OpenStreetMap's outline (way 27618298) is 68 m by 20 m, and the model follows OpenStreetMap. (https://en.wikipedia.org/wiki/Ripon_Building)
- Estimated: storey heights and the 21 m eaves; tower stages below the 43 m top; corner turrets; which side is the front (south, the side facing the Victoria Public Hall grounds).
- References (modelling only, not committed):

| File (Wikimedia Commons) | Author | Licence | Use |
|---|---|---|---|
| [Ripon Building panorama.jpg](https://commons.wikimedia.org/wiki/File:Ripon_Building_panorama.jpg) | PlaneMad (Commons user) | CC BY-SA 2.5 | modelling reference (proportions, colours) |
| [Ripon Building.jpg](https://commons.wikimedia.org/wiki/File:Ripon_Building.jpg) | Karthikeyan321 | CC BY 4.0 | modelling reference (proportions, colours) |
| [Ripon Building aerial view.jpg](https://commons.wikimedia.org/wiki/File:Ripon_Building_aerial_view.jpg) | Saiphani02 | CC BY-SA 4.0 | modelling reference (proportions, colours) |
| [Ripon Building corner aerial view.png](https://commons.wikimedia.org/wiki/File:Ripon_Building_corner_aerial_view.png) | Saiphani02 | CC BY-SA 4.0 | modelling reference (proportions, colours) |
| [Ripon Building Chennai.JPG](https://commons.wikimedia.org/wiki/File:Ripon_Building_Chennai.JPG) | unknown (public domain) | Public domain | modelling reference; public domain, so usable as a texture |
| [Ripon building chennai.jpg](https://commons.wikimedia.org/wiki/File:Ripon_building_chennai.jpg) | Dreamora96x | CC0 | modelling reference; CC0, so usable as a texture |

### Chennai Lighthouse (சென்னை மெரினா கலங்கரை விளக்கம்)

- Spec: `assets/landmarks/chennai-lighthouse/spec.json`; kit `lighthouse`; OSM main part way/211436935 (role model).
- Names: English from OSM way 211436935 name:en; Tamil from OSM way 211436935 name.
- Style: 1970s reinforced-concrete lighthouse: a triangular tower in red and white horizontal bands, a gallery and a lantern.
- Height: 45.72 m, the tower (source: https://www.openstreetmap.org/way/211436935). OSM tag: 45.72. Alternatives: 46.0 m (46 m RCC tower, https://dgll.nic.in/DGLL-light-house-location/about-chennai/chennai-lighthouse); 57.0 m (height of the light above sea level, not the tower, https://en.wikipedia.org/wiki/Chennai_Lighthouse). Why: OSM's height tag (45.72 m, 150 ft) agrees with the Directorate of Lighthouses and Lightships; 57 m is the light's focal height.
- Facts:
  - Lit on 10 January 1977, the fourth lighthouse of Madras; a triangular concrete tower in red and white bands. (https://dgll.nic.in/DGLL-light-house-location/about-chennai/chennai-lighthouse)
  - The tower is 45.72 m tall and the light stands about 57 m above the sea. (https://en.wikipedia.org/wiki/Chennai_Lighthouse)
  - Reopened to visitors in 2013 after 22 years, with a lift and a museum of lighthouse equipment. (https://www.deccanchronicle.com/131115/news-current-affairs/article/madras-lighthouse-reopens-attracts-5000-spectators)
- Estimated: band count and spacing; gallery and lantern sizes; the base building (OSM maps the tower only).
- References (modelling only, not committed):

| File (Wikimedia Commons) | Author | Licence | Use |
|---|---|---|---|
| [Chennai Lighthouse.jpg](https://commons.wikimedia.org/wiki/File:Chennai_Lighthouse.jpg) | see file page | see file page (listed, not downloaded) | modelling reference (not seen: the host rate-limited downloads); proportions from the published description |

### Shopping complex, Royapettah (வணிக வளாகம்), generic

- Spec: `assets/landmarks/generic-mall-royapettah/spec.json`; kit `mall`; OSM way 154030370 (role model), from the godot-areas shortlist (`kind: mall`).
- Names: the generic category only, "வணிக வளாகம் / SHOPPING COMPLEX" (TD-18). The spec sets `osm.withhold_names`, so the fill tool drops the way's name, brand and Wikidata/Wikipedia tags; the validator rejects them for any mall.
- Height: 29.6 m, estimated (5 storeys of 5 m from the shortlist's estimate, plus a 4 m atrium roof light); OSM has no height or levels.
- References: none listed: Commons photos of the building carry its business name in their titles. The kit is generic (podium, glass atrium front with mullions, canopy, rooftop parking, plaza strip).

## Research sources and their limits

Facts and heights were checked through web search summaries of the pages cited; the build
container cannot reach Wikipedia or Wikidata directly, so those pages were not fetched here and
the citations should be spot-checked by a person. Reference photos were listed through the
Wikimedia Commons API (one request every 3.5 s or slower, honouring `Retry-After`; the host
rate-limited thumbnail downloads, so only some photos were seen; the Chennai Central front
(`Chennai train station.jpg`) was the main visual reference used for that model).
