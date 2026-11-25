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
## A chunk with fewer buildings than this is open country: rural road style (G-314).
const RURAL_BUILDINGS := 30
## A bend: turning at least this much (radians) over consecutive vertices; barriers and chevrons
## from the sharper ones.
const BEND_MIN := 0.35
const BEND_SHARP := 0.6
const KM_PITCH := 1000.0


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
	## &"manhole", &"patch", &"pothole", &"stripped", &"puddle", &"rubble".
	var kind: StringName
	var position: Vector2
	var dir: Vector2
	var length: float
	var width: float
	var layer: int


class Post:
	extends RefCounted
	var position: Vector2
	## Yaw as for `StreetFurniture.Pole`: the model's -Z faces the road.
	var yaw: float


class Plan:
	extends RefCounted
	## Open country (G-314): shoulders, painted kerb blocks on bends, crash barriers, chevrons.
	var rural: bool = false
	var blocks: Array[StreetFurniture.KerbRun] = []
	var barriers: Array[StreetFurniture.KerbRun] = []
	var chevrons: Array[Post] = []
	var stones: Array[Post] = []
	var crossings: Array[Crossing] = []
	var decals: Array[Mark] = []
	var trees: Array[WorldTree] = []
	var poles: Array[StreetFurniture.Pole] = []
	var footpaths: Array[StreetFurniture.KerbRun] = []
	var drains: Array[StreetFurniture.KerbRun] = []
	## Wheel ruts and the soil lip at the edge of damaged and unpaved roads (G-315).
	var ruts: Array[StreetFurniture.KerbRun] = []
	var lips: Array[StreetFurniture.KerbRun] = []


## Everything for one chunk. `furniture` is the chunk's poles, kerbs and shelters; `chunk_trees`
## the trees that already stand (planting keeps clear of them).
static func for_chunk(layout: CityLayout, chunk: ChunkData, cell: Vector2i, square: Rect2, furniture: StreetFurniture.Result, extras: int = 2) -> Plan:
	var out := Plan.new()
	var boxes := StreetFurniture.building_boxes(chunk.buildings)
	var spots: Array = layout.spots_in(cell)
	out.rural = chunk.buildings.size() < RURAL_BUILDINGS
	var masts: Dictionary[int, bool] = {}
	for span: CityLayout.RoadSpan in layout.spans_in(cell):
		var road := span.road
		var style := RoadStyle.of(road)
		if style.klass == RoadStyle.PATH or style.klass == RoadStyle.FLYOVER or road.tunnel:
			continue
		if style.klass == RoadStyle.ARTERIAL and out.rural:
			style = RoadStyle.rural(road)
			rural_on(out, layout, span, square)
		elif style.klass == RoadStyle.ARTERIAL:
			out.crossings.append_array(crossings_on(layout, span, square, spots))
			var open := layout.blocked_stretches(span.index, false)
			out.footpaths.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, open, road.width / 2.0 + StreetFurniture.KERB_WIDTH, road.width / 2.0 + StreetFurniture.KERB_WIDTH + style.footpath, [1.0, -1.0]))
		else:
			var open := layout.blocked_stretches(span.index, false)
			if CityHash.unit(RoadStyle.way(road), 94) < 0.5:
				# An open drain along one side: a dark channel with a lip.
				var side: Array[float] = [1.0 if CityHash.unit(RoadStyle.way(road), 95) < 0.5 else -1.0]
				out.drains.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, open, road.width / 2.0 + 0.1, road.width / 2.0 + 0.5, side))
		out.decals.append_array(decals_on(layout, span, square, out.rural, extras < 2))
		var cond := RoadStyle.condition(road, out.rural)
		if cond == RoadStyle.DAMAGED or cond == RoadStyle.UNPAVED:
			wear_on(out, layout, span, cond)
		if style.tree_pitch > 0.0 and not (out.rural and style.klass != RoadStyle.RURAL):
			out.trees.append_array(trees_on(layout, span, style, chunk, boxes, square, furniture))
		if style.pole_pitch > 0.0:
			out.poles.append_array(poles_on(layout, span, style, chunk, boxes, square, out.trees))
		if style.klass == RoadStyle.ARTERIAL and not out.rural:
			masts_on(out, layout, span, chunk, boxes, square, masts)
	out.poles.append_array(twin_poles(furniture.medians, square))
	return out


