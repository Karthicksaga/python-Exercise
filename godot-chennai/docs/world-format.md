# World format 2: the regional world (Chengalpattu to Pulicat)

This is the data the Godot game streams: `godot-chennai/world/`. It is written by the build-time
Python tools in `godot-chennai/tools/geo/` (reference implementation: `chennai_geo/codec_v2.py`,
`writer.py`; tests in `tools/geo/tests/`). Decisions behind it: G-20 to G-29 in
`technical-decisions.md`. Today's format 1 (`chennai-open-world/packages/game-world/src/codec.ts`)
is described at the end, with the converter path between the two.

A reader needs nothing but this page. Everything is little-endian. Strings in JSON are UTF-8.

## 1. Coordinates (unchanged from today, TD-2)

- One fixed geographic origin, Anna Nagar Roundtana: `lat 13.085, lng 80.2101`
  (`world.json` `origin`).
- Equirectangular local tangent plane, metres: `x = (lng - lng0) * DEG * R * cos(lat0 * DEG)`,
  `z = -(lat - lat0) * DEG * R`, with `R = 6371008.8`, `DEG = pi / 180`. +X east, +Y up,
  **-Z north**. Inverse: `lat = lat0 - z / (DEG * R)`, `lng = lng0 + x / (DEG * R * cos(lat0 * DEG))`.
- This is exactly `GeoProjection` in `chennai-open-world/packages/map-data/src/projection.ts`; the
  Python port agrees with it to 1 cm on 12 reference points across the world
  (`tests/fixtures/projection_reference.json`, written by node from the TS file).
- The world reaches about 28 km west, 21 km east, 53 km north and 45 km south of the origin, so
  the game uses a floating origin (Foundation G-7); file coordinates stay world metres.
- Quantum: **5 cm** (`Q = 20` steps per metre) in every binary file.

## 2. Grid, tiles and rings

| Thing | Size | Index |
|---|---|---|
| Chunk | 250 m square | global `(col, row)`; chunk (0, 0) starts at `world.json grid.minX, grid.minZ` |
| Region tile | 10 km = 40 × 40 chunks | `(tc, tr) = (floor(col / 40), floor(row / 40))` |

- `col = floor((x - grid.minX) / 250)`, `row = floor((z - grid.minZ) / 250)`; the chunk centre
  is `(grid.minX + (col + 0.5) * 250, grid.minZ + (row + 0.5) * 250)`.
- The grid is **aligned with today's chunks**: today's `c/<c>_<r>.bin` is chunk
  `(c + legacy.colOffset, r + legacy.rowOffset)` = `(c + 107, r + 225)`, with the same centre,
  so the same quantised offsets.
- Today: grid `minX -28365, minZ -57341`, 196 × 410 chunks, 5 × 11 tiles (47 with content).
  Readers must take every number from `world.json`, never from constants.
- **Rings** (MIGRATION_PROMPT §9 build order). Each ring is a lat/lng box intersected with the
  world boundary; rings nest. A chunk's `ring` is the smallest ring whose area overlaps the
  square. A build has a `maxRing`; everything in it is inside ring `maxRing`'s area.

| Ring | Box (S, W, N, E) | What |
|---|---|---|
| 0 | today's exact bounds (from 12.98, 80.195, 13.095, 80.29, inset 20 m: x -1615..8633, z -1091..11655) | Anna Nagar to T. Nagar, Anna Salai, Marina |
| 1 | 12.82, 80.10, 13.24, 80.40 | the whole city, the airport, Tambaram, Avadi, Tiruvottiyur, Ennore |
| 2 | 12.75, 80.00, 13.40, 80.40 | suburbs and corridors: GST Road, Sriperumbudur road, Red Hills, OMR, ECR |
| 3 | 12.68, 79.95, 13.60, 80.40 | rural edges to the state border: Chengalpattu, Sriperumbudur, Gummidipoondi, Pulicat |

