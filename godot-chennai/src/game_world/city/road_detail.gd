class_name RoadDetail
extends RefCounted
## The street detail of one chunk that depends on the road class (G-310 to G-313): zebra crossings
## and stop lines at junction nodes, patches, potholes and manholes, footpaths, dust verges, drains,
## roadside trees and poles for streets that have none, and tree guards. Plain data worked out from
## the road centre lines, the same every time a chunk loads; nothing is stored in the world files.

## Pitch (metres along the road) of manholes, repair patches and potholes by class.
const MANHOLE_PITCH: Dictionary[StringName, float] = {&"arterial": 70.0, &"residential": 110.0, &"lane": 90.0, &"flyover": 0.0}
const PATCH_PITCH: Dictionary[StringName, float] = {&"arterial": 130.0, &"residential": 90.0, &"lane": 100.0, &"flyover": 0.0}
const POTHOLE_PITCH: Dictionary[StringName, float] = {&"arterial": 150.0, &"residential": 55.0, &"lane": 45.0, &"flyover": 0.0}
## Clear distance from a road's ends where nothing is painted or planted.
const END_CLEAR := 8.0
## A crossing sits this far from the junction node's edge (half the widest road plus this).
const CROSSING_GAP := 2.0
const STOP_GAP := 2.4
const MIN_ARTERIAL_WIDTH := 6.0
const TREE_APART := 5.0
const GUARD_REACH := 3.4
const POLE_SETBACK := 1.2


class Crossing:
	extends RefCounted
	var position: Vector2
	## Unit direction along the road (the zebra bars run along it).
	var dir: Vector2
	var width: float
	## Direction of the traffic that stops here, towards the junction.
	var travel: Vector2
	var oneway: bool
	## The node (junction) this crossing belongs to.
	var node: Vector2
	var road_id: int


class Mark:
	extends RefCounted
	## &"manhole", &"patch", &"pothole".
	var kind: StringName
	var position: Vector2
	var dir: Vector2
	var length: float
	var width: float
	var layer: int


class Plan:
	extends RefCounted
	var crossings: Array[Crossing] = []
	var decals: Array[Mark] = []
	var trees: Array[WorldTree] = []
	var poles: Array[StreetFurniture.Pole] = []
	var footpaths: Array[StreetFurniture.KerbRun] = []
	var drains: Array[StreetFurniture.KerbRun] = []


## Everything for one chunk. `furniture` is the chunk's poles, kerbs and shelters; `chunk_trees`
## the trees that already stand (planting keeps clear of them).
static func for_chunk(layout: CityLayout, chunk: ChunkData, cell: Vector2i, square: Rect2, furniture: StreetFurniture.Result) -> Plan:
	var out := Plan.new()
	var boxes := StreetFurniture.building_boxes(chunk.buildings)
	var spots: Array = layout.spots_in(cell)
	for span: CityLayout.RoadSpan in layout.spans_in(cell):
		var road := span.road
		var style := RoadStyle.of(road)
		if style.klass == RoadStyle.PATH or style.klass == RoadStyle.FLYOVER or road.tunnel:
			continue
		if style.klass == RoadStyle.ARTERIAL:
			out.crossings.append_array(crossings_on(layout, span, square, spots))
			var open := layout.blocked_stretches(span.index, false)
			out.footpaths.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, open, road.width / 2.0 + StreetFurniture.KERB_WIDTH, road.width / 2.0 + StreetFurniture.KERB_WIDTH + style.footpath, [1.0, -1.0]))
		else:
			var open := layout.blocked_stretches(span.index, false)
			if CityHash.unit(RoadStyle.way(road), 94) < 0.5:
				# An open drain along one side: a dark channel with a lip.
				var side: Array[float] = [1.0 if CityHash.unit(RoadStyle.way(road), 95) < 0.5 else -1.0]
				out.drains.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, open, road.width / 2.0 + 0.1, road.width / 2.0 + 0.5, side))
		out.decals.append_array(decals_on(layout, span, square))
		if style.tree_pitch > 0.0:
			out.trees.append_array(trees_on(layout, span, style, chunk, boxes, square, furniture))
		if style.pole_pitch > 0.0:
			out.poles.append_array(poles_on(layout, span, style, chunk, boxes, square, out.trees))
	return out


