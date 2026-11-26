class_name TitleRow
extends Button
## One row of the title menu (the landing-page design, G-161): a condensed title and a one-line
## subtitle, at least 48 tall. The primary row has an amber left bar and a soft glow; hover and
## focus show a pale plate, an amber bar and a small nudge to the right. The text sits in a child
## control (`slide_x` moves it) so rows can slide in without fighting the container's layout.

const BAR := 4
const TEXT_LEFT := 16.0
const NUDGE := 4.0
const PAPER := Color("#f4efe6")
const MUTED := Color("#b8bcc2")
const AMBER_TEXT := Color("#ffb400")
const AMBER_SOFT := Color(1.0, 0.706, 0.012, 0.16)

var primary: bool = false
## The row's English title: what `TitleMenu.row` looks for, whatever the language.
var id: String = ""
## Text offset to the right, in UI units: the slide-in and the focus nudge animate it.
var slide_x: float = 0.0:
	set(value):
		slide_x = value
		_place()
var subtitle_text: String = ""
var title_label: Label
var sub_label: Label
var glow: StyleBoxFlat = null
var _column: VBoxContainer
var _content: MarginContainer
var _nudge: Tween = null
var _animate: bool = true


## `title` is the English id of the row (its node name); `title_key` and `sub_key` make the two
## labels follow the language. A `subtitle` given as text wins over `sub_key`.
func _init(title: String = "", subtitle: String = "", is_primary: bool = false, title_key: String = "", sub_key: String = "") -> void:
	id = title
	primary = is_primary
	subtitle_text = subtitle
	text = ""
	focus_mode = Control.FOCUS_ALL
	custom_minimum_size = Vector2(0, UiTheme.MIN_TARGET)
	size_flags_horizontal = Control.SIZE_EXPAND_FILL
	alignment = HORIZONTAL_ALIGNMENT_LEFT
	_content = MarginContainer.new()
	_content.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_content.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_content)
	var column := VBoxContainer.new()
	_column = column
	column.minimum_size_changed.connect(_sync_height)
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 0)
	_content.add_child(column)
	title_label = UiTheme.label(title, 20, AMBER_TEXT if primary else PAPER)
	title_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if title_key != "":
		Tr.bind(title_label, title_key, null, true)
	column.add_child(title_label)
	sub_label = UiTheme.label(subtitle, 12, MUTED)
	sub_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sub_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if subtitle == "" and sub_key != "":
		Tr.bind(sub_label, sub_key, null, true)
	sub_label.visible = sub_label.text != ""
	column.add_child(sub_label)
	_styles()
	name = title.capitalize().replace(" ", "")
	accessibility_name = title.capitalize() if subtitle == "" else "%s. %s" % [title.capitalize(), subtitle]
	mouse_entered.connect(_lift.bind(true))
	mouse_exited.connect(func() -> void: _lift(has_focus()))
	focus_entered.connect(_lift.bind(true))
	focus_exited.connect(_lift.bind(false))
	_place()


## The row is at least 48 tall and as tall as its two lines need: a Tamil or two-language
## subtitle wraps to a second line (G-445) instead of being cut short.
func _sync_height() -> void:
	custom_minimum_size = Vector2(0, maxf(UiTheme.MIN_TARGET, _column.get_combined_minimum_size().y + 1.0))


func _plate(fill: Color, bar: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = bar
	box.border_width_left = BAR
	box.set_corner_radius_all(0)
	box.corner_radius_top_right = 6
	box.corner_radius_bottom_right = 6
	return box


func _styles() -> void:
	var rest := AMBER_SOFT if primary else Color.TRANSPARENT
	var bar := AMBER_TEXT if primary else Color.TRANSPARENT
	var lit := Color(1, 1, 1, 0.09)
	var normal := _plate(rest, bar)
	if primary:
		glow = normal
		normal.shadow_color = Color(1.0, 0.706, 0.0, 0.0)
		normal.shadow_size = 14
	add_theme_stylebox_override("normal", normal)
	add_theme_stylebox_override("hover", _plate(AMBER_SOFT.blend(lit) if primary else lit, AMBER_TEXT if primary else Color(1.0, 0.706, 0.0, 0.55)))
	add_theme_stylebox_override("pressed", _plate(Color(1.0, 0.706, 0.0, 0.26), AMBER_TEXT))
	add_theme_stylebox_override("focus", _plate(Color(1, 1, 1, 0.06), AMBER_TEXT if primary else Color(1.0, 0.706, 0.0, 0.8)))
	add_theme_stylebox_override("disabled", _plate(Color(1, 1, 1, 0.03), Color.TRANSPARENT))


## The fonts and sizes (the menu scales them with the screen's height).
func set_sizes(title_px: int, sub_px: int) -> void:
	title_label.add_theme_font_override("font", TitleFonts.display(false, title_px * 0.12))
	title_label.add_theme_font_size_override("font_size", title_px)
	sub_label.add_theme_font_size_override("font_size", sub_px)


func set_subtitle(value: String) -> void:
	subtitle_text = value
	sub_label.text = value
	sub_label.visible = value != ""


func _place() -> void:
	if _content == null:
		return
	_content.offset_left = TEXT_LEFT + slide_x
	_content.offset_right = -6.0 + slide_x


## Whether the focus and hover nudge moves (off with reduced motion).
func set_animated(on: bool) -> void:
	_animate = on


func _lift(on: bool) -> void:
	var target := NUDGE if on else 0.0
	if not _animate:
		return
	if _nudge != null:
		_nudge.kill()
	_nudge = create_tween()
	_nudge.tween_property(self, "slide_x", target, 0.2).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)


## The soft pulse of the primary row's glow (a looping tween; none with reduced motion).
func start_glow() -> void:
	if glow == null:
		return
	var pulse := create_tween().set_loops()
	pulse.tween_property(glow, "shadow_color:a", 0.22, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
	pulse.tween_property(glow, "shadow_color:a", 0.0, 1.6).set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)


## Without motion the glow is a still, faint one.
func still_glow() -> void:
	if glow != null:
		glow.shadow_color.a = 0.12
