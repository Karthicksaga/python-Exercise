class_name DebugHud
extends CanvasLayer
## A small debug label in the top-left corner: frames per second, the game's time of day and
## what the world reader loaded. Shown during play; later HUD work replaces or extends it.
## The map credit sits bottom-right, as the data's licence asks.

## How often the label refreshes, in real seconds (FPS is a display measure, not game time).
const REFRESH := 0.5

var _since: float = REFRESH
var _world_text: String = ""
var _label: Label
var _credit: Label

@onready var _root: Control = $Root


func _ready() -> void:
	layer = 2
	_root.theme = UiTheme.get_theme()
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var margin := SafeAreaMargin.new()
	_root.add_child(margin)
	var panel := PanelContainer.new()
	panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(panel)
	_label = UiTheme.label("")
	_label.name = "Fps"
	panel.add_child(_label)
	# On a small dark plate so it stays readable over a bright street.
	var plate := PanelContainer.new()
	plate.size_flags_horizontal = Control.SIZE_SHRINK_END
	plate.size_flags_vertical = Control.SIZE_SHRINK_END
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := StyleBoxFlat.new()
	box.bg_color = Color(UiTheme.PANEL, 0.6)
	box.set_corner_radius_all(6)
	box.content_margin_left = 8
	box.content_margin_right = 8
	box.content_margin_top = 2
	box.content_margin_bottom = 2
	plate.add_theme_stylebox_override("panel", box)
	margin.add_child(plate)
	_credit = UiTheme.label("© OpenStreetMap contributors", 12, UiTheme.TEXT)
	_credit.name = "Credit"
	plate.add_child(_credit)
	_refresh()


## What the world reader loaded, e.g. "20,625 roads · 1,897 chunks".
func set_world_text(text: String) -> void:
	_world_text = text
	_refresh()


func set_credit(text: String) -> void:
	if text != "":
		_credit.text = text


func _process(delta: float) -> void:
	_since += delta
	if _since >= REFRESH:
		_refresh()


func _refresh() -> void:
	_since = 0.0
	if _label == null:
		return
	var parts := PackedStringArray(["FPS %d" % roundi(Engine.get_frames_per_second()), GameLoop.clock.text()])
	if _world_text != "":
		parts.append(_world_text)
	_label.text = "  ·  ".join(parts)


func text() -> String:
	return _label.text
