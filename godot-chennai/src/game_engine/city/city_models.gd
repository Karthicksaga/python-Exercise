class_name CityModels
extends RefCounted
## The small models every chunk repeats, as MeshBuilders in their own frame (built once, then
## read-only, so chunk builds on worker threads can copy them): street-light pole and bus
## shelter (`StreetFurniture.ts`, invented designs), the neem-like tree and the coconut palm
## (`ChunkView.ts`), and the Blender street props (`assets/props/*.glb`, baked to vertex colours
## like `StreetProps.ts`). Colours linear.

## Prop model name -> GLB.
const PROP_FILES: Dictionary[StringName, String] = {
	&"handcart": "res://assets/props/handcart.glb",
	&"crates": "res://assets/props/crates.glb",
	&"barrel": "res://assets/props/barrel.glb",
	&"clay_pots": "res://assets/props/clay_pots.glb",
	&"ac_unit": "res://assets/props/ac_unit.glb",
	&"dish": "res://assets/props/dish_antenna.glb",
}
## Wall fixtures keep their back at z = 0 and face +Z; the rest are centred on their footprint.
const WALL_MOUNTED: Array[StringName] = [&"ac_unit", &"dish"]
const DARK_U := 0.25

var pole := MeshBuilder.new()
var shelter := MeshBuilder.new()
var tree := MeshBuilder.new()
var palm := MeshBuilder.new()
## Prop name -> MeshBuilder (empty when its GLB is missing).
var props: Dictionary[StringName, MeshBuilder] = {}
## Mapped street objects (G-191).
var detail: DetailModels = null
## Prop name -> bounds after baking (min y = 0).
var prop_bounds: Dictionary[StringName, AABB] = {}
var error: String = ""


## Builds the procedural models and bakes the prop GLBs (call where `load` may block: a worker
## thread or a loading step).
static func create(with_props: bool = true) -> CityModels:
	var m := CityModels.new()
	m._build_pole()
	m._build_shelter()
	m._build_tree()
	m._build_palm()
	m.detail = DetailModels.create()
	if with_props:
		for name in PROP_FILES:
			m._bake_prop(name, PROP_FILES[name])
	return m


static func _lin(hex: int) -> Color:
	return BuildingMeshes.lin(hex)


## A box from a to b; the top face may be narrower (`taper`), for a tapered pole.
static func box(b: MeshBuilder, lo: Vector3, hi: Vector3, hex: int, taper: float = 0.0) -> void:
	var c := _lin(hex)
	var mid := (lo + hi) * 0.5
	var corner := func(x: float, y: float, z: float) -> Vector3:
		if y != hi.y or taper == 0.0:
			return Vector3(x, y, z)
		return Vector3(x + (taper if x < mid.x else -taper), y, z + (taper if z < mid.z else -taper))
	var face := func(pts: Array, n: Vector3, shade: float) -> void:
		var ids: Array[int] = []
		for p: Vector3 in pts:
			ids.append(b.vertex(corner.call(p.x, p.y, p.z), n, Vector2(DARK_U, 0.5), Color(c.r * shade, c.g * shade, c.b * shade)))
		b.quad(ids[0], ids[1], ids[2], ids[3])
	var x0 := lo.x
	var y0 := lo.y
	var z0 := lo.z
	var x1 := hi.x
	var y1 := hi.y
	var z1 := hi.z
	face.call([Vector3(x0, y1, z0), Vector3(x0, y1, z1), Vector3(x1, y1, z1), Vector3(x1, y1, z0)], Vector3.UP, 1.0)
	face.call([Vector3(x0, y0, z0), Vector3(x1, y0, z0), Vector3(x1, y0, z1), Vector3(x0, y0, z1)], Vector3.DOWN, 0.7)
	face.call([Vector3(x0, y0, z1), Vector3(x1, y0, z1), Vector3(x1, y1, z1), Vector3(x0, y1, z1)], Vector3.BACK, 0.92)
	face.call([Vector3(x1, y0, z0), Vector3(x0, y0, z0), Vector3(x0, y1, z0), Vector3(x1, y1, z0)], Vector3.FORWARD, 0.92)
	face.call([Vector3(x1, y0, z1), Vector3(x1, y0, z0), Vector3(x1, y1, z0), Vector3(x1, y1, z1)], Vector3.RIGHT, 0.85)
	face.call([Vector3(x0, y0, z0), Vector3(x0, y0, z1), Vector3(x0, y1, z1), Vector3(x0, y1, z0)], Vector3.LEFT, 0.85)


