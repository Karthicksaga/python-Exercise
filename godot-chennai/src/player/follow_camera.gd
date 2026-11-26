class_name FollowCamera
extends Node3D
## Third-person orbit camera that also chases vehicles (port of the Three.js `FollowCamera`
## with the chase-camera rules of `chennai-game-design` §5 and MIGRATION_PROMPT §10; G-65).
##
## - Drag to look: `look(dx, dy)` in UI units turns yaw and pitch (pitch clamped).
## - Follows a target's feet smoothly (frame-rate independent, `1 - exp(-rate * dt)`), snapping
##   on the first step and after a jump of more than 8 m (respawn, teleport).
## - Looks ahead along the target's velocity, more the faster it goes (on foot a little, in a
##   vehicle up to 7 m), eased so a sudden stop glides back; faded out while the player looks
##   around.
## - Collision: a sphere is swept from the focus towards the camera. A wall or anything thick
##   pulls the camera in at once (never inside or behind geometry); a thin obstacle (a pole, a
##   person) the camera could see past eases it in slowly instead of snapping, and it eases back
##   out when the view clears. Either way the camera is never left inside a collider.
## - `chase(...)` each step while driving: swing behind the direction of travel, pull back and
##   widen a little with speed.
##
## - Shake on impacts (`add_trauma`, `game-feel` trauma, G-274): the lens is offset and rolled by
##   trauma² so taps barely move it and crashes punch; trauma decays to 0 in 1/`SHAKE_DECAY` s.
##   Visual only (never moves the rig or the probe), and `shake_strength` 0 (reduced motion)
##   turns it off.
##
## Runs in the physics step after the target has moved (`process_physics_priority`), so
## following a 60 Hz body never jitters (TD-6).

## Radians per UI unit dragged (the Three.js value per CSS pixel).
const SENSITIVITY := 0.0055
const MIN_PITCH := -0.2
const MAX_PITCH := 1.15
## Distance behind a person on foot, metres, and the closest it comes.
## MIN_DISTANCE 0.9→1.6: prevents the camera from diving into the player's back
## when a wall is directly behind the player (the probe sphere was clipping the body).
const DISTANCE := 5.6
const MIN_DISTANCE := 1.6
## Height above the feet that the camera looks at (about the shoulders).
## LOOK_HEIGHT 1.5→1.65: raises the focus above the shoulder blades so at min distance
## the view is still above the collar, not into the torso.
const LOOK_HEIGHT := 1.65
const FOLLOW_RATE := 14.0
const SNAP_DISTANCE := 8.0
## Look-ahead: seconds of travel ahead on foot and in a vehicle, at most this far, eased at this rate.
const LEAD_TIME_FOOT := 0.15
const LEAD_TIME_CHASE := 0.3
const MAX_LEAD := 7.0
const LEAD_RATE := 2.5
## After the player drags the view, no trailing and no look-ahead for this long, seconds.
const LOOK_HOLD := 1.5
## Chase: extra distance (m) and field of view (degrees) at top speed; trail travel above this (m/s).
const SPEED_REACH := 1.4
const SPEED_FOV := 7.0
const TRAVEL_TRAIL_FROM := 3.0
const TRAIL_RATE := 2.6
## Collision: probe radius (larger than the near plane's half size), gap kept from a hit, metres.
const PROBE_RADIUS := 0.28
const MARGIN := 0.15
## An obstacle along the view thinner than this is a pole or a person, not a wall, metres.
const THIN := 0.8
## Easing in front of a thin obstacle and back out when the view clears, per second.
const EASE_IN_THIN := 2.5
const EASE_OUT := 4.0
const BASE_FOV := 60.0
## Physics layers that block the view (world, people, vehicles; not the player).
const VIEW_MASK := 1 | 4 | 8

## Heading: 0 looks towards -Z (north). The camera sits behind the focus.
var yaw: float = 0.0
var pitch: float = 0.32
## How far behind the target the camera wants to be (vehicles set more).
var reach: float = DISTANCE
## The followed body (its feet are its origin) and bodies the view ignores.
var target: Node3D = null
var exclude: Array[RID] = []
## Current distance from the focus, metres.
var distance: float = DISTANCE
## Why the camera is in, for tests: &"clear", &"thin" or &"wall".
var blocked: StringName = &"clear"
var camera: Camera3D = null
var _focus: Vector3 = Vector3.ZERO
var _lead: Vector3 = Vector3.ZERO
var _pace: float = 0.0
var _since_look: float = 10.0
var _primed: bool = false
var _last_target: Vector3 = Vector3.ZERO
var _velocity: Vector3 = Vector3.ZERO
var _chasing: Dictionary = {}
var _probe: SphereShape3D = SphereShape3D.new()

