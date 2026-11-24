class_name TransitNetwork
extends RefCounted
## The city's buses and trains as data (decisions G-210…G-213): stops, bus stations, railway
## stations, rail lines and bus routes snapped to the road graph, read from
## `world/transit/transit.json` and `routes.bin` (format 2 addition, transit version 1, written by
## `tools/geo` `cli transit` from OpenStreetMap; `docs/transit.md`). Pure data and queries, no
## nodes: read on a worker thread, asked from the AI thread and the main thread (read-only after
## loading).
##
## A route's `path` is a run of the game's own road points (the nodes of `RoadGraph`), so a bus
## can drive it on the AI's lanes; each stop lies `stop_at[k]` metres along it. Headways and
## service hours are estimates (`TransitTimetable`).

const DIR := "res://world/transit"
const MAGIC := 0x54574f43  # "COWT"
const FORMAT := 2
const VERSION := 1
const Q := 20.0
## Side of the spatial index's squares, metres.
const CELL := 100.0
const STOP_KINDS: Array[StringName] = [&"pole", &"platform", &"position", &"station"]


class Stop:
	extends RefCounted
	var index: int = 0
	var key: String = ""
	var position: Vector2 = Vector2.ZERO
	var name: String = ""
	var name_ta: String = ""
	var ref: String = ""
	var kind: StringName = &"pole"
	## Routes (indices into `routes`) that call here, and where along each (same order).
	var routes: PackedInt32Array = PackedInt32Array()
	var along: PackedFloat32Array = PackedFloat32Array()

	## "Saidapet" or the Tamil when OSM has no English, else "Bus stop".
	func label() -> String:
		if name != "":
			return name
		return name_ta if name_ta != "" else "Bus stop"


class Route:
	extends RefCounted
	var index: int = 0
	var osm: int = 0
	var ref: String = ""
	var name: String = ""
	var from_name: String = ""
	var to_name: String = ""
	var to_ta: String = ""
	var status: StringName = &"clean"
	var first: bool = false
	var headway_minutes: float = 15.0
	var hours: Vector2 = Vector2(5.0, 23.0)
	var offset_minutes: float = 0.0
	var majors: PackedStringArray = PackedStringArray()
	## Road points, metres (x, z), and the distance along the path to each.
	var path: PackedVector2Array = PackedVector2Array()
	var run: PackedFloat32Array = PackedFloat32Array()
	## Stops served, in order (indices into the network's stops), and their distance along.
	var stops: PackedInt32Array = PackedInt32Array()
	var stop_at: PackedFloat32Array = PackedFloat32Array()

	func length() -> float:
		return run[run.size() - 1] if not run.is_empty() else 0.0

	## Index of the path segment holding distance d (path[i] -> path[i + 1]).
	func segment_at(d: float) -> int:
		var lo := 0
		var hi := run.size() - 2
		if hi < 0:
			return 0
		while lo < hi:
			var mid := (lo + hi + 1) >> 1
			if run[mid] <= d:
				lo = mid
			else:
				hi = mid - 1
		return lo

	func point_at(d: float) -> Vector2:
		var i := segment_at(d)
		var span := run[i + 1] - run[i]
		var t := 0.0 if span <= 0.0 else clampf((d - run[i]) / span, 0.0, 1.0)
		return path[i].lerp(path[i + 1], t)

	## Unit direction of travel at distance d.
	func direction_at(d: float) -> Vector2:
		var i := segment_at(d)
		return (path[i + 1] - path[i]).normalized()

	## Which of the route's stops (0..) a stop index is, or -1.
	func stop_number(stop_index: int) -> int:
		for k in stops.size():
			if stops[k] == stop_index:
				return k
		return -1

	## The destination sign: (route number, English, Tamil). No operator, no logo (TD-18).
	func sign_lines() -> PackedStringArray:
		return PackedStringArray([ref, to_name, to_ta])


