extends TestCase
## Every screen at the UI sizes phones give it (chennai-game-design §3). With stretch mode
## canvas_items and aspect expand on a 915x412 base, 915x412 and 1830x824 screens give the UI
## 915x412; a 640x320 screen gives 915x458; a 20:9 phone about 915x412; a 4:3 tablet 915x686.
## Checks: every visible control inside the screen, buttons at least 48 tall, no two buttons
## overlapping, something focused on every menu page.

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]
const LOADING := preload("res://src/ui/loading_screen/loading_screen.tscn")
const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")
const HUD := preload("res://src/ui/debug_hud/debug_hud.tscn")


func _check(vp: SubViewport, what: String, need_focus: bool) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	var buttons: Array[Control] = []
	for node in vp.find_children("*", "Control", true, false):
		var c := node as Control
		if not c.is_visible_in_tree():
			continue
		var rect := c.get_global_rect()
		check(screen.encloses(rect), "%s at %s: %s off-screen %s" % [what, vp.size, c.name, rect])
		if c is Button:
			check(rect.size.y >= UiTheme.MIN_TARGET, "%s at %s: %s is %d tall" % [what, vp.size, c.name, rect.size.y])
			buttons.append(c)
	for i in buttons.size():
		for j in range(i + 1, buttons.size()):
			check(not buttons[i].get_global_rect().intersects(buttons[j].get_global_rect()), "%s at %s: %s overlaps %s" % [what, vp.size, buttons[i].name, buttons[j].name])
	if need_focus:
		check(vp.gui_get_focus_owner() != null, "%s at %s: nothing focused" % [what, vp.size])


## The title's rows are reachable: inside the screen, none under the credit or the chip, and no
## scrolling needed at these sizes (the first row to the last fit).
func _check_rows_inside(vp: SubViewport, title: TitleMenu, what: String) -> void:
	var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
	var credit := (title.find_child("Credit", true, false) as Control).get_global_rect()
	for r in title.rows():
		var rect := r.get_global_rect()
		check(screen.encloses(rect), "%s at %s: row %s off-screen %s" % [what, vp.size, r.name, rect])
		check(not rect.intersects(credit), "%s at %s: row %s overlaps the map credit" % [what, vp.size, r.name])
	var scroll := title.find_child("Scroll", true, false) as ScrollContainer
	var content := (scroll.get_child(0) as Control).get_combined_minimum_size().y
	check(content <= scroll.size.y + 0.5, "%s at %s: the rows need scrolling (%d > %d)" % [what, vp.size, content, scroll.size.y])


func _viewport(size: Vector2i) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = size
	vp.gui_disable_input = false
	root.add_child(vp)
	return vp


func test_screens_fit_every_size() -> bool:
	for size in SIZES:
		var vp := _viewport(size)
		var loading: LoadingScreen = LOADING.instantiate()
		vp.add_child(loading)
		loading.set_steps(Main.STEPS)
		loading.begin_step(0)
		await wait_frames(2)
		_check(vp, "loading", false)
		loading.finish_step(0)
		loading.begin_step(1)
		loading.show_slow(1, 15)
		await wait_frames(2)
		_check(vp, "loading, slow", false)
		loading.fail(0, "index.json not found. A longer message that has to wrap onto a second line on a small phone held in landscape.")
		await wait_frames(2)
		_check(vp, "loading failed", true)
		loading.queue_free()
		var title: TitleMenu = TITLE.instantiate()
		vp.add_child(title)
		title.reduced_motion = true
		title.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
		title.add_setting(&"Time", func() -> String: return "Time: Evening (17:45)", func() -> void: pass)
		title.add_setting(&"Weather", func() -> String: return "Weather: Clear", func() -> void: pass)
		title.add_setting(&"Sound", func() -> String: return "Sound: On", func() -> void: pass)
		title.set_place("Marina Beach", "Evening · 17:45 · Clear")
		for save: Dictionary in [{"has_save": true, "continue_line": "Stage 3 · ₹2,400 · 2 of 21 stages"}, {"has_save": false}]:
			title.set_save(save)
			title.show_menu()
			await wait_frames(2)
			_check(vp, "title (save %s)" % save["has_save"], true)
			_check_rows_inside(vp, title, "title")
		for page: StringName in [&"about", &"settings", &"controls"]:
			title.call("show_" + page)
			await wait_frames(2)
			_check(vp, str(page), true)
		title.queue_free()
		var hud: DebugHud = HUD.instantiate()
		# Checked with the performance overlay on: that is its widest state (off, it is hidden).
		hud.settings = DebugSettings.new()
		hud.settings.path = "user://layout-test-debug.json"
		hud.settings.perf_overlay = true
		vp.add_child(hud)
		hud.set_world_text("20,625 roads · 1,897 chunks")
		await wait_frames(2)
		_check(vp, "hud", false)
		vp.queue_free()
		await wait_frames(1)
	return true


