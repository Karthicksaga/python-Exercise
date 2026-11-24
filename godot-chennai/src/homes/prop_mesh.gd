class_name PropMesh
extends RefCounted
## Builds the small procedural models of the furniture (G-236): a few boxes, cylinders, spheres,
## cones and tori per prop, merged into one `MeshBuilder` (flat-shaded, vertex colours). A prop
## has a solid part and a glow part (lamps, tube lights, the pooja flame), kept apart so the glow
## can switch on at night. A whole room is merged again (`FurnitureMesh`), so furniture costs two
## draw calls however much there is. Plain packed arrays: safe on any thread.

const SIDES_MAX := 16


## {solid: MeshBuilder, glow: MeshBuilder} for a prop, around its own origin (floor pieces: the
## footprint's centre on the floor; wall pieces: on the wall, front towards +z).
static func build(def: PropDef) -> Dictionary:
	var solid := MeshBuilder.new()
	var glow := MeshBuilder.new()
	for part in def.parts:
		add_part(glow if int(part.get("g", 0)) != 0 else solid, part)
	return {"solid": solid, "glow": glow}


static func add_part(b: MeshBuilder, part: Dictionary) -> void:
	var a: Array = part.get("a", [])
	var c := Color(str(part.get("c", "#888888")))
	var p := _vec(part.get("p"))
	var r := _vec(part.get("r"))
	var basis := Basis.from_euler(Vector3(r.x, r.y, r.z), EULER_ORDER_XYZ)
	var xf := Transform3D(basis, p)
	match str(part.get("t")):
		"box":
			if a.size() >= 3:
				_box(b, xf, Vector3(float(a[0]), float(a[1]), float(a[2])), c)
		"cyl":
			if a.size() >= 4:
				_cylinder(b, xf, float(a[0]), float(a[1]), float(a[2]), clampi(int(a[3]), 3, SIDES_MAX), c)
		"cone":
			if a.size() >= 3:
				_cylinder(b, xf, 0.0, float(a[0]), float(a[1]), clampi(int(a[2]), 3, SIDES_MAX), c)
		"sph":
			if a.size() >= 1:
				_sphere(b, xf, float(a[0]), c)
		"tor":
			if a.size() >= 2:
				_torus(b, xf, float(a[0]), float(a[1]), c)


static func _vec(v: Variant) -> Vector3:
	if v is Array:
		var arr: Array = v
		if arr.size() >= 3:
			return Vector3(float(arr[0]), float(arr[1]), float(arr[2]))
	return Vector3.ZERO


## A flat polygon (convex, any order of corners as long as it is a fan from the first), facing `n`.
static func _face(b: MeshBuilder, pts: Array[Vector3], n: Vector3, c: Color) -> void:
	var ids: Array[int] = []
	for q in pts:
		ids.append(b.vertex(q, n, Vector2.ZERO, c))
	for i in range(1, pts.size() - 1):
		var cross := (pts[i] - pts[0]).cross(pts[i + 1] - pts[0])
		if cross.dot(n) >= 0.0:
			b.triangle(ids[0], ids[i], ids[i + 1])
		else:
			b.triangle(ids[0], ids[i + 1], ids[i])


static func _poly(points: Array) -> Array[Vector3]:
	var out: Array[Vector3] = []
	for q: Vector3 in points:
		out.append(q)
	return out


static func _box(b: MeshBuilder, xf: Transform3D, size: Vector3, c: Color) -> void:
	var h := size * 0.5
	var corners: Array[Vector3] = []
	for sx: float in [-1.0, 1.0]:
		for sy: float in [-1.0, 1.0]:
			for sz: float in [-1.0, 1.0]:
				corners.append(xf * Vector3(h.x * sx, h.y * sy, h.z * sz))
	# corner index = (x>0)*4 + (y>0)*2 + (z>0)
	var faces: Array = [
		[[4, 6, 7, 5], Vector3.RIGHT], [[0, 1, 3, 2], Vector3.LEFT],
		[[2, 3, 7, 6], Vector3.UP], [[0, 4, 5, 1], Vector3.DOWN],
		[[1, 5, 7, 3], Vector3.BACK], [[0, 2, 6, 4], Vector3.FORWARD]]
	for f: Array in faces:
		var idx: Array = f[0]
		var pts: Array[Vector3] = []
		for i: int in idx:
			pts.append(corners[i])
		_face(b, pts, (xf.basis * (f[1] as Vector3)).normalized(), c)


