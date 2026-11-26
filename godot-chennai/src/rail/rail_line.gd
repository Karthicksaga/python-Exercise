class_name RailLine
extends RefCounted
## One direction of a passenger service (port of `RailLine` in `packages/rail/src/network.ts`): its
## path, stops and run profile, and a timetable that says which of its trains are on the line at
## a railway-clock time and where. Trains are entries in the timetable; the game builds bodies and
## models only for the few near the player. Pure logic.


## A stop on a line (`RailStopData`).
class Stop:
	extends RefCounted
	## Station id, shared by the stops of both directions (the OSM node id).
	var id: String = ""
	var name: String = ""
	## Tamil name from OSM `name:ta`, or a transliteration (estimated, needs native review).
	var name_ta: String = ""
	## Metres along the line.
	var s: float = 0.0
	## Platform side: 1 on the left of the direction of travel, -1 on the right (estimated).
	var side: int = 1
	## Platform width, metres (estimated; an island platform fills the gap between two tracks).
	var width: float = 4.0
	## True when this stop uses the island platform drawn for the other direction's stop.
	var twin: bool = false


## Where one end of a line goes (`RailEndData`).
class End:
	extends RefCounted
	var name: String = ""
	## True when that place is beyond the map's edge.
	var beyond: bool = false


## A train on the line now (`TrainAt`).
class TrainAt:
	extends RefCounted
	## Stable while the train is on the line: line id and departure number.
	var id: String = ""
	var line: RailLine
	var departure: int = 0
	## Seconds into its run.
	var t: float = 0.0
	var state: RunProfile.TrainState


## A terminus on the map: a line end not beyond the map with a stop this close (G-322).
const TERMINUS_REACH := 150.0
## Below this rail-top height the line runs in a tunnel (the Metro, G-462): nothing is drawn there,
## its stations have no platform on the map and rides end before it.
const UNDERGROUND := -1.5

var id: String = ""
var name: String = ""
var path: RailPath
var stops: Array[Stop] = []
var from: End
var to: End
var profile: RunProfile
## Seconds between departures, and of the first one.
var headway: float = 480.0
var offset: float = 0.0
## Godot additions: "suburban", "mrts", "express" or "metro"; the train type ("emu", "emu_ac",
## "express", "metro").
var system: String = "suburban"
var train_type: String = "emu"
## Rail-top height above the ground per path point (the MRTS viaduct; the Metro's viaducts and,
## negative, its tunnels), or empty (on the ground).
var heights: PackedFloat32Array = PackedFloat32Array()
## Godot addition (G-463): "blue" or "green" for a Metro line, else "".
var metro_line: String = ""
## Stretches in a tunnel as (s from, s to), in order (G-462).
var tunnels: PackedVector2Array = PackedVector2Array()


static func from_data(data: Dictionary) -> RailLine:
	var line := RailLine.new()
	line.id = str(data.get("id", ""))
	line.name = str(data.get("name", ""))
	line.path = RailPath.from_flat(data.get("points", []) as Array)
	for item: Variant in data.get("stops", []) as Array:
		var d: Dictionary = item
		var stop := Stop.new()
		stop.id = str(d.get("id", ""))
		stop.name = str(d.get("name", ""))
		stop.name_ta = str(d.get("nameTa", ""))
		stop.s = float(d.get("s", 0.0))
		stop.side = 1 if int(d.get("side", 1)) > 0 else -1
		stop.width = float(d.get("width", RailRules.PLATFORM_WIDTH))
		stop.twin = bool(d.get("twin", false))
		line.stops.append(stop)
	line.stops.sort_custom(func(a: Stop, b: Stop) -> bool: return a.s < b.s)
	line.from = _end(data.get("from", {}))
	line.to = _end(data.get("to", {}))
	line.headway = float(data.get("headwayMinutes", 8.0)) * 60.0
	line.offset = float(data.get("offsetMinutes", 0.0)) * 60.0
	line.system = str(data.get("system", "suburban"))
	line.train_type = str(data.get("train", "emu"))
	if data.has("heights"):
		for h: Variant in data["heights"] as Array:
			line.heights.append(float(h))
	line.metro_line = str(data.get("metroLine", ""))
	line._find_tunnels()
	line._make_profile(RunProfile.MotionSpec.from_data(data.get("motion", null)))
	return line


static func _end(data: Variant) -> End:
	var e := End.new()
	if data is Dictionary:
		e.name = str((data as Dictionary).get("name", ""))
		e.beyond = bool((data as Dictionary).get("beyond", false))
	return e


