class_name HomeHud
extends CanvasLayer
## Everything on screen inside a home (G-237), for a phone in landscape (chennai-game-design §3,
## game-ui-ux): the home's name, the wallet and the time; LEAVE at the top right; the context
## buttons (an `ActionContext`: SLEEP, FURNISH, LEAVE) at the bottom right where the thumb rests;
## and, when furnishing, the editor: a column of category tabs and the list of pieces on the right
## (English and Tamil names with the price), the tools along the bottom left, DONE at the top
## left. Every button is at least 48 tall; nothing but the toast sits over the room's middle.
## All text is English and Tamil (Noto Sans Tamil through `TitleFonts`).
##
## The HUD only shows and reports: it emits what was pressed, `HomesLayer` applies the rules.

signal leave_pressed
signal furnish_toggled(on: bool)
signal prop_armed(prop_id: String)
signal rotate_pressed
signal remove_pressed
signal clear_pressed
signal extend_pressed
signal wall_chosen(colour: String)
signal kolam_pressed

const PANEL_WIDTH := 372.0
const TAB_WIDTH := 118.0
const TOOL_W := 82.0
const MARGIN := 12.0

var data: HomeData
var context: ActionContext = ActionContext.new()
var editing: bool = false
var armed: String = ""
var category: String = ""

var _root: Control
var _safe: SafeAreaMargin
var _chip: Label
var _leave: Button
var _done: Button
var _actions: Control
var _action_buttons: Array[Button] = []
var _panel: PanelContainer
var _tabs: VBoxContainer
var _items: VBoxContainer
var _tab_buttons: Dictionary[String, Button] = {}
var _item_buttons: Dictionary[String, Button] = {}
var _tools: HBoxContainer
var _tool_rotate: Button
var _tool_remove: Button
var _tool_extend: Button
var _tool_kolam: Button
var _walls: HBoxContainer
var _toast: Label
var _hint: Label
var _toast_left: float = 0.0
var _wallet: int = 0
var _home_en: String = ""
var _home_ta: String = ""
var _clock: String = ""
var _labels: String = ""


func _ready() -> void:
	layer = 6
	name = "HomeHud"
	_root = Control.new()
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var theme := UiTheme.get_theme().duplicate() as Theme
	theme.default_font = TitleFonts.display(false, 0.0)
	theme.default_font_size = 15
	theme.set_font_size("font_size", "Button", 14)
	_root.theme = theme
	add_child(_root)
	_safe = SafeAreaMargin.new()
	_safe.gutter = int(MARGIN)
	_root.add_child(_safe)
	var layer_box := Control.new()
	layer_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_safe.add_child(layer_box)
	_build_top(layer_box)
	_build_actions(layer_box)
	_build_editor(layer_box)
	_build_toast(layer_box)
	set_editing(false)


func _button(en: String, ta: String, width: float = 0.0, height: float = 48.0) -> Button:
	var b := Button.new()
	b.text = "%s\n%s" % [en, ta] if ta != "" else en
	b.custom_minimum_size = Vector2(width, maxf(height, UiTheme.MIN_TARGET))
	b.focus_mode = Control.FOCUS_NONE
	b.clip_text = true
	return b


func _build_top(parent: Control) -> void:
	_chip = UiTheme.label("", 15)
	_chip.name = "Chip"
	_chip.set_anchors_and_offsets_preset(Control.PRESET_TOP_LEFT)
	_chip.position = Vector2(0, 4)
	parent.add_child(_chip)
	_leave = _button("LEAVE", "வெளியே", 112)
	_leave.name = "Leave"
	_leave.set_anchors_and_offsets_preset(Control.PRESET_TOP_RIGHT)
	_leave.position = Vector2(-112, 0)
	_leave.size = Vector2(112, 48)
	_leave.pressed.connect(func() -> void: leave_pressed.emit())
	parent.add_child(_leave)
	_done = _button("DONE", "முடிந்தது", 112)
	_done.name = "Done"
	_done.position = Vector2(0, 0)
	_done.size = Vector2(112, 48)
	_done.pressed.connect(func() -> void: furnish_toggled.emit(false))
	parent.add_child(_done)


func _build_actions(parent: Control) -> void:
	_actions = Control.new()
	_actions.name = "Actions"
	_actions.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_actions.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	parent.add_child(_actions)


