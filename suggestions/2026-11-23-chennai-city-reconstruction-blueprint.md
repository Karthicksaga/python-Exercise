# Chennai Open World: real-world city reconstruction, audit and blueprint

- **Date:** 23 Nov 2026
- **Status:** Proposed. Planning only: no source files were changed, nothing was installed, and no data was downloaded.
- **Scope:** `chennai-open-world/` world pipeline and rendering (`scripts/`, `tools/`, `packages/map-data`, `packages/game-world`, `packages/game-engine`, `packages/physics`, `assets/`). Gameplay packages are untouched.
- **Companion:** [real trains and buildings research](2026-11-23-chennai-real-trains-and-buildings.md). It covers Google 3D Tiles, which are ruled out, plus building-height datasets and train models. It isn't repeated here.
- **Method:** I read the code and docs on branch `agent/gameplay-fixes` at `02347a0`. Every number below was measured in this repo unless it is marked *estimate* or *to verify*.

## 0. Summary

1. **The repository already has a working reconstruction pipeline.** Keep it and extend it; don't replace it. The steps today are:
   - OSM extract;
   - `clip-city.py` (osmium);
   - `parseOsm`;
   - `buildWorldMap`, which turns data into rules;
   - a compact binary file per 250 m chunk;
   - procedural meshes built on the phone at run time, from shared atlases and Blender-made kit pieces.

   The world is 1,877 chunk files totalling 3.5 MB, plus a 0.5 MB index and 0.85 MB of roads. That is the main reason it fits on a phone at all.
2. **The biggest change to the proposed architecture:** do not export a GLB per building. Chennai has hundreds of thousands of buildings (*estimate* below). Per-building GLBs would multiply APK size, decode time, draw calls and memory. Instead:
   - put richer per-building data into the chunk files (archetype, height source, roof, a provenance id);
   - make **kit pieces** in Blender (window bays, balconies, chajjas, shutters, tanks, stair towers, gates, compound walls);
   - merge or instance those pieces per chunk at run time, as `FacadeKit` and `StreetProps` already do.

   Only landmarks (about 10–50) get their own hand-reviewed GLB.
3. **Coverage today is a central box, not all of Chennai.** It runs 12.98–13.095°N by 80.195–80.29°E, from Anna Nagar to T. Nagar, the Marina and the start of ECR. That is about 117 km² of chunk files. Greater Chennai Corporation is about 426 km² (*to verify*), so "the whole city" is about 3.6× today's area.
4. **Open data can fill the main gap** (96.6 % of building heights are estimates today), offline, with no running costs. The sources:
   - OSM (ODbL);
   - Overture buildings (ODbL);
   - Google Open Buildings 2.5D (CC BY 4.0 or ODbL);
   - Microsoft footprints (ODbL; mostly already inside Overture).

   Using them makes the world files a **derived database under ODbL**. OSM already does that today, but publishing the database becomes a stated obligation (§10).
5. **Six decisions are needed from you** before Phase 1 (§21). The most important:
   - What "entire Chennai" means: the Corporation area, or the wider metropolitan area.
   - Whether real business names may appear on signs. Your brief says yes; the repo's rule (AGENTS.md, TD-18) says no.
   - Where street imagery comes from.

---

## 1. Existing architecture assessment

| Layer | What exists (file) | Assessment |
|---|---|---|
| Shell | React Native 0.88, `apps/mobile/src/GameScreen.tsx`, WebView with WebViewAssetLoader (TD-16) | Keep. Offline: game files ship in the APK under `assets/game`. |
| Runtime | `apps/game` (Vite 7, one classic script, TD-3); `Game.ts` composition root | Keep. Script is 6.7 MB; the people's GLBs are files (23 Nov fix). |
| Rendering | Three.js 0.187 `SceneRenderer.ts`, quality tiers lite/low/high, shadow box 40 m, low tier caps pixel ratio at 1.5, no MSAA | Keep. Phone tier = `low`. |
| Physics | Rapier 0.21, only `packages/physics` imports it; static groups per chunk (trimesh walls, tree boxes), raycast vehicles | Keep. Ground is a flat plane: no terrain or decks (§4). |
| World data | `packages/map-data` (OSM JSON → local metres), `packages/game-world` (rules → `WorldMap`, chunk codec) | Extend (§2, §12). |
| City meshes | `packages/game-engine`: `ChunkView` (ground, furniture, buildings merged into walls/roofs/kit meshes, instanced tanks/trees/palms), `FacadeKit`, `GroundMeshes`, `StreetFurniture`, `StreetProps`, `LandmarkView`, `shopSigns` | Extend: archetypes, kit pieces and junctions plug in here. |
| Streaming | `ChunkManager`: 250 m chunks, load 250 m / unload 330 m (low), up to 4 fetches in flight. Since 23 Nov it builds one chunk at a time, 4 ms per frame | Keep. Add per-layer distances (§15). |
| Assets | `tools/blender/*.py` (auto-rickshaw, 37 characters, street props) → `assets/models` → `npm run optimize:assets` (glTF Transform, meshopt, WebP 512 px via sharp) → loaded with `GLTFLoader` + `MeshoptDecoder` | Keep. Add kit pieces, landmarks, trains. |
| Tests | Vitest (575 unit tests on `agent/gameplay-fixes`), Playwright about 110 browser specs, CI in 4 shards, APK build, emulator smoke | Keep. Add pipeline tests (§17). |

