class_name LoadingScreen
extends CanvasLayer
## The loading screen (TD-25 of the Three.js game, chennai-game-design §4; restyled like the title,
## decision G-166): the Tamil name over CHENNAI on the dark gradient, the real loading steps in
## order each marked done, current or waiting (English, with Tamil beneath where it is certain),
## a thin bar that moves only when a real step finishes, no percentage, and one tip that changes
## only when a step begins. Static on purpose: nothing loops, sweeps, tweens or fades and there is
## no `_process` (an animated loading screen failed to draw on the owner's Adreno 613); the one
## texture is a single quad. On failure it shows what failed with TRY AGAIN and CLOSE, never a
## black screen; when a step is slow `Main` calls `show_slow` for a short diagnostic line.
##
## It knows nothing about what the steps do: the composition root (`Main`) runs them.

signal retry_requested
signal close_requested

## The keys of the steps' names, by their English text (`Main.STEPS`): the screen shows each step
## in the chosen language (G-166, G-440). A step without a key shows its English text.
const STEP_KEYS: Dictionary[String, String] = {
	"Reading the map of Chennai": "loading.step.0",
	"Reading the streets": "loading.step.1",
	"Building the streets around you": "loading.step.2",
	"Parking the vehicles": "loading.step.3",
	"Running the trains": "loading.step.4",
}
## One short line per step: facts from public sources, then control hints. The tip for step `i`
## is `TIP_KEYS[i % size]`, so it changes between steps and never on a timer.
const TIP_KEYS: Array[String] = ["loading.tip.0", "loading.tip.1", "loading.tip.2", "loading.tip.3", "loading.tip.4"]
const PAPER := Color("#f4efe6")
const MUTED := Color("#b8bcc2")
const AMBER := Color("#ffb400")

var _rows: Array[Dictionary] = []  # {mark: Panel, name: Label, tamil: Label}
var _step_label: Label
var _tip: Label
var _slow: Label
var _fill: ColorRect
var _track: Control
var _list: VBoxContainer
var _error_box: VBoxContainer
var _error_label: Label
var _retry: Button
var _names: PackedStringArray = PackedStringArray()
var _done: int = 0
var _current: int = -1

@onready var _root: Control = $Root


