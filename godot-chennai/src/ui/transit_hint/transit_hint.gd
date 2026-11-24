class_name TransitHint
extends Control
## The small transit panel on the HUD (decision G-219): near a bus stop the stop's name in Tamil
## and English and the next bus (route, destination, minutes); riding, the next stop in Tamil and
## English with a FAST TRAVEL button; at a railway station its name, platforms and next trains.
## No full-screen map (phase 6). It sits at the top between the mission column (left) and the
## JOBS button and minimap (right), never over the thumbs (`chennai-game-design` §3); touch
## targets are at least `UiTheme.MIN_TARGET`. It only shows what the game gives it.

signal fast_travel_pressed

## The mission HUD's left column and right-hand buttons (`MissionHud` constants), kept clear.
const LEFT_CLEAR := 16.0 + 330.0 + 8.0
const RIGHT_CLEAR := 16.0 + 112.0 + 96.0 + 8.0
const TOP := 12.0
const MAX_WIDTH := 360.0
const MIN_WIDTH := 240.0

var panel: PanelContainer
var tamil_label: Label
var english_label: Label
var detail_label: Label
var fast_button: Button
var _kind: StringName = &""


func _init() -> void:
	name = "TransitHint"
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = UiTheme.get_theme()
	panel = PanelContainer.new()
	panel.name = "Panel"
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(panel)
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(box)
	var font := TransitFonts.with_tamil()
	tamil_label = UiTheme.label("", 15, UiTheme.AMBER)
	english_label = UiTheme.label("", 16, UiTheme.TEXT)
	detail_label = UiTheme.label("", 14, UiTheme.TEXT_DIM)
	for l: Label in [tamil_label, english_label, detail_label]:
		l.add_theme_font_override("font", font)
		l.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		l.mouse_filter = Control.MOUSE_FILTER_IGNORE
		box.add_child(l)
	detail_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail_label.text_overrun_behavior = TextServer.OVERRUN_NO_TRIMMING
	fast_button = UiTheme.button("FAST TRAVEL")
	fast_button.name = "FastTravel"
	fast_button.custom_minimum_size = Vector2(160, UiTheme.MIN_TARGET)
	fast_button.size_flags_horizontal = Control.SIZE_SHRINK_END
	fast_button.pressed.connect(func() -> void: fast_travel_pressed.emit())
	box.add_child(fast_button)
	visible = false
	panel.visible = false


func _ready() -> void:
	get_viewport().size_changed.connect(_place)
	_place()


## Near a stop: its names and the next bus line (e.g. "21G to Tambaram · 4 min").
func show_stop(english: String, tamil: String, detail: String) -> void:
	_show(&"stop", tamil, english, detail, false)


## Riding: the next stop's announcement lines and whether FAST TRAVEL is offered.
func show_ride(english: String, tamil: String, detail: String, fast_travel: bool) -> void:
	_show(&"ride", tamil, english, detail, fast_travel)


## At a railway station.
func show_station(english: String, tamil: String, detail: String) -> void:
	_show(&"station", tamil, english, detail, false)


func hide_hint() -> void:
	_kind = &""
	visible = false
	panel.visible = false


func kind() -> StringName:
	return _kind


func _show(k: StringName, tamil: String, english: String, detail: String, fast: bool) -> void:
	_kind = k
	tamil_label.text = tamil
	tamil_label.visible = tamil != ""
	english_label.text = english
	english_label.visible = english != ""
	detail_label.text = detail
	detail_label.visible = detail != ""
	fast_button.visible = fast
	visible = true
	panel.visible = true
	_place()


## Between the mission column and the right-hand buttons; on narrow screens (under MIN_WIDTH
## between them) centred at the top, as wide as fits.
func _place() -> void:
	var vw := get_viewport_rect().size.x if is_inside_tree() else 915.0
	var left := LEFT_CLEAR
	var right := vw - RIGHT_CLEAR
	var width := minf(MAX_WIDTH, right - left)
	if width < MIN_WIDTH:
		width = minf(MAX_WIDTH, vw - 32.0 - RIGHT_CLEAR)
		left = 16.0
	else:
		left = left + (right - left - width) / 2.0
	panel.position = Vector2(left, TOP)
	panel.custom_minimum_size = Vector2(width, 0)
	panel.size = Vector2(width, 0)
	panel.reset_size()
	panel.size.x = width


## The panel's rect on screen (layout tests).
func panel_rect() -> Rect2:
	return panel.get_global_rect()