Package rules (AGENTS.md) that this plan respects:
- Only `physics` imports Rapier.
- `map-data` and `game-world` never import Three.js.
- `Game.ts` stays a composition root.
- Data that OSM doesn't provide is labelled as estimated.
- No real business names (TD-18). §21 asks whether you want to change that.

## 2. Existing map-data pipeline assessment

What exists:
- `scripts/clip-city.py` uses osmium to cut the openstreetmap.fr Tamil Nadu PBF (124 MB) to the city box. The output, `assets/osm/city/chennai-city.osm.json` (58 MB), is git-ignored. OSM timestamp: 2026-11-15T00:16:27Z.
- `scripts/fetch-osm.mjs` (Overpass) is used only for the small Anna Nagar test extract. Overpass was unreliable from the build container (`assets/osm/README.md`).
- `packages/map-data/src/osm.ts` `parseOsm`:
  - keeps **all tags raw** on highways, building polygons, areas and tagged points;
  - turns open `natural=coastline` ways into the sea outline;
  - **does not handle multipolygon relations**, so courtyard buildings and large landuse areas are missing or simplified.
- `packages/map-data/src/projection.ts` `GeoProjection`: an equirectangular local tangent plane at a fixed origin (`ANNA_NAGAR_ORIGIN`), with x east and z south, in metres. Its error over the current box is a few metres at the edges (*estimate*: the scale error grows with latitude distance from the origin, about 0.04 % per 0.1°). That is fine for a game, and every dataset must go through **this same projection**.
- `packages/game-world/src/buildWorldMap.ts`:
  - **Roads:** class to kind (`primary`…`footway`); width from `width`, else `lanes` × lane width + shoulder, else a class estimate; `oneway`.
  - **Buildings** (`toBuilding`): height from `height`, else `building:levels`, else estimated by kind, recorded in `heightFrom`. Three kinds: house, apartments, commercial. Colour invented.
  - **Points:** trees, bus stops, signals, places of worship, landmarks, POIs, places (districts).
  - **Not used yet:** `roof:shape`, `roof:levels`, `building:material`, `building:colour`, `surface`, `smoothness`, `sidewalk`, `bridge`, `layer`, `tunnel`, `barrier`, `man_made` beyond landmarks, `traffic_sign`.
- `scripts/build-world.ts` writes `index.json` (bounds, places, landmarks, sea, chunk table), `roads.bin` (every centre line) and `c/C_R.bin` (one per chunk: buildings, trees, areas). Coordinates are quantised to 5 cm, and the files start with `COWC`/`COWR` markers.
- `scripts/build-rail.ts` writes `rail.json` from a separate rail clip.

Gaps:
- No multipolygons.
- No second dataset.
- No provenance id beyond the OSM id.
- **No version field in the chunk format.** Add one before any format change, so old and new files can't be mixed silently.

## 3. Building coverage assessment

Measured by the research agent, decoding all 1,877 chunk files:
- **106,619 buildings.**
- Heights from OSM `height`: **8**. From `building:levels`: **3,585 (3.4 %)**. Estimated: **96.6 %**.
- No roof or colour tags in the Anna Nagar sample.

Unknowns to measure in Phase 0b before promising anything:
- How many real buildings OSM is missing in the box. Compare against Overture and Open Buildings footprints by overlap.
- How many Overture buildings carry `height` or `num_floors` in Chennai.
- Google Open Buildings 2.5D height coverage and quality on Chennai's dense low-rise fabric. Google reports 1.5 m mean absolute error globally, but validation mostly happened elsewhere.

