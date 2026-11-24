class_name RiderLink
extends RefCounted
## How `Driving` moves the person who gets in, drives, gets out and is thrown (decision G-77).
## The vehicles module may not use the player module (AGENTS.md), so the composition root hands
## `Driving` a subclass that talks to the real player (`PlayerRiderLink` in `src/app/`, over
## `PlayerController.enter_vehicle` / `exit_vehicle` / `controls_enabled`).
##
## The crash throw (TD-29) is done here for any `CharacterBody3D`: the player's own movement is
## paused (`_own_control(false)`) and `CrashFlight` moves the body with `move_and_slide`, so walls
## and the ground stop it as they stop walking; control comes back once it is up. Health is kept
## here until Combat owns it.

## The person's body (its origin at the feet).
var body: CharacterBody3D
var health: float = 100.0
var flight := CrashFlight.new()
var _landed := false
var _from: PhysicsBody3D = null


## Off their feet for a vehicle: no own movement or collision; `place`/`hold` move them.
func begin_ride(_vehicle: Node3D) -> void:
	pass


## Back on foot at `feet`, facing `yaw` (0 = -Z), in control.
func end_ride(_feet: Vector3, _yaw: float) -> void:
	pass


## Put the feet at a scene position facing `yaw` (riding: the point the body follows).
func place(_feet: Vector3, _yaw: float) -> void:
	pass


## While seated: the body's place is the seat's (the driver's hip point and the vehicle's turn).
func hold(_seat: Transform3D) -> void:
	pass


## The seated pose of a vehicle type, 0 standing to 1 seated; null stands up.
func set_seated(_type: VehicleType, _amount: float) -> void:
	pass


## Shown or hidden (closed vehicles hide their driver).
func set_figure_visible(_on: bool) -> void:
	pass


## The player's own movement and input on or off (off during a throw).
func _own_control(_on: bool) -> void:
	pass


func position() -> Vector3:
	return body.global_position


func world() -> World3D:
	return body.get_world_3d()


func hurt(damage: float) -> void:
	health = maxf(0.0, health - damage)


## Thrown from a crash: from `start`, with `launch` (m/s), lying `lie_for` seconds once stopped,
## passing through `vehicle` until up.
func throw_off(start: Vector3, launch: Vector3, lie_for: float, vehicle: PhysicsBody3D) -> void:
	set_seated(null, 0.0)
	set_figure_visible(true)
	end_ride(start, atan2(-launch.x, -launch.z))
	_own_control(false)
	_from = vehicle
	if vehicle != null:
		body.add_collision_exception_with(vehicle)
	flight.start(launch, lie_for, vehicle)


## &"" on foot or riding, else the throw's phase (&"flying", &"sliding", &"lying", &"rising").
func knockdown() -> StringName:
	return flight.phase


## True once, on the step a thrown body lands.
func consume_landing() -> bool:
	var l := _landed
	_landed = false
	return l


## Called by `Driving` every physics step.
func physics_step(dt: float) -> void:
	if not flight.active():
		return
	if flight.step(body, dt):
		_landed = true
	_show_knockdown(flight.tip())
	if not flight.active():
		if _from != null and is_instance_valid(_from):
			body.remove_collision_exception_with(_from)
		_from = null
		_show_knockdown(0.0)
		_own_control(true)


## Hook: draw a thrown body tipped over (`tip` 0 upright to 1 lying on its back).
func _show_knockdown(_tip: float) -> void:
	pass
