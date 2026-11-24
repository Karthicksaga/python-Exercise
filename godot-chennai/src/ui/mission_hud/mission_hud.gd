class_name MissionHud
extends Control
## The mission HUD (port of the Three.js `Hud.ts` mission parts): money, stages and reputation;
## the current objective with its distance, countdown and an arrow towards the marker; the JOBS
## button; short toasts; the full-screen dialog (job board, results, places); the GO INSIDE
## prompt at a place's entrance and the gym's needle. Gets everything from the composition root
## (`MissionsLayer`) and reports taps by signals; no gameplay here (AGENTS.md: `ui`).
##
## Layout at the 915x412 base (chennai-game-design §3/§7): the column sits top-left under the
## debug line, JOBS top-right left of the driving EXIT button, toasts at a quarter height in the
## middle, GO INSIDE bottom-centre between the stick and the buttons. Every target is 48 tall.

signal jobs_pressed
signal inside_pressed
## A dialog row's button (`id` of the row).
signal row_chosen(id: String)
## A dialog's own button (CONTINUE, CLOSE, QUIT JOB...).
signal action_chosen(id: String)
## The gym's LIFT button.
signal lift_pressed

const COLUMN_WIDTH := 330.0
## Room left for the debug line above the column.
const COLUMN_TOP := 52.0
const GUTTER := 16.0
const JOBS_SIZE := Vector2(96, 48)
## The driving EXIT button's width and gap (`DrivingControls`): JOBS stays left of it.
const EXIT_ROOM := 112.0
const URGENT := 10.0

var _fit_toast := false

var money_label: Label
var stage_label: Label
var reputation_label: Label
var mission_panel: PanelContainer
var mission_title: Label
var objective_label: Label
var meta_label: Label
var arrow: TargetArrow
var jobs_button: Button
var toast_panel: PanelContainer
var toast_title: Label
var toast_detail: Label
var inside_button: Button
var dialog: Control
var dialog_title: Label
var dialog_message: Label
var dialog_rows: VBoxContainer
var dialog_actions: HBoxContainer
var needle_box: Control
var needle_bar: NeedleBar
var lift_button: Button

var _toast_left := 0.0
## Buttons in the open dialog, by id (tests press them).
var buttons: Dictionary[String, Button] = {}


## A small arrow that points towards the marker, relative to where the camera looks.
class TargetArrow:
	extends Control
	## Radians clockwise from straight ahead; NAN hides it.
	var bearing := NAN

	func _draw() -> void:
		if is_nan(bearing):
			return
		var c := size / 2.0
		var r := minf(size.x, size.y) * 0.45
		var fwd := Vector2(sin(bearing), -cos(bearing))
		var side := Vector2(-fwd.y, fwd.x)
		draw_circle(c, r, Color(0, 0, 0, 0.35))
		draw_colored_polygon(PackedVector2Array([c + fwd * r * 0.85, c - fwd * r * 0.5 + side * r * 0.55, c - fwd * r * 0.2, c - fwd * r * 0.5 - side * r * 0.55]), UiTheme.AMBER)


## The gym's needle: sweeps 0..1; the good zone is drawn green.
class NeedleBar:
	extends Control
	var value := 0.0
	var zone := Vector2(0.38, 0.62)

	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		draw_rect(r, Color(1, 1, 1, 0.12))
		draw_rect(Rect2(Vector2(size.x * zone.x, 0), Vector2(size.x * (zone.y - zone.x), size.y)), Color("#4ccb6b", 0.8))
		draw_rect(Rect2(Vector2(size.x * value - 3.0, -4), Vector2(6, size.y + 8)), UiTheme.AMBER)