- **World boundary** (`godot-chennai/data/boundary/world-boundary.geojson`, lng/lat, committed):
  the ring-3 box ∩ the OSM Tamil Nadu polygon (admin_level 4), plus the sea east of the coast
  south of where the state border meets the coast (13.5639 N; north of it the water is Andhra
  Pradesh's). `world.json boundary` is the same polygon in local metres (simplified to 5 m).

## 3. Files

```
world/
  world.json                       always loaded (≈120 KB)
  ATTRIBUTION.md, REPORT.md, reports/<tc>_<tr>.md
  tiles/<tc>_<tr>/tile.json        per tile: chunk table, points, airport, names
  tiles/<tc>_<tr>/chunks.bin       every chunk file of the tile, packed ("COWP")
  tiles/<tc>_<tr>/roads.bin        road pieces of the tile ("COWR" v2)
  tiles/<tc>_<tr>/areas.bin        whole areas of the tile, simplified ("COWA"), for map/far layer
  tiles/<tc>_<tr>/infra.bin        format 2.1 only: road heights, waterways, street spots ("COWI", §3.7)
```

A reader loads `world.json`, then the tiles around the player (3 × 3 tiles covers 10 km in every
direction; at 250 m chunk streaming one tile's `tile.json` + `roads.bin` is enough near its
middle). Tiles are keyed by `tc_tr`, which may be any integer (signed) in principle; in this
world they are all ≥ 0.

### 3.1 `world.json`

| Key | Type | Meaning |
|---|---|---|
| `format` | int | **2**. Refuse anything else. |
| `name` | string | "Chennai" |
| `origin` | {lat, lng} | geographic origin (§1) |
| `projection` | object | `{type: "equirectangular", earthRadius: 6371008.8, axes}` |
| `attribution`, `licence`, `dataDate` | string | "© OpenStreetMap contributors", ODbL 1.0, OSM data timestamp (ISO 8601) |
| `source` | object | dataset manifest entries (URL, sha256, timestamps) and the boundary file |
| `chunkSize`, `tileChunks`, `tileSize` | int | 250, 40, 10000 |
| `grid` | {minX, minZ, cols, rows} | §2 |
| `bounds` | {minX, maxX, minZ, maxZ} | bounding box of the built area (ring `maxRing`) |
| `boundary` | [[x, z], …] | built area's outline, local metres, not closed |
| `maxRing` | int | rings 0..maxRing are in the files |
| `rings` | [{id, name, box {south, west, north, east}, built}] | §2 |
| `legacy` | {colOffset, rowOffset} | today's chunk numbering |
| `datasets` | [string] | provenance dataset table (§4); index = the `dataset` byte |
| `tiles` | [[tc, tr, chunkFiles, bytes, firstRing]] | every tile directory |
| `landmarks` | [Landmark] | as today's `index.json` (id, kind, name, x, z, height?, levels?, radius?, opened?, source, estimated) |
| `sea` | {coast: [{x, z}], outline: [{x, z}], source} | as today: the coastline (land on its left) carried 3 km past the edge, and the water's outline |
| `minor` | int | **1** from format 2.1 (absent = 2.0). Minor versions only add files and keys; a 2.0 reader ignores them |
| `infra` | {file, deckStep, note} | 2.1: the per-tile file name (`infra.bin`) and the deck sample step (5 m), §3.7 |

### 3.2 `tiles/<tc>_<tr>/tile.json`

| Key | Type | Meaning |
|---|---|---|
| `format` | int | 2 |
| `tile` | [tc, tr] | |
| `bounds` | {minX, maxX, minZ, maxZ} | the tile square |
| `rings` | [int] | rings present in the tile |
| `chunkPack` | "chunks.bin" | |
| `chunks` | [[col, row, offset, length, ring]] | every square with content, sorted by row then col. `length 0` = road surface only, no chunk record (as today's size-0 rows) |
| `roads`, `roadPieces`, `roadNames` | "roads.bin", int, [string] | road file, its piece count, its string table (names and refs; index + 1 in the file, 0 = none) |
| `areas` | "areas.bin" | |
| `pois` | [[kind, x, z, name?]] | OSM amenity/shop nodes; name only for hospital and clinic (as today) |
| `busStops` | [{x, z, name?}] | `highway=bus_stop` |
| `signals` | [{x, z}] | `highway=traffic_signals` |
| `districts` | [{name, kind, x, z}] | `place=suburb/neighbourhood/quarter/locality` (name:en preferred) |
| `settlements` | [{name, kind, x, z, population?}] | `place=city/town/village/hamlet/isolated_dwelling` (new) |
| `aeroways` | [{id, kind, source, closed, ref?, name?, width?, surface?, points: [[x, z]]}] | the airport (§11): `kind` from the aeroway table (§5); runways/taxiways are lines (`closed false`), aprons/terminals/hangars/helipads outlines (`closed true`, not repeated), gates/windsocks single points; `width` in metres where OSM maps it |

Points, aeroways and areas belong to the tile holding their position (areas and aeroway outlines
by vertex average).

### 3.3 `chunks.bin` (pack)

```
u32 magic   0x50574F43 ("COWP")
u16 format  2
i16 tc, i16 tr
u32 n
n × { i16 col, i16 row, u32 offset, u32 length }    offsets from the start of the file
then the n chunk records (3.4) back to back
```

`tile.json chunks` repeats the table, so a reader can seek straight to a chunk
(`FileAccess.seek(offset)`, `get_buffer(length)`) without reading the header. The two must agree
(`check_pack`).

### 3.4 Chunk record (format 2)

Offsets are i16 steps of 5 cm from the **chunk centre** (±1638 m).

```
u32 magic 0x43574F43 ("COWC")          same magic as format 1; the version tells them apart
u16 format 2
i16 col, i16 row                        global grid
u8  ring
u8  reserved (0)
u16 nBuildings, u16 nTrees, u16 nAreas, u16 nSections

Building × nBuildings:
  u32 id                game id (§4)
  u8  dataset, u64 sourceId             provenance (§4)
  u8  nMerged, nMerged × { u8 dataset, u64 sourceId }   ids absorbed by fusion
  u16 height × 10       metres, top of the parapet/roof base above ground
  u16 minHeight × 10    building:min_height / min_height (0 = from the ground)
  u8  floors
  u8  kind              BUILDING_KINDS (house, apartments, commercial): today's meaning
  u8  heightFrom        HEIGHT_FROM
  u8  use               BUILDING_USES (from building=*)
  u8  archetype         0 = not assigned yet (placeholder for the archetype step, blueprint §11)
  u8  roofShape         ROOF_SHAPES (from roof:shape)
  u8  roofLevels        roof:levels (0 = none mapped)
  u8  color             index into WALL_COLORS (12 painted-plaster colours, invented)
  u8  flags             1 levels mapped (building:levels used), 2 geometry repaired, 4 multipolygon part
  u8  nRings            1 + holes
  nRings × { u16 n, n × { i16 dx, i16 dz } }
                        ring 0 = outline, anticlockwise seen from above in this frame
                        (positive shoelace area with +X right, +Z down), last point not repeated;
                        rings 1.. = courtyards (holes), opposite winding

Tree × nTrees:          i16 dx, i16 dz, u8 scale × 100, u8 source (1 = OSM natural=tree, 0 = generated)

Area × nAreas:          the area cut to this square (Sutherland-Hodgman; with holes, exact clipping)
  u32 id                OSM id (way or relation; see dataset)
  u8  dataset, u64 sourceId
  u8  kind              AREA_KINDS
  u8  nRings            1 + holes
  nRings × { u16 n, n × { i16 dx, i16 dz } }

Section × nSections:    u32 tag (four letters, little-endian), u32 length, length bytes
                        Unknown tags are skipped. None are written yet; future per-chunk data
                        (street objects, decks, junction polygons) goes here without a format bump.
```

The decoder rounds each point to 0.01 m after adding the centre (`round(v * 100) / 100`), as
today. Trailing bytes are an error.

### 3.5 `roads.bin` (format 2)

Each road is split at tile edges: a segment belongs to the tile holding its midpoint, runs of
segments become **pieces**, and neighbouring pieces share their end point exactly. Join them by
`id` and `piece`. A piece may extend a little past its tile.

```
u32 magic 0x52574F43 ("COWR")
u16 format 2
i16 tc, i16 tr
u32 count
piece × count:
  f64 id                way id × 10 + i (i = piece of the way after clipping to the world): today's road id
  u16 piece             0, 1, 2… along the road, across tiles
  u8  kind              ROAD_KINDS (what the game draws)
  u8  class             HIGHWAY_CLASSES (the OSM highway=* value)
  u8  flags             1 oneway, 2 lanes mapped, 4 bridge, 8 tunnel (or covered), 16 roundabout, 32 lit
  i8  layer             OSM layer, -5..5 (0 = none)
  u16 width × 100       carriageway, metres
  u8  lanes             valid when flag 2
  u8  widthFrom         0 class estimate, 1 width tag, 2 lanes × 3.3 m + 0.8 m
  u8  surface           SURFACES (0 = not mapped)
  u8  sidewalk          SIDEWALKS (0 = not mapped)
  u8  maxspeed          km/h (0 = not mapped)
  u16 name              roadNames index + 1 (0 = none)
  u16 ref               roadNames index + 1 (e.g. "NH 48")
  u8  dataset, u64 sourceId       the OSM way
  f32 offset            metres along the whole road to this piece's first point (lane dashes stay in step)
  f32 total             length of the whole road, metres
  u16 n
  i32 x0, i32 z0        first point, world metres × 20
  (n - 1) × { i16 dx, i16 dz }    steps × 20; long segments are split so every step fits
```

Points run the way traffic goes on one-way roads (`oneway=-1` is reversed at build time).

### 3.6 `areas.bin`

Whole areas (not cut to chunks), outlines simplified to 1 m, for the minimap and the far layer.

```
u32 magic 0x41574F43 ("COWA"), u16 format 2, i16 tc, i16 tr, u32 count
area × count:
  u32 id, u8 dataset, u64 sourceId, u8 kind, u8 nRings
  nRings × { u32 n, i32 x0, i32 z0, (n - 1) × { i16 dx, i16 dz } }
```

### 3.7 `infra.bin` (format 2.1, decisions G-150…G-153)

Added on 24 Nov 2026 without touching any 2.0 file: the same PBF rebuilds every 2.0 file byte
for byte (sha256 of the extract in `data/MANIFEST.json`), plus one `infra.bin` per tile and the
`minor`/`infra` keys in `world.json`. 1.3 MB for the 47 tiles. Reference implementation:
`tools/geo/chennai_geo/infra.py` (tests `tests/test_infra.py`); GDScript reader `InfraTile`.

```
u32 magic   0x49574F43 ("COWI")
u16 format  2
u16 minor   1
i16 tc, i16 tr
u16 nSections
section × nSections: u32 tag (four letters, little-endian), u32 length, length bytes
                     (unknown tags are skipped)

"DECK"  f32 step (5.0)
        u32 count
        count × { u32 piece           index of the piece in this tile's roads.bin (file order)
                  u16 n               samples: along 0, step, 2 step … and the last at the piece's end
                  n × u16 height × 100   road surface above the ground, metres (estimated) }
        Only pieces that are raised somewhere are listed; every other piece lies on the ground.
"WATR"  u32 count
        count × { f64 id (way id × 10 + clip piece), u8 dataset, u64 sourceId,
                  u8 kind (WATERWAY_KINDS), u8 flags (1 tunnel/culvert or covered, 2 intermittent),
                  u16 width × 100 (OSM width, else river 30, canal 18, stream 6, drain 3, ditch 1.5),
                  u8 nameLength, name bytes (UTF-8, name:en preferred),
                  u16 n, i32 x0, i32 z0, (n - 1) × { i16 dx, i16 dz }   as roads.bin }
        Waterway centre lines (`waterway=river|canal|stream|drain|ditch`), split at tile edges
        like road pieces (a segment belongs to the tile holding its midpoint).
"SPOT"  u32 count
        count × { u8 kind (SPOT_KINDS), u8 flags (1 mapped in OSM; 0 placed by rule),
                  i32 x × 20, i32 z × 20, i16 yaw × 10000 (road direction, atan2(dx, dz)),
                  u16 width × 100 (the carriageway), f64 road id }
```

| Table | Values (index order, append only) |
|---|---|
| WATERWAY_KINDS | river, canal, stream, drain, ditch |
| SPOT_KINDS | zebra, signal_crossing, unmarked, bump, hump, table, cushion, rumble_strip |

**Deck heights (estimated, G-151).** OSM maps `bridge`, `tunnel` and `layer`, never heights. A
bridge chain (bridge roads joined end to end with the same `max(layer, 1)`) that crosses a lower
road or a railway is raised 6.5 m per layer above what it crosses (5.5 m clearance and the deck),
6 m for a footbridge, level for 100 m either side of every crossing, then down at 1:20; a chain
that crosses nothing mapped (a river, a culvert) is level at `1 + 0.02 × length` m (1.2…5 m).
Every other road gets the lowest heights that keep its grade within 1:20 (arterials), 1:14
(streets, service roads) or 1:3.3 (footways: stairs), propagated over the road graph from the
raised points, so heights agree at every shared node and across tile edges. Tunnels and covered
roads stay at ground level and stop the propagation. The build reports the crossings checked and
those with less than 4.5 m clearance (12 of 1,027 on 23 Nov data).

**Spots.** Mapped `highway=crossing` (zebra for `crossing=zebra|marked|uncontrolled` or zebra
markings, signal crossing, unmarked) and `traffic_calming=*` nodes, snapped to the widest drivable
road through the node; none on decks. Rule spots (invented, flag 0): a zebra on every arm of the
junction nearest a mapped traffic signal (within 25 m), set back half the widest road plus 2.5 m;
a speed breaker 14 m from the main-road end of 40 % of residential, unclassified and living
streets longer than 60 m (by a stable hash of the road id).

## 4. Ids and provenance

- **Game id** (`u32`, as today, feeds colour and estimated-floor variety via the TS `hash`):
  OSM way buildings keep their way id (the build fails if a way id reaches 2^31). Multipolygon
  relation parts: `0x80000000 | ((relationId << 3 | min(part, 7)) & 0x7FFFFFFF)`. New buildings
  from fusion: from `0x40000000` up (phase 2).
- **Provenance** is a `(dataset, sourceId)` pair, never dropped. `datasets` in `world.json`:

| dataset | Meaning of sourceId |
|---|---|
| 0 `osm:way` | OSM way id |
| 1 `osm:relation` | OSM relation id |
| 2 `osm:node` | OSM node id (64-bit; node ids already exceed 2^32) |
| 3 `overture:buildings` | index into the world's external-id table (`ids/overture.txt`, one GERS id per line; phase 2) |
| 4 `google:openbuildings` | index into `ids/openbuildings.txt` (plus codes; phase 2) |
| 5 `derived` | made by the build (none yet) |

The list only grows at the end.

## 5. Enumerations (append only; `tests/test_codec_v2.py` pins them)

| Table | Values (index order) |
|---|---|
| ROAD_KINDS | primary, secondary, tertiary, residential, service, footway, motorway, track, raceway |
| HIGHWAY_CLASSES | (none), motorway, motorway_link, trunk, trunk_link, primary, primary_link, secondary, secondary_link, tertiary, tertiary_link, residential, unclassified, living_street, service, footway, path, pedestrian, track, raceway, steps, cycleway, bridleway, busway, road |
| BUILDING_KINDS | house, apartments, commercial |
| HEIGHT_FROM | estimated, levels, height, overture, openbuildings, min-height |
| BUILDING_USES | unknown, house, residential, commercial, retail, office, industrial, warehouse, religious, school, hospital, public, transport, hangar, shed, garage, hut, construction, roof, other |
| ROOF_SHAPES | unknown, flat, gabled, hipped, pyramidal, dome, skillion, half-hipped, gambrel, mansard, round, onion, cone, saltbox, other |
| AREA_KINDS | park, water, beach, reservoir, wetland, farmland, orchard, meadow, scrub, forest, residential, commercial, industrial, military, cemetery, bare, saltpan, aerodrome, apron, sport, railway, helipad, mangrove |
| SURFACES | (none), asphalt, concrete, paved, paving_stones, sett, cobblestone, compacted, unpaved, gravel, fine_gravel, dirt, ground, earth, sand, grass, mud, wood, metal, other |
| SIDEWALKS | (none), no, left, right, both, separate |
| AEROWAY_KINDS (JSON strings) | runway, taxiway, apron, terminal, hangar, helipad, heliport, aerodrome, control_tower, gate, parking_position, holding_position, stopway, navigationaid, windsock, other |
| WALL_COLORS | 0xF2E3C6, 0xE8C9A0, 0xCFE3D4, 0xF4D6CF, 0xD9E2F0, 0xF7EDB5, 0xE3D5EE, 0xFBF3E4, 0xC9DCCB, 0xEAD9C4, 0xDFE7D2, 0xF1DDB8 |

The first entries of ROAD_KINDS, HEIGHT_FROM, AREA_KINDS are exactly format 1's tables.
`heightFrom` other than `height`/`levels` is **estimated** and must be called so in the game and
docs (AGENTS.md rule).

## 6. What the values mean (rules, from OSM tags)

Ported line for line from `buildWorldMap.ts` for everything today's game has (so ring 0 matches):

- Road kind and estimated width by class: trunk 16, primary 15, *_link 7 (tertiary_link 6.5),
  secondary 14, tertiary 10, residential/unclassified 7, living_street 6, service 4, footway/path 2,
  pedestrian 3; new: motorway 18, track 3.5, raceway 12, steps/cycleway 2 (footway), busway 7
  (service), road 6. Width = `width` tag (2..40 m) else `lanes` (1..10) × 3.3 + 0.8 (min 4) else
  the class estimate, rounded to 0.1 m. One-way: `oneway=yes/1/true/-1` or a roundabout.
- Building: dropped under 12 m²; height = `height` (2.5..250 m) else `building:levels` (1..60)
  × 3.1 + 0.9 parapet, else estimated (2 floors; tagged apartments 3–5, commercial 2–4 by a
  stable hash). Kind apartments/commercial from tags, else apartments over 420 m². Colour by hash.
  A building whose centroid lies in a landmark's footprint is left out (the landmark has a model).
- Areas: park (leisure park/garden/playground, landuse grass/recreation_ground), water
  (natural=water), beach (natural beach/sand) as today; then aerodrome, apron, helipad, reservoir
  (landuse reservoir/basin/aquaculture, waterway riverbank/dock), mangrove, wetland, forest, scrub,
  meadow, bare, farmland, orchard, residential, commercial, industrial (incl. port, depot),
  military, cemetery, saltpan, railway, sport (pitch, stadium, golf…).
- Trees: mapped `natural=tree` nodes (not on a carriageway) and generated avenue trees (every
  18 m on both sides of primary/secondary/tertiary roads) and park trees (one per ~110 m²), all
  deterministic.
- Kept on chunk squares: buildings and trees by position (building by vertex average), areas cut
  to every square they cover (in rings ≥ 1 only squares touching the built area).

## 7. Building the world

```
cd godot-chennai/tools/geo
python3 -m venv /opt/tools/geo-venv && /opt/tools/geo-venv/bin/pip install -r requirements.txt
apt-get install osmium-tool            # the osmium CLI, for the clip
PY=/opt/tools/geo-venv/bin/python
$PY -m chennai_geo.cli fetch           # TN PBF (124 MB) -> ../../data/raw/, records data/MANIFEST.json
$PY -m chennai_geo.cli boundary        # only when the boundary should be re-derived
$PY -m chennai_geo.cli clip            # osmium extract to the boundary (smart strategy; 12 s)
$PY -m chennai_geo.cli build --max-ring 3   # -> godot-chennai/world/ + REPORT.md (about 2 min, 3 GB RAM)
$PY -m chennai_geo.cli compare         # ring 0 with today's rules vs today's committed world
./run_tests.sh                         # pytest, no network
```

`data/raw/` is git-ignored. Rebuilding with the same PBF gives the same bytes.

## 8. Format 1 and the converter path

Format 1 is today's `index.json` + `roads.bin` + `c/<c>_<r>.bin` (one rectangle, version field
`u16 1` after the magic). `chennai_geo/codec_v1.py` is a port of `codec.ts`; it decodes and
re-encodes all 1,877 of today's chunk files and `roads.bin` **byte for byte** (test).

- Today → format 2: `cli.py convert-v1 [IN] OUT` (v2-only fields get defaults: provenance = OSM
  way, roof unknown, no holes, archetype 0, ring 0).
- OSM → format 1: `cli.py build-v1 OUT` builds ring 0 with the v1 rules only (no multipolygons,
  no repair, v1 road classes and area kinds) and writes today's three files, for side-by-side
  comparison with the Three.js game.
- Ring 0 of the format-2 world reproduces today's counts (test, tolerances in
  `tests/test_ring0_regression.py`): 23 Nov data, v1 rules: 106,622 buildings (today 106,619),
  20,724 road pieces (20,625), 44,570 trees (44,541), 533 bus stops, 266 signals, 238 districts,
  the same 4 landmarks at the same positions, heights from OSM 3,596 (3,593).

## 9. Fusion (phase 2, designed, not run)

`chennai_geo/fusion.py`: `fuse(osm_buildings, external, raster)` with the `FootprintSource`
(Overture via DuckDB + GeoParquet bbox filter) and `HeightRaster` (Open Buildings 2.5D export)
interfaces. Matching in UTM 44N (IoU ≥ 0.5, or ≥ 0.8 contained; several small footprints inside
one OSM building are absorbed); output back through `GeoProjection`. Height priority: OSM
`height` > `levels` > external height/floors (`overture`) > raster median (`openbuildings`) >
estimate. Absorbed ids go to `merged`; new buildings get `dataset 3/4` and an index into the
external-id table. Hosts needed: see `handoff.md` "Data".