## 4. Road geometry assessment

- Roads are flat ribbons (`GroundMeshes.ribbon`) at small y offsets, with lane lines for main roads (`laneLines`), stripes (`addStripes`) and area polygons.
- **Junctions:** ribbons simply overlap. There are no junction polygons or kerb returns.
- Kerbs, poles and bus shelters come from `StreetFurniture` (`game-world/furniture.ts`). Pavement props come from `game-world/props.ts`.
- **No elevation at all:**
  - the ground is flat;
  - `bridge=yes` and `layer` are ignored, so the Kathipara and Gemini flyovers, and rail overbridges, are drawn at ground level and crossing roads overlap;
  - the physics ground is flat.
- **No surface condition:** one asphalt look everywhere.
- Width is measured where OSM has it. How common `width` and `lanes` tags are in Chennai is unmeasured; measure it in Phase 0b.

## 5. Existing chunk-streaming assessment

- A 250 m grid. Each chunk is fetched over the app's https origin, decoded, then:
  - built into a `ChunkView` step by step, adding the object only when complete;
  - given physics solids (a trimesh of walls and tree boxes) through `hooks.loaded`.
- Everything in a chunk loads and unloads together. No per-layer distances; no LOD for buildings (fog hides the edge: `far` 360 m, fog 90–340 m on `low`).
- Chunk payloads are tiny: median 1.6 KB, 95th percentile 4.1 KB, largest 13.3 KB. Build cost is CPU on the phone, about 20 ms per chunk on a desktop. That is why chunks are now built over several frames.
- Fine as it is for the plan. Additions needed: layers (§15) and a format version.

## 6. Reusable components

- `GeoProjection` and `parseOsm` (extend the tag use).
- `buildWorldMap` (extend the rules).
- The chunk codec (add a version and fields).
- `ChunkManager` and step-by-step `ChunkView`.
- `MeshBuilder` merging.
- `FacadeKit` (shop fronts, chajjas, balconies, Tamil signs) and `kitAtlas.ts`.
- `StreetFurniture`, `StreetProps` (GLB + meshopt + instancing).
- `LandmarkView` (per-landmark meshes).
- `shopSigns.ts` (Tamil/English boards, invented names).
- The Blender-by-script workflow (`scripts/blender.mjs`, `tools/blender/*`).
- `optimize-assets.mjs`.
- Physics static groups per chunk.
- The CI shards and the emulator smoke test.

## 7. Missing components

- **Data fusion** (§11): a second building source, footprint matching, provenance, a confidence value, coverage reports.
- **Canonical intermediate data** (§12), separate from the runtime codec.
- **Building archetypes:** currently 3 kinds plus a facade plan. The brief asks for 10 traditional Tamil houses, 10 modern houses, 10 apartment variants and 10 commercial variants, as data plus kit pieces.
- **Roads:**
  - junction polygons;
  - kerb returns;
  - medians and dividers;
  - zebra crossings at mapped crossings (`highway=crossing`);
  - speed breakers (`traffic_calming=bump`, `hump`, `table`);
  - manholes and drain covers as decals;
  - surface-condition profiles;
  - **elevated decks** for bridges and flyovers, plus ramps;
  - a physics collider for decks.
- **Terrain:** Chennai is nearly flat (*to verify*: mostly under 10 m above sea level). A DEM adds little except at bridges and the beach. I recommend no terrain in Phase 1–4, and decks only.
- **Street environment:** vendors, tea kadais, transformers, overhead cables, neem trees, parked scooters, bins, gates and compound walls. Placement rules exist for props (`props.ts`); they need more kinds and land-use awareness.
- **A licence registry** for datasets, assets, fonts and AI models, plus an in-app attribution screen. Today OSM is credited on the loading screen and in About.
- **Tooling:** Python geo tooling (GDAL, GeoPandas, Shapely, DuckDB Spatial, PyProj, Rasterio) is **not set up** in the repo. `clip-city.py` uses a throwaway venv with osmium. Blender is not installed in CI or in this container (`docs/realism-plan.md`).

## 8. Recommended new package boundaries

