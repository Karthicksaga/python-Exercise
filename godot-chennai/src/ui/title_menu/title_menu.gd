class_name TitleMenu
extends CanvasLayer
## The title menu over the live city (TD-25; the landing-page design, decisions G-160…G-164):
## the Tamil name in amber over a big condensed CHENNAI and a spaced OPEN WORLD, then the rows
## CONTINUE (only when there is a save: it shows the real stage, money and stages done), NEW GAME,
## SETTINGS, CONTROLS, ABOUT and QUIT (only where an app can quit), each with a one-line subtitle.
## A dark gradient on the left carries the text and leaves the middle of the city clear; the map
## credit (with the extract date) is bottom left and a chip with the real place, the time and the
## weather bottom right. Only real options: SETTINGS holds the pause menu's settings (the
## composition root adds them with `add_setting`), CONTROLS lists `ControlsGuide`.
##
## Rows are at least 48 tall and slide in one by one; keyboard and D-pad focus work on every
## page; Back goes from a page to the menu, then asks the composition root to quit. With reduced
## motion (`reduced_motion`, the platform's own flag by default) everything is already in place:
## no slide, nudge or glow pulse.

signal play_requested
## NEW GAME: forget the saved progress, then play (emitted before `play_requested`).
signal new_game_requested
signal quit_requested
## A setting on the SETTINGS page was pressed (the chip shows the time and weather).
signal settings_changed

const PAGE_MENU := &"menu"
const PAGE_ABOUT := &"about"
const PAGE_SETTINGS := &"settings"
const PAGE_CONTROLS := &"controls"
const AMBER := Color("#ffb400")
const PAPER := Color("#f4efe6")
const MUTED := Color("#b8bcc2")
## Row, name and chip entrance (seconds), from the prototype.
const ROW_FIRST := 0.35
const ROW_STEP := 0.08
const ROW_TIME := 0.6
const ROW_SLIDE := 14.0
const BRAND_DELAYS: Array[float] = [0.05, 0.15, 0.3]
const CHIP_DELAY := 0.9

## The platform's reduced-motion flag (read when the menu is made); tests and a settings screen
## may set it before the menu enters the tree.
var reduced_motion: bool = platform_reduces_motion()
var page: StringName = PAGE_MENU

var _frame: VBoxContainer
var _pages: Dictionary[StringName, Control] = {}
var _brand: VBoxContainer
var _slots: Dictionary[Label, Control] = {}
var _tamil: Label
var _name: Label
var _sub: Label
var _rows_box: VBoxContainer
var _scroll: ScrollContainer
var _rows: Array[TitleRow] = []
var _about_text: Label
var _about_back: Button
var _settings_list: VBoxContainer
var _settings: Dictionary[StringName, Array] = {}
var _settings_back: Button
var _controls_back: Button
var _credit: Label
var _chip: Control
var _chip_place: Label
var _chip_status: Label
var _save: Dictionary = {}
var _entrance: Array[Tween] = []
var _body: Control
var _shade: TextureRect

@onready var _root: Control = $Root


func _ready() -> void:
	layer = 5
	_root.theme = UiTheme.get_theme()
	_shade = TextureRect.new()
	_shade.name = "Shade"
	_shade.texture = _shade_texture()
	_shade.stretch_mode = TextureRect.STRETCH_SCALE
	_shade.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.add_child(_shade)
	var margin := SafeAreaMargin.new()
	margin.gutter = 6
	_root.add_child(margin)
	var inset := MarginContainer.new()
	inset.add_theme_constant_override("margin_left", 10)
	inset.add_theme_constant_override("margin_right", 10)
	margin.add_child(inset)
	_frame = VBoxContainer.new()
	_frame.name = "Frame"
	_frame.add_theme_constant_override("separation", 0)
	inset.add_child(_frame)
	_body = Control.new()
	_body.name = "Body"
	_body.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_body.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(_body)
	_build_menu_page()
	_build_about_page()
	_build_settings_page()
	_build_controls_page()
	_build_foot()
	set_credits("", "")
	get_viewport().size_changed.connect(_fit)
	_fit()
	set_save({})
	show_menu()


## The platform's reduced-motion preference: Godot answers 1 (on), 0 (off) or -1 (it cannot say, as
## on headless and many Linux desktops), and only 1 turns the motion off.
static func platform_reduces_motion() -> bool:
	return DisplayServer.accessibility_should_reduce_animation() == 1


