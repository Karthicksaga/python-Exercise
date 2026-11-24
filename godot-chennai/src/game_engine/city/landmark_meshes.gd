class_name LandmarkMeshes
extends RefCounted
## Landmark models (`LandmarkView.ts`), one merged vertex-coloured mesh each, always loaded
## because they are seen from far away. Original and procedural, inspired by the general form:
## Anna Nagar Tower (stepped plinth, drum, shaft, stacked circular viewing levels, canopy and
## finial) and Kapaleeshwarar Temple's gopuram (stone base with the passage, painted tapering
## tiers with ledges, pilasters and niches, barrel-vaulted crown, gold finials). Colours invented.
## Proportions from `LandmarkProfiles`, shared with the collision.

const SEGMENTS := 24
const PLINTH := 0xd9d0bf
const STEP := 0xcfc5b2
const CREAM := 0xf0e7d2
const WHITE := 0xf8f5ec
const ACCENT := 0xa9654f
const OPENING := 0x3b3a38
const RAIL := 0x7d7a72
const STONE := 0x9a968c
const STONE_DARK := 0x7d796f
const STONE_LIGHT := 0xb2ada1
const SHADOW := 0x2f2b27
const LEDGE := 0xf3ead6
const GOLD := 0xd9a531
const VAULT := 0xc8553d
const TIERS: Array = [[0xe0b25a, 0xf4e3b8], [0x5f9fb8, 0xe9f0f0], [0xc96f5a, 0xf3d7bf], [0x7fae6e, 0xf0eccd], [0xd88fa0, 0xf6e6e0], [0x4f8f8a, 0xf2e2b0], [0xe7c27a, 0xc96f5a]]
const KALASAM: Array[Vector2] = [Vector2(0, 0), Vector2(0.32, 0.04), Vector2(0.4, 0.22), Vector2(0.3, 0.42), Vector2(0.12, 0.52), Vector2(0.2, 0.62), Vector2(0.06, 0.86), Vector2(0, 1)]

var mesh := MeshBuilder.new()


static func _c(hex: int) -> Color:
	return BuildingMeshes.lin(hex)


## A frustum standing on `bottom` around (x, z), `top_radius` at the top; closed caps unless open.
func drum(radius: float, bottom: float, top: float, hex: int, open: bool = false, top_radius: float = -1.0, sides: int = SEGMENTS, at: Vector2 = Vector2.ZERO) -> void:
	var tr := radius if top_radius < 0.0 else top_radius
	var c := _c(hex)
	var slope := (radius - tr) / maxf(0.001, top - bottom)
	for s in sides:
		var a0 := TAU * s / sides
		var a1 := TAU * (s + 1) / sides
		var n0 := Vector3(cos(a0), slope, sin(a0)).normalized()
		var n1 := Vector3(cos(a1), slope, sin(a1)).normalized()
		var i0 := mesh.vertex(Vector3(at.x + cos(a0) * radius, bottom, at.y + sin(a0) * radius), n0, Vector2.ZERO, c)
		var i1 := mesh.vertex(Vector3(at.x + cos(a1) * radius, bottom, at.y + sin(a1) * radius), n1, Vector2.ZERO, c)
		var i2 := mesh.vertex(Vector3(at.x + cos(a1) * tr, top, at.y + sin(a1) * tr), n1, Vector2.ZERO, c)
		var i3 := mesh.vertex(Vector3(at.x + cos(a0) * tr, top, at.y + sin(a0) * tr), n0, Vector2.ZERO, c)
		mesh.quad(i0, i3, i2, i1)
	if open:
		return
	for cap: Array in [[top, tr, Vector3.UP], [bottom, radius, Vector3.DOWN]]:
		var y: float = cap[0]
		var r: float = cap[1]
		var n: Vector3 = cap[2]
		var centre := mesh.vertex(Vector3(at.x, y, at.y), n, Vector2.ZERO, c)
		var rim: Array[int] = []
		for s in sides:
			var a := TAU * s / sides
			rim.append(mesh.vertex(Vector3(at.x + cos(a) * r, y, at.y + sin(a) * r), n, Vector2.ZERO, c))
		for s in sides:
			if n.y > 0.0:
				mesh.triangle(centre, rim[(s + 1) % sides], rim[s])
			else:
				mesh.triangle(centre, rim[s], rim[(s + 1) % sides])


