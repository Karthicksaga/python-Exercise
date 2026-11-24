class_name StationView
extends Node3D
## The stations near the player (G-329): for each drawn platform (`StationLayout`) a raised deck
## along the curve of the track with the yellow edge line, ramps at both ends, a shed down the
## middle, yellow name boards (Tamil above English, the Indian Railways colour scheme: plain
## yellow with black letters, no emblem), the departure board, the stop board for drivers and a
## starter signal. The MRTS's platforms stand on the viaduct with a stair down to the street.
## Built on a worker thread when within `load_distance`, solid (deck, ramps, stairs), freed
## beyond `unload_distance`. Boards are `Label3D` drawn only near (`board_range`).
##
## Tamil station names are as mapped in OSM, or transliterations marked in `world/rail/RAIL.md`:
## **needs native review**.

const DECK := Color(0.74, 0.72, 0.68)
const DECK_SIDE := Color(0.58, 0.55, 0.5)
const EDGE := Color(0.93, 0.78, 0.16)
const ROOF := Color(0.42, 0.5, 0.56)
const COLUMN := Color(0.32, 0.36, 0.4)
const BOARD := Color(0.98, 0.83, 0.1)
const BOARD_TEXT := Color(0.06, 0.06, 0.06)
const SHED_HEIGHT := 3.9
## Starter signal lamps, top to bottom: red, yellow, green.
const LAMPS: Array[Color] = [Color(1, 0.15, 0.1), Color(1, 0.75, 0.15), Color(0.2, 1, 0.45)]
## Length of the platform's end ramps, metres.
const RAMP := 6.0
## The MRTS stair: rise and going of a step, metres.
const STEP_RISE := 0.3
const STEP_GOING := 0.42

@export var load_distance: float = 380.0
@export var unload_distance: float = 460.0
@export var board_range: float = 140.0

var platforms: Array[StationLayout.Platform] = []
var materials: RailMaterials
var focus: Vector2 = Vector2.ZERO
var active: bool = false
## Half the length of a drawn train per line (for the drivers' stop boards).
var half_train: Dictionary[String, float] = {}
var stats := {"shown": 0, "built": 0}

var _nodes: Dictionary[int, Node3D] = {}
var _tasks: Dictionary[int, BackgroundTask] = {}
var _departure_boards: Dictionary[int, Label3D] = {}
var _signals: Dictionary[int, Array] = {}
var _font: Font = null


class Built:
	extends RefCounted
	var index: int = 0
	var centre: Vector2
	var base: float = 0.0
	var mesh: ArrayMesh = null
	var faces: PackedVector3Array = PackedVector3Array()


func setup(list: Array[StationLayout.Platform], mats: RailMaterials, font: Font) -> void:
	platforms = list
	materials = mats
	_font = font
	active = true


func _process(_delta: float) -> void:
	if active:
		step()


func step() -> void:
	for i in platforms.size():
		var p := platforms[i]
		var c := p.line.path.at(p.stop.s).point()
		var d := c.distance_to(focus)
		if d < load_distance and not _nodes.has(i) and not _tasks.has(i) and _tasks.size() < 2:
			var mat := materials.platform
			var half: float = half_train.get(p.line.id, 45.0)
			_tasks[i] = BackgroundTask.start(func() -> Built: return build(p, i, mat, half))
		elif d > unload_distance and _nodes.has(i):
			_nodes[i].queue_free()
			_nodes.erase(i)
			_departure_boards.erase(i)
			_signals.erase(i)
	var added := false
	for i: int in _tasks.keys():
		if added:
			break
		if _tasks[i].is_done():
			var built := _tasks[i].result() as Built
			_tasks.erase(i)
			if built != null:
				_show(built)
				added = true
	stats["shown"] = _nodes.size()


func shown() -> int:
	return _nodes.size()


