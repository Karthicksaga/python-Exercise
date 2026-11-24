class_name TransitTimetable
extends RefCounted
## When buses and trains come (decision G-212): every route and line runs at a fixed headway
## through its service hours from its first stop, offset by a stable number of minutes, and a bus
## reaches a stop `along` metres down its route at the average city speed. No published timetable
## is used: headways, hours and the speed are **estimates** (`docs/transit.md`). Deterministic and
## node-free; times are game hours (`GameClock.hour`, 0..24).

## Average bus speed with stops and traffic, km/h (an estimate for Chennai's city buses).
const BUS_KMH := 16.0
## Minutes a train takes between two stations on average (an estimate).
const TRAIN_MINUTES_PER_STATION := 2.5


static func metres_per_minute() -> float:
	return BUS_KMH * 1000.0 / 60.0


## Minutes from `hour` until the next bus of `route` reaches the point `along` metres down it
## (INF when the route has no service at all). Past the last bus, the first one tomorrow.
static func minutes_to_next(route: TransitNetwork.Route, along: float, hour: float) -> float:
	return minutes_to_next_at(route.headway_minutes, route.hours, route.offset_minutes, along / metres_per_minute(), hour)


## The same for any service: departures every `headway` minutes from `hours.x` + `offset` until
## `hours.y` (game hours), `travel` minutes from the start to the point.
static func minutes_to_next_at(headway: float, hours: Vector2, offset: float, travel: float, hour: float) -> float:
	if headway <= 0.0 or hours.y <= hours.x:
		return INF
	var now := fposmod(hour, 24.0) * 60.0
	var first := hours.x * 60.0 + offset + travel
	var last_departure := hours.y * 60.0
	var count := floori((last_departure - hours.x * 60.0 - offset) / headway)
	if count < 0:
		return INF
	var last := first + count * headway
	if now <= last:
		var k := maxi(0, ceili((now - first) / headway))
		return first + k * headway - now
	return first + 24.0 * 60.0 - now


## Whether the route runs at `hour` (its first bus has left and its last has not).
static func in_service(route: TransitNetwork.Route, hour: float) -> bool:
	var h := fposmod(hour, 24.0)
	return h >= route.hours.x and h <= route.hours.y + route.length() / metres_per_minute() / 60.0


## Minutes until the next train of `line` stops at its station number `k` (0 = first).
static func train_minutes(line: TransitNetwork.RailLine, k: int, hour: float) -> float:
	return minutes_to_next_at(line.headway_minutes, line.hours, line.offset_minutes, k * TRAIN_MINUTES_PER_STATION, hour)