| New or changed | What | Why there | Runtime dependency? |
|---|---|---|---|
| `tools/geo/` (new, Python, build-time only) | Dataset fetch scripts, fusion, validation, coverage reports, export of the canonical GeoParquet | Python geo stack belongs in tools, not in `packages/` (which are TypeScript runtime packages) | No |
| `tools/blender/kits/` (new) | Archetype kit pieces, landmarks, trains | Same workflow as the existing Blender scripts | No (GLB output only) |
| `packages/map-data` (changed) | Read the canonical building/road table alongside OSM, using the same `GeoProjection` | Keeps one coordinate transform | No new one |
| `packages/game-world` (changed) | Archetype choice, road condition, junction and deck rules as data; codec v2 | Rules stay out of the renderer (AGENTS.md) | No |
| `packages/game-engine` (changed) | Kit-piece facade builder, junction meshes, decals, layered chunk building | Existing home of `ChunkView` | Three.js (already) |
| `packages/physics` (changed) | Deck and ramp colliders, speed-breaker bumps | Only package allowed to touch Rapier | Rapier (already) |
| `assets/datasets/` (new, **git-ignored**) + `assets/datasets/MANIFEST.json` (committed) | Downloaded raw data, with URL, date, checksum and licence per file | Reproducible builds, small repo | No |
| `assets/LICENSES.md` (new) and an in-app Credits page | Registry of every dataset, model, font and texture | Legal requirement (§10, §16) | No |

The proposed `chennai-world/` tree from the brief is **not** recommended as a new top-level folder. The pieces map onto `tools/geo`, `tools/blender`, `assets/` and the existing packages without reorganising the repo.

## 9. Dataset acquisition plan for Chennai

All downloads happen on a build machine, once per data refresh. The APK stays offline.

| Dataset | How | Size (*estimate*) | Notes |
|---|---|---|---|
| OSM | openstreetmap.fr Tamil Nadu PBF (as today) or Geofabrik southern-zone PBF, then osmium clip to the chosen boundary | 124 MB PBF; about 200 MB JSON for the Corporation area | Already in use. Add multipolygon handling. |
| Overture buildings | DuckDB Spatial reading the public GeoParquet release over S3/Azure with a bounding-box filter on `bbox` columns; pin a release date | 50–300 MB GeoParquet for the area | ODbL. Includes OSM, Microsoft, Google and Esri footprints with a `sources` field. **Preferred second source.** |
| Google Open Buildings 2.5D Temporal | Earth Engine export of the height raster for the area (needs a free Earth Engine account) | 30–80 MB GeoTIFF at 4 m | CC BY 4.0 or ODbL (choose ODbL to keep one licence). Heights only; footprints come from Overture/OSM. |
| Google Open Buildings v3 polygons | Per-tile CSV download | 100–500 MB for the tiles covering Chennai | Only if Overture lacks them. Overture already includes them. |
| Microsoft Global ML footprints | Per-country quadkey files | Large for India; clip | ODbL. Mostly duplicated inside Overture: skip unless the coverage report shows gaps. |
| Terrain | Copernicus GLO-30 DEM (free, with attribution); CartoDEM (NRSC Bhuvan, registration, licence *to verify*); SRTM | Under 20 MB for the area | Low value on flat Chennai. Use only for bridge clearances and the beach slope, and say so. |
| Street imagery | Mapillary API (images CC BY-SA 4.0); OpenAerialMap (per-image licence, often CC BY 4.0) | n/a | **Not for automatic textures** (§10, §13). |

## 10. Dataset licensing and compatibility assessment

- **OSM, Overture buildings, Microsoft footprints:** all ODbL. Combining them gives a Derived Database under ODbL.
  - The game itself is a Produced Work: attribution is enough. Today that's "© OpenStreetMap contributors" with the extract date.
  - **If the derived database is "publicly used", it or a way to rebuild it must be offered under ODbL.** The world files are committed, so offering them, or the build scripts plus dataset manifest, satisfies this. *To confirm with whoever owns the release.*
- **Google Open Buildings:** offered under CC BY 4.0 **or** ODbL. Choosing ODbL avoids mixing licences.
- **Copernicus DEM:** free with attribution (*verify* the current licence text at download).
- **Mapillary imagery:** CC BY-SA 4.0. Textures *derived* from it are share-alike: they would have to be released CC BY-SA, and people and number plates are only blurred, not removed. The API terms also limit bulk download (*to verify*). **Recommendation:** use it only as visual reference for modelling by hand or script, not as texture source.
- **Google Maps, Street View, Photorealistic 3D Tiles:** excluded. Their terms forbid storing or deriving (see the companion note).
- **Tools:**
  - GDAL (MIT/X), GeoPandas (BSD), Shapely (BSD), DuckDB (MIT), PyProj (MIT), Rasterio (BSD), OpenCV (Apache 2.0), Segment Anything 2 (Apache 2.0), PaddleOCR (Apache 2.0), COLMAP (BSD), Nerfstudio (Apache 2.0).
  - Blender is GPL, but its **output** (models) is not covered by the GPL.
  - *Verify each at the time of adoption.*