## Trauma lost per second; the lens offset (metres) and roll (radians) at full trauma.
const SHAKE_DECAY := 1.6
const SHAKE_OFFSET := 0.16
const SHAKE_ROLL := 0.04
## 0..1 how hard the camera is shaking (impacts add to it).
var trauma: float = 0.0
## The player's shake setting: 1 full, 0 off (reduced motion).
var shake_strength: float = 1.0
var _shake_clock: float = 0.0


func _init() -> void:
	top_level = true
	process_physics_priority = 100
	camera = Camera3D.new()
	camera.name = "Camera"
	camera.fov = BASE_FOV
	camera.near = 0.25
	camera.far = 750.0
	add_child(camera)
	_probe.radius = PROBE_RADIUS


## Follows `body` (a CharacterBody3D or any physics body: its own collider is ignored).
func follow(body: Node3D) -> void:
	target = body
	exclude.clear()
	var co := body as CollisionObject3D
	if co != null:
		exclude.append(co.get_rid())
	_primed = false


## Applies a drag of (dx, dy) UI units: right turns the view right, down tilts it up.
func look(dx: float, dy: float) -> void:
	if dx != 0.0 or dy != 0.0:
		_since_look = 0.0
	yaw -= dx * SENSITIVITY
	pitch = clampf(pitch + dy * SENSITIVITY, MIN_PITCH, MAX_PITCH)


## An impact: adds to the trauma (hits add, they don't reset), at most 1.
func add_trauma(amount: float) -> void:
	trauma = clampf(trauma + maxf(0.0, amount), 0.0, 1.0)


## The lens offset now (metres, x right and y up): 0 at rest.
func shake_offset() -> Vector2:
	return Vector2(camera.h_offset, camera.v_offset)


func _shake(dt: float) -> void:
	if trauma <= 0.0 and camera.h_offset == 0.0 and camera.v_offset == 0.0:
		return
	trauma = maxf(0.0, trauma - SHAKE_DECAY * dt)
	_shake_clock += dt
	var k := trauma * trauma * clampf(shake_strength, 0.0, 1.0)
	var t := _shake_clock
	# Three incommensurate sines per axis: noise-like, no allocation, no Noise resource.
	camera.h_offset = SHAKE_OFFSET * k * (sin(t * 37.0) * 0.6 + sin(t * 61.0 + 1.3) * 0.4)
	camera.v_offset = SHAKE_OFFSET * k * (sin(t * 43.0 + 0.7) * 0.6 + sin(t * 71.0 + 2.1) * 0.4)
	camera.rotation.z = SHAKE_ROLL * k * (sin(t * 29.0 + 2.9) * 0.7 + sin(t * 53.0) * 0.3)


## Hard cut to the target (after a respawn or a teleport).
func snap() -> void:
	_primed = false


## Chase a vehicle this step (call before the step's update, while driving): `velocity` m/s,
## `heading` the way it points (yaw), `forward_speed` along it (negative reversing).
func chase(velocity: Vector3, heading: float, forward_speed: float, top_speed: float, dt: float) -> void:
	_chasing = {"velocity": velocity, "top": top_speed}
	if absf(forward_speed) <= 1.5 or _since_look < LOOK_HOLD:
		return
	# Forwards at speed, follow the travel so a drift shows the car sliding; else the nose.
	var travel := atan2(-velocity.x, -velocity.z) if forward_speed > TRAVEL_TRAIL_FROM else heading
	yaw += wrapf(travel - yaw, -PI, PI) * minf(1.0, dt * TRAIL_RATE)


func _physics_process(dt: float) -> void:
	if target != null and target.is_inside_tree():
		update(dt)


## The unit vector from the focus to the camera.
func direction() -> Vector3:
	return Vector3(sin(yaw) * cos(pitch), sin(pitch), cos(yaw) * cos(pitch))


func focus() -> Vector3:
	return _focus