class Station:
	extends RefCounted
	var index: int = 0
	var key: String = ""
	var position: Vector2 = Vector2.ZERO
	var name: String = ""
	var name_ta: String = ""
	## &"suburban", &"mrts", &"metro" (railway) or &"bus" (bus stations and terminals).
	var system: StringName = &"suburban"
	var lines: PackedStringArray = PackedStringArray()

	func label() -> String:
		return name if name != "" else name_ta


class RailLine:
	extends RefCounted
	var id: String = ""
	var system: StringName = &"suburban"
	var ref: String = ""
	var name: String = ""
	## Stations called at, in order (indices into `stations`).
	var stations: PackedInt32Array = PackedInt32Array()
	var headway_minutes: float = 15.0
	var hours: Vector2 = Vector2(4.0, 23.5)
	var offset_minutes: float = 0.0


var stops: Array[Stop] = []
var routes: Array[Route] = []
var stations: Array[Station] = []
var bus_stations: Array[Station] = []
var lines: Array[RailLine] = []
## Every route relation in the data, usable or not: {ref, status, ...} as in the file (coverage).
var route_rows: Array[Dictionary] = []
## The stations' rows as in the file (platforms and entrances for `StationPlace`).
var station_rows: Array[Dictionary] = []
var data_date: String = ""
var attribution: String = ""
var error: String = ""
var _stop_cells: Dictionary[Vector2i, PackedInt32Array] = {}
## Square -> pairs (route, segment) of route paths through it.
var _route_cells: Dictionary[Vector2i, PackedInt32Array] = {}


func ok() -> bool:
	return error == ""


static func available(dir: String = DIR) -> bool:
	return FileAccess.file_exists(dir.path_join("transit.json")) and FileAccess.file_exists(dir.path_join("routes.bin"))


## Reads the network (call on a worker thread: about 0.3 MB).
static func load_dir(dir: String = DIR) -> TransitNetwork:
	if not available(dir):
		var none := TransitNetwork.new()
		none.error = "No transit data in %s." % dir
		return none
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join("transit.json")))
	if not parsed is Dictionary:
		var bad := TransitNetwork.new()
		bad.error = "transit.json is not a JSON object."
		return bad
	return from_parts(parsed as Dictionary, FileAccess.get_file_as_bytes(dir.path_join("routes.bin")))


static func from_parts(doc: Dictionary, routes_bin: PackedByteArray) -> TransitNetwork:
	var net := TransitNetwork.new()
	if int(doc.get("format", 0)) != FORMAT or int(doc.get("transit", 0)) != VERSION:
		net.error = "transit.json format %s.%s, expected %d with transit %d." % [doc.get("format", "?"), doc.get("transit", "?"), FORMAT, VERSION]
		return net
	net.data_date = String(doc.get("dataDate", ""))
	net.attribution = String(doc.get("attribution", ""))
	for row: Variant in doc.get("stops", []):
		var r := row as Array
		var s := Stop.new()
		s.index = net.stops.size()
		s.key = String(r[0])
		s.position = Vector2(float(r[1]), float(r[2]))
		s.name = String(r[3])
		s.name_ta = String(r[4])
		s.ref = String(r[5])
		s.kind = STOP_KINDS[clampi(int(r[6]), 0, STOP_KINDS.size() - 1)]
		net.stops.append(s)
	for row: Variant in doc.get("busStations", []):
		var r := row as Array
		var b := Station.new()
		b.index = net.bus_stations.size()
		b.key = String(r[0])
		b.position = Vector2(float(r[1]), float(r[2]))
		b.name = String(r[3])
		b.name_ta = String(r[4])
		b.system = &"bus"
		net.bus_stations.append(b)
	for item: Variant in doc.get("stations", []):
		var d := item as Dictionary
		net.station_rows.append(d)
		var st := Station.new()
		st.index = net.stations.size()
		st.key = String(d.get("key", ""))
		st.position = Vector2(float(d.get("x", 0.0)), float(d.get("z", 0.0)))
		st.name = String(d.get("name", ""))
		st.name_ta = String(d.get("nameTa", ""))
		st.system = StringName(String(d.get("system", "suburban")))
		for l: Variant in d.get("lines", []):
			st.lines.append(String(l))
		net.stations.append(st)
	for item: Variant in doc.get("lines", []):
		var d := item as Dictionary
		var ln := RailLine.new()
		ln.id = String(d.get("id", ""))
		ln.system = StringName(String(d.get("system", "suburban")))
		ln.ref = String(d.get("ref", ""))
		ln.name = String(d.get("name", ""))
		for i: Variant in d.get("stations", []):
			ln.stations.append(int(i))
		ln.headway_minutes = float(d.get("headwayMinutes", 15))
		var h: Array = d.get("hours", [4.0, 23.5])
		ln.hours = Vector2(float(h[0]), float(h[1]))
		ln.offset_minutes = float(d.get("offsetMinutes", 0))
		net.lines.append(ln)
	for item: Variant in doc.get("routes", []):
		net.route_rows.append(item as Dictionary)
	var err := net._read_paths(routes_bin)
	if err != "":
		net.error = err
		return net
	net._index()
	return net


