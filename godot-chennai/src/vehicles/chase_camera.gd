class_name ChaseCamera
extends Camera3D
## The driving camera (camera-systems, chennai-game-design §5; decision G-79): behind the
## direction of travel, further back with speed, looking a little ahead; pulled in when a wall or
## pole is between it and the vehicle, but eased in, never snapped (an instant pull-in on every
## passing pole read as shaking in the Three.js game), and eased back out more slowly.
## On foot or thrown it follows the rider at the walking distance (until the Player's camera exists).
##
## Smoothing is `1 - exp(-rate * dt)`, so it behaves the same at any frame rate. It updates in
## `_physics_process`, in step with the vehicle bodies (no physics interpolation yet).

## Distance behind a person on foot.
const WALK_DISTANCE := 5.6
## Extra distance per m/s of speed.
const SPEED_REACH := 0.08
const YAW_RATE := 3.5
const REACH_IN_RATE := 6.0
const REACH_OUT_RATE := 1.6
const PITCH := 0.26
## Look-ahead: seconds of travel, at most this many metres.
const LEAD_TIME := 0.25
const LEAD_MAX := 5.0
## Keep this far in front of whatever blocks the view.
const WALL_MARGIN := 0.35
const MIN_DISTANCE := 1.6

var target: Node3D
var _yaw := 0.0
var _reach := 6.0
var _lead := Vector3.ZERO
var _has_pose := false
## Largest frame-to-frame move of the camera since the last `reset_jump()` (metres), for tests.
var max_jump := 0.0
var _last := Vector3.ZERO


func reset_jump() -> void:
	max_jump = 0.0


## Snap to the target at once (spawn, teleport).
func snap() -> void:
	_has_pose = false


func _physics_process(delta: float) -> void:
	if target == null or not is_instance_valid(target):
		return
	var v := target as Vehicle
	var heading: float
	var speed := 0.0
	var want: float
	var pivot_height: float
	if v != null:
		heading = v.yaw()
		var flat := v.planar_velocity()
		speed = flat.length()
		# Behind the direction of travel when going forwards at speed; otherwise behind the nose.
		if speed > 3.0 and v.forward_speed() > 0.0:
			heading = atan2(-flat.x, -flat.y)
		want = v.type.camera_distance + speed * SPEED_REACH
		pivot_height = v.global_position.y + v.model.position.y + v.type.spec.half_extents.y * 2.0 + 0.6
	else:
		heading = target.global_rotation.y
		want = WALK_DISTANCE
		pivot_height = target.global_position.y + 1.6
	var pivot := Vector3(target.global_position.x, pivot_height, target.global_position.z)
	if not _has_pose:
		_yaw = heading
		_reach = want
	_yaw += wrapf(heading - _yaw, -PI, PI) * (1.0 - exp(-YAW_RATE * delta))
	var back := Vector3(sin(_yaw), 0, cos(_yaw))
	var dir := (back * cos(PITCH) + Vector3.UP * sin(PITCH)).normalized()
	# What blocks the view from the pivot outwards (the target itself excluded).
	var allowed := want
	var q := PhysicsRayQueryParameters3D.create(pivot, pivot + dir * (want + WALL_MARGIN), PhysicsLayers.WORLD | PhysicsLayers.VEHICLES)
	var skip: Array[RID] = []
	if target is CollisionObject3D:
		skip.append((target as CollisionObject3D).get_rid())
	q.exclude = skip
	var hit := get_world_3d().direct_space_state.intersect_ray(q)
	if not hit.is_empty():
		allowed = maxf(MIN_DISTANCE, pivot.distance_to(hit["position"] as Vector3) - WALL_MARGIN)
	if not _has_pose:
		_reach = allowed
	var rate := REACH_IN_RATE if allowed < _reach else REACH_OUT_RATE
	_reach += (allowed - _reach) * (1.0 - exp(-rate * delta))
	var lead_want := Vector3.ZERO
	if v != null:
		lead_want = v.linear_velocity * LEAD_TIME
		lead_want.y = 0.0
		lead_want = lead_want.limit_length(LEAD_MAX)
	_lead += (lead_want - _lead) * (1.0 - exp(-2.0 * delta))
	var at := pivot + dir * _reach
	look_at_from_position(at, pivot + _lead - Vector3(0, 0.4, 0))
	if _has_pose:
		max_jump = maxf(max_jump, at.distance_to(_last) - speed * delta)
	_last = at
	_has_pose = true
