class_name DriveInput
extends RefCounted
## Keyboard and gamepad driving (input-systems): actions registered at run time so the vehicle
## code does not edit `project.godot` (decisions G-78, G-178). Touch comes in through
## `Driving.touch_*` (set by the composition root from the touch controls); a key or a touch
## holds GAS. Touch slides and the stick go through `SteerState.shape` (progressive, less steering
## at speed); the keys steer fully, as before.
##
## | Action | Keys | Pad |
## |---|---|---|
## | drive_gas | W, Up | RT (analogue) |
## | drive_brake | S, Down, Space | LT (analogue); hold when stopped to reverse |
## | drive_left / drive_right | A/D, Left/Right | (the left stick, `pad_move_*`) |
## | drive_exit | E, Enter | B |
## | drive_horn | H | Y |
##
## The P / R / D gear keys and D-pad gears are gone (G-175): the D-pad is for menu focus.

const DEADZONE := 0.15

var _was: Dictionary = {}


func register_actions() -> void:
	ControlActions.register()
	_add(&"drive_gas", [KEY_W, KEY_UP], [], JOY_AXIS_TRIGGER_RIGHT, 1.0)
	_add(&"drive_brake", [KEY_S, KEY_DOWN, KEY_SPACE], [], JOY_AXIS_TRIGGER_LEFT, 1.0)
	_add(&"drive_left", [KEY_A, KEY_LEFT], [])
	_add(&"drive_right", [KEY_D, KEY_RIGHT], [])
	_add(&"drive_exit", [KEY_E, KEY_ENTER], [JOY_BUTTON_B])
	_add(&"drive_horn", [KEY_H], [JOY_BUTTON_Y])


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


## Reads the held keys, pad and touch controls into `driving` (only what changed, so tests that
## set `gas`/`brake`/`steer` directly are not overwritten while nothing is pressed).
func read(driving: Driving) -> void:
	var gas_key := Input.is_action_pressed(&"drive_gas")
	var brake_key := Input.is_action_pressed(&"drive_brake")
	_apply(driving, &"gas", gas_key or driving.touch_gas)
	_apply(driving, &"brake", brake_key or driving.touch_brake)
	# A trigger reports how far it is pulled; a key or a touch is all the way.
	driving.gas_amount = Input.get_action_strength(&"drive_gas") if gas_key and not driving.touch_gas else 1.0
	driving.brake_amount = Input.get_action_strength(&"drive_brake") if brake_key and not driving.touch_brake else 1.0
	var keys := Input.get_axis(&"drive_left", &"drive_right")
	var analog := clampf(driving.touch_steer + _dead(ControlActions.pad_move().x), -1.0, 1.0)
	var share := 0.0
	if driving.vehicle != null:
		share = absf(driving.vehicle.forward_speed()) / maxf(0.1, driving.vehicle.type.spec.max_speed)
	var steer := keys + SteerState.shape(analog, share)
	var steering := absf(steer) > 0.001
	if steering or _was.get(&"steer", false):
		driving.steer = clampf(steer, -1.0, 1.0)
	_was[&"steer"] = steering
	if Input.is_action_just_pressed(&"drive_exit") and driving.mode() == &"driving":
		driving.exit()
	if Input.is_action_just_pressed(&"drive_horn"):
		driving.press_horn()


## The stick's dead zone, the same as walking's (0.12), rescaled so it starts from zero.
static func _dead(x: float) -> float:
	var a := absf(x)
	return 0.0 if a < MoveState.DEAD_ZONE else signf(x) * (a - MoveState.DEAD_ZONE) / (1.0 - MoveState.DEAD_ZONE)


func _apply(driving: Driving, what: StringName, held: bool) -> void:
	if held or _was.get(what, false):
		driving.set(what, held)
	_was[what] = held
