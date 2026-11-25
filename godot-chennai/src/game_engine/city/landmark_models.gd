class_name LandmarkModels
extends RefCounted
## Landmark models from their GLBs (decisions G-183, G-185), built on a worker thread.
##
## `build(spec, material)` loads the GLB (`ResourceLoader.load` on the calling worker; the main
## thread never waits on it), instantiates it outside the tree and returns one node ready to add:
## - **Placement:** the node sits at the spec's `origin` (world metres, OSM) and follows the
##   floating origin (`WorldOrigin.GROUP`); the model is built in world orientation, so no turn.
## - **LODs:** the GLB's `LOD0`/`LOD1`/`LOD2` meshes get visibility ranges from the spec (each
##   begins where the previous ends, with a short fade margin), and the shared vertex-coloured
##   landmark material, so a landmark costs one draw call wherever it is seen.
## - **Collision:** every `COL_*` box becomes a `BoxShape3D` on one `StaticBody3D` (Jolt), and
##   the box meshes are freed. The visible meshes have no collision of their own.
## - **Signs:** only the landmark's real public names (Tamil above English), as `Label3D` with
##   the project's Tamil font when the spec has `signs` (TD-18: nothing else).

const LOD_NAMES: Array[String] = ["LOD0", "LOD1", "LOD2"]
const FADE := 12.0
const SIGN_FONT := "res://assets/fonts/noto-sans-tamil-signs.woff2"


class Built:
	var node: Node3D
	var lod_meshes: Array[MeshInstance3D] = []
	var boxes: int = 0
	var triangles: PackedInt32Array = PackedInt32Array()
	var error: String = ""
	## The hero atlas material (null for vertex-coloured landmarks).
	var material: StandardMaterial3D


## Holds a landmark at its world point and follows the floating origin.
class Placed:
	extends Node3D
	var world: Vector2
	var spec_id: String = ""

	func _enter_tree() -> void:
		position = WorldOrigin.to_scene(world)
		add_to_group(WorldOrigin.GROUP)


