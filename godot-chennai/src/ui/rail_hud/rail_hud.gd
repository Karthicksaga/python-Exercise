class_name RailHud
extends Control
## The railway's HUD (G-330), in the glass style: what the player sees and presses at a station,
## riding as a passenger and driving from the cab, plus the timetable and route map. It shows
## plain data the app gives it and emits what was pressed; it knows nothing of the rail module.
##
## Phone landscape (chennai-game-design §3): the lever bottom-left under the left thumb, HORN, EMG
## and the doors bottom-right, the speedometer top-right, the next station top-left; passenger
## buttons bottom-right; every target at least 48 px; a drag anywhere else looks around.

signal notch_changed(index: int)
signal horn_changed(on: bool)
signal emergency_pressed
signal leave_cab_pressed
signal step_off_pressed
signal seat_pressed
signal view_pressed
signal timetable_pressed
signal drive_pressed
## A drag on the free part of the screen while riding or driving (UI units).
signal look(delta: Vector2)

const OFF := &"off"
const STATION := &"station"
const RIDE := &"ride"
const CAB := &"cab"
## Room kept at the bottom right for the map credit's plate (`DebugHud`), UI units.
const CREDIT_CLEAR := 30.0

var mode: StringName = OFF
var tamil_font: Font = null

var margin: SafeAreaMargin
var look_area: Control
var info: PanelContainer
var info_title: Label
var info_ta: Label
var info_line: Label
var toast: Label
var lever: NotchLever
var dial: SpeedDial
var horn: Button
var emg: Button
## The vigilance handle (dead man's handle, G-454): hold it while the train moves.
var handle: HoldButton
var doors: Label
var leave: Button
var step_off: Button
var seat: Button
var view: Button
var timetable: Button
var drive: Button
var score: Label
var signal_chip: Label
var sheet: PanelContainer
var sheet_rows: VBoxContainer
var sheet_title: Label
var map: RouteMap
var close_sheet: Button
var _toast_left: float = 0.0
var _centre: VBoxContainer
## The bottom-right column and the cab's HORN/EMG row: hidden when nothing in them shows, so no
## empty container is laid out (an empty one had a zero height, G-330).
var _buttons: VBoxContainer
var _cab_row: HBoxContainer
var _action_row: HBoxContainer
var _dragging: bool = false


