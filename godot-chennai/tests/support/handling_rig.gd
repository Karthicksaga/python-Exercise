class_name HandlingRig
extends RefCounted
## A vehicle alone on a large flat plane, driven step by step in game time with fixed controls,
## measuring what `tools/reference/threejs_handling.mts` measures in the Three.js game (G-71).

const DT := 1.0 / 60.0

var tree: SceneTree
var holder: Node3D
var car: RaycastVehicle
var peak_slip := 0.0
var peak_drifting := 0.0
var peak_jolt := 0.0
## Heading change summed step by step (not wrapped).
var turned := 0.0
var _last_v := Vector2.ZERO
var _last_yaw := 0.0


static func ground(parent: Node, half: float = 1500.0) -> StaticBody3D:
	var body := StaticBody3D.new()
	body.name = "Ground"
	body.collision_layer = PhysicsLayers.WORLD
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(half * 2.0, 1.0, half * 2.0)
	shape.shape = box
	shape.position = Vector3(0, -0.5, 0)
	body.add_child(shape)
	parent.add_child(body)
	return body


## One vehicle of `kind` on the plane, `lane` lanes (40 m) east of the first, settled for
## `settle` seconds with no input. The plane comes with lane 0 (several rigs share one).
static func create(test_tree: SceneTree, parent: Node, kind: StringName, settle: float = 1.0, lane: int = 0) -> HandlingRig:
	var rig := HandlingRig.new()
	rig.tree = test_tree
	rig.holder = Node3D.new()
	parent.add_child(rig.holder)
	if lane == 0:
		ground(rig.holder)
	var t := VehicleCatalog.type(kind)
	rig.car = RaycastVehicle.new()
	rig.car.setup(t.spec)
	rig.car.position = Vector3(-1300 + lane * 40.0, t.ride_height + 0.1, 1200)
	rig.holder.add_child(rig.car)
	await test_tree.physics_frame
	await rig.run(0, 0, 0, settle)
	rig.reset()
	return rig


func reset() -> void:
	peak_slip = 0.0
	peak_drifting = 0.0
	peak_jolt = 0.0


func step(throttle: float, steer: float, brake: float) -> void:
	car.set_controls(throttle, steer, brake)
	await tree.physics_frame
	var v := car.planar_velocity()
	var y := car.yaw()
	var dyaw := wrapf(y - _last_yaw, -PI, PI)
	turned += dyaw
	var basis := car.global_basis
	var right := car.linear_velocity.dot(basis.x) + dyaw / DT * car.spec.rear_axle()
	peak_slip = maxf(peak_slip, absf(atan2(right, absf(car.forward_speed()))))
	peak_drifting = maxf(peak_drifting, car.drifting())
	peak_jolt = maxf(peak_jolt, v.distance_to(_last_v))
	_last_v = v
	_last_yaw = y


func run(throttle: float, steer: float, brake: float, seconds: float) -> void:
	for i in roundi(seconds / DT):
		await step(throttle, steer, brake)


## Full throttle in a straight line until `speed` m/s, then forget the peaks.
func run_up(speed: float) -> void:
	for i in 3000:
		if car.forward_speed() >= speed:
			break
		await step(1, 0, 0)
	reset()
