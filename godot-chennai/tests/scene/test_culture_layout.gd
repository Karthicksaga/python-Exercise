extends TestCase
## The culture screens and buttons in English, Tamil and both languages at a 915x412 phone and a
## 2460x1080 one (G-480…G-489, the HUD rules): the heritage journal fits (its round glass CLOSE is a
## 48 px circle, no text cut off or overflowing, long rows scroll), the swimmer's energy plate fits,
## the pause menu's JOURNAL row fits, and every new ACTION label fits the round ACTION button.

const SCREENS: Array[Vector2i] = [Vector2i(915, 412), Vector2i(2460, 1080)]
const MODES: Array[Tr.Mode] = [Tr.Mode.ENGLISH, Tr.Mode.TAMIL, Tr.Mode.BOTH]
const BASE := Vector2(915, 412)
const ACTION_KEYS: Array[String] = ["cul.act.leave_shoes", "cul.act.light_lamp", "cul.act.swim", "cul.act.get_out"]


func before_each() -> void:
	Tr.set_mode(Tr.Mode.ENGLISH)


func _done() -> bool:
	Tr.hide_unreviewed = false
	Tr.set_mode(Tr.Mode.ENGLISH)
	return true


static func _ui_size(screen: Vector2i) -> Vector2i:
	var scale := minf(screen.x / BASE.x, screen.y / BASE.y)
	return Vector2i(roundi(screen.x / scale), roundi(screen.y / scale))


static func _label(mode: Tr.Mode) -> String:
	return ["English", "Tamil", "both"][mode]


func _viewport(size: Vector2i) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = size
	vp.gui_disable_input = false
	root.add_child(vp)
	return vp


static func _inside_scroll(c: Control) -> bool:
	var p := c.get_parent()
	while p != null:
		if p is ScrollContainer:
			return true
		p = p.get_parent()
	return false


## Every label's text fits its box (wrapped labels are tall enough), nothing visible leaves the screen
## unless it is in a scroll list.
func _fits(vp: SubViewport, what: String) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	for node in vp.find_children("*", "Control", true, false):
		var c := node as Control
		if not c.is_visible_in_tree():
			continue
		if (c is Label or c is Button) and not _inside_scroll(c):
			check(screen.encloses(c.get_global_rect().grow(-0.5)), "%s: %s is off-screen %s" % [what, c.name, c.get_global_rect()])
		if c is Label:
			var l := c as Label
			if l.autowrap_mode != TextServer.AUTOWRAP_OFF:
				var need := l.get_line_count() * l.get_line_height()
				check(need <= l.size.y + 1.0, "%s: %s wraps to %d lines (%d px) in a %d px box" % [what, l.name, l.get_line_count(), need, l.size.y])
			else:
				var widest := 0.0
				for line in l.text.split("\n"):
					widest = maxf(widest, l.get_theme_font("font").get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, l.get_theme_font_size("font_size")).x)
				check(widest <= l.size.x + 1.0, "%s: %s needs %d px but has %d" % [what, l.name, widest, l.size.x])


func _journal() -> HeritageJournal:
	var j := HeritageJournal.new()
	for id: String in ["kapaleeshwarar-temple", "marina-beach", "chennai-central"]:
		j.visit(id)
	j.complete("kapaleeshwarar-temple")
	return j


