# Chennai Open World: real Tamil Nadu trains and real buildings

- **Date:** 23 Nov 2026
- **Status:** Proposed
- **Scope:** `chennai-open-world/` only: train models (`packages/game-engine/src/TrainView.ts`, `tools/blender/`) and building data (`packages/game-world`, `scripts/build-world.ts`). Crowds are out of scope (another agent is on them).
- **Author:** research agent on branch `agent/realism-suggestions`. Research only; nothing here is built.

## Summary

1. **Trains.** Model them in Blender by script, like the auto-rickshaw and the people. Start
   with the one line the game runs today, Chennai Beach to Tambaram, as an ICF-style 12-car
   suburban EMU, plus an AC EMU variant. Then add a WAP-7 with LHB coaches and a Vande Bharat
   on the parallel Egmore–Chengalpattu main line. Leave the Metro and the MRTS until the
   railway can draw viaducts and tunnels. Downloaded CC-BY models exist (WAP-7, WAG-9, WAP-4,
   Vande Bharat, Mumbai local) but most have 200k–470k triangles, which is about the whole
   scene's budget. Some also have doubtful provenance and carry real logos. Use them only as
   shape references. Budget: about 3k triangles per coach up close and 600 at mid range, one
   512 px livery atlas per train type, all trains together at most about 6 draw calls.
   **Decision needed:** how close the liveries may get to Indian Railways' real ones (TD-18
   currently forbids real brand liveries).
2. **Buildings: Google's API cannot be used.** Google Photorealistic 3D Tiles can't be shipped
   in an offline APK. The terms forbid offline use, pre-fetching and storage beyond the HTTP
   cache headers, and anything "extracted, traced or derived by hand or machine" from the
   tiles. They also require live streaming with an API key and on-screen Google attribution.
   Even an online-only mode would cost money per session, use mobile data, have no collision,
   and look blobby at street level. Coverage of Chennai is not confirmed either. **Practical
   path, all at build time and offline:**
   - keep the OSM footprints;
   - fill the missing heights from open data (Overture buildings, Google Open Buildings 2.5D,
     Microsoft ML heights), labelled as estimates;
   - add Chennai facade and roof styles by district;
   - hand-model (by script) a short list of landmarks: Chennai Central, Ripon Building, Egmore
     station, the High Court, the LIC building.

   Today **96.6 % of the game's buildings have estimated heights** (measured below), so
   heights are the biggest, cheapest win.

## How things work today (evidence)

- Trains: `packages/game-engine/src/TrainView.ts` builds an original EMU-style coach from boxes
  (cream body, teal band, saffron line, invented livery). There is a cab and a middle-coach mesh,
  instanced, so all trains are 2 draw calls plus 1 for wheelsets. Trains are 4 coaches (estimated, TD-19);
  `COACH_LENGTH` 20.5 m, `COACH_WIDTH` 3.2 m.
- Lines: `apps/game/public/world/rail.json` has only `beach-tambaram` and `tambaram-beach`. The rail
  extract (`assets/osm/rail/chennai-rail.osm.json`) also holds the Chennai Egmore–Chengalpet main
  line and long-distance route relations (Shatabdi, Charminar Express…), so main-line trains
  could run on mapped track without new OSM work. MRTS and Metro need viaducts and tunnels
  (TD-19, "Revisit when").
- Models by script: `tools/blender/auto_rickshaw.py` (575 lines, detailed auto 16k / traffic 12k
  triangles), `characters.py`, `street_props.py`; `npm run optimize:assets` (meshopt, WebP 512 px).
- Budget (TD-18): about 230–300 draw calls and 300k triangles in dense T. Nagar; textures 512 px on
  phones. No real phone has run the game yet (`docs/realism-plan.md` §4).
- Rules that bite here: `AGENTS.md` "Original content only … no real business names on signs";
  TD-18 "no real business names, logos or brand liveries, no copied photos or models";
  invented detail must be described as estimated.
