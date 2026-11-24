class_name DetailMeshes
extends RefCounted
## What OSM maps on and along the street, drawn near the player only (G-191): benches, waste
## baskets, drinking water, post boxes, toilets, power poles and towers, bollards, gates;
## walls, fences, hedges, retaining walls, kerbs, jersey barriers and guard rails as thin merged
## boxes; tree rows as trees; railway and bus platforms as raised slabs with an edge line and a
## shelter; pitches with their lines, playgrounds, running tracks, allotments and swimming pools
## as marked ground. Sizes are estimated (OSM maps a `height` on some walls only); every shape is
## placed exactly where OSM puts it. Plain data and packed arrays: runs on a worker thread.
##
## Everything goes into the chunk's existing surfaces (objects, ground, water): no draw call is
## added. Colliders for what blocks walking are collected in `solids` (closed boxes) and
## `slab_faces` (platform slabs) for the builder.

const Y_ZONE := 0.04
const Y_LINE := 0.055
const LINE_WIDTH := 0.12
const WALL_THICK := 0.25
const FENCE_POST_PITCH := 3.0
const TREE_ROW_PITCH := 7.0
const RAIL_PLATFORM := 0.9
const BUS_PLATFORM := 0.18
const PLATFORM_HALF := 1.5
const SHELTER_PITCH := 40.0
## Walls, fences and hedges are cut where a carriageway runs through them.
const ROAD_MARGIN := 0.4
const BIG_ZONE := 40000.0

var origin := Vector2.ZERO
var square := Rect2()
var layout: CityLayout
var models: CityModels
var objects: MeshBuilder
var ground: GroundMeshes
var water: WaterMeshes
var buildings: Array[Building] = []
var boxes: Array[Rect2] = []
## Closed collider boxes (12 triangles each), chunk-local.
var solids := PackedVector3Array()
## Platform slab triangles (collider), chunk-local.
var slab_faces := PackedVector3Array()
var stats: Dictionary[String, int] = {}
var _lines: Array[DetailTile.LineFeature] = []


func _count(key: String, n: int = 1) -> void:
	stats[key] = stats.get(key, 0) + n


func _local3(p: Vector2, y: float = 0.0) -> Vector3:
	return Vector3(p.x - origin.x, y, p.y - origin.y)


## The yaw that faces the nearest road from `p` (open front towards the road), or 0.
func _towards_road(p: Vector2) -> float:
	var hit := layout.nearest_road_point(p, false)
	if hit.is_empty() or float(hit["distance"]) > 40.0:
		return 0.0
	var to: Vector2 = (hit["point"] as Vector2) - p
	return StreetFurniture.facing(to) if to.length() > 0.01 else 0.0


## Whether something stands on a deck, in a building or in the water (not drawn there).
func _blocked(p: Vector2, water_polygons: Array[PackedVector2Array]) -> bool:
	if StreetFurniture.in_building(buildings, boxes, p, 0.2):
		return true
	if not water_polygons.is_empty() and WaterMeshes.inside_any(p, water_polygons, -1):
		return true
	var hit := layout.nearest_road_point(p, false)
	if not hit.is_empty():
		var road: Road = layout.roads[int(hit["road_index"])]
		if road.is_raised() and float(hit["distance"]) < road.width / 2.0 + 3.0:
			return true
	return false


# --- street objects ----------------------------------------------------------------------------

func add_objects(list: Array[DetailTile.ObjectSpot], water_polygons: Array[PackedVector2Array]) -> void:
	for o in list:
		if o.kind == &"bus_platform" or o.kind == &"street_lamp":
			continue
		var model: MeshBuilder = models.detail.models.get(o.kind)
		if model == null or _blocked(o.position, water_polygons):
			continue
		var yaw := 0.0
		if o.kind in [&"bench", &"waste_basket", &"drinking_water", &"post_box", &"toilets"]:
			yaw = _towards_road(o.position)
		elif o.kind == &"gate":
			yaw = _along_line(o.position)
		var half: Vector3 = DetailModels.HALF[o.kind]
		CityModels.place(objects, model, _local3(o.position), yaw)
		_count("object:" + String(o.kind))
		if DetailModels.SOLID.has(String(o.kind)):
			var r := minf(half.x, 0.5) if o.kind != &"toilets" and o.kind != &"power_tower" else half.x
			ChunkBuilder.solid_box(solids, _local3(o.position, half.y), Vector3(r, half.y, minf(half.z, r) if o.kind != &"toilets" else half.z), yaw)


