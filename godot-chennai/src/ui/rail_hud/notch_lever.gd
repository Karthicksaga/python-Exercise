class_name NotchLever
extends Control
## The cab's power/brake lever as a touch control (the owner's prototype): a tall track with nine
## notches, P4 at the top down through OFF to EMG at the bottom, and a knob. Drag the knob or tap
## a notch; the lever snaps to the nearest notch. Glass style (the HUD's `RailHudStyle`).

signal notch_changed(index: int)

var labels: PackedStringArray = PackedStringArray(["EMG", "B3", "B2", "B1", "OFF", "P1", "P2", "P3", "P4"])
## Current notch (0 = EMG … 8 = P4).
var notch: int = 4
var _dragging: bool = false


func _init() -> void:
	custom_minimum_size = Vector2(112, 250)
	mouse_filter = Control.MOUSE_FILTER_STOP


func set_notch(i: int, emit: bool = false) -> void:
	var n := clampi(i, 0, labels.size() - 1)
	if n == notch:
		return
	notch = n
	queue_redraw()
	if emit:
		notch_changed.emit(n)


## The y of a notch inside the control (top P4).
func notch_y(i: int) -> float:
	var top := 18.0
	var bottom := size.y - 18.0
	var k := labels.size() - 1 - i
	return top + (bottom - top) * float(k) / float(labels.size() - 1)


## Where to tap for a notch (tests).
func notch_point(i: int) -> Vector2:
	return Vector2(size.x * 0.62, notch_y(i))


func _from_y(y: float) -> int:
	var best := 0
	var d := INF
	for i in labels.size():
		var dy := absf(notch_y(i) - y)
		if dy < d:
			d = dy
			best = i
	return best


func _gui_input(event: InputEvent) -> void:
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		_dragging = t.pressed
		if t.pressed:
			set_notch(_from_y(t.position.y), true)
		accept_event()
	elif event is InputEventScreenDrag and _dragging:
		set_notch(_from_y((event as InputEventScreenDrag).position.y), true)
		accept_event()
	elif event is InputEventMouseButton:
		var m := event as InputEventMouseButton
		if m.button_index == MOUSE_BUTTON_LEFT:
			_dragging = m.pressed
			if m.pressed:
				set_notch(_from_y(m.position.y), true)
			accept_event()
	elif event is InputEventMouseMotion and _dragging:
		set_notch(_from_y((event as InputEventMouseMotion).position.y), true)
		accept_event()


func _draw() -> void:
	draw_style_box(RailHudStyle.glass(), Rect2(Vector2.ZERO, size))
	var x := size.x * 0.62
	draw_line(Vector2(x, notch_y(labels.size() - 1)), Vector2(x, notch_y(0)), Color(1, 1, 1, 0.35), 6.0, true)
	var font := get_theme_default_font()
	for i in labels.size():
		var y := notch_y(i)
		var colour := RailHudStyle.TEXT
		if i < 4:
			colour = Color(1.0, 0.55, 0.45) if i == 0 else Color(1.0, 0.78, 0.6)
		elif i > 4:
			colour = Color(0.7, 0.95, 0.75)
		draw_line(Vector2(x - 12, y), Vector2(x + 12, y), Color(1, 1, 1, 0.4), 2.0)
		draw_string(font, Vector2(8, y + 5), labels[i], HORIZONTAL_ALIGNMENT_LEFT, x - 20, 14, colour)
	var ky := notch_y(notch)
	draw_rect(Rect2(x - 22, ky - 10, 44, 20), RailHudStyle.AMBER, true)
	draw_rect(Rect2(x - 22, ky - 10, 44, 20), Color(0, 0, 0, 0.5), false, 2.0)