## Zebra crossings and stop lines on the arms of every junction node of an arterial road that lies
## in `square`: one crossing per arm, set back from the node by half the widest road plus a gap.
## None where an infrastructure spot (a mapped or signalised zebra, G-153) is within 10 m.
static func crossings_on(layout: CityLayout, span: CityLayout.RoadSpan, square: Rect2, spots: Array) -> Array[Crossing]:
	var out: Array[Crossing] = []
	var road := span.road
	if road.width < MIN_ARTERIAL_WIDTH:
		return out
	var dist: PackedFloat64Array = layout.along[span.index]
	var total := dist[dist.size() - 1]
	for i in range(span.start, span.end + 1):
		var node: CityLayout.RoadNode = layout.nodes.get(CityLayout.node_key(road.points[i]))
		if node == null or node.degree < 3 or not square.has_point(road.points[i]):
			continue
		var gap := node.width / 2.0 + CROSSING_GAP
		for sgn: float in [-1.0, 1.0]:
			var d := dist[i] + sgn * gap
			if d < 1.0 or d > total - 1.0 or (road.is_raised() and road.height_along(d - dist[0]) > 0.05):
				continue
			var at := CityLayout.point_along(road.points, dist, d)
			var dir: Vector2 = at["dir"]
			var travel := dir * -sgn
			if road.oneway and sgn > 0.0:
				continue
			var p: Vector2 = at["p"]
			var near := false
			for sp: WorldSpot in spots:
				near = near or (sp.is_zebra() and sp.position.distance_to(p) < 10.0)
			if near:
				continue
			var c := Crossing.new()
			c.position = p
			c.dir = dir
			c.width = road.width
			c.travel = travel
			c.oneway = road.oneway
			c.node = road.points[i]
			c.road_id = road.id
			out.append(c)
	return out


## Manholes, repair patches and potholes at distances fixed by the way id, so chunks agree.
static func decals_on(layout: CityLayout, span: CityLayout.RoadSpan, square: Rect2) -> Array[Mark]:
	var out: Array[Mark] = []
	var road := span.road
	var style := RoadStyle.of(road)
	var klass := style.klass
	if not MANHOLE_PITCH.has(klass) or MANHOLE_PITCH[klass] <= 0.0:
		return out
	var dist: PackedFloat64Array = layout.along[span.index]
	var d0 := dist[span.start]
	var d1 := dist[span.end]
	var worn := RoadStyle.is_worn(road)
	var concrete := RoadStyle.is_concrete(road)
	var way := RoadStyle.way(road)
	var total := road.total_length if road.total_length > 0.0 else dist[dist.size() - 1]
	# kind, pitch, salt
	for spec: Array in [[&"manhole", MANHOLE_PITCH[klass], 201], [&"patch", PATCH_PITCH[klass], 202], [&"pothole", POTHOLE_PITCH[klass], 203]]:
		var kind: StringName = spec[0]
		var pitch: float = spec[1]
		var salt: int = spec[2]
		if kind == &"patch" and not (worn or concrete):
			continue
		if kind == &"pothole" and concrete:
			continue
		if kind == &"pothole" and not worn and klass == RoadStyle.ARTERIAL:
			continue
		var k := maxi(0, floori(d0 / pitch) - 1)
		while true:
			var whole := (k + 0.15 + 0.7 * CityHash.unit(way * 31 + k, salt)) * pitch
			k += 1
			var d := whole
			if d < d0:
				continue
			if d >= d1:
				break
			if d < END_CLEAR or d > total - END_CLEAR:
				continue
			var at := CityLayout.point_along(road.points, dist, d)
			var dir: Vector2 = at["dir"]
			var across := Vector2(-dir.y, dir.x)
			var u := CityHash.unit(way * 31 + k, salt + 10)
			var v := CityHash.unit(way * 31 + k, salt + 20)
			var half := road.width / 2.0
			var dc := Mark.new()
			dc.kind = kind
			dc.dir = dir
			match kind:
				&"manhole":
					dc.length = 0.7
					dc.width = 0.7
					dc.layer = CityAtlas.GROUND_DARK
					dc.position = (at["p"] as Vector2) + across * (u - 0.5) * half
				&"patch":
					dc.length = 1.6 + 1.5 * v
					dc.width = 1.0 + 0.6 * u
					dc.layer = CityAtlas.GROUND_ASPHALT if (worn or concrete) else CityAtlas.GROUND_ASPHALT_WORN
					dc.position = (at["p"] as Vector2) + across * (u - 0.5) * (half * 1.2)
				_:
					dc.length = 0.5 + 0.5 * v
					dc.width = 0.4 + 0.5 * u
					dc.layer = CityAtlas.GROUND_DARK
					dc.position = (at["p"] as Vector2) + across * (1.0 if v < 0.5 else -1.0) * maxf(0.5, half - 0.6 - u * 1.4)
			if square.has_point(dc.position):
				out.append(dc)
	return out


