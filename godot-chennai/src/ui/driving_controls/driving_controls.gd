class_name DrivingControls
extends Control
## Touch driving controls (chennai-game-design §3, input-systems; decision G-78), laid out for a
## phone in landscape: steering pad bottom-left under the left thumb; GAS (largest, bottom-right
## corner) and BRAKE beside it under the right thumb; the P/R/D selector above GAS; HORN (SIREN on
## the ambulance and police car) above BRAKE; EXIT top-right, out of the way of the thumbs; speed
## and gear bottom-centre. Each control appears only when it applies: GET IN on foot next to a
## vehicle, the driving set while driving, nothing while getting in or out or thrown.
## All sizes are UI units at the 915x412 base (48 is about 9 mm on a phone).

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
var gas: TouchButton
var brake: TouchButton
var horn: TouchButton
var exit_button: TouchButton
var get_in: TouchButton
var gears: Dictionary = {}
var readout: Label
var toast_label: Label

var _driving: Driving
var _mode: StringName = &"foot"
var _toast_time := 0.0
var _blink := 0.0


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
		b.pressed_down.connect(_on_gear.bind(g))
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
	exit_button.pressed_down.connect(_on_exit)
	horn.pressed_down.connect(_on_horn)
	get_in.pressed_down.connect(_on_get_in)
	set_mode(&"foot", null)


func _button(text: String, node_name: String, font: int) -> TouchButton:
	var b := TouchButton.new()
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


func connect_driving(d: Driving) -> void:
	_driving = d
	d.toast.connect(show_toast)


func gas_held() -> bool:
	return gas.held()


func brake_held() -> bool:
	return brake.held()


func steer_value() -> float:
	return steer_pad.value


## Which controls show: the driving set, GET IN (on foot, when near a vehicle), or none.
func set_mode(m: StringName, v: Vehicle) -> void:
	_mode = m
	var drive := m == &"driving"
	for c: Control in [steer_pad, gas, brake, horn, exit_button, readout]:
		c.visible = drive
	for g: String in gears:
		(gears[g] as Control).visible = drive
	get_in.visible = false
	if drive and v != null:
		horn.text = "SIREN" if v.has_siren() else "HORN"


func show_toast(text: String) -> void:
	toast_label.text = text
	toast_label.visible = true
	_toast_time = 1.6


func _process(delta: float) -> void:
	if _toast_time > 0.0:
		_toast_time -= delta
		if _toast_time <= 0.0:
			toast_label.visible = false
	if _driving == null:
		return
	if _mode == &"foot":
		get_in.visible = _driving.nearest_vehicle() != null
	elif _mode == &"driving" and _driving.vehicle != null:
		var v := _driving.vehicle
		readout.text = "%d km/h   %s" % [roundi(v.speed_kmh()), _driving.gear_label()]
		_blink += delta
		var box := _driving.gearbox
		for g: String in gears:
			var b: TouchButton = gears[g]
			b.set_pressed_no_signal(box.gear == g and box.pending == "")
			# The gear asked for while still moving blinks until it engages.
			b.modulate = Color(1, 1, 1, 0.45 if box.pending == g and int(_blink * 4.0) % 2 == 0 else 1.0)
		if v.has_siren():
			horn.set_pressed_no_signal(v.siren())


func _on_gear(g: String) -> void:
	if _driving != null:
		_driving.select_gear(g)


func _on_exit() -> void:
	if _driving != null:
		_driving.exit()


func _on_horn() -> void:
	if _driving != null:
		_driving.press_horn()


func _on_get_in() -> void:
	if _driving != null:
		_driving.enter(_driving.nearest_vehicle())
