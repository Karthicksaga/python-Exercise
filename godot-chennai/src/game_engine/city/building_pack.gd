class_name BuildingPack
extends RefCounted
## Runtime loader & spatial placer for the 100 Blender-built Chennai building archetypes
## (`assets/buildings/pack_100/*.glb` + `lookup.bin`).
##
## Designed for worker-thread chunk assembly on Android Mobile:
## - Reads `lookup.bin` (`CP10` sorted binary table) directly from a PackedByteArray via O(log N)
##   binary search with zero Dictionary/JSON allocation per building.
## - Never touches protected landmarks or religious/historic OSM structures.
## - Caches `LOD0` and `LOD1` ArrayMeshes (for per-instance distance-sorted `Near` MultiMeshes)
##   plus `LOD2` MeshBuilders (merged per chunk for `Far`).

const DIR := "res://assets/buildings/pack_100"
const LOOKUP_PATH := DIR + "/lookup.bin"
const MAGIC := 0x30315043  # "CP10" little-endian
const ASSET_RECORD_BYTES := 64
const MAP_RECORD_BYTES := 10

var asset_ids: PackedStringArray = PackedStringArray()
var asset_dims: PackedVector3Array = PackedVector3Array()  # (width_x, depth_z, height_y)
var asset_floors: PackedInt32Array = PackedInt32Array()
var lod0_meshes: Array[Mesh] = []
var lod1_meshes: Array[Mesh] = []
var lod2_builders: Array[MeshBuilder] = []

var _bytes := PackedByteArray()
var _prot_off: int = 0
var _prot_count: int = 0
var _map_off: int = 0
var _map_count: int = 0
var error: String = ""


static func available() -> bool:
	return FileAccess.file_exists(LOOKUP_PATH)


static func load_pack(load_meshes: bool = true) -> BuildingPack:
	var pack := BuildingPack.new()
	if not FileAccess.file_exists(LOOKUP_PATH):
		pack.error = "BuildingPack lookup missing at %s" % LOOKUP_PATH
		return pack
	var raw := FileAccess.get_file_as_bytes(LOOKUP_PATH)
	if raw.size() < 16 or raw.decode_u32(0) != MAGIC:
		pack.error = "Invalid BuildingPack lookup header."
		return pack
	var ver := raw.decode_u16(4)
	if ver != 1:
		pack.error = "Unsupported BuildingPack lookup version %d." % ver
		return pack
	var asset_count := raw.decode_u16(6)
	pack._prot_count = raw.decode_u32(8)
	pack._map_count = raw.decode_u32(12)
	var off := 16
	for i in asset_count:
		var raw_id := raw.slice(off, off + 40)
		var zero := raw_id.find(0)
		if zero >= 0:
			raw_id = raw_id.slice(0, zero)
		pack.asset_ids.append(raw_id.get_string_from_utf8())
		var w := raw.decode_float(off + 40)
		var d := raw.decode_float(off + 44)
		var h := raw.decode_float(off + 48)
		var fl := raw.decode_u32(off + 52)
		pack.asset_dims.append(Vector3(w, d, h))
		pack.asset_floors.append(int(fl))
		off += ASSET_RECORD_BYTES
	pack._prot_off = off
	off += pack._prot_count * 8
	pack._map_off = off
	if raw.size() < pack._map_off + pack._map_count * MAP_RECORD_BYTES:
		pack.error = "Truncated BuildingPack lookup file."
		return pack
	pack._bytes = raw
	if load_meshes:
		pack._load_glbs()
	return pack


func is_protected(source_id: int) -> bool:
	if _prot_count <= 0 or source_id <= 0:
		return false
	var lo := 0
	var hi := _prot_count - 1
	while lo <= hi:
		var mid := (lo + hi) >> 1
		var v := _bytes.decode_u64(_prot_off + mid * 8)
		if v == source_id:
			return true
		if v < source_id:
			lo = mid + 1
		else:
			hi = mid - 1
	return false


