# Street-level imagery for real Chennai streets (prototype, G-510 to G-519)

Branch `agent/godot-streetref`, 25 Nov 2026. Goal from the owner: make the game's streets look like real
Chennai streets using legitimately available street-level imagery. This is the prototype: a discovery tool,
a licence-safe workflow, a facade category spec and a comparison page. **No imagery could be reached from the
build sandbox, so nothing here is derived from real photographs yet** (section 3). Every data value says so.

Hard rules (owner): Mapillary is the primary source, KartaView the secondary one. Google Street View is only
ever looked at by a human; nothing is scraped, downloaded, extracted, trained on or derived from Google, and
there is no Google code. Tokens come from environment variables, never from the repository. No fake API
responses, no invented coverage numbers, no placeholder claimed as a reconstruction. Reference photographs are
never stored in the repository.

## 1. Plan: where imagery facts plug into the existing pipeline

### 1.1 Today's pipeline (read from the code, not changed)
- **Data.** OpenStreetMap is the primary source (G-5x data decisions; fusion with Overture/Microsoft/Google
  Open Buildings is on hold). `tools/geo` (`chennai_geo`) turns the extract into the world files under `world/`:
  `world.json` (grid, bounds, datasets), `tiles/<tc>_<tr>/` with `roads.bin`, `chunks.bin`, `areas.bin`,
  `detail.bin`, `infra.bin`. Positions are world metres (+X east, -Z north) from one equirectangular projection
  around the Anna Nagar origin (13.085 N, 80.2101 E); the game reads them only through `WorldSource`.
- **Grid.** 250 m chunks (`CHUNK_SIZE`), 40 x 40 chunk region tiles, rings 0 to 3; the grid origin is in
  `world.json` (`grid.minX/minZ/cols/rows`, today 196 x 410 chunks).
- **Per chunk (worker threads, no nodes).** `src/game_world/city/` plans the content: `RoadStyle` (road class ->
  footpath, verge, surfaces, estimated from Tamil Nadu streets), `RoadDetail`, `RoadLamps`, `StreetFurniture`,
  `StreetProps`, `TreePlan`/`TreeStyle`, `AreaPalettes` (district wall/roof colours and storey weights from
  `data/areas/palettes.json`, all estimated). `Building` carries footprint, height, floors, `kind` (`house`,
  `apartments`, `commercial`), `color_hex`, optional OSM detail (`building:colour`, roof shape, shop category).
- **Meshes (`src/game_engine/city/`).** `BuildingMeshes` merges a chunk's buildings into three surfaces: walls
  (one facade atlas of windows, balconies, doors, shops, with chajja sunshades and balcony slabs merged in),
  roofs (flat terraces, clay-tile hips on about a third of low houses, black water tanks) and a kit (rolling
  shutters, signboards, railings). `ShopSigns` paints category words (Tamil and English, never business names).
  Variety is chosen deterministically from the building id; OSM tags always win over estimates.
- **Android limits.** About 230 to 300 draw calls, VRAM-compressed textures (ETC2/ASTC), a 2.5 ms main-thread
  budget for streaming work, nothing blocks the main thread (`docs/performance.md`, G-470/471). A new facade
  parameter must cost no extra draw call and no extra atlas; texture size is on the APK budget (`docs/app-size.md`).

### 1.2 Where imagery-derived facts plug in (and what they must not touch)
Imagery enters **only as data that parameterises existing choices**, the same way `AreaPalettes` does today:

| Hook | Reads | Effect |
|---|---|---|
| A facade category per building | `assets/street_ref/facade_categories.json` (and later per-area overrides from observations) | picks wall palette, floor count range, windows per bay, balcony/shutter/gate probabilities, signboard slot counts, roof type weights for a `Building` of that category, replacing the three-way `kind` switch inside `BuildingMeshes` |
| Per-district observation overrides | `assets/street_ref/observations/*.json` | shifts palette weights and storey bins of an `AreaPalettes` area when hand-reviewed observations disagree with the estimate (marked observed) |
| Street-level furniture | observations of gates, compound walls, tanks, sunshades | probabilities in `StreetFurniture`/`StreetProps`, never positions from photos |
| Reference list | the coverage report's manual list | tells a human which streets to look at |

