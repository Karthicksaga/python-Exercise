class_name StreetFurniture
extends RefCounted
## Where bus shelters, street-light poles and kerbs go in a chunk (`furniture.ts`): plain data,
## worked out at load from the road centre lines, the mapped bus stops and the chunk's
## buildings, the same every time a chunk loads. Nothing is stored in the world files.
##
## Real and invented: shelters stand at the **mapped** OSM bus stops (the shelter, its size and
## exact spot are invented); poles are **invented** (about every 38 m along main roads, OSM does
## not map Chennai's street lights); kerbs are **invented** (both sides of the main roads).
## Yaw: 0 faces -Z (north), positive turns left, each faces the road. India drives on the left.

## Sizes shared with the renderer (metres; estimated, not measured).
const SHELTER_WIDTH := 4.2
const SHELTER_DEPTH := 1.6
const SHELTER_HEIGHT := 2.6
const SHELTER_GAP := 0.35
const POLE_HEIGHT := 9.0
const POLE_HALF := 0.15
const POLE_SETBACK := 0.75
const POLE_PITCH := 38.0
const POLE_ARM := 1.9
const KERB_HEIGHT := 0.15
const KERB_WIDTH := 0.25
## Medians (G-153): half width and the narrowest two-way arterial that gets one.
const MEDIAN_HALF := 0.45
const MEDIAN_MIN_WIDTH := 14.0
## Nothing this close to a road's end (poles) or to a junction (poles and kerbs), metres.
const END_CLEAR := 10.0
const STOP_REACH := 30.0
const SHELTER_CLEAR := 4.5


class Shelter:
	extends RefCounted
	var position: Vector2
	var yaw: float
	var road_id: int
	var name: String = ""


class Pole:
	extends RefCounted
	var position: Vector2
	var yaw: float
	var road_id: int


## One unbroken stretch of kerb along one side of a road: carriageway edge, back edge, and the
## distance along the road at each point (for the painted bands).
class KerbRun:
	extends RefCounted
	var inner := PackedVector2Array()
	var outer := PackedVector2Array()
	var along := PackedFloat64Array()
	## Ground layer of the kerb paint (`CityAtlas.GROUND_*`), or -1 for the default yellow-black (G-311).
	var paint: int = -1


class Result:
	extends RefCounted
	var shelters: Array[Shelter] = []
	var poles: Array[Pole] = []
	var kerbs: Array[KerbRun] = []
	var medians: Array[KerbRun] = []


## Yaw that faces along v.
static func facing(v: Vector2) -> float:
	return atan2(-v.x, -v.y)


## Bounding boxes of footprints, for `in_building`.
static func building_boxes(buildings: Array[Building]) -> Array[Rect2]:
	var out: Array[Rect2] = []
	for b in buildings:
		var lo := Vector2(INF, INF)
		var hi := Vector2(-INF, -INF)
		for p in b.outline:
			lo = lo.min(p)
			hi = hi.max(p)
		out.append(Rect2(lo, hi - lo))
	return out


## Whether a point is inside any of the buildings (bounding box first).
static func in_building(buildings: Array[Building], boxes: Array[Rect2], p: Vector2, margin: float) -> bool:
	for k in buildings.size():
		var r := boxes[k]
		if p.x < r.position.x - margin or p.x > r.end.x + margin or p.y < r.position.y - margin or p.y > r.end.y + margin:
			continue
		if point_in_polygon(p, buildings[k].outline):
			return true
	return false


## Even-odd test, the same as `pointInPolygon` (edges exactly on the line count as TS does).
static func point_in_polygon(p: Vector2, outline: PackedVector2Array) -> bool:
	var inside := false
	var j := outline.size() - 1
	for i in outline.size():
		var a := outline[i]
		var b := outline[j]
		if (a.y > p.y) != (b.y > p.y) and p.x < (b.x - a.x) * (p.y - a.y) / (b.y - a.y) + a.x:
			inside = not inside
		j = i
	return inside


## A shelter for a mapped stop at the kerb of the nearest drivable road, or null.
static func place_shelter(layout: CityLayout, stop: Place) -> Shelter:
	var hit := layout.nearest_road_point(stop.position)
	if hit.is_empty() or float(hit["distance"]) > STOP_REACH:
		return null
	var heading: float = hit["heading"]
	var road: Road = layout.roads[int(hit["road_index"])]
	var at: Vector2 = hit["point"]
	var d := Vector2(-sin(heading), -cos(heading))
	var left := Vector2(d.y, -d.x)
	var mapped := (stop.position - at).dot(left)
	var side := -1.0 if float(hit["distance"]) >= 1.0 and mapped < 0.0 else 1.0
	var offset := road.width / 2.0 + SHELTER_GAP + SHELTER_DEPTH / 2.0
	var s := Shelter.new()
	s.position = at + left * side * offset
	s.yaw = facing(-left * side)
	s.road_id = road.id
	s.name = stop.name
	return s


