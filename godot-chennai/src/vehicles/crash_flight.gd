class_name CrashFlight
extends RefCounted
## A body thrown from a crash (TD-29, decision G-75): it flies with the launch velocity under
## gravity using the character's own `move_and_slide`, so walls and the ground stop it exactly as
## they stop walking (a wall ahead: it slides along it, keeping 70 % of the speed); it scrapes
## along the ground at 9 m/s², lies still for `lie_for` seconds, and gets up in 0.75 s.
## Swept motion (`move_and_slide`) cannot tunnel through a wall at these speeds.

const SCRAPE := 9.0
const WALL_KEEP := 0.7
const RISE_TIME := 0.75
## A flight longer than this ends where it is (fell off the world, stuck on something).
const MAX_FLIGHT := 6.0

## &"" (not thrown), &"flying", &"sliding", &"lying", &"rising".
var phase: StringName = &""
var lie_for := 0.0
## The vehicle the body left: passed through until the body is up.
var vehicle: PhysicsBody3D
## Highest point above the start reached in the flight (for tests and the camera).
var peak_height := 0.0
var _time := 0.0
var _start_y := 0.0
var _hit_wall := false


func active() -> bool:
	return phase != &""


func start(launch: Vector3, lie_seconds: float, from_vehicle: PhysicsBody3D) -> void:
	phase = &"flying"
	lie_for = lie_seconds
	vehicle = from_vehicle
	_time = 0.0
	peak_height = 0.0
	_start_y = NAN
	_hit_wall = false
	_launch = launch


var _launch := Vector3.ZERO


## Advance one physics step on `body`. Returns true on the step it lands.
func step(body: CharacterBody3D, dt: float) -> bool:
	if is_nan(_start_y):
		_start_y = body.global_position.y
		body.velocity = _launch
	_time += dt
	match phase:
		&"flying":
			body.velocity.y -= RaycastVehicle.GRAVITY * dt
			body.move_and_slide()
			peak_height = maxf(peak_height, body.global_position.y - _start_y)
			if body.is_on_wall() and not _hit_wall:
				_hit_wall = true
				body.velocity.x *= WALL_KEEP
				body.velocity.z *= WALL_KEEP
			if (body.is_on_floor() and body.velocity.y <= 0.0 and _time > 0.05) or _time > MAX_FLIGHT:
				phase = &"sliding"
				_time = 0.0
				return true
		&"sliding":
			var flat := Vector2(body.velocity.x, body.velocity.z)
			var speed := maxf(0.0, flat.length() - SCRAPE * dt)
			flat = flat.normalized() * speed if speed > 0.0 else Vector2.ZERO
			body.velocity = Vector3(flat.x, body.velocity.y - RaycastVehicle.GRAVITY * dt, flat.y)
			body.move_and_slide()
			if speed <= 0.0:
				phase = &"lying"
				_time = 0.0
		&"lying":
			body.velocity = Vector3(0, -1.0, 0)
			body.move_and_slide()
			if _time >= lie_for:
				phase = &"rising"
				_time = 0.0
		&"rising":
			if _time >= RISE_TIME:
				phase = &""
	return false


## How far the body is tipped over: 0 upright, 1 lying (it dives head first and lands on its back).
func tip() -> float:
	match phase:
		&"flying":
			return minf(1.0, _time / 0.35)
		&"sliding", &"lying":
			return 1.0
		&"rising":
			return 1.0 - Boarding.ease_in_out(_time / RISE_TIME)
	return 0.0
