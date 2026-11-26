class_name ChennaiNpc
extends CharacterBody3D
## Reusable realistic Chennai NPC controller with AnimationTree StateMachine,
## NavigationAgent3D pathfinding, obstacle avoidance, and safe distance despawning.

signal destination_reached
signal state_changed(state: StringName)

const DEFAULT_MODEL := "res://assets/people/chennai_v2/chennai_male.glb"
const WALK_SPEED := 1.45
const RUN_SPEED := 3.6
const TURN_SPEED := 8.0
const GRAVITY := 24.0
const JUMP_SPEED := 6.8
const BLEND_TIME := 0.22

const STATES := [&"Idle", &"Walk", &"Run", &"Jump", &"Talk", &"Wave", &"Sit", &"UsingPhone"]

@export var model_path: String = DEFAULT_MODEL
@export var walk_speed: float = WALK_SPEED
@export var run_speed: float = RUN_SPEED
@export var despawn_distance: float = 95.0

var model_root: Node3D = null
var skeleton: Skeleton3D = null
var anim_player: AnimationPlayer = null
var anim_tree: AnimationTree = null
var state_machine: AnimationNodeStateMachinePlayback = null
var nav_agent: NavigationAgent3D = null
var collider: CollisionShape3D = null

var current_state: StringName = &"Idle"
var running: bool = false
var _has_target: bool = false
var _waypoints: Array[Vector3] = []
var _waypoint_idx: int = 0
var _idle_timer: float = 0.0
var _idle_wait: float = 2.0


func _init() -> void:
	collision_layer = 4  # LAYER_PEOPLE
	collision_mask = 1 | 8  # LAYER_WORLD | LAYER_VEHICLES


func _ready() -> void:
	_ensure_nodes()
	_setup_model()


func _ensure_nodes() -> void:
	if collider == null:
		collider = CollisionShape3D.new()
		collider.name = "CollisionShape3D"
		var cap := CapsuleShape3D.new()
		cap.radius = 0.30
		cap.height = 1.72
		collider.shape = cap
		collider.position = Vector3(0.0, 0.86, 0.0)
		add_child(collider)
	if nav_agent == null:
		nav_agent = NavigationAgent3D.new()
		nav_agent.name = "NavigationAgent3D"
		nav_agent.path_desired_distance = 0.65
		nav_agent.target_desired_distance = 0.75
		nav_agent.radius = 0.35
		nav_agent.avoidance_enabled = true
		nav_agent.max_speed = run_speed
		nav_agent.velocity_computed.connect(_on_safe_velocity)
		add_child(nav_agent)


func _setup_model() -> void:
	if model_root != null:
		return
	if not ResourceLoader.exists(model_path):
		push_warning("ChennaiNpc: model not found at %s" % model_path)
		return
	var scene := ResourceLoader.load(model_path) as PackedScene
	if scene == null:
		return
	model_root = scene.instantiate() as Node3D
	model_root.name = "CharacterModel"
	# glTF faces +Z; Godot forward is -Z
	model_root.rotation.y = PI
	add_child(model_root)

	var skels := model_root.find_children("*", "Skeleton3D", true, false)
	if not skels.is_empty():
		skeleton = skels[0] as Skeleton3D

	anim_player = model_root.find_child("AnimationPlayer", true, false) as AnimationPlayer
	if anim_player != null:
		_configure_loops(anim_player)
		_build_animation_tree()


func _configure_loops(ap: AnimationPlayer) -> void:
	for clip: StringName in [&"idle", &"walk", &"run", &"talk", &"sitting", &"using_phone"]:
		if ap.has_animation(clip):
			var anim := ap.get_animation(clip)
			if anim != null:
				anim.loop_mode = Animation.LOOP_LINEAR


