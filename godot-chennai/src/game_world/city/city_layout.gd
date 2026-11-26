class_name CityLayout
extends RefCounted
## What the streamed city needs from the road network, worked out once when the world opens
## (on a worker thread: it touches no node). Ports of `roadSpansByChunk` (`roadChunks.ts`),
## the road segment grid (`geometry.ts`), the main-road junctions, distances and bus shelters
## of `furniture.ts`.
##
## Read-only once built, so every chunk build on every worker thread can share it. For the
## regional world there is one per 10 km tile, with the neighbours' roads near its edges
## (`CityLayouts`).

## A run of consecutive segments of one road whose midpoints lie in one chunk.
class RoadSpan:
	extends RefCounted
	var road: Road
	## First and last point of the run (inclusive), indices into `road.points`.
	var start: int = 0
	var end: int = 0
	## Distance along the road to `start`, metres (keeps lane dashes in step across chunks).
	var offset: float = 0.0
	## Length of the whole road, metres.
	var total: float = 0.0
	## Index of the road in the network (for `along`).
	var index: int = 0


## A junction or bend on a main road: how many drivable arms meet there and the widest road.
class RoadNode:
	extends RefCounted
	var degree: int = 0
	var width: float = 0.0


## Side of the road segment grid's cells, metres (`SEGMENT_CELL`).
const SEGMENT_CELL := 64.0

var bounds: Rect2
var chunk_size: float
var roads: Array[Road] = []
## Chunk cell -> spans drawn by that chunk (every road kind).
var spans: Dictionary[Vector2i, Array] = {}
## Road index -> distance along it to each point (main roads only).
var along: Dictionary[int, PackedFloat64Array] = {}
## `node_key` -> RoadNode, for every point of a main road.
var nodes: Dictionary[int, RoadNode] = {}
## Chunk cell -> bus shelters standing in it (`StreetFurniture.Shelter`).
var shelters: Dictionary[Vector2i, Array] = {}
## Format 2.1 (G-150…G-153): waterway centre lines of the tile and its margin, and the chunk
## cells each one's water ribbon touches; street spots (crossings, speed breakers) by chunk cell.
var waterways: Array[WorldWaterway] = []
var water_cells: Dictionary[Vector2i, PackedInt32Array] = {}
var spots: Dictionary[Vector2i, Array] = {}
## Grid cell -> road index * 65536 + segment index.
var _segments: Dictionary[Vector2i, PackedInt64Array] = {}


static func build(network: RoadNetwork, world_bounds: Rect2, size: float, bus_stops: Array[Place] = [], water: Array[WorldWaterway] = [], street_spots: Array[WorldSpot] = []) -> CityLayout:
	var layout := CityLayout.new()
	layout.bounds = world_bounds
	layout.chunk_size = size
	layout.roads = network.roads
	layout._build_spans()
	layout._build_grid()
	layout._build_nodes()
	layout.shelters = StreetFurniture.place_shelters(layout, bus_stops)
	layout._add_water(water)
	for sp in street_spots:
		var cell := layout.cell_at(sp.position)
		if not layout.spots.has(cell):
			layout.spots[cell] = []
		layout.spots[cell].append(sp)
	return layout


func _add_water(water: Array[WorldWaterway]) -> void:
	for w in water:
		if w.tunnel or w.points.size() < 2:
			continue
		var wi := waterways.size()
		waterways.append(w)
		var lo := Vector2(INF, INF)
		var hi := Vector2(-INF, -INF)
		for p in w.points:
			lo = lo.min(p)
			hi = hi.max(p)
		var half := w.width / 2.0 + 2.0
		var c0 := cell_at(lo - Vector2(half, half))
		var c1 := cell_at(hi + Vector2(half, half))
		for cx in range(c0.x, c1.x + 1):
			for cz in range(c0.y, c1.y + 1):
				var cell := Vector2i(cx, cz)
				var square := Rect2(bounds.position + Vector2(cell) * chunk_size, Vector2(chunk_size, chunk_size)).grow(half)
				var touches := false
				for i in w.points.size() - 1:
					var a := w.points[i]
					var b := w.points[i + 1]
					if Rect2(a.min(b), (a.max(b) - a.min(b))).grow(0.01).intersects(square):
						touches = true
						break
				if touches:
					if not water_cells.has(cell):
						water_cells[cell] = PackedInt32Array()
					water_cells[cell].append(wi)


