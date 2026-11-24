# Transit: bus stops, bus routes, railway stations (G-210…G-219)

Branch `agent/godot-transit`, 24 Nov 2026. OpenStreetMap is the only source. Headways, service
hours, average speeds and fares are **estimates** (no published timetable or tariff is used).
Tamil text that OSM provides is shown as mapped; Tamil written here (announcements: "அடுத்த
நிறுத்தம்" next stop, "கடைசி நிறுத்தம்" last stop) **needs native review**. No operator names,
liveries or logos are shown anywhere (TD-18): the operator tag is read and dropped.

## 1. Data (`tools/geo`, `cli transit`)

```
cd godot-chennai/tools/geo
/opt/tools/geo-venv/bin/python -m chennai_geo.cli transit      # about 60 s; needs data/raw/world.osm.pbf and world/
./run_tests.sh                                                 # pytest incl. tests/test_transit.py
```

Reads the clipped extract and the **built world** (every tile's `roads.bin` and `infra.bin`), so a
route is a run of the game's own road points. Writes (format 2 addition, transit version 1; no
2.x file changes, `world.json` is untouched, readers find the files by name):

- `world/transit/transit.json` (≈170 KB): `format 2`, `transit 1`, attribution, data date;
  `stops` `[key, x, z, name, nameTa, ref, kind]` (kind: pole, platform, position, station);
  `busStations` `[key, x, z, name, nameTa]`; `stations` `{key, x, z, name, nameTa, system
  (suburban|mrts|metro), lines, platforms [[ref, x, z, length]], entrances [[x, z, label]]}`;
  `lines` `{id, system, ref, name, stations (indices, in order), headwayMinutes, hours,
  offsetMinutes}`; `routes` `{osm, ref, name, from, to, toTa, status, reason, inferred, stops,
  legs [found, all], memberShare, length, raised, majors, first, headwayMinutes, hours,
  offsetMinutes}`.
- `world/transit/routes.bin` ("COWT", ≈150 KB): `u32 magic, u16 format 2, u16 version 1, u32
  count`, then per usable route `u32 route index, u32 n, i32 x0, i32 z0, (n-1) × (i16 dx, i16
  dz)` (×20, exactly the points of `roads.bin`, hence `RoadGraph` nodes), `u16 nStops,
  nStops × (u32 stop, u32 path segment, f32 metres along it)`.
- `world/TRANSIT.md`: the coverage report (totals, stops per area, stations, lines, every route
  with its status and reason).

One regional file, not per tile (G-210): 51 usable routes, 1,463 stops, 0.32 MB in all; a route
crosses many tiles, and the AI asks by position through a 100 m grid built at load. A per-tile
split is the plan once the data grows past a few MB.

**Coverage (OSM data of 23 Nov 2026):**

| What | Count |
|---|---|
| Stops (poles and platforms merged within 15 m; plus route members not beside a pole) | 1,463 (1,207 `highway=bus_stop`); 1,250 named, 240 with a Tamil name |
| Stops served by a usable route | 483 |
| Bus stations and terminals | 132 |
| Railway stations | 185 (89 suburban, 3 MRTS-only, 93 Metro); 129 platforms and 65 entrances attached |
| Rail lines (each direction) | 15: Beach–Tambaram, Tambaram–Chengalpattu, Central/Beach–Arakkonam, Central/Beach–Sullurpeta, MRTS, Metro Blue, Green, Yellow and the inter-corridor line (lines marked under construction left out) |
| Bus route relations in OSM | **77** (OSM Chennai maps few MTC routes) |
| Snapped clean / fallback / broken / unusable | **11 / 18 / 22 / 26** |
| Routes with stops inferred from mapped stops along their ways | 28 |
| Routes whose stop members were out of order and put in order along their ways | 16 |
| First set (uses Anna Salai, GST Road, OMR, ECR, Poonamallee High Road, Kathipara or an Adyar/Cooum bridge; by stop count) | **40** |

Unusable: 24 relations have fewer than 2 stops and no ways to infer from (e.g. the Mogappair
West terminus routes: one platform member each), 2 have no run of 3 drivable stops.

**Snapping (G-211).** Each stop gets up to 3 candidate road edges within 35 m (drivable graph
only: no footways or service roads, one-way streets respected), scored by distance, being on the
route's mapped ways, lying on the left of the direction of travel (India keeps left) and pointing
the way the route goes. The cheapest chain of candidates over all legs is chosen (Viterbi), each
leg an A* over the graph where mapped ways cost 1 per metre and other roads 2.5: the mapped ways
first, any road as the fallback. A leg longer than max(3 × the straight line, straight + 900 m)
counts as not found (a bus looping round a one-way block for one stop). Status: clean (every leg,
≥ 80 % on mapped ways, no leg over 1.8 × straight), fallback, broken (some legs dropped: the
longest run of ≥ 3 stops is kept), unusable. Heights are not stored: the game reads them from the
roads' own deck samples (`infra.bin`), so routes over flyovers ride on the decks.

## 2. Runtime (`src/transit`, node-free)

| Class | What |
|---|---|
| `TransitNetwork` | Reads the two files (worker thread); stops, routes (path, distances, stops along), stations, bus stations, lines; `nearest_stop`, `nearest_served_stop`, `stops_near`, `route_segments_near`, `nearest_station`, `next_bus(stop, hour)` |
| `TransitTimetable` | Fixed headways from the first stop through the service hours, offset by a stable number of minutes; 16 km/h average bus speed; trains 2.5 min per station. Deterministic |
| `TransitFare` | `ShareShift.share_fare` (the missions' distance fare) × 0.5, ₹5…₹30, bought on boarding for the rest of the route |
| `RouteBuses` (extends `src/ai/AgentRoutes`) | Route buses inside `AgentSystem`: placed on a route near the player out of sight on loaded ground, next stretch from the path, pull in to the kerb before a stop, stand with the doors open 9–15 s, close, carry on; recycled at the end of the route. How many: the crowd rules' share of the pool (place and hour) applied to the bus agents, at least one when a route in service passes within 400 m. `request(route, stop)` sends one to the player's stop; `hold_doors`, `set_carrying`, `jump_to_stop` |
| `BusRide` | Board (refused on a crash, while wanted, or without the fare), the ticket toast, next-stop announcements (Tamil and English), alight at a stop or at the last one |
| `TrainService` | **Stub interface** for phase 6: `departures` (lines and minutes from the timetable) works; `has_trains` false, `train_at` null, `board` refused |
| `StationPlace` | A station as a place: entry area (70 m round the station point, 18 m round mapped entrances, along platforms), platform list (OSM refs; unnamed counted), `find` |
| `BusJobRoutes` | Moves the baked bus jobs' stops to the mapped stop within 45 m (kerb moves with it) and names the real route serving them in order; `from_route` makes a job from a stretch of a real route |

`src/ai` changes (additive): `AgentRoutes` (the hook, a no-op base), `AgentSystem.routes`,
`put_on`, `replace`, `is_bus` and the guarded calls; `RoadGraph.edge_seg/edge_back` so
`height_on` reads `Road.height_at` on raised roads (all traffic and walkers now follow flyover
decks and ramps; before, the AI graph was built without decks and traffic drew at y = 0 under
them).

## 3. In the game

- **Views.** Bus views keep their near model's door nodes (`TrafficVehicleView.make(...,
  with_doors)`; the far LODs are still merged) and open them at stops; `RouteSign` is a dark board
  over the windscreen and by the front door with the route number and the destination, Tamil over
  English, amber (Noto Sans Tamil fallback, `assets/transit/`).
- **`TransitLayer`** (`src/app/transit_layer/`, added by `Main` after `PlayWiring`): see its class
  comment. The HUD hint (`src/ui/transit_hint/`) sits top centre between the mission column and
  the JOBS button; FAST TRAVEL is 160 × 48 px.
- **Passenger.** Walk to a served stop: the hint shows its names and the next bus; within 22 m a
  bus of the soonest route is sent and comes in from upstream. When it stands with its doors open,
  ACTION reads BOARD (within 9 m of the front door). The ticket is paid from the missions' purse
  (a new game has ₹0: earn first). Inside, the player stands by the rear rail (cast idle clip),
  four seated adult walkers from the cast ride along (`sit` clip), an interior camera looks down
  the bus, and the hint announces the next stop. FAST TRAVEL fades to black (instant with reduced
  motion), streams the next stop's streets, puts the bus there and fades back. ACTION (ALIGHT) at
  a stop, or the last stop, puts the player on the pavement by the front door.
- **Drive a bus.** On load the three baked bus jobs move onto mapped stops and one job on a real
  first-set route is added (five stops from the stop nearest the parked city bus).
  Measured differences (23 Nov data, `test_real_bus_jobs_move_onto_mapped_stops`): `bus-route`
  and `evening-bus` (4th Avenue, Santhi Colony) have no mapped stop within 45 m of any of their
  four stops and keep their baked points; `mount-road-bus` moves SIET 3.3 m, DMS 5.0 m, US Embassy
  20.1 m, Thousand Lights 5.9 m onto the OSM stops. No mapped route calls at those stops in that
  order, so none of the three gets a route; the added real-route job is the one that does.
- **Stations.** Inside a station's place the hint shows its names, platforms and the next train of
  each line, and says trains are not running yet.
- **Bikes.** Motorbikes are drivable (phase 2); decks are colliders, so they ride flyovers
  (`test_decks_driving.gd` drives a car; bikes use the same `RaycastVehicle`). Nothing
  route-specific is needed. **Bicycles are not built** (a later task).

## 4. Trains: the plan for phase 6 (not in this task)
1. A `TrainRuntime` extends `TrainService`: trains as timetable objects per line (position along
   the line from `TransitTimetable.train_minutes`), simulated only near the player (ground loaded,
   §7), drawn with the phase-6 EMU / Metro models on `rail.json` tracks.
2. `train_at(station, line)` returns the train standing at a platform; `board` charges
   `TrainService.fare` and seats the player like `BusRide` (same announcements).
3. Station crowds (children allowed there, beside an adult) from `CrowdField` at `StationPlace`
   platforms; the landmarks agent's Central and Egmore buildings are the entries.
4. Story stages 18–19 (`by_train`) then use it.

## 5. Measured (this 4-core container, Godot 4.7.2, headless `--fixed-fps 60`)
`tests/tools/transit_shots.gd -- --measure [--routes=off]`: the real game at the served stop
nearest the start (Anna Nagar Tower Station, 10:30), 900 frames each, CPU time between frames
(the performance monitors were noisy, as the traffic agent found). Two runs each:

| | Frame avg | p95 | max | CityLife sync | AI step (own thread) | TransitLayer avg / max |
|---|---|---|---|---|---|---|
| Route buses off | 2.79 / 2.58 ms | 3.60 / 3.52 | 10.9 / 7.2 | 0.65 / 0.60 ms | 1.55 / 1.81 ms | 0.07 / 0.31…1.57 ms |
| Route buses on (2 out) | 2.61 / 2.81 ms | 3.85 / 4.00 | 9.3 / 9.0 | 0.63 / 0.61 ms | 1.58 / 1.39 ms | 0.07 / 1.5…3.6 ms |
| Riding (inside, 4 seated passengers) | 2.66 ms | 3.58 | 10.7 | 0.62 ms | 1.68 ms | 0.33 / 8.3 ms |

The difference with route buses is inside the run-to-run noise (±0.2 ms avg). The `board` call
takes 4.3 ms on the main thread (four passenger figures instanced, an interior camera); the
TransitLayer's worst frames (1.5–3.6 ms) are a bus's first sign being built (Label3D), and 8.3 ms
while riding once. Not measured on a phone; expect 3–4× there: the boarding frame would be a
visible hitch (pre-instance the passengers to fix). One of the two "on" runs had no bus reach
the stop within the tool's wait (the scene test's wait is longer and passed).

Draw calls (Compatibility, xvfb, 915x412, whole frame from `transit_shots`): a route bus standing
at Anna Nagar Tower Station with the HUD 203 (287k primitives); riding inside 179 (261k); after
alighting 118; Kathipara from above with a bus on the upper deck 120; Egmore station 102. No
before/after pair for the unmerged bus doors was taken (only one or two buses are near at a
time; each keeps its near model's separate meshes, roughly 10 more draw calls a bus).

## 6. Weak or not done
- OSM maps only 77 bus routes in this world; most of Chennai's ~800 MTC routes are not there, so
  most stops are served by no route (483 of 1,463). 22 routes are broken (legs dropped), 18 use
  roads off their mapped ways; inferred stops can include a stop of a parallel road within 22 m.
- Service roads are not in the AI graph, so bus stations and terminals off the main road are not
  entered; routes start and end at the nearest drivable edge.
- Timetable and fares are estimates; the timetable is not tied to the AI buses: a request sends
  the soonest route's bus, and it takes the time it takes to drive in.
- Interior: the bus models were not built for an interior camera: seats, aisle and the player
  read well, but the roof and window frames draw as black wedges at the top of the view
  (single-sided faces seen from inside).
- Alighting puts the player 1.2 m from the stop's OSM point away from the bus; where OSM's point
  is not at the kerb line the player can stand at the road edge (seen once before this rule). Seated passengers are four fixed seats; no standing crowd; the player's hand is not on
  the rail (no grip pose for the player yet).
- Doors on route buses cost the near model's merge (more draw calls per bus near the camera).
- Fast travel moves the streaming focus to the next stop; if its streets do not load within 600
  physics frames the bus rides on instead (toast).
- Signs and hint seen only on llvmpipe (Compatibility); not on a phone.
