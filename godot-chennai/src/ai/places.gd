class_name PlaceMap
extends RefCounted
## What kind of place a stretch of pavement (or sand) is, and how many people and vehicles it
## has at each hour (TD-31, port of `ai/src/Places.ts` on `agent/crowd-density`). Read from the
## map the world already has: road classes and names, shops and places of worship (OSM POIs),
## beaches (OSM `natural=beach`) and the sea, railway stations and temple landmarks. Nothing is
## hand-placed. Pure logic: built on a worker thread for the AI's area round the player.

const KINDS: Array[StringName] = [&"beach", &"promenade", &"market", &"station", &"temple", &"main_road", &"street", &"lane"]

## People out by kind of place and hour: on the beach per 1000 m² of sand, elsewhere per 100 m
## of road (both pavements). Estimates of how Chennai is used, not counts.
const PEOPLE := {
	&"beach": [Vector2(0, 0.1), Vector2(4.5, 0.1), Vector2(6, 2.5), Vector2(8, 2), Vector2(10, 0.5), Vector2(15, 0.8), Vector2(17, 5), Vector2(18.5, 9), Vector2(20.5, 7), Vector2(22, 2), Vector2(23.5, 0.2), Vector2(24, 0.1)],
	&"promenade": [Vector2(0, 0.5), Vector2(4.5, 0.8), Vector2(6, 8), Vector2(8, 6), Vector2(10, 2), Vector2(15, 3), Vector2(17, 9), Vector2(19, 12), Vector2(21, 8), Vector2(23, 2), Vector2(24, 0.5)],
	&"market": [Vector2(0, 0.3), Vector2(6, 0.5), Vector2(8, 3), Vector2(10, 9), Vector2(13, 10), Vector2(15, 8), Vector2(17, 11), Vector2(20, 12), Vector2(21.5, 6), Vector2(23, 1), Vector2(24, 0.3)],
	&"station": [Vector2(0, 0.3), Vector2(4.5, 1), Vector2(7, 6), Vector2(8.5, 10), Vector2(10.5, 4), Vector2(16, 4), Vector2(17.5, 10), Vector2(19.5, 9), Vector2(21, 3), Vector2(23, 0.5), Vector2(24, 0.3)],
	&"temple": [Vector2(0, 0.2), Vector2(4.5, 1), Vector2(6, 6), Vector2(8, 5), Vector2(11, 2), Vector2(16, 2), Vector2(18, 7), Vector2(20, 6), Vector2(21.5, 1), Vector2(24, 0.2)],
	&"main_road": [Vector2(0, 0.3), Vector2(5, 0.4), Vector2(7, 2), Vector2(9, 3), Vector2(13, 2.5), Vector2(17, 3.5), Vector2(20, 3), Vector2(22, 1), Vector2(24, 0.3)],
	&"street": [Vector2(0, 0.05), Vector2(5, 0.15), Vector2(7, 1.2), Vector2(9, 1.5), Vector2(13, 1), Vector2(17, 2), Vector2(21, 1.5), Vector2(23, 0.3), Vector2(24, 0.05)],
	&"lane": [Vector2(0, 0), Vector2(5, 0.05), Vector2(7, 0.6), Vector2(9, 0.6), Vector2(13, 0.4), Vector2(17, 0.8), Vector2(21, 0.5), Vector2(23, 0.05), Vector2(24, 0)],
}
## Share of the hour's traffic a kind of road carries.
const TRAFFIC := {&"beach": 0.0, &"promenade": 1.0, &"market": 0.85, &"station": 0.85, &"temple": 0.65, &"main_road": 1.0, &"street": 0.55, &"lane": 0.25}
## How much traffic a road class can carry, relative to a residential street.
const CARRIES := {&"motorway": 5.0, &"primary": 4.0, &"secondary": 3.0, &"tertiary": 2.0, &"residential": 1.0, &"service": 0.5, &"footway": 0.0}
## OSM shop and amenity values that make a street a shopping street.
const SHOPS: Array[StringName] = [
	&"clothes", &"jewelry", &"shoes", &"fabric", &"bag", &"supermarket", &"convenience", &"greengrocer", &"general", &"fashion_accessories",
	&"electronics", &"mobile_phone", &"cosmetics", &"watches", &"marketplace", &"department_store", &"mall", &"variety_store", &"tailor",
	&"sari", &"boutique", &"gift", &"toys", &"books", &"stationery", &"bakery", &"confectionery", &"sweets", &"fast_food", &"restaurant", &"cafe",
	&"tea", &"ice_cream", &"pharmacy", &"hardware", &"electrical", &"optician", &"fruit", &"vegetables", &"butcher", &"seafood", &"kiosk",
]
const MARKET_RADIUS := 90.0
const MARKET_SHOPS := 9
const STREET_SHOPS := 2
const STATION_RADIUS := 160.0
const TEMPLE_RADIUS := 140.0
const SHRINE_RADIUS := 45.0
const PROMENADE_REACH := 70.0
## Shore sand not mapped as a beach: within this of the coast, near something named for a
## beach, seaward of every road (an estimate, TD-31).
const SHORE_WIDTH := 110.0
const SHORE_ANCHOR := 700.0
const SHORE_ROAD_CLEAR := 8.0
const GRID := 64.0

