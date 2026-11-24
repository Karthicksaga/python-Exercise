class_name WaterMeshes
extends RefCounted
## Rivers, canals, streams, ponds, lakes and reservoirs of one chunk (decision G-152), on a worker.
##
## - **Where:** water areas from the chunk record (`natural=water`, reservoirs, riverbanks) and
##   the waterway centre lines of `infra.bin` (rivers, canals and streams; drains and ditches are
##   left out: most of Chennai's are covered or too narrow to read) widened to their width, cut to
##   the chunk square.
## - **Sunk:** OSM gives no heights, so the water surface lies `SURFACE` below the ground with a
##   stone-and-mud bank down to it; `GroundMeshes` cuts the earth and covers round the water.
## - **Surface:** one surface with `water.gdshader` (flat colour, shore tint in the vertex alpha, a
##   small moving ripple). No reflections.
## - **Blocked, not swum:** a bund wall `BUND` high stands on every bank, with an invisible collider
##   to `BARRIER` so nobody walks, jumps or drives into the water (the simplest safe rule; nobody
##   drowns, children included). It opens where a road or path crosses at ground level; bridges
##   pass over it.
## The bank and bund geometry goes into the deck builder's vertex-coloured surface and its
## colliders (`DeckMeshes`), so water costs one extra draw call per chunk.

const SURFACE := -0.75
const BUND := 0.55
const BUND_WIDTH := 0.35
const BARRIER := 2.2
const SHORE := 1.4
const RIVER_KINDS: Array[StringName] = [&"river", &"canal", &"stream"]
const BANK := Color(0.47, 0.42, 0.34)
const BUND_COLOR := Color(0.66, 0.63, 0.57)
const BUND_TOP := Color(0.74, 0.71, 0.65)

var mesh := MeshBuilder.new()
var origin := Vector2.ZERO
## The chunk's water polygons (world metres), simple, clipped to the square.
var polygons: Array[PackedVector2Array] = []
var bund_gaps := 0
var bund_pieces := 0


## Water polygons of a chunk: water areas and widened waterways, clipped to the square.
static func gather(areas: Array[WorldArea], waterways: Array[WorldWaterway], square: Rect2) -> Array[PackedVector2Array]:
	var box := GroundMeshes._square(square)
	var out: Array[PackedVector2Array] = []
	for area in areas:
		if GroundMeshes.is_water(area.kind):
			for piece in Geometry2D.intersect_polygons(area.outline, box):
				if piece.size() >= 3 and absf(_area(piece)) > 1.0:
					out.append(piece)
	for w in waterways:
		if w.tunnel or not RIVER_KINDS.has(w.kind):
			continue
		var half := w.width / 2.0
		var reach := square.grow(half + 2.0)
		# Only the runs of the line near this chunk, so the offset stays small.
		var run := PackedVector2Array()
		var runs: Array[PackedVector2Array] = []
		for i in w.points.size() - 1:
			var a := w.points[i]
			var b := w.points[i + 1]
			if Rect2(a.min(b), (a.max(b) - a.min(b))).grow(0.01).intersects(reach):
				if run.is_empty():
					run.append(a)
				run.append(b)
			elif not run.is_empty():
				runs.append(run)
				run = PackedVector2Array()
		if not run.is_empty():
			runs.append(run)
		for r in runs:
			var ribbons := Geometry2D.offset_polyline(r, half, Geometry2D.JOIN_MITER, Geometry2D.END_ROUND)
			# A line that loops back on itself gives holes too; keep the outlines (the largest
			# polygon's winding), the holes stay water.
			var outer_cw := false
			var largest := 0.0
			for ribbon in ribbons:
				if absf(_area(ribbon)) > largest:
					largest = absf(_area(ribbon))
					outer_cw = Geometry2D.is_polygon_clockwise(ribbon)
			for ribbon in ribbons:
				if ribbon.size() < 3 or Geometry2D.is_polygon_clockwise(ribbon) != outer_cw:
					continue
				for piece in Geometry2D.intersect_polygons(ribbon, box):
					if piece.size() >= 3 and absf(_area(piece)) > 1.0:
						out.append(piece)
	return out


static func _area(poly: PackedVector2Array) -> float:
	var s := 0.0
	for i in poly.size():
		var a := poly[i]
		var b := poly[(i + 1) % poly.size()]
		s += a.x * b.y - b.x * a.y
	return s / 2.0


static func inside_any(p: Vector2, polys: Array[PackedVector2Array], skip: int) -> bool:
	for k in polys.size():
		if k != skip and Geometry2D.is_point_in_polygon(p, polys[k]):
			return true
	return false


func _uv(world: Vector2) -> Vector2:
	# World metres / 8 from a multiple of 32 units (the shader's ripple period).
	var base := Vector2(floorf((origin.x - 1000.0) / 8.0 / 32.0) * 32.0, floorf((origin.y - 1000.0) / 8.0 / 32.0) * 32.0)
	return world / 8.0 - base


func _v(world: Vector2, y: float, shore: float) -> int:
	var p := world - origin
	return mesh.vertex(Vector3(p.x, y, p.y), Vector3.UP, _uv(world), Color(1, 1, 1, shore))


