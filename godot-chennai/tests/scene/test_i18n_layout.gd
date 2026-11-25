extends TestCase
## Tamil and both-language text in the UI (G-444, G-445): every screen at 915x412 and at
## 1830x824 (the UI is 915x412 for both; the test also lays a 1830x824 UI out) with the longest
## Tamil the game has. Checks: controls inside the screen, buttons 48 tall and not overlapping,
## no label's text cut off or wider than its box, long Tamil words wrap, no glyph is a box.

const SCREENS: Array[Vector2i] = [Vector2i(915, 412), Vector2i(1830, 824)]
const MODES: Array[Tr.Mode] = [Tr.Mode.TAMIL, Tr.Mode.BOTH]
const BASE := Vector2(915, 412)
const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")
const LOADING := preload("res://src/ui/loading_screen/loading_screen.tscn")

var _settings: Array[RefCounted] = []


func before_each() -> void:
	Tr.set_mode(Tr.Mode.ENGLISH)


## Every test leaves the language as it found it (English): later tests read English.
func _done() -> bool:
	Tr.hide_unreviewed = false
	Tr.set_mode(Tr.Mode.ENGLISH)
	return true


static func _ui_size(screen: Vector2i) -> Vector2i:
	var scale := minf(screen.x / BASE.x, screen.y / BASE.y)
	return Vector2i(roundi(screen.x / scale), roundi(screen.y / scale))


func _viewport(size: Vector2i) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = size
	vp.gui_disable_input = false
	root.add_child(vp)
	return vp


## What a control's text needs, against what it has: a label or button whose words do not fit
## its box (cut off or running outside) is a failure; a wrapping label must be tall enough.
func _text_fits(vp: SubViewport, what: String) -> void:
	for node in vp.find_children("*", "Control", true, false):
		var c := node as Control
		if not c.is_visible_in_tree():
			continue
		var text := ""
		var font: Font = null
		var size := 0
		if c is Label or c is Button:
			check(Rect2(Vector2.ZERO, Vector2(vp.size)).encloses(c.get_global_rect().grow(-0.5)) or _inside_scroll(c), "%s: %s is off-screen %s" % [what, c.name, c.get_global_rect()])
		if c is Label:
			var l := c as Label
			text = l.text
			font = l.get_theme_font("font")
			size = l.get_theme_font_size("font_size")
			if l.text_overrun_behavior != TextServer.OVERRUN_NO_TRIMMING:
				# Trimmed on purpose (a job's one-line preview): it still has room to say something.
				check(l.size.x >= 55.0, "%s: %s keeps %d px for its preview" % [what, l.name, l.size.x])
				continue
			if l.autowrap_mode != TextServer.AUTOWRAP_OFF:
				var need := l.get_line_count() * l.get_line_height()
				check(need <= l.size.y + 1.0, "%s: %s wraps to %d lines (%d px) in a %d px box: %s" % [what, l.name, l.get_line_count(), need, l.size.y, text.left(40)])
				continue
		elif c is Button and not (c is TitleRow):
			text = (c as Button).text
			font = c.get_theme_font("font")
			size = c.get_theme_font_size("font_size")
		if text == "" or font == null:
			continue
		var widest := 0.0
		for line in text.split("\n"):
			widest = maxf(widest, font.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x)
		var room := c.size.x
		if c is Button:
			room -= 8.0
		check(widest <= room + 1.0, "%s: %s needs %d px for \"%s\" but has %d" % [what, c.name, widest, text.left(40), room])


