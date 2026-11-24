class_name PlayerController
extends CharacterBody3D
## The player on foot: a kinematic capsule moved in the fixed 60 Hz physics step (TD-6, G-2),
## walking, running and jumping relative to the camera, stepping up kerbs, stopped by walls.
## The body is an upright cylinder 1.75 m tall, 0.32 m in radius.
## Port of the Three.js `PlayerController` rules (speeds, response, gravity, jump, turn rate)
## and its Rapier character settings (autostep 0.35 m, snap to ground 0.3 m, 50° slopes);
## decision G-60.
##
## It reads a `PlayerInput` each step (`input`, set by `PlayerRig` from touch and keyboard, or
## by a test) and knows nothing about devices or the camera node. The figure (`HumanFigure`)
## is a child, advanced after each move.
##
## For vehicles: `enter_vehicle(vehicle, seat)` takes the player off their feet (no collision,
## no movement, the body follows the seat) and `exit_vehicle(feet, yaw)` puts them back.
## For combat later: `knock(velocity)`, `facing()`, `figure`.

signal entered_vehicle(vehicle: Node3D)
signal exited_vehicle(vehicle: Node3D)
signal jumped
signal landed

const HEIGHT := 1.75
const RADIUS := 0.32
const WALK_SPEED := 2.4
const RUN_SPEED := 6.2
## Pushing the stick past this share of its travel runs.
const RUN_THRESHOLD := 0.82
## How quickly speed follows the stick, per second (higher is snappier).
const RESPONSE := 10.0
const GRAVITY := 24.0
const JUMP_SPEED := 7.2
const MAX_FALL := 40.0
## Turn towards the direction of travel, rad/s.
const TURN_RATE := 12.0
## Steps and kerbs up to this height are climbed without jumping, metres.
const STEP_HEIGHT := 0.35
## Less steering in the air.
const AIR_CONTROL := 0.35

## Physics layers (decision G-64): what each body is on. The camera's view is blocked by
## WORLD, PEOPLE and VEHICLES, never by the player.
const LAYER_WORLD := 1
const LAYER_PLAYER := 2
const LAYER_PEOPLE := 4
const LAYER_VEHICLES := 8

## This step's request; replaced by the rig or a test before each physics step.
var input: PlayerInput = PlayerInput.new()
## Heading the character faces, radians (0 = towards -Z, north).
var yaw: float = 0.0
## Horizontal speed actually moved in the last step, m/s (for the figure and the camera).
var speed: float = 0.0
## Multiplies the top running speed (fitness, later).
var run_scale: float = 1.0
## The vehicle being ridden, or null on foot.
var vehicle: Node3D = null
var seat: Node3D = null
## False stops reading input (cutscenes, menus); gravity still applies.
var controls_enabled: bool = true
var figure: HumanFigure = null
var _was_grounded: bool = true
## Jump buffer and coyote time (G-173).
var _jump := JumpState.new()
var _knock: Vector3 = Vector3.ZERO


## A jump press from outside `step` (the rig, between steps); same as `PlayerInput.jump`.
func press_jump() -> void:
	_jump.press()


func _init() -> void:
	collision_layer = LAYER_PLAYER
	collision_mask = LAYER_WORLD | LAYER_PEOPLE | LAYER_VEHICLES
	floor_max_angle = deg_to_rad(50.0)
	floor_snap_length = 0.3
	floor_stop_on_slope = true
	floor_constant_speed = true
	safe_margin = 0.01
	# A cylinder, not a capsule: its flat base can stand on a kerb's edge once lifted over it
	# (`_step_up`); a capsule's round base slid back off small steps.
	var shape := CylinderShape3D.new()
	shape.radius = RADIUS
	shape.height = HEIGHT
	var col := CollisionShape3D.new()
	col.name = "Body"
	col.shape = shape
	col.position = Vector3(0.0, HEIGHT * 0.5, 0.0)
	add_child(col)


func _ready() -> void:
	if figure == null:
		figure = HumanFigure.new()
		figure.name = "Figure"
		add_child(figure)
	figure.rotation.y = 0.0


## Loads the player's model: a person from a manifest (`person` id), else the default model.
func load_figure(manifest_path: String = "", person: String = "") -> String:
	var path := PeopleManifest.DEFAULT_PLAYER
	if manifest_path != "" and person != "":
		var m := PeopleManifest.open(manifest_path)
		path = m.model_path(person)
		if path == "":
			return "No person %s in %s." % [person, manifest_path]
	return await figure.load_model(path, HEIGHT)


func is_on_foot() -> bool:
	return vehicle == null


func top_speed() -> float:
	return RUN_SPEED * run_scale


## Unit vector the player faces.
func facing() -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