## Waterways whose ribbon may reach into a chunk.
func water_in(cell: Vector2i) -> Array[WorldWaterway]:
	var out: Array[WorldWaterway] = []
	for wi: int in water_cells.get(cell, PackedInt32Array()):
		out.append(waterways[wi])
	return out


## Street spots (crossings, speed breakers) standing in a chunk.
func spots_in(cell: Vector2i) -> Array:
	return spots.get(cell, [])


func cell_at(p: Vector2) -> Vector2i:
	return Vector2i(floori((p.x - bounds.position.x) / chunk_size), floori((p.y - bounds.position.y) / chunk_size))


## Spans drawn by one chunk (may be empty).
func spans_in(cell: Vector2i) -> Array:
	return spans.get(cell, [])


func _build_spans() -> void:
	for ri in roads.size():
		var road := roads[ri]
		var pts := road.points
		if pts.size() < 2:
			continue
		# Distances along the whole road: a format 2 piece starts `offset_along` metres in, so
		# dashes, poles and props stay in step across tiles.
		var dist := PackedFloat64Array()
		dist.resize(pts.size())
		var run := road.offset_along
		dist[0] = run
		for i in range(1, pts.size()):
			run += pts[i - 1].distance_to(pts[i])
			dist[i] = run
		var total := road.total_length if road.total_length > 0.0 else run
		if road.kind != &"footway":
			along[ri] = dist
		var run_key := Vector2i(-999999, -999999)
		var run_start := 0
		var run_offset := 0.0
		for i in pts.size() - 1:
			var key := cell_at((pts[i] + pts[i + 1]) * 0.5)
			if key != run_key:
				if run_key.x != -999999:
					_push_span(run_key, road, ri, run_start, i, run_offset, total)
				run_key = key
				run_start = i
				run_offset = dist[i]
		_push_span(run_key, road, ri, run_start, pts.size() - 1, run_offset, total)


func _push_span(key: Vector2i, road: Road, ri: int, start: int, end: int, offset: float, total: float) -> void:
	var s := RoadSpan.new()
	s.road = road
	s.index = ri
	s.start = start
	s.end = end
	s.offset = offset
	s.total = total
	if not spans.has(key):
		spans[key] = []
	spans[key].append(s)


func _build_grid() -> void:
	for ri in roads.size():
		var pts := roads[ri].points
		for i in pts.size() - 1:
			var a := pts[i]
			var b := pts[i + 1]
			for cx in range(floori(minf(a.x, b.x) / SEGMENT_CELL), floori(maxf(a.x, b.x) / SEGMENT_CELL) + 1):
				for cz in range(floori(minf(a.y, b.y) / SEGMENT_CELL), floori(maxf(a.y, b.y) / SEGMENT_CELL) + 1):
					var k := Vector2i(cx, cz)
					if not _segments.has(k):
						_segments[k] = PackedInt64Array()
					_segments[k].append(ri * 65536 + i)


## Calls `visit(road_index, segment_index)` for road segments in grid cells within `radius` of a
## point; a segment may come more than once. Stops when `visit` returns true.
func segments_near(p: Vector2, radius: float, visit: Callable) -> void:
	for cx in range(floori((p.x - radius) / SEGMENT_CELL), floori((p.x + radius) / SEGMENT_CELL) + 1):
		for cz in range(floori((p.y - radius) / SEGMENT_CELL), floori((p.y + radius) / SEGMENT_CELL) + 1):
			var list: PackedInt64Array = _segments.get(Vector2i(cx, cz), PackedInt64Array())
			for code in list:
				if visit.call(code >> 16, code & 0xffff) == true:
					return


## Exact key of a mapped node (roads share quantised coordinates where they meet).
static func node_key(p: Vector2) -> int:
	return (CityHash.js_round(p.x * 20.0) + 1048576) * 2097152 + (CityHash.js_round(p.y * 20.0) + 1048576)


func _build_nodes() -> void:
	for road in roads:
		if road.is_main():
			for p in road.points:
				nodes[node_key(p)] = RoadNode.new()
	for road in roads:
		if road.kind == &"footway":
			continue
		var pts := road.points
		for i in pts.size():
			var node: RoadNode = nodes.get(node_key(pts[i]))
			if node == null:
				continue
			node.degree += 1 if i == 0 or i == pts.size() - 1 else 2
			node.width = maxf(node.width, road.width)