static func _cylinder(b: MeshBuilder, xf: Transform3D, r_top: float, r_bottom: float, height: float, sides: int, c: Color) -> void:
	var hy := height * 0.5
	for i in sides:
		var a0 := TAU * float(i) / float(sides)
		var a1 := TAU * float(i + 1) / float(sides)
		var t0 := xf * Vector3(cos(a0) * r_top, hy, sin(a0) * r_top)
		var t1 := xf * Vector3(cos(a1) * r_top, hy, sin(a1) * r_top)
		var b0 := xf * Vector3(cos(a0) * r_bottom, -hy, sin(a0) * r_bottom)
		var b1 := xf * Vector3(cos(a1) * r_bottom, -hy, sin(a1) * r_bottom)
		var mid := (a0 + a1) * 0.5
		var n := (xf.basis * Vector3(cos(mid), (r_bottom - r_top) / maxf(height, 0.001), sin(mid))).normalized()
		_face(b, _poly([b0, b1, t1, t0]), n, c)
		if r_top > 0.0:
			_face(b, _poly([xf * Vector3(0, hy, 0), t1, t0]), (xf.basis * Vector3.UP).normalized(), c)
		_face(b, _poly([xf * Vector3(0, -hy, 0), b0, b1]), (xf.basis * Vector3.DOWN).normalized(), c)


static func _sphere(b: MeshBuilder, xf: Transform3D, radius: float, c: Color) -> void:
	var seg := 8
	var rings := 4
	for j in rings:
		var p0 := PI * float(j) / float(rings)
		var p1 := PI * float(j + 1) / float(rings)
		for i in seg:
			var a0 := TAU * float(i) / float(seg)
			var a1 := TAU * float(i + 1) / float(seg)
			var q00 := Vector3(sin(p0) * cos(a0), cos(p0), sin(p0) * sin(a0)) * radius
			var q01 := Vector3(sin(p0) * cos(a1), cos(p0), sin(p0) * sin(a1)) * radius
			var q10 := Vector3(sin(p1) * cos(a0), cos(p1), sin(p1) * sin(a0)) * radius
			var q11 := Vector3(sin(p1) * cos(a1), cos(p1), sin(p1) * sin(a1)) * radius
			var centre := (q00 + q01 + q10 + q11) * 0.25
			var n := (xf.basis * centre).normalized()
			var poly: Array[Vector3]
			if j == 0:
				poly = _poly([xf * q00, xf * q11, xf * q10])
			elif j == rings - 1:
				poly = _poly([xf * q00, xf * q01, xf * q10])
			else:
				poly = _poly([xf * q00, xf * q01, xf * q11, xf * q10])
			_face(b, poly, n, c)


static func _torus(b: MeshBuilder, xf: Transform3D, radius: float, tube: float, c: Color) -> void:
	# A ring in the x-y plane (a wheel seen from the side), 12 round and 4 across.
	var round_n := 12
	var cross_n := 4
	for i in round_n:
		var a0 := TAU * float(i) / float(round_n)
		var a1 := TAU * float(i + 1) / float(round_n)
		for j in cross_n:
			var s0 := TAU * float(j) / float(cross_n)
			var s1 := TAU * float(j + 1) / float(cross_n)
			var pts: Array[Vector3] = []
			for q: Array in [[a0, s0], [a1, s0], [a1, s1], [a0, s1]]:
				var a: float = q[0]
				var s: float = q[1]
				var ring := Vector3(cos(a), sin(a), 0.0)
				pts.append(xf * (ring * (radius + tube * cos(s)) + Vector3(0, 0, tube * sin(s))))
			var am := (a0 + a1) * 0.5
			var sm := (s0 + s1) * 0.5
			var nrm := (xf.basis * (Vector3(cos(am), sin(am), 0.0) * cos(sm) + Vector3(0, 0, sin(sm)))).normalized()
			_face(b, pts, nrm, c)