func _ready() -> void:
	name = "MissionHud"
	theme = UiTheme.get_theme()
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_build_column()
	jobs_button = _button("JOBS", "Jobs", 16, true)
	jobs_button.anchor_left = 1.0
	jobs_button.anchor_right = 1.0
	jobs_button.offset_left = -GUTTER - EXIT_ROOM - JOBS_SIZE.x
	jobs_button.offset_right = -GUTTER - EXIT_ROOM
	jobs_button.offset_top = GUTTER
	jobs_button.offset_bottom = GUTTER + JOBS_SIZE.y
	jobs_button.pressed.connect(func() -> void: jobs_pressed.emit())
	add_child(jobs_button)
	_build_toast()
	inside_button = _button("GO INSIDE", "Inside", 16, true)
	inside_button.anchor_left = 0.5
	inside_button.anchor_right = 0.5
	inside_button.anchor_top = 1.0
	inside_button.anchor_bottom = 1.0
	inside_button.offset_left = -90
	inside_button.offset_right = 90
	inside_button.offset_top = -GUTTER - 56
	inside_button.offset_bottom = -GUTTER
	inside_button.visible = false
	inside_button.pressed.connect(func() -> void: inside_pressed.emit())
	add_child(inside_button)
	_build_dialog()
	set_mission({}, NAN)


func _button(text: String, node_name: String, font: int, accent: bool) -> Button:
	var b := Button.new()
	b.name = node_name
	b.text = text
	b.custom_minimum_size = Vector2(0, UiTheme.MIN_TARGET)
	b.focus_mode = Control.FOCUS_ALL
	b.add_theme_font_size_override("font_size", font)
	if accent:
		var box := StyleBoxFlat.new()
		box.bg_color = UiTheme.AMBER
		box.set_corner_radius_all(12)
		box.content_margin_left = 14
		box.content_margin_right = 14
		b.add_theme_stylebox_override("normal", box)
		b.add_theme_stylebox_override("hover", box)
		b.add_theme_color_override("font_color", Color("#1a1a1a"))
		b.add_theme_color_override("font_hover_color", Color("#1a1a1a"))
		b.add_theme_color_override("font_focus_color", Color("#1a1a1a"))
	return b


static func _plate(alpha: float = 0.6) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.06, 0.07, 0.12, alpha)
	box.set_corner_radius_all(10)
	box.content_margin_left = 12
	box.content_margin_right = 12
	box.content_margin_top = 6
	box.content_margin_bottom = 6
	return box


func _build_column() -> void:
	var column := VBoxContainer.new()
	column.name = "Column"
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.position = Vector2(GUTTER, COLUMN_TOP)
	column.custom_minimum_size = Vector2(COLUMN_WIDTH, 0)
	column.size = Vector2(COLUMN_WIDTH, 0)
	column.add_theme_constant_override("separation", 6)
	add_child(column)
	var stats_panel := PanelContainer.new()
	stats_panel.name = "Stats"
	stats_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	stats_panel.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	stats_panel.add_theme_stylebox_override("panel", _plate())
	column.add_child(stats_panel)
	var stats := HBoxContainer.new()
	stats.add_theme_constant_override("separation", 12)
	stats_panel.add_child(stats)
	money_label = UiTheme.label("₹0", 16, Color("#ffd166"))
	money_label.name = "Money"
	stats.add_child(money_label)
	stage_label = UiTheme.label("Stages 0/21", 14)
	stage_label.name = "Stages"
	stats.add_child(stage_label)
	reputation_label = UiTheme.label("★ 50", 14)
	reputation_label.name = "Reputation"
	stats.add_child(reputation_label)
	mission_panel = PanelContainer.new()
	mission_panel.name = "Mission"
	mission_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	mission_panel.add_theme_stylebox_override("panel", _plate())
	column.add_child(mission_panel)
	var rows := VBoxContainer.new()
	rows.add_theme_constant_override("separation", 2)
	mission_panel.add_child(rows)
	mission_title = UiTheme.label("", 12, Color("#ffd166"))
	mission_title.name = "Title"
	mission_title.uppercase = true
	mission_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rows.add_child(mission_title)
	objective_label = UiTheme.label("", 15)
	objective_label.name = "Objective"
	objective_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rows.add_child(objective_label)
	var meta_row := HBoxContainer.new()
	meta_row.add_theme_constant_override("separation", 8)
	rows.add_child(meta_row)
	arrow = TargetArrow.new()
	arrow.name = "Arrow"
	arrow.custom_minimum_size = Vector2(22, 22)
	arrow.mouse_filter = Control.MOUSE_FILTER_IGNORE
	meta_row.add_child(arrow)
	meta_label = UiTheme.label("", 13, UiTheme.TEXT_DIM)
	meta_label.name = "Meta"
	meta_row.add_child(meta_label)


