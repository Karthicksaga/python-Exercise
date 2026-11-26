extends SceneTree
## Geometry audit for z-fighting (G-500): builds chunks the way the game does (regional world,
## palettes, signs, landmarks) and counts, per chunk and in total,
##
## - **footprints:** pairs of buildings whose footprints overlap by more than `MIN_AREA` m², and
##   of those the pairs whose flat roofs sit at the same height (coplanar roofs) and the pairs with
##   a shared wall line facing the same way (coplanar walls); duplicates (overlap over 90 % of the
##   smaller footprint); the same counts across chunk borders (3 x 3 blocks);
## - **triangles:** pairs of triangles of the merged chunk meshes that face the same way, lie in
##   planes less than `MAX_GAP` apart and overlap by more than `MIN_AREA_TRI` m² seen along their
##   normal, by layer pair and by gap: exactly coplanar (< 1 mm), 1-10 mm, 1-3 cm, 3-10 cm. The
##   near look (ground, water, decks, walls, roofs, kit, objects) and the far look (ground, water,
##   decks, far) are audited apart, as only one of them is drawn at a time.
##
## With a 24-bit depth buffer (the Mobile renderer's D24S8, Compatibility's DEPTH24) a gap g is
## resolved only up to about sqrt(g * near * 2^24) metres from the camera; the report prints that
## distance per bin for the camera's near plane. Exactly coplanar faces fight at every distance.
##
##     godot --headless --audio-driver Dummy --path . --script res://tests/tools/flicker_audit.gd \
##         -- [--cells=spawn,t_nagar,anna_salai,marina,mylapore] [--block=1] [--near=0.1] [--quiet]
##
## Prints one "flicker_audit" summary line per measure, then "flicker_audit_total ...".

const PACK_SCRIPT := "res://src/game_engine/city/building_pack.gd"
const MIN_AREA := 0.5
const MIN_AREA_TRI := 0.02
const MAX_GAP := 0.1
const GAPS: Array[float] = [0.001, 0.01, 0.03, 0.1]
const GAP_NAMES: Array[String] = ["coplanar", "1-10mm", "1-3cm", "3-10cm"]
## A few triangle positions per kind of pair (chunk space), printed with --examples.
static var examples: Dictionary = {}
const PLACES: Dictionary[String, Vector2] = {
	"spawn": Vector2(40.0, 60.0),
	"t_nagar": Vector2(2543.0, 5160.0),
	"anna_salai": Vector2(4940.0, 2915.0),
	"marina": Vector2(7991.7, 3422.5),
	"mylapore": Vector2(6900.0, 5600.0),
}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var names := PackedStringArray(PLACES.keys())
	var block := 1
	var near := 0.1
	var quiet := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--cells="):
			names = arg.trim_prefix("--cells=").split(",")
		elif arg.begins_with("--block="):
			block = int(arg.trim_prefix("--block="))
		elif arg.begins_with("--near="):
			near = float(arg.trim_prefix("--near="))
		elif arg == "--quiet":
			quiet = true
	var kit := make_kit()
	if kit == null:
		quit(1)
		return
	var cells: Array[Vector2i] = []
	for n in names:
		var centre: Vector2i
		if PLACES.has(n):
			centre = kit.source.cell_at(PLACES[n])
		else:
			var p := n.split(":")
			centre = Vector2i(int(p[0]), int(p[1]))
		for dx in range(-block, block + 1):
			for dz in range(-block, block + 1):
				var c := centre + Vector2i(dx, dz)
				if not cells.has(c):
					cells.append(c)
	var total := {}
	var t0 := Time.get_ticks_msec()
	var builds: Dictionary[Vector2i, ChunkBuilder.Build] = {}
	for cell in cells:
		var b := ChunkBuilder.build(kit, cell)
		if b.error != "":
			continue
		builds[cell] = b
		var r := audit_build(b)
		_add_into(total, r)
		if not quiet:
			print("flicker_audit cell=%s buildings=%d %s" % [cell, b.chunk.buildings.size(), _line(r)])
	var border := border_footprints(builds)
	_add_into(total, border)
	print("flicker_audit_total chunks=%d %s (%.1f s)" % [builds.size(), _line(total), (Time.get_ticks_msec() - t0) / 1000.0])
	for i in GAPS.size():
		var g := GAPS[i] * (0.5 if i == 0 else 1.0)
		print("flicker_audit_depth near=%.2f gap=%s resolved_to=%.0f m" % [near, GAP_NAMES[i], sqrt(g * near * 16777216.0)])
	if OS.get_cmdline_user_args().has("--examples"):
		for k: String in examples:
			print("flicker_audit_example %s: %s" % [k, "; ".join(PackedStringArray(examples[k]))])
	for cell in builds:
		CityTestKit.free_build(builds[cell])
	quit(0)


