class_name GroundMeshes
extends RefCounted
## The flat layers of one chunk in **one** surface (`GroundMeshes.ts` and the kerbs of
## `StreetFurniture.ts`): bare earth, parks, water, sand, verges and footpaths, road surface,
## lane markings and the yellow-black kerbs of the main roads. Each vertex carries its layer in
## its texture u (`layer * LAYER_U + repeats`) and the ground shader (`ground.gdshader`) picks that layer's tile of the ground atlas,
## so a chunk's whole ground is one draw call.
##
## Markings follow the road class (invented, OSM does not map paint): a dashed centre line on
## two-way main roads, dashed lane lines where there is more than one lane each way, solid edge
## lines on primary roads. Lanes come from OSM `lanes` where mapped, else from the width.

## Heights above the ground plane, far enough apart not to shimmer.
const Y_EARTH := 0.0
const Y_SEA := 0.01
const Y_PARK := 0.02
const Y_VERGE := 0.035
const Y_ROAD := 0.06
const Y_MARKING := 0.08
const DASH := 3.2
const DASH_PITCH := 9.0
## No paint this close to a road's ends, where junctions usually are.
const END_CLEAR := 8.0
const PAINT_WIDTH := 0.15
## Height of the kerb round parks and grounds (G-154) and of medians (G-153).
const PARK_KERB := 0.12
const MEDIAN_HEIGHT := 0.22
## Zebra crossings (G-153): bars along the road, their length, width and pitch across it.
const ZEBRA_LENGTH := 3.0
const ZEBRA_BAR := 0.5
const ZEBRA_PITCH := 1.0
## Zebras painted (tests).
var zebras := 0
var bumps := 0

var mesh := MeshBuilder.new()
var origin := Vector2.ZERO
## Stripes painted (for tests).
var stripes := 0
var _layer_index := 0
## The layer is stored in u: u / LAYER_U (`ground.gdshader`); repeats stay below it.
const LAYER_U := 1024.0


func _layer(layer: int) -> void:
	_layer_index = layer


## Ground covers (G-154), drawn by `ground.gdshader` as layers 8 and up: a base tile tinted
## per cover with slow noise.
const COVER_LAWN := 8
const COVER_MEADOW := 9
const COVER_SCRUB := 10
const COVER_FOREST := 11
const COVER_WETLAND := 12
const COVER_FARMLAND := 13
const COVER_SPORT := 14
const COVER_CEMETERY := 15
const COVER_BARE := 16
## Zones from OSM detail (G-191): running track (clay), playground and hard courts (rubber),
## allotments (tilled soil).
const COVER_TRACK := 17
const COVER_PLAYGROUND := 18
const COVER_ALLOTMENT := 19
## The shader's noise repeats every NOISE_PERIOD repeats; UVs count from a multiple of it.
const NOISE_PERIOD := 16.0


## Texture coordinates of a world point at `scale` metres per repeat, carrying the layer: u is
## `layer * LAYER_U +` the repeat count from a whole number of repeats 1 km left of the chunk (so tiling stays continuous across chunks and the numbers stay small).
## The whole number is a multiple of NOISE_PERIOD, so the ground covers' noise continues too.
func _uv(world: Vector2, scale: float) -> Vector2:
	var base := Vector2(floorf((origin.x - 1000.0) / scale / NOISE_PERIOD) * NOISE_PERIOD, floorf((origin.y - 1000.0) / scale / NOISE_PERIOD) * NOISE_PERIOD)
	var uv := world / scale - base
	return Vector2(uv.x + _layer_index * LAYER_U, uv.y)