## The platform's geometry (worker thread): deck, edges, ramps, shed, board frames, the stop
## board, the starter signal mast and (on the viaduct) the stair; and the solid faces.
static func build(p: StationLayout.Platform, index: int, material: Material, half_train_length: float) -> Built:
	var out := Built.new()
	out.index = index
	out.centre = p.line.path.at(p.stop.s).point()
	out.base = p.base()
	var mb := MeshBuilder.new()
	var half := RailRules.PLATFORM_LENGTH / 2.0
	var lo := minf(p.near, p.far)
	var hi := maxf(p.near, p.far)
	var top := out.base + RailRules.PLATFORM_HEIGHT
	var ground := out.base
	# Deck along the curve, in 5 m slices.
	var u := -half
	while u < half - 0.01:
		var u1 := minf(half, u + 5.0)
		_slab(mb, out, p, u, u1, lo, hi, ground, top, DECK, DECK_SIDE)
		# Yellow edge line on each edge a train stands at.
		for sv in p.services:
			var e := sv.edge
			var inward := float(sv.inward)
			_flat(mb, out, p, u, u1, e + inward * 0.15, e + inward * 0.6, top + 0.01, EDGE)
		u = u1
	# Ramps down at both ends (the Three.js platform's steps), on the ground only.
	for end: float in [-1.0, 1.0]:
		var a := half * end
		var b := (half + RAMP) * end
		_ramp(mb, out, p, a, b, lo, hi, top, ground)
	# Shed: columns down the middle every 10 m over the middle 70 m, a roof above.
	var mid := p.middle()
	var roof_half := maxf(1.6, (hi - lo) / 2.0 - 0.3)
	var k := -35.0
	while k <= 35.01:
		_post(mb, out, p, k, mid, top, top + SHED_HEIGHT, 0.12, COLUMN)
		k += 10.0
	_slab(mb, out, p, -38.0, 38.0, mid - roof_half, mid + roof_half, top + SHED_HEIGHT, top + SHED_HEIGHT + 0.12, ROOF, ROOF.darkened(0.2), false)
	# Name board frames (Label3D text goes on their faces), hung under the roof at ±22 m and on posts at both ends.
	for at: float in [-22.0, 22.0]:
		_board_frame(mb, out, p, at, mid, top + 2.6, 2.6, 0.9)
	for at: float in [-half + 4.0, half - 4.0]:
		_post(mb, out, p, at, mid, top, top + 2.2, 0.06, COLUMN)
		_board_frame(mb, out, p, at, mid, top + 2.65, 2.6, 0.9)
	# Drivers' stop board where the front of a train stands, and the starter signal beyond it.
	for sv in p.services:
		var dir := 1.0 if sv.line == p.line else -1.0
		var front := dir * half_train_length
		var w := sv.edge + float(sv.inward) * 0.5
		_post(mb, out, p, front, w, top, top + 1.6, 0.05, COLUMN)
		_board(mb, out, p, front, w, top + 1.75, 0.5, 0.35, Color(0.8, 0.12, 0.1))
		var sig := front + dir * CabDrive.SIGNAL_AHEAD
		var sw := sv.track - float(sv.inward) * 2.4
		_post(mb, out, p, sig, sw, ground, ground + 5.2, 0.09, Color(0.12, 0.12, 0.13))
		_board(mb, out, p, sig, sw, ground + 4.7, 0.32, 0.85, Color(0.1, 0.1, 0.11))
	# The MRTS: a stair from the street up to the deck, beside the platform's far edge.
	if out.base > 1.5:
		_stair(mb, out, p, lo, hi, top)
	out.mesh = mb.commit(material)
	return out


## Platform-frame point (u along, w across) at height y, local to the build's centre.
static func _local(out: Built, p: StationLayout.Platform, u: float, w: float, y: float) -> Vector3:
	var at := p.world(u, w)
	return Vector3(at.x - out.centre.x, y, at.y - out.centre.y)