var roads: Array[Road] = []
var _shops: Dictionary[Vector2i, PackedVector2Array] = {}
var _shrines: PackedVector2Array = PackedVector2Array()
var _stations: PackedVector2Array = PackedVector2Array()
var _temples: PackedVector2Array = PackedVector2Array()
var _beaches: Array[PackedVector2Array] = []
var _beach_boxes: Array[Rect2] = []
var _sea: WorldSea = null
var _sea_box: Rect2 = Rect2()
var _anchors: PackedVector2Array = PackedVector2Array()
var _segments: Dictionary[Vector2i, PackedInt64Array] = {}
var _kinds: Dictionary[int, StringName] = {}


## `pois`: the index's POIs; `areas`: outlines (beaches used); `stations`: rail stations.
static func create(road_list: Array[Road], pois: Array[Place], areas: Array[WorldArea], landmarks: Array[Landmark], sea: WorldSea, stations: PackedVector2Array) -> PlaceMap:
	var m := PlaceMap.new()
	m.roads = road_list
	for p in pois:
		if SHOPS.has(p.kind):
			var k := Vector2i(floori(p.position.x / MARKET_RADIUS), floori(p.position.y / MARKET_RADIUS))
			if not m._shops.has(k):
				m._shops[k] = PackedVector2Array()
			m._shops[k].append(p.position)
		if p.kind == &"place_of_worship":
			m._shrines.append(p.position)
		if p.name.to_lower().contains("beach"):
			m._anchors.append(p.position)
	m._stations = stations
	for l in landmarks:
		if l.kind == &"temple":
			m._temples.append(l.position)
		if l.kind == &"beach":
			m._anchors.append(l.position)
	for a in areas:
		if a.kind == &"beach" and a.outline.size() >= 3:
			m._beaches.append(a.outline)
			m._beach_boxes.append(_box(a.outline))
		if a.kind != &"water" and (a.name.to_lower().contains("beach") or a.name.to_lower().contains("marina")):
			m._anchors.append(_box(a.outline).get_center())
	m._sea = sea
	if sea != null and sea.outline.size() >= 3:
		m._sea_box = _box(sea.outline)
	for ri in road_list.size():
		var pts := road_list[ri].points
		for i in pts.size() - 1:
			var a := pts[i]
			var b := pts[i + 1]
			for cx in range(floori(minf(a.x, b.x) / GRID), floori(maxf(a.x, b.x) / GRID) + 1):
				for cz in range(floori(minf(a.y, b.y) / GRID), floori(maxf(a.y, b.y) / GRID) + 1):
					var key := Vector2i(cx, cz)
					if not m._segments.has(key):
						m._segments[key] = PackedInt64Array()
					m._segments[key].append(ri * 65536 + i)
	return m


static func _box(outline: PackedVector2Array) -> Rect2:
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for p in outline:
		lo = lo.min(p)
		hi = hi.max(p)
	return Rect2(lo, hi - lo)


