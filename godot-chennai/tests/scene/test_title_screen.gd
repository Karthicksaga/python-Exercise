extends TestCase
## The title menu (G-160…G-165): rows with subtitles, CONTINUE only with a save, the pages,
## focus and Back, the entrance in game time and with reduced motion, the fonts (Tamil glyphs),
## the chip and the map credit, the CONTROLS page read from `ControlsGuide`.

const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")
const SAVE := {"has_save": true, "continue_line": "Stage 3 · ₹2,400 · 2 of 21 stages", "new_game_line": "Begin in Chennai: Stage 1, Morning walk"}

var title: TitleMenu


func _make(summary: Dictionary, reduced: bool = true) -> TitleMenu:
	var vp := SubViewport.new()
	vp.size = Vector2i(915, 412)
	vp.gui_disable_input = false
	root.add_child(vp)
	title = TITLE.instantiate()
	title.reduced_motion = reduced
	vp.add_child(title)
	title.set_save(summary)
	title.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
	return title


func _titles(t: TitleMenu) -> Array[String]:
	var out: Array[String] = []
	for r in t.rows():
		out.append(r.title_label.text)
	return out


func test_rows_with_a_save() -> bool:
	var t := _make(SAVE)
	await wait_frames(2)
	var want: Array[String] = ["CONTINUE", "NEW GAME", "SETTINGS", "CONTROLS", "ABOUT"]
	if TitleMenu.can_quit():
		want.append("QUIT")
	assert_eq(_titles(t), want, "the rows")
	assert_eq(t.primary_row().title_label.text, "CONTINUE", "CONTINUE is the primary row")
	assert_eq(t.row("CONTINUE").sub_label.text, SAVE["continue_line"], "CONTINUE says the real stage, money and stages done")
	assert_eq(t.row("NEW GAME").sub_label.text, "Start again from Stage 1", "NEW GAME with a save")
	assert_true(t.get_viewport().gui_get_focus_owner() == t.row("CONTINUE"), "CONTINUE has the focus")
	for r in t.rows():
		assert_true(r.size.y >= UiTheme.MIN_TARGET, "%s is %d tall" % [r.title_label.text, r.size.y])
	return true


func test_first_launch_has_no_continue() -> bool:
	var t := _make({"has_save": false, "new_game_line": SAVE["new_game_line"]})
	await wait_frames(2)
	assert_true(t.row("CONTINUE") == null, "no CONTINUE without a save")
	assert_eq(t.primary_row().title_label.text, "NEW GAME", "NEW GAME is the primary row")
	assert_eq(t.row("NEW GAME").sub_label.text, SAVE["new_game_line"], "NEW GAME names the first stage")
	assert_true(t.get_viewport().gui_get_focus_owner() == t.row("NEW GAME"), "NEW GAME has the focus")
	return true


func test_buttons_do_what_they_say() -> bool:
	var t := _make(SAVE)
	await wait_frames(2)
	var log: Array[String] = []
	t.play_requested.connect(func() -> void: log.append("play"))
	t.new_game_requested.connect(func() -> void: log.append("new"))
	t.row("CONTINUE").pressed.emit()
	assert_eq(log, ["play"], "CONTINUE plays")
	log.clear()
	t.row("NEW GAME").pressed.emit()
	assert_eq(log, ["new", "play"], "NEW GAME forgets the save, then plays")
	t.row("SETTINGS").pressed.emit()
	assert_eq(t.page, TitleMenu.PAGE_SETTINGS, "SETTINGS opens its page")
	assert_true(t.go_back() and t.page == TitleMenu.PAGE_MENU, "Back returns to the menu")
	t.row("CONTROLS").pressed.emit()
	assert_eq(t.page, TitleMenu.PAGE_CONTROLS, "CONTROLS opens its page")
	assert_true(t.go_back(), "Back from CONTROLS")
	t.row("ABOUT").pressed.emit()
	assert_true(t.is_about_open(), "ABOUT opens its page")
	assert_true(t.go_back(), "Back from ABOUT")
	assert_false(t.go_back(), "Back at the menu goes up to the caller (quit)")
	return true


func test_dpad_walks_the_rows() -> bool:
	var t := _make(SAVE)
	await wait_frames(2)
	var rows := t.rows()
	for i in rows.size() - 1:
		assert_true(rows[i].find_next_valid_focus() == rows[i + 1], "down from %s" % rows[i].title_label.text)
	return true


func test_settings_page_holds_the_real_settings() -> bool:
	var t := _make(SAVE)
	var state := {"n": 0}
	t.add_setting(&"Time", func() -> String: return "Time: %d" % state["n"], func() -> void: state["n"] += 1)
	var changed := {"n": 0}
	t.settings_changed.connect(func() -> void: changed["n"] += 1)
	t.show_settings()
	await wait_frames(2)
	var b := t.setting_button(&"Time")
	assert_eq(b.text, "Time: 0", "shows the value")
	assert_true(b.size.y >= UiTheme.MIN_TARGET, "48 tall")
	b.pressed.emit()
	assert_eq([b.text, changed["n"]], ["Time: 1", 1], "pressing steps the value, relabels and tells the chip")
	assert_true(t.get_viewport().gui_get_focus_owner() == b, "the first setting has the focus")
	return true