static func _slab(mb: MeshBuilder, out: Built, p: StationLayout.Platform, u0: float, u1: float, w0: float, w1: float, y0: float, y1: float, top_color: Color, side_color: Color, solid: bool = true) -> void:
	var a := _local(out, p, u0, w0, y1)
	var b := _local(out, p, u0, w1, y1)
	var c := _local(out, p, u1, w1, y1)
	var d := _local(out, p, u1, w0, y1)
	_quad(mb, a, b, c, d, Vector3.UP, top_color)
	var a0 := Vector3(a.x, y0, a.z)
	var b0 := Vector3(b.x, y0, b.z)
	var c0 := Vector3(c.x, y0, c.z)
	var d0 := Vector3(d.x, y0, d.z)
	_quad(mb, a0, a, d, d0, Vector3.ZERO, side_color)
	_quad(mb, c0, c, b, b0, Vector3.ZERO, side_color)
	if solid:
		out.faces.append_array([a, b, c, a, c, d])
		out.faces.append_array([a0, a, d, a0, d, d0, c0, c, b, c0, b, b0])
	else:
		_quad(mb, d0, c0, b0, a0, Vector3.DOWN, side_color.darkened(0.2))


static func _flat(mb: MeshBuilder, out: Built, p: StationLayout.Platform, u0: float, u1: float, w0: float, w1: float, y: float, color: Color) -> void:
	_quad(mb, _local(out, p, u0, w0, y), _local(out, p, u0, w1, y), _local(out, p, u1, w1, y), _local(out, p, u1, w0, y), Vector3.UP, color)


static func _ramp(mb: MeshBuilder, out: Built, p: StationLayout.Platform, u0: float, u1: float, w0: float, w1: float, y_top: float, y_ground: float) -> void:
	var a := _local(out, p, u0, w0, y_top)
	var b := _local(out, p, u0, w1, y_top)
	var c := _local(out, p, u1, w1, y_ground + 0.02)
	var d := _local(out, p, u1, w0, y_ground + 0.02)
	if u1 < u0:
		_quad(mb, a, d, c, b, Vector3.UP, DECK)
	else:
		_quad(mb, a, b, c, d, Vector3.UP, DECK)
	out.faces.append_array([a, b, c, a, c, d])
	# The ramp's sides down to the base.
	var a0 := Vector3(a.x, y_ground, a.z)
	var b0 := Vector3(b.x, y_ground, b.z)
	_quad(mb, a0, a, d, d, Vector3.ZERO, DECK_SIDE)
	_quad(mb, b0, b, c, c, Vector3.ZERO, DECK_SIDE)


static func _post(mb: MeshBuilder, out: Built, p: StationLayout.Platform, u: float, w: float, y0: float, y1: float, r: float, color: Color) -> void:
	var c := _local(out, p, u, w, 0.0)
	var yaw := p.line.path.at(p.stop.s + u).yaw
	RailGeometry._box(mb, Vector3(c.x, (y0 + y1) / 2.0, c.z), Vector3(r, (y1 - y0) / 2.0, r), yaw, color)


static func _board_frame(mb: MeshBuilder, out: Built, p: StationLayout.Platform, u: float, w: float, y: float, width: float, height: float) -> void:
	_board(mb, out, p, u, w, y, width, height, BOARD)


## A thin upright board along the platform at (u, w), centre height y.
static func _board(mb: MeshBuilder, out: Built, p: StationLayout.Platform, u: float, w: float, y: float, width: float, height: float, color: Color) -> void:
	var c := _local(out, p, u, w, 0.0)
	var yaw := p.line.path.at(p.stop.s + u).yaw
	# Boards face across the track (their long side along it): a box long along z.
	RailGeometry._box(mb, Vector3(c.x, y, c.z), Vector3(0.05, height / 2.0, width / 2.0), yaw, color)


