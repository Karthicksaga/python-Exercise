class_name HoldButton
extends Button
## A button that knows when it is held, by any finger (multi-touch: GAS stays held while another
## finger steers or taps a gear) or the mouse. `pressed_down` fires on touch, not on release, so
## a tap feels immediate (decision G-78).

signal pressed_down
signal released

## The gamepad or key hint drawn on the button's corner when that device was used last.
var hint: String = "":
	set(value):
		hint = value
		queue_redraw()
var _touches: Dictionary = {}
var _mouse := false


func _init() -> void:
	focus_mode = Control.FOCUS_NONE
	toggle_mode = true
	action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	draw.connect(_draw_hint)


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


func _draw_hint() -> void:
	if hint == "":
		return
	var font := get_theme_default_font()
	var w := font.get_string_size(hint, HORIZONTAL_ALIGNMENT_CENTER, -1, 12).x
	var badge := Rect2((size.x - w) * 0.5 - 6.0, -2.0, w + 12.0, 18.0)
	draw_rect(badge, Color(0, 0, 0, 0.6), true)
	draw_string(font, Vector2(badge.position.x + 6.0, 11.0), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, UiTheme.TEXT)