func test_controls_page_lists_the_guide() -> bool:
	var t := _make(SAVE)
	t.show_controls()
	await wait_frames(2)
	var text := ""
	for l in t.find_children("*", "Label", true, false):
		text += (l as Label).text + "\n"
	var rows := 0
	for group in ControlsGuide.groups():
		assert_contains(text, str(group["title"]), "group %s" % group["title"])
		for entry: Array in group["rows"]:
			rows += 1
			assert_contains(text, str(entry[0]), "control %s" % entry[0])
			assert_contains(text, str(entry[1]), "what %s does" % entry[0])
	assert_true(rows >= 10, "the guide has the controls (%d)" % rows)
	return true


func test_chip_and_credit() -> bool:
	var t := _make(SAVE)
	t.set_place("Marina Beach", "Evening · 17:45 · Rain")
	await wait_frames(2)
	assert_eq(t.chip_text(), "MARINA BEACH | Evening · 17:45 · Rain", "the chip")
	assert_contains(t.credit_text(), "© OpenStreetMap contributors", "the map credit")
	assert_contains(t.credit_text(), "2026-11-15", "with the extract date")
	assert_contains(t.about_text(), "2026-11-15", "ABOUT has the date too")
	t.set_place("", "")
	assert_false((t.find_child("Chip", true, false) as Control).visible, "no place name, no chip")
	return true


func test_fonts_draw_tamil_and_latin() -> bool:
	assert_true(TitleFonts.installed(), "the three font files are in the project")
	var tamil := TitleFonts.tamil()
	for c in "சென்னை":
		assert_true(tamil.has_char(c.unicode_at(0)), "Tamil face has U+%04X" % c.unicode_at(0))
	var display := TitleFonts.display(true)
	for c in "CHENNAIOPEN WRLD":
		assert_true(display.has_char(c.unicode_at(0)), "display face has %s" % c)
	# One font draws the Tamil name: the display face falls back to the Tamil one.
	var size := display.get_string_size("சென்னை", HORIZONTAL_ALIGNMENT_LEFT, -1, 40)
	assert_true(size.x > 40.0 and size.y > 20.0, "the Tamil name has a width (%s)" % size)
	return true


func test_entrance_slides_rows_in_one_by_one() -> bool:
	var t := _make(SAVE, false)
	await wait_frames(2)
	t.enter()
	var rows := t.rows()
	assert_eq(rows[0].modulate.a, 0.0, "rows start hidden")
	assert_eq(rows[0].slide_x, -TitleMenu.ROW_SLIDE, "and to the left")
	# Frames are real time here: wait until the first row is partway, then check the order.
	var ok := await wait_until(func() -> bool: return rows[0].modulate.a > 0.3, 60 * 20)
	assert_true(ok, "the first row comes in")
	for i in rows.size() - 1:
		assert_true(rows[i].modulate.a >= rows[i + 1].modulate.a, "row %d is not behind row %d" % [i, i + 1])
	assert_true(rows[rows.size() - 1].modulate.a < rows[0].modulate.a, "the last row is behind the first")
	t.settle()
	for r in rows:
		assert_eq(r.modulate.a, 1.0, "settled: %s visible" % r.title_label.text)
		assert_eq(r.slide_x, 0.0, "settled: %s in place" % r.title_label.text)
	return true


func test_reduced_motion_has_no_slide_nudge_or_glow() -> bool:
	var t := _make(SAVE, true)
	await wait_frames(2)
	t.enter()
	for r in t.rows():
		assert_eq(r.modulate.a, 1.0, "%s is simply there" % r.title_label.text)
		assert_eq(r.slide_x, 0.0, "%s does not slide" % r.title_label.text)
	var row := t.row("SETTINGS")
	row.grab_focus()
	await wait_frames(6)
	assert_eq(row.slide_x, 0.0, "no nudge on focus")
	var glow := t.row("CONTINUE").glow
	assert_near(glow.shadow_color.a, 0.12, 0.001, "the glow is still, not pulsing")
	return true


func test_focus_nudges_the_row_when_motion_is_on() -> bool:
	var t := _make(SAVE, false)
	await wait_frames(2)
	t.settle()
	var row := t.row("ABOUT")
	row.grab_focus()
	var ok := await wait_until(func() -> bool: return is_equal_approx(row.slide_x, TitleRow.NUDGE), 60 * 10)
	assert_true(ok, "focus nudges the row %d units" % TitleRow.NUDGE)
	t.row("CONTROLS").grab_focus()
	ok = await wait_until(func() -> bool: return is_equal_approx(row.slide_x, 0.0), 60 * 10)
	assert_true(ok, "and it settles back when the focus moves on")
	return true