func _physics_process(dt: float) -> void:
	if vehicle != null:
		if seat != null:
			global_transform = seat.global_transform
		# Seated (or getting in and out): the figure poses itself on the seat it was given.
		if figure != null:
			figure.advance(dt, 0.0, true)
		return
	step(input if controls_enabled else PlayerInput.new(), dt)
	if figure != null:
		figure.rotation.y = yaw - rotation.y
		figure.advance(dt, speed, is_on_floor())


## One fixed step of movement (also called directly by tests).
func step(i: PlayerInput, dt: float) -> void:
	var magnitude := minf(1.0, i.move.length())
	var running := magnitude > RUN_THRESHOLD or (i.run and magnitude >= 0.08)
	var target := 0.0
	if magnitude >= 0.08:
		target = top_speed() if running else WALK_SPEED * minf(1.0, magnitude / RUN_THRESHOLD)
	var dir := Vector3.ZERO
	if target > 0.0:
		var s := sin(i.camera_yaw)
		var c := cos(i.camera_yaw)
		dir = Vector3(i.move.x * c - i.move.y * s, 0.0, -i.move.x * s - i.move.y * c) / magnitude
	var grounded := is_on_floor()
	var blend := minf(1.0, RESPONSE * (1.0 if grounded else AIR_CONTROL) * dt)
	velocity.x += (dir.x * target - velocity.x) * blend
	velocity.z += (dir.z * target - velocity.z) * blend
	if i.jump:
		_jump.press()
	if _jump.tick(dt, grounded):
		velocity.y = JUMP_SPEED
		jumped.emit()
	elif grounded:
		velocity.y = 0.0
	else:
		velocity.y = maxf(-MAX_FALL, velocity.y - GRAVITY * dt)
	if _knock != Vector3.ZERO:
		velocity += _knock
		_knock = Vector3.ZERO
	var before := global_position
	var wanted := Vector3(velocity.x, 0.0, velocity.z) * dt
	# On the ground, move_and_slide snaps to it (floor_snap_length) unless jumping.
	move_and_slide()
	if grounded and velocity.y <= 0.0 and wanted.length() > 0.0005:
		_step_up(before, wanted)
	var moved := global_position - before
	speed = Vector2(moved.x, moved.z).length() / dt
	var now := is_on_floor()
	if now and not _was_grounded:
		landed.emit()
	_was_grounded = now
	if target > 0.0:
		var wanted_yaw := atan2(-dir.x, -dir.z)
		yaw += wrapf(wanted_yaw - yaw, -PI, PI) * minf(1.0, TURN_RATE * dt)
		yaw = wrapf(yaw, -PI, PI)


## Climbs a kerb or step (at most STEP_HEIGHT) that stopped this step's move: up, across, down.
func _step_up(before: Vector3, wanted: Vector3) -> void:
	var moved := global_position - before
	var short := Vector2(wanted.x - moved.x, wanted.z - moved.z)
	if short.length() < wanted.length() * 0.3:
		return
	var from := Transform3D(global_basis, before)
	var up := Vector3(0.0, STEP_HEIGHT, 0.0)
	if test_move(from, up):
		return
	var raised := from.translated(up)
	# A step at least a little deep: the whole move has to fit up there.
	var across := Vector3(wanted.x, 0.0, wanted.z)
	if test_move(raised, across):
		return
	var over := raised.translated(across)
	var hit := KinematicCollision3D.new()
	if not test_move(over, -up - Vector3(0.0, 0.05, 0.0), hit):
		return
	if hit.get_normal().angle_to(Vector3.UP) > floor_max_angle:
		return
	var rise := STEP_HEIGHT - hit.get_travel().length()
	if rise <= 0.01:
		return
	global_position = over.origin + hit.get_travel()
	velocity.y = 0.0
	apply_floor_snap()


## A push (a blow, a bump), m/s, added on the next step.
func knock(push: Vector3) -> void:
	_knock += push


## Puts the player back at a known place (fell out of the world, restart).
func respawn(feet: Vector3, facing_yaw: float) -> void:
	global_position = feet
	velocity = Vector3.ZERO
	yaw = facing_yaw
	speed = 0.0


## Off the player's feet into a vehicle: no collision or movement; the body follows `at` (a
## seat node) until `exit_vehicle`. The figure stays shown for the vehicle to pose or hide.
func enter_vehicle(ride: Node3D, at: Node3D) -> void:
	if vehicle != null:
		return
	vehicle = ride
	seat = at
	velocity = Vector3.ZERO
	speed = 0.0
	collision_layer = 0
	collision_mask = 0
	entered_vehicle.emit(ride)


## Back on foot at `feet`, facing `facing_yaw`.
func exit_vehicle(feet: Vector3, facing_yaw: float) -> void:
	if vehicle == null:
		return
	var ride := vehicle
	vehicle = null
	seat = null
	global_basis = Basis.IDENTITY
	collision_layer = LAYER_PLAYER
	collision_mask = LAYER_WORLD | LAYER_PEOPLE | LAYER_VEHICLES
	respawn(feet, facing_yaw)
	exited_vehicle.emit(ride)