## Returns 0..(asset_count-1) or -1 if protected / not mapped.
func asset_index_for(source_id: int) -> int:
	if _map_count <= 0 or source_id <= 0 or is_protected(source_id):
		return -1
	var lo := 0
	var hi := _map_count - 1
	while lo <= hi:
		var mid := (lo + hi) >> 1
		var at := _map_off + mid * MAP_RECORD_BYTES
		var v := _bytes.decode_u64(at)
		if v == source_id:
			return int(_bytes.decode_u16(at + 8))
		if v < source_id:
			lo = mid + 1
		else:
			hi = mid - 1
	return -1


func _load_glbs() -> void:
	lod0_meshes.resize(asset_ids.size())
	lod1_meshes.resize(asset_ids.size())
	lod2_builders.resize(asset_ids.size())
	for i in asset_ids.size():
		var path := "%s/%s.glb" % [DIR, asset_ids[i]]
		var scene := ResourceLoader.load(path, "PackedScene") as PackedScene
		if scene == null:
			continue
		var root := scene.instantiate()
		var lod0_node := root.find_child("LOD0", true, false) as MeshInstance3D
		var lod1_node := root.find_child("LOD1", true, false) as MeshInstance3D
		var lod2_node := root.find_child("LOD2", true, false) as MeshInstance3D
		if lod0_node != null and lod0_node.mesh != null:
			lod0_meshes[i] = _to_vertex_coloured_mesh(lod0_node.mesh)
		if lod1_node != null and lod1_node.mesh != null:
			lod1_meshes[i] = _to_vertex_coloured_mesh(lod1_node.mesh)
		if lod2_node != null and lod2_node.mesh != null:
			lod2_builders[i] = _bake_builder(lod2_node.mesh)
		root.free()


## Strips embedded glTF material references so all pack buildings render cleanly with the shared
## linear vertex-coloured material (`kit.materials.landmark`).
static func _to_vertex_coloured_mesh(src: Mesh) -> ArrayMesh:
	var mb := _bake_builder(src)
	var out := ArrayMesh.new()
	var arr := mb.arrays(false)
	if not arr.is_empty():
		out.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arr)
	return out


static func _bake_builder(src: Mesh) -> MeshBuilder:
	var b := MeshBuilder.new()
	for s in src.get_surface_count():
		var arrays := src.surface_get_arrays(s)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
		var cols: PackedColorArray = arrays[Mesh.ARRAY_COLOR] if arrays[Mesh.ARRAY_COLOR] != null else PackedColorArray()
		var index: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		var base := b.vertex_count()
		for v in verts.size():
			b.positions.append(verts[v])
			b.normals.append(norms[v] if v < norms.size() else Vector3.UP)
			b.uvs.append(Vector2.ZERO)
			b.uv2s.append(Vector2.ZERO)
			b.colors.append(cols[v] if v < cols.size() else Color.WHITE)
		if index.is_empty():
			for v in verts.size():
				b.indices.append(base + v)
		else:
			for idx in index:
				b.indices.append(base + idx)
	return b


static func polygon_area(outline: PackedVector2Array) -> float:
	var n := outline.size()
	if n < 3:
		return 0.0
	var acc := 0.0
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		acc += a.x * b.y - b.x * a.y
	return absf(acc) * 0.5


static func obb_footprint(xf: Transform3D, mesh_aabb: AABB) -> PackedVector2Array:
	var lo := mesh_aabb.position
	var hi := mesh_aabb.position + mesh_aabb.size
	var out := PackedVector2Array()
	for pt: Vector3 in [
		xf * Vector3(lo.x, 0.0, lo.z),
		xf * Vector3(hi.x, 0.0, lo.z),
		xf * Vector3(hi.x, 0.0, hi.z),
		xf * Vector3(lo.x, 0.0, hi.z),
	]:
		out.append(Vector2(pt.x, pt.z))
	return out