## A box with half-sizes (hx, hz) tapering to (hx1, hz1) at the top, centred on (x, z), turned
## by yaw, standing on y0 and `height` tall.
func tapered(hx0: float, hx1: float, hz0: float, hz1: float, y0: float, height: float, hex: int, centre: Vector3 = Vector3.ZERO, yaw: float = 0.0) -> void:
	var c := _c(hex)
	var basis := Basis(Vector3.UP, yaw)
	var lo: Array[Vector3] = [Vector3(-hx0, 0, -hz0), Vector3(hx0, 0, -hz0), Vector3(hx0, 0, hz0), Vector3(-hx0, 0, hz0)]
	var hi: Array[Vector3] = [Vector3(-hx1, height, -hz1), Vector3(hx1, height, -hz1), Vector3(hx1, height, hz1), Vector3(-hx1, height, hz1)]
	var off := centre + Vector3(0, y0, 0)
	var quad := func(p: Array[Vector3]) -> void:
		var q: Array[Vector3] = []
		for v in p:
			q.append(basis * v + off)
		var n := (q[1] - q[0]).cross(q[2] - q[0]).normalized()
		var mid := (q[0] + q[1] + q[2] + q[3]) / 4.0
		var ids: Array[int] = []
		for v in q:
			ids.append(mesh.vertex(v, n, Vector2.ZERO, c))
		# Outward from the box's centre line.
		if n.dot(mid - (off + Vector3(0, height / 2.0, 0))) >= 0.0:
			mesh.quad(ids[0], ids[1], ids[2], ids[3])
		else:
			for k in 4:
				mesh.normals[ids[k]] = -n
			mesh.quad(ids[0], ids[3], ids[2], ids[1])
	for i in 4:
		var j := (i + 1) % 4
		quad.call([lo[i], lo[j], hi[j], hi[i]] as Array[Vector3])
	quad.call([hi[0], hi[1], hi[2], hi[3]] as Array[Vector3])
	quad.call([lo[0], lo[3], lo[2], lo[1]] as Array[Vector3])


## A plain box of full sizes centred at `centre` (y is the centre height).
func cube(size: Vector3, hex: int, centre: Vector3, yaw: float = 0.0) -> void:
	tapered(size.x / 2.0, size.x / 2.0, size.z / 2.0, size.z / 2.0, centre.y - size.y / 2.0, size.y, hex, Vector3(centre.x, 0, centre.z), yaw)


## `count` boxes round a circle, each turned to face outwards.
func around_boxes(count: int, radius: float, size: Vector3, hex: int, y: float, offset: float = 0.0) -> void:
	for i in count:
		var angle := offset + TAU * i / count
		cube(size, hex, Vector3(cos(angle) * radius, y, sin(angle) * radius), PI / 2.0 - angle)


## A lathe (surface of revolution) from a radius-height profile.
func lathe(profile: Array[Vector2], scale: Vector3, at: Vector3, hex: int, sides: int = 8) -> void:
	var c := _c(hex)
	for k in profile.size() - 1:
		for s in sides:
			var a0 := TAU * s / sides
			var a1 := TAU * (s + 1) / sides
			var p := func(pt: Vector2, a: float) -> Vector3: return at + Vector3(cos(a) * pt.x * scale.x, pt.y * scale.y, sin(a) * pt.x * scale.z)
			var v0: Vector3 = p.call(profile[k], a0)
			var v1: Vector3 = p.call(profile[k], a1)
			var v2: Vector3 = p.call(profile[k + 1], a1)
			var v3: Vector3 = p.call(profile[k + 1], a0)
			var mid := (a0 + a1) * 0.5
			var n := Vector3(cos(mid), 0.3, sin(mid)).normalized()
			mesh.quad(mesh.vertex(v0, n, Vector2.ZERO, c), mesh.vertex(v3, n, Vector2.ZERO, c), mesh.vertex(v2, n, Vector2.ZERO, c), mesh.vertex(v1, n, Vector2.ZERO, c))


static func _spread(count: int, half: float, margin: float) -> Array[float]:
	var out: Array[float] = []
	for i in count:
		out.append(0.0 if count == 1 else -half + margin + (2.0 * (half - margin)) / (count - 1) * i)
	return out