## Trees along a street that data planted none on (residential streets and lanes).
static func trees_on(layout: CityLayout, span: CityLayout.RoadSpan, style: RoadStyle, chunk: ChunkData, boxes: Array[Rect2], square: Rect2, furniture: StreetFurniture.Result) -> Array[WorldTree]:
	var out: Array[WorldTree] = []
	var road := span.road
	var dist: PackedFloat64Array = layout.along[span.index]
	var from := dist[span.start]
	var to := dist[span.end]
	var way := RoadStyle.way(road)
	var blocked := layout.blocked_stretches(span.index, true)
	var offset := road.width / 2.0 + style.tree_edge
	var phase := CityHash.unit(way, 96) * style.tree_pitch
	var k := maxi(0, ceili((from - phase) / style.tree_pitch))
	while phase + k * style.tree_pitch < to:
		var d := phase + k * style.tree_pitch
		k += 1
		if d < from or CityHash.unit(way * 17 + k, 97) >= style.tree_keep or _in(d, blocked):
			continue
		var at := CityLayout.point_along(road.points, dist, d)
		var dir: Vector2 = at["dir"]
		var side := 1.0 if (k % 2 == 0) != (CityHash.unit(way, 98) < 0.5) else -1.0
		var p: Vector2 = (at["p"] as Vector2) + Vector2(dir.y, -dir.x) * side * offset
		if not square.has_point(p) or StreetFurniture.in_building(chunk.buildings, boxes, p, 1.0) or layout.on_other_road(p, -1, 1.5):
			continue
		if _crowded(p, chunk.trees, out):
			continue
		var t := WorldTree.new()
		t.position = p
		t.scale = 0.85 + 0.45 * CityHash.unit(way * 17 + k, 99)
		t.source = &"road"
		t.species = RoadStyle.pick_species(style.species, CityHash.unit(way * 17 + k, 100))
		out.append(t)
	return out


## Poles (and so wires) along streets that have none: one side, every pole_pitch metres.
static func poles_on(layout: CityLayout, span: CityLayout.RoadSpan, style: RoadStyle, chunk: ChunkData, boxes: Array[Rect2], square: Rect2, planted: Array[WorldTree]) -> Array[StreetFurniture.Pole]:
	var out: Array[StreetFurniture.Pole] = []
	var road := span.road
	if CityHash.unit(RoadStyle.way(road), 101) < 0.25:
		return out
	var dist: PackedFloat64Array = layout.along[span.index]
	var from := dist[span.start]
	var to := dist[span.end]
	var way := RoadStyle.way(road)
	var blocked := layout.blocked_stretches(span.index, true)
	var side := 1.0 if CityHash.unit(way, 102) < 0.5 else -1.0
	var phase := CityHash.unit(way, 103) * style.pole_pitch
	var k := maxi(0, ceili((from - phase) / style.pole_pitch))
	while phase + k * style.pole_pitch < to:
		var d := phase + k * style.pole_pitch
		k += 1
		if d < from or _in(d, blocked):
			continue
		var at := CityLayout.point_along(road.points, dist, d)
		var dir: Vector2 = at["dir"]
		var l := Vector2(dir.y * side, -dir.x * side)
		var p: Vector2 = (at["p"] as Vector2) + l * (road.width / 2.0 + POLE_SETBACK)
		if not square.has_point(p) or StreetFurniture.in_building(chunk.buildings, boxes, p, 0.3) or layout.on_other_road(p, -1, 0.8):
			continue
		if _crowded(p, planted, [] as Array[WorldTree], 2.0):
			continue
		var pole := StreetFurniture.Pole.new()
		pole.position = p
		pole.yaw = StreetFurniture.facing(-l)
		pole.road_id = road.id
		out.append(pole)
	return out


## Positions of trees that need a guard: standing within GUARD_REACH of an arterial's edge, about
## two in five (young avenue trees get a cage).
static func guarded(layout: CityLayout, trees: Array[WorldTree]) -> Array[Vector2]:
	var out: Array[Vector2] = []
	for t in trees:
		if CityHash.tree_unit(t.position, 61) >= 0.25:
			continue
		var near := [false]
		layout.segments_near(t.position, 8.0, func(ri: int, i: int) -> bool:
			var road := layout.roads[ri]
			if not road.is_main() or road.is_raised():
				return false
			var q := Geometry2D.get_closest_point_to_segment(t.position, road.points[i], road.points[i + 1])
			if q.distance_to(t.position) < road.width / 2.0 + GUARD_REACH:
				near[0] = true
			return near[0])
		if near[0]:
			out.append(t.position)
	return out


static func _in(d: float, stretches: PackedVector2Array) -> bool:
	for s in stretches:
		if d >= s.x and d <= s.y:
			return true
	return false


static func _crowded(p: Vector2, standing: Array[WorldTree], planted: Array[WorldTree], apart: float = TREE_APART) -> bool:
	for t in standing:
		if t.position.distance_squared_to(p) < apart * apart:
			return true
	for t in planted:
		if t.position.distance_squared_to(p) < apart * apart:
			return true
	return false