## Desktop and Android apps can quit; a web page cannot.
static func can_quit() -> bool:
	return not OS.has_feature("web")


# --- Look ------------------------------------------------------------------------------------

## One texture for the whole shade: the left-to-right fade that carries the text and the dark
## foot under the credit, drawn as a single quad (one cheap full-screen layer on a weak GPU).
static func _shade_texture() -> ImageTexture:
	var w := 192
	var h := 96
	var img := Image.create(w, h, false, Image.FORMAT_RGBA8)
	for y in h:
		var from_bottom := 1.0 - float(y) / float(h - 1)
		var foot := 0.72 * clampf(1.0 - from_bottom / 0.24, 0.0, 1.0)
		for x in w:
			var u := float(x) / float(w - 1)
			var side := _side_alpha(u)
			var a := 1.0 - (1.0 - side) * (1.0 - foot)
			img.set_pixel(x, y, Color(8.0 / 255.0, 10.0 / 255.0, 13.0 / 255.0, a))
	return ImageTexture.create_from_image(img)


## The prototype's gradient: 0.93 at the left edge, 0.8 at 30 %, 0.28 at 58 %, clear at 78 %.
static func _side_alpha(u: float) -> float:
	var stops: Array[Vector2] = [Vector2(0.0, 0.93), Vector2(0.30, 0.80), Vector2(0.58, 0.28), Vector2(0.78, 0.0)]
	if u >= stops[3].x:
		return 0.0
	for i in 3:
		if u <= stops[i + 1].x:
			return lerpf(stops[i].y, stops[i + 1].y, (u - stops[i].x) / (stops[i + 1].x - stops[i].x))
	return 0.0


## Type scales with the screen's height (the prototype's container-relative sizes), 412 being the
## smallest the UI ever gets.
func _fit() -> void:
	var h := _root.get_viewport_rect().size.y
	var w := _root.get_viewport_rect().size.x
	var tamil_px := clampi(roundi(h * 0.042), 16, 26)
	var name_px := clampi(roundi(h * 0.128), 52, 92)
	var sub_px := clampi(roundi(h * 0.029), 11, 17)
	_tamil.add_theme_font_override("font", TitleFonts.tamil())
	_tamil.add_theme_font_size_override("font_size", tamil_px)
	_name.add_theme_font_override("font", TitleFonts.display(true, name_px * 0.005))
	_name.add_theme_font_size_override("font_size", name_px)
	_sub.add_theme_font_override("font", TitleFonts.display(false, sub_px * 0.5))
	_sub.add_theme_font_size_override("font_size", sub_px)
	_set_slot(_tamil, tamil_px, 1.2)
	_set_slot(_name, name_px, 0.9)
	_set_slot(_sub, sub_px, 1.15)
	_brand.add_theme_constant_override("separation", 3)
	var row_title := clampi(roundi(h * 0.049), 20, 26)
	var row_sub := clampi(roundi(h * 0.029), 12, 13)
	for r in _rows:
		r.set_sizes(row_title, row_sub)
	var width := clampf(w * 0.46, 300.0, 420.0)
	for id: StringName in _pages:
		var p := _pages[id]
		p.set_anchors_preset(Control.PRESET_LEFT_WIDE)
		p.offset_left = 0.0
		p.offset_top = 0.0
		p.offset_bottom = 0.0
		p.offset_right = width if id != PAGE_CONTROLS else clampf(w - 24.0, 340.0, 800.0)
	var small := clampi(roundi(h * 0.03), 11, 13)
	_credit.add_theme_font_size_override("font_size", small)
	_chip_place.add_theme_font_override("font", TitleFonts.display(false, 2.0))
	_chip_place.add_theme_font_size_override("font_size", clampi(roundi(h * 0.045), 15, 22))
	_chip_status.add_theme_font_size_override("font_size", small)


## A label in a box as tall as its letters need, not as its font's line (Tamil and Latin faces
## carry a lot of empty line height; the title has 412 units to share with six rows).
func _slot(label: Label) -> Control:
	var box := Control.new()
	box.name = label.name + "Slot"
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_child(label)
	label.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_brand.add_child(box)
	return box


## Sizes a brand label's slot: `line` times the font size tall, the text centred in it.
func _set_slot(label: Label, px: int, line: float) -> void:
	var box := _slots[label]
	var font_height := label.get_theme_font("font").get_height(px)
	var want := ceilf(px * line)
	box.custom_minimum_size = Vector2(0, want)
	label.offset_top = (want - font_height) / 2.0
	label.offset_bottom = label.offset_top + font_height