## A concrete street-light pole: tapered shaft, cross-arm with insulators, lamp over the road (-Z).
func _build_pole() -> void:
	var s := StreetFurniture.POLE_HALF
	var top := StreetFurniture.POLE_HEIGHT
	var arm := StreetFurniture.POLE_ARM
	box(pole, Vector3(-s, 0, -s), Vector3(s, top, s), 0xa8a59b, s * 0.4)
	box(pole, Vector3(-0.7, top - 0.9, -0.06), Vector3(0.7, top - 0.78, 0.06), 0x8a877e)
	for x: float in [-0.6, 0.0, 0.6]:
		box(pole, Vector3(x - 0.04, top - 0.78, -0.04), Vector3(x + 0.04, top - 0.62, 0.04), 0xd8d4c8)
	box(pole, Vector3(-0.04, top - 0.45, -arm), Vector3(0.04, top - 0.37, 0), 0x6c7074)
	box(pole, Vector3(-0.17, top - 0.56, -arm - 0.7), Vector3(0.17, top - 0.4, -arm + 0.1), 0x505458)
	box(pole, Vector3(-0.15, top - 0.6, -arm - 0.66), Vector3(0.15, top - 0.56, -arm + 0.06), 0xfff1d0)


## A simple bus shelter: four posts, roof slab, back panel, bench, blank route board; open
## front towards -Z (the road).
func _build_shelter() -> void:
	var w := StreetFurniture.SHELTER_WIDTH / 2.0
	var d := StreetFurniture.SHELTER_DEPTH / 2.0
	var h := StreetFurniture.SHELTER_HEIGHT
	for x: float in [-w + 0.1, w - 0.1]:
		for z: float in [-d + 0.1, d - 0.1]:
			box(shelter, Vector3(x - 0.05, 0, z - 0.05), Vector3(x + 0.05, h - 0.1, z + 0.05), 0x8d9399)
	box(shelter, Vector3(-w - 0.15, h - 0.1, -d - 0.2), Vector3(w + 0.15, h, d + 0.05), 0x2f5f86)
	box(shelter, Vector3(-w + 0.12, 0.35, d - 0.12), Vector3(w - 0.12, h - 0.25, d - 0.07), 0xc6cbc6)
	box(shelter, Vector3(-w + 0.4, 0.42, d - 0.55), Vector3(w - 0.4, 0.48, d - 0.15), 0x6f757a)
	for x: float in [-w + 0.6, w - 0.6]:
		box(shelter, Vector3(x - 0.04, 0, d - 0.4), Vector3(x + 0.04, 0.42, d - 0.3), 0x55595c)
	box(shelter, Vector3(-0.8, h, -d - 0.17), Vector3(0.8, h + 0.38, -d - 0.12), 0x1f5aa6)


## Adds a flat-shaded triangle (own vertices, face normal), counter-clockwise from the front.
static func _tri(b: MeshBuilder, p0: Vector3, p1: Vector3, p2: Vector3, c: Color, uv := Vector2(DARK_U, 0.5)) -> void:
	var n := (p1 - p0).cross(p2 - p0).normalized()
	b.triangle(b.vertex(p0, n, uv, c), b.vertex(p1, n, uv, c), b.vertex(p2, n, uv, c))


