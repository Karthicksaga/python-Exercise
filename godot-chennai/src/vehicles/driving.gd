class_name Driving
extends Node
## Driving, getting in and out, and crashes (decisions G-74, G-75, G-77): turns what the player
## presses into a vehicle's controls through the `Gearbox`, runs the `Boarding` sequences that
## move the rider (a `RiderLink`) to and from the seat, judges crashes (`CrashRules`) and throws the
## rider off. A port of the vehicle parts of the Three.js `Game.ts`, `Boarder.ts` and
## `Crashes.ts`; it holds no world or mission logic.
##
## Wire it with a `rider` (`PlayerRiderLink` for the real player); the composition root connects the camera and the touch controls
## (`DrivingWiring` in `src/app/`), so this module uses no UI or camera code (AGENTS.md module
## boundaries). Input: the keyboard and pad actions of `DriveInput` plus the touch state the
## wiring copies into `touch_gas`, `touch_brake`, `touch_steer`; tests set `gas`, `brake`,
## `steer` directly.

## Faster than this (m/s) the driver cannot get out ("Stop the vehicle first").
const EXIT_SPEED := 2.5
## Vehicles this close (metres from the chassis edge) offer "Get in".
const ENTER_REACH := 2.5
## The steering beyond this sends a thrown body to that side; otherwise to the left (the kerb).
const STEER_SIDE := 0.2
## Feet this high above the road as the body leaves the seat (about the footpegs).
const START_LIFT := 0.35
## How far the body's start is kept from any wall (the capsule's radius plus a margin).
const CLEARANCE := 0.42

signal mode_changed(mode: StringName)
## A short message for the player.
signal toast(text: String)
## A crash was judged (shaken or thrown); `outcome` is a `CrashRules.Outcome`.
signal crashed(vehicle: Vehicle, outcome: CrashRules.Outcome)
## The horn (or, on siren vehicles, the siren switch) was pressed.
signal horn(vehicle: Vehicle)
## A boarding event: &"door_opening", &"seated", &"shut", &"free", &"done".
signal boarding_event(vehicle: Vehicle, event: StringName)

var rider: RiderLink

## Touch controls held (copied in by the composition root each step).
var touch_gas := false
var touch_brake := false
var touch_steer := 0.0

## Held inputs (set by `DriveInput`/the touch controls, or directly by tests).
var gas := false
var brake := false
var steer := 0.0

var gearbox := Gearbox.new()
## The vehicle being driven (seated, in control), else null.
var vehicle: Vehicle = null
## The vehicle being got into or out of, else null.
var boarding_vehicle: Vehicle = null
var boarding: Boarding = null
## The last crash judged above a bump (tests, HUD).
var last_crash: CrashRules.Outcome = null

var _mode: StringName = &"foot"
var _path := PackedVector2Array()
var _thrown_from: Vehicle = null
var _pending_damage := 0.0
var _input := DriveInput.new()


func _ready() -> void:
	process_physics_priority = -10
	_input.register_actions()


## &"foot", &"boarding" (getting in or out), &"driving", &"thrown".
func mode() -> StringName:
	return _mode


func _set_mode(m: StringName) -> void:
	if m == _mode:
		return
	_mode = m
	mode_changed.emit(m)


## The nearest vehicle the rider can get into, or null.
func nearest_vehicle() -> Vehicle:
	if rider == null or _mode != &"foot":
		return null
	var best: Vehicle = null
	var best_gap := ENTER_REACH
	for node in get_tree().get_nodes_in_group(Vehicle.GROUP):
		var v := node as Vehicle
		if v == null or v.is_driven():
			continue
		var local := v.global_transform.affine_inverse() * rider.position()
		var h := v.type.spec.half_extents
		var gap := Vector2(maxf(0.0, absf(local.x) - h.x), maxf(0.0, absf(local.z) - h.z)).length()
		if gap < best_gap:
			best_gap = gap
			best = v
	return best


## Start getting into `v` (walk to the door, open, sit, shut). False if not possible now.
func enter(v: Vehicle, pull: bool = false) -> bool:
	if v == null or _mode != &"foot" or v.is_driven() or boarding != null:
		return false
	var local := v.global_transform.affine_inverse() * rider.position()
	var h := v.type.spec.half_extents
	_path = Boarding.approach_path(Vector2(local.x, local.z), v.type.entry, Vector2(h.x, h.z))
	boarding = Boarding.new("in", v.type.entry, Boarding.path_length(_path), _aisle_length(v.type), pull)
	boarding_vehicle = v
	v.upright()
	rider.begin_ride(v)
	_set_mode(&"boarding")
	return true