static func _frame_of(b: Building, spans: Array) -> Dictionary:
	var outline := b.outline
	var n_pts := outline.size()
	var mean := Vector2.ZERO
	for p in outline:
		mean += p
	mean /= maxf(1.0, float(n_pts))

	var best_n := Vector2(0.0, 1.0)
	var best_score := -1.0
	for i in n_pts:
		var p := outline[i]
		var q := outline[(i + 1) % n_pts]
		var dv := q - p
		var edge_len := dv.length()
		if edge_len < 1.0:
			continue
		var n := Vector2(dv.y, -dv.x) / edge_len
		var road_bonus := 25.0 if (not spans.is_empty() and BuildingMeshes.wall_faces_road(p, q, spans, false)) else 0.0
		var score := edge_len + road_bonus
		if score > best_score:
			best_score = score
			best_n = n

	var lx := Vector2(best_n.y, -best_n.x)
	var lz := best_n
	var min_u := INF
	var max_u := -INF
	var min_v := INF
	var max_v := -INF
	for p in outline:
		var rel := p - mean
		var u := rel.dot(lx)
		var v := rel.dot(lz)
		min_u = minf(min_u, u)
		max_u = maxf(max_u, u)
		min_v = minf(min_v, v)
		max_v = maxf(max_v, v)
	var obb_centre := mean + lx * ((min_u + max_u) * 0.5) + lz * ((min_v + max_v) * 0.5)
	return {
		"yaw": atan2(best_n.x, best_n.y),
		"centre": obb_centre,
		"w": maxf(2.0, max_u - min_u),
		"d": maxf(2.0, max_v - min_v),
	}


## Computes local chunk placement Transform3D aligned to the building's street-facing/longest edge.
static func placement_for(b: Building, spans: Array, dims: Vector3, local_origin: Vector2) -> Transform3D:
	var frame := _frame_of(b, spans)
	var yaw := float(frame["yaw"])
	var c := frame["centre"] as Vector2
	var foot_w := float(frame["w"])
	var foot_d := float(frame["d"])
	var sx := clampf((foot_w * 0.96) / maxf(1.0, dims.x), 0.45, 1.50)
	var sz := clampf((foot_d * 0.96) / maxf(1.0, dims.y), 0.45, 1.50)
	var sy := clampf(b.height / maxf(1.0, dims.z), 0.65, 1.50)

	var basis := Basis(Vector3.UP, yaw).scaled_local(Vector3(sx, sy, sz))
	return Transform3D(basis, Vector3(c.x - local_origin.x, 0.0, c.y - local_origin.y))


