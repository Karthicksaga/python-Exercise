class_name DrivingControls
extends Control
## Touch driving controls, scheme A "wheel" (chennai-game-design §3, input-systems; decisions
## G-78, G-174): slide-to-steer anywhere on the left (a ring shows where the thumb landed), GAS
## (largest) and BRAKE under the right thumb (BRAKE says "hold to reverse" under it), HORN above
## BRAKE (SIREN on the ambulance and police car), EXIT top-right (a round icon), speed and gear
## bottom-centre as a readout only. All round glass (G-290): the drawn circle is inset in a larger
## hit area, white labels, the accent only while held. No steering slider and no P / R / D chips. Each control appears only while
## driving; GET IN is the ACTION button on foot (`ActionContext`), not part of this set.
## Sizes and the left-handed mirror come from `ControlsLayout` (UI units at the 915x412 base).
##
## It knows nothing of vehicles: the composition root (`DrivingWiring`) reads `gas_held()`,
## `brake_held()`, `steer_value()`, listens to the signals and pushes the mode, readout and
## reverse state in (AGENTS.md: `ui` gets its data from `app`).
signal exit_pressed
signal horn_pressed

const GUTTER := 16.0

## The preferences it follows; may be swapped at any time (tests, a new profile).
var settings: ControlSettings = ControlSettings.shared():
	set(value):
		if settings != null and settings.changed.is_connected(_place):
			settings.changed.disconnect(_place)
		settings = value
		if is_node_ready():
			settings.changed.connect(_place)
			_place()
var steer_pad: SteerZone
var gas: HoldButton
var brake: HoldButton
var horn: HoldButton
var exit_button: HoldButton
var readout: Label
var toast_label: Label
var brake_hint: Label

var _area: Control
var _mode: StringName = &"foot"
var _toast_time := 0.0
var _horn_label := "HORN"
var _reversing := false


func _init() -> void:
	name = "DrivingControls"
	theme = UiTheme.get_theme()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_preset(Control.PRESET_FULL_RECT)
	var safe := SafeAreaMargin.new()
	safe.name = "Safe"
	safe.gutter = int(GUTTER)
	add_child(safe)
	_area = Control.new()
	_area.name = "Area"
	_area.mouse_filter = Control.MOUSE_FILTER_IGNORE
	safe.add_child(_area)
	steer_pad = SteerZone.new()
	steer_pad.name = "Steer"
	_area.add_child(steer_pad)
	gas = _button("GAS", "Gas", 20, 5.0)
	_area.add_child(gas)
	brake = _button("BRAKE", "Brake", 14, 4.0)
	_area.add_child(brake)
	brake_hint = UiTheme.label("hold to reverse", 11, UiTheme.TEXT)
	brake_hint.add_theme_color_override("font_outline_color", Color(0, 0, 0, 0.7))
	brake_hint.add_theme_constant_override("outline_size", 3)
	brake_hint.name = "ReverseHint"
	brake_hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
	brake_hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	# Under the circle, in the strip below the pedals (DRIVE_BOTTOM), not inside it.
	brake_hint.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	brake_hint.offset_left = -12.0
	brake_hint.offset_right = 12.0
	brake_hint.offset_top = 1.0
	brake_hint.offset_bottom = 17.0
	brake.add_child(brake_hint)
	horn = _button("HORN", "Horn", 12, 3.0)
	_area.add_child(horn)
	exit_button = _button("", "Exit", 16, 4.0)
	exit_button.tooltip_text = "Exit"
	var exit_icon := UiTheme.IconOverlay.new()
	exit_icon.kind = UiIcons.EXIT
	exit_icon.visual = 40.0
	exit_button.add_child(exit_icon)
	_area.add_child(exit_button)
	readout = UiTheme.label("", 18)
	readout.name = "Readout"
	readout.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	readout.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	readout.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var panel := UiTheme.glass_plate(0.5, UiTheme.ROUND)
	panel.content_margin_left = 14
	panel.content_margin_right = 14
	panel.content_margin_top = 4
	panel.content_margin_bottom = 4
	readout.add_theme_stylebox_override("normal", panel)
	_area.add_child(readout)
	toast_label = UiTheme.label("", 16)
	toast_label.name = "Toast"
	toast_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	toast_label.add_theme_stylebox_override("normal", panel)
	toast_label.anchor_left = 0.5
	toast_label.anchor_right = 0.5
	toast_label.offset_left = -170
	toast_label.offset_right = 170
	toast_label.offset_top = 8
	toast_label.offset_bottom = 40
	toast_label.visible = false
	_area.add_child(toast_label)
	exit_button.pressed_down.connect(func() -> void: exit_pressed.emit())
	horn.pressed_down.connect(func() -> void: horn_pressed.emit())
	_area.resized.connect(_place)
	set_mode(&"foot")