func _make_profile(spec: RunProfile.MotionSpec) -> void:
	var at := PackedFloat64Array()
	for stop in stops:
		at.append(stop.s)
	var start := not from.beyond and not stops.is_empty() and stops[0].s <= TERMINUS_REACH
	var end := not to.beyond and not stops.is_empty() and path.length() - stops[stops.size() - 1].s <= TERMINUS_REACH
	profile = RunProfile.new(path.length(), at, spec, start, end)


## "to Tambaram" for trains running off the map, "to Chennai Central" for a terminus on it.
func destination() -> String:
	return to.name


## Rail-top height above the ground at distance `s` (0 on the ground).
func height_at(s: float) -> float:
	if heights.is_empty():
		return 0.0
	var c := clampf(s, 0.0, path.length())
	var i := path.segment(c)
	var span := path.lengths[i + 1] - path.lengths[i]
	var t := (c - path.lengths[i]) / span if span > 0.0 else 0.0
	return lerpf(heights[i], heights[mini(i + 1, heights.size() - 1)], t)


## True when the line runs above the ground somewhere (the MRTS viaduct).
func elevated() -> bool:
	return not heights.is_empty()


func _find_tunnels() -> void:
	var start := -1.0
	for i in heights.size():
		var under := heights[i] < UNDERGROUND
		if under and start < 0.0:
			start = path.lengths[maxi(0, i - 1)] if i > 0 else 0.0
		elif not under and start >= 0.0:
			tunnels.append(Vector2(start, path.lengths[i]))
			start = -1.0
	if start >= 0.0:
		tunnels.append(Vector2(start, path.length()))


## True where the rail top at distance `s` is in a tunnel.
func underground_at(s: float) -> bool:
	return height_at(s) < UNDERGROUND


## True when the line goes through a tunnel anywhere between distances `a` and `b`.
func tunnel_between(a: float, b: float) -> bool:
	var lo := minf(a, b)
	var hi := maxf(a, b)
	for t in tunnels:
		if t.x < hi and t.y > lo:
			return true
	return false


## True for a Metro line (its own trains, platforms and fares, G-462).
func is_metro() -> bool:
	return system == "metro"


## Trains on the line at railway time `clock` (seconds).
func trains(clock: float) -> Array[TrainAt]:
	var out: Array[TrainAt] = []
	var first := ceili((clock - offset - profile.duration) / headway)
	var last := floori((clock - offset) / headway)
	for k in range(maxi(first, -1_000_000), last + 1):
		var t := clock - (offset + k * headway)
		if t < 0.0 or t > profile.duration:
			continue
		out.append(_at(k, t))
	return out


## The trains on the line within `reach` metres of `at` (G-461: only these get a full state; the
## regional lines carry dozens of trains, most of them kilometres away).
func trains_near(clock: float, at: Vector2, reach: float) -> Array[TrainAt]:
	var out: Array[TrainAt] = []
	var r2 := reach * reach
	var first := ceili((clock - offset - profile.duration) / headway)
	var last := floori((clock - offset) / headway)
	for k in range(maxi(first, -1_000_000), last + 1):
		var t := clock - (offset + k * headway)
		if t < 0.0 or t > profile.duration:
			continue
		if path.point_at(profile.s_at(t)).distance_squared_to(at) > r2:
			continue
		out.append(_at(k, t))
	return out


## The train with this departure number, if it is on the line now (else null).
func train(departure: int, clock: float) -> TrainAt:
	var t := clock - (offset + departure * headway)
	if t < 0.0 or t > profile.duration:
		return null
	return _at(departure, t)


func _at(k: int, t: float) -> TrainAt:
	var a := TrainAt.new()
	a.id = "%s#%d" % [id, k]
	a.line = self
	a.departure = k
	a.t = t
	a.state = profile.state(t)
	return a


## Seconds from `clock` until the next train arrives at stop `index` (0 if one stands there).
func next_arrival(index: int, clock: float) -> float:
	if index < 0 or index >= profile.arrivals.size():
		return INF
	var arrival := profile.arrivals[index]
	var dwell := _dwell_at(index)
	# The latest departure whose train has not yet left this stop.
	var k := ceili((clock - offset - arrival - dwell) / headway)
	var at := offset + k * headway + arrival
	return maxf(0.0, at - clock)


## How long trains stand at stop `index` (the dwell, or the terminus dwell).
func _dwell_at(index: int) -> float:
	for p in profile.phases:
		if p.stop == index:
			return p.duration
	return profile.spec.dwell
