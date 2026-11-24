class_name TouchButton
extends Control
## A round on-screen button for a thumb: drawn, not a Button, because `TouchControls` tracks
## every finger itself (several at once). `lit` shows it held or switched on; `dim` shows it has
## nothing to do right now (the ACTION button with nothing near); `glyph` is the gamepad or key
## hint shown above it when the last device used was not touch.

var text: String = "":
	set(value):
		text = value
		queue_redraw()
var lit: bool = false:
	set(value):
		lit = value
		queue_redraw()
var dim: bool = false:
	set(value):
		dim = value
		modulate.a = 0.5 if value else 1.0
var glyph: String = "":
	set(value):
		glyph = value
		queue_redraw()
var accent: Color = UiTheme.AMBER
var font_size: int = UiTheme.BUTTON_SIZE
## The ACTION button is the primary control on foot: a filled amber ring.
var primary: bool = false


func _init(label: String = "", diameter: float = 76.0) -> void:
	text = label
	custom_minimum_size = Vector2(diameter, diameter)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_IGNORE


## Puts the button on a square of side `side` with its top-left at `at` (parent coordinates).
func place(at: Vector2, side: float) -> void:
	custom_minimum_size = Vector2(side, side)
	size = custom_minimum_size
	position = at


## True when `at` (canvas position) is on the button; `slop` UI units of forgiveness round it.
func hit(at: Vector2, slop: float = 6.0) -> bool:
	if not is_visible_in_tree() or dim:
		return false
	var r := get_global_rect()
	return at.distance_to(r.get_center()) <= minf(r.size.x, r.size.y) * 0.5 + slop


func _draw() -> void:
	var c := size * 0.5
	var r := minf(size.x, size.y) * 0.5
	var fill := Color(accent, 0.85) if lit else Color(0.08, 0.09, 0.13, 0.62)
	draw_circle(c, r, fill)
	var ring := Color(accent, 0.95) if primary else Color(1, 1, 1, 0.75)
	draw_arc(c, r - 1.5, 0.0, TAU, 48, ring, 3.0 if primary else 2.0, true)
	var font := get_theme_default_font()
	var fs := font_size
	var lines := text.split("\n")
	var colour := Color(0.1, 0.1, 0.1) if lit else UiTheme.TEXT
	var y := c.y + fs * 0.35 - (lines.size() - 1) * fs * 0.55
	for line in lines:
		var w := font.get_string_size(line, HORIZONTAL_ALIGNMENT_CENTER, -1, fs).x
		draw_string(font, Vector2(c.x - w * 0.5, y), line, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, colour)
		y += fs * 1.1
	if glyph != "":
		var gs := 12
		var gw := font.get_string_size(glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, gs).x
		var badge := Rect2(c.x - gw * 0.5 - 6.0, -2.0, gw + 12.0, 18.0)
		draw_rect(badge, Color(0, 0, 0, 0.7), true)
		draw_string(font, Vector2(badge.position.x + 6.0, 11.0), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, gs, UiTheme.AMBER)