## Bends of a road piece: dictionaries with i0, i1 (vertex range), side (+1 or -1, the outer side
## in the sense of `StreetFurniture.offset_runs`) and angle (radians turned).
static func bends_on(road: Road, span: CityLayout.RoadSpan) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var pts := road.points
	var first := -1
	var angle := 0.0
	var sign := 0.0
	for i in range(span.start + 1, span.end + 1):
		var turn := 0.0
		var s := 0.0
		if i < span.end:
			var a := pts[i] - pts[i - 1]
			var b := pts[i + 1] - pts[i]
			if a.length() > 0.01 and b.length() > 0.01:
				turn = absf(a.angle_to(b))
				s = signf(b.dot(Vector2(a.y, -a.x)))
		if turn > 0.03 and first >= 0 and s == sign:
			angle += turn
			continue
		if first >= 0 and angle >= BEND_MIN:
			out.append({"i0": first - 1, "i1": i, "side": -sign, "angle": angle})
		first = -1
		angle = 0.0
		if turn > 0.03:
			first = i
			angle = turn
			sign = s
	return out


## Open-country detail along one arterial piece: painted kerb blocks on the outside of bends, crash
## barriers and chevron boards on the sharp ones, kilometre stones.
static func rural_on(out: Plan, layout: CityLayout, span: CityLayout.RoadSpan, square: Rect2) -> void:
	var road := span.road
	var dist: PackedFloat64Array = layout.along[span.index]
	var total := dist[dist.size() - 1]
	var blocked := layout.blocked_stretches(span.index, false)
	for bend in bends_on(road, span):
		var d0 := dist[bend["i0"]] - 3.0
		var d1 := dist[bend["i1"]] + 3.0
		var stretches := PackedVector2Array(blocked)
		stretches.append(Vector2(-1.0, d0))
		stretches.append(Vector2(d1, total + 1.0e6))
		var side: Array[float] = []
		side.append(float(bend["side"]))
		var half := road.width / 2.0
		out.blocks.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, stretches, half + 0.35, half + 0.75, side))
		if float(bend["angle"]) >= BEND_SHARP:
			out.barriers.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, stretches, half + 1.3, half + 1.3, side))
			var d := d0 + 4.0
			var count := 0
			while d < d1 - 4.0 and count < 6:
				var at := CityLayout.point_along(road.points, dist, d)
				var dir: Vector2 = at["dir"]
				var l := Vector2(dir.y, -dir.x) * float(bend["side"])
				var post := Post.new()
				post.position = (at["p"] as Vector2) + l * (half + 2.0)
				post.yaw = StreetFurniture.facing(-l)
				if square.has_point(post.position):
					out.chevrons.append(post)
				d += 11.0
				count += 1
	# Kilometre stones where the whole road's distance crosses a multiple of KM_PITCH.
	var from := dist[span.start]
	var to := dist[span.end]
	var k := ceili(from / KM_PITCH)
	while k * KM_PITCH < to:
		var at := CityLayout.point_along(road.points, dist, k * KM_PITCH)
		var dir: Vector2 = at["dir"]
		var l := Vector2(dir.y, -dir.x)
		var post := Post.new()
		post.position = (at["p"] as Vector2) + l * (road.width / 2.0 + 1.2)
		post.yaw = StreetFurniture.facing(-l)
		if square.has_point(post.position):
			out.stones.append(post)
		k += 1


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


