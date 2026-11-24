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
## Keyboard: WASD or arrows move, Shift runs, Space jumps; mouse drag on the right half looks
## (touch emulated from the mouse).

const ACTIONS := {
	&"player_forward": [KEY_W, KEY_UP],
	&"player_back": [KEY_S, KEY_DOWN],
	&"player_left": [KEY_A, KEY_LEFT],
	&"player_right": [KEY_D, KEY_RIGHT],
	&"player_run": [KEY_SHIFT],
	&"player_jump": [KEY_SPACE],
}

var body: PlayerController
var camera: FollowCamera
var controls: TouchControls
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


## The keyboard actions, added to the InputMap at run time when missing (so `project.godot`,
## shared with every system, needs no edit for them).
static func ensure_actions() -> void:
	for action: StringName in ACTIONS:
		if InputMap.has_action(action):
			continue
		InputMap.add_action(action, 0.2)
		for key: Key in ACTIONS[action]:
			var e := InputEventKey.new()
			e.physical_keycode = key
			InputMap.action_add_event(action, e)


func load_figure(manifest_path: String = "", person: String = "") -> String:
	return await body.load_figure(manifest_path, person)


## Puts the player at `feet` facing `yaw`, the camera behind them.
func place(feet: Vector3, yaw: float) -> void:
	body.respawn(feet, yaw)
	camera.yaw = yaw
	camera.snap()


func _physics_process(_dt: float) -> void:
	if not reads_devices or not body.is_on_foot():
		return
	var look := controls.consume_look()
	camera.look(look.x, look.y)
	var keys := Input.get_vector(&"player_left", &"player_right", &"player_back", &"player_forward")
	# Keys walk at full walking pace; Shift runs (a full stick would always run).
	var stick := controls.move if controls.move != Vector2.ZERO else keys * 0.8
	body.input = PlayerInput.make(stick, camera.yaw, controls.consume_jump() or Input.is_action_just_pressed(&"player_jump"), controls.run or Input.is_action_pressed(&"player_run"))
