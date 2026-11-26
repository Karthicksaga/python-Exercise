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
	_lump(b, Vector3(0.3, 6.5, -0.2), 1.5, 0.8, 0x4a9a50, false)


## A median shrub: two squashed lobes, about 0.6 m wide and 0.5 m high. `hex` is the leaf or
## flower colour.
static func shrub(b: MeshBuilder, hex: int) -> void:
	_lump(b, Vector3(0, 0.22, 0), 0.36, 0.9, hex, false)


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


## A chevron board on a post: orange board with a dark chevron, facing -Z (the road), 0.8 m wide.
static func chevron(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.04, 0, -0.04), Vector3(0.04, 1.7, 0.04), 0x6c7074)
	CityModels.box(b, Vector3(-0.42, 1.1, -0.09), Vector3(0.42, 1.9, -0.04), 0xe2891b)
	CityModels.box(b, Vector3(-0.16, 1.28, -0.10), Vector3(0.0, 1.72, -0.085), 0x1c1b1d)
	CityModels.box(b, Vector3(0.0, 1.5, -0.10), Vector3(0.16, 1.72, -0.085), 0x1c1b1d)
	CityModels.box(b, Vector3(0.0, 1.28, -0.10), Vector3(0.16, 1.5, -0.085), 0x1c1b1d)


## A kilometre stone: a 0.7 m white post with a yellow top.
static func stone(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.17, 0, -0.08), Vector3(0.17, 0.55, 0.08), 0xe6e3d8)
	CityModels.box(b, Vector3(-0.17, 0.55, -0.08), Vector3(0.17, 0.72, 0.08), 0xd9a92a)


## Single-arm steel pole, dark maroon, 9 m, a curved arm of 2.5 m ending in a flat cobra-head lamp,
## on a concrete block; the lamp hangs over -Z (the road). `StreetFurniture.POLE_*` give the sizes.
static func arm_pole(b: MeshBuilder) -> void:
	var h := StreetFurniture.POLE_HEIGHT
	var s := StreetFurniture.POLE_HALF
	CityModels.box(b, Vector3(-0.3, 0, -0.3), Vector3(0.3, 0.45, 0.3), 0x9d9a92)
	CityModels.box(b, Vector3(-s, 0.45, -s), Vector3(s, h, s), 0x5a2a2c, s * 0.45)
	_arm(b, Vector3(0, h - 0.35, 0), Vector3(0, 0, -1), 2.5, 0x5a2a2c)


## A curved arm from `from` along `dir` (horizontal, unit) for `reach` metres, rising a little then
## dipping, with a flat cobra-head lamp at its end (an oval pad, pale underside).
static func _arm(b: MeshBuilder, from: Vector3, dir: Vector3, reach: float, hex: int) -> void:
	var prev := from
	for i in range(1, 5):
		var t := float(i) / 4.0
		var p := from + dir * reach * t + Vector3(0, 0.55 * sin(t * PI * 0.9), 0)
		var w := 0.055 - 0.002 * float(i % 2)
		var lo := Vector3(minf(prev.x, p.x) - w, minf(prev.y, p.y) - w, minf(prev.z, p.z) - w)
		var hi := Vector3(maxf(prev.x, p.x) + w, maxf(prev.y, p.y) + w, maxf(prev.z, p.z) + w)
		CityModels.box(b, lo, hi, hex)
		prev = p
	var end := prev
	var ex := 0.18 + absf(dir.x) * 0.3
	var ez := 0.2 + absf(dir.z) * 0.3
	CityModels.box(b, Vector3(end.x - ex, end.y - 0.12, end.z - ez), Vector3(end.x + ex, end.y + 0.06, end.z + ez), 0x4b4f53)
	CityModels.box(b, Vector3(end.x - ex * 0.8, end.y - 0.175, end.z - ez * 0.8), Vector3(end.x + ex * 0.8, end.y - 0.125, end.z + ez * 0.8), 0xf2f6ff)


## Thin rural pole: 7.5 m, light grey, a short arm of 1.2 m, a sign plate low on the shaft.
static func rural_pole(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.2, 0, -0.2), Vector3(0.2, 0.3, 0.2), 0x9d9a92)
	CityModels.box(b, Vector3(-0.085, 0.3, -0.085), Vector3(0.085, 7.5, 0.085), 0x8f9498, 0.02)
	CityModels.box(b, Vector3(-0.2, 2.3, -0.115), Vector3(0.2, 2.8, -0.086), 0xd9a92a)
	_arm(b, Vector3(0, 7.2, 0), Vector3(0, 0, -1), 1.2, 0x8f9498)


## Twin-arm median pole: straight maroon pole of 10 m with two curved arms in opposite directions
## (along +X and -X), oval lamp heads and thin stays.
static func twin_pole(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.28, 0, -0.28), Vector3(0.28, 0.4, 0.28), 0x9d9a92)
	CityModels.box(b, Vector3(-0.13, 0.4, -0.13), Vector3(0.13, 10.0, 0.13), 0x5a2a2c, 0.04)
	_arm(b, Vector3(0, 9.7, 0), Vector3(1, 0, 0), 2.2, 0x5a2a2c)
	_arm(b, Vector3(0, 9.7, 0), Vector3(-1, 0, 0), 2.2, 0x5a2a2c)
	for sgn: float in [-1.0, 1.0]:
		CityModels.box(b, Vector3(minf(0.0, sgn * 1.1) - 0.025, 9.0, -0.025), Vector3(maxf(0.0, sgn * 1.1) + 0.025, 9.7, 0.025), 0x2a2b2d)


## High mast: a 25 m grey pole with a ring platform carrying twelve flood-light panels in a circle.
static func high_mast(b: MeshBuilder) -> void:
	CityModels.box(b, Vector3(-0.5, 0, -0.5), Vector3(0.5, 0.8, 0.5), 0x9d9a92)
	CityModels.box(b, Vector3(-0.22, 0.8, -0.22), Vector3(0.22, 24.0, 0.22), 0xb4b6b4, 0.07)
	CityModels.box(b, Vector3(-1.9, 24.0, -1.9), Vector3(1.9, 24.15, 1.9), 0x6c7074)
	for k in 12:
		var a := TAU * k / 12.0
		var c := Vector3(cos(a) * 1.7, 24.5, sin(a) * 1.7)
		CityModels.box(b, c - Vector3(0.28, 0.0, 0.28), c + Vector3(0.28, 0.5, 0.28), 0x3c4044)
		CityModels.box(b, c - Vector3(0.22, -0.04, 0.22) + Vector3(cos(a), 0, sin(a)) * 0.10, c + Vector3(0.22, 0.45, 0.22) + Vector3(cos(a), 0, sin(a)) * 0.10, 0xf2f6ff)
