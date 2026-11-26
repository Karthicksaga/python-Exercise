class_name PlayerRig
extends Node3D
## The player on foot as one piece for the composition root (decision G-67): the body
## (`PlayerController` with its `HumanFigure`), the camera (`FollowCamera`) and the touch
## controls, with the keyboard for desktop testing. Each physics step, before the body moves,
## it turns touch and keys into a `PlayerInput` and the drag into camera look; the body moves;
## then the camera follows (physics priorities -10, 0, 100).
##
##     var rig := PlayerRig.new()
##     world.add_child(rig)
##     await rig.load_figure()            # the default player, or a person from a manifest
##     rig.place(Vector3(0, 0, 0), 0.0)
##
## Keyboard: WASD or arrows move, Shift runs, Space jumps, E is ACTION; mouse drag on the right
## half looks (touch emulated from the mouse). Gamepad: left stick moves (past 0.85 it runs, back
## under 0.70 it walks), right stick looks, A is ACTION, X jumps, left-stick press toggles run
## when "toggle run" is on (`ControlActions`). Touch, keys and pad all go through the same
## `MoveState`, `LookState` and `JumpState`, so they feel alike (decisions G-171…G-173).

## Gamepad look speed at full right stick, UI units a second (about 2.4 rad/s).
const PAD_LOOK_RATE := 440.0
## The right stick's dead zone (the radial rescale is `LookState`'s sensitivity's job).
const PAD_LOOK_DEAD := 0.15

var body: PlayerController
var camera: FollowCamera
var controls: TouchControls
var move_state := MoveState.new()
var look_state := LookState.new()
## False ignores touch and keys (menus, cutscenes, tests driving `body.input` themselves).
var reads_devices: bool = true


func _init() -> void:
	process_physics_priority = -10
	body = PlayerController.new()
	body.name = "Body"
	add_child(body)
	camera = FollowCamera.new()
	camera.name = "FollowCamera"
	add_child(camera)
	controls = TouchControls.new()
	controls.name = "TouchControls"
	add_child(controls)


func _ready() -> void:
	ensure_actions()
	camera.follow(body)
	camera.camera.make_current()


## The keyboard and gamepad actions, added to the InputMap at run time when missing (so
## `project.godot`, shared with every system, needs no edit for them).
static func ensure_actions() -> void:
	ControlActions.register()


func load_figure(manifest_path: String = "", person: String = "") -> String:
	return await body.load_figure(manifest_path, person)


## Puts the player at `feet` facing `yaw`, the camera behind them.
func place(feet: Vector3, yaw: float) -> void:
	body.respawn(feet, yaw)
	camera.yaw = yaw
	camera.snap()


func _physics_process(dt: float) -> void:
	if not reads_devices or not body.is_on_foot():
		return
	var settings := controls.settings
	look_state.sensitivity = settings.look_sensitivity
	look_state.invert_y = settings.invert_y
	move_state.run_toggle = settings.run_toggle
	# Look: a touch drag and the right stick, both through the same sensitivity and glide.
	look_state.push(controls.consume_look())
	var look_stick := ControlActions.pad_look()
	if look_stick.length() > PAD_LOOK_DEAD:
		look_state.push(look_stick * PAD_LOOK_RATE * dt)
	var look := look_state.step(dt)
	camera.look(look.x, look.y)
	# Move: the touch stick, else the pad's, else the keys (full walking pace; Shift runs).
	var keys := Input.get_vector(&"player_left", &"player_right", &"player_back", &"player_forward")
	var raw := controls.move
	if raw == Vector2.ZERO:
		raw = ControlActions.pad_move()
	if raw == Vector2.ZERO:
		raw = keys * 0.8
	if controls.consume_run_press() or Input.is_action_just_pressed(&"player_run_toggle"):
		move_state.press_run()
	var run_held := Input.is_action_pressed(&"player_run")
	var move := move_state.update(raw, run_held)
	if controls.consume_jump() or Input.is_action_just_pressed(&"player_jump"):
		body.press_jump()
	if Input.is_action_just_pressed(&"player_action"):
		controls.press_action()
	body.input = PlayerInput.make(move, camera.yaw, false, move_state.wants_run(run_held))
