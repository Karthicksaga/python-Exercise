class_name DrivingControls
extends Control
## Touch driving controls (chennai-game-design §3, input-systems; decision G-78), laid out for a
## phone in landscape: steering pad bottom-left under the left thumb; GAS (largest, bottom-right
## corner) and BRAKE beside it under the right thumb; the P/R/D selector above GAS; HORN (SIREN on
## the ambulance and police car) above BRAKE; EXIT top-right, out of the way of the thumbs; speed
## and gear bottom-centre. Each control appears only when it applies: GET IN on foot next to a
## vehicle, the driving set while driving, nothing while getting in or out or thrown.
## All sizes are UI units at the 915x412 base (48 is about 9 mm on a phone).
##
## It knows nothing of vehicles: the composition root (`DrivingWiring`) reads `gas_held()`,
## `brake_held()`, `steer_value()`, listens to the signals and pushes the mode, readout and gear
## state in (AGENTS.md: `ui` gets its data from `app`).

signal gear_selected(gear: String)
signal exit_pressed
signal horn_pressed
signal get_in_pressed

const GUTTER := 16.0
const GAP := 12.0
const GAS_SIZE := Vector2(100, 124)
const BRAKE_SIZE := Vector2(100, 100)
const GEAR_SIZE := Vector2(100, 48)
const GEAR_GAP := 8.0
const HORN_SIZE := Vector2(100, 56)
const EXIT_SIZE := Vector2(100, 52)
const STEER_SIZE := Vector2(250, 128)

var steer_pad: SteerPad
var gas: HoldButton
var brake: HoldButton
var horn: HoldButton
var exit_button: HoldButton
var get_in: HoldButton
var gears: Dictionary = {}
var readout: Label
var toast_label: Label

var _mode: StringName = &"foot"
var _toast_time := 0.0
var _blink := 0.0
var _pending := ""


func _init() -> void:
	name = "DrivingControls"
	theme = UiTheme.get_theme()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var safe := SafeAreaMargin.new()
	safe.name = "Safe"
	safe.gutter = int(GUTTER)
	add_child(safe)
	var area := Control.new()
	area.name = "Area"
	area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	safe.add_child(area)

	steer_pad = SteerPad.new()
	steer_pad.name = "Steer"
	_corner(steer_pad, area, Vector2(0, 1), Vector2(0, -STEER_SIZE.y), STEER_SIZE)
	gas = _button("GAS", "Gas", 22)
	_corner(gas, area, Vector2(1, 1), Vector2(-GAS_SIZE.x, -GAS_SIZE.y), GAS_SIZE)
	brake = _button("BRAKE", "Brake", 18)
	_corner(brake, area, Vector2(1, 1), Vector2(-GAS_SIZE.x - GAP - BRAKE_SIZE.x, -BRAKE_SIZE.y), BRAKE_SIZE)
	var top := -GAS_SIZE.y - GAP
	for g: String in ["D", "R", "P"]:
		var b := _button(g, "Gear" + g, 20)
		top -= GEAR_SIZE.y
		_corner(b, area, Vector2(1, 1), Vector2(-GEAR_SIZE.x, top), GEAR_SIZE)
		top -= GEAR_GAP
		gears[g] = b
		b.pressed_down.connect(func() -> void: gear_selected.emit(g))
	horn = _button("HORN", "Horn", 16)
	_corner(horn, area, Vector2(1, 1), Vector2(-GAS_SIZE.x - GAP - HORN_SIZE.x, -BRAKE_SIZE.y - GAP - HORN_SIZE.y), HORN_SIZE)
	exit_button = _button("EXIT", "Exit", 16)
	_corner(exit_button, area, Vector2(1, 0), Vector2(-EXIT_SIZE.x, 0), EXIT_SIZE)
	get_in = _button("GET IN", "GetIn", 18)
	_corner(get_in, area, Vector2(1, 1), Vector2(-150, -GAS_SIZE.y - GAP - 64), Vector2(150, 64))

	readout = UiTheme.label("", 18)
	readout.name = "Readout"
	readout.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	var panel := StyleBoxFlat.new()
	panel.bg_color = UiTheme.PANEL
	panel.set_corner_radius_all(10)
	panel.content_margin_left = 14
	panel.content_margin_right = 14
	panel.content_margin_top = 4
	panel.content_margin_bottom = 4
	readout.add_theme_stylebox_override("normal", panel)
	readout.anchor_left = 0.5
	readout.anchor_right = 0.5
	readout.anchor_top = 1.0
	readout.anchor_bottom = 1.0
	readout.offset_left = -90
	readout.offset_right = 90
	readout.offset_top = -40
	readout.offset_bottom = 0
	area.add_child(readout)
	toast_label = UiTheme.label("", 16, UiTheme.AMBER)
	toast_label.name = "Toast"
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.add_theme_stylebox_override("normal", panel)
	toast_label.anchor_left = 0.5
	toast_label.anchor_right = 0.5
	toast_label.offset_left = -170
	toast_label.offset_right = 170
	toast_label.offset_top = 8
	toast_label.offset_bottom = 40
	toast_label.visible = false
	area.add_child(toast_label)
	exit_button.pressed_down.connect(func() -> void: exit_pressed.emit())
	horn.pressed_down.connect(func() -> void: horn_pressed.emit())
	get_in.pressed_down.connect(func() -> void: get_in_pressed.emit())
	set_mode(&"foot")