static func make_kit() -> ChunkBuilder.Kit:
	if not RegionalWorldSource.available():
		printerr("flicker_audit: no regional world")
		return null
	var k := CityTestKit.regional_kit()
	k.landmarks = LandmarkSpec.load_all()
	# The building pack (upstream c90b052) when this tree has it, as `CityWorld.setup` loads it;
	# by name, so the audit also runs on trees without it.
	if ResourceLoader.exists(PACK_SCRIPT) and not OS.get_cmdline_user_args().has("--no-pack"):
		var script := load(PACK_SCRIPT) as GDScript
		if bool(script.call("available")):
			var pack: Object = script.call("load_pack", true)
			if str(pack.get("error")) == "" and &"building_pack" in k:
				k.set("building_pack", pack)
				print("flicker_audit: building pack loaded")
	return k


static func _add_into(total: Dictionary, r: Dictionary) -> void:
	for k: String in r:
		total[k] = int(total.get(k, 0)) + int(r[k])


static func _line(r: Dictionary) -> String:
	var keys: Array = r.keys()
	keys.sort()
	var parts := PackedStringArray()
	for k: String in keys:
		parts.append("%s=%d" % [k, int(r[k])])
	return " ".join(parts)


## Every measure of one build.
static func audit_build(b: ChunkBuilder.Build) -> Dictionary:
	var out := footprints(b.chunk.buildings, "fp")
	var near := surfaces(b.view, ["Ground", "Water", "Decks", "Near/Walls", "Near/Roofs", "Near/Kit", "Near/Objects", "Near/PackBuildings/*"])
	var far := surfaces(b.view, ["Ground", "Water", "Decks", "Far/Far", "Far/PackFar"])
	var rn := coplanar_pairs(near)
	for k: String in rn:
		out["near:" + k] = rn[k]
	var rf := coplanar_pairs(far, ["far", "packfar"])
	for k: String in rf:
		out["far:" + k] = rf[k]
	return out


## The height a building's flat roof is drawn at, or NAN for a pitched roof (`BuildingMeshes.add`).
static func roof_y(b: Building) -> float:
	if BuildingMeshes.has_tiled_roof(b):
		return NAN
	return b.height - 0.35


## Overlapping footprint pairs among `buildings` (keys prefixed by `prefix`).
static func footprints(buildings: Array[Building], prefix: String, only_across: Dictionary = {}) -> Dictionary:
	var out := {prefix + "_overlap": 0, prefix + "_same_roof": 0, prefix + "_same_wall": 0, prefix + "_duplicate": 0}
	var boxes: Array[Rect2] = []
	var areas: PackedFloat32Array = PackedFloat32Array()
	for b in buildings:
		boxes.append(_box(b.outline))
		areas.append(absf(_area(b.outline)))
	for i in buildings.size():
		for j in range(i + 1, buildings.size()):
			if not only_across.is_empty() and only_across.get(buildings[i]) == only_across.get(buildings[j]):
				continue
			if not boxes[i].grow(0.01).intersects(boxes[j]):
				continue
			var a := buildings[i]
			var c := buildings[j]
			var shared := shared_wall(a.outline, c.outline)
			var overlap := overlap_area(a.outline, c.outline)
			if overlap < MIN_AREA and not shared:
				continue
			if overlap >= MIN_AREA:
				out[prefix + "_overlap"] += 1
				if overlap > 0.9 * minf(areas[i], areas[j]):
					out[prefix + "_duplicate"] += 1
				var ya := roof_y(a)
				var yc := roof_y(c)
				if not is_nan(ya) and not is_nan(yc) and absf(ya - yc) < 0.01:
					out[prefix + "_same_roof"] += 1
			if shared:
				out[prefix + "_same_wall"] += 1
	return out