func _init() -> void:
	name = "RailHud"
	set_anchors_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func _ready() -> void:
	look_area = Control.new()
	look_area.name = "LookArea"
	look_area.set_anchors_preset(Control.PRESET_FULL_RECT)
	look_area.mouse_filter = Control.MOUSE_FILTER_STOP
	look_area.gui_input.connect(_on_look_input)
	add_child(look_area)
	margin = SafeAreaMargin.new()
	add_child(margin)
	var layer := Control.new()
	layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(layer)
	# Top-left: station, train and next stop (Tamil above English).
	info = PanelContainer.new()
	info.name = "Info"
	info.add_theme_stylebox_override("panel", RailHudStyle.glass(RailHudStyle.GLASS_PANEL))
	info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 0)
	info_title = RailHudStyle.label("", 15)
	info_ta = RailHudStyle.label("", 18, RailHudStyle.AMBER)
	info_line = RailHudStyle.label("", 13, RailHudStyle.TEXT_DIM)
	box.add_child(info_title)
	box.add_child(info_ta)
	box.add_child(info_line)
	info.add_child(box)
	# Bottom centre, between the stick (or the lever) and the action buttons: the top-left is the
	# mission HUD's, the top-right the pause button's.
	var centre := VBoxContainer.new()
	centre.name = "Centre"
	centre.alignment = BoxContainer.ALIGNMENT_END
	centre.add_theme_constant_override("separation", 8)
	centre.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	centre.grow_horizontal = Control.GROW_DIRECTION_BOTH
	centre.grow_vertical = Control.GROW_DIRECTION_BEGIN
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(centre)
	_centre = centre
	info.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	centre.add_child(info)
	toast = RailHudStyle.label("", 15, RailHudStyle.AMBER)
	toast.name = "Toast"
	toast.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast.set_anchors_preset(Control.PRESET_CENTER_TOP)
	toast.position = Vector2(-220, 64)
	toast.size = Vector2(440, 24)
	toast.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	layer.add_child(toast)
	# Cab: lever bottom-left, dial top-right, horn/EMG/doors bottom-right, score and signal.
	lever = NotchLever.new()
	lever.name = "Lever"
	lever.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	lever.position = Vector2(0, -250)
	lever.notch_changed.connect(func(i: int) -> void: notch_changed.emit(i))
	layer.add_child(lever)
	dial = SpeedDial.new()
	dial.name = "Dial"
	dial.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	dial.position = Vector2(-150, 60)
	layer.add_child(dial)
	score = RailHudStyle.label("", 14)
	score.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	score.position = Vector2(-300, 70)
	score.size = Vector2(140, 22)
	score.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	layer.add_child(score)
	signal_chip = RailHudStyle.label("", 14)
	signal_chip.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	signal_chip.position = Vector2(-300, 94)
	signal_chip.size = Vector2(140, 22)
	signal_chip.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	layer.add_child(signal_chip)
	var right := VBoxContainer.new()
	right.name = "Buttons"
	_buttons = right
	right.alignment = BoxContainer.ALIGNMENT_END
	right.add_theme_constant_override("separation", 10)
	right.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	right.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	right.grow_vertical = Control.GROW_DIRECTION_BEGIN
	right.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Above the map credit's plate at the bottom right (it sat over HORN and EMG, G-455).
	right.offset_bottom = -CREDIT_CLEAR
	layer.add_child(right)
	doors = RailHudStyle.label("Doors closed", 14)
	doors.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	right.add_child(doors)
	# The passenger and cab actions share a row, so the column stays low enough to leave the speed dial
	# its room above it and the map credit its plate below it (G-455).
	var actions := HBoxContainer.new()
	actions.name = "ActionRow"
	_action_row = actions
	actions.alignment = BoxContainer.ALIGNMENT_END
	actions.add_theme_constant_override("separation", 10)
	actions.mouse_filter = Control.MOUSE_FILTER_IGNORE
	right.add_child(actions)
	leave = RailHudStyle.button("LEAVE CAB")
	leave.pressed.connect(func() -> void: leave_cab_pressed.emit())
	actions.add_child(leave)
	step_off = RailHudStyle.button("STEP OFF", true)
	step_off.pressed.connect(func() -> void: step_off_pressed.emit())
	actions.add_child(step_off)
	seat = RailHudStyle.button("SIT")
	seat.pressed.connect(func() -> void: seat_pressed.emit())
	actions.add_child(seat)
	view = RailHudStyle.button("VIEW")
	view.pressed.connect(func() -> void: view_pressed.emit())
	actions.add_child(view)
	var row := HBoxContainer.new()
	row.name = "CabRow"
	_cab_row = row
	row.add_theme_constant_override("separation", 10)
	row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	right.add_child(row)
	# The vigilance handle sits with HORN and EMG: the right thumb holds it (same height, so the column stays as it was).
	handle = RailHudStyle.hold_button("HOLD")
	handle.name = "Handle"
	row.add_child(handle)
	horn = RailHudStyle.button("HORN")
	horn.button_down.connect(func() -> void: horn_changed.emit(true))
	horn.button_up.connect(func() -> void: horn_changed.emit(false))
	row.add_child(horn)
	emg = RailHudStyle.button("EMG")
	emg.add_theme_stylebox_override("normal", RailHudStyle.glass(Color(0.75, 0.12, 0.1, 0.7), 24))
	emg.pressed.connect(func() -> void: emergency_pressed.emit())
	row.add_child(emg)
	# Under the info: TIMETABLE (and DRIVE at a cab door).
	var top := HBoxContainer.new()
	top.add_theme_constant_override("separation", 10)
	top.alignment = BoxContainer.ALIGNMENT_CENTER
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_centre.add_child(top)
	timetable = RailHudStyle.button("TIMETABLE")
	timetable.pressed.connect(func() -> void: timetable_pressed.emit())
	top.add_child(timetable)
	drive = RailHudStyle.button("DRIVE", true)
	drive.pressed.connect(func() -> void: drive_pressed.emit())
	top.add_child(drive)
	_build_sheet(layer)
	set_mode(OFF)


func _build_sheet(layer: Control) -> void:
	sheet = PanelContainer.new()
	sheet.name = "Timetable"
	sheet.add_theme_stylebox_override("panel", RailHudStyle.glass(Color(0.04, 0.05, 0.07, 0.86), 18))
	sheet.set_anchors_preset(Control.PRESET_FULL_RECT)
	sheet.offset_left = 40
	sheet.offset_right = -40
	sheet.offset_top = 10
	sheet.offset_bottom = -10
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	sheet.add_child(h)
	var left := VBoxContainer.new()
	left.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(left)
	sheet_title = RailHudStyle.label("Timetable", 18, RailHudStyle.AMBER)
	left.add_child(sheet_title)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	left.add_child(scroll)
	sheet_rows = VBoxContainer.new()
	sheet_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	scroll.add_child(sheet_rows)
	close_sheet = RailHudStyle.button("CLOSE")
	close_sheet.pressed.connect(func() -> void: sheet.visible = false)
	left.add_child(close_sheet)
	map = RouteMap.new()
	map.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map.size_flags_stretch_ratio = 0.9
	h.add_child(map)
	sheet.visible = false
	layer.add_child(sheet)


func set_tamil_font(f: Font) -> void:
	tamil_font = f
	if f != null:
		info_ta.add_theme_font_override("font", f)


