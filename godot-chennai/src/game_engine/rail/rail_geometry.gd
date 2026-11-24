class_name RailGeometry
extends RefCounted
## Builds one chunk of railway as merged meshes on a worker thread (G-325): ballast with the
## sleeper texture, two rails per track, the MRTS viaduct deck and piers, and (a separate mesh
## shown only near, off on Low) the overhead line: masts, cantilevers, contact and catenary
## wires. Everything shares `RailMaterials.track` (vertex colours), so a chunk's track is one
## draw call and its overhead line another. No lights, no per-object nodes.
##
## Heights (estimated): ballast top 0.15 m, rail top RAIL_TOP above the formation; contact wire
## 5.5 m above the rail, catenary 6.9 m; masts every 60 m along each running line.

const BALLAST_TOP := 0.15
const RAIL_TOP := 0.3
## Half the gauge (1,676 mm broad gauge) to the rail's centre, metres.
const RAIL_HALF := 0.8375
const RAIL_HEAD := 0.075
const MAST_EVERY := 60.0
const MAST_OFFSET := 3.0
const MAST_HEIGHT := 8.2
const CONTACT := 5.5
const CATENARY := 6.9
## Viaduct (estimated): deck width and depth, pier spacing.
const DECK_WIDTH := 5.2
const DECK_DEPTH := 1.3
const PIER_EVERY := 30.0
## Ballast is left out this close to a level crossing (the road runs over the rails there).
const CROSSING_CLEAR := 5.0

const BALLAST := Color(1, 1, 1)
const STEEL := Color(0.52, 0.52, 0.55)
const RAIL_SHINE := Color(0.78, 0.78, 0.8)
const CONCRETE := Color(0.72, 0.70, 0.66)
const MAST := Color(0.48, 0.5, 0.5)
const WIRE := Color(0.18, 0.16, 0.14)


## What a chunk build gives the view.
class Built:
	extends RefCounted
	var cell: Vector2i
	var centre: Vector2
	var track: ArrayMesh = null
	var ohe: ArrayMesh = null
	## Solid faces (the viaduct deck), local to the centre.
	var faces: PackedVector3Array = PackedVector3Array()
	var triangles: int = 0
	var ohe_triangles: int = 0


static func build(index: RailIndex, cell: Vector2i, material: Material, with_ohe: bool) -> Built:
	var out := Built.new()
	out.cell = cell
	out.centre = index.cell_centre(cell)
	var mb := MeshBuilder.new()
	var wires := MeshBuilder.new()
	var crossings: PackedVector2Array = index.crossings.get(cell, PackedVector2Array())
	for item: Variant in index.pieces.get(cell, []) as Array:
		var piece := item as RailIndex.Piece
		var elevated := piece.kind == "elevated"
		var left := _lefts(piece.points)
		if elevated:
			_viaduct(mb, piece, left, out.centre, out.faces)
		else:
			_ballast(mb, piece, left, out.centre, crossings, 3.0 if piece.kind == "main" else 2.6)
		_rails(mb, piece, left, out.centre)
		if with_ohe and piece.kind != "service":
			_ohe(wires, piece, left, out.centre, index)
	out.triangles = mb.triangle_count()
	out.ohe_triangles = wires.triangle_count()
	out.track = mb.commit(material)
	out.ohe = wires.commit(material)
	return out


