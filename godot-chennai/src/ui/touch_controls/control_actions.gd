class_name ControlActions
extends RefCounted
## The named InputMap actions for walking and the gamepad, added at run time when missing so
## `project.godot` (shared by every system) needs no edit (decision G-178; the driving actions
## are `DriveInput`'s). Keyboard keys stay; the gamepad is added next to them.
##
## | Action | Keys | Pad |
## |---|---|---|
## | player_forward/back/left/right | W S A D, arrows | |
## | pad_move_* | | left stick (no dead zone here: `MoveState` and `SteerState` have theirs) |
## | pad_look_* | | right stick |
## | player_action | E | A |
## | player_jump | Space | X |
## | player_run | Shift | |
## | player_run_toggle | | left stick press |
## | pad_pause | | Start |
## | player_hit / player_fire / player_weapon | F / R / Q | B / RB / Y (G-414) |
##
## The stick actions have dead zone 0 so a test (or a phone) can read the raw stick with
## `Input.get_vector`; every consumer applies its own dead zone once.

const KEYS := {
	&"player_forward": [KEY_W, KEY_UP],
	&"player_back": [KEY_S, KEY_DOWN],
	&"player_left": [KEY_A, KEY_LEFT],
	&"player_right": [KEY_D, KEY_RIGHT],
	&"player_run": [KEY_SHIFT],
	&"player_jump": [KEY_SPACE],
	&"player_action": [KEY_E],
	&"player_hit": [KEY_F],
	&"player_fire": [KEY_R],
	&"player_weapon": [KEY_Q],
}
const BUTTONS := {
	&"player_action": [JOY_BUTTON_A],
	&"player_jump": [JOY_BUTTON_X],
	&"player_run_toggle": [JOY_BUTTON_LEFT_STICK],
	&"pad_pause": [JOY_BUTTON_START],
	&"player_hit": [JOY_BUTTON_B],
	&"player_fire": [JOY_BUTTON_RIGHT_SHOULDER],
	&"player_weapon": [JOY_BUTTON_Y],
}
## action → [axis, sign]
const AXES := {
	&"pad_move_left": [JOY_AXIS_LEFT_X, -1.0],
	&"pad_move_right": [JOY_AXIS_LEFT_X, 1.0],
	&"pad_move_forward": [JOY_AXIS_LEFT_Y, -1.0],
	&"pad_move_back": [JOY_AXIS_LEFT_Y, 1.0],
	&"pad_look_left": [JOY_AXIS_RIGHT_X, -1.0],
	&"pad_look_right": [JOY_AXIS_RIGHT_X, 1.0],
	&"pad_look_up": [JOY_AXIS_RIGHT_Y, -1.0],
	&"pad_look_down": [JOY_AXIS_RIGHT_Y, 1.0],
}


static func register() -> void:
	for action: StringName in KEYS:
		_ensure(action, 0.2)
		for key: Key in KEYS[action]:
			var e := InputEventKey.new()
			e.physical_keycode = key
			_add_once(action, e)
	for action: StringName in BUTTONS:
		_ensure(action, 0.2)
		for b: JoyButton in BUTTONS[action]:
			var j := InputEventJoypadButton.new()
			j.button_index = b
			_add_once(action, j)
	for action: StringName in AXES:
		_ensure(action, 0.0)
		var m := InputEventJoypadMotion.new()
		m.axis = AXES[action][0] as JoyAxis
		m.axis_value = float(AXES[action][1])
		_add_once(action, m)


static func _ensure(action: StringName, deadzone: float) -> void:
	if not InputMap.has_action(action):
		InputMap.add_action(action, deadzone)


static func _add_once(action: StringName, event: InputEvent) -> void:
	if not InputMap.action_has_event(action, event):
		InputMap.action_add_event(action, event)


## The left stick as the pad reports it now: x right, y forward, raw (no dead zone).
static func pad_move() -> Vector2:
	return Input.get_vector(&"pad_move_left", &"pad_move_right", &"pad_move_back", &"pad_move_forward", 0.0)


## The right stick: x right, y down (like a screen drag), raw.
static func pad_look() -> Vector2:
	return Input.get_vector(&"pad_look_left", &"pad_look_right", &"pad_look_up", &"pad_look_down", 0.0)