- **Fonts:** Noto Sans Tamil and Devanagari are already embedded under OFL (`assets/fonts/OFL.txt`).

## 11. Building reconstruction architecture

**Fusion (build time, `tools/geo/`):**
1. Load OSM buildings (with multipolygons) and Overture buildings for the area, both in WGS84.
2. For matching only, project to UTM 44N (EPSG:32644) so areas and distances are in metres. **The output geometry is converted with the game's `GeoProjection`, not UTM**, so the runtime keeps one transform.
3. Match footprints:
   - candidate pairs from an R-tree;
   - intersection over union ≥ 0.5, or containment ≥ 0.8, counts as the same building;
   - several small ML footprints inside one OSM footprint are absorbed;
   - an ML footprint with no OSM overlap becomes a **new building**, flagged `source=overture:<origin>` with Overture's confidence where given.
4. Attributes, by priority:
   - Height: OSM `height` > OSM `building:levels` × floor height > Overture `height`/`num_floors` > Open Buildings 2.5D (median of the 4 m raster cells inside the footprint) > today's rule-based estimate. Record `heightFrom` with new values (`overture`, `openbuildings`) and **keep all non-OSM values labelled estimated** (AGENTS.md).
   - Kind and archetype: OSM tags and Overture `class`, then rules by footprint size, height, neighbours and land use.
5. Validate: repair invalid polygons; drop slivers under 6 m²; flag overlaps between kept buildings; check every building lies inside one chunk's box for assignment (assigned by centroid, as today).
6. Output the canonical table (§12) and a **coverage report** per district: count, area, height source mix, new buildings added.

**Runtime building generation (in `game-engine`, phone):**
- Per building: archetype → facade plan → kit pieces from an atlas → merged into the chunk's walls, roofs and kit meshes, as today.
- 40 archetypes are **parameter sets**, not 40 models: floor height, bay width, ground-floor use, balcony type, chajja depth, roof form, parapet, tank, stair tower, compound wall and gate.
- Kit pieces come from Blender (§14) at about 50–400 triangles each, in one shared atlas.
- **LOD:**
  - LOD0 (under 60 m): kit pieces.
  - LOD1 (60–200 m): walls with the facade texture only, as today.
  - LOD2 (over 200 m): plain extrusion with baked colour.

  Implemented as separate merged meshes per chunk and per LOD, swapped on distance from the chunk's centre (3 extra meshes per chunk, not per building).
- **Landmarks** (Chennai Central, Ripon Building, Egmore, High Court, LIC, Kapaleeshwarar gopuram, Santhome, Valluvar Kottam, Anna Nagar Tower): one GLB each, about 5k–15k triangles, one draw call, placed by their OSM outline (`LandmarkView`).

## 12. Canonical geographic data model

One versioned intermediate table, written by `tools/geo`. It is GeoParquet (WGS84), separate from the runtime codec:

| Field | Type | Notes |
|---|---|---|
| `fid` | string | Stable id: `osm:w123`, `ovt:<gers-id>`, `gob:<plus-code>` |
| `ftype` | enum | building, road, junction, deck, shop, street_object, landmark, tree, area |
| `source` / `source_id` | string | Dataset and the id in it; **never dropped** |
| `sources_merged` | list | Ids absorbed in fusion |
| `geometry` | WKB | WGS84 |
| `chunk` | string | `C_R`, from the game projection |
| `attrs` | struct | Height, levels, kind, archetype, roof, material, colour, width, lanes, surface, condition… |
| `attr_from` | struct | Where each attribute came from: `osm`, `overture`, `openbuildings`, `rule`, `procedural` |
| `confidence` | float | Source confidence or a rule score |
| `licence` | string | ODbL, CC BY 4.0… |
| `recon_method` | enum | procedural, kit, landmark-model, photogrammetry |
| `asset_ref` / `asset_version` | string | For landmarks and special assets |
| `quality_level` | enum | standard, detailed, landmark |
| `schema_version` | int | Bump on any change |

`scripts/build-world.ts` then reads OSM plus this table and writes **chunk codec v2**: a version byte, then per building `archetype`, `heightFrom`, roof form and a 32-bit provenance index into a per-world source table. Size is *estimated* at +30–50 % per chunk.