## Marks on the carriageway at distances fixed by the way id, so chunks agree: manholes, repair
## patches, potholes and by condition (G-315) large stripped-tar patches, water-filled holes, puddles
## and brick and stone rubble.
static func decals_on(layout: CityLayout, span: CityLayout.RoadSpan, square: Rect2, rural: bool = false, no_rubble: bool = false) -> Array[Mark]:
	var out: Array[Mark] = []
	var road := span.road
	var klass := RoadStyle.klass_of(road)
	if not MANHOLE_PITCH.has(klass) or MANHOLE_PITCH[klass] <= 0.0:
		return out
	var cond := RoadStyle.condition(road, rural)
	var dist: PackedFloat64Array = layout.along[span.index]
	var d0 := dist[span.start]
	var d1 := dist[span.end]
	var concrete := RoadStyle.is_concrete(road) and cond != RoadStyle.DAMAGED and cond != RoadStyle.UNPAVED
	var way := RoadStyle.way(road)
	var total := road.total_length if road.total_length > 0.0 else dist[dist.size() - 1]
	var specs: Array = []
	if cond != RoadStyle.UNPAVED:
		specs.append([&"manhole", MANHOLE_PITCH[klass], 201])
	match cond:
		RoadStyle.WORN:
			specs.append([&"patch", PATCH_PITCH[klass], 202])
			specs.append([&"pothole", POTHOLE_PITCH[klass], 203])
		RoadStyle.DAMAGED:
			specs.append([&"stripped", 60.0, 204])
			specs.append([&"pothole", 28.0, 203])
			specs.append([&"rubble", 45.0, 205])
		RoadStyle.UNPAVED:
			specs.append([&"puddle", 30.0, 206])
			specs.append([&"rubble", 14.0, 205])
			specs.append([&"pothole", 22.0, 203])
		_:
			if concrete:
				specs.append([&"patch", PATCH_PITCH[klass], 202])
	for spec: Array in specs:
		if no_rubble and spec[0] == &"rubble":
			continue
		var kind: StringName = spec[0]
		var pitch: float = spec[1]
		var salt: int = spec[2]
		var k := maxi(0, floori(d0 / pitch) - 1)
		while true:
			var d := (k + 0.15 + 0.7 * CityHash.unit(way * 31 + k, salt)) * pitch
			k += 1
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
			var centre: Vector2 = at["p"]
			var dc := Mark.new()
			dc.kind = kind
			dc.dir = dir
			match kind:
				&"manhole":
					dc.length = 0.7
					dc.width = 0.7
					dc.layer = CityAtlas.GROUND_DARK
					dc.position = centre + across * (u - 0.5) * half
				&"patch":
					dc.length = 1.6 + 1.5 * v
					dc.width = 1.0 + 0.6 * u
					dc.layer = CityAtlas.GROUND_ASPHALT if not concrete and cond != RoadStyle.GOOD else CityAtlas.GROUND_ASPHALT_WORN
					dc.position = centre + across * (u - 0.5) * (half * 1.2)
				&"stripped":
					# Milled-off tar showing the grey base course, the length of a car or two.
					dc.length = 6.0 + 8.0 * v
					dc.width = minf(road.width * 0.7, 2.4 + 2.0 * u)
					dc.layer = CityAtlas.GROUND_STRIPPED
					dc.position = centre + across * (u - 0.5) * maxf(0.0, road.width - dc.width) * 0.8
				&"puddle":
					dc.length = 2.5 + 2.5 * v
					dc.width = minf(road.width * 0.6, 1.4 + 1.6 * u)
					dc.layer = CityAtlas.GROUND_PUDDLE
					dc.position = centre + across * (u - 0.5) * maxf(0.0, road.width - dc.width) * 0.8
				&"rubble":
					dc.length = 0.18 + 0.3 * v
					dc.width = 0.15 + 0.25 * u
					dc.layer = CityAtlas.GROUND_BRICK if CityHash.unit(way * 31 + k, salt + 30) < 0.55 else CityAtlas.GROUND_DARK
					dc.position = centre + across * (u - 0.5) * half * 1.5
				_:
					var wet := cond != RoadStyle.WORN and v < 0.5
					dc.length = (0.9 + 1.1 * v) if cond != RoadStyle.WORN else (0.5 + 0.5 * v)
					dc.width = (0.8 + 0.8 * u) if cond != RoadStyle.WORN else (0.4 + 0.5 * u)
					dc.layer = CityAtlas.GROUND_PUDDLE if wet else CityAtlas.GROUND_DARK
					if wet:
						dc.kind = &"puddle"
					dc.position = centre + across * (1.0 if v < 0.5 else -1.0) * maxf(0.5, half - 0.6 - u * 1.4)
			if square.has_point(dc.position):
				out.append(dc)
				if kind == &"rubble":
					# A scatter of five pieces round the first.
					for j in 4:
						var m := Mark.new()
						m.kind = kind
						m.dir = Vector2.from_angle(CityHash.unit(way * 31 + k, 240 + j) * TAU)
						m.length = 0.12 + 0.25 * CityHash.unit(way * 31 + k, 250 + j)
						m.width = 0.1 + 0.2 * CityHash.unit(way * 31 + k, 260 + j)
						m.layer = CityAtlas.GROUND_BRICK if CityHash.unit(way * 31 + k, 270 + j) < 0.5 else CityAtlas.GROUND_DARK
						m.position = dc.position + Vector2(CityHash.unit(way * 31 + k, 280 + j) - 0.5, CityHash.unit(way * 31 + k, 290 + j) - 0.5) * 1.6
						out.append(m)
	return out