func _build_toast() -> void:
	toast_panel = PanelContainer.new()
	toast_panel.name = "Toast"
	toast_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var box := _plate(0.85)
	box.border_color = Color(1.0, 0.82, 0.4, 0.7)
	box.set_border_width_all(1)
	box.content_margin_left = 20
	box.content_margin_right = 20
	box.content_margin_top = 10
	box.content_margin_bottom = 10
	toast_panel.add_theme_stylebox_override("panel", box)
	toast_panel.anchor_left = 0.5
	toast_panel.anchor_right = 0.5
	toast_panel.anchor_top = 0.24
	toast_panel.anchor_bottom = 0.24
	toast_panel.grow_horizontal = Control.GROW_DIRECTION_BOTH
	add_child(toast_panel)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	toast_panel.add_child(v)
	toast_title = UiTheme.label("", 16)
	toast_title.name = "ToastTitle"
	toast_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(toast_title)
	toast_detail = UiTheme.label("", 13, UiTheme.TEXT_DIM)
	toast_detail.name = "ToastDetail"
	toast_detail.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	toast_detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(toast_detail)
	toast_panel.visible = false


func _build_dialog() -> void:
	dialog = Control.new()
	dialog.name = "Dialog"
	dialog.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dialog.mouse_filter = Control.MOUSE_FILTER_STOP
	add_child(dialog)
	var dim := ColorRect.new()
	dim.color = Color(0.04, 0.05, 0.09, 0.9)
	dim.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	dim.mouse_filter = Control.MOUSE_FILTER_IGNORE
	dialog.add_child(dim)
	var margin := SafeAreaMargin.new()
	margin.gutter = 16
	dialog.add_child(margin)
	var centre := CenterContainer.new()
	centre.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(centre)
	var v := VBoxContainer.new()
	v.name = "Body"
	v.custom_minimum_size = Vector2(600, 0)
	v.add_theme_constant_override("separation", 10)
	centre.add_child(v)
	dialog_title = UiTheme.label("", 22)
	dialog_title.name = "DialogTitle"
	dialog_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	v.add_child(dialog_title)
	dialog_message = UiTheme.label("", 13, UiTheme.TEXT_DIM)
	dialog_message.name = "DialogMessage"
	dialog_message.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	dialog_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(dialog_message)
	var scroll := ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.custom_minimum_size = Vector2(600, 0)
	v.add_child(scroll)
	dialog_rows = VBoxContainer.new()
	dialog_rows.name = "Rows"
	dialog_rows.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	dialog_rows.add_theme_constant_override("separation", 6)
	scroll.add_child(dialog_rows)
	needle_box = VBoxContainer.new()
	needle_box.name = "Needle"
	v.add_child(needle_box)
	needle_bar = NeedleBar.new()
	needle_bar.custom_minimum_size = Vector2(600, 28)
	needle_box.add_child(needle_bar)
	lift_button = _button("LIFT", "Lift", 18, true)
	lift_button.custom_minimum_size = Vector2(160, 56)
	lift_button.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	lift_button.pressed.connect(func() -> void: lift_pressed.emit())
	needle_box.add_child(lift_button)
	needle_box.visible = false
	dialog_actions = HBoxContainer.new()
	dialog_actions.name = "Actions"
	dialog_actions.alignment = BoxContainer.ALIGNMENT_CENTER
	dialog_actions.add_theme_constant_override("separation", 12)
	v.add_child(dialog_actions)
	dialog.visible = false