## A straight stair from the street up to the viaduct platform, alongside its outer edge.
static func _stair(mb: MeshBuilder, out: Built, p: StationLayout.Platform, lo: float, hi: float, top: float) -> void:
	var outer := hi if absf(hi) > absf(lo) else lo
	var side := signf(outer)
	var w0 := outer + side * 0.4
	var w1 := outer + side * 2.8
	var steps := ceili(top / STEP_RISE)
	var rise := top / float(steps)
	var u0 := -20.0
	# Landing at the top, joined to the deck.
	_slab(mb, out, p, u0 - 2.0, u0 + 1.0, minf(outer - side * 0.3, w1), maxf(outer - side * 0.3, w1), top - 0.25, top, DECK, DECK_SIDE)
	for i in steps:
		var y := top - rise * (i + 1)
		var ua := u0 - 2.0 - STEP_GOING * (i + 1)
		var ub := ua + STEP_GOING
		var wa := minf(w0, w1)
		var wb := maxf(w0, w1)
		_slab(mb, out, p, ua, ub, wa, wb, maxf(0.0, y - 0.25), y, DECK, DECK_SIDE)
	# Stringers under the stair (a concrete wall along its outside).
	var foot := u0 - 2.0 - STEP_GOING * steps
	_quad(mb, _local(out, p, foot, w1, 0.0), _local(out, p, u0 - 2.0, w1, 0.0), _local(out, p, u0 - 2.0, w1, top), _local(out, p, u0 - 2.0, w1, top), Vector3.ZERO, DECK_SIDE)


static func _quad(mb: MeshBuilder, a: Vector3, b: Vector3, c: Vector3, d: Vector3, n: Vector3, color: Color) -> void:
	var normal := n
	if normal == Vector3.ZERO:
		normal = (b - a).cross(d - a).normalized()
		if normal == Vector3.ZERO:
			normal = Vector3.UP
	var uv := Vector2(RailMaterials.WHITE_U, 0.5)
	var i0 := mb.vertex(a, normal, uv, color)
	var i1 := mb.vertex(b, normal, uv, color)
	var i2 := mb.vertex(c, normal, uv, color)
	var i3 := mb.vertex(d, normal, uv, color)
	# Both faces: platform pieces are seen from every side.
	mb.quad(i0, i1, i2, i3)
	mb.quad(i0, i3, i2, i1)


