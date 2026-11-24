class_name HoldButton
extends Button
## A button that knows when it is held, by any finger (multi-touch: GAS stays held while another
## finger steers or taps a gear) or the mouse. `pressed_down` fires on touch, not on release, so
## a tap feels immediate (decision G-78).

signal pressed_down
signal released

var _touches: Dictionary = {}
var _mouse := false


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	toggle_mode = true
	action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS


func held() -> bool:
	return _mouse or not _touches.is_empty()


func _gui_input(event: InputEvent) -> void:
	var before := held()
	var st := event as InputEventScreenTouch
	var mb := event as InputEventMouseButton
	if st != null:
		if st.pressed:
			_touches[st.index] = true
		else:
			_touches.erase(st.index)
	elif mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
		_mouse = mb.pressed
	else:
		return
	accept_event()
	_changed(before)


## Tests and the composition root can press it as a finger would.
func press(on: bool) -> void:
	var before := held()
	_mouse = on
	_changed(before)


func _changed(before: bool) -> void:
	var now := held()
	set_pressed_no_signal(now)
	if now and not before:
		pressed_down.emit()
	elif before and not now:
		released.emit()


func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
		_touches.clear()
		_mouse = false
		set_pressed_no_signal(false)