- Buildings: `packages/game-world/src/buildWorldMap.ts` `toBuilding()` uses OSM `height`, else
  `building:levels`, else an estimate by kind; `heightFrom` records which. Facades are procedural
  (`FacadeKit.ts`: shop fronts, chajja sunshades, balconies, Tamil signs).
- **Measured for this note** (decoding all 1,877 chunk files with `decodeChunk`): 106,619
  buildings; heights from OSM `height` **8**, from `building:levels` **3,585 (3.4 %)**,
  estimated **103,026 (96.6 %)**. In the 1 km² Anna Nagar extract, 1,324 buildings have no
  `height`, `building:levels`, `roof:shape`, `building:colour` or `roof:colour` tags at all
  (6 have a name). So OSM roof and colour tags are not worth building on in Chennai today.

## Question 1: real Tamil Nadu trains instead of boxy ones

### What actually runs (what a player would recognise)

| Train | Where in Chennai | Notes for modelling |
|---|---|---|
| Suburban EMU (ICF, 3-phase / MEDHA-type, 12 cars) | Beach–Tambaram–Chengalpattu (the game's line), Central–Arakkonam, Central–Gummidipundi | All major Chennai routes now run 12-car rakes. 3-phase ICF EMUs started on Beach–Tambaram in Feb 2018, with stainless steel bodies, a full-width windscreen and twin headlights. The older rakes had a cream-and-green "customary" Chennai livery |
| AC EMU (ICF, 12 cars) | Beach–Chengalpattu since 19 Apr 2025; Central–Avadi–Arakkonam since Oct 2025 | The first AC EMU in South India: an obvious "new and real" variant of the same coach shell |
| MEMU (ICF) | Central–Tiruttani and similar longer runs | Same family as the EMU; the coach shell can be shared |
| MRTS EMU | Beach–Velachery (elevated, 19.3 km); being transferred to CMRL (MoU approved; full takeover around 2027) | Same EMUs as the suburban line today; needs a viaduct in the game |
| Chennai Metro (Alstom Metropolis, built at Sri City, AP) | Phase I: 208 cars delivered; Phase II: 3-car driverless sets, service on Corridor 4 | Not on the game's map; needs viaduct and tunnel support in `packages/rail` |
| WAP-7 (3-phase passenger loco) | Royapuram shed is WAP-7 only; Erode has about 110 | The most common express engine round Chennai |
| WAP-4, WAG-9 | Arakkonam shed (WAP-4, WAG-9) | WAG-9 for freight; WAP-4 is the older box-cab |
| WDM-3A/3D diesels | Golden Rock, Erode diesel sheds | Few left near Chennai since electrification; low priority |
| Vande Bharat | Built at ICF Chennai (as "Train 18"); Chennai Egmore–Tirunelveli and others | Saffron and grey livery since 2023 (white-blue before) |

### Options

| Option | What it gives | Cost | Licence | Effort | Phone cost |
|---|---|---|---|---|---|
| **(a) Blender by script** (`tools/blender/trains.py`), like `auto_rickshaw.py` | Our own geometry at exactly the polycount we want, with LODs, a livery atlas, doors and pantograph as separate nodes for the existing door and wheel logic | ₹0 | Original work (fits TD-18 and `assets/README.md`) | EMU (cab, motor and trailer coach, AC variant): about 3–4 agent-days with reviews; WAP-7 + LHB coach: 2–3 days; Vande Bharat: 2 days; Metro: 2 days for the model plus a separate rail project for viaducts and tunnels | Whatever we set (budget below) |
| **(b) Open-licensed models** (Sketchfab CC-BY) | Instant recognisable shapes. Found via the Sketchfab API (downloadable, 23 Nov 2026): "WAP 7 Indian Locomotive Low Poly" 225,435 faces, CC-BY; "WAP 7 (New Design)" 388,854; "Wag 9" 289,524; "WAP-4" 223,734; "Mumbai Local Train Coaches" 183,470; "Vande Bharat Low Poly" 10,150, CC-BY; "ICF blue coaches with WAP 4" 32,181, CC-BY. Nothing for Chennai Metro or MEMU | ₹0 | CC-BY allows commercial use, changes and redistribution with credit, but covers only the modeller's copyright, **not the Indian Railways marks painted on them**. Some listings are NC/ND (unusable). One WAP-7 appears twice under two accounts with the same face count, so provenance must be checked per model | Low to import; **high to make phone-ready**: decimate 200k→3k, re-UV, re-bake, strip logos. Close to the cost of (a), but the result is worse | As shipped, one loco is close to the whole 300k scene budget |
| **(c) Buy** (CGTrader / Fab: WAP-7 from about $5 to $110, "Royalty Free", some "No AI") | Higher-detail models | $5–$110 a model, more for packs | Proprietary royalty-free. Usually allowed in a game but **not as an extractable asset**; our GLBs are embedded in the JS and easy to pull out of an APK, so each licence needs reading. Some forbid AI-assisted editing, which is how we work | Same decimation work as (b) | Same as (b) |

### Recommendation

**(a), with (b) only as visual reference.** It matches the pipeline (the script is the source,
original licence, deterministic rebuilds). It is the only option that hits the phone budget
without a second modelling pass. It also avoids shipping fan models of unknown origin.
Order:
1. **Suburban EMU** for the existing Beach–Tambaram line. Three meshes share one shell: driving
   cab, motor coach (pantograph), trailer. Plus a recolour for the AC EMU. Raise the train to
   12 coaches (real since 2025), or keep 9 if the platforms are too short.
2. **Main line**: a WAP-7 with LHB coaches, and a Vande Bharat, on the Egmore–Chengalpattu
   relations already in the rail extract (a `build:rail` change plus timetable entries, labelled
   estimated).
3. **MRTS and Metro** only after `packages/rail` can draw viaducts and tunnels (TD-19).
4. Diesels last, if at all.

**Polygon and texture budget (Adreno 613-class phone, within TD-18's 300k / ~300 calls):**

| Item | LOD0 (≤ 60 m) | LOD1 (60–300 m) | LOD2 (300–900 m) | Texture |
|---|---|---|---|---|
| EMU / LHB coach | ≤ 3,000 triangles | ≤ 600 | ≤ 120 (today's box is about this) | One 512×512 livery atlas per train type (sides, ends, roof), WebP now, KTX2 later; windows by atlas, not geometry |
| Driving cab / loco / Vande Bharat nose | ≤ 5,000–6,000 | ≤ 1,000 | ≤ 150 | Same atlas |
| Bogies + wheelsets | ≤ 400 per bogie, LOD0 only | Merged into body | None | Vertex colour |
| Whole railway on screen | ≤ 40,000 triangles (worst case, two 12-car trains passing at a platform) | | | ≤ 6 draw calls (one instanced mesh per coach type per LOD) |

Keep doors and pantographs as separate nodes so `TrainDoors` and the wheel turning still work.
Measure with `renderer.info` at Chennai Beach and Guindy before and after; the triangle count is
the main cost in the existing budget. Fill rate counts too on a weak GPU, so use no
transparent glass: dark opaque windows, as now.

**Livery decision (the player's).** TD-18 says "no real … brand liveries". Real shapes (ICF
cab, WAP-7 hood) are not a brand. Colours are a grey area. Logos and words ("Indian Railways",
"CMRL", Vande Bharat's name) are trademarks: Indian Railways registers and enforces at least its
heritage logos and requires permission to use them. Proposed default: real shapes and real
colour families (Chennai EMU colours, AC EMU scheme, Vande Bharat saffron and grey, WAP-7 red
and cream), **no logos, no operator name, invented car numbers**. Real logos only with written
permission.

## Question 2: real Tamil Nadu buildings ("pull the exact structure from Google with an API key?")

### What Google Photorealistic 3D Tiles is

Google's photogrammetry mesh of cities (the same 3D as Google Earth), served by the **Map Tiles
API** as OGC 3D Tiles. Any 3D Tiles renderer can show it; three.js does with
`3DTilesRendererJS`. Billing: one **root tile request** opens a renderer session of up to
3 hours; the tile requests inside it are not billed. It is an Enterprise SKU, **1,000 free root
requests a month, then $6.00 per 1,000** (up to 100k), down to $2.40 per 1,000 above 5 million.
Default quota: 10,000 root requests a day per project.

### Why it doesn't fit this game

| Requirement in Google's terms (Map Tiles API Policies) | What it means for an offline APK |
|---|---|
| No "pre-fetch, index, store, or cache any Content" except as the terms allow; honour `Cache-Control` | We cannot bake the tiles into the APK or the world files |
| Not allowed: "geodata extraction … or offline uses" | An offline game is exactly the forbidden case |
| Your own 3D objects may be overlaid only if they "aren't extracted, traced, or otherwise derived by hand or machine" from the tiles | We can't even trace Google's mesh into our own building models, by script or by hand |
| Brand attribution (Google Maps logo) and full data attribution from the tile metadata must stay visible on screen | Permanent on-screen credits in a game HUD |
| Content is streamed from Google with an API key | Network always needed. The key ships inside the APK (it can be restricted to the Android app, but it is visible) |

Even as an optional **online mode** it is a poor fit:
- **Cost per user:** about $0.006 per session after the free 1,000 a month. A player opening
  the game twice a day costs about $0.36 a month. That needs a Google Cloud billing account,
  and the 10,000/day quota would be hit at about 5,000 daily players.
- **Data:** photogrammetry at street level streams a lot of mesh and texture on mobile data. Not
  measured here; it should be measured before any decision.
- **Phone cost:** extra textures and memory on a WebView heap that is already 51–62 MB (TD-17).
- **Look and gameplay:** lighting is baked into the photos (it fights the game's sun and the
  time of day). The mesh is one surface (no separate buildings, cars and trees melted in, no
  doors or shop fronts). There are no colliders, and building them from the mesh is forbidden.
- **Coverage:** I could not confirm Chennai has photorealistic 3D. Google's coverage map is the
  check. India restricted 3D city imagery in the past (2015 reports of government permission
  being needed).

**Verdict: no.** Not for the offline APK, and not worth it as an online extra.

### Alternatives

| Option | What it gives | Cost | Licence | Effort | Phone cost |
|---|---|---|---|---|---|
| OSM footprints + tags (today) | Real outlines; heights for 3.4 % of buildings | ₹0 | ODbL (already credited) | Done | Baseline |
| **Overture Maps buildings** (GeoParquet, filter to the city box at build time) | OSM plus Microsoft ML, Google Open Buildings and Esri footprints, with `height` / floor counts where a source has them; India has big ML coverage | ₹0 | **ODbL** (the theme is ODbL because it includes OSM); credit Overture and its sources | 1–2 days: a build step joining Overture heights to our OSM buildings (overlap match), new `heightFrom` value | None at run time (heights already stored per building) |
| **Google Open Buildings 2.5D Temporal** (Earth Engine raster, 4 m, `building_height` 0–100 m, yearly 2016–2023) | ML heights from satellite, mean absolute error 1.5 m by Google's figure (validated mainly outside the Global South) | ₹0 (an Earth Engine account to export) | **CC BY 4.0 or ODbL, user's choice** | 1–2 days: export the city's height raster once, sample per footprint at build time | None at run time |
| Microsoft Global ML Building Footprints | Footprints; India got 110M footprint edits in 2024, heights only for a subset | ₹0 | ODbL | Mostly covered via Overture | None |
| Cesium OSM Buildings / Cesium ion | OSM buildings extruded: **the same data we already have** | Offline use needs a paid licence (ion self-hosted / sales); Commercial plans from about $149/month | Cesium terms + ODbL | Low | No gain |
| **Chennai procedural styles** (in `FacadeKit` / `game-world`) | Madras terrace houses and Mangalore-tile roofs in old areas (Mylapore, Triplicane, George Town), flat RCC with parapets and water tanks elsewhere, chajjas, grilles, compound walls, colours by area | ₹0 | Original | 3–5 days, in steps (style by district, roof variety, ground-floor shops already exist) | Small: same merged meshes, a few more triangles per building; atlas stays one texture |
| **Hand-modelled landmarks** (Blender by script, placed on the OSM outline like `landmarks.ts`) | Instantly recognisable places: Chennai Central, Ripon Building, Egmore station, Madras High Court, LIC building (Anna Salai), Valluvar Kottam. All are inside the city box | ₹0 | Original models of public buildings; the Indo-Saracenic ones are over 100 years old. LIC (1959): check architectural copyright, and AGENTS.md's "no real business names" for signs | 1–2 days per landmark | ≤ 15k triangles and 1 draw call each, 512–1024 px atlas, LOD1 ≤ 2k; only drawn in their chunk |

### Recommendation

1. **Heights first:** a `build:world` step that takes height in this order: OSM `height` →
   OSM `building:levels` → Overture `height` / `num_floors` → Open Buildings 2.5D sample →
   today's estimate. Store a new `heightFrom` ("ml-estimate") so the game and docs keep calling
   these heights estimated, not real (AGENTS.md rule). Add the credits (Overture/ODbL,
   Google Open Buildings CC BY 4.0) next to "© OpenStreetMap contributors". Measure how many of
   the 103k estimated buildings change, and spot-check T. Nagar and Anna Salai against photos.
2. **Chennai styles by district** in `game-world`, so old Mylapore doesn't look like Anna Nagar.
3. **Five landmarks** by Blender script, Chennai Central first (it sits next to the railway the
   player rides).
4. **No Google 3D Tiles.** The game stays fully offline, and the APK size grows only by the
   landmark models (about 100–200 kB each, optimised).

## Open questions for the player

1. Do you have, or want, a Google Cloud billing account? It matters only if you still want an
   *online-only* Google 3D view, which I advise against. It can never be part of the offline game.
2. Liveries: real shapes and colours with no logos (proposed), invented liveries as now, or
   seek Indian Railways / CMRL permission for the real thing?
3. Trains per line: 12 coaches like the real Chennai EMUs (longer platforms in the game), or keep
   shorter trains for performance?
4. Main-line trains (WAP-7 expresses, Vande Bharat) passing through, before or after the Metro?
5. Which landmarks matter most to you? Proposed: Chennai Central, Ripon Building, Egmore, High
   Court, LIC.
6. Is a real phone available to profile on (Adreno 613-class)? The budgets above are unproven
   until then.

## Sources

The Google developer pages could not be opened directly from the research container (the
network blocks `developers.google.com` and `mapsplatform.google.com`). The Google terms quoted
above are as returned by web search from those pages; re-read them before relying on them.

- Map Tiles API Policies (caching, offline, derived objects, attribution): https://developers.google.com/maps/documentation/tile/policies
- Photorealistic 3D Tiles: https://developers.google.com/maps/documentation/tile/3d-tiles
- Own renderer and attribution: https://developers.google.com/maps/documentation/tile/create-renderer
- Map Tiles API usage and billing (root tile, 3-hour session, 10,000/day): https://developers.google.com/maps/documentation/tile/usage-and-billing
- Google Maps Platform pricing list: https://developers.google.com/maps/billing-and-pricing/pricing
- Price tiers summary: https://mantle.place/compare/google-photorealistic-3d-tiles
- FAQ on Photorealistic 3D Tiles: https://mapsplatform.google.com/resources/blog/commonly-asked-questions-about-our-recently-launched-photorealistic-3d-tiles/
- Cesium forum, offline Google tiles not allowed: https://community.cesium.com/t/how-can-i-download-photorealistic-3d-tiles-for-cesium-js-react-offline-self-hosted/26293
- 3D coverage map: https://developers.google.com/maps/documentation/javascript/3d/coverage
- India 3D imagery needing permission (2015): https://business-standard.com/article/pti-stories/3d-imagery-of-india-s-major-cities-likely-in-google-earth-115070600969_1.html
- Google Open Buildings 2.5D Temporal: https://sites.research.google/gr/open-buildings/temporal and https://developers.google.com/earth-engine/datasets/catalog/GOOGLE_Research_open-buildings-temporal_v1
- Open Buildings 2.5D blog (accuracy): https://research.google/blog/open-buildings-25d-temporal-dataset-tracks-building-changes-across-the-global-south/
- Overture buildings guide (ODbL, sources): https://docs.overturemaps.org/guides/buildings
- Overture adds Google Open Buildings (India coverage): https://overturemaps.org/blog/2023/overture-buildings-theme-hits-2-3b-buildings-with-addition-of-google-open-buildings-data/
- Microsoft Global ML Building Footprints: https://github.com/microsoft/globalmlbuildingfootprints
- Cesium OSM Buildings: https://cesium.com/platform/cesium-ion/content/cesium-osm-buildings/ ; offline licensing: https://community.cesium.com/t/offline-buildings-tiles/11769 ; pricing: https://cesium.com/platform/cesium-ion/pricing/ ; third-party terms: https://cesium.com/legal/third-party-terms/
- Chennai EMUs to 12 cars: https://www.dtnext.in/news/chennai/all-emus-in-chennai-upgraded-to-12-car-rakes-to-ease-congestion-railways-838124
- First AC EMU, Chennai: https://www.tribuneindia.com/news/india/south-indias-first-air-conditioned-emu-service-flagged-off-in-chennai
- Second AC EMU route: https://www.dtnext.in/news/tamilnadu/sr-to-run-2nd-ac-suburban-train-service-on-central-avadi-arakkonam-route-from-oct-23-avadi-commuters-disappointed
- 3-phase EMU in Chennai (2018): https://www.dtnext.in/city/2018/02/20/southern-railway-launches-threephase-suburban-rail-service ; photos: https://www.railpictures.net/photo/649768 ; IRFCA EMU gallery: https://irfca.org/gallery/EMU
- MRTS takeover by CMRL: https://www.constructionworld.in/amp/transport-infrastructure/metro-rail-and-railways-infrastructure/railway-board-approves-merger-of-chennai-mrts-with-chennai-metro/96374
- Chennai Metro Phase II (Alstom Metropolis, Sri City): https://www.alstom.com/press-releases-news/2024/2/alstom-commences-production-driverless-trainsets-chennai-metro-phase-ii ; 96 more cars: https://www.alstom.com/press-releases-news/2025/6/alstom-supply-96-additional-metropolis-driverless-metro-cars-chennai-metro-phase-ii
- Loco sheds: https://en.wikipedia.org/wiki/Electric_Loco_Shed,_Royapuram ; https://en.wikipedia.org/wiki/Electric_Loco_Shed,_Arakkonam ; https://en.wikipedia.org/wiki/Electric_Loco_Shed,_Erode
- Vande Bharat (built at ICF): https://www.wikipedia.org/wiki/Train_18 ; saffron livery: https://www.dtnext.in/news/chennai/inspired-by-tricolour-min-vaishnaw-on-vb-express-in-saffron-hue-723121
- Indian Railways logo registration and permission: https://www.freepressjournal.in/mumbai/mumbai-to-protect-railways-intangible-heritage-assets-logo-of-gipr-registered-with-trade-marks-registry
- Sketchfab licences: https://sketchfab.com/licenses ; store licence in games: https://help.sketchfab.com/en/articles/16152225-store-license-usage-faq ; models found with the Sketchfab search API (`api.sketchfab.com/v3/search?type=models&downloadable=true`), e.g. WAP-7 https://sketchfab.com/3d-models/1935cec9ac9446e3b2524ad73f0902a4 , Vande Bharat Low Poly https://sketchfab.com/3d-models/c51c3380acac4df2b206a382be9f1ca0
- Paid WAP-7 models: https://www.cgtrader.com/3d-models/vehicle/train/indian-railways-wap-7-electric-locomotive-3d-model
- three.js budgets (rough, forum): https://discourse.threejs.org/t/problems-with-performance-on-mobile-devices/23734
