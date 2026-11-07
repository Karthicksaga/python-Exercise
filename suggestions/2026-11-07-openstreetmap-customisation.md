# Customising the OpenStreetMap map further

Date: 7 Nov 2026 · Status: **Built 7 Nov 2026**: 3D view and driving view, landmark icons, one-way arrows, service area shading, suggested pickup points, demand glow (see hop-mobile-platform/CLAUDE.md). Not built: self-hosted tiles, OSM editing, own traffic.

## Where we are
The OSM map is already our own design, not stock OpenStreetMap:
- `shared/maps/vectorStyle.ts` draws OpenFreeMap vector tiles with Hop colours.
- Two modes: **browse** (home, search, booking) and **ride** (live trip: buildings and shop labels hidden so the route stands out).
- A real night style, not an inverted day map.
- Our own pins, route line and top-down vehicles (`pins.ts`, `vehicleArt.ts`).

Because the style is a list of layers, nearly anything about how the map looks can be changed: colours, which roads and places show, label sizes, icons. The limits are what the map data contains, and what the Leaflet wrapper can do.

## Options, best value first
| # | Idea | What the user gets | Effort | Notes |
|---|---|---|---|---|
| 1 | **Landmark icons** (temples, petrol bunks, bus stops, metro, hospitals, ATMs) | People in India give directions by landmarks: "near the Murugan temple". The pickup pin can say "near Indian Oil bunk". | S–M | The data is already in the tiles (`poi` layer). We need a small icon sheet (sprite) in Hop style. |
| 2 | **One-way arrows and no-entry roads** | Riders don't drop a pin where a car can't stop. Captains see one-ways before turning. | S | `oneway` is in the `transportation` layer. Show it from zoom 16. |
| 3 | **Hop's own layers on the map** | Shaded service area edge ("we don't serve beyond here"), suggested pickup points at malls and stations, and a demand glow for captains. | M | Drawn from our own API, so no new provider. Zones already exist on the server. |
| 4 | **Host the map ourselves** (Protomaps PMTiles of Tamil Nadu/India on our server or CDN) | No dependency on a free third party. Faster in India. Captains can keep a city offline for bad-network areas. | M | Tamil Nadu is a few hundred MB, India about 1–2 GB. Switching is already one setting (`VITE_MAP_VECTOR_URL`). |
| 5 | **Fix the map data itself** | Missing streets, gates and new layouts in our cities get added, for everyone. | Ongoing | OSM is editable. Captains could report a wrong road with "Report map issue", and someone reviews it and edits OSM. Changes reach the tiles in about a week. |
| 6 | **3D buildings and a tilted captain navigation view** | A Google-style driving view. | L | Leaflet can't tilt the map. This would mean using MapLibre directly instead of through Leaflet: a bigger change to `osm.ts`. |
| 7 | **Our own traffic colours** | Red and orange roads from our captains' live speeds. | L | OSM has no traffic. This needs enough captains, plus privacy rules (only averaged speeds, never single trips). Later. |

## Caveat: Tamil and Hindi street names
The tiles do carry `name:ta` / `name:hi`, but MapLibre doesn't shape Indic scripts properly yet. Tamil letters that join or reorder can come out broken on the map. Keep map labels in English and local text in the app's own UI (already done for notes and chat). Re-test when MapLibre adds Indic text shaping.

## Recommendation
Do 1 + 2 + 3 together as one "Hop map, India edition" round: all three use data we already have, and none needs a new provider. Then 4 when traffic grows. Show it first in a prototype, as with the other redesigns.

## Follow-up: 3D view (asked 7 Nov 2026)
Yes, it's possible. There are three routes:
- **Native Google map (Android APKs):** already in the apps (`shared/maps/native.ts`). The Maps SDK draws 3D buildings and can tilt the camera (`setCamera` with `angle` and `bearing`) at no extra cost. Smallest change: a tilted camera that follows the captain's heading during the trip. Still blocked on the Android Maps key (see project memory).
- **OpenStreetMap map:** the tiles already carry building heights (`render_height`), so MapLibre can extrude 3D buildings. Leaflet can't tilt, so `osm.ts` would move from Leaflet to MapLibre directly: pins, routes and vehicles become MapLibre markers and GeoJSON layers. Large change (≈ 670 lines), well testable.
- **Web Google map:** needs a vector Map ID, which is billed per load. Not recommended.

Where 3D helps:
- Captain navigation during pickup and drop: tilted and heading-up.
- Rider pickup at zoom 17+, where buildings help find the gate.

Keep booking, search and the overview flat; 3D there hides the route.

Cost: 3D is heavier on low-end phones and battery. Make it automatic only on trip navigation, add a "3D" toggle in Map layers, and turn it off in low-data mode.