## A flat ribbon along a polyline with a disc at every vertex to close joints (`ribbon`). With
## `heights` (one per point, G-151) the ribbon follows a deck or ramp.
func ribbon(points: PackedVector2Array, width: float, y: float, uv_scale: float, layer: int, heights: PackedFloat32Array = PackedFloat32Array()) -> void:
	_layer(layer)
	var half := width / 2.0
	var raised := heights.size() == points.size()
	for i in points.size() - 1:
		var a := points[i] - origin
		var b := points[i + 1] - origin
		var length := a.distance_to(b)
		if length < 0.01:
			continue
		var ya := y + (heights[i] if raised else 0.0)
		var yb := y + (heights[i + 1] if raised else 0.0)
		var o := Vector2(-(b.y - a.y), b.x - a.x) / length * half
		mesh.quad(_v(a + o, ya, uv_scale), _v(b + o, yb, uv_scale), _v(b - o, yb, uv_scale), _v(a - o, ya, uv_scale))
	var sides := 10 if width > 8.0 else 8
	for k in points.size():
		var p := points[k] - origin
		var yk := y + (heights[k] if raised else 0.0)
		var centre := _v(p, yk, uv_scale)
		var rim: Array[int] = []
		for s in sides:
			var angle := TAU * s / sides
			rim.append(_v(p + Vector2(cos(angle), sin(angle)) * half, yk, uv_scale))
		for s in sides:
			mesh.triangle(centre, rim[(s + 1) % sides], rim[s])


## One painted strip a-b (world metres) as a single quad, flat at y.
func strip(a: Vector2, b: Vector2, width: float, y: float, layer: int, uv_scale: float = 3.0) -> void:
	_layer(layer)
	var length := a.distance_to(b)
	if length < 0.01:
		return
	var o := Vector2(-(b.y - a.y), b.x - a.x) / length * (width / 2.0)
	var la := a - origin
	var lb := b - origin
	mesh.quad(_v(la + o, y, uv_scale), _v(lb + o, y, uv_scale), _v(lb - o, y, uv_scale), _v(la - o, y, uv_scale))


func _v(p: Vector2, y: float, uv_scale: float) -> int:
	# UVs from world positions, so textures line up across chunks.
	return mesh.vertex(Vector3(p.x, y, p.y), Vector3.UP, _uv(p + origin, uv_scale))


## Lines painted on a road: offsets from the centre line and whether each is dashed (`laneLines`).
static func lane_lines(road: Road) -> Array[Vector2]:
	var out: Array[Vector2] = []  # x = offset, y = 1 when dashed
	if not road.is_main():
		return out
	var lanes := CityLayout.lane_count(road)
	var lane_width := road.width / lanes
	if road.oneway:
		for k in range(1, lanes):
			out.append(Vector2(-road.width / 2.0 + k * lane_width, 1.0))
	else:
		# The centre line stays under a median (G-153): the Three.js marking rule is kept as is.
		out.append(Vector2(0.0, 1.0))
		for k in range(1, lanes / 2):
			out.append(Vector2(k * lane_width, 1.0))
			out.append(Vector2(-k * lane_width, 1.0))
	if road.kind == &"primary" and road.width >= 7.0:
		out.append(Vector2(road.width / 2.0 - 0.35, 0.0))
		out.append(Vector2(-road.width / 2.0 + 0.35, 0.0))
	return out


func _stripe(centre: Vector2, dir: Vector2, along: float, h0: float = 0.0, h1: float = 0.0, width: float = PAINT_WIDTH, layer: int = CityAtlas.GROUND_PAINT) -> void:
	_layer(layer)
	var c := centre - origin
	var a := dir * (along / 2.0)
	var s := Vector2(-dir.y, dir.x) * (width / 2.0)
	var uv := Vector2(_layer_index * LAYER_U + 0.5, 0.5)
	var n := Vector3.UP
	var y0 := Y_MARKING + h0
	var y1 := Y_MARKING + h1
	var i0 := mesh.vertex(Vector3(c.x - a.x - s.x, y0, c.y - a.y - s.y), n, uv)
	var i1 := mesh.vertex(Vector3(c.x + a.x - s.x, y1, c.y + a.y - s.y), n, uv)
	var i2 := mesh.vertex(Vector3(c.x + a.x + s.x, y1, c.y + a.y + s.y), n, uv)
	var i3 := mesh.vertex(Vector3(c.x - a.x + s.x, y0, c.y - a.y + s.y), n, uv)
	# Face up: check the winding against +Y and fix it.
	var p0 := mesh.positions[i0]
	if (mesh.positions[i1] - p0).cross(mesh.positions[i2] - p0).y >= 0.0:
		mesh.quad(i0, i1, i2, i3)
	else:
		mesh.quad(i0, i3, i2, i1)
	stripes += 1