func _build_editor(parent: Control) -> void:
	_panel = PanelContainer.new()
	_panel.name = "FurnishPanel"
	_panel.set_anchors_and_offsets_preset(Control.PRESET_RIGHT_WIDE)
	_panel.offset_left = -PANEL_WIDTH
	_panel.offset_right = 0
	var row := HBoxContainer.new()
	row.add_theme_constant_override("separation", 6)
	_panel.add_child(row)
	_tabs = VBoxContainer.new()
	_tabs.name = "Tabs"
	_tabs.custom_minimum_size = Vector2(TAB_WIDTH, 0)
	_tabs.add_theme_constant_override("separation", 3)
	row.add_child(_tabs)
	var scroll := ScrollContainer.new()
	scroll.name = "Items"
	scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	row.add_child(scroll)
	_items = VBoxContainer.new()
	_items.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_items.add_theme_constant_override("separation", 4)
	scroll.add_child(_items)
	parent.add_child(_panel)
	# The tools along the bottom left.
	_tools = HBoxContainer.new()
	_tools.name = "Tools"
	_tools.add_theme_constant_override("separation", 5)
	_tools.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	_tools.position = Vector2(0, -48)
	_tool_rotate = _button("ROTATE", "திருப்பு", TOOL_W)
	_tool_remove = _button("REMOVE", "அகற்று", TOOL_W)
	var clear := _button("CLEAR", "அனைத்தும்", TOOL_W)
	_tool_extend = _button("ROOM +", "அறை +", TOOL_W)
	var walls := _button("WALLS", "சுவர்", TOOL_W)
	_tool_kolam = _button("KOLAM", "கோலம்", TOOL_W)
	_tool_kolam.toggle_mode = true
	for b: Button in [_tool_rotate, _tool_remove, clear, _tool_extend, walls, _tool_kolam]:
		_tools.add_child(b)
	_tool_rotate.pressed.connect(func() -> void: rotate_pressed.emit())
	_tool_remove.pressed.connect(func() -> void: remove_pressed.emit())
	clear.pressed.connect(func() -> void: clear_pressed.emit())
	_tool_extend.pressed.connect(func() -> void: extend_pressed.emit())
	walls.pressed.connect(func() -> void: _walls.visible = not _walls.visible)
	_tool_kolam.pressed.connect(func() -> void: kolam_pressed.emit())
	parent.add_child(_tools)
	_walls = HBoxContainer.new()
	_walls.name = "Walls"
	_walls.add_theme_constant_override("separation", 6)
	_walls.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT)
	_walls.position = Vector2(0, -108)
	_walls.visible = false
	parent.add_child(_walls)


func _build_toast(parent: Control) -> void:
	_toast = UiTheme.label("", 16)
	_toast.name = "Toast"
	_toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_toast.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_toast.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_toast.custom_minimum_size = Vector2(420, 0)
	_toast.position = Vector2(-210, -96)
	_toast.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_toast.add_theme_constant_override("outline_size", 6)
	_toast.visible = false
	parent.add_child(_toast)
	_hint = UiTheme.label("", 14, UiTheme.AMBER)
	_hint.name = "Hint"
	_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_hint.custom_minimum_size = Vector2(300, 0)
	_hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.9))
	_hint.add_theme_constant_override("outline_size", 5)
	_hint.visible = false
	parent.add_child(_hint)


## Fills the tabs, the wall colours and the first category from the data.
func bind(d: HomeData) -> void:
	data = d
	for b in _tabs.get_children():
		b.queue_free()
	_tab_buttons.clear()
	for c in data.props.categories:
		var id := str(c["id"])
		var b := _button(str(c["en"]), str(c["ta"]), TAB_WIDTH)
		b.toggle_mode = true
		b.name = "Tab_%s" % id
		b.pressed.connect(show_category.bind(id))
		_tabs.add_child(b)
		_tab_buttons[id] = b
	for c in _walls.get_children():
		c.queue_free()
	for hex in data.homes.wall_colours:
		var s := Button.new()
		s.custom_minimum_size = Vector2(UiTheme.MIN_TARGET, UiTheme.MIN_TARGET)
		s.focus_mode = Control.FOCUS_NONE
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(hex)
		sb.set_corner_radius_all(10)
		sb.set_border_width_all(2)
		sb.border_color = Color(1, 1, 1, 0.6)
		for state: String in ["normal", "hover", "pressed", "focus"]:
			s.add_theme_stylebox_override(state, sb)
		s.name = "Wall_%s" % hex.trim_prefix("#")
		s.pressed.connect(func() -> void: wall_chosen.emit(hex))
		_walls.add_child(s)
	show_category(str(data.props.categories[0]["id"]))


func show_category(id: String) -> void:
	category = id
	for k in _tab_buttons:
		_tab_buttons[k].button_pressed = (k == id)
	for b in _items.get_children():
		b.queue_free()
	_item_buttons.clear()
	for def in data.props.in_category(id):
		var b := Button.new()
		b.name = "Item_%s" % def.id
		b.toggle_mode = true
		b.focus_mode = Control.FOCUS_NONE
		b.custom_minimum_size = Vector2(0, 58)
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.clip_text = true
		b.text = "%s\n%s · ₹%d" % [def.en, def.ta, data.prices.prop(def.id)]
		b.button_pressed = (def.id == armed)
		b.pressed.connect(_on_item.bind(def.id))
		_items.add_child(b)
		_item_buttons[def.id] = b
	_dim_unaffordable()


func _on_item(id: String) -> void:
	armed = "" if armed == id else id
	for k in _item_buttons:
		_item_buttons[k].button_pressed = (k == armed)
	prop_armed.emit(armed)