## Direction along the nearest barrier line, for a gate in it.
func _along_line(p: Vector2) -> float:
	var best := 9.0
	var yaw := 0.0
	for li in _lines:
		for i in li.points.size() - 1:
			var a := li.points[i]
			var b := li.points[i + 1]
			var d := Geometry2D.get_closest_point_to_segment(p, a, b).distance_squared_to(p)
			if d < best:
				best = d
				yaw = atan2(-(b.y - a.y), b.x - a.x)
	return yaw


# --- barriers and tree rows --------------------------------------------------------------------

## Draws the barrier lines of this chunk; `lines` are the pieces touching the chunk, each drawn
## only for the segments whose middle is inside the square (so a line crossing chunks is not
## doubled). Returns the trees of tree rows.
func add_lines(lines: Array[DetailTile.LineFeature], water_polygons: Array[PackedVector2Array]) -> Array[WorldTree]:
	_lines = lines
	var trees: Array[WorldTree] = []
	for li in lines:
		var travelled := 0.0
		for i in li.points.size() - 1:
			var a := li.points[i]
			var b := li.points[i + 1]
			var length := a.distance_to(b)
			var mid := (a + b) / 2.0
			if length < 0.2:
				continue
			if li.kind == &"tree_row":
				_tree_row(a, b, length, travelled, trees, water_polygons)
			elif square.has_point(mid):
				if li.kind == &"platform" or li.kind == &"bus_platform":
					_platform_line(li, a, b)
				elif not _on_carriageway(mid) and (water_polygons.is_empty() or not WaterMeshes.inside_any(mid, water_polygons, -1)):
					_barrier(li, a, b, length, i)
			travelled += length
	return trees


func _on_carriageway(p: Vector2) -> bool:
	var hit := layout.nearest_road_point(p, false)
	if hit.is_empty():
		return false
	var road: Road = layout.roads[int(hit["road_index"])]
	return float(hit["distance"]) < road.width / 2.0 + ROAD_MARGIN


func _tree_row(a: Vector2, b: Vector2, length: float, travelled: float, trees: Array[WorldTree], water_polygons: Array[PackedVector2Array]) -> void:
	var u := (b - a) / length
	var first := ceilf(travelled / TREE_ROW_PITCH) * TREE_ROW_PITCH - travelled
	var d := first
	while d < length:
		var p := a + u * d
		if square.has_point(p) and not StreetFurniture.in_building(buildings, boxes, p, 0.5) and not _on_carriageway(p) \
				and (water_polygons.is_empty() or not WaterMeshes.inside_any(p, water_polygons, -1)):
			var t := WorldTree.new()
			t.position = p
			t.scale = 0.95 + CityHash.tree_unit(p, 61) * 0.3
			t.source = &"osm"
			trees.append(t)
			_count("tree_row_tree")
		d += TREE_ROW_PITCH