func _button(text: String, node_name: String, font: int) -> HoldButton:
	var b := HoldButton.new()
	b.text = text
	b.name = node_name
	b.add_theme_font_size_override("font_size", font)
	# Dark translucent panels so the labels read over a bright sky or a white wall.
	b.add_theme_stylebox_override("normal", _box(Color(0.06, 0.07, 0.09, 0.62), Color(1, 1, 1, 0.22)))
	b.add_theme_stylebox_override("hover", _box(Color(0.1, 0.11, 0.14, 0.7), Color(1, 1, 1, 0.3)))
	b.add_theme_stylebox_override("pressed", _box(UiTheme.AMBER, UiTheme.AMBER))
	b.add_theme_stylebox_override("hover_pressed", _box(UiTheme.AMBER, UiTheme.AMBER))
	b.add_theme_color_override("font_hover_pressed_color", Color.BLACK)
	return b


static func _box(fill: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(2)
	box.set_corner_radius_all(12)
	return box


## Place `c` at an anchor corner of `parent` with an offset and size.
func _corner(c: Control, parent: Control, anchor: Vector2, offset: Vector2, size_px: Vector2) -> void:
	c.anchor_left = anchor.x
	c.anchor_right = anchor.x
	c.anchor_top = anchor.y
	c.anchor_bottom = anchor.y
	c.offset_left = offset.x
	c.offset_top = offset.y
	c.offset_right = offset.x + size_px.x
	c.offset_bottom = offset.y + size_px.y
	parent.add_child(c)


func gas_held() -> bool:
	return gas.held()


func brake_held() -> bool:
	return brake.held()


func steer_value() -> float:
	return steer_pad.value


## Which controls show: the driving set, or none (GET IN is `set_get_in`). `horn_label` is
## "HORN", or "SIREN" on vehicles with one.
func set_mode(m: StringName, horn_label: String = "HORN") -> void:
	_mode = m
	var drive := m == &"driving"
	for c: Control in [steer_pad, gas, brake, horn, exit_button, readout]:
		c.visible = drive
	for g: String in gears:
		(gears[g] as Control).visible = drive
	get_in.visible = false
	horn.text = horn_label


## GET IN shows on foot next to a vehicle.
func set_get_in(on: bool) -> void:
	get_in.visible = on and _mode == &"foot"


## Speed and gear, e.g. "42 km/h   D3".
func set_readout(text: String) -> void:
	readout.text = text


## The engaged gear lights; a gear asked for while still moving (`pending`) blinks.
func set_gears(engaged: String, pending: String) -> void:
	_pending = pending
	for g: String in gears:
		(gears[g] as HoldButton).set_pressed_no_signal(engaged == g and pending == "")


## The siren button lit while the siren is on.
func set_siren_lit(on: bool) -> void:
	horn.set_pressed_no_signal(on)


func show_toast(text: String) -> void:
	toast_label.text = text
	toast_label.visible = true
	_toast_time = 1.6


func _process(delta: float) -> void:
	if _toast_time > 0.0:
		_toast_time -= delta
		if _toast_time <= 0.0:
			toast_label.visible = false
	_blink += delta
	for g: String in gears:
		var b: HoldButton = gears[g]
		b.modulate = Color(1, 1, 1, 0.45 if _pending == g and int(_blink * 4.0) % 2 == 0 else 1.0)