static func tower(profile: Dictionary) -> LandmarkMeshes:
	var m := LandmarkMeshes.new()
	var steps: Array[Vector2] = profile["steps"]
	var drum_p: Vector2 = profile["drum"]
	var shaft: Vector2 = profile["shaft"]
	var levels: Array[Vector2] = profile["levels"]
	var canopy: Vector3 = profile["canopy"]
	var height: float = profile["height"]
	for i in steps.size():
		m.drum(steps[i].x, 0.0, steps[i].y, STEP if i % 2 else PLINTH)
	var plinth_top := steps[steps.size() - 1].y
	m.drum(drum_p.x, plinth_top, drum_p.y, CREAM)
	m.drum(drum_p.x + 0.18, drum_p.y - 0.55, drum_p.y, ACCENT, true)
	m.drum(drum_p.x + 0.4, drum_p.y, drum_p.y + 0.22, WHITE)
	m.around_boxes(4, drum_p.x - 0.08, Vector3(1.5, 2.6, 0.3), OPENING, plinth_top + 1.3, PI / 4.0)
	m.drum(shaft.x, drum_p.y, canopy.x, CREAM, true, shaft.x * 0.9)
	var shaft_height := canopy.x - drum_p.y - 2.0
	m.around_boxes(3, shaft.x * 0.93, Vector3(0.45, shaft_height, 0.25), OPENING, drum_p.y + 1.0 + shaft_height / 2.0, PI / 6.0)
	var column_radius := (levels[levels.size() - 1].y if not levels.is_empty() else shaft.x + 1.0) - 0.45
	for i in 6:
		var a := TAU * i / 6.0
		m.drum(0.2, drum_p.y, canopy.x, WHITE, true, -1.0, 6, Vector2(cos(a), sin(a)) * column_radius)
	for level in levels:
		var r := level.y
		m.drum(r, level.x - 0.28, level.x, WHITE)
		m.drum(r + 0.03, level.x - 0.2, level.x - 0.06, ACCENT, true)
		m.drum(r - 0.06, level.x, level.x + 0.45, CREAM, true)
		m.around_boxes(12, r - 0.06, Vector3(0.07, 0.55, 0.07), RAIL, level.x + 0.72)
		m.drum(r - 0.05, level.x + 0.98, level.x + 1.06, RAIL, true)
	m.drum(canopy.z, canopy.x, canopy.x + 0.4, WHITE)
	m.drum(canopy.z + 0.05, canopy.x + 0.4, canopy.x + 0.62, ACCENT, true)
	# A shallow dome: four rings closing to the top.
	var dome_h := canopy.y - canopy.x - 0.62
	for k in 4:
		var a0 := PI / 2.0 * k / 4.0
		var a1 := PI / 2.0 * (k + 1) / 4.0
		m.drum(canopy.z * cos(a0), canopy.x + 0.62 + dome_h * sin(a0), canopy.x + 0.62 + dome_h * sin(a1), ACCENT, k < 3, canopy.z * cos(a1) if k < 3 else 0.01)
	m.drum(0.9, canopy.y - 0.2, canopy.y + 0.5, CREAM, false, 0.9, 12)
	m.drum(0.32, canopy.y + 0.5, height, WHITE, false, 0.0, 8)
	return m


