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
## The glass look of the HUD and touch buttons (decision G-290): dark translucent fill, a thin
## light outline, white icons. The accent shows only on the primary action and on a pressed button.
const GLASS_FILL := Color(0.05, 0.06, 0.09, 0.42)
const GLASS_HOVER := Color(0.08, 0.09, 0.13, 0.55)
const GLASS_OUTLINE := Color(1, 1, 1, 0.42)
const GLASS_PRESSED := Color(1.0, 0.718, 0.012, 0.5)
const ICON := Color(1, 1, 1, 0.95)
## Corner radius of a text pill, which is 48 tall. (A huge radius is not used: StyleBoxFlat clamps
## it against the control's rect, not the inset one, and draws a seam down the middle.)
const ROUND := 24
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


## One glass StyleBox for every HUD button and plate. `inset` shrinks what is drawn inside the
## control's rect, so a round button can be 40 dp to the eye and still have a 48 dp hit area.
static func glass_box(fill: Color = GLASS_FILL, outline: Color = GLASS_OUTLINE, radius: int = ROUND, inset: float = 0.0) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = outline
	box.set_border_width_all(1 if outline.a > 0.0 else 0)
	box.set_corner_radius_all(radius)
	box.set_expand_margin_all(-inset)
	box.anti_aliasing = true
	return box


## A glass plate for text read over the 3D view (mission column, toasts, credit, readouts).
static func glass_plate(alpha: float = 0.5, radius: int = 12) -> StyleBoxFlat:
	var box := glass_box(Color(GLASS_FILL, alpha), Color(1, 1, 1, 0.12), radius)
	box.content_margin_left = 12
	box.content_margin_right = 12
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box


## Dresses `b` as a round (or pill) glass button: `inset` is the padding of the hit area round the
## drawn shape, `primary` gives the thin accent outline, pressed fills with the translucent accent.
static func style_glass(b: Button, primary: bool = false, inset: float = 0.0, radius: int = ROUND) -> void:
	var outline := Color(AMBER, 0.95) if primary else GLASS_OUTLINE
	b.add_theme_stylebox_override("normal", glass_box(GLASS_FILL, outline, radius, inset))
	b.add_theme_stylebox_override("hover", glass_box(GLASS_HOVER, outline, radius, inset))
	b.add_theme_stylebox_override("pressed", glass_box(GLASS_PRESSED, AMBER, radius, inset))
	b.add_theme_stylebox_override("hover_pressed", glass_box(GLASS_PRESSED, AMBER, radius, inset))
	b.add_theme_stylebox_override("disabled", glass_box(Color(GLASS_FILL, 0.2), Color(1, 1, 1, 0.15), radius, inset))
	b.add_theme_stylebox_override("focus", glass_box(Color.TRANSPARENT, AMBER, radius, inset))
	for colour: String in ["font_color", "font_hover_color", "font_pressed_color", "font_hover_pressed_color", "font_focus_color"]:
		b.add_theme_color_override(colour, TEXT)
	b.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.55))
	b.add_theme_constant_override("outline_size", 3)


## Makes the glass boxes of `b` an exact circle of the drawn size (its smaller side minus
## 2 x `inset`); call it again after the button is resized.
static func set_round(b: Button, inset: float) -> void:
	var radius := maxi(1, int((minf(b.size.x, b.size.y) - inset * 2.0) * 0.5) - 1)
	for state: String in ["normal", "hover", "pressed", "hover_pressed", "disabled", "focus"]:
		var box := b.get_theme_stylebox(state) as StyleBoxFlat
		if box != null:
			box.set_corner_radius_all(radius)


## A round icon-only button (`UiIcons` kind): `visual` dp across to the eye, `target` dp of hit
## area (at least `MIN_TARGET`). The icon is a child control so it draws over the glass.
static func icon_button(kind: StringName, visual: float = 40.0, target: float = MIN_TARGET) -> Button:
	var b := Button.new()
	b.custom_minimum_size = Vector2(target, target)
	b.focus_mode = Control.FOCUS_NONE
	style_glass(b, false, (target - visual) * 0.5, int(visual * 0.5) - 1)
	var overlay := IconOverlay.new()
	overlay.kind = kind
	overlay.visual = visual
	b.add_child(overlay)
	return b


## Draws a `UiIcons` icon centred in its parent button.
class IconOverlay:
	extends Control
	var kind: StringName = &""
	var visual: float = 40.0

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE
		set_anchors_preset(Control.PRESET_FULL_RECT)

	func _draw() -> void:
		UiIcons.draw(self, kind, size * 0.5, visual * 0.5)


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