func _ready() -> void:
	layer = 10
	_root.theme = UiTheme.get_theme()
	var backdrop := ColorRect.new()
	backdrop.color = UiTheme.BACKDROP
	backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(backdrop)
	var shade := TextureRect.new()
	shade.texture = _gradient()
	shade.stretch_mode = TextureRect.STRETCH_SCALE
	shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.add_child(shade)
	var margin := SafeAreaMargin.new()
	margin.gutter = 22
	_root.add_child(margin)
	var columns := HBoxContainer.new()
	columns.add_theme_constant_override("separation", 36)
	margin.add_child(columns)
	# Left: the name and the tip.
	var left := VBoxContainer.new()
	left.name = "Brand"
	left.custom_minimum_size = Vector2(300, 0)
	left.alignment = BoxContainer.ALIGNMENT_CENTER
	left.add_theme_constant_override("separation", 2)
	columns.add_child(left)
	var tamil := UiTheme.label("சென்னை", 24, AMBER)
	tamil.add_theme_font_override("font", TitleFonts.tamil())
	left.add_child(tamil)
	var name_label := UiTheme.label("CHENNAI", 64, PAPER)
	name_label.add_theme_font_override("font", TitleFonts.display(true, 0.3))
	left.add_child(name_label)
	var sub := UiTheme.label("", 13, AMBER)
	Tr.bind(sub, "loading.brand", null, true)
	sub.add_theme_font_override("font", TitleFonts.display(false, 6.0))
	left.add_child(sub)
	_tip = UiTheme.label("", 13, MUTED)
	_tip.name = "Tip"
	_tip.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_tip.custom_minimum_size = Vector2(280, 40)
	var gap := Control.new()
	gap.custom_minimum_size = Vector2(0, 14)
	left.add_child(gap)
	left.add_child(_tip)
	# Right: the steps, the bar, the status, the failure.
	var right := VBoxContainer.new()
	right.name = "Steps"
	right.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	right.alignment = BoxContainer.ALIGNMENT_CENTER
	right.add_theme_constant_override("separation", 10)
	columns.add_child(right)
	_list = VBoxContainer.new()
	_list.name = "List"
	_list.add_theme_constant_override("separation", 8)
	right.add_child(_list)
	_track = Control.new()
	_track.name = "Bar"
	_track.custom_minimum_size = Vector2(0, 4)
	right.add_child(_track)
	var rail := ColorRect.new()
	rail.color = Color(1, 1, 1, 0.14)
	rail.set_anchors_preset(Control.PRESET_FULL_RECT)
	_track.add_child(rail)
	_fill = ColorRect.new()
	_fill.color = AMBER
	_fill.set_anchors_preset(Control.PRESET_FULL_RECT)
	_fill.anchor_right = 0.0
	_track.add_child(_fill)
	_step_label = UiTheme.label("", UiTheme.BODY_SIZE)
	_step_label.name = "Step"
	_step_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	right.add_child(_step_label)
	_slow = UiTheme.label("", 12, MUTED)
	_slow.name = "Slow"
	_slow.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_slow.visible = false
	right.add_child(_slow)
	_error_box = VBoxContainer.new()
	_error_box.name = "Error"
	_error_box.visible = false
	_error_box.add_theme_constant_override("separation", 8)
	right.add_child(_error_box)
	_error_label = UiTheme.label("", UiTheme.BODY_SIZE, UiTheme.DANGER)
	_error_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error_box.add_child(_error_label)
	var buttons := HFlowContainer.new()
	buttons.add_theme_constant_override("h_separation", 12)
	buttons.add_theme_constant_override("v_separation", 8)
	_error_box.add_child(buttons)
	_retry = UiTheme.button("")
	Tr.bind(_retry, "loading.retry")
	_retry.name = "Retry"
	_retry.custom_minimum_size = Vector2(160, UiTheme.MIN_TARGET)
	_retry.pressed.connect(func() -> void: retry_requested.emit())
	buttons.add_child(_retry)
	var close := UiTheme.button("")
	Tr.bind(close, "loading.close")
	close.name = "Close"
	close.custom_minimum_size = Vector2(160, UiTheme.MIN_TARGET)
	close.pressed.connect(func() -> void: close_requested.emit())
	buttons.add_child(close)
	if not _names.is_empty():
		set_steps(_names)


## One small texture: dark with a faint warm glow in the lower right, drawn as one quad.
static func _gradient() -> ImageTexture:
	var w := 96
	var h := 48
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		for x in w:
			var u := float(x) / float(w - 1)
			var v := float(y) / float(h - 1)
			var glow := clampf(1.0 - Vector2(1.0 - u, 1.0 - v).length() * 1.1, 0.0, 1.0)
			img.set_pixel(x, y, Color(1.0, 0.706, 0.0, glow * glow * 0.12))
	return ImageTexture.create_from_image(img)


static func _mark_box(fill: Color, border: Color) -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = fill
	box.border_color = border
	box.set_border_width_all(2)
	box.set_corner_radius_all(7)
	return box