## &"off", &"station", &"ride" or &"cab".
func set_mode(next: StringName) -> void:
	mode = next
	visible = next != OFF
	var cab := next == CAB
	var ride := next == RIDE
	lever.visible = cab
	dial.visible = cab
	horn.visible = cab
	emg.visible = cab
	handle.visible = cab
	doors.visible = cab
	score.visible = cab
	signal_chip.visible = cab
	leave.visible = false
	step_off.visible = false
	seat.visible = ride
	view.visible = ride or cab
	drive.visible = false
	look_area.visible = ride or cab
	info.visible = next != OFF
	timetable.visible = next != OFF
	if next == OFF:
		sheet.visible = false
	_tidy()


## Shows a container only while one of its children shows.
func _tidy() -> void:
	_cab_row.visible = horn.visible or emg.visible or handle.visible
	_action_row.visible = leave.visible or step_off.visible or seat.visible or view.visible
	var any := false
	for c: Node in _buttons.get_children():
		if (c as Control).visible:
			any = true
	_buttons.visible = any


func set_info(title: String, tamil: String, line: String) -> void:
	info_title.text = title
	info_ta.text = tamil
	info_ta.visible = tamil != ""
	info_line.text = line


func show_toast(text: String, seconds: float = 2.5) -> void:
	toast.text = text
	_toast_left = seconds
	toast.visible = true


func set_offers(can_step_off: bool, can_leave_cab: bool, can_drive: bool) -> void:
	step_off.visible = mode == RIDE and can_step_off
	leave.visible = mode == CAB and can_leave_cab
	drive.visible = mode == STATION and can_drive
	_tidy()


func set_seated(seated: bool) -> void:
	seat.text = "STAND" if seated else "SIT"


## The cab's figures: speed and limit (km/h), notch, doors, signal aspect name, score.
func set_cab(kmh: float, limit: float, notch: int, doors_open: bool, aspect: String, points: int) -> void:
	dial.set_values(kmh, limit)
	lever.set_notch(notch)
	doors.text = "Doors open" if doors_open else "Doors closed"
	doors.add_theme_color_override("font_color", RailHudStyle.GOOD if doors_open else RailHudStyle.TEXT)
	var colours := {"red": RailHudStyle.DANGER, "yellow": RailHudStyle.AMBER, "green": RailHudStyle.GOOD}
	signal_chip.text = "Signal %s · limit %d" % [aspect, roundi(limit)]
	signal_chip.add_theme_color_override("font_color", colours.get(aspect, RailHudStyle.TEXT) as Color)
	score.text = "Score %d" % points


## The vigilance handle's state: seconds left before the warning (0 when it does not count),
## the warning sounding, the emergency brake tripped. The label and colour follow.
func set_vigilance(left: float, warning: bool, tripped: bool) -> void:
	var text := "HOLD"
	var colour := RailHudStyle.TEXT
	if tripped:
		text = "BRAKING"
		colour = RailHudStyle.DANGER
	elif warning:
		text = "HOLD!"
		colour = RailHudStyle.DANGER
	elif left > 0.0 and left <= 5.0:
		text = "HOLD %d" % ceili(left)
		colour = RailHudStyle.AMBER
	if handle.text != text:
		handle.text = text
		handle.add_theme_color_override("font_color", colour)
		handle.add_theme_color_override("font_pressed_color", colour)


## True while a finger (or the mouse) holds the handle and it is on screen.
func handle_held() -> bool:
	return handle.is_visible_in_tree() and handle.held()


## The timetable sheet: a title, rows of text, and the route map's data.
func show_timetable(title: String, rows: PackedStringArray, lines: Array[Array], stations: Array[Array], at: Vector2, credit: String) -> void:
	sheet_title.text = title
	for c: Node in sheet_rows.get_children():
		c.queue_free()
	for r in rows:
		var l := RailHudStyle.label(r, 14)
		if tamil_font != null:
			l.add_theme_font_override("font", tamil_font)
		sheet_rows.add_child(l)
	map.set_data(lines, stations, at, credit)
	sheet.visible = true


func timetable_open() -> bool:
	return sheet.visible


func _process(dt: float) -> void:
	if _toast_left > 0.0:
		_toast_left -= dt
		if _toast_left <= 0.0:
			toast.visible = false


func _on_look_input(event: InputEvent) -> void:
	if event is InputEventScreenDrag:
		look.emit((event as InputEventScreenDrag).relative)
	elif event is InputEventMouseMotion and ((event as InputEventMouseMotion).button_mask & MOUSE_BUTTON_MASK_LEFT) != 0:
		look.emit((event as InputEventMouseMotion).relative)


## Every visible button (layout tests).
func visible_buttons() -> Array[Button]:
	var out: Array[Button] = []
	for b: Button in [leave, step_off, seat, view, horn, emg, handle, timetable, drive]:
		if b.is_visible_in_tree():
			out.append(b)
	return out
