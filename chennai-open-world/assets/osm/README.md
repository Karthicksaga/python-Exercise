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