## A leafy tree about 7 m tall: a six-sided trunk and a flat-shaded icosphere crown.
func _build_tree() -> void:
	var bark := _lin(0x6b4a2f)
	const SIDES := 6
	for s in SIDES:
		var a0 := TAU * s / SIDES
		var a1 := TAU * (s + 1) / SIDES
		var b0 := Vector3(cos(a0) * 0.26, 0, sin(a0) * 0.26)
		var b1 := Vector3(cos(a1) * 0.26, 0, sin(a1) * 0.26)
		var t0 := Vector3(cos(a0) * 0.16, 4, sin(a0) * 0.16)
		var t1 := Vector3(cos(a1) * 0.16, 4, sin(a1) * 0.16)
		_tri(tree, b0, t0, t1, bark)
		_tri(tree, b0, t1, b1, bark)
	var leaf := _lin(0x3f8f4a)
	for f: Array in _icosphere():
		var p0: Vector3 = f[0] * 2.3
		var p1: Vector3 = f[1] * 2.3
		var p2: Vector3 = f[2] * 2.3
		var lift := Vector3(0, 5.1, 0)
		_tri(tree, Vector3(p0.x, p0.y * 0.75, p0.z) + lift, Vector3(p1.x, p1.y * 0.75, p1.z) + lift, Vector3(p2.x, p2.y * 0.75, p2.z) + lift, leaf)


## Unit icosahedron subdivided once (80 faces), each face counter-clockwise seen from outside.
static func _icosphere() -> Array:
	var t := (1.0 + sqrt(5.0)) / 2.0
	var v: Array[Vector3] = []
	for p: Vector3 in [Vector3(-1, t, 0), Vector3(1, t, 0), Vector3(-1, -t, 0), Vector3(1, -t, 0), Vector3(0, -1, t), Vector3(0, 1, t), Vector3(0, -1, -t), Vector3(0, 1, -t), Vector3(t, 0, -1), Vector3(t, 0, 1), Vector3(-t, 0, -1), Vector3(-t, 0, 1)]:
		v.append(p.normalized())
	var faces := [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]]
	var out := []
	for f: Array in faces:
		var a := v[f[0]]
		var b := v[f[1]]
		var c := v[f[2]]
		var ab := ((a + b) * 0.5).normalized()
		var bc := ((b + c) * 0.5).normalized()
		var ca := ((c + a) * 0.5).normalized()
		for tri: Array in [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]]:
			var t0: Vector3 = tri[0]
			var t1: Vector3 = tri[1]
			var t2: Vector3 = tri[2]
			# Wind every face counter-clockwise seen from outside.
			if (t1 - t0).cross(t2 - t0).dot(t0) < 0.0:
				out.append([t0, t2, t1])
			else:
				out.append(tri)
	return out


## A coconut palm about 8 m tall (`palmGeometry`): curving six-sided trunk, nine drooping fronds.
func _build_palm() -> void:
	const HEIGHT := 7.2
	const RINGS := 5
	const SIDES := 6
	var bend := func(y: float) -> float: return 0.55 * pow(y / HEIGHT, 2.0)
	var ring := func(k: int) -> Array[Vector3]:
		var y := float(k) / (RINGS - 1) * HEIGHT
		var radius := 0.24 - 0.09 * (float(k) / (RINGS - 1))
		var out: Array[Vector3] = []
		for s in SIDES:
			var angle := TAU * s / SIDES
			out.append(Vector3(bend.call(y) + cos(angle) * radius, y, sin(angle) * radius))
		return out
	for k in RINGS - 1:
		var lower: Array[Vector3] = ring.call(k)
		var upper: Array[Vector3] = ring.call(k + 1)
		var bark := _lin(0x7f6c57 if k % 2 == 0 else 0x736250)
		for s in SIDES:
			var t := (s + 1) % SIDES
			_tri(palm, lower[s], upper[s], upper[t], bark)
			_tri(palm, lower[s], upper[t], lower[t], bark)
	var top := Vector3(bend.call(HEIGHT), HEIGHT, 0)
	const FRONDS := 9
	const SEGMENTS := 4
	for f in FRONDS:
		var angle := TAU * f / FRONDS + (f % 3) * 0.21
		var dx := cos(angle)
		var dz := sin(angle)
		var length := 3.1 + (f % 2) * 0.5
		var spine: Array[Vector3] = []
		var left: Array[Vector3] = []
		var right: Array[Vector3] = []
		for i in SEGMENTS + 1:
			var t := float(i) / SEGMENTS
			var reach := length * t
			var p := Vector3(top.x + dx * reach, top.y + 0.7 * t - 2.1 * t * t, top.z + dz * reach)
			var width := 0.6 * sin(PI * (0.12 + 0.88 * t))
			spine.append(p)
			left.append(Vector3(p.x - dz * width, p.y - width * 0.35, p.z + dx * width))
			right.append(Vector3(p.x + dz * width, p.y - width * 0.35, p.z - dx * width))
		for i in SEGMENTS:
			var leaf := _lin(0x3f7a2e if i < SEGMENTS - 1 else 0x6f9436)
			_tri(palm, spine[i], left[i], left[i + 1], leaf)
			_tri(palm, spine[i], left[i + 1], spine[i + 1], leaf)
			_tri(palm, spine[i], spine[i + 1], right[i + 1], leaf)
			_tri(palm, spine[i], right[i + 1], right[i], leaf)