## Places a packed archetype only when the footprint is nearly rectangular/convex, fits within scale
## bounds without ballooning past the parcel, and does not overlap adjacent buildings.
static func checked_placement(b: Building, spans: Array, dims: Vector3, mesh_aabb: AABB, local_origin: Vector2, neighbor_boxes: Array[Rect2], neighbors: Array[Building], self_idx: int, placed_rects: Array[Rect2], placed_polys: Array[PackedVector2Array]) -> Dictionary:
	if not b.holes.is_empty() or b.outline.size() < 3:
		return {"ok": false}
	var frame := _frame_of(b, spans)
	var foot_w := float(frame["w"])
	var foot_d := float(frame["d"])
	var poly_a := polygon_area(b.outline)
	if poly_a < 0.72 * foot_w * foot_d:
		return {"ok": false}
	var mx := maxf(1.0, maxf(dims.x, mesh_aabb.size.x))
	var mz := maxf(1.0, maxf(dims.y, mesh_aabb.size.z))
	var my := maxf(1.0, maxf(dims.z, mesh_aabb.size.y))
	var fit_sx := (foot_w * 0.96) / mx
	var fit_sz := (foot_d * 0.96) / mz
	if fit_sx < 0.45 or fit_sz < 0.45 or fit_sx > 1.55 or fit_sz > 1.55:
		return {"ok": false}
	var sx := minf(fit_sx, 1.50)
	var sz := minf(fit_sz, 1.50)
	var sy := clampf(b.height / my, 0.65, 1.50)
	var yaw := float(frame["yaw"])
	var c := frame["centre"] as Vector2
	var aabb_c := mesh_aabb.position + mesh_aabb.size * 0.5
	var local_rot := Basis(Vector3.UP, yaw)
	var shift := local_rot * Vector3(-aabb_c.x * sx, 0.0, -aabb_c.z * sz)
	var basis := local_rot.scaled_local(Vector3(sx, sy, sz))
	var world_xf := Transform3D(basis, Vector3(c.x + shift.x, 0.0, c.y + shift.z))
	var fp := obb_footprint(world_xf, mesh_aabb)
	var rect := Rect2(fp[0], Vector2.ZERO)
	for p in fp:
		rect = rect.expand(p)
	for j in neighbors.size():
		if j == self_idx or not rect.intersects(neighbor_boxes[j]):
			continue
		var inter := Geometry2D.intersect_polygons(fp, neighbors[j].outline)
		for part: PackedVector2Array in inter:
			if polygon_area(part) > 0.25:
				return {"ok": false}
	for k in placed_rects.size():
		if not rect.intersects(placed_rects[k]):
			continue
		var p_inter := Geometry2D.intersect_polygons(fp, placed_polys[k])
		for part: PackedVector2Array in p_inter:
			if polygon_area(part) > 0.25:
				return {"ok": false}
	var chunk_xf := Transform3D(basis, Vector3(world_xf.origin.x - local_origin.x, 0.0, world_xf.origin.z - local_origin.y))
	return {"ok": true, "xform": chunk_xf, "fp": fp, "rect": rect}