## Start getting out. Refused (false, with a toast) while moving faster than `EXIT_SPEED`.
func exit() -> bool:
	if _mode != &"driving" or vehicle == null:
		return false
	if absf(vehicle.forward_speed()) > EXIT_SPEED:
		toast.emit("Stop the vehicle first")
		return false
	var v := vehicle
	v.set_siren(false)
	v.park()
	if _door_side_blocked(v):
		_leave_at_once(v)
		return true
	vehicle = null
	boarding_vehicle = v
	boarding = Boarding.new("out", v.type.entry, 0.0, _aisle_length(v.type))
	_set_mode(&"boarding")
	return true


## Stop a sequence at once (teleport, new game): getting in, back on foot; getting out, seated.
func cancel_boarding() -> void:
	if boarding == null:
		return
	var v := boarding_vehicle
	var dir := boarding.direction
	boarding = null
	boarding_vehicle = null
	v.set_door(0.0)
	if dir == "in":
		_stand_beside(v)
	else:
		_seat(v)


func select_gear(g: String) -> void:
	if vehicle != null:
		gearbox.select(g, vehicle.forward_speed())
		var hint := gearbox.consume_hint()
		if hint != "":
			toast.emit(hint)


func press_horn() -> void:
	if vehicle == null:
		return
	if vehicle.has_siren():
		vehicle.set_siren(not vehicle.siren())
	horn.emit(vehicle)


## The HUD's gear label (P, R, N, D, D1…), or "" on foot.
func gear_label() -> String:
	return gearbox.label(vehicle.type, vehicle.forward_speed()) if vehicle != null else ""


func _physics_process(delta: float) -> void:
	if rider == null:
		return
	_input.read(self)
	rider.physics_step(delta)
	if boarding != null:
		_boarding_step(delta)
	match _mode:
		&"driving":
			_drive_step()
		&"thrown":
			_thrown_step()


## What the camera should follow now: the vehicle driven or being boarded, else the rider.
func camera_target() -> Node3D:
	if _mode == &"driving" and vehicle != null:
		return vehicle
	if boarding_vehicle != null and _mode == &"boarding":
		return boarding_vehicle
	return rider.body


func _drive_step() -> void:
	var v := vehicle
	var c := gearbox.controls(gas, brake, steer, v.forward_speed())
	v.set_controls(c.throttle, c.steer, c.brake)
	var hint := gearbox.consume_hint()
	if hint != "":
		toast.emit(hint)
	_hold_seat(v)
	var impact := v.consume_impact()
	if impact <= 0.0:
		return
	var side := 1 if steer > STEER_SIDE else -1
	var outcome := CrashRules.judge(v.type.crash, impact, v.approach_velocity(), side)
	if outcome.type == &"none":
		return
	last_crash = outcome
	crashed.emit(v, outcome)
	if outcome.type == &"shaken":
		rider.hurt(outcome.damage)
		return
	_throw(v, outcome)


func _throw(v: Vehicle, outcome: CrashRules.Outcome) -> void:
	vehicle = null
	v.park()
	v.set_siren(false)
	var seat := v.global_transform * v.type.driver
	var start := Vector3(seat.x, v.global_position.y + v.model.position.y + START_LIFT, seat.z)
	start = _keep_clear(start, v)
	rider.throw_off(start, outcome.launch, outcome.lie_for, v)
	if outcome.topples:
		# The body goes one way, the bike falls the other.
		var toward := outcome.launch.dot(v.global_basis.x)
		v.topple(-1 if toward > 0.0 else 1)
	_pending_damage = outcome.damage
	_thrown_from = v
	_set_mode(&"thrown")


func _thrown_step() -> void:
	if rider.consume_landing():
		rider.hurt(_pending_damage)
		_pending_damage = 0.0
	if rider.knockdown() == &"":
		_thrown_from = null
		_set_mode(&"foot")


func _boarding_step(dt: float) -> void:
	var v := boarding_vehicle
	var b := boarding
	for e in b.step(dt):
		boarding_event.emit(v, e)
		if e == &"free":
			_stand_beside(v)
	if b.done():
		boarding = null
		boarding_vehicle = null
		v.set_door(0.0)
		if b.direction == "in":
			_seat(v)
		elif _mode != &"foot":
			_stand_beside(v)
		return
	v.set_door(b.door())
	if b.direction == "out" and b.is_free():
		return
	_pose_boarding(v, b)


## Where the rider is during a sequence: on the walk, at the door, along the aisle, sitting down.
func _pose_boarding(v: Vehicle, b: Boarding) -> void:
	var heading := v.yaw()
	var phase := b.phase()
	if b.direction == "in" and phase == &"approach":
		var p := Boarding.along_path(_path, b.walk())
		rider.place(v.ground_point(Vector2(p.x, p.y)), heading + p.z)
		return
	var standing := _standing_point(v, b.aisle())
	var hips := v.rider_transform().origin
	var sit := b.seated()
	rider.set_figure_visible(v.type.open_seat or sit < 0.5 or v.type.entry.door == "none")
	rider.set_seated(v.type if sit > 0.0 else null, sit)
	# Turned to face forwards once on the seat; beside the door, facing it.
	var facing := heading + (-v.type.entry.side * PI / 2.0 if sit <= 0.0 and v.type.entry.aisle.is_empty() else 0.0)
	rider.place(standing.lerp(hips, Boarding.ease_in_out(sit)), lerp_angle(facing, heading, sit))


