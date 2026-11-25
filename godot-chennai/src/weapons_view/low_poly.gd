class_name LowPoly
extends RefCounted
## Tiny low-poly props built by script (decision G-433): boxes and prisms merged into one mesh,
## coloured from a shared 16-colour palette texture (one image, one material for every weapon
## and carried box, so they batch and cost no download). Original shapes, free of any asset.

const PALETTE: PackedColorArray = [
	Color("1c1d21"), Color("2c2d31"), Color("6b4426"), Color("d9c08c"),
	Color("8c1f1f"), Color("b98e5a"), Color("d8c9a6"), Color("5f8f6a"),
	Color("a9b0b5"), Color("3a2a1b"), Color("e8e2d0"), Color("c43c2a"),
	Color("7a5a38"), Color("46494f"), Color("f1d46b"), Color("ffffff"),
]
const METAL := 0
const DARK := 1
const WOOD := 2
const WILLOW := 3
const TAPE_RED := 4
const CARDBOARD := 5
const TAPE := 6
const GLASS := 7
const STEEL := 8
const DARK_WOOD := 9
const PAPER := 10
const LABEL := 11
const STICK := 12
const GREY := 13

static var _material: StandardMaterial3D = null
static var _texture: ImageTexture = null


## The one texture and material every prop shares (built on first use).
static func material() -> StandardMaterial3D:
	if _material == null:
		var img := Image.create(PALETTE.size(), 1, false, Image.FORMAT_RGBA8)
		for i in PALETTE.size():
			img.set_pixel(i, 0, PALETTE[i])
		_texture = ImageTexture.create_from_image(img)
		_material = StandardMaterial3D.new()
		_material.albedo_texture = _texture
		_material.texture_filter = BaseMaterial3D.TEXTURE_FILTER_NEAREST
		_material.roughness = 0.65
		_material.metallic = 0.0
		_material.resource_name = "LowPolyShared"
	return _material


static func texture() -> ImageTexture:
	material()
	return _texture


## Collects boxes and prisms into one ArrayMesh.
class Builder extends RefCounted:
	var verts: PackedVector3Array = PackedVector3Array()
	var normals: PackedVector3Array = PackedVector3Array()
	var uvs: PackedVector2Array = PackedVector2Array()
	var indices: PackedInt32Array = PackedInt32Array()

	func _uv(colour: int) -> Vector2:
		return Vector2((float(colour) + 0.5) / float(LowPoly.PALETTE.size()), 0.5)

	func _quad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, colour: int) -> void:
		var base := verts.size()
		for v: Vector3 in [a, b, c, d]:
			verts.append(v)
			normals.append(n)
			uvs.append(_uv(colour))
		# Godot's front faces wind clockwise.
		indices.append_array([base, base + 2, base + 1, base, base + 3, base + 2])

	## A box `w` x `h` x `d` centred on (x, y, z).
	func add_box(w: float, h: float, d: float, x: float, y: float, z: float, colour: int) -> void:
		var hx := w * 0.5
		var hy := h * 0.5
		var hz := d * 0.5
		var c := Vector3(x, y, z)
		# Corners counter-clockwise seen from outside (`_quad` reverses them).
		_quad(c + Vector3(-hx, -hy, hz), c + Vector3(hx, -hy, hz), c + Vector3(hx, hy, hz), c + Vector3(-hx, hy, hz), Vector3.BACK, colour)
		_quad(c + Vector3(hx, -hy, -hz), c + Vector3(-hx, -hy, -hz), c + Vector3(-hx, hy, -hz), c + Vector3(hx, hy, -hz), Vector3.FORWARD, colour)
		_quad(c + Vector3(hx, -hy, hz), c + Vector3(hx, -hy, -hz), c + Vector3(hx, hy, -hz), c + Vector3(hx, hy, hz), Vector3.RIGHT, colour)
		_quad(c + Vector3(-hx, -hy, -hz), c + Vector3(-hx, -hy, hz), c + Vector3(-hx, hy, hz), c + Vector3(-hx, hy, -hz), Vector3.LEFT, colour)
		_quad(c + Vector3(-hx, hy, hz), c + Vector3(hx, hy, hz), c + Vector3(hx, hy, -hz), c + Vector3(-hx, hy, -hz), Vector3.UP, colour)
		_quad(c + Vector3(-hx, -hy, -hz), c + Vector3(hx, -hy, -hz), c + Vector3(hx, -hy, hz), c + Vector3(-hx, -hy, hz), Vector3.DOWN, colour)

	## A round bar along +Z from `z0` (radius `r0`) to `z1` (radius `r1`), `sides` sides, about
	## (x, y); closed at both ends.
	func add_prism(r0: float, r1: float, z0: float, z1: float, x: float, y: float, sides: int, colour: int) -> void:
		for i in sides:
			var a0 := TAU * float(i) / float(sides)
			var a1 := TAU * float(i + 1) / float(sides)
			var d0 := Vector3(cos(a0), sin(a0), 0.0)
			var d1 := Vector3(cos(a1), sin(a1), 0.0)
			var o := Vector3(x, y, 0.0)
			var n := ((d0 + d1) * 0.5).normalized()
			_quad(o + d0 * r0 + Vector3(0, 0, z0), o + d1 * r0 + Vector3(0, 0, z0), o + d1 * r1 + Vector3(0, 0, z1), o + d0 * r1 + Vector3(0, 0, z1), n, colour)
			# End caps as triangles fanned from the axis.
			var back := verts.size()
			for v: Vector3 in [o + Vector3(0, 0, z0), o + d1 * r0 + Vector3(0, 0, z0), o + d0 * r0 + Vector3(0, 0, z0)]:
				verts.append(v)
				normals.append(Vector3.BACK * -1.0)
				uvs.append(_uv(colour))
			indices.append_array([back, back + 2, back + 1])
			var front := verts.size()
			for v: Vector3 in [o + Vector3(0, 0, z1), o + d0 * r1 + Vector3(0, 0, z1), o + d1 * r1 + Vector3(0, 0, z1)]:
				verts.append(v)
				normals.append(Vector3.BACK)
				uvs.append(_uv(colour))
			indices.append_array([front, front + 2, front + 1])

	func triangles() -> int:
		return indices.size() / 3

	func build() -> ArrayMesh:
		var arrays: Array = []
		arrays.resize(Mesh.ARRAY_MAX)
		arrays[Mesh.ARRAY_VERTEX] = verts
		arrays[Mesh.ARRAY_NORMAL] = normals
		arrays[Mesh.ARRAY_TEX_UV] = uvs
		arrays[Mesh.ARRAY_INDEX] = indices
		var mesh := ArrayMesh.new()
		mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
		mesh.surface_set_material(0, LowPoly.material())
		return mesh
