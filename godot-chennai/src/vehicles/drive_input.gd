class_name DriveInput
extends RefCounted
## Keyboard and gamepad driving (input-systems): actions registered at run time so the vehicle
## code does not edit `project.godot` (decision G-78). Touch comes from `DrivingControls`;
## both are combined: a key or a touch holds GAS.
##
## | Action | Keys | Pad |
## |---|---|---|
## | drive_gas | W, Up | R2 |
## | drive_brake | S, Down, Space | L2 |
## | drive_left / drive_right | A/D, Left/Right | left stick |
## | drive_exit | E, Enter | Y |
## | drive_horn | H | left stick press |
## | gear_park / gear_reverse / gear_drive | P / R / F | D-pad down / left / up |

const DEADZONE := 0.15

var _was: Dictionary = {}


func register_actions() -> void:
	_add(&"drive_gas", [KEY_W, KEY_UP], [], JOY_AXIS_TRIGGER_RIGHT, 1.0)
	_add(&"drive_brake", [KEY_S, KEY_DOWN, KEY_SPACE], [], JOY_AXIS_TRIGGER_LEFT, 1.0)
	_add(&"drive_left", [KEY_A, KEY_LEFT], [], JOY_AXIS_LEFT_X, -1.0)
	_add(&"drive_right", [KEY_D, KEY_RIGHT], [], JOY_AXIS_LEFT_X, 1.0)
	_add(&"drive_exit", [KEY_E, KEY_ENTER], [JOY_BUTTON_Y])
	_add(&"drive_horn", [KEY_H], [JOY_BUTTON_LEFT_STICK])
	_add(&"gear_park", [KEY_P], [JOY_BUTTON_DPAD_DOWN])
	_add(&"gear_reverse", [KEY_R], [JOY_BUTTON_DPAD_LEFT])
	_add(&"gear_drive", [KEY_F], [JOY_BUTTON_DPAD_UP])


func _add(action: StringName, keys: Array[int], buttons: Array[int], axis: int = -1, axis_sign: float = 0.0) -> void:
	if InputMap.has_action(action):
		return
	InputMap.add_action(action, DEADZONE)
	for k in keys:
		var e := InputEventKey.new()
		e.physical_keycode = k as Key
		InputMap.action_add_event(action, e)
	for b in buttons:
		var j := InputEventJoypadButton.new()
		j.button_index = b as JoyButton
		InputMap.action_add_event(action, j)
	if axis >= 0:
		var m := InputEventJoypadMotion.new()
		m.axis = axis as JoyAxis
		m.axis_value = axis_sign
		InputMap.action_add_event(action, m)


## Reads the held keys and touch controls into `driving` (only what changed, so tests that set
## `gas`/`brake`/`steer` directly are not overwritten while nothing is pressed).
func read(driving: Driving) -> void:
	var touch := driving.controls
	var gas := Input.is_action_pressed(&"drive_gas") or (touch != null and touch.gas_held())
	var brake := Input.is_action_pressed(&"drive_brake") or (touch != null and touch.brake_held())
	var steer := Input.get_axis(&"drive_left", &"drive_right") + (touch.steer_value() if touch != null else 0.0)
	_apply(driving, &"gas", gas)
	_apply(driving, &"brake", brake)
	var steering := absf(steer) > 0.001
	if steering or _was.get(&"steer", false):
		driving.steer = clampf(steer, -1.0, 1.0)
	_was[&"steer"] = steering
	if Input.is_action_just_pressed(&"drive_exit"):
		if driving.mode() == &"driving":
			driving.exit()
		elif driving.mode() == &"foot":
			driving.enter(driving.nearest_vehicle())
	if Input.is_action_just_pressed(&"drive_horn"):
		driving.press_horn()
	if Input.is_action_just_pressed(&"gear_park"):
		driving.select_gear("P")
	if Input.is_action_just_pressed(&"gear_reverse"):
		driving.select_gear("R")
	if Input.is_action_just_pressed(&"gear_drive"):
		driving.select_gear("D")


func _apply(driving: Driving, what: StringName, held: bool) -> void:
	if held or _was.get(what, false):
		driving.set(what, held)
	_was[what] = held
