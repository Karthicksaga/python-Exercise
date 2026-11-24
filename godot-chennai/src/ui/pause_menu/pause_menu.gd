class_name PauseMenu
extends CanvasLayer
## The pause menu (TD-25 of the Three.js game, chennai-game-design §3; decision G-115): RESUME,
## the settings the game really has (each a button showing its current value; pressing it moves
## to the next value), QUIT TO TITLE. A PAUSE button shows during play, top-right beside the
## driving EXIT. Only real options: the composition root adds each setting with
## `add_setting(id, label, press)` (time of day, weather, sound), so this screen knows no game
## system (AGENTS.md: `ui` gets its data from `app`).
##
## It never clips: the buttons sit in a ScrollContainer whose height is the smaller of the
## content and the screen inside the safe area, so on a short screen the list scrolls instead
## of being cut off (the Three.js pause menu once lost its first and last buttons). It runs while
## the tree is paused (process mode ALWAYS). Keyboard and D-pad focus work; Back closes it
## through the composition root (`go_back`).

signal resume_requested
signal title_requested
signal pause_requested

## The PAUSE button (G-290): a round glass icon, 40 to the eye, a 48 hit area.
const PAUSE_VISUAL := 40.0
const PAUSE_SIZE := Vector2(48, 48)
## Right of the PAUSE button: the driving EXIT (a 48 round icon) and the gap beside it.
const PAUSE_RIGHT := 56.0
const GUTTER := 16

var pause_button: Button
var _panel: PanelContainer
var _scroll: ScrollContainer
var _list: VBoxContainer
var _resume: Button
var _settings: Dictionary[StringName, Array] = {}  # id → [button, label: Callable, press: Callable]
var _margin: SafeAreaMargin


func _init() -> void:
	name = "PauseMenu"
	layer = 6
	process_mode = Node.PROCESS_MODE_ALWAYS
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.get_theme()
	add_child(root)
	_margin = SafeAreaMargin.new()
	_margin.name = "Safe"
	_margin.gutter = GUTTER
	root.add_child(_margin)
	var area := Control.new()
	area.name = "Area"
	area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_margin.add_child(area)

	pause_button = UiTheme.icon_button(UiIcons.PAUSE, PAUSE_VISUAL, PAUSE_SIZE.x)
	pause_button.name = "Pause"
	pause_button.tooltip_text = "Pause"
	pause_button.anchor_left = 1.0
	pause_button.anchor_right = 1.0
	pause_button.offset_left = -PAUSE_RIGHT - PAUSE_SIZE.x
	pause_button.offset_right = -PAUSE_RIGHT
	pause_button.offset_bottom = PAUSE_SIZE.y
	pause_button.pressed.connect(func() -> void: pause_requested.emit())
	pause_button.visible = false
	area.add_child(pause_button)

	# A dim layer over the frozen city, then the centred panel.
	var dim := ColorRect.new()
	dim.name = "Dim"
	dim.color = Color(0, 0, 0, 0.35)
	dim.set_anchors_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_STOP
	dim.visible = false
	root.add_child(dim)
	root.move_child(dim, 0)
	_panel = PanelContainer.new()
	_panel.name = "Panel"
	_panel.anchor_left = 0.5
	_panel.anchor_right = 0.5
	_panel.anchor_top = 0.5
	_panel.anchor_bottom = 0.5
	_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_panel.grow_vertical = Control.GROW_DIRECTION_BOTH
	_panel.visible = false
	area.add_child(_panel)
	var column := VBoxContainer.new()
	column.add_theme_constant_override("separation", 8)
	_panel.add_child(column)
	column.add_child(UiTheme.label("PAUSED", UiTheme.BUTTON_SIZE + 6, UiTheme.AMBER))
	_scroll = ScrollContainer.new()
	_scroll.name = "Scroll"
	UiTheme.touch_scroll(_scroll)
	column.add_child(_scroll)
	_list = VBoxContainer.new()
	_list.name = "List"
	_list.add_theme_constant_override("separation", 10)
	_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_scroll.add_child(_list)
	_resume = _menu_button("RESUME", "Resume")
	_resume.pressed.connect(func() -> void: resume_requested.emit())
	var quit := _menu_button("QUIT TO TITLE", "QuitToTitle")
	quit.pressed.connect(func() -> void: title_requested.emit())
	visible = true


func _ready() -> void:
	get_viewport().size_changed.connect(_fit)
	_list.resized.connect(_fit)


func _menu_button(text: String, node_name: String) -> Button:
	var b := UiTheme.button(text)
	b.name = node_name
	b.custom_minimum_size = Vector2(280, UiTheme.MIN_TARGET)
	_list.add_child(b)
	return b


## A setting: a button labelled `label.call()` (e.g. "Weather: Rain"); pressing it calls
## `press` and relabels. Settings go between RESUME and QUIT TO TITLE, in the order added.
func add_setting(id: StringName, label: Callable, press: Callable) -> Button:
	var b := _menu_button(String(label.call()), String(id))
	_list.move_child(b, _list.get_child_count() - 2)
	_settings[id] = [b, label, press]
	b.pressed.connect(func() -> void:
		press.call()
		refresh())
	return b


## Relabels every setting from its current value.
func refresh() -> void:
	for id: StringName in _settings:
		var entry: Array = _settings[id]
		(entry[0] as Button).text = String((entry[1] as Callable).call())


func setting_button(id: StringName) -> Button:
	return _settings[id][0] if _settings.has(id) else null


## PAUSE shows during play only.
func show_pause_button(on: bool) -> void:
	pause_button.visible = on and not is_open()


func open() -> void:
	refresh()
	_panel.visible = true
	(get_node(^"Root/Dim") as Control).visible = true
	pause_button.visible = false
	_fit.call_deferred()
	_resume.grab_focus()


func close() -> void:
	_panel.visible = false
	(get_node(^"Root/Dim") as Control).visible = false


func is_open() -> bool:
	return _panel.visible


## The list's height: all of it when it fits, else what fits inside the safe area (it scrolls).
func _fit() -> void:
	if not is_inside_tree():
		return
	var screen := get_viewport().get_visible_rect().size
	var room := screen.y - float(_margin.get_theme_constant("margin_top") + _margin.get_theme_constant("margin_bottom"))
	# The panel's own margins and the PAUSED title above the list.
	var chrome := 20.0 + 8.0 + 32.0 + 4.0
	var want := _list.get_combined_minimum_size().y
	_scroll.custom_minimum_size = Vector2(_list.get_combined_minimum_size().x, clampf(want, UiTheme.MIN_TARGET, maxf(UiTheme.MIN_TARGET, room - chrome)))
	_panel.reset_size()
	var size := _panel.get_combined_minimum_size()
	_panel.offset_left = -size.x / 2.0
	_panel.offset_right = size.x / 2.0
	_panel.offset_top = -size.y / 2.0
	_panel.offset_bottom = size.y / 2.0