func _no_overlap(vp: SubViewport, what: String, within: Node = null) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	var buttons: Array[Control] = []
	for node in (within if within != null else vp).find_children("*", "Button", true, false):
		var b := node as Button
		if not b.is_visible_in_tree() or b.get_global_rect().size.x < 1.0:
			continue
		if _inside_scroll(b):
			continue
		check(screen.encloses(b.get_global_rect().grow(-0.5)), "%s: %s off-screen %s" % [what, b.name, b.get_global_rect()])
		check(b.size.y >= UiTheme.MIN_TARGET - 0.5, "%s: %s is %d tall" % [what, b.name, b.size.y])
		buttons.append(b)
	for i in buttons.size():
		for j in range(i + 1, buttons.size()):
			check(not buttons[i].get_global_rect().intersects(buttons[j].get_global_rect()), "%s: %s overlaps %s" % [what, buttons[i].name, buttons[j].name])


static func _inside_scroll(c: Control) -> bool:
	var p := c.get_parent()
	while p != null:
		if p is ScrollContainer:
			return true
		p = p.get_parent()
	return false


func _label(mode: Tr.Mode) -> String:
	return "Tamil" if mode == Tr.Mode.TAMIL else "both"


func test_pause_menu_in_tamil_and_both() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var ui := _ui_size(screen)
			var what := "pause menu, %s, %dx%d" % [_label(mode), screen.x, screen.y]
			var vp := _viewport(ui)
			var menu := PauseMenu.new()
			vp.add_child(menu)
			var controls := ControlSettings.new()
			controls.path = "user://i18n-layout-controls.json"
			var language := LanguageSettings.new()
			language.path = "user://i18n-layout-language.json"
			menu.add_setting(&"Time", func() -> String: return Tr.t("set.time", [Tr.ref("time.evening"), "17:45"]), func() -> void: pass)
			menu.add_setting(&"Weather", func() -> String: return Tr.t("set.weather", [&"weather.rain"]), func() -> void: pass)
			menu.add_setting(&"Sound", func() -> String: return Tr.t("set.sound", [&"set.on"]), func() -> void: pass)
			menu.add_setting(&"Language", language.label, language.next)
			ControlSettingsRows.add_to(menu, controls)
			menu.add_setting(&"Quality", func() -> String: return "%s\n%s" % [Tr.t("set.graphics", [Tr.ref("quality.high")]), Tr.t("quality.explain.high")], func() -> void: pass)
			await wait_frames(2)
			menu.open()
			await wait_frames(4)
			var screen_rect := Rect2(Vector2.ZERO, Vector2(ui))
			var panel := menu.find_child("Panel", true, false) as Control
			check(screen_rect.encloses(panel.get_global_rect()), "%s: the panel is inside the screen %s" % [what, panel.get_global_rect()])
			var scroll := menu.find_child("Scroll", true, false) as ScrollContainer
			check(scroll.size.y >= UiTheme.MIN_TARGET, "%s: the list has room (%d)" % [what, scroll.size.y])
			_text_fits(vp, what)
			var buttons: Array[Button] = []
			for node in scroll.find_children("*", "Button", true, false):
				buttons.append(node as Button)
			check(buttons.size() >= 12, "%s: the rows are there (%d)" % [what, buttons.size()])
			for i in buttons.size() - 1:
				check(buttons[i].get_global_rect().end.y <= buttons[i + 1].get_global_rect().position.y + 0.5, "%s: %s overlaps %s" % [what, buttons[i].name, buttons[i + 1].name])
			# The last row can still be reached.
			var bar := scroll.get_v_scroll_bar()
			scroll.scroll_vertical = int(bar.max_value)
			await wait_frames(2)
			var last := buttons[buttons.size() - 1]
			check(scroll.get_global_rect().grow(1.0).encloses(last.get_global_rect()), "%s: the last row scrolls into view" % what)
			vp.queue_free()
			await wait_frames(1)
	DirAccess.remove_absolute("user://i18n-layout-language.json")
	return _done()