It must not: change world coordinates, building footprints, collision, navigation or chunk contents' identity;
replace the OSM/fusion data decisions; add textures cut from photographs; or add a draw call. Everything is
chosen from the same building-id hash, so a chunk looks the same each time it loads. **Not wired in this
branch**: the data and tools exist; the game does not read them yet (`src/` is untouched here, so the game test
suite was not re-run, see section 8).

## 2. The discovery tool (`tools/imagery/`)

```
cd godot-chennai/tools/imagery
export MAPILLARY_TOKEN=MLY|...            # free client token; KARTAVIEW_TOKEN is optional
python -m street_imagery discover --provider mapillary --db imagery.sqlite            # Anna Nagar box by default
python -m street_imagery discover --provider kartaview --bbox 13.07,80.195,13.10,80.228 --db imagery.sqlite
python -m street_imagery report   --db imagery.sqlite --out report.md --json report.json
python -m street_imagery export   --db imagery.sqlite --out images.jsonl
python -m street_imagery check            # validate assets/street_ref/
./run_tests.sh                            # mypy + check + pytest (no network)
```
Use the geo venv (`/opt/tools/geo-venv`, or `$GEO_PYTHON`): the chunk grid and roads come from `chennai_geo`.

- `mapillary.py`: Graph API v4 `images` in a bbox, token in the `Authorization: OAuth` header (never in a URL,
  log or database), fields `id, geometry, captured_at, sequence, creator, compass_angle, is_pano` only (no
  thumbnail or image URL is ever requested). A full page (limit 2000) or a "reduce the data" error splits the
  box into quarters down to 0.0005 degrees. Missing token: exits 2 with the exact steps to get one.
- `kartaview.py`: API 2.0 `photo` in a bbox, paged by `hasMoreData`, optional bearer token.
- `http.py`: retry on 429 and 5xx, honours `Retry-After`, exponential backoff capped at 60 s; 401/403 raise an
  auth error and are not retried; proxy or DNS failures are a `NetworkError`. The clock (`sleep`) and the
  transport are injected, so tests never wait or touch the network.
- `store.py`: SQLite, primary key (provider, id) so duplicates are impossible, each image stored with its
  chunk (col, row) from `grid.py`; a `searches` table logs every tile as `ok` or `failed`. `export` writes JSONL.
- `grid.py`: the chunk grid read from `world/world.json` and the game's projection (a test cross-checks
  `chennai_geo.regions.world_grid`). `roads.py`: the game's own OSM roads from the world tiles.
- `coverage.py`: the report. **Honesty rule: a chunk or street is "without imagery" only if a successful search
  covered it; otherwise it is "not searched", and with no successful search the report says no coverage is known
  and prints zero counts.** Contents: chunks total / searched / with / without / not searched, photographs by
  provider, sequences, capture-year histogram, named streets covered (at least half the length within 30 m of a
  photograph) and the **manual reference list** of streets to inspect by hand.
- Parser tests use `tests/parser_fixtures.py`: made-up payloads shaped like the documented responses, labelled
  as such, used for parsing and client logic only, never as a report input.

**Unverified against the live APIs** (no access): exact response shapes, the Mapillary bbox size limit and
rate limits, KartaView parameter names (`bbTopLeft`, `bbBottomRight`, `itemsPerPage`, `page`) and its result
shape. They are written from the public documentation as recalled. The first real run will show where the
parsers need adjusting; failures are loud (`ProviderError`), never silent.

## 3. Reality check (run 25 Nov 2026, this sandbox)

What was actually tried, and what happened. Nothing below is invented; nothing was obtained.

