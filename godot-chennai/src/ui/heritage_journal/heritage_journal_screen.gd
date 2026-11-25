class_name HeritageJournalScreen
extends CanvasLayer
## The heritage journal's screen (G-472), opened from the pause menu: every place of the culture data
## with its name and one line, filling in as the player visits (visited places first, in the order
## visited; the rest wait as "a place to find"). A round glass CLOSE (or Back) leaves it. It runs
## while the tree is paused. All words are `cul.*` keys, rebuilt when the language changes; the
## list scrolls under a thumb (`TouchScroll`) so Tamil and both-language text never cut off.

signal closed

const GUTTER := 16
const MAX_WIDTH := 680.0
## Room the panel's own margins, header and count line take (the list gets the rest).
const CHROME := 112.0

var data: CultureData
var journal: HeritageJournal
var close_button: Button
var _panel: PanelContainer
var _scroll: TouchScroll
var _list: VBoxContainer
var _title: Label
var _count: Label
var _margin: SafeAreaMargin


func _init() -> void:
	name = "HeritageJournal"
	layer = 9  # above the pause menu (8)
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.get_theme()
	add_child(root)
	var dim := ColorRect.new()
	dim.name = "Dim"
	dim.color = Color(0, 0, 0, 0.55)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(dim)
	_margin = SafeAreaMargin.new()
	_margin.name = "Safe"
	_margin.gutter = GUTTER
	root.add_child(_margin)
	var area := Control.new()
	area.name = "Area"
	area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_margin.add_child(area)
	_panel = PanelContainer.new()
	_panel.name = "Panel"
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_top = 0.5
	_panel.anchor_bottom = 0.5
	_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	area.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 6)
	_panel.add_child(column)
	var header := HBoxContainer.new()
	header.name = "Header"
	header.add_theme_constant_override("separation", 8)
	column.add_child(header)
	_title = UiTheme.label("", UiTheme.BUTTON_SIZE + 4, UiTheme.AMBER)
	_title.name = "Title"
	_title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	Tr.bind(_title, "cul.journal.title")
	header.add_child(_title)
	close_button = UiTheme.icon_button(UiIcons.EXIT, 40.0, UiTheme.MIN_TARGET)
	close_button.name = "Close"
	# The glass icon button is not focusable by default; the journal's gamepad focus starts on CLOSE.
	close_button.focus_mode = Control.FOCUS_ALL
	# A two-line title (both languages) must not stretch the circle.
	close_button.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	Tr.bind(close_button, "cul.journal.close_tip", null, false, &"tooltip_text")
	close_button.pressed.connect(close)
	header.add_child(close_button)
	_count = UiTheme.label("", UiTheme.BODY_SIZE, UiTheme.TEXT_DIM)
	_count.name = "Count"
	_count.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(_count)
	_scroll = UiTheme.touch_scroll()
	column.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.name = "List"
	_list.add_theme_constant_override("separation", 8)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)


func _ready() -> void:
	Tr.bus.changed.connect(_on_language)
	get_viewport().size_changed.connect(_fit)
	_list.resized.connect(_fit)


func is_open() -> bool:
	return visible


func open(culture: CultureData, entries: HeritageJournal) -> void:
	data = culture
	journal = entries
	_rebuild()
	visible = true
	_fit()
	close_button.grab_focus()


func close() -> void:
	if visible:
		visible = false
		closed.emit()


func _on_language() -> void:
	if visible:
		_rebuild()
		_fit.call_deferred()


func _unhandled_key_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


## The rows: the visited places in the order visited, then the places still to find.
func rows() -> Array[CultureData.Stop]:
	var out: Array[CultureData.Stop] = []
	if data == null or journal == null:
		return out
	for id in journal.order():
		var s := data.stop(id)
		if s != null:
			out.append(s)
	for s in data.stops:
		if not journal.has_visited(s.id):
			out.append(s)
	return out


func _rebuild() -> void:
	for c in _list.get_children():
		_list.remove_child(c)
		c.queue_free()
	if data == null or journal == null:
		return
	_count.text = Tr.t("cul.journal.count", [journal.count(), data.stops.size()])
	if journal.count() == 0:
		var empty := UiTheme.label(Tr.t("cul.journal.empty"), UiTheme.BODY_SIZE, UiTheme.TEXT)
		empty.name = "Empty"
		empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		_list.add_child(empty)
	for s in rows():
		_list.add_child(_row(s, journal.has_visited(s.id)))


func _row(s: CultureData.Stop, seen: bool) -> Control:
	var plate := PanelContainer.new()
	plate.name = "Row_%s" % s.id
	plate.add_theme_stylebox_override("panel", UiTheme.glass_plate(0.4 if seen else 0.22, 12))
	plate.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 2)
	plate.add_child(box)
	var name_label := UiTheme.label(Tr.t(s.name_key()) if seen else Tr.t("cul.journal.locked"), UiTheme.BUTTON_SIZE, UiTheme.TEXT if seen else UiTheme.TEXT_DIM)
	name_label.name = "Name"
	name_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(name_label)
	var line := UiTheme.label(Tr.t(s.line_key()) if seen else Tr.t("cul.journal.locked_hint"), UiTheme.BODY_SIZE, UiTheme.TEXT_DIM if seen else Color(UiTheme.TEXT_DIM, 0.7))
	line.name = "Line"
	line.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	box.add_child(line)
	if seen and s.activity != &"" and journal.is_done(s.id):
		var done := UiTheme.label(Tr.t("cul.journal.done"), UiTheme.BODY_SIZE, UiTheme.AMBER)
		done.name = "Done"
		done.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		box.add_child(done)
	return plate


## The panel's size: as wide as is comfortable, the list as tall as the safe area leaves room for
## (it scrolls beyond that).
func _fit() -> void:
	if not is_inside_tree():
		return
	var screen := get_viewport().get_visible_rect().size
	var room_w := screen.x - float(_margin.get_theme_constant("margin_left") + _margin.get_theme_constant("margin_right"))
	var room_h := screen.y - float(_margin.get_theme_constant("margin_top") + _margin.get_theme_constant("margin_bottom"))
	var width := minf(MAX_WIDTH, room_w)
	_panel.custom_minimum_size.x = width
	var want := _list.get_combined_minimum_size().y
	_scroll.custom_minimum_size = Vector2(width - 24.0, clampf(want, UiTheme.MIN_TARGET, maxf(UiTheme.MIN_TARGET, room_h - CHROME - _count.get_combined_minimum_size().y)))
	_panel.reset_size()
	var size := _panel.get_combined_minimum_size()
	_panel.offset_left = -size.x / 2.0
	_panel.offset_right = size.x / 2.0
	_panel.offset_top = -size.y / 2.0
	_panel.offset_bottom = size.y / 2.0
