# Building fusion: OSM plus Overture, Google Open Buildings and Microsoft footprints

Format 2.3 (decisions G-220…G-226, 24 Nov 2026). OpenStreetMap stays the **primary** source of
every building. Three free datasets of machine-learning footprints fill the squares where OSM has
no building, which is most of the outer rings: the "villages look empty" problem. This page says
what was downloaded, the rules, the measured thresholds, the result, what it costs, the licences,
and what is weak. The per-ring and per-tile numbers are in `world/FUSION.md` (generated).

## 1. Datasets and downloads (24 Nov 2026)

The box is read from the world data (`world.json bounds`, back to lat/lng through the game
projection): 12.68–13.564 N, 79.95–80.40 E. Downloads sit in a cache outside the repository
(`$CHENNAI_FUSION_CACHE`, default `~/geo-cache/fusion`) and are never committed; each is recorded
in `data/MANIFEST.json` (`buildings`: URL, release, bytes, sha256, rows, date, licence).

| Dataset | How | Downloaded | Extract kept | Rows in the box |
|---|---|---|---|---|
| Overture Maps buildings, release 2026-11-18.0 | DuckDB `httpfs` over HTTPS (anonymous), filter on the `bbox` struct, ordered by GERS id; only matching row groups of the 512 files are read | not reported by DuckDB (row groups only) | 192 MB GeoParquet | 1,875,288 (OSM 391,700, Google 1,081,563, Microsoft 402,025) |
| Google Open Buildings v3 polygons | S2 level-6 cells `3a4d`, `3a53` from `storage.googleapis.com`, each streamed once and filtered to the box | 647 MB (161 + 486 MB gzip CSV) | 258 MB gzip CSV | 2,716,055 |
| Microsoft Global ML Building Footprints, release 2026-02-03 | `dataset-links.csv`, India rows of the 4 level-9 quadkeys covering the box | 72.7 MB (4 gzip GeoJSON-lines files) | 68 MB | 807,931 |

Commands (`tools/geo`): `python -m chennai_geo.cli fetch-buildings` (needs the DuckDB `httpfs` and
`spatial` extension files from `extensions.duckdb.org` in `--duckdb-ext`), then, after every
`build`, `python -m chennai_geo.cli fuse` (about 4.5 minutes; the machine used up to 9.4 GB of its 16 GB while it ran). `build` deletes the
world folder, so `fuse` must run after it; the same inputs give the same bytes.

