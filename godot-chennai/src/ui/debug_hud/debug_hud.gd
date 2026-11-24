class_name DebugHud
extends CanvasLayer
## The performance overlay, top-centre: frames per second, the game's time of day and what the
## world reader loaded. OFF by default (G-291): it shows only while `DebugSettings.perf_overlay`
## is on (pause menu row, or five taps on the top-left corner, `CornerTaps`). The map credit
## sits bottom-right always, as the data's licence asks.

## How often the label refreshes, in real seconds (FPS is a display measure, not game time).
const REFRESH := 0.5

## The switch; tests give their own.
var settings: DebugSettings = DebugSettings.shared()
var _taps := CornerTaps.new()
var _clock: float = 0.0
var _panel: PanelContainer
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
	panel.name = "Overlay"
	panel.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	panel.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", UiTheme.glass_plate(0.55, 10))
	margin.add_child(panel)
	_panel = panel
	_label = UiTheme.label("")
	_label.name = "Fps"
	panel.add_child(_label)
	# On a small dark plate so it stays readable over a bright street.
	var plate := PanelContainer.new()
	plate.size_flags_horizontal = Control.SIZE_SHRINK_END
	plate.size_flags_vertical = Control.SIZE_SHRINK_END
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := UiTheme.glass_plate(0.5, 10)
	box.content_margin_top = 2
	box.content_margin_bottom = 2
	plate.add_theme_stylebox_override("panel", box)
	margin.add_child(plate)
	_credit = UiTheme.label("© OpenStreetMap contributors", 12, UiTheme.TEXT)
	_credit.name = "Credit"
	plate.add_child(_credit)
	settings.changed.connect(_apply_visibility)
	_apply_visibility()
	_refresh()


func _exit_tree() -> void:
	if settings != null and settings.changed.is_connected(_apply_visibility):
		settings.changed.disconnect(_apply_visibility)


## True while the overlay shows.
func overlay_visible() -> bool:
	return _panel.visible


func _apply_visibility() -> void:
	_panel.visible = settings.perf_overlay
	if _panel.visible:
		_refresh()


## Counts taps on the top-left corner; five switch the overlay (`TouchControls` leaves touches
## there unhandled so they reach this).
func _input(event: InputEvent) -> void:
	var touch := event as InputEventScreenTouch
	if touch != null and touch.pressed:
		corner_tap(touch.position)


## One tap at `at` (UI units); the fifth in a row in the corner toggles the overlay.
func corner_tap(at: Vector2) -> void:
	if _taps.tap(at, _clock):
		settings.toggle_perf_overlay()


## What the world reader loaded, e.g. "20,625 roads · 1,897 chunks".
func set_world_text(text: String) -> void:
	_world_text = text
	_refresh()


func set_credit(text: String) -> void:
	if text != "":
		_credit.text = text


func _process(delta: float) -> void:
	_clock += delta
	if not _panel.visible:
		return
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