func _build_animation_tree() -> void:
	anim_tree = AnimationTree.new()
	anim_tree.name = "AnimationTree"
	var sm := AnimationNodeStateMachine.new()

	var clip_map := {
		&"Idle": &"idle",
		&"Walk": &"walk",
		&"Run": &"run",
		&"Jump": &"jump",
		&"Talk": &"talk",
		&"Wave": &"wave",
		&"Sit": &"sitting",
		&"UsingPhone": &"using_phone",
	}

	var first_clip := &""
	for cname: StringName in anim_player.get_animation_list():
		first_clip = cname
		break

	for state_name: StringName in clip_map:
		var node := AnimationNodeAnimation.new()
		var target_clip: StringName = clip_map[state_name]
		if anim_player.has_animation(target_clip):
			node.animation = target_clip
		elif first_clip != &"":
			node.animation = first_clip
		sm.add_node(state_name, node)

	# Core locomotion transitions
	for a: StringName in [&"Idle", &"Walk", &"Run"]:
		for b: StringName in [&"Idle", &"Walk", &"Run"]:
			if a == b:
				continue
			var tr := AnimationNodeStateMachineTransition.new()
			tr.xfade_time = BLEND_TIME
			sm.add_transition(a, b, tr)

	# Action state transitions from/to Idle
	for act_state: StringName in [&"Jump", &"Talk", &"Wave", &"Sit", &"UsingPhone"]:
		var tr_in := AnimationNodeStateMachineTransition.new()
		tr_in.xfade_time = BLEND_TIME
		sm.add_transition(&"Idle", act_state, tr_in)
		var tr_out := AnimationNodeStateMachineTransition.new()
		tr_out.xfade_time = BLEND_TIME
		sm.add_transition(act_state, &"Idle", tr_out)

	anim_tree.tree_root = sm
	add_child(anim_tree)
	anim_tree.anim_player = anim_tree.get_path_to(anim_player)
	anim_tree.active = true
	state_machine = anim_tree.get("parameters/playback") as AnimationNodeStateMachinePlayback
	if state_machine != null:
		state_machine.start(&"Idle")


func play_state(next_state: StringName) -> void:
	if next_state == current_state:
		return
	if state_machine != null and STATES.has(next_state):
		state_machine.travel(next_state)
	current_state = next_state
	state_changed.emit(next_state)


func set_patrol_waypoints(points: Array[Vector3], loop_wait: float = 2.0) -> void:
	_waypoints = points
	_waypoint_idx = 0
	_idle_wait = loop_wait
	if not _waypoints.is_empty():
		walk_to(_waypoints[0])


func walk_to(target_pos: Vector3, sprint: bool = false) -> void:
	running = sprint
	_has_target = true
	if nav_agent != null:
		nav_agent.max_speed = run_speed if sprint else walk_speed
		nav_agent.target_position = target_pos


func stop_walking() -> void:
	_has_target = false
	velocity.x = 0.0
	velocity.z = 0.0
	play_state(&"Idle")


func jump() -> void:
	if is_on_floor():
		velocity.y = JUMP_SPEED
		play_state(&"Jump")


func _physics_process(delta: float) -> void:
	if not is_on_floor():
		velocity.y -= GRAVITY * delta
	elif velocity.y < 0.0:
		velocity.y = 0.0

	if _has_target and nav_agent != null:
		var dist_to_target := Vector2(nav_agent.target_position.x - global_position.x, nav_agent.target_position.z - global_position.z).length()
		if dist_to_target <= nav_agent.target_desired_distance + 0.1:
			_on_arrived()
		else:
			var next_pt := nav_agent.get_next_path_position()
			var use_direct := nav_agent.is_navigation_finished() or next_pt.distance_squared_to(global_position) < 0.0001
			var target_pt := nav_agent.target_position if use_direct else next_pt
			var flat := Vector3(target_pt.x - global_position.x, 0.0, target_pt.z - global_position.z)
			if flat.length() > 0.01:
				var dir := flat.normalized()
				var spd := run_speed if running else walk_speed
				var desired_vel := dir * spd
				if nav_agent.avoidance_enabled and not use_direct and NavigationServer3D.map_get_iteration_id(nav_agent.get_navigation_map()) > 0:
					nav_agent.set_velocity(desired_vel)
				else:
					_apply_horizontal_move(desired_vel, delta)
	else:
		velocity.x = move_toward(velocity.x, 0.0, 10.0 * delta)
		velocity.z = move_toward(velocity.z, 0.0, 10.0 * delta)
		if not _waypoints.is_empty():
			_idle_timer += delta
			if _idle_timer >= _idle_wait:
				_idle_timer = 0.0
				_waypoint_idx = (_waypoint_idx + 1) % _waypoints.size()
				walk_to(_waypoints[_waypoint_idx])

	move_and_slide()


func _on_safe_velocity(safe_vel: Vector3) -> void:
	if not _has_target:
		return
	_apply_horizontal_move(safe_vel, get_physics_process_delta_time())


func _apply_horizontal_move(vel: Vector3, delta: float) -> void:
	velocity.x = vel.x
	velocity.z = vel.z
	var hspeed := Vector2(vel.x, vel.z).length()
	if hspeed > 0.15:
		var target_yaw := atan2(-vel.x, -vel.z)
		rotation.y = lerp_angle(rotation.y, target_yaw, minf(1.0, TURN_SPEED * delta))
		play_state(&"Run" if running else &"Walk")
	else:
		play_state(&"Idle")


func _on_arrived() -> void:
	_has_target = false
	velocity.x = 0.0
	velocity.z = 0.0
	play_state(&"Idle")
	destination_reached.emit()