## 13. AI-assisted image reconstruction architecture

This is a build-time, opt-in pipeline for selected streets. The APK carries no AI models.
- **Inputs:** your own GPS-tagged photos or videos of chosen streets (this avoids the licence problems of §10), with optional Mapillary images as reference only.
- **Steps:**
  1. Extract frames (ffmpeg) and drop blurry or duplicate frames (OpenCV variance of Laplacian, perceptual hash).
  2. Tie each frame to a GPS position and heading, and assign it to the nearest building footprint from §11.
  3. Segment facades with Segment Anything 2, and detect windows, doors and balconies with rules on top of those masks.
  4. Estimate floor count and bay rhythm, and write the archetype parameters (§11) for that building, with `recon_method=photo-assisted`.
  5. OCR signboards with PaddleOCR **only if you decide real names are allowed** (§21). Otherwise record the shop category only.
  6. For landmarks only: COLMAP photogrammetry. Then **retopologise by hand** to a game mesh with baked textures. Never ship the raw mesh or Gaussian splats.
- **Mandatory before anything ships:**
  - a human review of every building changed this way;
  - faces and number plates removed from any image used for textures;
  - a comparison screenshot against the reference.
- **Effort:** high. **Value:** high for 2–3 showcase streets, low across the whole city. Keep it as Phase 5.

## 14. Blender generation architecture

