class_name PropMesh
extends RefCounted
## A small prop made of boxes and cylinders in one mesh with vertex colours (one draw call): the
## temple's sandal stand and lamp (G-483). Original shapes, no textures. Collects the engine's
## primitive meshes moved to where they go.

var _positions := PackedVector3Array()
var _normals := PackedVector3Array()
var _colours := PackedColorArray()
var _indices := PackedInt32Array()


## A box of `size` centred at `at` (turned by `yaw` radians about Y).
func box(size: Vector3, at: Vector3, colour: Color, yaw: float = 0.0) -> void:
	var m := BoxMesh.new()
	m.size = size
	_add(m, Transform3D(Basis(Vector3.UP, yaw), at), colour)


## A cylinder (a cone when the radii differ) of `height` standing on `at`.
func cylinder(top: float, bottom: float, height: float, at: Vector3, colour: Color, segments: int = 12) -> void:
	var m := CylinderMesh.new()
	m.top_radius = top
	m.bottom_radius = bottom
	m.height = height
	m.radial_segments = segments
	m.rings = 1
	_add(m, Transform3D(Basis.IDENTITY, at + Vector3(0.0, height * 0.5, 0.0)), colour)


func ellipsoid(radii: Vector3, at: Vector3, colour: Color) -> void:
	var m := SphereMesh.new()
	m.radius = 1.0
	m.height = 2.0
	m.radial_segments = 8
	m.rings = 5
	_add(m, Transform3D(Basis.from_scale(radii), at), colour)


func _add(mesh: PrimitiveMesh, xform: Transform3D, colour: Color) -> void:
	var arrays := mesh.get_mesh_arrays()
	var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
	var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
	var base := _positions.size()
	var normal_basis := xform.basis.inverse().transposed()
	for i in verts.size():
		_positions.append(xform * verts[i])
		_normals.append((normal_basis * norms[i]).normalized())
		_colours.append(colour)
	for i in idx:
		_indices.append(base + i)


func triangle_count() -> int:
	return _indices.size() / 3


## The mesh with a plain vertex-coloured material (`emissive` > 0 glows, for a flame).
func commit(emissive: float = 0.0) -> ArrayMesh:
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = _positions
	arrays[Mesh.ARRAY_NORMAL] = _normals
	arrays[Mesh.ARRAY_COLOR] = _colours
	arrays[Mesh.ARRAY_INDEX] = _indices
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var m := StandardMaterial3D.new()
	m.vertex_color_use_as_albedo = true
	m.vertex_color_is_srgb = true
	m.roughness = 0.85
	if emissive > 0.0:
		m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mesh.surface_set_material(0, m)
	return mesh
