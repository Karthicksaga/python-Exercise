class_name MeterBar
extends Control
## A thin meter 0..100 in the mission panel (G-144): the stability of fragile cargo or a patient
## (full is good: green, amber below 40, red below 20) and a tail's suspicion (full is bad: calm,
## amber from 50, red from 80). The label is a Label beside it; this draws only the bar, with
## the warning band marked. Not a touch target.

var value := 100.0
## True for suspicion: a high value is the danger.
var bad_when_high := false


func _init() -> void:
	custom_minimum_size = Vector2(120, 10)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func colour() -> Color:
	if bad_when_high:
		if value >= 80.0:
			return UiTheme.DANGER
		return UiTheme.AMBER if value >= 50.0 else Color("#7fb2d9")
	if value < 20.0:
		return UiTheme.DANGER
	return UiTheme.AMBER if value < 40.0 else Color("#4ccb6b")


func set_value(v: float) -> void:
	var clamped := clampf(v, 0.0, 100.0)
	if not is_equal_approx(clamped, value):
		value = clamped
		queue_redraw()


func _draw() -> void:
	var r := Rect2(Vector2.ZERO, size)
	draw_rect(r, Color(1, 1, 1, 0.16))
	draw_rect(Rect2(Vector2.ZERO, Vector2(size.x * value / 100.0, size.y)), colour())
	# Ticks where the colour turns.
	for t: float in ([50.0, 80.0] if bad_when_high else [20.0, 40.0]):
		draw_rect(Rect2(Vector2(size.x * t / 100.0 - 0.5, 0), Vector2(1.0, size.y)), Color(0, 0, 0, 0.55))