## `settings` may be replaced (tests) until the controls enter the tree.
func _ready() -> void:
	settings.changed.connect(_place)
	DeviceTracker.shared().changed.connect(_on_device)
	_place()
	_on_device(DeviceTracker.shared().current)


func _exit_tree() -> void:
	if settings != null and settings.changed.is_connected(_place):
		settings.changed.disconnect(_place)
	var tracker := DeviceTracker.shared()
	if tracker.changed.is_connected(_on_device):
		tracker.changed.disconnect(_on_device)


## Lays every control out from `ControlsLayout.driving` (also when the settings change).
func _place() -> void:
	var r := ControlsLayout.driving(_area.size, settings)
	for pair: Array in [[gas, &"gas"], [brake, &"brake"], [horn, &"horn"], [exit_button, &"exit"], [readout, &"readout"]]:
		var c := pair[0] as Control
		var rect: Rect2 = r[pair[1]]
		c.position = rect.position
		c.size = rect.size
	var zone: Rect2 = r[&"steer_zone"]
	steer_pad.position = zone.position
	steer_pad.size = zone.size
	steer_pad.rest = Rect2((r[&"steer_rest"] as Rect2).position - zone.position, (r[&"steer_rest"] as Rect2).size)
	steer_pad.queue_redraw()
	for pair: Array in [[gas, 5.0], [brake, 4.0], [horn, 3.0], [exit_button, 4.0]]:
		UiTheme.set_round(pair[0] as Button, pair[1] as float)
	_apply_opacity()


func _apply_opacity() -> void:
	for c: Control in [gas, brake, horn, exit_button]:
		c.modulate.a = settings.opacity


func _on_device(device: DeviceTracker.Device) -> void:
	if gas == null:
		return
	gas.hint = DeviceTracker.glyph(&"gas", device)
	brake.hint = DeviceTracker.glyph(&"brake", device)
	horn.hint = DeviceTracker.glyph(&"horn", device)
	exit_button.hint = DeviceTracker.glyph(&"exit", device)


func _button(text: String, node_name: String, font: int, inset: float) -> HoldButton:
	var b := HoldButton.new()
	b.text = text
	b.name = node_name
	b.add_theme_font_size_override("font_size", font)
	# Round dark glass over a bright sky or a white wall; the drawn circle sits `inset` inside the
	# button's rect, which is the thumb's hit area.
	UiTheme.style_glass(b, false, inset, 24)
	return b


func gas_held() -> bool:
	return gas.held()


func brake_held() -> bool:
	return brake.held()


## The eased slide, -1..1 (`DriveInput` shapes it).
func steer_value() -> float:
	return steer_pad.value


## Which controls show: the driving set, or none. `horn_label` is "HORN", or "SIREN" on vehicles
## with one.
func set_mode(m: StringName, horn_label: String = "HORN") -> void:
	_mode = m
	var drive := m == &"driving"
	for c: Control in [steer_pad, gas, brake, horn, exit_button, readout]:
		c.visible = drive
	_horn_label = horn_label
	horn.text = horn_label
	set_reversing(false)


## Speed and gear, e.g. "42 km/h   D3" (a readout, not a control).
func set_readout(text: String) -> void:
	readout.text = text


## BRAKE shows REVERSE while the vehicle is reversing on hold.
func set_reversing(on: bool) -> void:
	_reversing = on
	brake.text = "REVERSE" if on else "BRAKE"
	brake.add_theme_font_size_override("font_size", 12 if on else 14)
	brake_hint.visible = not on


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