func _page(id: StringName, content: VBoxContainer) -> void:
	content.name = String(id).capitalize() + "Page"
	content.visible = id == PAGE_MENU
	content.add_theme_constant_override("separation", 6)
	_body.add_child(content)
	_pages[id] = content


func _build_menu_page() -> void:
	var page_box := VBoxContainer.new()
	_page(PAGE_MENU, page_box)
	page_box.name = "Menu"
	_brand = VBoxContainer.new()
	_brand.name = "Brand"
	_brand.add_theme_constant_override("separation", 0)
	page_box.add_child(_brand)
	_tamil = UiTheme.label("சென்னை", 18, AMBER)
	_tamil.name = "Tamil"
	_slots[_tamil] = _slot(_tamil)
	_name = UiTheme.label("CHENNAI", 64, PAPER)
	_name.name = "Name"
	_name.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.45))
	_name.add_theme_constant_override("shadow_offset_y", 2)
	_slots[_name] = _slot(_name)
	_sub = UiTheme.label("OPEN WORLD", 14, AMBER)
	_sub.name = "OpenWorld"
	_slots[_sub] = _slot(_sub)
	_scroll = ScrollContainer.new()
	_scroll.name = "Scroll"
	_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_scroll.follow_focus = true
	page_box.add_child(_scroll)
	_rows_box = VBoxContainer.new()
	_rows_box.name = "Rows"
	_rows_box.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_rows_box.add_theme_constant_override("separation", 0)
	_scroll.add_child(_rows_box)


## A dark translucent plate: buttons on a page stay readable over a bright sky.
static func _plate_box() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.06, 0.07, 0.09, 0.7)
	box.border_color = Color(1, 1, 1, 0.2)
	box.set_border_width_all(2)
	box.set_corner_radius_all(10)
	return box


## The header of a page: its name, and BACK at the right end (at least 48 tall).
func _page_head(box: VBoxContainer, text: String) -> Button:
	var head := HBoxContainer.new()
	head.name = "Head"
	head.add_theme_constant_override("separation", 12)
	box.add_child(head)
	var t := UiTheme.label(text, 28, AMBER)
	t.add_theme_font_override("font", TitleFonts.display(true, 3.0))
	t.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	t.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	head.add_child(t)
	var b := UiTheme.button("BACK")
	b.name = "Back"
	b.custom_minimum_size = Vector2(120, UiTheme.MIN_TARGET)
	b.add_theme_stylebox_override("normal", _plate_box())
	b.pressed.connect(show_menu)
	head.add_child(b)
	return b


func _build_about_page() -> void:
	var box := VBoxContainer.new()
	_page(PAGE_ABOUT, box)
	_about_back = _page_head(box, "ABOUT")
	_about_text = UiTheme.label("")
	_about_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_about_text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(_about_text)


func _build_settings_page() -> void:
	var box := VBoxContainer.new()
	_page(PAGE_SETTINGS, box)
	_settings_back = _page_head(box, "SETTINGS")
	var scroll := ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	scroll.follow_focus = true
	box.add_child(scroll)
	_settings_list = VBoxContainer.new()
	_settings_list.name = "List"
	_settings_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_settings_list.add_theme_constant_override("separation", 8)
	scroll.add_child(_settings_list)


## CONTROLS: read-only, one column per group of `ControlsGuide`, on a dark plate.
func _build_controls_page() -> void:
	var box := VBoxContainer.new()
	_page(PAGE_CONTROLS, box)
	_controls_back = _page_head(box, "CONTROLS")
	var plate := PanelContainer.new()
	plate.name = "Plate"
	plate.size_flags_vertical = Control.SIZE_EXPAND_FILL
	box.add_child(plate)
	var scroll := ScrollContainer.new()
	scroll.name = "Scroll"
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	plate.add_child(scroll)
	var columns := HBoxContainer.new()
	columns.name = "Columns"
	columns.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	columns.add_theme_constant_override("separation", 18)
	scroll.add_child(columns)
	for group: Dictionary in ControlsGuide.groups():
		var column := VBoxContainer.new()
		column.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		column.add_theme_constant_override("separation", 3)
		columns.add_child(column)
		var head := UiTheme.label(str(group["title"]), 16, AMBER)
		head.add_theme_font_override("font", TitleFonts.display(false, 2.0))
		column.add_child(head)
		for entry: Array in group["rows"]:
			var key := UiTheme.label(str(entry[0]), 16, UiTheme.TEXT)
			key.add_theme_font_override("font", TitleFonts.display(false, 0.5))
			column.add_child(key)
			var what := UiTheme.label(str(entry[1]), 12, MUTED)
			what.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			what.custom_minimum_size = Vector2(150, 0)
			column.add_child(what)