## The point a share `f` of the way from the door (on the ground) along the aisle, in scene space.
func _standing_point(v: Vehicle, f: float) -> Vector3:
	var door := v.ground_point(v.type.entry.point)
	var aisle := v.type.entry.aisle
	if aisle.is_empty() or f <= 0.0:
		return door
	var points: Array[Vector3] = [door]
	for a in aisle:
		points.append(v.global_transform * a)
	var total := 0.0
	for i in range(1, points.size()):
		total += points[i].distance_to(points[i - 1])
	var left := f * total
	for i in range(1, points.size()):
		var leg := points[i].distance_to(points[i - 1])
		if left <= leg:
			return points[i - 1].lerp(points[i], left / leg if leg > 0.0 else 1.0)
		left -= leg
	return points[points.size() - 1]


func _aisle_length(t: VehicleType) -> float:
	var length := 0.0
	var prev := Vector3(t.entry.point.x, t.entry.aisle[0].y if not t.entry.aisle.is_empty() else 0.0, t.entry.point.y)
	for a in t.entry.aisle:
		length += a.distance_to(prev)
		prev = a
	return length


## Seated and in control (the end of getting in, or at once).
func _seat(v: Vehicle) -> void:
	vehicle = v
	v.take_controls()
	rider.set_seated(v.type, 1.0)
	rider.set_figure_visible(v.type.open_seat)
	gearbox.reset("D")
	_hold_seat(v)
	_set_mode(&"driving")


func _hold_seat(v: Vehicle) -> void:
	var t := v.rider_transform()
	rider.hold(Transform3D(t.basis.orthonormalized(), t.origin))


## On foot beside the door (or wherever there is room), in control.
func _stand_beside(v: Vehicle) -> void:
	rider.set_seated(null, 0.0)
	rider.set_figure_visible(true)
	rider.end_ride(_exit_point(v), v.yaw())
	_set_mode(&"foot")


func _exit_point(v: Vehicle) -> Vector3:
	var p := v.ground_point(v.type.entry.point)
	p.y += 0.05
	return p


func _door_side_blocked(v: Vehicle) -> bool:
	var from := v.global_transform * Vector3(0, 0, v.type.entry.point.y)
	from.y = v.global_position.y + v.model.position.y + 0.9
	var to := from + v.global_basis.x * float(v.type.entry.side) * (v.type.spec.half_extents.x + 1.4)
	return _ray(from, to, v) >= 0.0


## The door side is blocked: out at once on whichever side (left, right, behind) has room.
func _leave_at_once(v: Vehicle) -> void:
	var centre := v.global_position
	centre.y = v.global_position.y + v.model.position.y + 0.9
	var h := v.type.spec.half_extents
	var dirs: Array[Vector3] = [-v.global_basis.x, v.global_basis.x, v.global_basis.z]
	var reach: Array[float] = [h.x + 0.9, h.x + 0.9, h.z + 0.9]
	var pick := 0
	for i in dirs.size():
		if _ray(centre, centre + dirs[i] * (reach[i] + 0.5), v) < 0.0:
			pick = i
			break
	vehicle = null
	var out := centre + dirs[pick] * reach[pick]
	out.y = v.global_position.y + v.model.position.y + 0.05
	rider.set_seated(null, 0.0)
	rider.set_figure_visible(true)
	rider.end_ride(out, v.yaw())
	_set_mode(&"foot")


## Distance to the first solid along a segment (excluding `skip`), or -1.
func _ray(from: Vector3, to: Vector3, skip: CollisionObject3D) -> float:
	var q := PhysicsRayQueryParameters3D.create(from, to, PhysicsLayers.WORLD | PhysicsLayers.VEHICLES)
	if skip != null:
		q.exclude = [skip.get_rid()]
	var hit := rider.world().direct_space_state.intersect_ray(q)
	return -1.0 if hit.is_empty() else from.distance_to(hit["position"] as Vector3)


## Move a point away from walls it is closer to than the capsule's radius (rays at waist height).
func _keep_clear(at: Vector3, skip: CollisionObject3D) -> Vector3:
	var p := at
	for pass_i in 2:
		for i in 8:
			var a := i / 8.0 * TAU
			var dir := Vector3(sin(a), 0, cos(a))
			var waist := p + Vector3(0, 0.6, 0)
			var d := _ray(waist, waist + dir * CLEARANCE, skip)
			if d < 0.0:
				continue
			p -= dir * (CLEARANCE - d)
	return p