func _read_paths(bytes: PackedByteArray) -> String:
	if bytes.size() < 12 or bytes.decode_u32(0) != MAGIC:
		return "routes.bin is not a transit routes file."
	if bytes.decode_u16(4) != FORMAT:
		return "routes.bin format %d, expected %d." % [bytes.decode_u16(4), FORMAT]
	var at := 8
	var count := bytes.decode_u32(at)
	at += 4
	for _n in count:
		if at + 16 > bytes.size():
			return "routes.bin is truncated."
		var row_index := bytes.decode_u32(at)
		var n := bytes.decode_u32(at + 4)
		var x := bytes.decode_s32(at + 8)
		var z := bytes.decode_s32(at + 12)
		at += 16
		if at + (n - 1) * 4 + 2 > bytes.size() or row_index >= route_rows.size():
			return "routes.bin is truncated or names a route that is not in transit.json."
		var r := Route.new()
		r.index = routes.size()
		r.path.resize(n)
		r.run.resize(n)
		r.path[0] = Vector2(x / Q, z / Q)
		for k in range(1, n):
			x += bytes.decode_s16(at)
			z += bytes.decode_s16(at + 2)
			at += 4
			r.path[k] = Vector2(x / Q, z / Q)
			r.run[k] = r.run[k - 1] + r.path[k - 1].distance_to(r.path[k])
		var placed := bytes.decode_u16(at)
		at += 2
		if at + placed * 12 > bytes.size():
			return "routes.bin is truncated."
		for _k in placed:
			var stop := bytes.decode_u32(at)
			var seg := bytes.decode_u32(at + 4)
			var along := bytes.decode_float(at + 8)
			at += 12
			if stop >= stops.size() or seg + 1 >= n:
				return "routes.bin places a stop outside its route."
			r.stops.append(stop)
			r.stop_at.append(r.run[seg] + along)
		var row := route_rows[row_index]
		r.osm = int(row.get("osm", 0))
		r.ref = String(row.get("ref", ""))
		r.name = String(row.get("name", ""))
		r.from_name = String(row.get("from", ""))
		r.to_name = String(row.get("to", ""))
		r.to_ta = String(row.get("toTa", ""))
		r.status = StringName(String(row.get("status", "clean")))
		r.first = bool(row.get("first", false))
		r.headway_minutes = maxf(3.0, float(row.get("headwayMinutes", 15)))
		var h: Array = row.get("hours", [5.0, 23.0])
		r.hours = Vector2(float(h[0]), float(h[1]))
		r.offset_minutes = float(row.get("offsetMinutes", 0))
		for m: Variant in row.get("majors", []):
			r.majors.append(String(m))
		routes.append(r)
	if at != bytes.size():
		return "routes.bin has %d bytes after its routes." % (bytes.size() - at)
	return ""


static func _cell(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / CELL), floori(p.y / CELL))