func _build_foot() -> void:
	# Only the credit's height counts in the layout: the chip rises from the bottom right corner
	# (it never meets the menu column, which is on the left).
	var foot := Control.new()
	foot.name = "Foot"
	foot.custom_minimum_size = Vector2(0, 15)
	foot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_frame.add_child(foot)
	_credit = UiTheme.label("", 12, MUTED)
	_credit.name = "Credit"
	_credit.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	_credit.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_credit.grow_vertical = Control.GROW_DIRECTION_BEGIN
	foot.add_child(_credit)
	var chip := HBoxContainer.new()
	chip.name = "Chip"
	chip.add_theme_constant_override("separation", 10)
	chip.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	chip.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	chip.grow_vertical = Control.GROW_DIRECTION_BEGIN
	foot.add_child(chip)
	_chip = chip
	var text := VBoxContainer.new()
	text.add_theme_constant_override("separation", 0)
	chip.add_child(text)
	_chip_place = UiTheme.label("", 18, PAPER)
	_chip_place.name = "Place"
	_chip_place.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	text.add_child(_chip_place)
	_chip_status = UiTheme.label("", 12, MUTED)
	_chip_status.name = "Status"
	_chip_status.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	text.add_child(_chip_status)
	var bar := ColorRect.new()
	bar.color = AMBER
	bar.custom_minimum_size = Vector2(4, 0)
	chip.add_child(bar)
	chip.visible = false


# --- Data ------------------------------------------------------------------------------------

## The map credit: the index's attribution and its OSM data date, bottom left and on ABOUT.
func set_credits(attribution: String, data_date: String) -> void:
	var credit := attribution if attribution != "" else "© OpenStreetMap contributors"
	var day := data_date.substr(0, 10)
	_credit.text = "Map data %s%s" % [credit, " · %s" % day if day != "" else ""]
	_about_text.text = "An original game set in real Chennai.\nMap: %s%s, ODbL 1.0. Building heights, colours and road widths are estimated where OpenStreetMap has none.\nFonts: Barlow Condensed and Noto Sans Tamil, SIL Open Font Licence 1.1." % [credit, " (map data %s)" % day if day != "" else ""]


## What the save says, from the composition root: {has_save, continue_line, new_game_line}. The
## rows are rebuilt (CONTINUE only with a save; the primary row is CONTINUE, else NEW GAME).
func set_save(summary: Dictionary) -> void:
	_save = summary
	_build_rows()


func _build_rows() -> void:
	for r in _rows:
		r.queue_free()
	_rows.clear()
	var has_save: bool = bool(_save.get("has_save", false))
	if has_save:
		_add_row("CONTINUE", str(_save.get("continue_line", "")), true, func() -> void: play_requested.emit())
	_add_row("NEW GAME", str(_save.get("new_game_line", "Begin in Chennai: Stage 1")) if not has_save else "Start again from Stage 1", not has_save, func() -> void:
		new_game_requested.emit()
		play_requested.emit())
	_add_row("SETTINGS", "Time of day, weather and sound", false, show_settings)
	_add_row("CONTROLS", "Touch controls on foot and driving", false, show_controls)
	_add_row("ABOUT", "Credits and map data", false, show_about)
	if can_quit():
		_add_row("QUIT", "", false, func() -> void: quit_requested.emit())
	_fit()
	if is_inside_tree():
		_focus_primary.call_deferred()


func _focus_primary() -> void:
	if page == PAGE_MENU and primary_row() != null and primary_row().is_inside_tree():
		primary_row().grab_focus()


func _add_row(title: String, subtitle: String, primary: bool, action: Callable) -> void:
	var row := TitleRow.new(title, subtitle, primary)
	row.set_animated(not reduced_motion)
	row.pressed.connect(action)
	_rows_box.add_child(row)
	_rows.append(row)
	if primary:
		if reduced_motion:
			row.still_glow()
		else:
			row.start_glow()


