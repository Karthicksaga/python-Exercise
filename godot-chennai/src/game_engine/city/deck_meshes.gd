class_name DeckMeshes
extends RefCounted
## Bridges, flyovers, ramps, footbridges and covered roads of one chunk (decisions G-150, G-151),
## on a worker thread like the rest of `ChunkBuilder`. The road surface of a raised road is drawn
## by `GroundMeshes` (same ground surface, at the road's height); this builds what holds it up and
## keeps people on it, in one vertex-coloured surface, plus the collider faces:
##
## - **Bridges** (`bridge=*`): a deck slab `DEPTH` deep with a fascia and an underside, parapets
##   1 m high on both edges, piers every `PIER_SPACING` m (two under wide decks) on a cap beam,
##   never on a lower road's carriageway. Footbridges: a thin slab, railings, slim columns.
## - **Ramps and embankments** (raised roads that are not bridges): retaining walls from the
##   ground to the parapet.
## - **Covered roads** (`tunnel=*`, `covered=yes`, drivable): side walls and a roof 5 m above the
##   road (the subways under the railway), cut where another road crosses at ground level.
##
## Heights come from `Road.heights` (estimated, G-150). Everything is laid out by distance along
## the whole road, so a deck that crosses a chunk edge continues exactly in the next chunk.
## Parapets are left out where they would cross another raised carriageway at about the same
## height (where a ramp leaves the deck), so the merge stays open.

const DEPTH := 1.1
const FOOT_DEPTH := 0.45
const PARAPET := 1.0
const PARAPET_WIDTH := 0.3
const RAILING := 1.15
const PIER_SPACING := 30.0
## No parapet or pier below this deck height (ramp feet blend into the street).
const MIN_PARAPET := 0.45
const MIN_PIER := 2.8
const COVER_HEIGHT := 5.0
const COVER_ROOF := 0.6
const COVER_WALL := 0.4
## Collider pieces: Jolt builds a trimesh's tree when its body enters the space (G-55), so
## pieces stay small enough to add within the frame budget.
const PIECE_FACES := 1200

const CONCRETE := Color(0.73, 0.71, 0.67)
const FASCIA := Color(0.66, 0.64, 0.60)
const UNDERSIDE := Color(0.46, 0.45, 0.43)
const PARAPET_TOP := Color(0.83, 0.81, 0.76)
const PIER := Color(0.68, 0.66, 0.62)
const WALL := Color(0.62, 0.58, 0.52)
const RAIL := Color(0.30, 0.33, 0.36)

var mesh := MeshBuilder.new()
## World metres of the chunk centre (mesh and collider vertices are local to it).
var origin := Vector2.ZERO
var layout: CityLayout
## Collider triangles (chunk-local), split into pieces of at most PIECE_FACES triangles.
var faces: Array[PackedVector3Array] = []
## For tests and the report.
var piers := 0
var parapet_gaps := 0
var covers := 0


## A span's centre line resampled where it is raised, with the height of each point: the piece's
## own points plus every height sample inside a raised segment (the ramp's kinks).
class Profile:
	extends RefCounted
	var points := PackedVector2Array()
	var heights := PackedFloat32Array()
	## Distance along the whole road to each point.
	var along := PackedFloat32Array()


static func profile(span: CityLayout.RoadSpan) -> Profile:
	var road := span.road
	var out := Profile.new()
	var pts := road.points
	var base := road.offset_along
	for i in range(span.start, span.end + 1):
		var d := road.along[i] if road.is_raised() else 0.0
		out.points.append(pts[i])
		out.heights.append(road.height_along(d))
		out.along.append(base + d)
		if i == span.end or not road.is_raised():
			continue
		var d1 := road.along[i + 1]
		var k := floori(d / road.height_step) + 1
		while k * road.height_step < d1 - 0.05:
			var s := k * road.height_step
			var t := (s - d) / maxf(d1 - d, 1e-6)
			out.points.append(pts[i].lerp(pts[i + 1], t))
			out.heights.append(road.height_along(s))
			out.along.append(base + s)
			k += 1
	return out