| Attempt | Result |
|---|---|
| `curl https://graph.mapillary.com/images?bbox=80.20,13.08,80.21,13.09&fields=id&limit=1` | `CONNECT tunnel failed, response 403` (HTTP 000): the agent egress proxy denies the host |
| `curl https://api.openstreetcam.org/2.0/photo/?lat=13.085&lng=80.21&limit=1` (KartaView API, unauthenticated) | same 403 from the proxy |
| `curl https://kartaview.org/doc/` (the documentation) | same 403 from the proxy |
| `python -m street_imagery discover --provider kartaview` (the real tool, real transport) | `NetworkError: Tunnel connection failed: 403 Forbidden (agent proxy: no rule or network setting allows this host)`; logged as one failed search |
| `python -m street_imagery discover --provider mapillary` | stops with exit 2: `MAPILLARY_TOKEN is not set` (no token exists in the environment either) |
| `python -m street_imagery report` on that database | "No search has succeeded, so no coverage is known"; 182 chunks in the Anna Nagar box, all "not searched"; named OSM streets listed for manual reference with coverage n/a |

The proxy denial is a policy (not retried). No real responses exist, so none were saved. The report's
street and chunk counts come from the game's real world files; the imagery side is empty on purpose.

**Needed from the owner (blockers):**
1. A free Mapillary client token (create an app at mapillary.com/dashboard/developers, copy the client token),
   exported as `MAPILLARY_TOKEN` where the tool runs.
