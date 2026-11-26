class_name YardTest
extends TestCase
## Base for scene tests in the `VehicleYard`: a yard per test, helpers that wait in game time.

var yard: VehicleYard


func before_each() -> void:
	yard = VehicleYard.new()
	root.add_child(yard)
	await wait_physics_frames(2)


func spawn(variant: StringName, at: Vector3, heading: float = 0.0) -> Vehicle:
	var v := yard.spawn(variant, at, heading, &"ride")
	await wait_physics_frames(30)
	return v


## Get in at once from beside the door (the walk is short), waiting until driving.
func board(v: Vehicle) -> bool:
	yard.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
	await wait_physics_frames(1)
	check(yard.driving.enter(v), "enter %s" % v.id)
	return await wait_until(func() -> bool: return yard.driving.mode() == &"driving", 60 * 8)


## Hold GAS (and steering) for `seconds` of game time, then let go.
func hold_gas(seconds: float, steer: float = 0.0) -> void:
	yard.driving.gas = true
	yard.driving.steer = steer
	await wait_game_seconds(seconds)
	yard.driving.gas = false
	yard.driving.steer = 0.0


func hold_brake(seconds: float) -> void:
	yard.driving.brake = true
	await wait_game_seconds(seconds)
	yard.driving.brake = false


## Metres moved along the vehicle's heading at `from` (negative: backwards).
static func along(v: Vehicle, from: Vector3, heading: float) -> float:
	var d := v.global_position - from
	return d.x * -sin(heading) + d.z * -cos(heading)
