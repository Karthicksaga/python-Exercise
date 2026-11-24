class_name RoadModels
extends RefCounted
## The roadside models of G-310 to G-313, built once as MeshBuilders in their own frame (y up,
## standing on 0, colours linear, flat shaded like `CityModels`): the neem crown (the rain tree is
## the same mesh stretched wide and the palmyra the coconut palm stretched tall,
## `ChunkBuilder.SPECIES_SCALE`), median shrubs and tree guards. Original shapes.


## A flat-shaded squashed blob: an icosahedron (20 faces, or 80 when `fine`) of radius `r`,
## squashed to `squash` in y.
static func _lump(b: MeshBuilder, at: Vector3, r: float, squash: float, hex: int, fine: bool) -> void:
	var col := CityModels._lin(hex)
	for f: Array in (CityModels._icosphere() if fine else CityModels._icosahedron()):
		var pts: Array[Vector3] = []
		for k in 3:
			var v: Vector3 = f[k]
			pts.append(Vector3(v.x * r, v.y * r * squash, v.z * r) + at)
		# Light from above: the top faces a little brighter.
		var n := (pts[1] - pts[0]).cross(pts[2] - pts[0]).normalized()
		var shade := 0.85 + 0.2 * maxf(0.0, n.y)
		CityModels._tri(b, pts[0], pts[1], pts[2], Color(col.r * shade, col.g * shade, col.b * shade))


## Neem: a short trunk and a dense, rounded crown of overlapping lumps, about 8 m tall.
static func neem(b: MeshBuilder) -> void:
	var bark := CityModels._lin(0x5f4630)
	const SIDES := 6
	for s in SIDES:
		var a0 := TAU * s / SIDES
		var a1 := TAU * (s + 1) / SIDES
		CityModels._tri(b, Vector3(cos(a0) * 0.3, 0, sin(a0) * 0.3), Vector3(cos(a0) * 0.18, 3.6, sin(a0) * 0.18), Vector3(cos(a1) * 0.18, 3.6, sin(a1) * 0.18), bark)
		CityModels._tri(b, Vector3(cos(a0) * 0.3, 0, sin(a0) * 0.3), Vector3(cos(a1) * 0.18, 3.6, sin(a1) * 0.18), Vector3(cos(a1) * 0.3, 0, sin(a1) * 0.3), bark)
	_lump(b, Vector3(0, 5.2, 0), 2.5, 0.8, 0x2f7a3e, true)
	_lump(b, Vector3(1.4, 4.5, 0.6), 1.7, 0.8, 0x3a8744, false)
	_lump(b, Vector3(-1.3, 4.7, -0.7), 1.8, 0.8, 0x347f40, false)
	_lump(b, Vector3(0.3, 6.5, -0.2), 1.5, 0.8, 0x4a9a50, false)


## A median shrub: two squashed lobes, about 0.6 m wide and 0.5 m high. `hex` is the leaf or
## flower colour.
static func shrub(b: MeshBuilder, hex: int) -> void:
	_lump(b, Vector3(0, 0.22, 0), 0.34, 0.9, hex, false)
	_lump(b, Vector3(0.18, 0.3, 0.1), 0.22, 0.9, hex, false)


## A tree guard: four corner posts and a top rail, 1.1 m tall and 0.9 m across, dark green iron.
static func guard(b: MeshBuilder) -> void:
	const H := 1.1
	const W := 0.45
	for sx: float in [-1.0, 1.0]:
		for sz: float in [-1.0, 1.0]:
			CityModels.box(b, Vector3(sx * W - 0.025, 0, sz * W - 0.025), Vector3(sx * W + 0.025, H, sz * W + 0.025), 0x2c3d2e)
	for sgn: float in [-1.0, 1.0]:
		CityModels.box(b, Vector3(-W, H - 0.05, sgn * W - 0.02), Vector3(W, H, sgn * W + 0.02), 0x2c3d2e)
		CityModels.box(b, Vector3(sgn * W - 0.02, H - 0.05, -W), Vector3(sgn * W + 0.02, H, W), 0x2c3d2e)
		CityModels.box(b, Vector3(-W, 0.5, sgn * W - 0.015), Vector3(W, 0.55, sgn * W + 0.015), 0x2c3d2e)
		CityModels.box(b, Vector3(sgn * W - 0.015, 0.5, -W), Vector3(sgn * W + 0.015, 0.55, W), 0x2c3d2e)