static func people(kind: StringName, hour: float) -> float:
	var curve: Array[Vector2] = []
	curve.assign(PEOPLE[kind])
	return TrafficDensity.sample(curve, hour)


static func peak(kind: StringName) -> float:
	var best := 0.0
	for v: Vector2 in PEOPLE[kind]:
		best = maxf(best, v.y)
	return best


## Calls `visit(road_index, segment_index)` for segments in grid cells within `radius`
## (a segment may come more than once). Stops when `visit` returns true.
func segments_near(p: Vector2, radius: float, visit: Callable) -> void:
	for cx in range(floori((p.x - radius) / GRID), floori((p.x + radius) / GRID) + 1):
		for cz in range(floori((p.y - radius) / GRID), floori((p.y + radius) / GRID) + 1):
			for code: int in _segments.get(Vector2i(cx, cz), PackedInt64Array()):
				if visit.call(code >> 16, code & 0xffff) == true:
					return


func in_sea(p: Vector2) -> bool:
	if _sea == null or not _sea_box.has_point(p):
		return false
	return Geometry2D.is_point_in_polygon(p, _sea.outline)


func on_mapped_beach(p: Vector2) -> bool:
	for i in _beaches.size():
		if _beach_boxes[i].has_point(p) and Geometry2D.is_point_in_polygon(p, _beaches[i]):
			return not in_sea(p)
	return false


## Estimated shore sand: by the water near a named beach, seaward of the roads.
func on_shore(p: Vector2) -> bool:
	if _sea == null or _anchors.is_empty():
		return false
	var anchored := false
	for a in _anchors:
		if a.distance_to(p) < SHORE_ANCHOR:
			anchored = true
			break
	if not anchored:
		return false
	var best := Vector2.ZERO
	var best_d := INF
	var coast := _sea.coast
	for i in coast.size() - 1:
		var q := Geometry2D.get_closest_point_to_segment(p, coast[i], coast[i + 1])
		var d := q.distance_squared_to(p)
		if d < best_d:
			best_d = d
			best = q
	if best_d > SHORE_WIDTH * SHORE_WIDTH or in_sea(p):
		return false
	var blocked := [false]
	segments_near((p + best) / 2.0, sqrt(best_d) / 2.0 + SHORE_ROAD_CLEAR + 4.0, func(ri: int, i: int) -> bool:
		var r := roads[ri]
		var a := r.points[i]
		var b := r.points[i + 1]
		var reach := r.width / 2.0 + SHORE_ROAD_CLEAR
		if Geometry2D.get_closest_point_to_segment(p, a, b).distance_squared_to(p) < reach * reach or Geometry2D.segment_intersects_segment(p, best, a, b) != null:
			blocked[0] = true
		return blocked[0])
	return not blocked[0]


## On sand where people may stand or sit.
func on_sand(p: Vector2) -> bool:
	return on_mapped_beach(p) or on_shore(p)


## Any beach (mapped or named) within `radius` of a point: a cheap test before sampling sand.
func near_beach(p: Vector2, radius: float) -> bool:
	for box in _beach_boxes:
		if box.grow(radius).has_point(p):
			return true
	if _sea == null:
		return false
	for a in _anchors:
		if a.distance_to(p) < SHORE_ANCHOR + radius:
			return true
	return false


func _count(points: PackedVector2Array, p: Vector2, radius: float, enough: int) -> int:
	var n := 0
	for q in points:
		if q.distance_to(p) < radius:
			n += 1
			if n >= enough:
				break
	return n


func _shops_near(p: Vector2, radius: float, enough: int) -> int:
	var n := 0
	var c := Vector2i(floori(p.x / MARKET_RADIUS), floori(p.y / MARKET_RADIUS))
	for i in range(-1, 2):
		for k in range(-1, 2):
			for q: Vector2 in _shops.get(c + Vector2i(i, k), PackedVector2Array()):
				if q.distance_to(p) < radius:
					n += 1
					if n >= enough:
						return n
	return n


## The kind of place a segment of a road is (cached).
func segment_kind(ri: int, i: int) -> StringName:
	var key := ri * 65536 + i
	var k: StringName = _kinds.get(key, &"")
	if k == &"":
		var r := roads[ri]
		k = kind_at(r, (r.points[i] + r.points[i + 1]) / 2.0)
		_kinds[key] = k
	return k


