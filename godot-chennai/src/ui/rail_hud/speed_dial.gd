class_name SpeedDial
extends Control
## The cab's speedometer (the owner's prototype): 0–120 km/h, ticks every 10, numbers every 20,
## a red mark at the speed limit, the needle orange (red when over the limit), the speed in
## figures below the hub.

var kmh: float = 0.0
var limit: float = 80.0
const MAX := 120.0


func _init() -> void:
	custom_minimum_size = Vector2(150, 150)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_values(speed_kmh: float, limit_kmh: float) -> void:
	if absf(speed_kmh - kmh) < 0.05 and limit_kmh == limit:
		return
	kmh = speed_kmh
	limit = limit_kmh
	queue_redraw()


func _angle(v: float) -> float:
	return PI * 0.75 + PI * 1.5 * clampf(v, 0.0, MAX) / MAX


func _draw() -> void:
	var c := size / 2.0
	var r := minf(size.x, size.y) / 2.0 - 4.0
	draw_circle(c, r + 2.0, Color(0.05, 0.06, 0.09, 0.62))
	draw_arc(c, r + 2.0, 0.0, TAU, 48, Color(1, 1, 1, 0.42), 1.0, true)
	var font := get_theme_default_font()
	var v := 0.0
	while v <= MAX:
		var a := _angle(v)
		var inner := r * (0.8 if int(v) % 20 == 0 else 0.88)
		draw_line(c + Vector2(cos(a), sin(a)) * inner, c + Vector2(cos(a), sin(a)) * r * 0.97, Color(0.8, 0.84, 0.86), 2.0)
		if int(v) % 20 == 0:
			var p := c + Vector2(cos(a), sin(a)) * r * 0.62
			draw_string(font, p + Vector2(-12, 5), "%d" % int(v), HORIZONTAL_ALIGNMENT_CENTER, 24, 12, Color(0.85, 0.88, 0.9))
		v += 10.0
	draw_arc(c, r * 0.93, _angle(limit) - 0.03, _angle(limit) + 0.03, 4, RailHudStyle.DANGER, 6.0)
	var na := _angle(kmh)
	var needle := RailHudStyle.DANGER if kmh > limit + 2.0 else Color(0.94, 0.5, 0.24)
	draw_line(c, c + Vector2(cos(na), sin(na)) * r * 0.78, needle, 4.0, true)
	draw_circle(c, 6.0, RailHudStyle.TEXT)
	draw_string(font, c + Vector2(-30, r * 0.45), "%d" % roundi(kmh), HORIZONTAL_ALIGNMENT_CENTER, 60, 22, RailHudStyle.TEXT)
	draw_string(font, c + Vector2(-30, r * 0.45 + 16), "km/h", HORIZONTAL_ALIGNMENT_CENTER, 60, 11, RailHudStyle.TEXT_DIM)
