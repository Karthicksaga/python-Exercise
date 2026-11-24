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
## The ACTION button is the primary control on foot: the only one with an accent outline.
var primary: bool = false
## A `UiIcons` kind drawn instead of the text (JUMP); the text stays as its name for tests and
## screen readers.
var icon: StringName = &"":
	set(value):
		icon = value
		queue_redraw()
## The drawn glass circle's share of the node: the rest is padding that still takes a touch.
const VISUAL := 0.8


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
	var r := minf(size.x, size.y) * 0.5 * VISUAL
	# Translucent dark glass with a thin light outline; pressed is the accent, also translucent.
	draw_circle(c, r, Color(UiTheme.GLASS_PRESSED, 0.6) if lit else UiTheme.GLASS_FILL)
	var ring := Color(accent, 0.95) if (primary and not dim) else UiTheme.GLASS_OUTLINE
	draw_arc(c, r - 0.5, 0.0, TAU, 48, ring, 2.0 if primary else 1.5, true)
	var font := get_theme_default_font()
	if icon != &"":
		UiIcons.draw(self, icon, c, r)
	else:
		var fs := font_size
		var lines := text.split("\n")
		var y := c.y + fs * 0.35 - (lines.size() - 1) * fs * 0.55
		for line in lines:
			var w := font.get_string_size(line, HORIZONTAL_ALIGNMENT_CENTER, -1, fs).x
			var at := Vector2(c.x - w * 0.5, y)
			draw_string_outline(font, at, line, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 3, Color(0, 0, 0, 0.5))
			draw_string(font, at, line, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, UiTheme.TEXT)
			y += fs * 1.1
	if glyph != "":
		var gs := 12
		var gw := font.get_string_size(glyph, HORIZONTAL_ALIGNMENT_CENTER, -1, gs).x
		var badge := Rect2(c.x - gw * 0.5 - 6.0, 0.0, gw + 12.0, 18.0)
		draw_rect(badge, Color(0, 0, 0, 0.6), true)
		draw_string(font, Vector2(badge.position.x + 6.0, 11.0), glyph, HORIZONTAL_ALIGNMENT_LEFT, -1, gs, UiTheme.TEXT)
