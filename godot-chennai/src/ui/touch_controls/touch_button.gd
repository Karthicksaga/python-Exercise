class_name TouchButton
extends Control
## A round on-screen button for a thumb: drawn, not a Button, because `TouchControls` tracks
## every finger itself (several at once). `lit` shows it held or switched on.

var text: String = ""
var lit: bool = false:
	set(value):
		lit = value
		queue_redraw()
var accent: Color = UiTheme.AMBER


func _init(label: String = "", diameter: float = 76.0) -> void:
	text = label
	custom_minimum_size = Vector2(diameter, diameter)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## True when `at` (canvas position) is on the button; `slop` UI units of forgiveness round it.
func hit(at: Vector2, slop: float = 6.0) -> bool:
	var r := get_global_rect()
	return at.distance_to(r.get_center()) <= minf(r.size.x, r.size.y) * 0.5 + slop


func _draw() -> void:
	var c := size * 0.5
	var r := minf(size.x, size.y) * 0.5
	draw_circle(c, r, Color(accent, 0.85) if lit else Color(0.08, 0.09, 0.13, 0.55))
	draw_arc(c, r - 1.0, 0.0, TAU, 48, Color(1, 1, 1, 0.75), 2.0, true)
	var font := get_theme_default_font()
	var fs := UiTheme.BUTTON_SIZE
	var w := font.get_string_size(text, HORIZONTAL_ALIGNMENT_CENTER, -1, fs).x
	var colour := Color(0.1, 0.1, 0.1) if lit else UiTheme.TEXT
	draw_string(font, Vector2(c.x - w * 0.5, c.y + fs * 0.35), text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, colour)
