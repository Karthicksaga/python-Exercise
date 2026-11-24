class_name RailHudStyle
extends RefCounted
## The railway HUD's look: the glass style of `agent/godot-ui` (G-29x: translucent dark fill, thin
## white outline, round corners, amber accent), copied here until that branch's `UiTheme.glass_box`
## is merged; then these wrap it. Colours from `UiTheme`.

const AMBER := Color("#ffb703")
const TEXT := Color("#f4f1ea")
const TEXT_DIM := Color("#c9c4b8")
const DANGER := Color("#ff6b5a")
const GOOD := Color("#5fd38a")
const GLASS_FILL := Color(0.05, 0.06, 0.09, 0.42)
const GLASS_PANEL := Color(0.05, 0.06, 0.09, 0.62)
const GLASS_OUTLINE := Color(1, 1, 1, 0.42)
const GLASS_PRESSED := Color(1.0, 0.718, 0.012, 0.5)
const MIN_TARGET := 48.0


static func glass(fill: Color = GLASS_FILL, radius: int = 16) -> StyleBoxFlat:
	var b := StyleBoxFlat.new()
	b.bg_color = fill
	b.border_color = GLASS_OUTLINE
	b.set_border_width_all(1)
	b.set_corner_radius_all(radius)
	b.content_margin_left = 10
	b.content_margin_right = 10
	b.content_margin_top = 6
	b.content_margin_bottom = 6
	b.anti_aliasing = true
	return b


static func button(text: String, primary: bool = false) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(MIN_TARGET * 1.6, MIN_TARGET)
	b.focus_mode = Control.FOCUS_ALL
	b.add_theme_stylebox_override("normal", glass(GLASS_PRESSED if primary else GLASS_FILL, 24))
	b.add_theme_stylebox_override("hover", glass(Color(0.08, 0.09, 0.13, 0.55), 24))
	b.add_theme_stylebox_override("pressed", glass(GLASS_PRESSED, 24))
	b.add_theme_stylebox_override("focus", glass(Color(0, 0, 0, 0), 24))
	b.add_theme_color_override("font_color", TEXT)
	b.add_theme_font_size_override("font_size", 15)
	return b


static func label(text: String, size: int = 14, colour: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	l.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.6))
	l.add_theme_constant_override("shadow_offset_y", 1)
	return l