func _barrier(li: DetailTile.LineFeature, a: Vector2, b: Vector2, length: float, index: int) -> void:
	var u := (b - a) / length
	var mapped := li.height > 0.0
	var h := li.height if mapped else float(DetailTile.LINE_HEIGHTS.get(li.kind, 1.5))
	_count("line:%s:%s" % [li.kind, "mapped_height" if mapped else "estimated_height"])
	var seed_p := a + b
	var yaw := atan2(-u.y, u.x)
	match li.kind:
		&"wall", &"retaining_wall":
			var thick := WALL_THICK if li.kind == &"wall" else 0.45
			var colour: int = [0xd8cdb6, 0xc9c1b0, 0xe0d6c0, 0xb9b3a6][floori(CityHash.tree_unit(seed_p, 62) * 4.0)] if li.kind == &"wall" else 0x9b9588
			_box_run(a, b, thick / 2.0, 0.0, h, colour, 0xe9e3d6 if li.kind == &"wall" else 0xb4ae9f)
			if li.kind == &"wall":
				# A pilaster every 4 m, a little proud, so a long wall is not one flat slab.
				var posts := maxi(1, ceili(length / 4.0))
				for k in posts:
					var at := a + u * (length * k / posts)
					_box_run(at - u * 0.22, at + u * 0.22, thick / 2.0 + 0.07, 0.0, h + 0.15, colour, 0xf0eadc)
			_wall_solid(a, b, length, thick / 2.0, h, yaw)
		&"hedge":
			var g := 0x3f7a3a if CityHash.tree_unit(seed_p, 63) < 0.5 else 0x4a8a3e
			_box_run(a, b, 0.4, 0.0, h, g, 0x58994a)
			_wall_solid(a, b, length, 0.4, h, yaw)
		&"fence":
			_fence(a, b, length, u, h)
			_wall_solid(a, b, length, 0.06, h, yaw)
		&"kerb":
			_box_run(a, b, 0.07, 0.0, h, 0xb9b6ad, 0xd0cdc3)
		&"jersey_barrier":
			_box_run(a, b, 0.25, 0.0, h, 0xc4c2bb, 0xdad8d0)
			_wall_solid(a, b, length, 0.25, h, yaw)
		&"guard_rail":
			_box_run(a, b, 0.04, 0.45, 0.8, 0x9aa0a4, 0xb4babd)
			_wall_solid(a, b, length, 0.05, 0.8, yaw)


func _wall_solid(a: Vector2, b: Vector2, length: float, half_w: float, h: float, yaw: float) -> void:
	ChunkBuilder.solid_box(solids, _local3((a + b) / 2.0, h / 2.0), Vector3(length / 2.0, h / 2.0, half_w), yaw)


## A thin box run a-b: two sides, top and the two ends, vertex coloured.
func _box_run(a: Vector2, b: Vector2, half_w: float, y0: float, y1: float, side_hex: int, top_hex: int) -> void:
	var u := (b - a).normalized()
	var n := Vector2(-u.y, u.x) * half_w
	var side := BuildingMeshes.lin(side_hex)
	var top := BuildingMeshes.lin(top_hex)
	var la := a - origin
	var lb := b - origin
	var corner := func(p: Vector2, o: Vector2, y: float) -> Vector3:
		return Vector3(p.x + o.x, y, p.y + o.y)
	_quad(corner.call(la, n, y0), corner.call(lb, n, y0), corner.call(lb, n, y1), corner.call(la, n, y1), Vector3(n.x, 0.0, n.y).normalized(), side)
	_quad(corner.call(lb, -n, y0), corner.call(la, -n, y0), corner.call(la, -n, y1), corner.call(lb, -n, y1), -Vector3(n.x, 0.0, n.y).normalized(), side)
	_quad(corner.call(la, n, y1), corner.call(lb, n, y1), corner.call(lb, -n, y1), corner.call(la, -n, y1), Vector3.UP, top)
	var ue := Vector3(u.x, 0.0, u.y)
	_quad(corner.call(lb, n, y0), corner.call(lb, -n, y0), corner.call(lb, -n, y1), corner.call(lb, n, y1), ue, side)
	_quad(corner.call(la, -n, y0), corner.call(la, n, y0), corner.call(la, n, y1), corner.call(la, -n, y1), -ue, side)


func _quad(p0: Vector3, p1: Vector3, p2: Vector3, p3: Vector3, normal: Vector3, colour: Color) -> void:
	var ids: Array[int] = []
	for p: Vector3 in [p0, p1, p2, p3]:
		ids.append(objects.vertex(p, normal, Vector2(CityModels.DARK_U, 0.5), colour))
	if (p1 - p0).cross(p2 - p0).dot(normal) >= 0.0:
		objects.quad(ids[0], ids[1], ids[2], ids[3])
	else:
		objects.quad(ids[0], ids[3], ids[2], ids[1])