func disarm() -> void:
	armed = ""
	for k in _item_buttons:
		_item_buttons[k].button_pressed = false


func _dim_unaffordable() -> void:
	for k in _item_buttons:
		_item_buttons[k].modulate.a = 1.0 if data.prices.prop(k) <= _wallet else 0.55


# --- state shown ----------------------------------------------------------------------------

func set_home(en: String, ta: String) -> void:
	_home_en = en
	_home_ta = ta
	_refresh_chip()


func set_wallet(rupees: int) -> void:
	_wallet = rupees
	_refresh_chip()
	if data != null:
		_dim_unaffordable()


func set_clock(text: String) -> void:
	_clock = text
	_refresh_chip()


func _refresh_chip() -> void:
	if _chip == null:
		return
	var lead := 124.0 if editing else 0.0
	_chip.position = Vector2(lead, 4)
	_chip.text = "%s · %s\n₹%s · %s" % [_home_en, _home_ta, MissionSession.rupees(_wallet), _clock]


func set_editing(on: bool) -> void:
	editing = on
	_panel.visible = on
	_tools.visible = on
	_done.visible = on
	_actions.visible = not on
	_walls.visible = false
	if not on:
		disarm()
		_hint.visible = false
	_refresh_chip()


## Which tools apply to what is selected (rotate and remove need a piece; rotate a floor piece).
func set_selection(has_piece: bool, can_turn: bool) -> void:
	_tool_remove.disabled = not has_piece
	_tool_rotate.disabled = not (has_piece and can_turn)


func set_extension(label_en: String, label_ta: String, available: bool) -> void:
	_tool_extend.text = "%s\n%s" % [label_en, label_ta]
	_tool_extend.disabled = not available


func set_kolam(on: bool) -> void:
	_tool_kolam.button_pressed = on


func show_hint(text: String) -> void:
	_hint.text = text
	_hint.visible = text != "" and editing
	_hint.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	_hint.position = Vector2(-PANEL_WIDTH * 0.5 - 150.0, -150)


func toast(en: String, ta: String = "", seconds: float = 3.5) -> void:
	_toast.text = en if ta == "" else "%s\n%s" % [en, ta]
	_toast.visible = true
	_toast_left = seconds
	_toast.position = Vector2(-210.0 - (PANEL_WIDTH * 0.5 if editing else 0.0), -96.0 if not editing else -112.0)


# --- the context buttons ---------------------------------------------------------------------

func _process(dt: float) -> void:
	if _toast_left > 0.0:
		_toast_left -= dt
		if _toast_left <= 0.0:
			_toast.visible = false
	if not editing:
		_sync_actions()


## One button per candidate the context offers, the best the biggest, bottom right.
func _sync_actions() -> void:
	var cands := context.candidates()
	var key := "|".join(cands.map(func(c: ActionCandidate) -> String: return c.label))
	if key != _labels:
		_labels = key
		for b in _action_buttons:
			b.queue_free()
		_action_buttons.clear()
		for i in cands.size():
			_make_action(cands[i], i)
	for i in mini(cands.size(), _action_buttons.size()):
		_place_action(_action_buttons[i], i)


func _make_action(c: ActionCandidate, index: int) -> void:
	var b := Button.new()
	b.name = "Action_%s" % c.label.replace(" ", "_")
	b.text = c.label
	b.focus_mode = Control.FOCUS_NONE
	b.add_theme_font_size_override("font_size", 20 if index == 0 else 15)
	if index == 0:
		var sb := StyleBoxFlat.new()
		sb.bg_color = Color(UiTheme.AMBER, 0.92)
		sb.set_corner_radius_all(40)
		for state: String in ["normal", "hover", "pressed", "focus"]:
			b.add_theme_stylebox_override(state, sb)
		b.add_theme_color_override("font_color", Color.BLACK)
		b.add_theme_color_override("font_hover_color", Color.BLACK)
		b.add_theme_color_override("font_pressed_color", Color.BLACK)
	var act := c.activate
	b.pressed.connect(func() -> void:
		if act.is_valid():
			act.call())
	_actions.add_child(b)
	_action_buttons.append(b)


func _place_action(b: Button, index: int) -> void:
	var area := _actions.size
	if index == 0:
		b.custom_minimum_size = Vector2(88, 88)
		b.size = Vector2(88, 88)
		b.position = Vector2(area.x - 88.0 - 6.0, area.y - 88.0 - 4.0)
	else:
		b.custom_minimum_size = Vector2(104, UiTheme.MIN_TARGET)
		b.size = Vector2(104, UiTheme.MIN_TARGET)
		b.position = Vector2(area.x - 104.0 - 6.0 - 96.0, area.y - 56.0 - float(index - 1) * 54.0)


## The buttons on screen now (tests and the layout check).
func action_buttons() -> Array[Button]:
	return _action_buttons


func panel_rect() -> Rect2:
	return _panel.get_global_rect()