**Heights in these datasets, measured for this box:** Overture has `height` on 118 and
`num_floors` on 8,723 buildings, every one of them an OSM building (Overture's copy of OSM tags);
no Google or Microsoft footprint in Overture has a height. Microsoft's own files carry
`height = -1` and `confidence = -1` for all 807,931 footprints. Google v3 has no heights. So no
independent height source exists in this box today. The Open Buildings 2.5D Temporal raster
(heights from satellite) needs an Earth Engine account, which the project does not have; it is
the obvious next height source (G-224) and is listed as planned in the manifest.

## 2. Rules (G-222)

1. **OSM wins everywhere.** For every external footprint, the share of its area that lies on OSM
   buildings is measured (Shapely STRtree, local metres). If it is the same building (IoU >= 0.5
   or >= 0.8 of the smaller inside the larger, the blueprint's rule) it is *matched*: it is never
   added and may lend a height to an OSM building whose height is estimated. Otherwise it is
   added only when **less than 15 %** of it lies on OSM buildings.
2. **Sanity:** area >= 12 m² (the OSM rule); Google confidence >= 0.75, also for Google footprints
   that reach us through Overture; the footprint's centre (point on surface) not in water or a
   reservoir, not on an airport apron, not on a carriageway (road centre line buffered by half its
   width; footways and tracks excluded), not holding a mapped OSM street object (pole, tower,
   toilets, post box, lamp… from detail.bin: 415 footprints), not under a modelled landmark's footprint, inside the
   world boundary.
3. **Between external sources:** the same Google record in Overture and in Google's own file
   (same plus code) is taken once, from Overture. Footprints overlapping each other by
   **>= 30 %** of the smaller are the same building; the one kept has a height first, then the
   higher confidence (Microsoft gives none), then the source order Overture, Google, Microsoft,
   then the lower extract row.
4. **Overture's copies of OSM buildings** are never added (our extract is primary and newer);
   they are only used to validate and fill heights.

### Thresholds, measured on the 24 Nov extracts
Share of an external footprint lying on OSM buildings, for the 792,130 that touch one, per 10 %:
74,345 / 49,582 / 53,137 / 62,866 / 75,964 / 92,495 / 108,224 / 109,499 / 87,047 / 78,971. In
2.5 % steps the count falls from 30,657 (0–2.5 %) to a minimum of about 12,300 per step between
10 % and 20 %, then rises steadily. Below the minimum are neighbours drawn a metre over the line;
above it the same building drawn again with an offset. The cut is at the minimum: **15 %**.

Overlap between two external footprints (share of the smaller), for the touching pairs, per 10 %:
522,967 / 123,824 / 95,105 / 88,648 / 92,264 / 100,264 / 115,117 / 135,071 / 149,577 / 570,483.
Neighbours fall from 350,506 (0–2.5 %) to a flat floor of about 22,000 per 2.5 % step from 30 %
on; the same building in two sources piles up above 90 %. The cut is where the neighbours' tail
meets the floor: **30 %**. Both distributions are printed by every run (`world/FUSION.md`).

The fixture `tools/geo/tests/fixtures/fusion_small.json` pins both cuts (14 % added, 16 % not;
two neighbours at 25 % both kept) and every other rule.

## 3. Heights (G-223)

Priority: OSM `height` > OSM `building:levels` > Overture `height` / `num_floors` > Microsoft
`height` (> 0) > estimate by kind. A height fix for an OSM building is stored in `fusion.bin`
(`HGHT`), never by rewriting `chunks.bin`; the game applies it only to buildings still labelled
estimated.

**Validation.** Where OSM and a dataset both have a height, the mean absolute error and bias are
reported, and a dataset is refused above 3 m MAE or 2 m |bias| on 20 or more buildings. Measured:
Overture vs OSM on 8,662 buildings: MAE 0.01 m, bias -0.01 m. This agreement means little: those
Overture heights *are* OSM tags (Overture's own OSM copy), so the check shows the pipeline is
consistent, not that a second source agrees. 17 OSM buildings estimated in our extract get a
height from Overture's newer copy of OSM (labelled `overture`).

**Added buildings** have no height in any source here, so all are **estimated** and labelled so
(`heightFrom` estimated): under 50 m² one floor (huts, sheds); a house (up to 420 m²) one or two
floors by a stable hash of its id; apartments (over 420 m²) three to five. 3.1 m a floor plus a
0.9 m parapet, as for OSM.

## 4. Result (24 Nov data; full table in `world/FUSION.md`)

| Ring | OSM | Added: Overture | Google | Microsoft | After | Growth |
|---|---|---|---|---|---|---|
| 0 today's box | 107,098 | 34,345 | 47,619 | 4,503 | 193,565 | ×1.81 |
| 1 the city | 268,840 | 288,809 | 409,258 | 15,664 | 982,571 | ×3.65 |
| 2 suburbs, corridors | 13,998 | 295,312 | 135,822 | 4,479 | 449,611 | ×32.1 |
| 3 rural edges | 1,347 | 144,188 | 9,735 | 37 | 155,307 | ×115 |
| all | 391,283 | 762,654 | 602,434 | 24,683 | 1,781,054 | ×4.55 |

Overture footprints carry their origin too (Google or Microsoft). Heights: from OSM (height or
levels) 8,697 before and after, from a dataset 17, estimated 99.5 % after (97.8 % before; the
share grows because every added building is estimated). 2,697 squares that had no chunk record
now hold only added buildings (listed in `world.json fusion.cells`, streamed like road-only
squares).

## 5. Files and size (G-221)

`tiles/<tc>_<tr>/fusion.bin` per tile ("COWF", world-format.md §3.9). A footprint within 10 cm
of its oriented box (about 85 % of the 1,389,771) is stored as a box (7 bytes of geometry), the rest as
polygons simplified by 10 cm; the extract row is a zigzag varint delta within the chunk. About
16.8 bytes a building: **23.4 MB** for the 47 tiles (20.4 MB gzipped, which is roughly what it
adds to the APK, whose files are compressed). The world folder grows from 37.0 MB to 62.3 MB (world.json from 119 KB to 150 KB, the
fusion-only squares list); no
2.0/2.1 file changed (sha256 checked before and after). The first encoding (u32 row, explicit
heightFrom) was 26.4 MB; a ring limit was not needed for a phone APK of about 175 MB, but it is
the next lever: ring 3 alone is 155k buildings, about 2.6 MB.

## 6. In the game

`FusionTile` (`src/game_world/fusion/`) decodes a tile on a worker thread; `RegionalWorldSource`
caches it (like `infra.bin`) and `apply_fusion(chunk)` appends the square's added buildings to the
decoded `ChunkData` and applies the height fixes. `ChunkBuilder.build` calls it right after
`read_chunk`, so added buildings take exactly the OSM path: landmark filter, the same
`BuildingMeshes` (and the OSM-detail palettes and roof rules for estimated buildings once that
branch is merged), the same colliders and furniture. No new mesh layer: a square that had buildings
keeps its draw calls; one that had none gets the building layers any OSM chunk has. Numbers in
`handoff.md`.

## 7. Licences and share-alike (G-225)

- OpenStreetMap: ODbL 1.0. Overture buildings: ODbL 1.0 (the theme includes OSM). Microsoft:
  CDLA Permissive 2.0, which allows combining into another database with no conditions beyond
  keeping its licence text available for the original data. Google Open Buildings: offered
  under CC BY 4.0 **or** ODbL 1.0; **we take it under ODbL**, because Overture already
  redistributes the same Google records under ODbL and one share-alike licence for the whole
  database is simpler than an ODbL database containing CC BY data with its own attribution
  terms. Credit lines used everywhere: "© OpenStreetMap contributors (ODbL)", "Overture Maps
  Foundation (ODbL for buildings)", "Contains data from Google Open Buildings (ODbL)", "Microsoft
  Global ML Building Footprints (CDLA Permissive 2.0)".
- **What ODbL share-alike means for us.** The committed `world/` files are a *Derived Database*
  of OSM and Overture (and of the Google and Microsoft data combined into it). If we publicly use
  it (ship it in an APK), we must offer the derived database itself, or the means to rebuild it,
  under the ODbL. We do both: the world files are committed in this repository, and so are the
  build scripts (`tools/geo/`), the dataset manifest with every URL, release, checksum and date
  (`data/MANIFEST.json`) and the boundary. The game itself is a *Produced Work*: it needs the
  attribution, shown on the title screen (OSM) and on the About page (every dataset), and in
  `world/ATTRIBUTION.md` and `assets/LICENSES.md`. Our own code and art are not affected by the
  share-alike: it applies to the database, not to the program that reads it.
- Where the attribution is published: the About page in the game, `world/ATTRIBUTION.md` (with
  the APK's data), `world/FUSION.md`, `assets/LICENSES.md`, `world.json fusion.credits`.
- `tools/geo/tests/test_fusion_world.py::test_no_dataset_without_its_credit_line` and
  `tests/unit/test_fusion.gd::test_every_dataset_has_its_credit_on_the_about_page` fail if any
  dataset's buildings are in the files without its credit line.

## 8. What is weak

- **No independent heights.** 99.5 % of buildings are estimated; added buildings are one or two
  floors by rule, which reads right for villages and wrong for dense city blocks of three to five
  storeys. The 2.5D raster (Earth Engine) is the fix.
- **Footprint quality.** ML outlines are boxes, often a metre off, and merge terraced rows into
  one long box or split one house in two. 15 % overlap with OSM is allowed, so some added walls
  cut into an OSM wall by up to about a metre.
- **Provenance of absorbed footprints** (ML outlines matched to an OSM building) is counted in the
  report but not stored per building (chunks.bin stays unchanged).
- **Rule masks are centre tests:** a footprint whose centre is just off a road may still overhang
  the carriageway; roads tagged without width use the class estimate.
- **Size:** 23.4 MB more world data. Fine for a sideloaded APK; a Play Store build would need asset
  packs or a ring limit (§5).
- Overture's own conflation already dropped many Google footprints; we re-add those that pass our
  rules (602,434 from Google's file), so where Overture chose Microsoft over Google we may choose
  Google (higher confidence wins).