## Unit vectors to the left of the direction of travel at each point (mitred at the joins).
static func _lefts(pts: PackedVector2Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	out.resize(pts.size())
	for i in pts.size():
		var d := Vector2.ZERO
		if i > 0:
			d += (pts[i] - pts[i - 1]).normalized()
		if i + 1 < pts.size():
			d += (pts[i + 1] - pts[i]).normalized()
		d = d.normalized() if d.length() > 1e-6 else Vector2(0, -1)
		# Left of (dx, dz) is (dz, -dx) in this frame (path.ts).
		out[i] = Vector2(d.y, -d.x)
	return out


static func _base(piece: RailIndex.Piece, i: int) -> float:
	return piece.heights[i] if not piece.heights.is_empty() else 0.0


static func _v3(p: Vector2, y: float, c: Vector2) -> Vector3:
	return Vector3(p.x - c.x, y, p.y - c.y)


static func _ballast(mb: MeshBuilder, piece: RailIndex.Piece, left: PackedVector2Array, c: Vector2, crossings: PackedVector2Array, top_width: float) -> void:
	var hb := top_width / 2.0 + 0.6
	var ht := top_width / 2.0
	var u_edge := RailMaterials.BALLAST_U0 + 0.01
	for i in piece.points.size() - 1:
		var mid := (piece.points[i] + piece.points[i + 1]) / 2.0
		var near_road := false
		for x in crossings:
			if x.distance_to(mid) < CROSSING_CLEAR:
				near_road = true
		if near_road:
			continue
		var a := piece.points[i]
		var b := piece.points[i + 1]
		var la := left[i]
		var lb := left[i + 1]
		var va := piece.along[i] / RailMaterials.SLEEPER_REPEAT
		var vb := piece.along[i + 1] / RailMaterials.SLEEPER_REPEAT
		# Top: textured with the sleepers.
		var n := Vector3.UP
		var q0 := mb.vertex(_v3(a + la * ht, BALLAST_TOP, c), n, Vector2(RailMaterials.BALLAST_U0, va), BALLAST)
		var q1 := mb.vertex(_v3(a - la * ht, BALLAST_TOP, c), n, Vector2(RailMaterials.BALLAST_U1, va), BALLAST)
		var q2 := mb.vertex(_v3(b - lb * ht, BALLAST_TOP, c), n, Vector2(RailMaterials.BALLAST_U1, vb), BALLAST)
		var q3 := mb.vertex(_v3(b + lb * ht, BALLAST_TOP, c), n, Vector2(RailMaterials.BALLAST_U0, vb), BALLAST)
		mb.quad(q0, q3, q2, q1)
		# Shoulders: plain ballast (the texture's edge, no sleepers).
		for side: float in [1.0, -1.0]:
			var sn := Vector3(la.x * side, 1.2, la.y * side).normalized()
			var s0 := mb.vertex(_v3(a + la * ht * side, BALLAST_TOP, c), sn, Vector2(u_edge, va), BALLAST)
			var s1 := mb.vertex(_v3(a + la * hb * side, 0.0, c), sn, Vector2(u_edge, va), BALLAST)
			var s2 := mb.vertex(_v3(b + lb * hb * side, 0.0, c), sn, Vector2(u_edge, vb), BALLAST)
			var s3 := mb.vertex(_v3(b + lb * ht * side, BALLAST_TOP, c), sn, Vector2(u_edge, vb), BALLAST)
			if side > 0.0:
				mb.quad(s0, s1, s2, s3)
			else:
				mb.quad(s0, s3, s2, s1)


static func _rails(mb: MeshBuilder, piece: RailIndex.Piece, left: PackedVector2Array, c: Vector2) -> void:
	var white := Vector2(RailMaterials.WHITE_U, 0.5)
	var h := RAIL_HEAD / 2.0
	for i in piece.points.size() - 1:
		var a := piece.points[i]
		var b := piece.points[i + 1]
		var la := left[i]
		var lb := left[i + 1]
		var ya := _base(piece, i)
		var yb := _base(piece, i + 1)
		for side: float in [1.0, -1.0]:
			var oa := la * RAIL_HALF * side
			var ob := lb * RAIL_HALF * side
			var top_a := ya + RAIL_TOP
			var top_b := yb + RAIL_TOP
			var foot_a := ya + BALLAST_TOP
			var foot_b := yb + BALLAST_TOP
			var t0 := mb.vertex(_v3(a + oa + la * h, top_a, c), Vector3.UP, white, RAIL_SHINE)
			var t1 := mb.vertex(_v3(a + oa - la * h, top_a, c), Vector3.UP, white, RAIL_SHINE)
			var t2 := mb.vertex(_v3(b + ob - lb * h, top_b, c), Vector3.UP, white, RAIL_SHINE)
			var t3 := mb.vertex(_v3(b + ob + lb * h, top_b, c), Vector3.UP, white, RAIL_SHINE)
			mb.quad(t0, t3, t2, t1)
			for face: float in [1.0, -1.0]:
				var fn := Vector3(la.x * face, 0.0, la.y * face)
				var e0 := mb.vertex(_v3(a + oa + la * h * face, top_a, c), fn, white, STEEL)
				var e1 := mb.vertex(_v3(a + oa + la * h * face, foot_a, c), fn, white, STEEL)
				var e2 := mb.vertex(_v3(b + ob + lb * h * face, foot_b, c), fn, white, STEEL)
				var e3 := mb.vertex(_v3(b + ob + lb * h * face, top_b, c), fn, white, STEEL)
				if face > 0.0:
					mb.quad(e0, e1, e2, e3)
				else:
					mb.quad(e0, e3, e2, e1)


## The MRTS viaduct: a deck (top textured as ballast, sides and underside concrete) wherever the
## line is up, piers down to the ground; on the ground it is ballast as any track.
static func _viaduct(mb: MeshBuilder, piece: RailIndex.Piece, left: PackedVector2Array, c: Vector2, faces: PackedVector3Array) -> void:
	var hw := DECK_WIDTH / 2.0
	var white := Vector2(RailMaterials.WHITE_U, 0.5)
	for i in piece.points.size() - 1:
		var a := piece.points[i]
		var b := piece.points[i + 1]
		var la := left[i]
		var lb := left[i + 1]
		var ya := _base(piece, i)
		var yb := _base(piece, i + 1)
		var va := piece.along[i] / RailMaterials.SLEEPER_REPEAT
		var vb := piece.along[i + 1] / RailMaterials.SLEEPER_REPEAT
		var ta := ya + BALLAST_TOP
		var tb := yb + BALLAST_TOP
		var q0 := mb.vertex(_v3(a + la * hw, ta, c), Vector3.UP, Vector2(RailMaterials.BALLAST_U0, va), BALLAST)
		var q1 := mb.vertex(_v3(a - la * hw, ta, c), Vector3.UP, Vector2(RailMaterials.BALLAST_U1, va), BALLAST)
		var q2 := mb.vertex(_v3(b - lb * hw, tb, c), Vector3.UP, Vector2(RailMaterials.BALLAST_U1, vb), BALLAST)
		var q3 := mb.vertex(_v3(b + lb * hw, tb, c), Vector3.UP, Vector2(RailMaterials.BALLAST_U0, vb), BALLAST)
		mb.quad(q0, q3, q2, q1)
		if ya > 0.5 or yb > 0.5:
			faces.append_array([_v3(a + la * hw, ta, c), _v3(b + lb * hw, tb, c), _v3(b - lb * hw, tb, c)])
			faces.append_array([_v3(a + la * hw, ta, c), _v3(b - lb * hw, tb, c), _v3(a - la * hw, ta, c)])
			# Sides and underside.
			var da := maxf(0.0, ya - DECK_DEPTH)
			var db := maxf(0.0, yb - DECK_DEPTH)
			for side: float in [1.0, -1.0]:
				var sn := Vector3(la.x * side, 0.0, la.y * side)
				var s0 := mb.vertex(_v3(a + la * hw * side, ta + 0.6, c), sn, white, CONCRETE)
				var s1 := mb.vertex(_v3(a + la * hw * side, da, c), sn, white, CONCRETE.darkened(0.1))
				var s2 := mb.vertex(_v3(b + lb * hw * side, db, c), sn, white, CONCRETE.darkened(0.1))
				var s3 := mb.vertex(_v3(b + lb * hw * side, tb + 0.6, c), sn, white, CONCRETE)
				if side > 0.0:
					mb.quad(s0, s1, s2, s3)
				else:
					mb.quad(s0, s3, s2, s1)
				# The low parapet's inner face, so the deck edge reads from the train.
				var p0 := mb.vertex(_v3(a + la * (hw - 0.2) * side, ta + 0.6, c), -sn, white, CONCRETE)
				var p1 := mb.vertex(_v3(a + la * (hw - 0.2) * side, ta, c), -sn, white, CONCRETE)
				var p2 := mb.vertex(_v3(b + lb * (hw - 0.2) * side, tb, c), -sn, white, CONCRETE)
				var p3 := mb.vertex(_v3(b + lb * (hw - 0.2) * side, tb + 0.6, c), -sn, white, CONCRETE)
				if side > 0.0:
					mb.quad(p0, p3, p2, p1)
				else:
					mb.quad(p0, p1, p2, p3)
			var u0 := mb.vertex(_v3(a + la * hw, da, c), Vector3.DOWN, white, CONCRETE.darkened(0.3))
			var u1 := mb.vertex(_v3(a - la * hw, da, c), Vector3.DOWN, white, CONCRETE.darkened(0.3))
			var u2 := mb.vertex(_v3(b - lb * hw, db, c), Vector3.DOWN, white, CONCRETE.darkened(0.3))
			var u3 := mb.vertex(_v3(b + lb * hw, db, c), Vector3.DOWN, white, CONCRETE.darkened(0.3))
			mb.quad(u0, u1, u2, u3)
		# Piers at every PIER_EVERY metres along the line.
		var k0 := ceili(piece.along[i] / PIER_EVERY)
		var k1 := floori(piece.along[i + 1] / PIER_EVERY)
		for k in range(k0, k1 + 1):
			var s := k * PIER_EVERY
			var t := (s - piece.along[i]) / maxf(0.001, piece.along[i + 1] - piece.along[i])
			var at := a.lerp(b, t)
			var y := lerpf(ya, yb, t) - DECK_DEPTH
			if y < 1.5:
				continue
			_box(mb, _v3(at, y / 2.0, c), Vector3(0.8, y / 2.0, 0.7), atan2(-(b - a).x, -(b - a).y), CONCRETE.darkened(0.05))


## The overhead line along a piece: masts every MAST_EVERY metres beside the track (on the side
## with room), cantilevers to the wires, and the contact and catenary wires as thin crossed strips.
static func _ohe(mb: MeshBuilder, piece: RailIndex.Piece, left: PackedVector2Array, c: Vector2, index: RailIndex) -> void:
	for wire: float in [CONTACT, CATENARY]:
		for i in piece.points.size() - 1:
			var a := piece.points[i]
			var b := piece.points[i + 1]
			var ya := _base(piece, i) + RAIL_TOP + wire
			var yb := _base(piece, i + 1) + RAIL_TOP + wire
			_strip(mb, a, b, ya, yb, c, left[i], left[i + 1])
	var k0 := ceili(piece.along[0] / MAST_EVERY)
	var k1 := floori(piece.along[piece.along.size() - 1] / MAST_EVERY)
	for k in range(k0, k1 + 1):
		var s := k * MAST_EVERY
		var i := 0
		while i + 2 < piece.along.size() and piece.along[i + 1] < s:
			i += 1
		var t := (s - piece.along[i]) / maxf(0.001, piece.along[i + 1] - piece.along[i])
		var at := piece.points[i].lerp(piece.points[i + 1], t)
		var l := left[i]
		var base := lerpf(_base(piece, i), _base(piece, i + 1), t)
		var side := 0.0
		for try: float in [1.0, -1.0]:
			var spot := at + l * MAST_OFFSET * try
			if index.track_distance(spot) > 2.3:
				side = try
				break
		if side == 0.0:
			continue
		var foot := at + l * MAST_OFFSET * side
		var yaw := atan2(-(piece.points[i + 1] - piece.points[i]).x, -(piece.points[i + 1] - piece.points[i]).y)
		_box(mb, _v3(foot, base + MAST_HEIGHT / 2.0, c), Vector3(0.14, MAST_HEIGHT / 2.0, 0.14), yaw, MAST)
		# Cantilever arm out over the track at the catenary, and a brace down to the contact wire.
		var arm_mid := at + l * (MAST_OFFSET * side / 2.0)
		_box(mb, _v3(arm_mid, base + RAIL_TOP + CATENARY + 0.1, c), Vector3(0.05, 0.05, 0.0), yaw, MAST, Vector2(MAST_OFFSET / 2.0 + 0.3, 0.05))
		_box(mb, _v3(arm_mid, base + RAIL_TOP + CONTACT + 0.25, c), Vector3(0.04, 0.04, 0.0), yaw, MAST, Vector2(MAST_OFFSET / 2.0 + 0.2, 0.04))


static func _strip(mb: MeshBuilder, a: Vector2, b: Vector2, ya: float, yb: float, c: Vector2, la: Vector2, lb: Vector2) -> void:
	var white := Vector2(RailMaterials.WHITE_U, 0.5)
	var w := 0.025
	# Flat strip seen from below and a thin upright one seen from the side.
	var f0 := mb.vertex(_v3(a + la * w, ya, c), Vector3.DOWN, white, WIRE)
	var f1 := mb.vertex(_v3(a - la * w, ya, c), Vector3.DOWN, white, WIRE)
	var f2 := mb.vertex(_v3(b - lb * w, yb, c), Vector3.DOWN, white, WIRE)
	var f3 := mb.vertex(_v3(b + lb * w, yb, c), Vector3.DOWN, white, WIRE)
	mb.quad(f0, f1, f2, f3)
	mb.quad(f0, f3, f2, f1)
	var n := Vector3(la.x, 0, la.y)
	var g0 := mb.vertex(_v3(a, ya + w, c), n, white, WIRE)
	var g1 := mb.vertex(_v3(a, ya - w, c), n, white, WIRE)
	var g2 := mb.vertex(_v3(b, yb - w, c), n, white, WIRE)
	var g3 := mb.vertex(_v3(b, yb + w, c), n, white, WIRE)
	mb.quad(g0, g1, g2, g3)
	mb.quad(g0, g3, g2, g1)


## An upright box at `centre` (local), half extents `half` (x across, y up, z along), turned by
## `yaw`. `across` (when given) replaces x/z: x = half length across the track, y = half depth.
static func _box(mb: MeshBuilder, centre: Vector3, half: Vector3, yaw: float, color: Color, across: Vector2 = Vector2.ZERO) -> void:
	var h := half
	var basis := Basis(Vector3.UP, yaw)
	if across != Vector2.ZERO:
		# A horizontal bar across the track: long along the local x axis.
		h = Vector3(across.x, half.y, across.y)
	var white := Vector2(RailMaterials.WHITE_U, 0.5)
	var corners: Array[Vector3] = []
	for sx: float in [-1.0, 1.0]:
		for sy: float in [-1.0, 1.0]:
			for sz: float in [-1.0, 1.0]:
				corners.append(centre + basis * Vector3(sx * h.x, sy * h.y, sz * h.z))
	# Faces: +x, -x, +y, +z, -z (no bottom).
	var faces := [[4, 6, 7, 5, Vector3.RIGHT], [0, 1, 3, 2, Vector3.LEFT], [2, 3, 7, 6, Vector3.UP], [1, 5, 7, 3, Vector3.BACK], [0, 2, 6, 4, Vector3.FORWARD]]
	for f: Array in faces:
		var n: Vector3 = basis * (f[4] as Vector3)
		var shade := color.darkened(0.12) if absf(n.y) < 0.5 and n.dot(Vector3(0.4, 0, 0.9)) < 0.0 else color
		var i0 := mb.vertex(corners[int(f[0])], n, white, shade)
		var i1 := mb.vertex(corners[int(f[1])], n, white, shade)
		var i2 := mb.vertex(corners[int(f[2])], n, white, shade)
		var i3 := mb.vertex(corners[int(f[3])], n, white, shade)
		mb.quad(i0, i1, i2, i3)