static func triangle_count(mesh: Mesh) -> int:
	var n := 0
	for s in mesh.get_surface_count():
		var arrays := mesh.surface_get_arrays(s)
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
		if idx.size() > 0:
			n += idx.size() / 3
		elif arrays[Mesh.ARRAY_VERTEX] is PackedVector3Array:
			n += (arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
		# Else no vertex array came back: headless, the dummy renderer's mesh store is not
		# thread-safe and a mesh loaded on this worker while others build can come back empty
		# ("uninitialized RID"); nothing is drawn headless, so it counts as no triangles.
	return n


## The hero model's material (G-390): its one atlas, tinted by vertex colour. Worker thread.
static func atlas_material(spec: LandmarkSpec) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	var tex := ResourceLoader.load(spec.atlas_path(), "Texture2D") as Texture2D
	m.albedo_texture = tex
	m.vertex_color_use_as_albedo = true
	m.roughness = 0.88
	m.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	m.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	return m


## Worker thread. `material` overrides the GLB's material (null keeps it, for tools).
static func build(spec: LandmarkSpec, material: Material) -> Built:
	var out := Built.new()
	var res := ResourceLoader.load(spec.glb_path(), "PackedScene")
	if not res is PackedScene:
		out.error = "%s: no model at %s" % [spec.id, spec.glb_path()]
		return out
	var scene := (res as PackedScene).instantiate() as Node3D
	var holder := Placed.new()
	holder.name = "Landmark_" + spec.id
	holder.world = spec.origin
	holder.spec_id = spec.id
	if spec.atlas_file != "":
		material = atlas_material(spec)
		out.material = material as StandardMaterial3D
	var ends: Array[float] = [spec.lod0_end, spec.lod1_end, spec.lod2_end]
	var body := StaticBody3D.new()
	body.name = "Collision"
	var meshes: Array[MeshInstance3D] = []
	_collect(scene, meshes)
	var lods: Dictionary[String, MeshInstance3D] = {}
	for mi in meshes:
		if mi.name.begins_with("COL_"):
			var box := BoxShape3D.new()
			var aabb := mi.mesh.get_aabb()
			box.size = aabb.size
			var cs := CollisionShape3D.new()
			cs.name = String(mi.name)
			cs.shape = box
			cs.transform = _global_in(scene, mi) * Transform3D(Basis.IDENTITY, aabb.get_center())
			body.add_child(cs)
			out.boxes += 1
		elif LOD_NAMES.has(String(mi.name)):
			lods[String(mi.name)] = mi
	for i in LOD_NAMES.size():
		var mi: MeshInstance3D = lods.get(LOD_NAMES[i])
		if mi == null:
			out.error = "%s: %s missing in the GLB" % [spec.id, LOD_NAMES[i]]
			continue
		var copy := MeshInstance3D.new()
		copy.name = LOD_NAMES[i]
		copy.mesh = mi.mesh
		copy.transform = _global_in(scene, mi)
		if material != null:
			copy.material_override = material
		copy.visibility_range_begin = 0.0 if i == 0 else ends[i - 1]
		copy.visibility_range_begin_margin = 0.0 if i == 0 else FADE
		copy.visibility_range_end = ends[i]
		copy.visibility_range_end_margin = FADE if i < 2 else 0.0
		copy.visibility_range_fade_mode = GeometryInstance3D.VISIBILITY_RANGE_FADE_DISABLED
		holder.add_child(copy)
		out.lod_meshes.append(copy)
		out.triangles.append(triangle_count(mi.mesh))
	scene.free()
	holder.add_child(body)
	_signs(spec, holder)
	_boards(spec, holder, font_for_signs())
	out.node = holder
	return out


static func _collect(n: Node, into: Array[MeshInstance3D]) -> void:
	if n is MeshInstance3D:
		into.append(n as MeshInstance3D)
	for c in n.get_children():
		_collect(c, into)


## A node's transform relative to the scene root (the GLB's origin), outside the tree.
static func _global_in(root: Node3D, n: Node3D) -> Transform3D:
	var t := n.transform
	var p := n.get_parent()
	while p != null and p != root:
		if p is Node3D:
			t = (p as Node3D).transform * t
		p = p.get_parent()
	return t


static func font_for_signs() -> Font:
	return load(SIGN_FONT) as Font if ResourceLoader.exists(SIGN_FONT) else null


## Gantry boards (G-390, `spec.boards`): Tamil above English on the green boards the kit draws over
## the carriageways, facing the traffic that comes at them. World positions are in the spec.
static func _boards(spec: LandmarkSpec, holder: Node3D, font: Font) -> void:
	for b: Dictionary in spec.data.get("boards", []):
		var world := Vector2(float(b["world"][0]), float(b["world"][1]))
		var face := Vector2(float(b["facing"][0]), float(b["facing"][1]))
		var z: Array = b["board_z"]
		var base := float(b["deck_height"]) + 0.06
		var mid := base + (float(z[0]) + float(z[1])) / 2.0
		var local := world - spec.origin + face * 0.3
		var i := 0
		for line: String in [str(b.get("ta", "")), str(b.get("en", ""))]:
			var label := Label3D.new()
			label.name = "Board_%s_%d" % [str(b["road"]), i]
			label.text = line
			if font != null:
				label.font = font
			label.font_size = 96
			label.pixel_size = 0.9 / 96.0
			label.modulate = Color(0.95, 0.96, 0.93)
			label.outline_size = 0
			label.double_sided = false
			label.shaded = false
			label.visibility_range_end = spec.lod0_end + 120.0
			label.position = Vector3(local.x, mid + 0.55 - 1.05 * i, local.y)
			label.rotation.y = atan2(face.x, face.y)
			holder.add_child(label)
			i += 1


static func _signs(spec: LandmarkSpec, holder: Node3D) -> void:
	if spec.signs.is_empty():
		return
	var font: Font = load(SIGN_FONT) as Font if ResourceLoader.exists(SIGN_FONT) else null
	var params: Dictionary = (spec.data.get("recipe", {}) as Dictionary).get("params", {})
	var part: String = str(params.get("part", ""))
	var ring: PackedVector2Array = spec.outline(part)
	if ring.is_empty():
		return
	var yaw := deg_to_rad(spec.yaw_deg)
	var u := Vector2(cos(yaw), -sin(yaw))
	var v := Vector2(sin(yaw), cos(yaw))
	var front := 1.0 if str(params.get("front", "south")) == "south" else -1.0
	var lo := INF
	var hi := -INF
	var depth := 0.0
	# The kit measures from the part's area centroid (OSM), so the letters land on its board.
	var centroid: Array = (((spec.data["osm"] as Dictionary)["parts"] as Dictionary)[part] as Dictionary).get("centroid", [spec.origin.x, spec.origin.y])
	var c := Vector2(float(centroid[0]), float(centroid[1]))
	for p in ring:
		lo = minf(lo, (p - c).dot(u))
		hi = maxf(hi, (p - c).dot(u))
		depth = maxf(depth, (p - c).dot(v * front))
	var storeys := float(params.get("storeys", 2)) * float(params.get("storey_height", 6.0))
	for sign: Dictionary in spec.signs:
		# On the board's front face: the kit stands the board 2 m inside the front wall, 0.25 m thick.
		var at := c + u * ((lo + hi) / 2.0 + (hi - lo) / 2.0 * float(sign.get("at", 0.0))) + v * front * (depth - 2.0 + 0.2)
		var h := float(sign.get("height", 1.5))
		var i := 0
		for line: String in [str(sign.get("ta", "")), str(sign.get("en", ""))]:
			if line == "":
				continue
			var label := Label3D.new()
			label.name = "Sign%d" % i
			label.text = line
			if font != null:
				label.font = font
			label.font_size = 96
			label.pixel_size = h / 96.0 * 0.8
			label.modulate = Color(0.12, 0.16, 0.27)
			label.outline_size = 0
			label.double_sided = false
			label.shaded = true
			label.visibility_range_end = spec.lod0_end
			var local := at - spec.origin
			label.position = Vector3(local.x, storeys + 2.2 + h * (1.0 - i), local.y)
			label.rotation.y = yaw + (0.0 if front > 0.0 else PI)
			holder.add_child(label)
			i += 1