## Dashes at fixed distances along the whole road, so chunks line up (`addStripes`).
func add_stripes(span: CityLayout.RoadSpan) -> void:
	var lines := lane_lines(span.road)
	if lines.is_empty():
		return
	var pts := span.road.points
	var travelled := span.offset
	for i in range(span.start, span.end):
		var a := pts[i]
		var b := pts[i + 1]
		var length := a.distance_to(b)
		if length < 0.01:
			continue
		var u := (b - a) / length
		var road := span.road
		var local := road.offset_along
		for line in lines:
			var side := Vector2(-u.y, u.x) * line.x
			if line.y > 0.0:
				var next := maxf(DASH_PITCH, ceilf(travelled / DASH_PITCH) * DASH_PITCH)
				while next < travelled + length:
					if next >= END_CLEAR and next <= span.total - END_CLEAR:
						_stripe(a + u * (next - travelled) + side, u, DASH, road.height_along(next - DASH / 2.0 - local), road.height_along(next + DASH / 2.0 - local))
					next += DASH_PITCH
			else:
				var from := maxf(0.0, END_CLEAR - travelled)
				var to := minf(length, span.total - END_CLEAR - travelled)
				if to - from > 0.5:
					if road.is_raised():
						# Solid lines on a ramp follow it in pieces of one height step.
						var pieces := maxi(1, ceili((to - from) / road.height_step))
						for k in pieces:
							var f0 := from + (to - from) * k / pieces
							var f1 := from + (to - from) * (k + 1) / pieces
							_stripe(a + u * ((f0 + f1) / 2.0) + side, u, f1 - f0, road.height_along(travelled + f0 - local), road.height_along(travelled + f1 - local))
					else:
						_stripe(a + u * ((from + to) / 2.0) + side, u, to - from)
		travelled += length