## Nearest point on a drivable road's centre line (`nearestRoadPoint`): a Dictionary with
## road_index, point, distance and heading (radians, 0 = towards -Z), or {} when no road.
func nearest_road_point(p: Vector2, drivable_only: bool = true) -> Dictionary:
	for radius: float in [40.0, 160.0, 640.0]:
		# Lambdas capture locals by value: keep the best hit in an array they share.
		var best: Array = [{}, INF]
		segments_near(p, radius, func(ri: int, i: int) -> bool:
			var road := roads[ri]
			if drivable_only and road.kind == &"footway":
				return false
			var a := road.points[i]
			var b := road.points[i + 1]
			var q := Geometry2D.get_closest_point_to_segment(p, a, b)
			var d2 := q.distance_squared_to(p)
			if d2 < float(best[1]):
				best[1] = d2
				best[0] = {"road_index": ri, "point": q, "distance": sqrt(d2), "heading": atan2(-(b.x - a.x), -(b.y - a.y))}
			return false)
		var found: Dictionary = best[0]
		if not found.is_empty() and float(found["distance"]) <= radius:
			return found
	return {}


## Whether a point is on the carriageway of a drivable road other than `except_id`.
func on_other_road(p: Vector2, except_id: int, margin: float) -> bool:
	var found := [false]
	segments_near(p, 30.0, func(ri: int, i: int) -> bool:
		var road := roads[ri]
		if road.id == except_id or road.kind == &"footway":
			return false
		var q := Geometry2D.get_closest_point_to_segment(p, road.points[i], road.points[i + 1])
		var reach := road.width / 2.0 + margin
		if q.distance_squared_to(p) < reach * reach:
			found[0] = true
		return found[0])
	return found[0]


## Lanes on a road: the mapped count, else about one per 3.5 m of carriageway (`laneCount`).
static func lane_count(road: Road) -> int:
	if road.lanes > 0:
		return road.lanes
	if road.kind == &"footway":
		return 1
	return maxi(1 if road.oneway else 2, mini(8, CityHash.js_round(road.width / 3.5)))


## Stretches of a road kept clear of furniture, as Vector2(from, to) distances along it: round
## every junction, and both ends when `ends` (`blockedStretches`).
func blocked_stretches(ri: int, ends: bool) -> PackedVector2Array:
	var road := roads[ri]
	var dist: PackedFloat64Array = along[ri]
	var total := road.total_length if road.total_length > 0.0 else dist[dist.size() - 1]
	var out := PackedVector2Array()
	if ends:
		out.append(Vector2(-1.0, StreetFurniture.END_CLEAR))
		out.append(Vector2(total - StreetFurniture.END_CLEAR, total + 1.0))
	for i in road.points.size():
		var node: RoadNode = nodes.get(node_key(road.points[i]))
		if node == null or node.degree < 3:
			continue
		var clear := maxf(StreetFurniture.END_CLEAR, node.width / 2.0 + 3.0)
		out.append(Vector2(dist[i] - clear, dist[i] + clear))
	out.append_array(raised_stretches(road, dist[0]))
	return out


## Stretches (distances along the whole road) where a piece is off the ground: no kerbs, poles
## or props stand there at ground level (G-151).
static func raised_stretches(road: Road, start: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	if not road.is_raised():
		return out
	var from := -1.0
	var n := road.heights.size()
	for k in n:
		var d := minf(k * road.height_step, road.along[road.along.size() - 1])
		var up := road.heights[k] > 0.05 or (k > 0 and road.heights[k - 1] > 0.05)
		if up and from < 0.0:
			from = maxf(0.0, d - road.height_step)
		elif not up and from >= 0.0:
			out.append(Vector2(start + from - 2.0, start + d + 2.0))
			from = -1.0
	if from >= 0.0:
		out.append(Vector2(start + from - 2.0, start + road.along[road.along.size() - 1] + 2.0))
	return out


## Point (x, z), unit direction and segment index at distance `d` along a road (`at`).
static func point_along(points: PackedVector2Array, dist: PackedFloat64Array, d: float) -> Dictionary:
	var i := 0
	while i < points.size() - 2 and dist[i + 1] < d:
		i += 1
	var a := points[i]
	var b := points[i + 1]
	var length := dist[i + 1] - dist[i]
	if length == 0.0:
		length = 1.0
	var t := clampf((d - dist[i]) / length, 0.0, 1.0)
	return {"p": a + (b - a) * t, "dir": (b - a) / length, "i": i}