func _index() -> void:
	for s in stops:
		var c := _cell(s.position)
		if not _stop_cells.has(c):
			_stop_cells[c] = PackedInt32Array()
		_stop_cells[c].append(s.index)
	for r in routes:
		for k in r.stops.size():
			var s := stops[r.stops[k]]
			s.routes.append(r.index)
			s.along.append(r.stop_at[k])
		for i in r.path.size() - 1:
			var c := _cell((r.path[i] + r.path[i + 1]) * 0.5)
			if not _route_cells.has(c):
				_route_cells[c] = PackedInt32Array()
			_route_cells[c].append(r.index)
			_route_cells[c].append(i)


## The nearest stop within `within` metres of p, or null.
func nearest_stop(p: Vector2, within: float = 60.0) -> Stop:
	var best: Stop = null
	var bd := within
	for s in stops_near(p, within):
		var d := s.position.distance_to(p)
		if d <= bd:
			bd = d
			best = s
	return best


## The nearest stop within reach that a usable route serves, or null.
func nearest_served_stop(p: Vector2, within: float = 60.0) -> Stop:
	var best: Stop = null
	var bd := within
	for s in stops_near(p, within):
		var d := s.position.distance_to(p)
		if d <= bd and not s.routes.is_empty():
			bd = d
			best = s
	return best


func stops_near(p: Vector2, within: float) -> Array[Stop]:
	var out: Array[Stop] = []
	var r := ceili(within / CELL)
	var c := _cell(p)
	for i in range(-r, r + 1):
		for k in range(-r, r + 1):
			var cell: PackedInt32Array = _stop_cells.get(c + Vector2i(i, k), PackedInt32Array())
			for si in cell:
				if stops[si].position.distance_to(p) <= within:
					out.append(stops[si])
	return out


## Route segments whose middles lie in the squares round p within `reach`: pairs (route,
## segment) flattened. The AI places route buses with it.
func route_segments_near(p: Vector2, reach: float) -> PackedInt32Array:
	var out := PackedInt32Array()
	var r := ceili(reach / CELL)
	var c := _cell(p)
	for i in range(-r, r + 1):
		for k in range(-r, r + 1):
			var cell: PackedInt32Array = _route_cells.get(c + Vector2i(i, k), PackedInt32Array())
			out.append_array(cell)
	return out


## The nearest station (railway, or with `system` &"bus" the bus stations) within reach, or null.
func nearest_station(p: Vector2, within: float = 300.0, system: StringName = &"") -> Station:
	var best: Station = null
	var bd := within
	var pool: Array[Station] = bus_stations if system == &"bus" else stations
	for s in pool:
		if system != &"" and system != &"bus" and s.system != system:
			continue
		var d := s.position.distance_to(p)
		if d <= bd:
			bd = d
			best = s
	return best


func line(id: String) -> RailLine:
	for l in lines:
		if l.id == id:
			return l
	return null


## The next bus at a stop at game hour `hour`: {route: Route, minutes: float} for the soonest of
## the routes calling there, or {} when none runs. Deterministic (`TransitTimetable`).
func next_bus(stop: Stop, hour: float) -> Dictionary:
	var best: Dictionary = {}
	for k in stop.routes.size():
		var r := routes[stop.routes[k]]
		var m := TransitTimetable.minutes_to_next(r, stop.along[k], hour)
		if m < INF and (best.is_empty() or m < float(best["minutes"])):
			best = {"route": r, "minutes": m}
	return best


## Counts for the HUD and the docs: stops, usable routes, the first set, stations.
func counts() -> Dictionary:
	var by: Dictionary = {}
	for row in route_rows:
		var st := String(row.get("status", ""))
		by[st] = int(by.get(st, 0)) + 1
	var first := 0
	for r in routes:
		if r.first:
			first += 1
	return {"stops": stops.size(), "routes": routes.size(), "first": first, "stations": stations.size(), "bus_stations": bus_stations.size(), "lines": lines.size(), "status": by}