## A setting for the SETTINGS page: a button showing its current value; pressing it calls `press`
## and relabels. The composition root passes the same label and press functions as the pause menu.
func add_setting(id: StringName, label: Callable, press: Callable) -> Button:
	var b := UiTheme.button(String(label.call()))
	b.name = String(id)
	b.custom_minimum_size = Vector2(300, UiTheme.MIN_TARGET)
	b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	b.add_theme_stylebox_override("normal", _plate_box())
	_settings_list.add_child(b)
	_settings[id] = [b, label, press]
	b.pressed.connect(func() -> void:
		press.call()
		refresh_settings()
		settings_changed.emit())
	return b


func refresh_settings() -> void:
	for id: StringName in _settings:
		var entry: Array = _settings[id]
		(entry[0] as Button).text = String((entry[1] as Callable).call())


func setting_button(id: StringName) -> Button:
	return _settings[id][0] if _settings.has(id) else null


## The chip bottom right: the real place near the camera, then "Evening · 17:45 · Rain".
func set_place(place_name: String, status: String) -> void:
	_chip_place.text = place_name.to_upper()
	_chip_status.text = status
	_chip.visible = place_name != ""


func chip_text() -> String:
	return "%s | %s" % [_chip_place.text, _chip_status.text]


func credit_text() -> String:
	return _credit.text


func about_text() -> String:
	return _about_text.text


# --- Pages and focus ---------------------------------------------------------------------------

func rows() -> Array[TitleRow]:
	return _rows


func row(title: String) -> TitleRow:
	for r in _rows:
		if r.title_label.text == title:
			return r
	return null


## The row that is highlighted when the menu opens: CONTINUE, or NEW GAME on a first launch.
func primary_row() -> TitleRow:
	for r in _rows:
		if r.primary:
			return r
	return null


func _show(id: StringName) -> void:
	page = id
	for key: StringName in _pages:
		_pages[key].visible = key == id


func show_menu() -> void:
	_show(PAGE_MENU)
	var p := primary_row()
	if p != null:
		p.grab_focus()


func show_about() -> void:
	_show(PAGE_ABOUT)
	_about_back.grab_focus()


func show_settings() -> void:
	refresh_settings()
	_show(PAGE_SETTINGS)
	var first := _settings_list.get_child(0) as Button if _settings_list.get_child_count() > 0 else _settings_back
	first.grab_focus()


func show_controls() -> void:
	_show(PAGE_CONTROLS)
	_controls_back.grab_focus()


func is_about_open() -> bool:
	return page == PAGE_ABOUT


## Android Back / Escape: one level up. Returns false when already at the top (the caller quits).
func go_back() -> bool:
	if page != PAGE_MENU:
		show_menu()
		return true
	return false


# --- Entrance ----------------------------------------------------------------------------------

## Brings the name, the rows and the chip in (short tweens, started when the title is shown).
## With reduced motion everything is simply there.
func enter() -> void:
	settle()
	if reduced_motion:
		return
	var parts: Array[Control] = [_tamil, _name, _sub]
	for i in parts.size():
		var c := parts[i]
		c.modulate.a = 0.0
		var t := create_tween()
		t.tween_property(c, "modulate:a", 1.0, 0.7).set_delay(BRAND_DELAYS[i]).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_entrance.append(t)
	for i in _rows.size():
		var r := _rows[i]
		r.modulate.a = 0.0
		r.slide_x = -ROW_SLIDE
		var t := create_tween().set_parallel(true)
		var delay := ROW_FIRST + float(i) * ROW_STEP
		t.tween_property(r, "modulate:a", 1.0, ROW_TIME).set_delay(delay).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		t.tween_property(r, "slide_x", 0.0, ROW_TIME).set_delay(delay).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
		_entrance.append(t)
	_chip.modulate.a = 0.0
	var tc := create_tween()
	tc.tween_property(_chip, "modulate:a", 1.0, 0.7).set_delay(CHIP_DELAY).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)
	_entrance.append(tc)


## Ends the entrance at once: everything in its resting place.
func settle() -> void:
	for t in _entrance:
		if t.is_valid():
			t.kill()
	_entrance.clear()
	for c: Control in [_tamil, _name, _sub, _chip]:
		c.modulate.a = 1.0
	for r in _rows:
		r.modulate.a = 1.0
		r.slide_x = 0.0
