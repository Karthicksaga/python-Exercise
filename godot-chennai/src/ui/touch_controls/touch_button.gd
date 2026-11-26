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
## The smallest letters the button draws.
const MIN_FONT := 9


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


## The letters and lines that fit the glass circle (radius `radius`): the largest size up to
## `font_size` at which the text fits as written, else with words moved to more lines (a Tamil or
## two-language label is longer than the English one it replaces). {size, lines, fits}.
func _fitted(font: Font, radius: float) -> Dictionary:
	var written := text.split("\n")
	var best_lines := written
	for fs in range(font_size, MIN_FONT - 1, -1):
		for lines: PackedStringArray in [written, _wrapped(font, written, fs, radius * 1.7)]:
			var widest := 0.0
			for line in lines:
				widest = maxf(widest, font.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
			if widest <= radius * 1.7 and fs * 1.1 * lines.size() <= radius * 1.8:
				return {"size": fs, "lines": lines, "fits": true}
		best_lines = written
	return {"size": MIN_FONT, "lines": best_lines, "fits": false}


## `lines` with each line broken at spaces to fit `width` at size `fs`.
static func _wrapped(font: Font, lines: PackedStringArray, fs: int, width: float) -> PackedStringArray:
	var out := PackedStringArray()
	for line in lines:
		var current := ""
		for word in line.split(" "):
			var tried := word if current == "" else current + " " + word
			if current != "" and font.get_string_size(tried, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > width:
				out.append(current)
				current = word
			else:
				current = tried
		out.append(current)
	return out


## Whether the text fits the glass circle at the smallest size the button will draw it (tests).
func text_fits() -> bool:
	if icon != &"" or text == "":
		return true
	return bool(_fitted(get_theme_default_font(), minf(size.x, size.y) * 0.5 * VISUAL)["fits"])


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
		var fitted := _fitted(font, r)
		var lines: PackedStringArray = fitted["lines"]
		var fs: int = fitted["size"]
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