## A flat polygon (park, water, beach) at height y.
func polygon(outline: PackedVector2Array, y: float, layer: int, uv_scale: float = 6.0) -> void:
	_layer(layer)
	var local := PackedVector2Array()
	for p in outline:
		local.append(p - origin)
	var faces := Geometry2D.triangulate_polygon(local)
	if faces.is_empty():
		return
	var base := mesh.vertex_count()
	for p in local:
		mesh.vertex(Vector3(p.x, y, p.y), Vector3.UP, _uv(p + origin, uv_scale))
	for t in range(0, faces.size(), 3):
		var p0 := local[faces[t]]
		var p1 := local[faces[t + 1]]
		var p2 := local[faces[t + 2]]
		if (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0.0:
			mesh.triangle(base + faces[t], base + faces[t + 1], base + faces[t + 2])
		else:
			mesh.triangle(base + faces[t], base + faces[t + 2], base + faces[t + 1])


## Ground layer of an area kind (format 1 and 2), or -1 for land use drawn as bare earth
## (residential, industrial…, which the earth under every chunk already shows). Water areas are
## drawn by `WaterMeshes` (sunk below the banks) and return -1 here too (`is_water`).
static func area_layer(kind: StringName) -> int:
	match kind:
		&"park":
			return COVER_LAWN
		&"meadow", &"orchard":
			return COVER_MEADOW
		&"scrub":
			return COVER_SCRUB
		&"forest":
			return COVER_FOREST
		&"wetland", &"mangrove":
			return COVER_WETLAND
		&"farmland":
			return COVER_FARMLAND
		&"sport":
			return COVER_SPORT
		&"cemetery":
			return COVER_CEMETERY
		&"bare", &"saltpan":
			return COVER_BARE
		&"beach":
			return CityAtlas.GROUND_SAND
		&"apron", &"helipad":
			return CityAtlas.GROUND_PAVING
	return -1


## Areas drawn as open water by `WaterMeshes`.
static func is_water(kind: StringName) -> bool:
	return kind == &"water" or kind == &"reservoir"


## Covers that get a kerbed edge (parks and grounds in town).
static func kerbed(kind: StringName) -> bool:
	return kind == &"park" or kind == &"sport" or kind == &"cemetery"


## The part of the sea inside a chunk square, as ground water just above the earth (the whole
## sea outline did not triangulate for the regional world; the clipped pieces do).
func sea(outline: PackedVector2Array, square: Rect2) -> void:
	var box := PackedVector2Array([square.position, Vector2(square.end.x, square.position.y), square.end, Vector2(square.position.x, square.end.y)])
	for piece in Geometry2D.intersect_polygons(outline, box):
		polygon(piece, Y_SEA, CityAtlas.GROUND_WATER)


## The bare earth under a whole chunk square.
func earth(square: Rect2) -> void:
	_layer(CityAtlas.GROUND_EARTH)
	var corners := [square.position, Vector2(square.end.x, square.position.y), square.end, Vector2(square.position.x, square.end.y)]
	var ids: Array[int] = []
	for c: Vector2 in corners:
		var p := c - origin
		ids.append(mesh.vertex(Vector3(p.x, Y_EARTH, p.y), Vector3.UP, _uv(c, 8.0)))
	mesh.quad(ids[0], ids[3], ids[2], ids[1])


## A road on a deck, ramp or embankment (G-151): the surface follows the road's heights; the
## verge of a main road is drawn only on the parts that touch the ground.
func _raised(span: CityLayout.RoadSpan) -> void:
	var road := span.road
	var prof := DeckMeshes.profile(span)
	if road.kind == &"footway":
		ribbon(prof.points, road.width, Y_VERGE, 3.0, CityAtlas.GROUND_PAVING, prof.heights)
		return
	if road.is_main():
		var run := PackedVector2Array()
		for i in prof.points.size():
			if prof.heights[i] < 0.05:
				run.append(prof.points[i])
				continue
			if run.size() >= 2:
				ribbon(run, road.width + 5.0, Y_VERGE, 3.0, CityAtlas.GROUND_PAVING)
			run = PackedVector2Array()
		if run.size() >= 2:
			ribbon(run, road.width + 5.0, Y_VERGE, 3.0, CityAtlas.GROUND_PAVING)
	ribbon(prof.points, road.width, Y_ROAD, 9.0, CityAtlas.GROUND_ASPHALT, prof.heights)
	add_stripes(span)


## Kerbs: a low edge along the carriageway, painted in 1 m yellow and black bands.
func kerbs(runs: Array[StreetFurniture.KerbRun], layer: int = CityAtlas.GROUND_KERB, h: float = StreetFurniture.KERB_HEIGHT) -> void:
	_layer(layer)
	for run in runs:
		var n := run.inner.size()
		var run_base := floorf(run.along[0] / 2.0)
		for i in n - 1:
			var a0 := run.inner[i] - origin
			var a1 := run.inner[i + 1] - origin
			var b0 := run.outer[i] - origin
			var b1 := run.outer[i + 1] - origin
			var u0 := run.along[i] / 2.0
			var u1 := run.along[i + 1] / 2.0
			var f := (a0 - b0).normalized()
			var verts: Array[Vector3] = [
				Vector3(a0.x, h, a0.y), Vector3(a1.x, h, a1.y), Vector3(b1.x, h, b1.y), Vector3(b0.x, h, b0.y),
				Vector3(a0.x, 0.0, a0.y), Vector3(a1.x, 0.0, a1.y), Vector3(b1.x, 0.0, b1.y), Vector3(b0.x, 0.0, b0.y)]
			var us := [u0 - run_base, u1 - run_base, u1 - run_base, u0 - run_base, u0 - run_base, u1 - run_base, u1 - run_base, u0 - run_base]
			var d := a1 - a0
			_kerb_face(verts, us, [0, 1, 2, 3], Vector3.UP)
			_kerb_face(verts, us, [4, 5, 1, 0], Vector3(f.x, 0.0, f.y))
			_kerb_face(verts, us, [7, 6, 2, 3], Vector3(-f.x, 0.0, -f.y))
			if i == 0:
				_kerb_face(verts, us, [4, 0, 3, 7], Vector3(-d.x, 0.0, -d.y).normalized())
			if i == n - 2:
				_kerb_face(verts, us, [5, 1, 2, 6], Vector3(d.x, 0.0, d.y).normalized())


func _kerb_face(verts: Array[Vector3], us: Array, k: Array, normal: Vector3) -> void:
	var ids: Array[int] = []
	for j: int in k:
		ids.append(mesh.vertex(verts[j], normal, Vector2(float(us[j]) + _layer_index * LAYER_U, 0.5)))
	var p := verts[k[0]]
	if (verts[k[1]] - p).cross(verts[k[3]] - p).dot(normal) >= 0.0:
		mesh.quad(ids[0], ids[1], ids[2], ids[3])
	else:
		mesh.quad(ids[0], ids[3], ids[2], ids[1])


## Everything flat in one chunk (`buildGround`), roads first-come in the span order. `water` are
## the chunk's water polygons (`WaterMeshes.polygons`): the earth and the covers are cut round
## them, so the sunk water shows through.
func build(spans: Array, areas: Array[WorldArea], square: Rect2, kerb_runs: Array[StreetFurniture.KerbRun], water: Array[PackedVector2Array] = [], medians: Array[StreetFurniture.KerbRun] = []) -> void:
	if water.is_empty():
		earth(square)
	else:
		for piece in subtract([_square(square)], water):
			polygon(piece, Y_EARTH, CityAtlas.GROUND_EARTH, 8.0)
	var edges: Array[StreetFurniture.KerbRun] = []
	for area in areas:
		var layer := area_layer(area.kind)
		if layer < 0:
			continue
		var pieces: Array[PackedVector2Array] = [area.outline]
		if not water.is_empty():
			pieces = subtract(pieces, water)
		for piece in pieces:
			polygon(piece, Y_PARK, layer)
		if kerbed(area.kind):
			edges.append_array(edge_runs(area.outline, square))
	for span: CityLayout.RoadSpan in spans:
		var road := span.road
		var pts := road.points.slice(span.start, span.end + 1)
		if road.is_raised():
			_raised(span)
			continue
		if road.kind == &"footway":
			ribbon(pts, road.width, Y_VERGE, 3.0, CityAtlas.GROUND_PAVING)
			continue
		if road.is_main():
			ribbon(pts, road.width + 5.0, Y_VERGE, 3.0, CityAtlas.GROUND_PAVING)
		ribbon(pts, road.width, Y_ROAD, 9.0, CityAtlas.GROUND_ASPHALT)
		add_stripes(span)
	kerbs(kerb_runs)
	kerbs(edges, CityAtlas.GROUND_PAVING, PARK_KERB)
	kerbs(medians, CityAtlas.GROUND_KERB, MEDIAN_HEIGHT)


static func _square(square: Rect2) -> PackedVector2Array:
	return PackedVector2Array([square.position, Vector2(square.end.x, square.position.y), square.end, Vector2(square.position.x, square.end.y)])


## `pieces` minus every polygon of `holes`, as simple polygons (no holes): where a hole would fall
## inside a piece, the piece is first cut in two through the hole (G-152).
static func subtract(pieces: Array[PackedVector2Array], holes: Array[PackedVector2Array]) -> Array[PackedVector2Array]:
	var out := pieces
	for hole in holes:
		var next: Array[PackedVector2Array] = []
		for piece in out:
			next.append_array(_minus(piece, hole, 0))
		out = next
	return out


static func _minus(piece: PackedVector2Array, hole: PackedVector2Array, depth: int) -> Array[PackedVector2Array]:
	var out: Array[PackedVector2Array] = []
	var res := Geometry2D.clip_polygons(piece, hole)
	var outer_cw := Geometry2D.is_polygon_clockwise(piece)
	var has_hole := false
	for r in res:
		if r.size() >= 3 and Geometry2D.is_polygon_clockwise(r) != outer_cw:
			has_hole = true
	if not has_hole:
		for r in res:
			if r.size() >= 3:
				out.append(r)
		return out
	if depth >= 6:
		# Give up cutting: keep the outer outlines (the hole is drawn over, not cut).
		for r in res:
			if r.size() >= 3 and Geometry2D.is_polygon_clockwise(r) == outer_cw:
				out.append(r)
		return out
	var c := Vector2.ZERO
	for p in hole:
		c += p
	c /= hole.size()
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for p in piece:
		lo = lo.min(p)
		hi = hi.max(p)
	lo -= Vector2(1, 1)
	hi += Vector2(1, 1)
	for half: PackedVector2Array in [
			PackedVector2Array([lo, Vector2(c.x, lo.y), Vector2(c.x, hi.y), Vector2(lo.x, hi.y)]),
			PackedVector2Array([Vector2(c.x, lo.y), Vector2(hi.x, lo.y), hi, Vector2(c.x, hi.y)])]:
		for part in Geometry2D.intersect_polygons(piece, half):
			if part.size() >= 3 and Geometry2D.is_polygon_clockwise(part) == outer_cw:
				out.append_array(_minus(part, hole, depth + 1))
	return out


## True when both ends of an edge lie on the same side of the chunk square (a clip edge).
static func on_square_edge(a: Vector2, b: Vector2, square: Rect2) -> bool:
	const E := 0.05
	for v: float in [square.position.x, square.end.x]:
		if absf(a.x - v) < E and absf(b.x - v) < E:
			return true
	for v: float in [square.position.y, square.end.y]:
		if absf(a.y - v) < E and absf(b.y - v) < E:
			return true
	return false


## Kerb runs along a polygon's real edges (not the chunk square's clip edges), inside it.
static func edge_runs(outline: PackedVector2Array, square: Rect2) -> Array[StreetFurniture.KerbRun]:
	var out: Array[StreetFurniture.KerbRun] = []
	var n := outline.size()
	if n < 3:
		return out
	var inward := -1.0 if Geometry2D.is_polygon_clockwise(outline) else 1.0
	var run: StreetFurniture.KerbRun = null
	var along := 0.0
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		if on_square_edge(a, b, square) or a.distance_to(b) < 0.3:
			run = null
			continue
		var d := (b - a).normalized()
		var nrm := Vector2(-d.y, d.x) * inward * StreetFurniture.KERB_WIDTH
		if run == null:
			run = StreetFurniture.KerbRun.new()
			out.append(run)
			run.inner.append(a)
			run.outer.append(a + nrm)
			run.along.append(along)
		along += a.distance_to(b)
		run.inner.append(b)
		run.outer.append(b + nrm)
		run.along.append(along)
	return out


## A zebra crossing across the carriageway at a spot (bars along the travel direction).
func zebra(sp: WorldSpot, h: float) -> void:
	var dir := sp.direction()
	var across := Vector2(-dir.y, dir.x)
	var usable := sp.width - 0.8
	var bars := maxi(2, floori(usable / ZEBRA_PITCH))
	var first := -(bars - 1) * ZEBRA_PITCH / 2.0
	for k in bars:
		_stripe(sp.position + across * (first + k * ZEBRA_PITCH), dir, ZEBRA_LENGTH, h, h, ZEBRA_BAR)
	zebras += 1


## A speed breaker's surface, painted in the kerb's yellow and black bands across the road; returns
## its collider triangles (chunk-local; the top surface only, flush with the road at its edges).
func bump(b: RoadBumps.Bump, h: float) -> PackedVector3Array:
	_layer(CityAtlas.GROUND_KERB)
	var dir := b.direction
	var across := Vector2(-dir.y, dir.x)
	var rows := 9
	var cols := maxi(2, ceili(b.width / 1.0))
	var c := b.position - origin
	var ids: Array[PackedInt32Array] = []
	var pos: Array[PackedVector3Array] = []
	for r in rows:
		var u := -1.0 + 2.0 * r / (rows - 1)
		var along := u * b.length / 2.0
		var y := h + Y_ROAD + b.height * RoadBumps.Bump.profile(u, b.kind)
		var row := PackedInt32Array()
		var prow := PackedVector3Array()
		for k in cols + 1:
			var w := -b.width / 2.0 + b.width * k / cols
			var q := c + dir * along + across * w
			var v := Vector3(q.x, y, q.y)
			# Bands 1 m wide across the road (the kerb tile's u), and a light dip line at the crest.
			row.append(mesh.vertex(v, Vector3.UP, Vector2((w + b.width / 2.0) / 2.0 + _layer_index * LAYER_U, 0.5)))
			prow.append(Vector3(v.x, v.y - Y_ROAD, v.z))
		ids.append(row)
		pos.append(prow)
	var faces := PackedVector3Array()
	for r in rows - 1:
		for k in cols:
			var a := ids[r][k]
			var b2 := ids[r][k + 1]
			var c2 := ids[r + 1][k + 1]
			var d := ids[r + 1][k]
			var p0 := mesh.positions[a]
			if (mesh.positions[b2] - p0).cross(mesh.positions[c2] - p0).y >= 0.0:
				mesh.quad(a, b2, c2, d)
			else:
				mesh.quad(a, d, c2, b2)
			faces.append_array([pos[r][k], pos[r][k + 1], pos[r + 1][k + 1], pos[r][k], pos[r + 1][k + 1], pos[r + 1][k]])
	bumps += 1
	return faces
