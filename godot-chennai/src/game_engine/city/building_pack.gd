class_name BuildingPack
extends RefCounted
## Runtime loader & spatial placer for the 100 Blender-built Chennai building archetypes
## (`assets/buildings/pack_100/*.glb` + `lookup.bin`).
##
## Designed for worker-thread chunk assembly on Android Mobile:
## - Reads `lookup.bin` (`CP10` sorted binary table) directly from a PackedByteArray via O(log N)
##   binary search with zero Dictionary/JSON allocation per building.
## - Never touches protected landmarks or religious/historic OSM structures.
## - Caches `LOD0` ArrayMeshes (for `Near` MultiMeshInstance3D) plus `LOD2` MeshBuilders
##   (merged per chunk for `Far`).

const DIR := "res://assets/buildings/pack_100"
const LOOKUP_PATH := DIR + "/lookup.bin"
const MAGIC := 0x30315043  # "CP10" little-endian
const ASSET_RECORD_BYTES := 64
const MAP_RECORD_BYTES := 10

var asset_ids: PackedStringArray = PackedStringArray()
var asset_dims: PackedVector3Array = PackedVector3Array()  # (width_x, depth_z, height_y)
var asset_floors: PackedInt32Array = PackedInt32Array()
var lod0_meshes: Array[Mesh] = []
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
	lod2_builders.resize(asset_ids.size())
	for i in asset_ids.size():
		var path := "%s/%s.glb" % [DIR, asset_ids[i]]
		var scene := ResourceLoader.load(path, "PackedScene") as PackedScene
		if scene == null:
			continue
		var root := scene.instantiate()
		var lod0_node := root.find_child("LOD0", true, false) as MeshInstance3D
		var lod2_node := root.find_child("LOD2", true, false) as MeshInstance3D
		if lod0_node != null and lod0_node.mesh != null:
			lod0_meshes[i] = _to_vertex_coloured_mesh(lod0_node.mesh)
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


## Computes local chunk placement Transform3D aligned to the building's street-facing/longest edge.
static func placement_for(b: Building, spans: Array, dims: Vector3, local_origin: Vector2) -> Transform3D:
	var outline := b.outline
	var n_pts := outline.size()
	var centre := Vector2.ZERO
	for p in outline:
		centre += p
	centre /= maxf(1.0, float(n_pts))

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

	var yaw := atan2(best_n.x, best_n.y)
	var lx := Vector2(best_n.y, -best_n.x)
	var lz := best_n
	var min_u := INF
	var max_u := -INF
	var min_v := INF
	var max_v := -INF
	for p in outline:
		var rel := p - centre
		var u := rel.dot(lx)
		var v := rel.dot(lz)
		min_u = minf(min_u, u)
		max_u = maxf(max_u, u)
		min_v = minf(min_v, v)
		max_v = maxf(max_v, v)
	var foot_w := maxf(2.0, max_u - min_u)
	var foot_d := maxf(2.0, max_v - min_v)
	var sx := clampf((foot_w * 0.97) / maxf(1.0, dims.x), 0.55, 1.50)
	var sz := clampf((foot_d * 0.97) / maxf(1.0, dims.y), 0.55, 1.50)
	var sy := clampf(b.height / maxf(1.0, dims.z), 0.65, 1.50)

	var basis := Basis(Vector3.UP, yaw).scaled_local(Vector3(sx, sy, sz))
	return Transform3D(basis, Vector3(centre.x - local_origin.x, 0.0, centre.y - local_origin.y))