func _process(delta: float) -> void:
	if _fit_toast:
		# One frame on, the labels know their wrapped height: shrink to it (a panel outside a
		# container keeps the tallest size it was ever given).
		_fit_toast = false
		toast_panel.size = Vector2(toast_panel.size.x, 0)
	if _toast_left > 0.0:
		_toast_left -= delta
		toast_panel.modulate.a = clampf(_toast_left / 0.3, 0.0, 1.0)
		if _toast_left <= 0.0:
			toast_panel.visible = false


func set_stats(rupees: String, done: int, count: int, reputation: int) -> void:
	_text(money_label, "₹%s" % rupees)
	_text(stage_label, "Stages %d/%d" % [done, count])
	_text(reputation_label, "★ %d" % reputation)


static func _text(l: Label, t: String) -> void:
	if l.text != t:
		l.text = t


## The mission panel: {title, objective, distance, seconds_left} ({} hides it); `bearing`: where
## the marker is, radians clockwise from the camera's forward (NAN: no arrow).
func set_mission(view: Dictionary, bearing: float) -> void:
	mission_panel.visible = not view.is_empty()
	if view.is_empty():
		return
	_text(mission_title, str(view["title"]))
	_text(objective_label, str(view["objective"]))
	var parts := PackedStringArray()
	var distance: float = view["distance"]
	if distance >= 0.0:
		parts.append(("%.1f km" % (distance / 1000.0)) if distance >= 1000.0 else "%d m" % roundi(distance))
	var seconds: float = view["seconds_left"]
	if seconds >= 0.0:
		var s := maxi(0, ceili(seconds))
		parts.append("%d:%02d" % [s / 60, s % 60])
	_text(meta_label, "  ·  ".join(parts))
	meta_label.add_theme_color_override("font_color", UiTheme.DANGER if seconds >= 0.0 and seconds < URGENT else UiTheme.TEXT_DIM)
	arrow.visible = not is_nan(bearing) and distance >= 0.0
	if arrow.bearing != bearing:
		arrow.bearing = bearing
		arrow.queue_redraw()


func toast(title: String, detail: String = "", seconds: float = 3.2) -> void:
	toast_title.text = title
	toast_detail.text = detail
	toast_detail.visible = detail != ""
	# Width: the text's, up to 60 % of the screen; the panel grows both ways from the centre.
	var width := minf(size.x * 0.6 if size.x > 0.0 else 550.0, maxf(240.0, toast_title.get_theme_font("font").get_string_size(title, HORIZONTAL_ALIGNMENT_LEFT, -1, 16).x + 48.0))
	if detail != "":
		width = minf(size.x * 0.6 if size.x > 0.0 else 550.0, maxf(width, toast_detail.get_theme_font("font").get_string_size(detail, HORIZONTAL_ALIGNMENT_LEFT, -1, 13).x * 0.5 + 48.0))
	# A fixed width for the labels to wrap at, and a height of what they need: a label wrapped
	# at an earlier, narrower width must not keep its tall minimum size.
	toast_title.custom_minimum_size = Vector2(width - 40.0, 0)
	toast_detail.custom_minimum_size = Vector2(width - 40.0, 0)
	toast_panel.offset_left = -width / 2.0
	toast_panel.offset_right = width / 2.0
	toast_panel.size = Vector2(width, 0)
	_fit_toast = true
	toast_panel.visible = true
	toast_panel.modulate.a = 1.0
	_toast_left = seconds


func toast_showing() -> bool:
	return toast_panel.visible and _toast_left > 0.0


func toast_text() -> String:
	return "%s %s" % [toast_title.text, toast_detail.text] if toast_panel.visible else ""


## GO INSIDE at a place's entrance: the place's name, or "" to hide.
func set_place_prompt(place_name: String) -> void:
	inside_button.visible = place_name != ""
	if place_name != "":
		inside_button.tooltip_text = place_name