## Wheel ruts and a soil lip along the edges of a damaged or unpaved road piece (G-315).
static func wear_on(out: Plan, layout: CityLayout, span: CityLayout.RoadSpan, cond: StringName) -> void:
	var road := span.road
	var open := layout.blocked_stretches(span.index, false)
	var half := road.width / 2.0
	var both: Array[float] = [1.0, -1.0]
	# Two tracks in each lane; a narrow road has one pair either side of its middle.
	var tracks: Array[float] = []
	if road.width >= 4.6:
		tracks = [half / 2.0 - 0.95, half / 2.0 + 0.5]
	else:
		tracks = [0.45]
	var layer := CityAtlas.GROUND_RUT if cond == RoadStyle.UNPAVED else CityAtlas.GROUND_ASPHALT
	for a: float in tracks:
		for run in StreetFurniture.offset_runs(layout, span.index, span.start, span.end, open, maxf(a, 0.0), maxf(a, 0.0) + 0.45, both):
			run.paint = layer
			out.ruts.append(run)
	out.lips.append_array(StreetFurniture.offset_runs(layout, span.index, span.start, span.end, open, half - 0.55, half + 0.05, both))


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
		var cond := RoadStyle.condition(road)
		pole.kind = &"rural" if (cond == RoadStyle.UNPAVED or style.klass == RoadStyle.LANE) else &"arm"
		pole.warm = style.klass == RoadStyle.RESIDENTIAL
		out.append(pole)
	return out


## One high mast at each big junction (four arms, or three on a road of 12 m or more), set back to a
## corner of the node (G-316).
static func masts_on(out: Plan, layout: CityLayout, span: CityLayout.RoadSpan, chunk: ChunkData, boxes: Array[Rect2], square: Rect2, seen: Dictionary[int, bool]) -> void:
	var road := span.road
	for i in range(span.start, span.end + 1):
		var key := CityLayout.node_key(road.points[i])
		var node: CityLayout.RoadNode = layout.nodes.get(key)
		if node == null or seen.has(key) or not square.has_point(road.points[i]):
			continue
		if node.degree < 4 and not (node.degree >= 3 and node.width >= 12.0):
			continue
		seen[key] = true
		var a := road.points[mini(i + 1, road.points.size() - 1)] - road.points[maxi(i - 1, 0)]
		if a.length() < 0.01:
			continue
		var dir := a.normalized()
		var across := Vector2(-dir.y, dir.x)
		var reach := node.width / 2.0 + 4.0
		var sgn_a := 1.0 if CityHash.unit(key, 111) < 0.5 else -1.0
		var sgn_b := 1.0 if CityHash.unit(key, 112) < 0.5 else -1.0
		var p := road.points[i] + dir * sgn_a * reach + across * sgn_b * reach
		if StreetFurniture.in_building(chunk.buildings, boxes, p, 1.0) or layout.on_other_road(p, -1, 1.0):
			continue
		var mast := StreetFurniture.Pole.new()
		mast.position = p
		mast.yaw = StreetFurniture.facing(road.points[i] - p)
		mast.road_id = road.id
		mast.kind = &"mast"
		out.poles.append(mast)


## Twin-arm poles along the medians, every 30 m (G-316): the arms run across the road.
static func twin_poles(medians: Array[StreetFurniture.KerbRun], square: Rect2) -> Array[StreetFurniture.Pole]:
	var out: Array[StreetFurniture.Pole] = []
	for run in medians:
		var carry := 12.0
		for i in run.inner.size() - 1:
			var a := (run.inner[i] + run.outer[i]) / 2.0
			var b := (run.inner[i + 1] + run.outer[i + 1]) / 2.0
			var length := a.distance_to(b)
			if length < 0.05:
				continue
			var d := carry
			var dir := (b - a) / length
			while d <= length:
				var p := a.lerp(b, d / length)
				if square.has_point(p):
					var across := Vector2(-dir.y, dir.x)
					var pole := StreetFurniture.Pole.new()
					pole.position = p
					pole.yaw = atan2(-across.y, across.x)
					pole.kind = &"twin"
					out.append(pole)
				d += 30.0
			carry = d - length
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