func _show(built: Built) -> void:
	var p := platforms[built.index]
	var holder := Node3D.new()
	holder.name = "Platform_%s" % p.key.replace(":", "_")
	holder.position = WorldOrigin.to_scene(built.centre)
	holder.add_to_group(WorldOrigin.GROUP)
	if built.mesh != null:
		var mi := MeshInstance3D.new()
		mi.mesh = built.mesh
		mi.visibility_range_end = load_distance + 40.0
		holder.add_child(mi)
	if not built.faces.is_empty():
		var body := StaticBody3D.new()
		body.collision_layer = 1  # LAYER_WORLD (G-64)
		var shape := ConcavePolygonShape3D.new()
		shape.backface_collision = true
		shape.set_faces(built.faces)
		var cs := CollisionShape3D.new()
		cs.shape = shape
		body.add_child(cs)
		holder.add_child(body)
	var top := built.base + RailRules.PLATFORM_HEIGHT
	var name_text := "%s\n%s" % [p.station.name_ta, p.station.name.to_upper()] if p.station.name_ta != "" else p.station.name.to_upper()
	var half := RailRules.PLATFORM_LENGTH / 2.0
	for at: float in [-22.0, 22.0, -half + 4.0, half - 4.0]:
		var y := top + (2.6 if absf(at) < 30.0 else 2.65)
		for face: float in [1.0, -1.0]:
			holder.add_child(_label(p, built.centre, at, p.middle() + face * 0.07, y, face, name_text, 30, BOARD_TEXT))
	# Departure board (live text near) under the shed's middle.
	var dep := _label(p, built.centre, 0.0, p.middle(), top + 2.7, 1.0, "", 18, Color(1.0, 0.62, 0.1))
	dep.modulate = Color(1.0, 0.62, 0.1)
	dep.outline_size = 0
	holder.add_child(dep)
	_departure_boards[built.index] = dep
	var back := MeshInstance3D.new()
	var quad := QuadMesh.new()
	quad.size = Vector2(3.2, 1.1)
	back.mesh = quad
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color(0.05, 0.05, 0.06)
	dark.cull_mode = BaseMaterial3D.CULL_DISABLED
	back.material_override = dark
	back.position = dep.position - dep.basis.z * 0.02
	back.basis = dep.basis
	back.visibility_range_end = board_range
	holder.add_child(back)
	# Starter signal lamps (unlit spheres, one on per aspect).
	var lamps: Array = []
	for sv in p.services:
		var dir := 1.0 if sv.line == p.line else -1.0
		var half_len: float = half_train.get(sv.line.id, 45.0)
		var sig := dir * half_len + dir * CabDrive.SIGNAL_AHEAD
		var sw := sv.track - float(sv.inward) * 2.4
		var lamp_set: Array[Node3D] = []
		for k in 3:
			var lamp := MeshInstance3D.new()
			var sphere := SphereMesh.new()
			sphere.radius = 0.11
			sphere.height = 0.22
			sphere.radial_segments = 8
			sphere.rings = 4
			lamp.mesh = sphere
			var m := StandardMaterial3D.new()
			m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			m.albedo_color = LAMPS[k]
			lamp.material_override = m
			var at := p.world(sig, sw)
			var yaw := p.line.path.at(p.stop.s + sig).yaw + (0.0 if dir > 0 else PI)
			var facing := Vector3(-sin(yaw), 0, -cos(yaw))
			lamp.position = Vector3(at.x - built.centre.x, built.base + 4.95 - k * 0.27, at.y - built.centre.y) - facing * 0.07
			lamp.visibility_range_end = 400.0
			lamp.visible = k == 2
			holder.add_child(lamp)
			lamp_set.append(lamp)
		lamps.append([sv, lamp_set])
	_signals[built.index] = lamps
	add_child(holder)
	_nodes[built.index] = holder
	stats["built"] = int(stats["built"]) + 1


func _label(p: StationLayout.Platform, centre: Vector2, u: float, w: float, y: float, face: float, text: String, size: int, color: Color) -> Label3D:
	var l := Label3D.new()
	l.text = text
	l.font = _font
	l.font_size = size
	l.pixel_size = 0.006
	l.modulate = color
	l.outline_size = 0
	l.double_sided = false
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.visibility_range_end = board_range
	l.line_spacing = -6.0
	var at := p.world(u, w)
	var yaw := p.line.path.at(p.stop.s + u).yaw
	# Faces across the track: towards +w (left) for face 1, else right.
	l.position = Vector3(at.x - centre.x, y, at.y - centre.y)
	l.basis = Basis(Vector3.UP, yaw + PI / 2.0 * face)
	return l


## Live boards near the player: the departure board's text and the signals' aspects.
func refresh(clock: float, hour: float, standing: Dictionary[String, bool]) -> void:
	for i: int in _departure_boards.keys():
		var p := platforms[i]
		var c := p.line.path.at(p.stop.s).point()
		if c.distance_to(focus) > board_range:
			continue
		_departure_boards[i].text = "\n".join(StationLayout.board_text(p, clock, hour))
	for i: int in _signals.keys():
		for pair: Array in _signals[i]:
			var sv := pair[0] as StationLayout.Service
			var lamps: Array = pair[1]
			var red := standing.has("%s:%d" % [sv.line.id, sv.stop])
			(lamps[0] as Node3D).visible = red
			(lamps[1] as Node3D).visible = false
			(lamps[2] as Node3D).visible = not red


func departure_text(i: int) -> String:
	return _departure_boards[i].text if _departure_boards.has(i) else ""
