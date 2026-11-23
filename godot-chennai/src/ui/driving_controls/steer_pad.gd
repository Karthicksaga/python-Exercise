class_name SteerPad
extends Control
## The steering area, bottom left (chennai-game-design §3): put a thumb down anywhere on it and
## slide left or right; the knob follows, steering -1 to 1 over `reach` units with a small
## deadzone (input-systems). Lifting the thumb centres the steering.

const DEADZONE := 0.08

@export var reach: float = 70.0

var value := 0.0
var _finger := -2
var _origin := Vector2.ZERO
var _knob := Vector2.ZERO


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP


func _gui_input(event: InputEvent) -> void:
	var st := event as InputEventScreenTouch
	var sd := event as InputEventScreenDrag
	var mb := event as InputEventMouseButton
	var mm := event as InputEventMouseMotion
	if st != null:
		if st.pressed and _finger == -2:
			_begin(st.index, st.position)
		elif not st.pressed and st.index == _finger:
			_end()
	elif sd != null and sd.index == _finger:
		_move(sd.position)
	elif mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed and _finger == -2:
			_begin(-1, mb.position)
		elif not mb.pressed and _finger == -1:
			_end()
	elif mm != null and _finger == -1:
		_move(mm.position)
	else:
		return
	accept_event()


func _begin(finger: int, at: Vector2) -> void:
	_finger = finger
	_origin = at
	_move(at)


func _move(at: Vector2) -> void:
	var dx := clampf((at.x - _origin.x) / reach, -1.0, 1.0)
	value = 0.0 if absf(dx) < DEADZONE else signf(dx) * (absf(dx) - DEADZONE) / (1.0 - DEADZONE)
	_knob = Vector2(dx * reach, 0)
	queue_redraw()


func _end() -> void:
	_finger = -2
	value = 0.0
	_knob = Vector2.ZERO
	queue_redraw()


## Tests and scripted demos: hold the steering at `v` (-1 to 1); 0 releases.
func hold(v: float) -> void:
	value = clampf(v, -1.0, 1.0)
	_knob = Vector2(value * reach, 0)
	queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
		_end()


func _draw() -> void:
	var c := size / 2.0
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.06, 0.07, 0.09, 0.45), true)
	draw_line(Vector2(c.x - reach, c.y), Vector2(c.x + reach, c.y), Color(1, 1, 1, 0.35), 4.0, true)
	for side: float in [-1.0, 1.0]:
		var tip := Vector2(c.x + side * (reach + 22.0), c.y)
		draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-side * 14.0, -12.0), tip + Vector2(-side * 14.0, 12.0)]), Color(1, 1, 1, 0.55))
	draw_circle(c + _knob, 26.0, Color(1, 0.72, 0.01, 0.85) if _finger != -2 or value != 0.0 else Color(1, 1, 1, 0.5))
	draw_circle(c + _knob, 26.0, Color(0, 0, 0, 0.35), false, 2.0, true)
