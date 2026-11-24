class_name MissionsGround
extends Node3D
## A flat 3 km ground at the city's height with the player, `Driving` and a `MissionsLayer` on
## it (world metres = scene metres: no origin shift), for the missions' scene tests. The content
## is the real baked content, so markers and parked vehicles are where the city has them; only
## the streets and buildings are missing. Not a test file.

const HALF := 1500.0

var rig: PlayerRig
var driving: Driving
var layer: MissionsLayer


static func make(save_path: String) -> MissionsGround:
	var g := MissionsGround.new()
	g.name = "MissionsGround"
	g._build(save_path)
	return g


func _build(save_path: String) -> void:
	var body := StaticBody3D.new()
	body.name = "Ground"
	body.collision_layer = PhysicsLayers.WORLD
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(HALF * 2.0, 1.0, HALF * 2.0)
	shape.shape = box
	shape.position = Vector3(0, -0.5, 0)
	body.add_child(shape)
	add_child(body)
	rig = PlayerRig.new()
	rig.name = "PlayerRig"
	rig.reads_devices = false
	add_child(rig)
	driving = Driving.new()
	driving.name = "Driving"
	driving.rider = PlayerRiderLink.make(rig.body)
	add_child(driving)
	layer = MissionsLayer.new(save_path)
	layer.spawn_parking = true
	add_child(layer)


func _ready() -> void:
	layer.figures.load_models = false
	layer.setup(null, rig, driving)


## The player on foot at a world point (x, z), facing north.
func put_player(x: float, z: float) -> void:
	rig.place(Vector3(x, 0.05, z), 0.0)