## The pause menu's panel grows with its widest row (the perf summary and the graphics row are long),
## and on an ultra-wide phone (2460 x 1080 is 938 x 412 UI units) its corner met the map credit
## (owner's screenshot, G-455). The credit is not drawn while the menu is open; the menu carries its
## own credit line inside the panel, so the attribution stays on screen and nothing overlaps.
const PAUSE_SIZES: Array[Vector2i] = [Vector2i(938, 412), Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]


func _pause_menu(vp: SubViewport) -> PauseMenu:
	var menu := PauseMenu.new()
	vp.add_child(menu)
	var rows := {
		&"Time": "Time: Evening (17:45)", &"Weather": "Weather: Clear", &"Sound": "Sound: On",
		&"Quality": "Graphics: Auto (High)\nfull resolution, long shadows, full traffic", &"PerfOverlay": "Performance overlay: Off",
		&"MotionBlur": "Motion blur: Off", &"MinimapMode": "Minimap: turns with you",
		&"PerfSummary": "Perf: 29 fps · worst 71 ms · GPU-bound · High (tap: copy log)",
	}
	for id: StringName in rows:
		var text: String = rows[id]
		menu.add_setting(id, func() -> String: return text, func() -> void: pass)
	ControlSettingsRows.add_to(menu, ControlSettings.new())
	return menu


func test_pause_menu_and_the_map_credit_never_overlap() -> bool:
	for size in PAUSE_SIZES:
		var vp := _viewport(size)
		var hud: DebugHud = HUD.instantiate()
		hud.settings = DebugSettings.new()
		hud.settings.path = "user://layout-test-debug.json"
		vp.add_child(hud)
		var menu := _pause_menu(vp)
		menu.set_credit("© OpenStreetMap contributors")
		await wait_frames(2)
		var credit := hud.find_child("Credit", true, false) as Control
		check(credit.is_visible_in_tree(), "%s: the credit shows while playing" % size)
		menu.open()
		hud.set_credit_shown(false)
		await wait_frames(3)
		check(not credit.is_visible_in_tree(), "%s: the HUD credit is hidden while paused" % size)
		var panel := menu.find_child("Panel", true, false) as Control
		var own := menu.find_child("Credit", true, false) as Control
		check(own != null and own.is_visible_in_tree() and own.get_global_rect().size.y > 0.0, "%s: the menu shows its own credit line" % size)
		var screen := Rect2(Vector2.ZERO, Vector2(vp.size))
		check(screen.encloses(panel.get_global_rect().grow(-0.5)), "%s: the pause panel is on screen %s" % [size, panel.get_global_rect()])
		check(panel.get_global_rect().encloses(own.get_global_rect().grow(-0.5)), "%s: the menu's credit sits inside its panel" % size)
		# What shows of a row is what is inside the list's window (the rest scrolls, clipped).
		var scrolls := menu.find_children("*", "TouchScroll", true, false)
		var window: Control = scrolls[0] as Control if not scrolls.is_empty() else null
		for b in menu.find_children("*", "Button", true, false):
			var btn := b as Button
			if btn.is_visible_in_tree():
				var shown := btn.get_global_rect().intersection(window.get_global_rect()) if window != null else btn.get_global_rect()
				check(shown.size.x <= 0.0 or shown.size.y <= 0.0 or not shown.intersects(own.get_global_rect()), "%s: %s does not cover the credit line" % [size, btn.name])
		menu.close()
		hud.set_credit_shown(true)
		await wait_frames(2)
		check(credit.is_visible_in_tree(), "%s: back after resuming" % size)
		vp.queue_free()
		await wait_frames(1)
	return true