2. Network access from the machine that runs it to `graph.mapillary.com` and `api.openstreetcam.org` (in a Claude
   Code cloud session: add those two hosts to the environment's allowed hosts). `kartaview.org` is only needed to
   read the API documentation.
Then: run `discover` for both providers, `report`, and review the first results.

## 4. Licence analysis (honest, not legal advice)

What I understand, to be confirmed by the owner (and a lawyer if anything is shipped on it):
- **Mapillary** street-level imagery is published under **CC BY-SA 4.0**; using the API is also bound by
  Mapillary's API terms (an app registration and token, attribution, rate limits). The v4 `images` endpoint
  returns no licence field, so the tool records "CC-BY-SA-4.0" with `license_source: provider_terms` (stated by
  the provider's terms, not by the response); if a response carries a licence field the tool keeps that instead.
- **KartaView** contributed imagery is also **CC BY-SA 4.0** under its terms; likewise recorded as
  `provider_terms`.
- **Attribution** (BY) is needed for any use that reuses the images; the manifest keeps provider, image id,
  creator, capture date and an attribution line for every image referenced.
- **ShareAlike (SA)** applies to adaptations: a texture, facade or model made by tracing, projecting or
  cutting from a photograph is very likely an adaptation, so it would have to be offered under CC BY-SA 4.0
  too. Whether that reaches the whole game (a "collective work") or only that asset is exactly the uncertain
  part; it must not be assumed harmless. It would also clash with the project's "CC0/CC-BY with credit or
  original" asset rule in `assets/LICENSES.md`.
- **Facts are not expressions.** That a house has four floors, cream walls, a rolling shutter and a tank on the
  roof is information about a building, not the photographer's creative expression. Recording such facts by
  hand, and then generating original content from them, is the safe route: no photographic pixel, no tracing,
  no model trained on the pictures ships. Automated extraction (computer vision over the images) is a separate
  question under the API terms and is **not** done here.
- **Google Street View**: Google's terms forbid scraping and creating derivative works from its imagery. A
  human may look at it to understand what a street is like; nothing from it is collected by code, and the
  manifest rejects any Google provider or link. A fact seen by a person there is recorded as a
  `human_inspection` source (note and date, no image id).
- Copyright law of the country, and image-of-people or private-property concerns (faces, number plates are
  blurred by providers but not guaranteed) apply on top. Not analysed here.

### 4.1 Recommended (and implemented) workflow: observation only
1. Find imagery (`discover`), pick streets from the report.
2. A human views the images on the provider's site and records **facts** in
   `assets/street_ref/observations/<area>.json`, each fact `observed` (with the source image ids or a human
   inspection) or `estimated` (basis `general_knowledge`).
3. `assets/street_ref/manifest.json` lists every referenced image (provider, id, capture date, creator, licence,
   attribution, retrieved date, which observations use it). `python -m street_imagery check` enforces that: every
   cited id is in the manifest, every manifest row is cited, only Mapillary and KartaView rows, no link to an
   image file, no image file under `assets/street_ref/`, observed facts have sources, estimated facts say
   they come from general knowledge, colours are valid hex.
4. The game's facades and props stay **original generated content** parameterised by those facts. Credit the
   providers in the credits screen and `assets/LICENSES.md` (as source of observations) once any observed value
   is used.

### 4.2 Alternative, an owner decision: ship derived textures
Photographs turned into facade textures give the most "real" look and the least control: the textures (and
probably anything built from them) become CC BY-SA 4.0 adaptations with attribution per image, a maintained
credits list, the SA question above for the game's own licence, plus size cost (`docs/app-size.md`) and
privacy review. I recommend against it for this project; if the owner wants it, get legal advice first and
keep derived assets in a separate, clearly licensed pack.

## 5. Facade categories (`assets/street_ref/facade_categories.json`, G-512)

Seven categories: residential house, independent house, apartment, commercial, retail shop, office,
institutional. Each has the fields `palette`, `floors`, `windows`, `balconies`, `gates`, `shutters`,
`signboard_slots`, `roofs`, each with `status` (`observed` or `estimated`) and, for estimated, `basis:
general_knowledge` plus a note. **All 56 fields are `estimated`**: they come from the author's general
knowledge of Chennai streets (painted cream, yellow, pastel walls, flat terraces with black tanks, sunshades,
rolling shutters, grille windows, painted iron gates), not from imagery. `game_kind` maps each to the existing
`Building.kind` (`house`, `apartments`, `commercial`; institutional and office use `commercial` plus the
detail category) so a future reader needs no format change. Validator and tests:
`street_imagery/validate.py`, `tests/test_validate_cli.py`. Not read by the game.

## 6. Comparison page (`tools/imagery/prototype/`)

`index.html` (built by `build_prototype.py` from the JSON, kept in sync by a test) draws three random facades
per category as inline SVG from the ranges (palette pick, floors, bays, windows with grille or sliding panes,
sunshades, balconies, rolling shutters, blank signboard plates, gate, roof, tank) beside a table of values with
observed/estimated pills. No photograph, no external request. `screenshot.mjs` renders it with the
pre-installed Chromium and fails on any page error or external request
(`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node tools/imagery/prototype/screenshot.mjs out.png`).
The drawings are deliberately flat and schematic: they show the direction and ranges, not final art.

## 7. Adding another neighbourhood
1. Add its box (S,W,N,E) to your command: `--bbox`. If the area is outside the built world, the grid and roads
   still come from `world/` (the world grows by rings; chunks outside the built tiles have no roads yet).
2. `discover` for both providers into one database, then `report --bbox ...`; read "not searched" separately
   from "without imagery".
3. Copy `observations/anna_nagar.json` to `observations/<area>.json`; add observations by hand only after
   looking at the images, filling the manifest rows for every image you cite; run `check`.
4. Adjust `facade_categories.json` only where observations disagree with an estimate, changing that field to
   `observed` with sources (the validator requires them).
5. If the area has its own palette in `data/areas/`, align the area's wall and storey weights with the observed
   fields in a separate, tested game change.

## 8. Weak spots and not done
- Nothing observed: no imagery reached, so manifest and observations are empty and facade fields are estimates.
- API details unverified (section 2). The Mapillary box-area limit and rate limits are not verified.
- Not wired into the game; the mapping to `BuildingMeshes` is a proposal (section 1.2).
- The swatches are schematic and use plain colours; they say little about proportions of real streets.
- Street coverage uses points within 30 m of a photograph; a photograph may not face the buildings (the
  compass angle is stored but not yet used).
- The game suite (`./run_tests.sh`) was skipped: only tools, docs and data outside what the game reads changed.