## Left normals per profile point, mitred at bends (clamped like the kerbs).
static func normals(pts: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	var n := pts.size()
	for i in n:
		var n0 := Vector2.ZERO
		var n1 := Vector2.ZERO
		if i > 0:
			var d := (pts[i] - pts[i - 1]).normalized()
			n0 = Vector2(d.y, -d.x)
		if i < n - 1:
			var d := (pts[i + 1] - pts[i]).normalized()
			n1 = Vector2(d.y, -d.x)
		if i == 0:
			out.append(n1)
		elif i == n - 1:
			out.append(n0)
		else:
			var m := n0 + n1
			if m.length() < 1e-6:
				out.append(n1)
				continue
			m = m.normalized()
			out.append(m / maxf(0.5, m.dot(n0)))
	return out


func _v3(p: Vector2, y: float) -> Vector3:
	return Vector3(p.x - origin.x, y, p.y - origin.y)


## A quad a-b-c-d (world xz + height) facing `toward` (a rough outward direction): visual and,
## when `solid`, collider faces.
func _face(a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color, solid: bool) -> void:
	var n := (b - a).cross(d - a)
	if n.length_squared() < 1e-10:
		n = (c - b).cross(d - b)
	n = n.normalized()
	var ia := mesh.vertex(a, n, Vector2.ZERO, color)
	var ib := mesh.vertex(b, n, Vector2.ZERO, color)
	var ic := mesh.vertex(c, n, Vector2.ZERO, color)
	var id := mesh.vertex(d, n, Vector2.ZERO, color)
	# MeshBuilder takes counter-clockwise from the front, which is the side (b-a)x(d-a) points
	# to; the deck material is double-sided, so the winding only has to agree with the normal.
	mesh.quad(ia, ib, ic, id)
	if solid:
		_solid([a, b, c, a, c, d])


func _solid(tris: Array[Vector3]) -> void:
	if faces.is_empty() or faces[faces.size() - 1].size() / 3 >= PIECE_FACES:
		faces.append(PackedVector3Array())
	var last := faces[faces.size() - 1]
	for v in tris:
		last.append(v)
	faces[faces.size() - 1] = last


## Adds ready-made collider triangles (speed breakers) to the pieces.
func solid_faces(tris: PackedVector3Array) -> void:
	for k in range(0, tris.size(), 3):
		_solid([tris[k], tris[k + 1], tris[k + 2]])


## Collider faces of the road surface itself (flush with the ground where the ramp starts).
func _deck_top(p0: Vector2, p1: Vector2, l0: Vector2, l1: Vector2, h0: float, h1: float, half: float) -> void:
	var a := _v3(p0 + l0 * half, h0)
	var b := _v3(p1 + l1 * half, h1)
	var c := _v3(p1 - l1 * half, h1)
	var d := _v3(p0 - l0 * half, h0)
	_solid([a, b, c, a, c, d])


static func tint(color: Color, id: int, salt: int) -> Color:
	var v := 0.96 + CityHash.unit(id, salt) * 0.08
	return Color(color.r * v, color.g * v, color.b * v)


## True when a point at height h is on another raised road's carriageway at about the same height
## (where a ramp leaves or joins the deck).
func _on_other_deck(p: Vector2, road: Road, h: float) -> bool:
	if layout == null:
		return false
	var hit := [false]
	layout.segments_near(p, 20.0, func(ri: int, i: int) -> bool:
		var other := layout.roads[ri]
		if other == road or other.id == road.id or not other.is_raised():
			return false
		var a := other.points[i]
		var b := other.points[i + 1]
		var ab := b - a
		var len2 := ab.length_squared()
		var t := 0.0 if len2 < 1e-9 else clampf((p - a).dot(ab) / len2, 0.0, 1.0)
		var reach := other.width / 2.0 + 0.2
		if (a + ab * t).distance_squared_to(p) > reach * reach:
			return false
		if absf(other.height_at(i, t) - h) < 1.6:
			hit[0] = true
		return hit[0])
	return hit[0]


## True when a point is on a road's carriageway that is clearly below height h (no pier there).
func _on_lower_road(p: Vector2, road: Road, h: float, margin: float) -> bool:
	if layout == null:
		return false
	var hit := [false]
	layout.segments_near(p, 24.0, func(ri: int, i: int) -> bool:
		var other := layout.roads[ri]
		if other.id == road.id or other.kind == &"footway":
			return false
		var a := other.points[i]
		var b := other.points[i + 1]
		var ab := b - a
		var len2 := ab.length_squared()
		var t := 0.0 if len2 < 1e-9 else clampf((p - a).dot(ab) / len2, 0.0, 1.0)
		var reach := other.width / 2.0 + margin
		if (a + ab * t).distance_squared_to(p) > reach * reach:
			return false
		if other.height_at(i, t) < h - 2.5:
			hit[0] = true
		return hit[0])
	return hit[0]


## Everything for one span of a raised or covered road.
func add_span(span: CityLayout.RoadSpan) -> void:
	var road := span.road
	if road.tunnel:
		if road.kind != &"footway":
			_cover(span)
		return
	if not road.is_raised():
		return
	var prof := profile(span)
	var pts := prof.points
	if pts.size() < 2:
		return
	var ns := normals(pts)
	var foot := road.kind == &"footway"
	var half := road.width / 2.0
	var depth := FOOT_DEPTH if foot else DEPTH
	var bridge := road.bridge
	for i in pts.size() - 1:
		var h0 := prof.heights[i]
		var h1 := prof.heights[i + 1]
		if maxf(h0, h1) < 0.02:
			continue
		var p0 := pts[i]
		var p1 := pts[i + 1]
		var l0 := ns[i]
		var l1 := ns[i + 1]
		var y0 := h0 + GroundMeshes.Y_ROAD
		var y1 := h1 + GroundMeshes.Y_ROAD
		_deck_top(p0, p1, l0, l1, h0, h1, half)
		var seg_id := int(prof.along[i] / 7.0)
		for side: float in [1.0, -1.0]:
			var e0 := p0 + l0 * side * half
			var e1 := p1 + l1 * side * half
			var o0 := p0 + l0 * side * (half + PARAPET_WIDTH)
			var o1 := p1 + l1 * side * (half + PARAPET_WIDTH)
			var mid := (e0 + e1) / 2.0
			var guard := minf(h0, h1) >= MIN_PARAPET and not _on_other_deck(mid + (mid - (p0 + p1) / 2.0).normalized() * 0.6, road, (h0 + h1) / 2.0)
			if minf(h0, h1) >= MIN_PARAPET and not guard:
				parapet_gaps += 1
			# Outer face: the slab's fascia on a bridge, the retaining wall to the ground on a ramp.
			var bottom0 := maxf(0.0, y0 - depth) if bridge else 0.0
			var bottom1 := maxf(0.0, y1 - depth) if bridge else 0.0
			var top0 := y0 + (RAILING if foot else PARAPET) * (1.0 if guard else 0.0)
			var top1 := y1 + (RAILING if foot else PARAPET) * (1.0 if guard else 0.0)
			var outer_color := tint(FASCIA if bridge else WALL, road.id, seg_id)
			_face(_v3(o0, bottom0), _v3(o1, bottom1), _v3(o1, top1), _v3(o0, top0), outer_color, not bridge)
			if not guard:
				# The deck edge between the carriageway and the outer face.
				_face(_v3(o0, y0), _v3(o1, y1), _v3(e1, y1), _v3(e0, y0), tint(CONCRETE, road.id, seg_id), false)
				continue
			if foot:
				# A railing: posts and a rail as one thin solid strip.
				_face(_v3(e0, y0), _v3(e1, y1), _v3(e1, y1 + RAILING), _v3(e0, y0 + RAILING), RAIL, true)
				_face(_v3(e0, y0 + RAILING), _v3(e1, y1 + RAILING), _v3(o1, y1 + RAILING), _v3(o0, y0 + RAILING), RAIL, false)
				continue
			_face(_v3(e1, y1), _v3(e0, y0), _v3(e0, y0 + PARAPET), _v3(e1, y1 + PARAPET), tint(CONCRETE, road.id, seg_id + 1), true)
			_face(_v3(e0, y0 + PARAPET), _v3(e1, y1 + PARAPET), _v3(o1, y1 + PARAPET), _v3(o0, y0 + PARAPET), PARAPET_TOP, true)
		if bridge and minf(y0, y1) > depth + 0.15:
			var u0 := p0 + l0 * (half + PARAPET_WIDTH)
			var u1 := p1 + l1 * (half + PARAPET_WIDTH)
			var v0 := p0 - l0 * (half + PARAPET_WIDTH)
			var v1 := p1 - l1 * (half + PARAPET_WIDTH)
			_face(_v3(u1, y1 - depth), _v3(u0, y0 - depth), _v3(v0, y0 - depth), _v3(v1, y1 - depth), UNDERSIDE, false)
	if bridge:
		_piers(span, prof, foot, depth)


## Piers at fixed distances along the whole road (so neighbouring chunks agree).
func _piers(span: CityLayout.RoadSpan, prof: Profile, foot: bool, depth: float) -> void:
	var road := span.road
	var first := prof.along[0]
	var last := prof.along[prof.along.size() - 1]
	var k := ceili(first / PIER_SPACING)
	var dir_cache := prof.points
	while k * PIER_SPACING < last:
		var d := k * PIER_SPACING
		k += 1
		var j := 0
		while j < prof.along.size() - 2 and prof.along[j + 1] < d:
			j += 1
		var span_len := maxf(prof.along[j + 1] - prof.along[j], 1e-6)
		var t := clampf((d - prof.along[j]) / span_len, 0.0, 1.0)
		var h := lerpf(prof.heights[j], prof.heights[j + 1], t)
		if h < MIN_PIER and not (foot and h > 2.0):
			continue
		var p := dir_cache[j].lerp(dir_cache[j + 1], t)
		var u := (dir_cache[j + 1] - dir_cache[j]).normalized()
		var n := Vector2(u.y, -u.x)
		var top := h + GroundMeshes.Y_ROAD - depth
		var columns: Array[float] = [0.0]
		if road.width >= 12.0 and not foot:
			columns = [-road.width / 4.0, road.width / 4.0]
		var placed := false
		for off in columns:
			var c := p + n * off
			var col_half := Vector2(0.25, 0.25) if foot else Vector2(0.7, minf(1.1, road.width * 0.12))
			if _on_lower_road(c, road, h, col_half.y + 0.3):
				continue
			_box(c, u, n, col_half, 0.0, top - (0.0 if foot else 0.7), PIER)
			placed = true
			piers += 1
		if placed and not foot:
			_box(p, u, n, Vector2(0.6, road.width / 2.0 + 0.1), top - 0.7, top, tint(PIER, road.id, k))


## A closed box along u (half.x) and n (half.y) from y0 to y1: visual and collider.
func _box(c: Vector2, u: Vector2, n: Vector2, half: Vector2, y0: float, y1: float, color: Color) -> void:
	var corners: Array[Vector2] = [c - u * half.x - n * half.y, c + u * half.x - n * half.y, c + u * half.x + n * half.y, c - u * half.x + n * half.y]
	for i in 4:
		var a := corners[i]
		var b := corners[(i + 1) % 4]
		_face(_v3(a, y0), _v3(b, y0), _v3(b, y1), _v3(a, y1), color, true)
	_face(_v3(corners[0], y1), _v3(corners[1], y1), _v3(corners[2], y1), _v3(corners[3], y1), color, false)


## Side walls and a roof over a covered drivable road, open where another road crosses at ground
## level (G-151: covered sections instead of lowered roads; the ground is a flat plane).
func _cover(span: CityLayout.RoadSpan) -> void:
	var road := span.road
	var pts := road.points.slice(span.start, span.end + 1)
	if pts.size() < 2:
		return
	var ns := normals(pts)
	var half := road.width / 2.0 + 0.3
	covers += 1
	for i in pts.size() - 1:
		var p0 := pts[i]
		var p1 := pts[i + 1]
		if _crossed_at_ground((p0 + p1) / 2.0, road):
			continue
		var l0 := ns[i]
		var l1 := ns[i + 1]
		for side: float in [1.0, -1.0]:
			var a0 := p0 + l0 * side * half
			var a1 := p1 + l1 * side * half
			var b0 := p0 + l0 * side * (half + COVER_WALL)
			var b1 := p1 + l1 * side * (half + COVER_WALL)
			_face(_v3(a1, 0.0), _v3(a0, 0.0), _v3(a0, COVER_HEIGHT), _v3(a1, COVER_HEIGHT), tint(WALL, road.id, i), true)
			_face(_v3(b0, 0.0), _v3(b1, 0.0), _v3(b1, COVER_HEIGHT + COVER_ROOF), _v3(b0, COVER_HEIGHT + COVER_ROOF), tint(FASCIA, road.id, i), true)
		var w0 := p0 + l0 * (half + COVER_WALL)
		var w1 := p1 + l1 * (half + COVER_WALL)
		var v0 := p0 - l0 * (half + COVER_WALL)
		var v1 := p1 - l1 * (half + COVER_WALL)
		_face(_v3(w0, COVER_HEIGHT + COVER_ROOF), _v3(w1, COVER_HEIGHT + COVER_ROOF), _v3(v1, COVER_HEIGHT + COVER_ROOF), _v3(v0, COVER_HEIGHT + COVER_ROOF), CONCRETE, false)
		_face(_v3(w1, COVER_HEIGHT), _v3(w0, COVER_HEIGHT), _v3(v0, COVER_HEIGHT), _v3(v1, COVER_HEIGHT), UNDERSIDE, false)


func _crossed_at_ground(p: Vector2, road: Road) -> bool:
	if layout == null:
		return false
	var hit := [false]
	layout.segments_near(p, 20.0, func(ri: int, i: int) -> bool:
		var other := layout.roads[ri]
		if other.id == road.id or other.tunnel or other.kind == &"footway":
			return false
		var q := Geometry2D.get_closest_point_to_segment(p, other.points[i], other.points[i + 1])
		if q.distance_to(p) < other.width / 2.0 + road.width / 2.0 + 1.0 and other.height_at(i, 0.5) < 0.5:
			hit[0] = true
		return hit[0])
	return hit[0]


## Collider bodies' face count (tests).
func face_count() -> int:
	var n := 0
	for f in faces:
		n += f.size() / 3
	return n
