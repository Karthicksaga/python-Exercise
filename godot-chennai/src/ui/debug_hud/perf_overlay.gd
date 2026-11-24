class_name PerfOverlay
extends CanvasLayer
## The performance overlay (decisions G-253, G-254): a block of numbers top-left under the FPS
## line (frame time, CPU and GPU, draw calls, workers, the verdict) and a SWITCHES button that
## opens the feature switches, a list of ON/OFF buttons with the frame-time change each one made
## when it was last pressed. Off by default; a three-finger tap or the Settings row shows it.
##
## The numbers come from the composition root (`set_text`, `set_switches`): this screen knows no
## game system. Hidden, it does nothing per frame (no `_process`); only touch events are watched
## for the three-finger tap. The text never takes input, so the controls under it keep working;
## only the SWITCHES button and the open panel do.

signal toggle_requested
signal switch_pressed(id: String)
signal safe_mode_pressed
signal all_on_pressed

## Three fingers down within this many ms, all lifted within TAP_UP_MS of the first: a tap.
const TAP_DOWN_MS := 300
const TAP_UP_MS := 600
const FONT := 12

var _text: Label
var _switches_button: Button
var _panel: PanelContainer
var _list: VBoxContainer
var _ranked: Label
var _down: Dictionary[int, int] = {}  # touch index → ms when pressed
var _first_down: int = -1
var _armed: bool = false


func _init() -> void:
	name = "PerfOverlay"
	layer = 7
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.get_theme()
	add_child(root)
	var margin := SafeAreaMargin.new()
	margin.name = "Safe"
	root.add_child(margin)
	var area := Control.new()
	area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(area)
	var column := VBoxContainer.new()
	column.name = "Column"
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.position = Vector2(0, 30)
	area.add_child(column)
	var plate := PanelContainer.new()
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.0, 0.0, 0.0, 0.55)
	box.set_corner_radius_all(6)
	box.content_margin_left = 6
	box.content_margin_right = 6
	box.content_margin_top = 4
	box.content_margin_bottom = 4
	plate.add_theme_stylebox_override("panel", box)
	column.add_child(plate)
	_text = UiTheme.label("", FONT, UiTheme.TEXT)
	_text.name = "Numbers"
	_text.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(_text)
	_switches_button = UiTheme.button("SWITCHES")
	_switches_button.name = "Switches"
	_switches_button.focus_mode = Control.FOCUS_NONE
	_switches_button.custom_minimum_size = Vector2(120, UiTheme.MIN_TARGET)
	# Top centre, between the FPS line and PAUSE: away from the stick and the action buttons.
	_switches_button.anchor_left = 0.5
	_switches_button.anchor_right = 0.5
	_switches_button.offset_left = -60
	_switches_button.offset_right = 60
	_switches_button.offset_bottom = UiTheme.MIN_TARGET
	_switches_button.pressed.connect(func() -> void: _panel.visible = not _panel.visible)
	area.add_child(_switches_button)

	_panel = PanelContainer.new()
	_panel.name = "Panel"
	_panel.visible = false
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_top = 0.0
	_panel.anchor_bottom = 1.0
	_panel.offset_left = -170
	_panel.offset_right = 170
	area.add_child(_panel)
	var inner := VBoxContainer.new()
	inner.add_theme_constant_override("separation", 6)
	_panel.add_child(inner)
	var head := HBoxContainer.new()
	inner.add_child(head)
	for spec: Array in [["SAFE MODE", "Safe"], ["ALL ON", "AllOn"], ["CLOSE", "Close"]]:
		var b := UiTheme.button(String(spec[0]))
		b.name = String(spec[1])
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(104, UiTheme.MIN_TARGET)
		head.add_child(b)
	(head.get_node(^"Safe") as Button).pressed.connect(func() -> void: safe_mode_pressed.emit())
	(head.get_node(^"AllOn") as Button).pressed.connect(func() -> void: all_on_pressed.emit())
	(head.get_node(^"Close") as Button).pressed.connect(func() -> void: _panel.visible = false)
	_ranked = UiTheme.label("", FONT, UiTheme.AMBER)
	_ranked.name = "Ranked"
	_ranked.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_ranked.custom_minimum_size = Vector2(320, 0)
	inner.add_child(_ranked)
	var scroll := ScrollContainer.new()
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	inner.add_child(scroll)
	_list = VBoxContainer.new()
	_list.name = "List"
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_list.add_theme_constant_override("separation", 4)
	scroll.add_child(_list)
	visible = false


func set_text(text: String) -> void:
	_text.text = text


func text() -> String:
	return _text.text


func is_panel_open() -> bool:
	return _panel.visible


func open_panel(on: bool) -> void:
	_panel.visible = on


## The switches as rows: {id, label, on, note}; pressing one emits `switch_pressed(id)`.
func set_switches(items: Array[Dictionary], ranked: String) -> void:
	_ranked.text = ranked
	while _list.get_child_count() > items.size():
		var last := _list.get_child(_list.get_child_count() - 1)
		_list.remove_child(last)
		last.queue_free()
	for i in items.size():
		var item := items[i]
		var b: Button
		if i < _list.get_child_count():
			b = _list.get_child(i) as Button
		else:
			b = UiTheme.button("")
			b.focus_mode = Control.FOCUS_NONE
			b.custom_minimum_size = Vector2(320, UiTheme.MIN_TARGET)
			b.alignment = HORIZONTAL_ALIGNMENT_LEFT
			b.pressed.connect(func() -> void: switch_pressed.emit(String(b.get_meta(&"id"))))
			_list.add_child(b)
		b.set_meta(&"id", String(item["id"]))
		b.name = "Switch_%s" % String(item["id"])
		var note := String(item.get("note", ""))
		b.text = "%s  %s%s" % ["ON " if bool(item["on"]) else "OFF", String(item["label"]), ("  ·  " + note) if note != "" else ""]
		b.modulate = Color.WHITE if bool(item["on"]) else Color(1, 1, 1, 0.6)


func switch_button(id: String) -> Button:
	return _list.get_node_or_null("Switch_%s" % id) as Button


## Three fingers on the screen at once, lifted again quickly: toggle. The events are never
## consumed, so the controls see them as usual.
func _input(event: InputEvent) -> void:
	var touch := event as InputEventScreenTouch
	if touch == null:
		return
	var now := Time.get_ticks_msec()
	if touch.pressed:
		if _down.is_empty():
			_first_down = now
			_armed = false
		_down[touch.index] = now
		if _down.size() == 3 and now - _first_down <= TAP_DOWN_MS:
			_armed = true
		elif _down.size() > 3:
			_armed = false
	else:
		_down.erase(touch.index)
		if _down.is_empty():
			if _armed and now - _first_down <= TAP_UP_MS:
				toggle_requested.emit()
			_armed = false
