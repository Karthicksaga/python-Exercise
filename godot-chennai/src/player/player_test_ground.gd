class_name PlayerTestGround
extends Node3D
## Foundation's test ground with things to walk into, for the player's tests and screenshots
## until the streamed city lands: a long wall, a corner, a 15 cm kerb, a 30 cm step, a 60 cm
## ledge, two street-light poles and a person-sized post (decision G-68).

const TEST_WORLD := "res://src/app/test_world/test_world.tscn"

var world: TestWorld
var rig: PlayerRig


func _ready() -> void:
	# Loaded, not preloaded: its script names autoloads, which a --script run compiles late.
	world = (load(TEST_WORLD) as PackedScene).instantiate() as TestWorld
	add_child(world)
	# Wall along x = 6 (from z -10 to 10), 3 m high, 0.3 m thick; a corner wall at z = -10.
	add_box("WallEast", Vector3(6.15, 1.5, 0.0), Vector3(0.3, 3.0, 20.0), Color(0.86, 0.8, 0.68))
	add_box("WallNorth", Vector3(0.0, 1.5, -10.15), Vector3(12.6, 3.0, 0.3), Color(0.72, 0.82, 0.86))
	# Kerb, step and ledge to the west, in a row along z.
	add_box("Kerb", Vector3(-4.0, 0.075, 4.0), Vector3(4.0, 0.15, 2.0), Color(0.9, 0.78, 0.2))
	add_box("Step", Vector3(-4.0, 0.15, 0.0), Vector3(4.0, 0.3, 2.0), Color(0.7, 0.7, 0.68))
	add_box("Ledge", Vector3(-4.0, 0.3, -4.0), Vector3(4.0, 0.6, 2.0), Color(0.6, 0.5, 0.45))
	add_pole("PoleA", Vector3(1.5, 0.0, 9.0), 0.09, 5.0)
	add_pole("PoleB", Vector3(-1.5, 0.0, 6.0), 0.09, 5.0)
	add_pole("Person", Vector3(2.5, 0.0, -3.0), 0.25, 1.7)
	rig = PlayerRig.new()
	rig.name = "Player"
	add_child(rig)


func add_box(n: String, centre: Vector3, extent: Vector3, colour: Color) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = n
	body.position = centre
	var shape := BoxShape3D.new()
	shape.size = extent
	var col := CollisionShape3D.new()
	col.shape = shape
	body.add_child(col)
	var mesh := BoxMesh.new()
	mesh.size = extent
	var mat := StandardMaterial3D.new()
	mat.albedo_color = colour
	mat.roughness = 0.9
	mesh.material = mat
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	body.add_child(mi)
	add_child(body)
	return body


func add_pole(n: String, foot: Vector3, radius: float, height: float) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = n
	body.position = foot + Vector3(0.0, height * 0.5, 0.0)
	var shape := CylinderShape3D.new()
	shape.radius = radius
	shape.height = height
	var col := CollisionShape3D.new()
	col.shape = shape
	body.add_child(col)
	var mesh := CylinderMesh.new()
	mesh.top_radius = radius
	mesh.bottom_radius = radius
	mesh.height = height
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.35, 0.37, 0.4)
	mesh.material = mat
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	body.add_child(mi)
	add_child(body)
	return body