func update(dt: float) -> void:
	_since_look += dt
	var chase_now := _chasing
	_chasing = {}
	var feet := target.global_position
	var aim := feet + Vector3(0.0, LOOK_HEIGHT, 0.0)
	var snapping := not _primed or Vector2(feet.x - _focus.x, feet.z - _focus.z).length() > SNAP_DISTANCE
	if snapping:
		_focus = aim
		_lead = Vector3.ZERO
		_velocity = Vector3.ZERO
		distance = reach
	else:
		var follow_k := 1.0 - exp(-FOLLOW_RATE * dt)
		# A vehicle's height is followed more softly, so suspension bumps don't shake the view.
		var follow_y := 1.0 - exp(-5.0 * dt) if not chase_now.is_empty() else follow_k
		_focus.x += (aim.x - _focus.x) * follow_k
		_focus.z += (aim.z - _focus.z) * follow_k
		_focus.y += (aim.y - _focus.y) * follow_y
		if dt > 0.0:
			_velocity = (feet - _last_target) / dt
	_last_target = feet
	_primed = true

	# Look ahead along the travel; eased, and faded out while the player looks around.
	var lead := Vector3.ZERO
	var pace := 0.0
	var moving := Vector3(_velocity.x, 0.0, _velocity.z)
	if not chase_now.is_empty():
		moving = chase_now["velocity"]
		moving.y = 0.0
		pace = minf(1.0, moving.length() / maxf(1.0, float(chase_now["top"])))
	if _since_look >= LOOK_HOLD:
		lead = moving * (LEAD_TIME_FOOT if chase_now.is_empty() else LEAD_TIME_CHASE)
		if lead.length() > MAX_LEAD:
			lead = lead.normalized() * MAX_LEAD
	var ease := 1.0 if snapping else 1.0 - exp(-LEAD_RATE * dt)
	_lead += (lead - _lead) * ease
	_pace += (pace - _pace) * ease
	camera.fov = BASE_FOV + SPEED_FOV * _pace * _pace
	var want := reach + (SPEED_REACH * _pace if not chase_now.is_empty() else 0.0)

	var dir := direction()
	var hit := _sweep(_focus, dir, want)
	if hit < 0.0:
		blocked = &"clear"
		distance += (want - distance) * (1.0 - exp(-EASE_OUT * dt))
		distance = minf(distance, want)
	else:
		var allowed := maxf(MIN_DISTANCE, hit - MARGIN)
		if _thin(dir, want, hit):
			# A pole or a person: ease in, don't snap; the view clears again as they pass.
			blocked = &"thin"
			if allowed < distance:
				distance += (allowed - distance) * (1.0 - exp(-EASE_IN_THIN * dt))
			else:
				distance += (allowed - distance) * (1.0 - exp(-EASE_OUT * dt))
		else:
			blocked = &"wall"
			distance = allowed if allowed < distance else distance + (allowed - distance) * (1.0 - exp(-EASE_OUT * dt))
	# Never left inside a collider, whatever the easing.
	if _inside(_focus + dir * distance):
		distance = maxf(MIN_DISTANCE, (hit if hit >= 0.0 else distance) - MARGIN)
		var tries := 0
		while _inside(_focus + dir * distance) and distance > 0.3 and tries < 20:
			distance -= 0.1
			tries += 1
	global_position = _focus + dir * distance
	var look_at_point := _focus + Vector3(_lead.x, 0.0, _lead.z)
	if global_position.distance_to(look_at_point) > 0.01:
		look_at(look_at_point, Vector3.UP)
	if snapping:
		reset_physics_interpolation()
	_shake(dt)


## Distance along `dir` from `from` at which the probe sphere first touches a view blocker,
## or -1 when it reaches `length` clear.
func _sweep(from: Vector3, dir: Vector3, length: float) -> float:
	var space := get_world_3d().direct_space_state
	var q := PhysicsShapeQueryParameters3D.new()
	q.shape = _probe
	q.transform = Transform3D(Basis.IDENTITY, from)
	q.motion = dir * length
	q.collision_mask = VIEW_MASK
	q.exclude = exclude
	var r := space.cast_motion(q)
	if r.is_empty() or r[0] >= 1.0:
		return -1.0
	return r[0] * length


## True when the obstacles between the focus and the wanted camera place are thin (seen past):
## the place itself is free, and sweeping back from it meets the obstacle within THIN of where
## the forward sweep met it.
func _thin(dir: Vector3, want: float, hit: float) -> bool:
	var place := _focus + dir * want
	if _inside(place):
		return false
	var back := _sweep(place, -dir, want)
	if back < 0.0:
		return true
	var exit := want - back
	return exit - hit < THIN


func _inside(at: Vector3) -> bool:
	var space := get_world_3d().direct_space_state
	var q := PhysicsShapeQueryParameters3D.new()
	q.shape = _probe
	q.transform = Transform3D(Basis.IDENTITY, at)
	q.collision_mask = VIEW_MASK
	q.exclude = exclude
	return not space.intersect_shape(q, 1).is_empty()