## Bakes one GLB: transforms applied, material colours into vertex colours, standing on y = 0.
func _bake_prop(name: StringName, path: String) -> void:
	var b := MeshBuilder.new()
	props[name] = b
	var scene := load(path) as PackedScene
	if scene == null:
		error = "Prop model %s could not be read." % path
		return
	var root := scene.instantiate()
	var stack: Array = [[root, Transform3D.IDENTITY]]
	while not stack.is_empty():
		var entry: Array = stack.pop_back()
		var node: Node = entry[0]
		var xform: Transform3D = entry[1]
		var n3 := node as Node3D
		if n3 != null:
			xform = xform * n3.transform
		var mi := node as MeshInstance3D
		if mi != null and mi.mesh != null:
			for s in mi.mesh.get_surface_count():
				var arrays := mi.mesh.surface_get_arrays(s)
				var mat := mi.get_active_material(s) as BaseMaterial3D
				var colour := mat.albedo_color.srgb_to_linear() if mat != null else Color.WHITE
				var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
				var norms: PackedVector3Array = arrays[Mesh.ARRAY_NORMAL]
				var index: PackedInt32Array = arrays[Mesh.ARRAY_INDEX] if arrays[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
				var base := b.vertex_count()
				for v in verts.size():
					b.positions.append(xform * verts[v])
					b.normals.append((xform.basis * norms[v]).normalized() if v < norms.size() else Vector3.UP)
					b.uvs.append(Vector2(DARK_U, 0.5))
					b.uv2s.append(Vector2.ZERO)
					b.colors.append(colour)
				if index.is_empty():
					for v in verts.size():
						b.indices.append(base + v)
				else:
					# Godot's arrays are already clockwise-front; copy as they are.
					for i in index:
						b.indices.append(base + i)
		for child in node.get_children():
			stack.append([child, xform])
	root.free()
	var box := AABB()
	for i in b.positions.size():
		box = AABB(b.positions[i], Vector3.ZERO) if i == 0 else box.expand(b.positions[i])
	var centred := not WALL_MOUNTED.has(name)
	var shift := Vector3((box.position.x + box.end.x) / 2.0 if centred else 0.0, box.position.y, (box.position.z + box.end.z) / 2.0 if centred else 0.0)
	for i in b.positions.size():
		b.positions[i] -= shift
	prop_bounds[name] = AABB(box.position - shift, box.size)


## Copies `model` into `into`, turned by yaw about +Y and moved to `at` (local metres).
static func place(into: MeshBuilder, model: MeshBuilder, at: Vector3, yaw: float, tint: Color = Color.WHITE) -> void:
	into.append(model, Transform3D(Basis(Vector3.UP, yaw), at), tint)
