class_name LoadingScreen
extends CanvasLayer
## The loading screen (TD-25 of the Three.js game, chennai-game-design §4): the real loading
## steps by name, one bar segment per finished step, no percentage. Static on purpose: nothing
## loops, sweeps or fades (an animated loading screen failed to draw on the owner's Adreno 613).
## On failure it shows what failed with TRY AGAIN and CLOSE, never a black screen.
##
## It knows nothing about what the steps do: the composition root (`Main`) runs them.

signal retry_requested
signal close_requested

var _segments: Array[ColorRect] = []
var _step_label: Label
var _error_box: VBoxContainer
var _error_label: Label
var _retry: Button
var _names: PackedStringArray = PackedStringArray()

@onready var _root: Control = $Root


func _ready() -> void:
	layer = 10
	_root.theme = UiTheme.get_theme()
	var backdrop := ColorRect.new()
	backdrop.color = UiTheme.BACKDROP
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(backdrop)
	var margin := SafeAreaMargin.new()
	margin.gutter = 24
	_root.add_child(margin)
	var column := VBoxContainer.new()
	column.alignment = BoxContainer.ALIGNMENT_CENTER
	column.add_theme_constant_override("separation", 14)
	margin.add_child(column)
	column.add_child(UiTheme.label("CHENNAI", UiTheme.TITLE_SIZE, UiTheme.AMBER))
	column.add_child(UiTheme.label("Open world", UiTheme.BODY_SIZE, UiTheme.TEXT_DIM))
	var bar := HBoxContainer.new()
	bar.name = "Bar"
	bar.add_theme_constant_override("separation", 6)
	bar.custom_minimum_size = Vector2(0, 8)
	column.add_child(bar)
	_step_label = UiTheme.label("", UiTheme.BODY_SIZE)
	_step_label.name = "Step"
	_step_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_step_label)
	_error_box = VBoxContainer.new()
	_error_box.name = "Error"
	_error_box.visible = false
	_error_box.add_theme_constant_override("separation", 10)
	column.add_child(_error_box)
	_error_label = UiTheme.label("", UiTheme.BODY_SIZE, UiTheme.DANGER)
	_error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error_box.add_child(_error_label)
	var buttons := HFlowContainer.new()
	buttons.add_theme_constant_override("h_separation", 12)
	buttons.add_theme_constant_override("v_separation", 8)
	_error_box.add_child(buttons)
	_retry = UiTheme.button("TRY AGAIN")
	_retry.name = "Retry"
	_retry.pressed.connect(func() -> void: retry_requested.emit())
	buttons.add_child(_retry)
	var close := UiTheme.button("CLOSE")
	close.name = "Close"
	close.pressed.connect(func() -> void: close_requested.emit())
	buttons.add_child(close)
	if not _names.is_empty():
		set_steps(_names)


## Names of the steps, in order. Resets the bar.
func set_steps(names: PackedStringArray) -> void:
	_names = names
	if _step_label == null:
		return
	var bar: HBoxContainer = _root.find_child("Bar", true, false)
	for s in _segments:
		s.queue_free()
	_segments.clear()
	for i in names.size():
		var seg := ColorRect.new()
		seg.color = Color(1, 1, 1, 0.12)
		seg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		seg.custom_minimum_size = Vector2(0, 8)
		bar.add_child(seg)
		_segments.append(seg)
	_error_box.visible = false
	_step_label.text = ""


## Step `i` started: its name shows, its segment is dimly lit (a third, as in TD-25).
func begin_step(i: int) -> void:
	_step_label.text = "%s…" % _names[i]
	_segments[i].color = Color(UiTheme.AMBER, 0.35)


## Step `i` finished: its segment is fully lit.
func finish_step(i: int) -> void:
	_segments[i].color = UiTheme.AMBER


## Shows what failed with TRY AGAIN and CLOSE; TRY AGAIN takes the focus.
func fail(step: int, message: String) -> void:
	if step >= 0 and step < _names.size():
		_step_label.text = "Could not finish: %s" % _names[step]
		_segments[step].color = UiTheme.DANGER
	else:
		_step_label.text = "Could not load"
	_error_label.text = message
	_error_box.visible = true
	_retry.grab_focus()


func step_text() -> String:
	return _step_label.text


func lit_segments() -> int:
	var n := 0
	for s in _segments:
		if s.color == UiTheme.AMBER:
			n += 1
	return n
