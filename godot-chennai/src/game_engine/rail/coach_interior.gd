class_name CoachInterior
extends RefCounted
## A small interior shell drawn round the player while riding or driving (G-331): the car models
## are outside shells only (their windows are painted), so from inside one would see straight
## through them. This adds, in the car's frame, the floor, ceiling and side walls with window
## openings, the long benches and grab poles of a suburban coach, or a driving desk and the
## windscreen frame of a cab. A few hundred triangles, one draw call, only while inside.

const WALL := Color(0.82, 0.84, 0.8)
const FLOOR := Color(0.36, 0.34, 0.32)
const SEAT := Color(0.42, 0.52, 0.6)
const POLE := Color(0.75, 0.76, 0.78)
const DESK := Color(0.22, 0.24, 0.26)


static func coach(length: float, width: float, floor_y: float, material: Material) -> ArrayMesh:
	var mb := MeshBuilder.new()
	var hw := width / 2.0 - 0.12
	var hl := length / 2.0 - 0.3
	var ceil_y := floor_y + 2.25
	var sill := floor_y + 0.85
	var head := floor_y + 1.85
	_quad(mb, Vector3(-hw, floor_y, -hl), Vector3(hw, floor_y, -hl), Vector3(hw, floor_y, hl), Vector3(-hw, floor_y, hl), FLOOR)
	_quad(mb, Vector3(-hw, ceil_y, hl), Vector3(hw, ceil_y, hl), Vector3(hw, ceil_y, -hl), Vector3(-hw, ceil_y, -hl), WALL)
	for side: float in [-1.0, 1.0]:
		var x := hw * side
		# Below and above the window band, along the whole car.
		_quad(mb, Vector3(x, floor_y, -hl), Vector3(x, sill, -hl), Vector3(x, sill, hl), Vector3(x, floor_y, hl), WALL.darkened(0.1))
		_quad(mb, Vector3(x, head, -hl), Vector3(x, ceil_y, -hl), Vector3(x, ceil_y, hl), Vector3(x, head, hl), WALL)
		# Pillars between the windows every 1.6 m.
		var z := -hl
		while z < hl:
			_quad(mb, Vector3(x, sill, z), Vector3(x, head, z), Vector3(x, head, z + 0.25), Vector3(x, sill, z + 0.25), WALL)
			z += 1.6
		# A long bench along the wall (the doors' bays left clear).
		_box(mb, Vector3(side * (hw - 0.25), floor_y + 0.22, 0.0), Vector3(0.25, 0.22, hl * 0.55), SEAT)
	for e: float in [-1.0, 1.0]:
		_quad(mb, Vector3(-hw, floor_y, hl * e), Vector3(-hw, ceil_y, hl * e), Vector3(hw, ceil_y, hl * e), Vector3(hw, floor_y, hl * e), WALL.darkened(0.05))
	# Grab poles down the middle and a handrail along the ceiling.
	var k := -hl + 2.0
	while k < hl - 1.0:
		_box(mb, Vector3(0.0, (floor_y + ceil_y) / 2.0, k), Vector3(0.025, (ceil_y - floor_y) / 2.0, 0.025), POLE)
		k += 3.0
	for side: float in [-0.45, 0.45]:
		_box(mb, Vector3(side, ceil_y - 0.2, 0.0), Vector3(0.02, 0.02, hl - 0.5), POLE)
	return mb.commit(material)


## A driving cab round the seat: the desk with its gauges as dark blocks, side walls, the roof
## and the frame of the windscreen, in the car's frame (front towards -Z).
static func cab(seat: Vector3, width: float, material: Material) -> ArrayMesh:
	var mb := MeshBuilder.new()
	var hw := width / 2.0 - 0.15
	var front := seat.z - 1.35
	var floor_y := seat.y - 0.75
	var ceil_y := seat.y + 1.35
	_box(mb, Vector3(0.0, seat.y - 0.05, front + 0.35), Vector3(hw, 0.3, 0.3), DESK)
	_box(mb, Vector3(seat.x - 0.15, seat.y + 0.28, front + 0.5), Vector3(0.35, 0.04, 0.15), Color(0.1, 0.1, 0.1))
	# Windscreen frame: pillars at the sides and the middle, the roof edge.
	for x: float in [-hw, 0.0, hw]:
		_box(mb, Vector3(x, (seat.y + ceil_y) / 2.0, front), Vector3(0.07, (ceil_y - seat.y) / 2.0, 0.05), DESK)
	_quad(mb, Vector3(-hw, ceil_y, front), Vector3(hw, ceil_y, front), Vector3(hw, ceil_y, seat.z + 1.2), Vector3(-hw, ceil_y, seat.z + 1.2), WALL.darkened(0.2))
	_quad(mb, Vector3(-hw, floor_y, seat.z + 1.2), Vector3(hw, floor_y, seat.z + 1.2), Vector3(hw, floor_y, front), Vector3(-hw, floor_y, front), FLOOR)
	for side: float in [-1.0, 1.0]:
		var x := hw * side
		_quad(mb, Vector3(x, floor_y, front), Vector3(x, seat.y + 0.2, front), Vector3(x, seat.y + 0.2, seat.z + 1.2), Vector3(x, floor_y, seat.z + 1.2), WALL.darkened(0.25))
	_quad(mb, Vector3(-hw, floor_y, seat.z + 1.2), Vector3(-hw, ceil_y, seat.z + 1.2), Vector3(hw, ceil_y, seat.z + 1.2), Vector3(hw, floor_y, seat.z + 1.2), WALL.darkened(0.3))
	return mb.commit(material)


static func _quad(mb: MeshBuilder, a: Vector3, b: Vector3, c: Vector3, d: Vector3, color: Color) -> void:
	var n := (b - a).cross(d - a).normalized()
	var uv := Vector2(RailMaterials.WHITE_U, 0.5)
	var i0 := mb.vertex(a, n, uv, color)
	var i1 := mb.vertex(b, n, uv, color)
	var i2 := mb.vertex(c, n, uv, color)
	var i3 := mb.vertex(d, n, uv, color)
	mb.quad(i0, i1, i2, i3)
	mb.quad(i0, i3, i2, i1)


static func _box(mb: MeshBuilder, centre: Vector3, half: Vector3, color: Color) -> void:
	RailGeometry._box(mb, centre, half, 0.0, color)
	# The underside too (benches and desks are seen from above and below).
	_quad(mb, centre + Vector3(-half.x, -half.y, -half.z), centre + Vector3(half.x, -half.y, -half.z), centre + Vector3(half.x, -half.y, half.z), centre + Vector3(-half.x, -half.y, half.z), color.darkened(0.3))