static func gopuram(profile: Dictionary) -> LandmarkMeshes:
	var m := LandmarkMeshes.new()
	var base: Dictionary = profile["base"]
	var passage: Vector2 = profile["passage"]
	var tiers: Array[Dictionary] = profile["tiers"]
	var vault: Dictionary = profile["vault"]
	var height: float = profile["height"]
	var hx: float = base["hx0"]
	var hz: float = base["hz0"]
	var top: float = base["top"]
	var pier := (hz - passage.x) / 2.0
	var plinth := minf(0.7, top * 0.1)
	var cornice := minf(0.6, top * 0.08)
	var wall := top - plinth - cornice
	for side: float in [-1.0, 1.0]:
		var z := side * (passage.x + pier)
		m.cube(Vector3(2 * hx, plinth, 2 * pier), STONE_DARK, Vector3(0, plinth / 2.0, z))
		m.cube(Vector3(2 * hx - 0.4, wall, 2 * pier - 0.2), STONE, Vector3(0, plinth + wall / 2.0, z - side * 0.1))
		for face: float in [-1.0, 1.0]:
			for o in _spread(3, pier, 0.6):
				m.cube(Vector3(0.2, wall, 0.55), STONE_LIGHT, Vector3(face * (hx - 0.1), plinth + wall / 2.0, z + o))
	m.cube(Vector3(2 * hx - 0.4, top - cornice - passage.y, 2 * passage.x), STONE, Vector3(0, (passage.y + top - cornice) / 2.0, 0))
	m.cube(Vector3(2 * hx, cornice, 2 * hz), STONE_LIGHT, Vector3(0, top - cornice / 2.0, 0))
	for face: float in [-1.0, 1.0]:
		m.cube(Vector3(0.12, 0.35, 2 * passage.x + 0.5), SHADOW, Vector3(face * (hx - 0.15), passage.y + 0.18, 0))
	for i in tiers.size():
		var t := tiers[i]
		var colours: Array = TIERS[i % TIERS.size()]
		var bottom: float = t["bottom"]
		var rise: float = float(t["top"]) - bottom
		var ledge := minf(0.35, rise * 0.12)
		m.tapered(t["hx0"], t["hx1"], t["hz0"], t["hz1"], bottom, rise - ledge, colours[0])
		m.cube(Vector3(2 * float(t["hx1"]) + 0.3, ledge, 2 * float(t["hz1"]) + 0.3), LEDGE, Vector3(0, float(t["top"]) - ledge / 2.0, 0))
		var mid_x := (float(t["hx0"]) + float(t["hx1"])) / 2.0
		var mid_z := (float(t["hz0"]) + float(t["hz1"])) / 2.0
		var y := bottom + (rise - ledge) / 2.0
		var tall := (rise - ledge) * 0.6
		var zs := _spread(maxi(3, roundi(mid_z / 1.3)), mid_z, 0.5)
		var xs := _spread(maxi(2, roundi(mid_x / 1.6)), mid_x, 0.5)
		for face: float in [-1.0, 1.0]:
			for k in zs.size():
				m.cube(Vector3(0.3, tall, 0.35), colours[1], Vector3(face * mid_x, y, zs[k]))
				if k + 1 < zs.size():
					m.cube(Vector3(0.12, tall * 0.7, (zs[k + 1] - zs[k]) * 0.45), SHADOW, Vector3(face * (mid_x + 0.02), y, (zs[k] + zs[k + 1]) / 2.0))
			for x in xs:
				m.cube(Vector3(0.35, tall, 0.3), colours[1], Vector3(x, y, face * mid_z))
	# Crown: a barrel vault along z (half-cylinder with closed ends).
	var vb: float = vault["bottom"]
	var vt: float = vault["top"]
	var vhx: float = vault["hx"]
	var vhz: float = vault["hz"]
	var c := _c(VAULT)
	const ARC := 12
	for k in ARC:
		var a0 := PI * k / ARC
		var a1 := PI * (k + 1) / ARC
		var p0 := Vector2(cos(a0) * vhx, sin(a0) * (vt - vb))
		var p1 := Vector2(cos(a1) * vhx, sin(a1) * (vt - vb))
		var n := Vector3(cos((a0 + a1) / 2.0), sin((a0 + a1) / 2.0), 0).normalized()
		var i0 := m.mesh.vertex(Vector3(p0.x, vb + p0.y, -vhz), n, Vector2.ZERO, c)
		var i1 := m.mesh.vertex(Vector3(p1.x, vb + p1.y, -vhz), n, Vector2.ZERO, c)
		var i2 := m.mesh.vertex(Vector3(p1.x, vb + p1.y, vhz), n, Vector2.ZERO, c)
		var i3 := m.mesh.vertex(Vector3(p0.x, vb + p0.y, vhz), n, Vector2.ZERO, c)
		m.mesh.quad(i0, i1, i2, i3)
		for end: float in [-1.0, 1.0]:
			var en := Vector3(0, 0, end)
			var e0 := m.mesh.vertex(Vector3(0, vb, end * vhz), en, Vector2.ZERO, c)
			var e1 := m.mesh.vertex(Vector3(p0.x, vb + p0.y, end * vhz), en, Vector2.ZERO, c)
			var e2 := m.mesh.vertex(Vector3(p1.x, vb + p1.y, end * vhz), en, Vector2.ZERO, c)
			if end > 0.0:
				m.mesh.triangle(e0, e1, e2)
			else:
				m.mesh.triangle(e0, e2, e1)
	var sink := 0.05
	var finial := height - vt + sink
	for z in _spread(int(profile["finials"]), vhz, minf(1.0, vhz * 0.25)):
		m.lathe(KALASAM, Vector3(finial * 0.75, finial, finial * 0.75), Vector3(0, vt - sink, z), GOLD)
	return m