## Names of the steps, in order. Resets the list, the bar and the tip.
func set_steps(names: PackedStringArray) -> void:
	_names = names
	_done = 0
	_current = -1
	if _step_label == null:
		return
	for r in _rows:
		(r["row"] as Node).queue_free()
	_rows.clear()
	for step_name in names:
		var row := HBoxContainer.new()
		row.add_theme_constant_override("separation", 12)
		var mark := Panel.new()
		mark.custom_minimum_size = Vector2(14, 14)
		mark.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		row.add_child(mark)
		var text := VBoxContainer.new()
		text.add_theme_constant_override("separation", 0)
		row.add_child(text)
		var en := UiTheme.label(step_name, 16)
		if STEP_KEYS.has(step_name):
			Tr.bind(en, STEP_KEYS[step_name], null, true, &"text", 15)
		text.add_child(en)
		_list.add_child(row)
		_rows.append({"row": row, "mark": mark, "name": en})
	for i in names.size():
		_paint(i, &"waiting")
	_fill.anchor_right = 0.0
	_error_box.visible = false
	_slow.visible = false
	_step_label.text = ""
	_set_tip(0)


func _paint(i: int, state: StringName) -> void:
	var r := _rows[i]
	var mark: Panel = r["mark"]
	var en: Label = r["name"]
	var col := MUTED
	match state:
		&"done":
			mark.add_theme_stylebox_override("panel", _mark_box(AMBER, AMBER))
			col = PAPER
		&"current":
			mark.add_theme_stylebox_override("panel", _mark_box(Color(AMBER, 0.35), AMBER))
			col = AMBER
		&"failed":
			mark.add_theme_stylebox_override("panel", _mark_box(UiTheme.DANGER, UiTheme.DANGER))
			col = UiTheme.DANGER
		_:
			mark.add_theme_stylebox_override("panel", _mark_box(Color.TRANSPARENT, Color(1, 1, 1, 0.3)))
			col = Color(MUTED, 0.65)
	en.add_theme_color_override("font_color", col)
	r["state"] = state


## Step `i` started: its row is current, its name shows in the status line and the tip changes
## (the only time it does).
func begin_step(i: int) -> void:
	_current = i
	_paint(i, &"current")
	Tr.bind(_step_label, "loading.dots", [_step_arg(i)])
	_set_tip(i)
	_slow.visible = false


## Step `i` finished: its row is done and the bar moves by one real step.
func finish_step(i: int) -> void:
	_paint(i, &"done")
	_done += 1
	_fill.anchor_right = float(_done) / float(maxi(_names.size(), 1))


## A step that is taking long: one dim line, set by `Main` from its heartbeat (not by a timer here).
func show_slow(step: int, seconds: int) -> void:
	var what: Variant = _step_arg(step) if step >= 0 and step < _names.size() else &"loading.slow_default"
	Tr.bind(_slow, "loading.slow", [what, seconds])
	_slow.visible = true


## Shows what failed with TRY AGAIN and CLOSE; TRY AGAIN takes the focus.
func fail(step: int, message: String) -> void:
	if step >= 0 and step < _names.size():
		Tr.bind(_step_label, "loading.fail_step", [_step_arg(step)])
		_paint(step, &"failed")
	else:
		Tr.bind(_step_label, "loading.fail")
	_slow.visible = false
	_error_label.text = message
	_error_box.visible = true
	_retry.grab_focus()


func step_text() -> String:
	return _step_label.text


func tip_text() -> String:
	return _tip.text


func slow_text() -> String:
	return _slow.text if _slow.visible else ""


## Steps finished (the bar's lit part).
func lit_segments() -> int:
	return _done


## "waiting", "current", "done" or "failed" for step `i`.
func state_of(i: int) -> StringName:
	return _rows[i]["state"]


func bar_fraction() -> float:
	return _fill.anchor_right


## Step `i`'s name in Tamil, "" where the step has none.
func tamil_text(i: int) -> String:
	var key: String = STEP_KEYS.get(_names[i], "")
	return Tr.raw(key, "ta") if key != "" else ""


## The tip for step `i`, in the chosen language (it changes only when a step begins).
func _set_tip(i: int) -> void:
	Tr.bind(_tip, TIP_KEYS[i % TIP_KEYS.size()])


## A step's name as a translation argument: its key when it has one, else its text.
func _step_arg(i: int) -> Variant:
	var key: String = STEP_KEYS.get(_names[i], "")
	return StringName(key) if key != "" else _names[i]