## Water surfaces, shore tint, banks, bunds and their colliders (into `decks`).
func build(square: Rect2, decks: DeckMeshes, layout: CityLayout) -> void:
	for k in polygons.size():
		var poly := polygons[k]
		var faces := Geometry2D.triangulate_polygon(poly)
		if faces.is_empty():
			continue
		var base := mesh.vertex_count()
		for p in poly:
			_v(p, SURFACE, 0.0)
		for t in range(0, faces.size(), 3):
			var p0 := poly[faces[t]]
			var p1 := poly[faces[t + 1]]
			var p2 := poly[faces[t + 2]]
			if (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0.0:
				mesh.triangle(base + faces[t], base + faces[t + 1], base + faces[t + 2])
			else:
				mesh.triangle(base + faces[t], base + faces[t + 2], base + faces[t + 1])
		var inward := 1.0 if _area(poly) > 0.0 else -1.0
		for i in poly.size():
			var a := poly[i]
			var b := poly[(i + 1) % poly.size()]
			var length := a.distance_to(b)
			if length < 0.05 or GroundMeshes.on_square_edge(a, b, square):
				continue
			var mid := (a + b) / 2.0
			var d := (b - a) / length
			# Left of a->b is (d.y, -d.x) in this frame; flip so it points into the water.
			var into := Vector2(-d.y, d.x) * inward
			if not Geometry2D.is_point_in_polygon(mid + into * 0.2, poly):
				into = -into
			if inside_any(mid - into * 0.3, polygons, k):
				continue  # shared with another water polygon: no bank between them
			_shore(a, b, into)
			_bank(decks, a, b, into, layout)


## A band of shore-tinted water along the bank.
func _shore(a: Vector2, b: Vector2, into: Vector2) -> void:
	var i0 := _v(a, SURFACE + 0.005, 1.0)
	var i1 := _v(b, SURFACE + 0.005, 1.0)
	var i2 := _v(b + into * SHORE, SURFACE + 0.005, 0.0)
	var i3 := _v(a + into * SHORE, SURFACE + 0.005, 0.0)
	var p0 := mesh.positions[i0]
	if (mesh.positions[i1] - p0).cross(mesh.positions[i2] - p0).y >= 0.0:
		mesh.quad(i0, i1, i2, i3)
	else:
		mesh.quad(i0, i3, i2, i1)


## The bank face down to the water and the bund on top, in pieces of about 2 m so it can open
## where a road or path crosses at ground level.
func _bank(decks: DeckMeshes, a: Vector2, b: Vector2, into: Vector2, layout: CityLayout) -> void:
	var length := a.distance_to(b)
	var pieces := maxi(1, ceili(length / 2.0))
	var out := -into
	for k in pieces:
		var p0 := a.lerp(b, float(k) / pieces)
		var p1 := a.lerp(b, float(k + 1) / pieces)
		decks._face(decks._v3(p0, 0.0), decks._v3(p1, 0.0), decks._v3(p1, SURFACE), decks._v3(p0, SURFACE), BANK, false)
		if _crossed((p0 + p1) / 2.0, layout):
			bund_gaps += 1
			continue
		bund_pieces += 1
		var q0 := p0 + out * BUND_WIDTH
		var q1 := p1 + out * BUND_WIDTH
		decks._face(decks._v3(p0, SURFACE), decks._v3(p1, SURFACE), decks._v3(p1, BUND), decks._v3(p0, BUND), BUND_COLOR, false)
		decks._face(decks._v3(q1, 0.0), decks._v3(q0, 0.0), decks._v3(q0, BUND), decks._v3(q1, BUND), BUND_COLOR, false)
		decks._face(decks._v3(p0, BUND), decks._v3(p1, BUND), decks._v3(q1, BUND), decks._v3(q0, BUND), BUND_TOP, false)
		# The barrier: both faces of the bund, carried up invisibly to BARRIER.
		decks._solid([decks._v3(p0, SURFACE), decks._v3(p1, SURFACE), decks._v3(p1, BARRIER), decks._v3(p0, SURFACE), decks._v3(p1, BARRIER), decks._v3(p0, BARRIER)])
		decks._solid([decks._v3(q0, 0.0), decks._v3(q1, 0.0), decks._v3(q1, BARRIER), decks._v3(q0, 0.0), decks._v3(q1, BARRIER), decks._v3(q0, BARRIER)])


## True when a road or path crosses here at ground level (the bund opens for it).
func _crossed(p: Vector2, layout: CityLayout) -> bool:
	if layout == null:
		return false
	var hit := [false]
	layout.segments_near(p, 24.0, func(ri: int, i: int) -> bool:
		var road := layout.roads[ri]
		var q := Geometry2D.get_closest_point_to_segment(p, road.points[i], road.points[i + 1])
		var ab := road.points[i + 1] - road.points[i]
		var t := 0.0 if ab.length_squared() < 1e-9 else clampf((q - road.points[i]).dot(ab) / ab.length_squared(), 0.0, 1.0)
		if q.distance_to(p) < road.width / 2.0 + 1.0 and road.height_at(i, t) < 0.6 and not road.tunnel:
			hit[0] = true
		return hit[0])
	return hit[0]