## Per-chunk runtime container for `Near/PackBuildings`: switches each building instance cleanly
## between `LOD0` (<= LOD0_REACH, shadow-casting) and `LOD1` (> LOD0_REACH, no shadow pass) with
## hysteresis, matching `TreeBatch` without per-node `visibility_range` gaps or LOD popping.
class Batch:
	extends Node3D

	const LOD0_REACH := 55.0
	const HYSTERESIS := 5.0
	const CHECK_EVERY := 0.25
	const MOVE_MIN := 3.0

	class Group:
		extends RefCounted
		var xforms: Array[Transform3D] = []
		var lod: PackedInt32Array = PackedInt32Array()
		var mmi0: MultiMeshInstance3D
		var mmi1: MultiMeshInstance3D
		var built: bool = false

	var groups: Array[Group] = []
	var _clock: float = 0.0
	var _last_cam: Vector3 = Vector3(INF, INF, INF)
	var _cursor: int = -1
	var _step_cam: Vector3 = Vector3.ZERO

	static func build(pack: BuildingPack, pack_near: Dictionary[int, Array], centre: Vector2, focus: Vector2, material: Material, shadows: bool, render_layer: int) -> Batch:
		var batch := Batch.new()
		batch.name = "PackBuildings"
		var shadow_mode := GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadows else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		for aidx: int in pack_near:
			var raw_xforms: Array = pack_near[aidx]
			var mesh0 := pack.lod0_meshes[aidx]
			if mesh0 == null or raw_xforms.is_empty():
				continue
			var mesh1 := pack.lod1_meshes[aidx] if aidx < pack.lod1_meshes.size() and pack.lod1_meshes[aidx] != null else mesh0
			var local_box := mesh0.get_aabb()
			var lo := Vector3(INF, INF, INF)
			var hi := Vector3(-INF, -INF, -INF)
			var g := Group.new()
			for item: Variant in raw_xforms:
				var xf := item as Transform3D
				g.xforms.append(xf)
				g.lod.append(0)
				for c_idx in 8:
					var pt := xf * local_box.get_endpoint(c_idx)
					lo = lo.min(pt)
					hi = hi.max(pt)
			var box := AABB(lo, (hi - lo).max(Vector3.ONE)).grow(0.5)
			g.mmi0 = _make_mmi(pack.asset_ids[aidx] + "_lod0", mesh0, g.xforms.size(), box, material, render_layer, shadow_mode)
			g.mmi1 = _make_mmi(pack.asset_ids[aidx] + "_lod1", mesh1, g.xforms.size(), box, material, render_layer, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF)
			batch.add_child(g.mmi0)
			batch.add_child(g.mmi1)
			batch.groups.append(g)
		if focus.x < INF:
			batch.refresh(Vector3(focus.x - centre.x, 2.0, focus.y - centre.y))
		else:
			batch.refresh(Vector3(0.0, 2.0, 0.0))
		return batch

	static func _make_mmi(node_name: String, mesh: Mesh, count: int, box: AABB, material: Material, render_layer: int, shadow_mode: GeometryInstance3D.ShadowCastingSetting) -> MultiMeshInstance3D:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = mesh
		mm.instance_count = count
		mm.visible_instance_count = 0
		mm.custom_aabb = box
		var mmi := MultiMeshInstance3D.new()
		mmi.name = node_name
		mmi.multimesh = mm
		mmi.custom_aabb = box
		mmi.material_override = material
		mmi.layers = render_layer
		mmi.cast_shadow = shadow_mode
		mmi.visible = false
		return mmi

	func _enter_tree() -> void:
		_clock = CHECK_EVERY * float(absi(hash(get_instance_id())) % 100) / 100.0

	func _process(delta: float) -> void:
		if _cursor >= 0:
			for _step in 3:
				_refresh_group(groups[_cursor], _step_cam)
				_cursor += 1
				if _cursor >= groups.size():
					_cursor = -1
					break
			return
		_clock -= delta
		if _clock > 0.0:
			return
		_clock = CHECK_EVERY
		var cam := get_viewport().get_camera_3d() if get_viewport() != null else null
		if cam == null:
			return
		var at := to_local(cam.global_position)
		if at.distance_squared_to(_last_cam) < MOVE_MIN * MOVE_MIN:
			return
		_last_cam = at
		_step_cam = at
		if not groups.is_empty():
			_cursor = 0

	func refresh(cam: Vector3) -> void:
		_last_cam = cam
		_cursor = -1
		for g in groups:
			_refresh_group(g, cam)

	func _refresh_group(g: Group, cam: Vector3) -> void:
		var changed := not g.built
		for i in g.xforms.size():
			var d := cam.distance_to(g.xforms[i].origin)
			var cur := g.lod[i]
			var want: int
			if not g.built:
				want = 0 if d <= LOD0_REACH else 1
			elif cur == 0:
				want = 1 if d > LOD0_REACH + HYSTERESIS else 0
			else:
				want = 0 if d < LOD0_REACH - HYSTERESIS else 1
			if want != cur:
				g.lod[i] = want
				changed = true
		if changed:
			g.built = true
			_upload(g)

	func _upload(g: Group) -> void:
		var n0 := 0
		var n1 := 0
		var mm0 := g.mmi0.multimesh
		var mm1 := g.mmi1.multimesh
		mm0.visible_instance_count = 0
		mm1.visible_instance_count = 0
		for i in g.xforms.size():
			if g.lod[i] == 0:
				mm0.set_instance_transform(n0, g.xforms[i])
				n0 += 1
			else:
				mm1.set_instance_transform(n1, g.xforms[i])
				n1 += 1
		mm0.visible_instance_count = n0
		g.mmi0.visible = n0 > 0
		mm1.visible_instance_count = n1
		g.mmi1.visible = n1 > 0

	func draw_calls() -> int:
		var n := 0
		for g in groups:
			if g.mmi0.visible:
				n += 1
			if g.mmi1.visible:
				n += 1
		return n
