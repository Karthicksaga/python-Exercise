# OpenStreetMap extract

`anna-nagar.osm.json`: Overpass API extract, bounding box 13.0805,80.2056 to 13.0895,80.2146
(about 1 km² around Anna Nagar Roundtana, Chennai). OSM data timestamp: 2026-11-16T03:40:28Z
(fetched 16 Nov 2026).

© OpenStreetMap contributors. Licensed under the Open Database Licence (ODbL) 1.0:
https://www.openstreetmap.org/copyright

Refresh with `npm run fetch:osm`, then rebuild the world with `npm run build:world`.

What the query fetches (`scripts/fetch-osm.mjs`):
- Ways: buildings, highways, leisure, landuse, natural, `man_made=tower` and
  `amenity=place_of_worship` outlines (landmarks).
- Tagged nodes: mapped trees, amenities and shops, landmarks (`man_made`, `tourism`,
  `historic`, `amenity=place_of_worship`), place names (`place`, for district labels), bus stops
  (`highway=bus_stop`) and traffic signals (`highway=traffic_signals`).
- Multipolygon relations are not included.

In this extract: Anna Nagar Tower is mapped as a closed `man_made=tower` way (651861526) and a
`tourism=viewpoint` node; there are 5 bus stops and no traffic-signal nodes. The tower's
outline and opening year (`start_date`, 1968) come from OSM; its height (about 41 m) and level
count (12) are not mapped, so the game uses estimates (`packages/game-world/src/landmarks.ts`).

## The city extract (J2)

`city/chennai-city.osm.json` (58 MB, **git-ignored**): 12.98–13.095 N, 80.195–80.29 E, Anna
Nagar to T. Nagar, Anna Salai, Marina Beach and the start of ECR. Clipped with
`scripts/clip-city.py` from the openstreetmap.fr Tamil Nadu extract, OSM data timestamp
2026-11-15T00:16:27Z (downloaded 16 Nov 2026). It holds 107,360 buildings, about 20,000 road
pieces, 535 bus stops, 266 traffic signals and the coastline. `npm run build:world` turns it
into `apps/game/public/world/` (committed). How to rebuild it: `docs/development-roadmap.md`,
"J2 status". © OpenStreetMap contributors, ODbL 1.0.

## The railway extract

`rail/chennai-rail.osm.json` (466 KB, committed): the railway in the box 12.975,80.19 to
13.10,80.295 (the city clip box plus about 500 m), cut with `scripts/clip-rail.py` from the
**same openstreetmap.fr Tamil Nadu extract as the city**, OSM data timestamp
**2026-11-15T00:16:27Z** (downloaded 16 Nov 2026). It holds `railway=rail` and `light_rail` ways
with all their nodes (a line leaving the map keeps its outside part), stations, halts, level
crossings, platforms, and the train route relations that use those ways, with their members cut
to the ones in the file (4,362 nodes, 460 ways, 18 relations). `npm run build:rail` turns it into
`apps/game/public/world/rail.json` (40 KB, committed). © OpenStreetMap contributors, ODbL 1.0.

To rebuild it: `python3 -m venv .venv && .venv/bin/pip install osmium`; download
`https://download.openstreetmap.fr/extracts/asia/india/tamil_nadu.osm.pbf` (124 MB) and its
`tamil_nadu.state.txt`; `.venv/bin/python -I scripts/clip-rail.py tamil_nadu.osm.pbf
assets/osm/rail/chennai-rail.osm.json <timestamp from the state file>` (about 80 s); delete the
download and the venv; `npm run build:rail`.

`scripts/fetch-rail.mjs` asks the Overpass API for the same things (the box, rail ways,
stations, platforms, level crossings, route relations with members). On 16 Nov 2026 Overpass
was unreliable from this container (overpass-api.de reset connections; overpass.kumi.systems
answered once, with data of 2026-07-15 and relation tags only, then timed out or returned 502),
so the committed extract comes from the PBF instead. Node's `fetch` needs
`NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` behind this container's proxy.

What the railway data shows: the Beach–Tambaram suburban service is mapped as two route
relations, one per direction (1289050 Beach → Tambaram, 20986091 Tambaram → Beach), each on its
own track, with stop positions on the track. On the map it stops at Park, Chennai Egmore,
Chetpet, Nungambakkam, Kodambakkam, Mambalam, Saidapet, Guindy and St. Thomas Mount; Chennai
Beach is just off the east edge and Tambaram about 6 km south, so it runs off the map at both
ends. The MRTS (mostly on a viaduct) and the Metro (underground or elevated) are left out:
drawn at ground level they would cut through streets. The only level crossings in the box are 13
private ones inside the Metro depot, so the suburban line has none on the map (roads cross it on
bridges or in subways, which are not modelled).