func test_the_heritage_journal_fits_every_language_and_screen() -> bool:
	var data := CultureData.load_file()
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var ui := _ui_size(screen)
			var what := "journal, %s, %dx%d" % [_label(mode), screen.x, screen.y]
			var vp := _viewport(ui)
			var s := HeritageJournalScreen.new()
			vp.add_child(s)
			await wait_frames(2)
			s.open(data, _journal())
			await wait_frames(4)
			var panel := s.find_child("Panel", true, false) as Control
			check(Rect2(Vector2.ZERO, Vector2(ui)).encloses(panel.get_global_rect()), "%s: the panel is inside the screen %s" % [what, panel.get_global_rect()])
			var close := s.close_button
			check(close.size.x >= UiTheme.MIN_TARGET - 0.5 and close.size.y >= UiTheme.MIN_TARGET - 0.5, "%s: CLOSE is a 48 px touch target (%s)" % [what, close.size])
			check(absf(close.size.x - close.size.y) < 0.5, "%s: CLOSE is round (square box %s)" % [what, close.size])
			check(close.get_theme_stylebox("normal") is StyleBoxFlat and (close.get_theme_stylebox("normal") as StyleBoxFlat).corner_radius_top_left >= int(close.size.x * 0.5) - 8, "%s: CLOSE is a glass circle" % what)
			var scroll := s.find_child("Scroll", true, false) as ScrollContainer
			check(scroll.size.y >= UiTheme.MIN_TARGET, "%s: the list has room (%d)" % [what, scroll.size.y])
			# Visited rows say their name and line; the others wait with the hint.
			check(s.find_child("Row_marina-beach", true, false) != null and s.find_child("Row_ripon-building", true, false) != null, "%s: a row for every place" % what)
			var first := s.find_child("Name", true, false) as Label
			check(first.text.contains("Kapaleeshwarar") or first.text.contains("கபாலீசுவரர்"), "%s: the temple, visited first, is on top (%s)" % [what, first.text])
			_fits(vp, what)
			# The list scrolls to its last row: nothing is cut off at the bottom.
			scroll.scroll_vertical = int(scroll.get_v_scroll_bar().max_value)
			await wait_frames(1)
			var last := s.find_child("Row_kathipara-junction", true, false) as Control
			check(last != null and last.get_global_rect().end.y <= scroll.get_global_rect().end.y + 1.0, "%s: the last row can be scrolled into view" % what)
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_an_empty_journal_says_so_in_every_language() -> bool:
	var data := CultureData.load_file()
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var what := "empty journal, %s, %dx%d" % [_label(mode), screen.x, screen.y]
			var vp := _viewport(_ui_size(screen))
			var s := HeritageJournalScreen.new()
			vp.add_child(s)
			await wait_frames(2)
			s.open(data, HeritageJournal.new())
			await wait_frames(4)
			check(s.find_child("Empty", true, false) != null, "%s: the empty line shows" % what)
			check((s.find_child("Count", true, false) as Label).text.contains("0"), "%s: 0 places visited" % what)
			_fits(vp, what)
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_the_journal_follows_the_language_live() -> bool:
	var data := CultureData.load_file()
	var vp := _viewport(_ui_size(SCREENS[0]))
	var s := HeritageJournalScreen.new()
	vp.add_child(s)
	await wait_frames(2)
	s.open(data, _journal())
	await wait_frames(2)
	var title := s.find_child("Title", true, false) as Label
	assert_eq(title.text, "HERITAGE JOURNAL", "English title")
	Tr.set_mode(Tr.Mode.TAMIL)
	await wait_frames(3)
	assert_eq(title.text, "பாரம்பரியக் குறிப்பேடு", "Tamil title")
	var name_label := s.find_child("Name", true, false) as Label
	assert_eq(name_label.text, "கபாலீசுவரர் கோயில்", "a row's name in Tamil")
	vp.queue_free()
	return _done()


func test_the_swimmers_energy_plate_fits() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var what := "swim energy, %s, %dx%d" % [_label(mode), screen.x, screen.y]
			var vp := _viewport(_ui_size(screen))
			var h := SwimHud.new()
			vp.add_child(h)
			await wait_frames(2)
			assert_false(h.visible, "hidden until swimming")
			h.show_energy(true, 0.6)
			await wait_frames(4)
			var plate := h.find_child("Plate", true, false) as Control
			check(Rect2(Vector2.ZERO, Vector2(vp.size)).encloses(plate.get_global_rect()), "%s: the plate is inside the screen %s" % [what, plate.get_global_rect()])
			check(plate.get_global_rect().position.y > vp.size.y * 0.55, "%s: low on the screen, clear of the top HUD" % what)
			check(absf(h.bar.value - 60.0) < 0.01, "%s: the bar shows 60 per cent" % what)
			_fits(vp, what)
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_the_pause_menus_journal_row_fits() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var what := "pause menu journal, %s, %dx%d" % [_label(mode), screen.x, screen.y]
			var vp := _viewport(_ui_size(screen))
			var menu := PauseMenu.new()
			vp.add_child(menu)
			await wait_frames(2)
			menu.open()
			await wait_frames(4)
			var row := menu.find_child("Journal", true, false) as Button
			check(row != null and row.size.y >= UiTheme.MIN_TARGET - 0.5, "%s: the JOURNAL row is a 48 px target" % what)
			var widest := 0.0
			for line in row.text.split("\n"):
				widest = maxf(widest, row.get_theme_font("font").get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, row.get_theme_font_size("font_size")).x)
			check(widest <= row.size.x - 8.0, "%s: its text fits (%d of %d px)" % [what, widest, row.size.x])
			var asked := [false]
			menu.journal_requested.connect(func() -> void: asked[0] = true)
			row.pressed.emit()
			check(asked[0], "%s: pressing it asks for the journal" % what)
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_the_new_action_labels_fit_the_round_action_button() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var what := "action button, %s, %dx%d" % [_label(mode), screen.x, screen.y]
			var vp := _viewport(_ui_size(screen))
			var t := TouchControls.new()
			vp.add_child(t)
			await wait_frames(3)
			for key: String in ACTION_KEYS:
				var text := Tr.t(key)
				t.action_context = ActionContext.new()
				t.action_context.add_source(func() -> Variant: return ActionCandidate.make(text, ActionContext.P_TALK, 1.0, func() -> void: pass))
				await wait_frames(3)
				var action: TouchButton = t.buttons()[0]
				check(action.text == text, "%s: the button shows %s (%s)" % [what, key, action.text])
				check(action.text_fits(), "%s: %s fits the circle (%s)" % [what, key, action.text])
			vp.queue_free()
			await wait_frames(1)
	return _done()