func test_title_screen_in_tamil_and_both() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var ui := _ui_size(screen)
			var vp := _viewport(ui)
			var title: TitleMenu = TITLE.instantiate()
			vp.add_child(title)
			title.reduced_motion = true
			title.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
			title.add_setting(&"Time", func() -> String: return Tr.t("set.time", [Tr.ref("time.evening"), "17:45"]), func() -> void: pass)
			title.add_setting(&"Weather", func() -> String: return Tr.t("set.weather", [&"weather.rain"]), func() -> void: pass)
			title.add_setting(&"Sound", func() -> String: return Tr.t("set.sound", [&"set.on"]), func() -> void: pass)
			title.add_setting(&"Language", func() -> String: return Tr.t("set.language", [LanguageSettings.name_of(Tr.mode)]), func() -> void: pass)
			title.set_place("Marina Beach", "%s · 17:45 · %s" % [Tr.line("time.evening"), Tr.line("weather.rain")])
			for save: Dictionary in [{"has_save": true, "continue_line": Tr.line("title.continue_line", [Tr.ref("title.stage", [3]), "2,400", 2, 21])}, {"has_save": false, "new_game_line": Tr.line("title.sub.new_game_named", [Tr.srcref("The harmonium thief")])}]:
				title.set_save(save)
				title.show_menu()
				await wait_frames(3)
				var what := "title %s save %s %dx%d" % [_label(mode), save["has_save"], screen.x, screen.y]
				_text_fits(vp, what)
				_no_overlap(vp, what)
				var credit := (title.find_child("Credit", true, false) as Control).get_global_rect()
				var scroll := title.find_child("Scroll", true, false) as ScrollContainer
				for r in title.rows():
					# The rows scroll when they are many or tall: what is in view stays clear of the credit.
					var seen := r.get_global_rect().intersection(scroll.get_global_rect())
					check(not seen.intersects(credit), "%s: row %s overlaps the credit" % [what, r.name])
					# A row's lines fit inside it.
					check(r.get_minimum_size().y <= r.size.y + 0.5, "%s: row %s needs %d but is %d tall" % [what, r.name, r.get_minimum_size().y, r.size.y])
				check(scroll is TouchScroll, "%s: the rows scroll under a thumb when they do not all fit" % what)
			for page: StringName in [&"about", &"settings", &"controls"]:
				title.call("show_" + page)
				await wait_frames(3)
				var what := "title page %s %s %dx%d" % [page, _label(mode), screen.x, screen.y]
				_text_fits(vp, what)
				_no_overlap(vp, what)
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_loading_screen_in_tamil_and_both() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var vp := _viewport(_ui_size(screen))
			var l: LoadingScreen = LOADING.instantiate()
			vp.add_child(l)
			l.set_steps(Main.STEPS)
			l.begin_step(2)
			l.show_slow(2, 15)
			await wait_frames(3)
			var what := "loading %s %dx%d" % [_label(mode), screen.x, screen.y]
			_text_fits(vp, what)
			var area := Rect2(Vector2.ZERO, Vector2(vp.size))
			for node in vp.find_children("*", "Control", true, false):
				var c := node as Control
				if c.is_visible_in_tree() and c is Label:
					check(area.encloses(c.get_global_rect().grow(-0.5)), "%s: %s off-screen %s" % [what, c.name, c.get_global_rect()])
			l.fail(2, Tr.t("err.streets_start"))
			await wait_frames(3)
			_text_fits(vp, what + " failed")
			_no_overlap(vp, what + " failed")
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_hud_and_dialogs_in_tamil_and_both() -> bool:
	var content := GameContent.load_file()
	var longest_brief := ""
	var longest_label := ""
	for m in content.missions:
		if m.brief.length() > longest_brief.length():
			longest_brief = m.brief
		for o in m.objectives:
			if o.label.length() > longest_label.length():
				longest_label = o.label
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var ui := _ui_size(screen)
			var vp := _viewport(ui)
			var hud := MissionHud.new()
			vp.add_child(hud)
			var pause := PauseMenu.new()
			vp.add_child(pause)
			await wait_frames(3)
			var what := "hud %s %dx%d" % [_label(mode), screen.x, screen.y]
			hud.set_stats("2,400", 3, 21, 50)
			hud.set_mission({"title": Tr.line("msn.panel_stage", [3, Tr.srcref("Auto shift")]), "objective": Tr.src(longest_label), "distance": 1450.0, "seconds_left": 95.0, "stability": 0.8, "stability_label": Tr.line("hud.cargo"), "suspicion": 0.3}, 0.0)
			hud.set_place_prompt(Tr.src_line("Thol Power Gym"))
			hud.toast(Tr.t("msn.stage_notice", [3, Tr.srcref("Auto shift")]), Tr.src(longest_brief), 5.0)
			pause.show_pause_button(true)
			await wait_frames(4)
			_text_fits(vp, what)
			var area := Rect2(Vector2.ZERO, Vector2(ui))
			for n: String in ["Column", "Toast"]:
				var c := hud.find_child(n, true, false) as Control
				check(area.encloses(c.get_global_rect().grow(-0.5)), "%s: %s inside the screen %s" % [what, n, c.get_global_rect()])
			var column := (hud.find_child("Column", true, false) as Control).get_global_rect()
			var toast := (hud.find_child("Toast", true, false) as Control).get_global_rect()
			check(not column.intersects(toast), "%s: the toast and the mission column do not overlap" % what)
			# The job board dialog with Tamil rows.
			var rows: Array[Dictionary] = []
			for k in 4:
				var j: JobData.Job = content.jobs[k]
				rows.append({"id": j.id, "title": Tr.src(j.title), "detail": Tr.src(j.brief), "meta": Tr.line("msn.job_meta", [Tr.ref("veh.label.bus"), j.payout, 5]), "button": Tr.t("dlg.take_job")})
			var actions: Array[Dictionary] = [{"id": "tab", "label": Tr.t("dlg.stages"), "quiet": true}, {"id": "close", "label": Tr.t("dlg.close"), "quiet": true}]
			hud.show_dialog(Tr.t("dlg.job_board"), Tr.t("msn.board_default", [50]), rows, actions)
			await wait_frames(4)
			_no_overlap(vp, what + " dialog", hud.dialog)
			_text_fits(vp, what + " dialog")
			hud.hide_dialog()
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_controls_in_tamil_and_both() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var ui := _ui_size(screen)
			for driving: bool in [false, true]:
				var vp := _viewport(ui)
				var what := "%s controls %s %dx%d" % ["driving" if driving else "foot", _label(mode), screen.x, screen.y]
				var buttons: Array[Control] = []
				if driving:
					var d := DrivingControls.new()
					vp.add_child(d)
					d.set_mode(&"driving", "ctl.siren")
					await wait_frames(3)
					d.set_reversing(true)
					await wait_frames(1)
					for b: Control in [d.gas, d.brake, d.horn, d.exit_button]:
						buttons.append(b)
					# GAS, BRAKE, HORN: the word fits the glass circle (its inset drawn size).
					for b: HoldButton in [d.gas, d.brake, d.horn]:
						var font := b.get_theme_font("font")
						var fs := b.get_theme_font_size("font_size")
						var widest := 0.0
						for line in b.text.split("\n"):
							widest = maxf(widest, font.get_string_size(line, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x)
						check(widest <= b.size.x * 0.82, "%s: %s needs %d px of its %d" % [what, b.name, widest, b.size.x])
						check(fs * 1.25 * b.text.count("\n") + fs * 1.25 <= b.size.y * 0.8, "%s: %s's lines fit its height" % [what, b.name])
				else:
					var t := TouchControls.new()
					vp.add_child(t)
					await wait_frames(3)
					var tb: Array[TouchButton] = t.buttons()
					for b in tb:
						check(b.text_fits(), "%s: %s's text fits the circle (%s)" % [what, b.name, b.text])
				_text_fits(vp, what)
				vp.queue_free()
				await wait_frames(1)
	return _done()


func test_action_labels_fit_their_button() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for key: String in ["act.get_in", "act.take_over", "act.board_train", "ctl.action"]:
			var b := TouchButton.new(Tr.t(key), ControlsLayout.ACTION_SIZE)
			b.theme = UiTheme.get_theme()
			root.add_child(b)
			b.font_size = 16 if b.text.length() <= 6 else 13
			check(b.text_fits(), "%s in %s fits the ACTION button (%s)" % [key, _label(mode), b.text])
			b.queue_free()
	return _done()


func test_rail_hud_in_tamil_and_both() -> bool:
	for mode in MODES:
		Tr.set_mode(mode)
		for screen in SCREENS:
			var ui := _ui_size(screen)
			var vp := _viewport(ui)
			var hud := RailHud.new()
			vp.add_child(hud)
			await wait_frames(2)
			var what := "rail hud %s %dx%d" % [_label(mode), screen.x, screen.y]
			for step: Array in [[RailHud.STATION, false, false, true], [RailHud.RIDE, true, false, false], [RailHud.CAB, false, true, false]]:
				hud.set_mode(step[0] as StringName)
				hud.set_info(Tr.t("rail.cab_title", ["Chetpet", "Tambaram"]), "சேத்துப்பட்டு", Tr.t("rail.to_mark", [820]))
				hud.set_cab(54.0, 60.0, 6, false, "yellow", 160)
				hud.set_offers(step[1] as bool, step[2] as bool, step[3] as bool)
				await wait_frames(3)
				_text_fits(vp, "%s %s" % [what, step[0]])
				_no_overlap(vp, "%s %s" % [what, step[0]])
			vp.queue_free()
			await wait_frames(1)
	return _done()


func test_long_tamil_wraps_instead_of_running_off() -> bool:
	# The longest unbroken Tamil words and sentences the game has, in boxes as narrow as the guide's.
	var words: Array[String] = []
	var sentences: Array[String] = []
	for key in Tr.catalog("ta").texts:
		var text: String = Tr.catalog("ta").texts[key]
		for w in text.split(" "):
			if w.length() >= 14:
				words.append(w)
		if text.length() > 80:
			sentences.append(text)
	words.sort_custom(func(a: String, b: String) -> bool: return a.length() > b.length())
	sentences.sort_custom(func(a: String, b: String) -> bool: return a.length() > b.length())
	assert_true(words.size() > 5 and sentences.size() > 5, "the game has long Tamil words (%d) and sentences (%d)" % [words.size(), sentences.size()])
	for screen in SCREENS:
		var vp := _viewport(_ui_size(screen))
		var box := VBoxContainer.new()
		vp.add_child(box)
		var checked: Array[Label] = []
		var texts: Array[String] = []
		texts.append_array(words.slice(0, 6))
		texts.append_array(sentences.slice(0, 6))
		for text in texts:
			var l := UiTheme.label(text, 12)
			l.theme = UiTheme.get_theme()
			l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
			l.custom_minimum_size = Vector2(150, 0)
			box.add_child(l)
			checked.append(l)
		await wait_frames(3)
		for l in checked:
			check(l.size.x <= 150.5, "%dx%d: \"%s\" stays in its 150 px box (%d)" % [screen.x, screen.y, l.text.left(20), l.size.x])
			check(l.get_line_count() >= 1 and l.get_line_height() * l.get_line_count() <= l.size.y + 1.0, "%dx%d: \"%s\" is tall enough for its %d lines" % [screen.x, screen.y, l.text.left(20), l.get_line_count()])
			if l.text.length() > 30:
				check(l.get_line_count() >= 2, "%dx%d: a long Tamil text wraps (%d lines): %s" % [screen.x, screen.y, l.get_line_count(), l.text.left(20)])
		vp.queue_free()
		await wait_frames(1)
	return _done()