## The kind of place a point on a road is, by the rules of TD-31 in order of precedence.
func kind_at(r: Road, p: Vector2) -> StringName:
	var lower := r.name.to_lower()
	if lower.contains("beach") or lower.contains("promenade") or lower.contains("marina") or _beside_sand(p, r.width / 2.0 + PROMENADE_REACH):
		return &"promenade"
	if _count(_stations, p, STATION_RADIUS, 1) > 0:
		return &"station"
	var shops := _shops_near(p, MARKET_RADIUS, MARKET_SHOPS)
	if shops >= MARKET_SHOPS:
		return &"market"
	if _count(_temples, p, TEMPLE_RADIUS, 1) > 0 or _count(_shrines, p, SHRINE_RADIUS, 1) > 0:
		return &"temple"
	if r.kind == &"primary" or r.kind == &"secondary" or r.kind == &"motorway":
		return &"main_road"
	if r.kind == &"tertiary" or shops >= STREET_SHOPS:
		return &"street"
	return &"lane"


func _beside_sand(p: Vector2, reach: float) -> bool:
	if _beaches.is_empty():
		return false
	var near := false
	for box in _beach_boxes:
		if box.grow(reach).has_point(p):
			near = true
	if not near:
		return false
	for k in 8:
		var angle := TAU * k / 8.0
		for r: float in [reach * 0.5, reach]:
			if on_mapped_beach(p + Vector2(sin(angle), cos(angle)) * r):
				return true
	return false


## People per 100 m of road round a point and the share of the traffic it gets (0..1):
## {people, traffic, place} where place is the kind with the most road length.
func area_levels(at: Vector2, hour: float, radius: float = 250.0) -> Dictionary:
	# Lambdas capture locals by value: sums in an array they share (length, people, driven, traffic).
	var acc := PackedFloat64Array([0.0, 0.0, 0.0, 0.0])
	var sums: Array = [acc]
	var seen: Dictionary[int, bool] = {}
	var by_kind: Dictionary[StringName, float] = {}
	segments_near(at, radius, func(ri: int, i: int) -> bool:
		var key := ri * 65536 + i
		if seen.has(key):
			return false
		seen[key] = true
		var r := roads[ri]
		var a := r.points[i]
		var b := r.points[i + 1]
		var m := (a + b) / 2.0
		if absf(m.x - at.x) > radius or absf(m.y - at.y) > radius:
			return false
		var l := a.distance_to(b)
		var k := segment_kind(ri, i)
		var s: PackedFloat64Array = sums[0]
		s[0] += l
		s[1] += l * people(k, hour)
		by_kind[k] = by_kind.get(k, 0.0) + l
		if r.kind != &"footway" and r.kind != &"service":
			var carries := l * float(CARRIES.get(r.kind, 1.0))
			s[2] += carries
			s[3] += carries * float(TRAFFIC[k])
		sums[0] = s
		return false)
	acc = sums[0]
	var length := acc[0]
	var ppl := acc[1]
	var driven := acc[2]
	var traffic := acc[3]
	var place: StringName = &""
	var most := 0.0
	for k: StringName in by_kind:
		if by_kind[k] > most:
			most = by_kind[k]
			place = k
	return {"people": ppl / length if length > 0.0 else 0.0, "traffic": traffic / driven if driven > 0.0 else 0.0, "place": place}


## How many of a pool of walkers and vehicles to put out: the pool times the area's people per
## 100 m against `full_at` (walkers), the pool times the hour's share times the area's traffic
## share, at least 0.3 of it (vehicles). Both at least `least`.
static func area_counts(levels: Dictionary, walkers: int, vehicles: int, traffic_share: float, least: int = 2, full_at: float = 2.5) -> Vector2i:
	var w := walkers * minf(1.0, float(levels["people"]) / full_at)
	var t := vehicles * traffic_share * maxf(0.3, minf(1.0, float(levels["traffic"])))
	return Vector2i(roundi(maxf(mini(least, walkers), w)), roundi(maxf(mini(least, vehicles), t)))
