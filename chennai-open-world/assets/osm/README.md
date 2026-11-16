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

## The railway extract (work in progress)

`rail/chennai-rail.osm.json` (438 KB): Overpass API extract made with `scripts/fetch-rail.mjs`,
bounding box 12.975,80.19 to 13.10,80.295 (the city clip box plus about 500 m). Fetched 16 Nov
2026 from the `overpass.kumi.systems` mirror (overpass-api.de reset the connection); that
mirror's OSM data timestamp is **2026-07-15T15:22:01Z**. It holds `railway=rail` and
`light_rail` ways with their nodes, stations and halts, platforms, level crossings, and the
tags (not yet the members) of the train route relations that use those ways. The script now
asks for the relations' members too (`out body`), but that run was stopped before it finished,
so the committed file still has tags only. Node's `fetch` needs
`NODE_USE_ENV_PROXY=1 NODE_EXTRA_CA_CERTS=/root/.ccr/ca-bundle.crt` behind this container's proxy.
© OpenStreetMap contributors, ODbL 1.0.
