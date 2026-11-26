class_name MeshBuilder
extends RefCounted
## Collects triangles from many small shapes into one surface, so a whole chunk of buildings is
## one draw call (`MeshBuilder.ts`). Plain packed arrays: safe on a worker thread.
##
## The API keeps the Three.js winding (counter-clockwise seen from the front) so ported builders
## read the same; `arrays()` flips every triangle to Godot's clockwise front faces.
## Colours are sRGB (materials set `vertex_color_is_srgb`). UV2 carries a per-vertex layer or
## glow value for the shaders that read it (`ground.gdshader`).

var positions := PackedVector3Array()
var normals := PackedVector3Array()
var uvs := PackedVector2Array()
var uv2s := PackedVector2Array()
var colors := PackedColorArray()
var indices := PackedInt32Array()
## UV2 given to the next vertices (layer index for the ground shader).
var uv2 := Vector2.ZERO


func vertex_count() -> int:
	return positions.size()


func triangle_count() -> int:
	return indices.size() / 3


func is_empty() -> bool:
	return indices.is_empty()


## Adds a vertex and returns its index.
func vertex(p: Vector3, n: Vector3, uv: Vector2, color: Color = Color.WHITE) -> int:
	positions.append(p)
	normals.append(n)
	uvs.append(uv)
	uv2s.append(uv2)
	colors.append(color)
	return positions.size() - 1


## Triangle a-b-c, counter-clockwise from the front (Three.js order).
func triangle(a: int, b: int, c: int) -> void:
	indices.append(a)
	indices.append(c)
	indices.append(b)


## Two triangles a-b-c and a-c-d.
func quad(a: int, b: int, c: int, d: int) -> void:
	triangle(a, b, c)
	triangle(a, c, d)


## Appends another builder's geometry moved by `xform` (normals rotated).
func append(other: MeshBuilder, xform: Transform3D = Transform3D.IDENTITY, tint: Color = Color.WHITE) -> void:
	var base := positions.size()
	var basis := xform.basis
	for i in other.positions.size():
		positions.append(xform * other.positions[i])
		normals.append((basis * other.normals[i]).normalized())
		uvs.append(other.uvs[i])
		uv2s.append(other.uv2s[i])
		colors.append(other.colors[i] * tint)
	for i in other.indices:
		indices.append(base + i)


## Surface arrays for `ArrayMesh.add_surface_from_arrays`, or [] when nothing was added.
func arrays(with_uv2: bool = false) -> Array:
	if indices.is_empty():
		return []
	var out := []
	out.resize(Mesh.ARRAY_MAX)
	out[Mesh.ARRAY_VERTEX] = positions
	out[Mesh.ARRAY_NORMAL] = normals
	out[Mesh.ARRAY_TEX_UV] = uvs
	if with_uv2:
		out[Mesh.ARRAY_TEX_UV2] = uv2s
	out[Mesh.ARRAY_COLOR] = colors
	out[Mesh.ARRAY_INDEX] = indices
	return out


## One-surface mesh with `material`, or null when empty. Callable on a worker thread.
func commit(material: Material, with_uv2: bool = false) -> ArrayMesh:
	var a := arrays(with_uv2)
	if a.is_empty():
		return null
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, a)
	mesh.surface_set_material(0, material)
	return mesh
