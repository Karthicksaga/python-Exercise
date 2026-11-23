class_name UiTheme
extends RefCounted
## The game's one UI theme (chennai-game-design §3): light text on dark translucent panels over
## the 3D view, amber (#ffb703) accent, body text 14 and buttons 16 at the 915x412 base size,
## buttons at least 48 tall. Built in code so every screen shares it.

const AMBER := Color("#ffb703")
const TEXT := Color("#f4f1ea")
const TEXT_DIM := Color("#c9c4b8")
const PANEL := Color(0.06, 0.07, 0.09, 0.82)
const BACKDROP := Color("#14181f")
const DANGER := Color("#ff6b5a")
## Smallest touch target in UI units (48 dp at the base size).
const MIN_TARGET := 48.0
const BODY_SIZE := 14
const BUTTON_SIZE := 16
const TITLE_SIZE := 30

static var _theme: Theme = null


static func get_theme() -> Theme:
	if _theme == null:
		_theme = _build()
	return _theme


static func _box(fill: Color, border: Color = Color.TRANSPARENT, radius: int = 10) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(2 if border.a > 0.0 else 0)
	box.set_corner_radius_all(radius)
	box.content_margin_left = 16
	box.content_margin_right = 16
	box.content_margin_top = 10
	box.content_margin_bottom = 10
	return box


static func _build() -> Theme:
	var t := Theme.new()
	t.default_font_size = BODY_SIZE
	t.set_color("font_color", "Label", TEXT)
	t.set_stylebox("panel", "PanelContainer", _box(PANEL, Color(1, 1, 1, 0.08), 14))
	t.set_font_size("font_size", "Button", BUTTON_SIZE)
	t.set_color("font_color", "Button", TEXT)
	t.set_color("font_hover_color", "Button", TEXT)
	t.set_color("font_pressed_color", "Button", Color.BLACK)
	t.set_color("font_focus_color", "Button", TEXT)
	t.set_stylebox("normal", "Button", _box(Color(1, 1, 1, 0.08)))
	t.set_stylebox("hover", "Button", _box(Color(1, 1, 1, 0.14)))
	t.set_stylebox("pressed", "Button", _box(AMBER))
	t.set_stylebox("disabled", "Button", _box(Color(1, 1, 1, 0.04)))
	# Focus is drawn on top of the normal box: an amber outline, distinct from hover.
	var focus := _box(Color.TRANSPARENT, AMBER)
	t.set_stylebox("focus", "Button", focus)
	return t


## A button sized for a thumb.
static func button(text: String) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(200, MIN_TARGET)
	b.focus_mode = Control.FOCUS_ALL
	return b


static func label(text: String, size: int = BODY_SIZE, colour: Color = TEXT) -> Label:
	var l := Label.new()
	l.text = text
	l.add_theme_font_size_override("font_size", size)
	l.add_theme_color_override("font_color", colour)
	return l