## A full-screen dialog. `rows`: [{id, title, detail, meta, button, disabled}] (a disabled row
## shows its reason instead of the detail); `actions`: [{id, label, quiet}].
func show_dialog(title: String, message: String, rows: Array[Dictionary] = [], actions: Array[Dictionary] = []) -> void:
	hide_dialog()
	# A toast behind a full-screen dialog is noise: it goes (the dialog says the news).
	toast_panel.visible = false
	_toast_left = 0.0
	dialog_title.text = title
	dialog_message.text = message
	dialog_message.visible = message != ""
	var list_height := 0.0
	for r in rows:
		var row := _row(r)
		dialog_rows.add_child(row)
		list_height += 64.0
	var scroll := dialog_rows.get_parent() as ScrollContainer
	var room := (size.y if size.y > 0.0 else 412.0) - 170.0 - (40.0 if message != "" else 0.0)
	scroll.custom_minimum_size.y = minf(list_height, maxf(64.0, room))
	scroll.visible = not rows.is_empty()
	for a in actions:
		var b := _button(str(a["label"]), "Action_%s" % str(a["id"]), 16, not bool(a.get("quiet", false)))
		b.custom_minimum_size = Vector2(150, 48)
		var id := str(a["id"])
		b.pressed.connect(func() -> void: action_chosen.emit(id))
		dialog_actions.add_child(b)
		buttons[id] = b
	dialog.visible = true
	var first: Button = null
	for id in buttons:
		if not buttons[id].disabled:
			first = buttons[id]
			break
	if first != null:
		var b := first
		(func() -> void:
			if is_instance_valid(b) and b.is_inside_tree() and b.is_visible_in_tree():
				b.grab_focus()).call_deferred()


func _row(r: Dictionary) -> Control:
	var panel := PanelContainer.new()
	panel.name = "Row_%s" % str(r["id"])
	var box := _plate(0.0)
	box.bg_color = Color(1, 1, 1, 0.08)
	box.set_corner_radius_all(12)
	box.content_margin_top = 4
	box.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", box)
	var h := HBoxContainer.new()
	h.add_theme_constant_override("separation", 12)
	panel.add_child(h)
	var text := VBoxContainer.new()
	text.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	text.add_theme_constant_override("separation", 0)
	h.add_child(text)
	text.add_child(UiTheme.label(str(r["title"]), 15))
	var disabled := str(r.get("disabled", ""))
	var detail := UiTheme.label(disabled if disabled != "" else str(r.get("detail", "")), 12, UiTheme.TEXT_DIM)
	detail.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	detail.custom_minimum_size.x = 100
	text.add_child(detail)
	var meta := str(r.get("meta", ""))
	if meta != "":
		var m := UiTheme.label(meta, 12, Color("#ffd166"))
		m.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		m.custom_minimum_size.x = 100
		text.add_child(m)
	var b := Button.new()
	var id := str(r["id"])
	b.name = "Take_%s" % id
	b.text = str(r.get("button", "TAKE"))
	b.custom_minimum_size = Vector2(110, UiTheme.MIN_TARGET)
	b.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	b.disabled = disabled != ""
	b.focus_mode = Control.FOCUS_ALL
	b.pressed.connect(func() -> void: row_chosen.emit(id))
	h.add_child(b)
	buttons[id] = b
	return panel


## The gym's needle under the dialog's text; `value` 0..1, `zone` the good share.
func show_needle(on: bool, value: float = 0.0, zone: Vector2 = Vector2(0.38, 0.62)) -> void:
	needle_box.visible = on
	needle_bar.value = value
	needle_bar.zone = zone
	needle_bar.queue_redraw()


func hide_dialog() -> void:
	buttons.clear()
	for c in dialog_rows.get_children():
		dialog_rows.remove_child(c)
		c.queue_free()
	for c in dialog_actions.get_children():
		dialog_actions.remove_child(c)
		c.queue_free()
	needle_box.visible = false
	dialog.visible = false


func dialog_open() -> bool:
	return dialog.visible


## Press a dialog button by id (tests, keyboard).
func press(id: String) -> bool:
	var b: Button = buttons.get(id)
	if b == null or b.disabled:
		return false
	b.pressed.emit()
	return true