## Buildings of neighbouring chunks that overlap each other (each chunk's own pairs are counted
## by `audit_build`).
static func border_footprints(builds: Dictionary[Vector2i, ChunkBuilder.Build]) -> Dictionary:
	var all: Array[Building] = []
	var owner := {}
	for cell in builds:
		for b in builds[cell].chunk.buildings:
			all.append(b)
			owner[b] = cell
	return footprints(all, "border", owner)


static func _box(o: PackedVector2Array) -> Rect2:
	var r := Rect2(o[0], Vector2.ZERO)
	for p in o:
		r = r.expand(p)
	return r


static func _area(o: PackedVector2Array) -> float:
	var s := 0.0
	for i in o.size():
		var p := o[i]
		var q := o[(i + 1) % o.size()]
		s += p.x * q.y - q.x * p.y
	return s / 2.0


static func overlap_area(a: PackedVector2Array, b: PackedVector2Array) -> float:
	var s := 0.0
	for poly in Geometry2D.intersect_polygons(a, b):
		if not Geometry2D.is_polygon_clockwise(poly):
			s += absf(_area(poly))
		else:
			s -= absf(_area(poly))
	return absf(s)


## True when an edge of `a` and an edge of `b` lie on one line (within 2 cm), overlap by more than
## 0.3 m and face the same way: both walls are drawn in one plane.
static func shared_wall(a: PackedVector2Array, b: PackedVector2Array) -> bool:
	for i in a.size():
		var p := a[i]
		var q := a[(i + 1) % a.size()]
		var d := q - p
		var l := d.length()
		if l < 0.3:
			continue
		var u := d / l
		for j in b.size():
			var r := b[j]
			var s := b[(j + 1) % b.size()]
			var e := s - r
			var m := e.length()
			if m < 0.3:
				continue
			if u.dot(e / m) < 0.9998:
				continue
			var nrm := Vector2(u.y, -u.x)
			if absf((r - p).dot(nrm)) > 0.02 or absf((s - p).dot(nrm)) > 0.02:
				continue
			var t0 := (r - p).dot(u)
			var t1 := (s - p).dot(u)
			if minf(l, maxf(t0, t1)) - maxf(0.0, minf(t0, t1)) > 0.3:
				return true
	return false


## Triangles of the named meshes of a chunk view: [label, a, b, c] in chunk space.
class Tri:
	extends RefCounted
	var layer: String
	var a: Vector3
	var b: Vector3
	var c: Vector3
	var n: Vector3
	var d: float


static func surfaces(view: Node3D, paths: Array) -> Array[Tri]:
	var out: Array[Tri] = []
	for path: String in paths:
		var nodes: Array[Node] = []
		if path.ends_with("/*"):
			var holder := view.get_node_or_null(path.trim_suffix("/*"))
			if holder != null:
				nodes = holder.get_children()
		else:
			var single := view.get_node_or_null(path)
			if single != null:
				nodes = [single]
		var layer := path.trim_suffix("/*").get_file().to_lower()
		for node in nodes:
			var mesh: Mesh = null
			var xforms: Array[Transform3D] = [Transform3D.IDENTITY]
			var mi := node as MeshInstance3D
			var mmi := node as MultiMeshInstance3D
			if mi != null:
				mesh = mi.mesh
			elif mmi != null and mmi.multimesh != null:
				mesh = mmi.multimesh.mesh
				# One instance per pack model: its own faces (thousands of triangles; every instance
				# of every model ran this machine out of memory).
				xforms.clear()
				if mmi.multimesh.instance_count > 0:
					xforms.append(mmi.multimesh.get_instance_transform(0))
			if mesh == null:
				continue
			for s in mesh.get_surface_count():
				var arrays := mesh.surface_get_arrays(s)
				var v: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				if idx.is_empty():
					idx = PackedInt32Array(range(v.size()))
				for xf in xforms:
					for t in range(0, idx.size(), 3):
						var tri := Tri.new()
						tri.layer = layer
						tri.a = xf * v[idx[t]]
						tri.b = xf * v[idx[t + 1]]
						tri.c = xf * v[idx[t + 2]]
						var n := (tri.b - tri.a).cross(tri.c - tri.a)
						if n.length_squared() < 1e-10:
							continue
						tri.n = n.normalized()
						tri.d = tri.n.dot(tri.a)
						out.append(tri)
	return out