func _fence(a: Vector2, b: Vector2, length: float, u: Vector2, h: float) -> void:
	var posts := maxi(1, ceili(length / FENCE_POST_PITCH))
	for k in posts + 1:
		var p := a + u * (length * k / posts)
		_box_run(p - u * 0.04, p + u * 0.04, 0.04, 0.0, h, 0x6e7479, 0x8a9095)
	_box_run(a, b, 0.02, h * 0.28, h * 0.28 + 0.06, 0x8a9095, 0xa0a6aa)
	_box_run(a, b, 0.02, h - 0.1, h - 0.04, 0x8a9095, 0xa0a6aa)


# --- platforms ---------------------------------------------------------------------------------

func _platform_height(kind: StringName) -> float:
	return RAIL_PLATFORM if kind == &"platform" else BUS_PLATFORM


func _platform_line(li: DetailTile.LineFeature, a: Vector2, b: Vector2) -> void:
	var u := (b - a).normalized()
	var n := Vector2(-u.y, u.x) * PLATFORM_HALF
	_slab(PackedVector2Array([a + n, b + n, b - n, a - n]), _platform_height(li.kind), li.kind == &"platform")
	if li.kind == &"platform":
		_count("platform_line")


func _slab(outline: PackedVector2Array, h: float, rail: bool) -> void:
	var local := PackedVector2Array()
	for p in outline:
		local.append(p - origin)
	var top := BuildingMeshes.lin(0xb8b3a8)
	var wall := BuildingMeshes.lin(0x8e8a82)
	var faces := Geometry2D.triangulate_polygon(local)
	if faces.is_empty():
		return
	var base := objects.vertex_count()
	for p in local:
		objects.vertex(Vector3(p.x, h, p.y), Vector3.UP, Vector2(CityModels.DARK_U, 0.5), top)
	for t in range(0, faces.size(), 3):
		var p0 := local[faces[t]]
		var p1 := local[faces[t + 1]]
		var p2 := local[faces[t + 2]]
		var up := (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0.0
		if up:
			objects.triangle(base + faces[t], base + faces[t + 1], base + faces[t + 2])
			slab_faces.append_array([Vector3(p0.x, h, p0.y), Vector3(p1.x, h, p1.y), Vector3(p2.x, h, p2.y)])
		else:
			objects.triangle(base + faces[t], base + faces[t + 2], base + faces[t + 1])
			slab_faces.append_array([Vector3(p0.x, h, p0.y), Vector3(p2.x, h, p2.y), Vector3(p1.x, h, p1.y)])
	var winding := signf(_signed_area(local))
	for i in local.size():
		var a := local[i]
		var b := local[(i + 1) % local.size()]
		var e := b - a
		if e.length() < 0.05:
			continue
		var out := Vector2(e.y, -e.x).normalized() * winding
		var n3 := Vector3(out.x, 0.0, out.y)
		_quad(Vector3(a.x, 0.0, a.y), Vector3(b.x, 0.0, b.y), Vector3(b.x, h, b.y), Vector3(a.x, h, a.y), n3, wall)
		slab_faces.append_array([Vector3(a.x, -0.5, a.y), Vector3(b.x, h, b.y), Vector3(b.x, -0.5, b.y), Vector3(a.x, -0.5, a.y), Vector3(a.x, h, a.y), Vector3(b.x, h, b.y)])
		if rail:
			# The yellow safety line along the platform edge.
			var inward := -out
			var edge := BuildingMeshes.lin(0xdeba34)
			var p0 := a + inward * 0.25
			var p1 := b + inward * 0.25
			var q0 := a + inward * 0.65
			var q1 := b + inward * 0.65
			_quad(Vector3(p0.x, h + 0.01, p0.y), Vector3(p1.x, h + 0.01, p1.y), Vector3(q1.x, h + 0.01, q1.y), Vector3(q0.x, h + 0.01, q0.y), Vector3.UP, edge)


static func _signed_area(pts: PackedVector2Array) -> float:
	var s := 0.0
	for i in pts.size():
		var a := pts[i]
		var b := pts[(i + 1) % pts.size()]
		s += a.x * b.y - b.x * a.y
	return s / 2.0


## Oriented bounding box: centre, unit long axis `u`, perpendicular `v`, length and width.
static func obb(outline: PackedVector2Array) -> Dictionary:
	var axis := Vector2.RIGHT
	var best := 0.0
	for i in outline.size():
		var e := outline[(i + 1) % outline.size()] - outline[i]
		if e.length() > best:
			best = e.length()
			axis = e.normalized()
	var v := Vector2(-axis.y, axis.x)
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for p in outline:
		var q := Vector2(p.dot(axis), p.dot(v))
		lo = lo.min(q)
		hi = hi.max(q)
	var c := axis * ((lo.x + hi.x) / 2.0) + v * ((lo.y + hi.y) / 2.0)
	return {"c": c, "u": axis, "v": v, "l": hi.x - lo.x, "w": hi.y - lo.y}


# --- zones -------------------------------------------------------------------------------------

func add_zones(zones: Array[DetailTile.Zone], models_: CityModels, water_polygons: Array[PackedVector2Array]) -> void:
	for z in zones:
		if not square.has_point(z.centre):
			continue
		_count("zone:" + String(z.kind))
		match z.kind:
			&"pitch":
				_pitch(z)
			&"playground":
				ground.polygon(z.outline, Y_ZONE, GroundMeshes.COVER_PLAYGROUND)
			&"track":
				ground.polygon(z.outline, Y_ZONE, GroundMeshes.COVER_TRACK)
				_outline_paint(z.outline, 0.4)
			&"allotments":
				ground.polygon(z.outline, Y_ZONE, GroundMeshes.COVER_ALLOTMENT)
			&"swimming_pool":
				_pool(z.outline)
			&"platform", &"bus_platform":
				_platform_zone(z, models_)


func _outline_paint(outline: PackedVector2Array, inset: float) -> void:
	for i in outline.size():
		ground.strip(outline[i], outline[(i + 1) % outline.size()], LINE_WIDTH * 1.2, Y_LINE, CityAtlas.GROUND_PAINT)


func _pool(outline: PackedVector2Array) -> void:
	var local := PackedVector2Array()
	for p in outline:
		local.append(p - origin)
	var faces := Geometry2D.triangulate_polygon(local)
	if faces.is_empty():
		return
	var mesh := water.mesh
	var base := mesh.vertex_count()
	# Red 0 marks a pool for `water.gdshader` (clear aqua); alpha is the shore tint.
	for p in local:
		mesh.vertex(Vector3(p.x, Y_ZONE + 0.01, p.y), Vector3.UP, water._uv(p + origin), Color(0, 0, 0, 0.15))
	for t in range(0, faces.size(), 3):
		var p0 := local[faces[t]]
		var p1 := local[faces[t + 1]]
		var p2 := local[faces[t + 2]]
		if (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0.0:
			mesh.triangle(base + faces[t], base + faces[t + 1], base + faces[t + 2])
		else:
			mesh.triangle(base + faces[t], base + faces[t + 2], base + faces[t + 1])
	for i in outline.size():
		ground.strip(outline[i], outline[(i + 1) % outline.size()], 0.7, Y_ZONE + 0.005, CityAtlas.GROUND_PAVING)


func _platform_zone(z: DetailTile.Zone, models_: CityModels) -> void:
	var rail := z.kind == &"platform"
	_slab(z.outline, _platform_height(z.kind), rail)
	if rail:
		_count("platform_area")
		var box := obb(z.outline)
		var length: float = box["l"]
		if length >= 14.0 and float(box["w"]) >= 2.5:
			var n := maxi(1, floori(length / SHELTER_PITCH))
			var u: Vector2 = box["u"]
			var v: Vector2 = box["v"]
			for k in n:
				var along := (k + 0.5) / n - 0.5
				var p: Vector2 = (box["c"] as Vector2) + u * (length * along)
				if Geometry2D.is_point_in_polygon(p, z.outline):
					CityModels.place(objects, models_.shelter, _local3(p, RAIL_PLATFORM), StreetFurniture.facing(v))
					_count("platform_shelter")


# --- pitches -----------------------------------------------------------------------------------

func _pitch(z: DetailTile.Zone) -> void:
	var sport := z.sport
	var cover := GroundMeshes.COVER_SPORT
	if sport in [&"basketball", &"tennis", &"volleyball", &"badminton"]:
		cover = GroundMeshes.COVER_PLAYGROUND
	elif sport == &"kabaddi" or sport == &"athletics":
		cover = GroundMeshes.COVER_TRACK
	ground.polygon(z.outline, Y_ZONE, cover)
	var box := obb(z.outline)
	var length: float = box["l"]
	var width: float = box["w"]
	if length < 8.0 or width < 5.0 or _area(z.outline) > BIG_ZONE:
		_outline_paint(z.outline, 0.0)
		return
	var c: Vector2 = box["c"]
	var u: Vector2 = box["u"]
	var v: Vector2 = box["v"]
	var hl := length / 2.0 - 0.6
	var hw := width / 2.0 - 0.6
	var p := func(s: float, t: float) -> Vector2: return c + u * s + v * t
	var line := func(s0: float, t0: float, s1: float, t1: float) -> void: ground.strip(p.call(s0, t0), p.call(s1, t1), LINE_WIDTH, Y_LINE, CityAtlas.GROUND_PAINT)
	var rect := func(s0: float, t0: float, s1: float, t1: float) -> void:
		line.call(s0, t0, s1, t0)
		line.call(s1, t0, s1, t1)
		line.call(s1, t1, s0, t1)
		line.call(s0, t1, s0, t0)
	var circle := func(s: float, t: float, r: float) -> void:
		var prev: Vector2 = p.call(s + r, t)
		for k in range(1, 17):
			var a := TAU * k / 16.0
			var q: Vector2 = p.call(s + cos(a) * r, t + sin(a) * r)
			ground.strip(prev, q, LINE_WIDTH, Y_LINE, CityAtlas.GROUND_PAINT)
			prev = q
	if sport == &"cricket":
		# The pitch strip (20.12 x 3.05 m, scaled down on a small ground) with its creases.
		var strip_l := minf(20.12, length * 0.6)
		var half := strip_l / 2.0
		ground.strip(p.call(-half, 0.0), p.call(half, 0.0), 3.05, Y_LINE - 0.01, CityAtlas.GROUND_EARTH, 3.0)
		for e: float in [-1.0, 1.0]:
			line.call(e * (half - 1.22), -1.6, e * (half - 1.22), 1.6)
		_count("pitch:cricket")
		return
	rect.call(-hl, -hw, hl, hw)
	match sport:
		&"basketball":
			line.call(0.0, -hw, 0.0, hw)
			circle.call(0.0, 0.0, clampf(hw * 0.25, 0.6, 1.8))
			for e: float in [-1.0, 1.0]:
				rect.call(e * hl, -hw * 0.33, e * (hl - hl * 0.4), hw * 0.33)
		&"tennis":
			line.call(0.0, -hw, 0.0, hw)
			for e: float in [-1.0, 1.0]:
				line.call(e * hl * 0.54, -hw * 0.75, e * hl * 0.54, hw * 0.75)
			line.call(-hl * 0.54, 0.0, hl * 0.54, 0.0)
			line.call(-hl, -hw * 0.75, hl, -hw * 0.75)
			line.call(-hl, hw * 0.75, hl, hw * 0.75)
		&"volleyball", &"badminton":
			line.call(0.0, -hw, 0.0, hw)
			for e: float in [-1.0, 1.0]:
				line.call(e * hl * 0.33, -hw, e * hl * 0.33, hw)
		&"kabaddi":
			line.call(0.0, -hw, 0.0, hw)
			for e: float in [-1.0, 1.0]:
				line.call(e * hl * 0.3, -hw, e * hl * 0.3, hw)
		_:
			# Football and hockey, and a plain marked field when OSM maps no sport.
			line.call(0.0, -hw, 0.0, hw)
			circle.call(0.0, 0.0, clampf(hw * 0.2, 1.0, 9.15))
			if length >= 30.0:
				for e: float in [-1.0, 1.0]:
					var depth := minf(16.5, length * 0.157)
					var span := minf(20.2, width * 0.3)
					rect.call(e * hl, -span, e * (hl - depth), span)
					var small := depth * 0.33
					rect.call(e * hl, -span * 0.45, e * (hl - small), span * 0.45)
	_count("pitch:" + (String(sport) if sport != &"" else "estimated"))


static func _area(outline: PackedVector2Array) -> float:
	return absf(_signed_area(outline))