## Shelters for every mapped stop, by chunk cell (deduplicated, off other carriageways).
static func place_shelters(layout: CityLayout, stops: Array[Place]) -> Dictionary[Vector2i, Array]:
	var out: Dictionary[Vector2i, Array] = {}
	var placed: Array[Shelter] = []
	for stop in stops:
		var s := place_shelter(layout, stop)
		if s == null:
			continue
		var twin := false
		for other in placed:
			if other.position.distance_to(s.position) < SHELTER_WIDTH:
				twin = true
				break
		if twin or layout.on_other_road(s.position, s.road_id, 0.5):
			continue
		placed.append(s)
		var key := layout.cell_at(s.position)
		if not out.has(key):
			out[key] = []
		out[key].append(s)
	return out


static func _blocked(d: float, stretches: PackedVector2Array) -> bool:
	for s in stretches:
		if d >= s.x and d <= s.y:
			return true
	return false


## Poles along one stretch of a main road every POLE_PITCH metres from a phase set by the road's
## id (`polesAlong`). `skip` rejects a spot.
static func poles_along(layout: CityLayout, ri: int, start: int, end: int, stretches: PackedVector2Array, skip: Callable) -> Array[Pole]:
	var road := layout.roads[ri]
	var dist: PackedFloat64Array = layout.along[ri]
	var out: Array[Pole] = []
	var from := dist[start]
	var to := dist[end]
	var phase := CityHash.unit(road.id, 7) * POLE_PITCH
	var one_side := 1.0 if CityHash.unit(road.id, 8) < 0.5 else -1.0
	var offset := road.width / 2.0 + POLE_SETBACK
	var k := maxi(0, ceili((from - phase) / POLE_PITCH))
	while phase + k * POLE_PITCH < to:
		var d := phase + k * POLE_PITCH
		if d >= from and not _blocked(d, stretches):
			var at := CityLayout.point_along(road.points, dist, d)
			var dir: Vector2 = at["dir"]
			var side := 1.0 if road.oneway else ((1.0 if k % 2 == 0 else -1.0) if road.kind == &"primary" else one_side)
			var l := Vector2(dir.y * side, -dir.x * side)
			var pole := Pole.new()
			pole.position = (at["p"] as Vector2) + l * offset
			pole.yaw = facing(-l)
			pole.road_id = road.id
			if not skip.call(pole.position):
				out.append(pole)
		k += 1
	return out


## Kerbs along both sides of one stretch of a main road, broken round junctions (`kerbsAlong`).
static func kerbs_along(layout: CityLayout, ri: int, start: int, end: int, stretches: PackedVector2Array) -> Array[KerbRun]:
	var half := layout.roads[ri].width / 2.0
	var runs: Array[KerbRun] = []
	var paint := RoadStyle.kerb_paint(layout.roads[ri])
	for samples in _open_samples(layout, ri, start, end, stretches):
		for side: float in [1.0, -1.0]:
			var run := KerbRun.new()
			run.paint = paint
			for q: Dictionary in samples:
				var p: Vector2 = q["p"]
				var n: Vector2 = q["n"]
				run.inner.append(p + n * side * half)
				run.outer.append(p + n * side * (half + KERB_WIDTH))
				run.along.append(float(q["d"]))
			runs.append(run)
	return runs


## Whether a road gets a raised median (invented, G-153): wide two-way arterials. OSM maps most
## divided roads as two one-way ways, which get none (their divider is the space between them).
static func has_median(road: Road) -> bool:
	return (road.kind == &"primary" or road.kind == &"secondary" or road.kind == &"motorway") and not road.oneway and road.width >= MEDIAN_MIN_WIDTH and not road.tunnel


## The median along the centre of one stretch, broken round junctions and off decks.
static func median_along(layout: CityLayout, ri: int, start: int, end: int, stretches: PackedVector2Array) -> Array[KerbRun]:
	var runs: Array[KerbRun] = []
	for samples in _open_samples(layout, ri, start, end, stretches):
		var run := KerbRun.new()
		for q: Dictionary in samples:
			var p: Vector2 = q["p"]
			var n: Vector2 = q["n"]
			run.inner.append(p - n * MEDIAN_HALF)
			run.outer.append(p + n * MEDIAN_HALF)
			run.along.append(float(q["d"]))
		runs.append(run)
	return runs


## Strips along both (or `sides`) edges of one stretch, from `from_off` to `to_off` metres out of
## the road's centre line, broken round junctions: footpaths, verges, drains (G-311).
static func offset_runs(layout: CityLayout, ri: int, start: int, end: int, stretches: PackedVector2Array, from_off: float, to_off: float, sides: Array[float]) -> Array[KerbRun]:
	var runs: Array[KerbRun] = []
	for samples in _open_samples(layout, ri, start, end, stretches):
		for side: float in sides:
			var run := KerbRun.new()
			for q: Dictionary in samples:
				var p: Vector2 = q["p"]
				var n: Vector2 = q["n"]
				run.inner.append(p + n * side * from_off)
				run.outer.append(p + n * side * to_off)
				run.along.append(float(q["d"]))
			runs.append(run)
	return runs