- Use Blender 5.x, the version `docs/realism-plan.md` names. It has to be installed on the build machine (it isn't in CI or in this container), run headless via `scripts/blender.mjs` as the props are today.
- Scripts:
  - `tools/blender/kits/facade_kit.py`: window bays (3 styles), balcony railings (4), chajjas, shutters, a stair tower, a tank stand, parapets, a gate and a compound-wall module. Each piece has LOD0/LOD1 versions and shares one 1024 px atlas (512 px on phones).
  - `tools/blender/kits/street_kit.py`: tea kadai, pushcarts (fruit, vegetable, flower), petty shop counter, transformer, pole with cross-arms, cable spans (generated at run time between poles as thin ribbons), neem tree, bin, parked scooter.
  - `tools/blender/landmarks/*.py`: one script per landmark from its OSM outline and reference photos.
  - `tools/blender/trains/*.py`: see the companion note.
- Geometry Nodes are fine **inside** Blender for authoring. The game consumes exported meshes, never node trees.
- Export through `npm run optimize:assets`: glTF Transform, meshopt, WebP 512 px. KTX2/Basis is worth testing: it saves GPU memory, and three.js supports it through `KTX2Loader`. That needs the Basis transcoder (WASM) in the bundle (*measure the size*).

## 15. Three.js integration plan

- **Chunk layers inside the existing `ChunkView`** (no new renderer):
  - L0 ground, roads and junctions;
  - L1 buildings, with LOD meshes;
  - L2 kerbs, dividers, decks and markings;
  - L3 furniture, props and vegetation;
  - L4 parked vehicles (today placed by `content.ts`);
  - L5 traffic and people (already separate systems).

  `ChunkManager` gets per-layer distances, for example L3 only within 120 m. Its step-by-step build already orders work that way: ground → furniture → buildings → props → trees.
- Archetype facades build from kit pieces in `FacadeKit` (extended), merged per chunk. That keeps 3–6 draw calls per chunk for buildings.
- Road surface condition comes from a vertex attribute, the profile index. A shader variant mixes crack, patch and wear tiles from one atlas. Potholes and manholes are instanced decals. Big defects (speed breakers, large potholes) become physics boxes or trimesh pieces in `chunkSolids`.
- Decks: a `deck` geometry type from `bridge=yes` + `layer`, with ramps derived from the connecting ways. Physics adds a trimesh per deck. **The risk:** AI traffic and pedestrians assume y = 0 today (`packages/ai`). Deck-aware traffic needs road heights in `roads.bin`. Plan this as its own phase step.

## 16. Android performance risks

The measured baseline is thin:
- Your POCO M6 Pro 5G (Adreno 613, 6 GB) ran the game at about 50 fps, **by your report, not a measurement**.
- The CI emulator measured 57–60 fps.
- Spawn at lite tier: 178 draw calls and 248k triangles. The TD-18 budget is 230–300 draw calls and 300k triangles.

| Risk | Why | Mitigation |
|---|---|---|
| Chunk build CPU | Kit pieces add vertices per building; already about 20 ms per chunk on a desktop | Step-by-step build (done), LOD meshes, per-layer distances; build L3 only near the player |
| Triangles | 40 archetypes × detail | LOD0 only within 60 m; budget per chunk enforced by a test |
| GPU memory | More atlases | One facade atlas, one street atlas, one road atlas; 512 px on phones; KTX2 if measured worthwhile |
| Draw calls | Decals, decks, new props | Instancing per kind per chunk; decals merged per chunk |
| Physics | Deck trimeshes, bumps | Only significant defects; static colliders only |
| APK size | Chunk v2, landmarks, kits | *Estimate:* world files +30–50 %, kits and landmarks about 3–8 MB |
| Memory and GC | Per-chunk typed arrays | Dispose on unload (exists); reuse builders |

**Rule:** no performance claim without a measurement on a real low-end phone. The emulator and headless Chromium don't count.

## 17. Testing strategy

- **Python (`tools/geo`, pytest, new CI job):**
  - footprint validity;
  - duplicate matching on hand-made cases;
  - projection agreement with `GeoProjection` to 1 cm;
  - chunk assignment;
  - provenance never dropped;
  - coverage report thresholds.
- **Unit (Vitest):**
  - codec v2 round trip and version check;
  - archetype choice is deterministic;
  - kit facade triangle budget per building;
  - junction polygon validity;
  - deck and ramp continuity;
  - road condition only where rules allow;
  - signboards never use a real-name list unless enabled.
- **Browser (Playwright):**
  - reference screenshots at 6–8 fixed places (spawn, T. Nagar, Marina, Anna Salai, a flyover, a landmark), compared with a tolerance;
  - draw-call and triangle budgets per place (extend `look.spec.ts`);
  - LOD swap distances;
  - asset load and dispose (chunk count steady on a long drive);
  - offline (no network requests outside the app origin).
- **Android:**
  - the emulator smoke test logs memory (`dumpsys meminfo`);
  - a manual profiling checklist on your phone (fps, memory, temperature) per phase.

## 18. Phased implementation roadmap

| Phase | Deliverable | Depends on |
|---|---|---|
| 0b | Measurement run, no game change: download Overture and Open Buildings for the current box; coverage report (missing buildings, height coverage, tag coverage for width, lanes, surface, roof); this report updated with real numbers | Build machine with Python, DuckDB, GDAL; your answers to §21 |
| 1 | Fusion + canonical table + codec v2 with version + new height sources in the current box; coverage report in CI; credits page | 0b |
| 2 | Facade kit and 10 archetypes (Tamil terrace, modern house, apartment, commercial ×2–3 each) + LOD meshes, in the current box | 1, Blender on the build machine |
| 3 | Roads: junction polygons, zebra and speed breakers from OSM, surface profiles, decals; then decks and ramps (own step, with AI traffic heights) | 1 |
| 4 | Street kit (vendors, transformers, cables, neem, scooters, gates and compound walls) with land-use placement | 2 |
| 5 | Photo-assisted reconstruction of 2–3 showcase streets and 5–10 landmarks | 2, your imagery, the §21 name decision |
| 6 | Extend the clip to the chosen city boundary; regenerate; measure on phones; tune budgets | 1–4 |

Each phase ends with typecheck, unit tests, affected browser specs, CI green, an APK, and a phone check.

## 19. Exact files that would need modification

- **Pipeline:**
  - `scripts/clip-city.py` (boundary, multipolygons);
  - `scripts/build-world.ts` (read the canonical table, codec v2);
  - `scripts/fetch-osm.mjs` (tag list);
  - new `tools/geo/*` (fetch, fuse, validate, report, `pyproject.toml`);
  - new `assets/datasets/MANIFEST.json`, new `assets/LICENSES.md`.
- **map-data:** `src/osm.ts` (multipolygons, tag use), `src/projection.ts` (unchanged; add an agreement test), `src/index.ts`.
- **game-world:**
  - `src/types.ts` (Building: archetype, roof, `heightFrom` values, provenance; Road: surface, condition, deck, layer);
  - `src/buildWorldMap.ts` (`toBuilding`, `toRoads`, junctions, decks);
  - `src/codec.ts` (version, v2 fields);
  - `src/solids.ts` (decks, bumps);
  - `src/furniture.ts`, `src/props.ts` (new kinds, land-use placement);
  - `src/landmarks.ts`.
- **game-engine:**
  - `src/ChunkView.ts` (layers, LOD meshes, kit facades);
  - `src/ChunkManager.ts` (per-layer distances);
  - `src/FacadeKit.ts`, `src/kitAtlas.ts`, `src/textures.ts`;
  - `src/GroundMeshes.ts` (junctions, condition attribute, decals);
  - `src/StreetFurniture.ts`, `src/StreetProps.ts`, `src/LandmarkView.ts`, `src/shopSigns.ts` (only if the real-names decision changes);
  - `src/SceneRenderer.ts` (KTX2 loader if adopted).
- **physics:** `src/PhysicsWorld.ts` (deck colliders).
- **ai:** road heights for decks (`src/Agents.ts`, roads usage).
- **app:**
  - `apps/game/src/WorldFiles.ts` (codec v2, landmark GLBs);
  - `apps/game/src/Game.ts` (wiring only);
  - `apps/game/tests/*` (new specs, budgets);
  - About/credits UI in `packages/ui/src/TitleScreen.ts`.
- **Assets and tools:** `tools/blender/kits/*`, `tools/blender/landmarks/*`, `scripts/optimize-assets.mjs`, `assets/README.md`.
- **Docs:** `docs/technical-decisions.md` (new TDs: fusion, codec v2, archetypes, decks), `docs/architecture.md`, `docs/development-roadmap.md`, `docs/progress.md`, `docs/handoff.md`, `AGENTS.md` (only if TD-18 changes).

## 20. Storage, processing and memory estimates

All of these are *estimates*, with their assumptions stated.

- **Area:** current box about 117 km² of chunks; the Corporation area about 426 km² (*verify*), so ×3.6. The metropolitan area is far larger.
- **Buildings:** today 106,619 (OSM). Corporation area from OSM alone: about 390k (×3.6). Overture with ML footprints could add a large share; India's ML coverage is dense. Assume 0.5–1.2 M buildings until Phase 0b measures it.
- **World files:**
  - today 3.5 MB of chunks + 0.5 MB index + 0.85 MB roads;
  - ×3.6 area, ×1.4 for codec v2 fields, ×1.5–3 if ML footprints add buildings;
  - roughly **20–50 MB**. That's fine for an APK, and streamed so not all in memory.
- **Build machine:**
  - about 20 GB free disk (PBF, Overture extract, rasters, intermediates);
  - 16 GB RAM for DuckDB and GeoPandas on about 1 M polygons;
  - fusion runs in minutes;
  - Blender kits in minutes;
  - photogrammetry per landmark takes hours, and a GPU helps.
- **Phone at run time:** the number of chunks within 250 m doesn't change with city size; building detail and LOD change the cost per chunk. Target: no more than today's draw-call and triangle budget at the densest place, enforced by tests. **Phone memory for the richer chunks is unknown until measured.**

## 21. Decisions needed from you before Phase 1

1. **"Entire Chennai":** the Greater Chennai Corporation area (about 426 km², ×3.6 today), or the Chennai Metropolitan Area (much larger)?
2. **Real business names on signs:** your brief allows verified names; AGENTS.md and TD-18 forbid them. Keep the rule (recommended: legal and trademark risk, and data goes stale), or change it for verified names only?
3. **Imagery:** your own captures (recommended), Mapillary as reference only, or neither?
4. **Open Buildings licence choice:** ODbL (recommended, one licence) or CC BY 4.0?
5. **A build machine:** where can Blender, Python geo tools and about 20 GB be set up? Not this container's CI, and Blender isn't in CI today.
6. **Pilot detailed areas:** suggest Anna Nagar (spawn), T. Nagar Ranganathan Street, Mylapore around Kapaleeshwarar, Marina and Triplicane, George Town or Parry's. Or name your own.

## Sources

- Repo: `assets/osm/README.md`, `scripts/build-world.ts`, `packages/map-data/src/{osm,projection}.ts`, `packages/game-world/src/{buildWorldMap,codec,solids,types}.ts`, `packages/game-engine/src/*`, `docs/realism-plan.md`, `docs/technical-decisions.md` (TD-1, TD-3, TD-11, TD-16, TD-18, TD-24).
- Measurements: `apps/game/public/world/` file sizes (this note); building height sources (companion note).
- Dataset and licence URLs: see the companion note's Sources (Overture buildings guide, Google Open Buildings 2.5D, Microsoft Global ML Building Footprints, Cesium terms). Also Mapillary licence https://help.mapillary.com/hc/en-us/articles/115001770409 and Copernicus DEM https://spacedata.copernicus.eu/collections/copernicus-digital-elevation-model (*verify current terms at download*).