## Same-facing triangle pairs closer than MAX_GAP that overlap, by layer pair and gap bin.
## `only` limits the count to pairs that include one of those layers (the far look's own faces).
static func coplanar_pairs(tris: Array[Tri], only: Array = []) -> Dictionary:
	var out := {}
	# Bucket by quantised normal; within a bucket a 2D grid on the plane finds neighbours.
	var buckets := {}
	var flat: Array[PackedVector2Array] = []
	flat.resize(tris.size())
	for i in tris.size():
		var t := tris[i]
		var key := Vector3i(roundi(t.n.x * 64.0), roundi(t.n.y * 64.0), roundi(t.n.z * 64.0))
		if not buckets.has(key):
			buckets[key] = PackedInt32Array()
		var arr: PackedInt32Array = buckets[key]
		arr.append(i)
		buckets[key] = arr
	for key: Vector3i in buckets:
		var ids: PackedInt32Array = buckets[key]
		if ids.size() < 2:
			continue
		var n := Vector3(key).normalized()
		var u := n.cross(Vector3.UP if absf(n.y) < 0.9 else Vector3.RIGHT).normalized()
		var w := n.cross(u)
		# A grid over (along-plane u, along-plane w, depth d) with 4 m cells and 0.1 m depth slices.
		var grid := {}
		for i in ids:
			var t := tris[i]
			var poly := PackedVector2Array([Vector2(t.a.dot(u), t.a.dot(w)), Vector2(t.b.dot(u), t.b.dot(w)), Vector2(t.c.dot(u), t.c.dot(w))])
			flat[i] = poly
			var box := Rect2(poly[0], Vector2.ZERO).expand(poly[1]).expand(poly[2])
			var dz := floori(t.d / MAX_GAP)
			for gx in range(floori(box.position.x / 4.0), floori(box.end.x / 4.0) + 1):
				for gy in range(floori(box.position.y / 4.0), floori(box.end.y / 4.0) + 1):
					var g := Vector3i(gx, gy, dz)
					if not grid.has(g):
						grid[g] = PackedInt32Array()
					var cell_ids: PackedInt32Array = grid[g]
					cell_ids.append(i)
					grid[g] = cell_ids
		var seen := {}
		for g: Vector3i in grid:
			var here: PackedInt32Array = grid[g]
			var others := PackedInt32Array(here)
			var up: Variant = grid.get(Vector3i(g.x, g.y, g.z + 1))
			if up != null:
				others.append_array(up as PackedInt32Array)
			for ia in here.size():
				var i := here[ia]
				for j in others:
					if j == i:
						continue
					var lo := mini(i, j)
					var hi := maxi(i, j)
					var pk := lo * 1000003 + hi
					if seen.has(pk):
						continue
					seen[pk] = true
					var ta := tris[lo]
					var tb := tris[hi]
					if ta.n.dot(tb.n) < 0.9998:
						continue
					if not only.is_empty() and not (only.has(ta.layer) or only.has(tb.layer)):
						continue
					var gap := absf(ta.d - tb.d)
					if gap >= MAX_GAP:
						continue
					var area := 0.0
					for poly in Geometry2D.intersect_polygons(flat[lo], flat[hi]):
						area += absf(_area(poly))
					if area < MIN_AREA_TRI:
						continue
					var bin := 0
					while bin < GAPS.size() - 1 and gap >= GAPS[bin]:
						bin += 1
					var layers := [ta.layer, tb.layer]
					layers.sort()
					var k := "%s+%s:%s" % [layers[0], layers[1], GAP_NAMES[bin]]
					out[k] = int(out.get(k, 0)) + 1
					var ex: Array = examples.get(k, [])
					if ex.size() < 4:
						ex.append("(%.2f, %.2f, %.2f) gap %.4f area %.2f" % [ta.a.x, ta.a.y, ta.a.z, gap, area])
						examples[k] = ex
	return out