## Points (p, left normal n, distance d) along the open parts of a stretch, `stretches` removed.
static func _open_samples(layout: CityLayout, ri: int, start: int, end: int, stretches: PackedVector2Array) -> Array[Array]:
	var road := layout.roads[ri]
	var pts := road.points
	var dist: PackedFloat64Array = layout.along[ri]
	var total := dist[dist.size() - 1]
	var open: Array[Vector2] = [Vector2(dist[start], dist[end])]
	for st in stretches:
		var next: Array[Vector2] = []
		for o in open:
			if st.y <= o.x or st.x >= o.y:
				next.append(o)
				continue
			if st.x > o.x:
				next.append(Vector2(o.x, st.x))
			if st.y < o.y:
				next.append(Vector2(st.y, o.y))
		open = next
	var out: Array[Array] = []
	for o in open:
		if o.y - o.x < 1.0:
			continue
		var samples: Array[Dictionary] = []
		var first := CityLayout.point_along(pts, dist, o.x)
		var fd: Vector2 = first["dir"]
		samples.append({"p": first["p"], "n": Vector2(fd.y, -fd.x), "d": o.x})
		for i in range(start, end + 1):
			if dist[i] <= o.x + 0.01 or dist[i] >= o.y - 0.01:
				continue
			samples.append({"p": pts[i], "n": _mitre(pts, i), "d": dist[i]})
		var last := CityLayout.point_along(pts, dist, minf(o.y, total))
		var ld: Vector2 = last["dir"]
		samples.append({"p": last["p"], "n": Vector2(ld.y, -ld.x), "d": o.y})
		out.append(samples)
	return out


## Left normal at point i: the mitre of its two segments, clamped at sharp bends.
static func _mitre(pts: PackedVector2Array, i: int) -> Vector2:
	var seg := func(j: int) -> Vector2:
		var d := pts[j + 1] - pts[j]
		var l := d.length()
		if l == 0.0:
			l = 1.0
		return Vector2(d.y / l, -d.x / l)
	if i == 0:
		return seg.call(0)
	if i == pts.size() - 1:
		return seg.call(pts.size() - 2)
	var n0: Vector2 = seg.call(i - 1)
	var n1: Vector2 = seg.call(i)
	var m := n0 + n1
	if m.length() < 1e-6:
		return n1
	m = m.normalized()
	return m / maxf(0.5, m.dot(n0))


## Corners of a shelter's footprint.
static func shelter_corners(s: Shelter) -> PackedVector2Array:
	var c := cos(s.yaw)
	var n := sin(s.yaw)
	var w := SHELTER_WIDTH / 2.0
	var d := SHELTER_DEPTH / 2.0
	var out := PackedVector2Array()
	for l: Vector2 in [Vector2(-w, -d), Vector2(w, -d), Vector2(-w, d), Vector2(w, d)]:
		out.append(Vector2(s.position.x + l.x * c + l.y * n, s.position.y - l.x * n + l.y * c))
	return out


## The street furniture of one chunk (`chunkFurniture`).
static func for_chunk(layout: CityLayout, chunk: ChunkData, cell: Vector2i) -> Result:
	var out := Result.new()
	var boxes := building_boxes(chunk.buildings)
	for s: Shelter in layout.shelters.get(cell, []):
		var blocked := in_building(chunk.buildings, boxes, s.position, 0.0)
		for p in shelter_corners(s):
			blocked = blocked or in_building(chunk.buildings, boxes, p, 0.0)
		if not blocked:
			out.shelters.append(s)
	var near_shelters: Array = []
	for dc in range(-1, 2):
		for dr in range(-1, 2):
			near_shelters.append_array(layout.shelters.get(cell + Vector2i(dc, dr), []))
	for span: CityLayout.RoadSpan in layout.spans_in(cell):
		if not span.road.is_main():
			continue
		var road_id := span.road.id
		var skip := func(p: Vector2) -> bool:
			if in_building(chunk.buildings, boxes, p, 0.3):
				return true
			for s: Shelter in near_shelters:
				if s.position.distance_to(p) < SHELTER_CLEAR:
					return true
			return layout.on_other_road(p, road_id, 0.6)
		out.poles.append_array(poles_along(layout, span.index, span.start, span.end, layout.blocked_stretches(span.index, true), skip))
		out.kerbs.append_array(kerbs_along(layout, span.index, span.start, span.end, layout.blocked_stretches(span.index, false)))
		if has_median(span.road):
			out.medians.append_array(median_along(layout, span.index, span.start, span.end, layout.blocked_stretches(span.index, false)))
	return out
