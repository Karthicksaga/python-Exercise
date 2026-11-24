extends TestCase
## The glass HUD (decision G-290) and the performance overlay switch (G-291): on the phone
## screens of `chennai-game-design` §3 (915x412, 1830x824 and a 2400x1080 20:9 phone, at the UI
## size each gives) every control is inside the screen, at least 48 UI units to the thumb, 8
## apart, and the HUD's top-right row (JOBS, PAUSE, EXIT) no longer stacks buttons on each
## other. The buttons are round or pill glass, smaller to the eye than their hit area, with
## no solid accent fill. The overlay is off by default and the gesture / pause row switch it.

const SCREENS: Array[Vector2i] = [Vector2i(915, 412), Vector2i(1830, 824), Vector2i(2400, 1080)]
const BASE := Vector2(915, 412)
const HUD := preload("res://src/ui/debug_hud/debug_hud.tscn")
const SAVE := "user://hud-glass-test.json"


func _ui_size(screen: Vector2i) -> Vector2i:
	var scale := minf(screen.x / BASE.x, screen.y / BASE.y)
	return Vector2i(roundi(screen.x / scale), roundi(screen.y / scale))


func _settings(overlay: bool) -> DebugSettings:
	var s := DebugSettings.new()
	s.path = SAVE
	s.perf_overlay = overlay
	return s


func _stage(ui: Vector2i, driving: bool, overlay: bool) -> Dictionary:
	var vp := SubViewport.new()
	vp.size = ui
	root.add_child(vp)
	var hud: DebugHud = HUD.instantiate()
	hud.settings = _settings(overlay)
	vp.add_child(hud)
	var missions := MissionHud.new()
	vp.add_child(missions)
	var pause := PauseMenu.new()
	vp.add_child(pause)
	var out := {"vp": vp, "hud": hud, "missions": missions, "pause": pause}
	if driving:
		var d := DrivingControls.new()
		vp.add_child(d)
		d.set_mode(&"driving")
		out["driving"] = d
	else:
		var t := TouchControls.new()
		vp.add_child(t)
		out["touch"] = t
	await wait_frames(3)
	missions.set_mission({"title": "STAGE 1 · MORNING WALK", "objective": "Walk to the marker", "distance": 51.0, "seconds_left": -1.0}, 0.0)
	missions.set_place_prompt("Gym")
	pause.show_pause_button(true)
	await wait_frames(3)
	return out


func _interactive(stage: Dictionary) -> Dictionary[String, Rect2]:
	var rects: Dictionary[String, Rect2] = {}
	var pause := stage["pause"] as PauseMenu
	rects["Pause"] = pause.pause_button.get_global_rect()
	var missions := stage["missions"] as MissionHud
	rects["Jobs"] = missions.jobs_button.get_global_rect()
	rects["Inside"] = missions.inside_button.get_global_rect()
	if stage.has("driving"):
		var d := stage["driving"] as DrivingControls
		for b: HoldButton in [d.gas, d.brake, d.horn, d.exit_button]:
			rects[b.name] = b.get_global_rect()
	else:
		for b in (stage["touch"] as TouchControls).buttons():
			rects[b.name] = b.get_global_rect()
	return rects


func test_buttons_fit_and_never_stack_on_every_screen() -> bool:
	for screen in SCREENS:
		var ui := _ui_size(screen)
		for driving: bool in [false, true]:
			var st := await _stage(ui, driving, true)
			var what := "%dx%d (UI %dx%d) %s" % [screen.x, screen.y, ui.x, ui.y, "driving" if driving else "on foot"]
			var area := Rect2(Vector2.ZERO, Vector2(ui))
			var rects := _interactive(st)
			var hud := st["hud"] as DebugHud
			var all := rects.duplicate()
			all["Overlay"] = (hud.find_child("Overlay", true, false) as Control).get_global_rect()
			all["Credit"] = (hud.find_child("Credit", true, false) as Control).get_global_rect()
			all["Column"] = ((st["missions"] as MissionHud).find_child("Column", true, false) as Control).get_global_rect()
			for n: String in all:
				check(area.encloses(all[n]), "%s: %s off-screen %s" % [what, n, all[n]])
			for n: String in rects:
				var r := rects[n]
				check(r.size.x >= UiTheme.MIN_TARGET and r.size.y >= UiTheme.MIN_TARGET, "%s: %s hit area %s under 48" % [what, n, r.size])
			var names := all.keys()
			for i in names.size():
				for j in range(i + 1, names.size()):
					var a: Rect2 = all[names[i]]
					var b: Rect2 = all[names[j]]
					check(not a.intersects(b), "%s: %s and %s overlap (%s, %s)" % [what, names[i], names[j], a, b])
			var top_row: Array[String] = ["Pause", "Jobs"]
			if driving:
				top_row.append("Exit")
			for i in top_row.size() - 1:
				var a: Rect2 = rects[top_row[i]]
				var b: Rect2 = rects[top_row[i + 1]]
				check(not a.grow(4.0).intersects(b.grow(4.0)), "%s: %s and %s closer than 8" % [what, top_row[i], top_row[i + 1]])
			(st["vp"] as SubViewport).queue_free()
			await wait_frames(1)
	return true


func test_buttons_are_glass_not_yellow_blocks() -> bool:
	var st := await _stage(Vector2i(915, 412), true, false)
	var d := st["driving"] as DrivingControls
	var pause := (st["pause"] as PauseMenu).pause_button
	for b: Button in [pause, d.gas, d.brake, d.horn, d.exit_button, (st["missions"] as MissionHud).jobs_button]:
		var box := b.get_theme_stylebox("normal") as StyleBoxFlat
		check(box != null and box.corner_radius_top_left >= 18, "%s is round or a pill" % b.name)
		check(box.bg_color.a <= 0.6, "%s: translucent fill (alpha %.2f)" % [b.name, box.bg_color.a])
		check(not _yellowish(box.bg_color), "%s: no yellow fill" % b.name)
		check(box.get_border_width(SIDE_LEFT) <= 1, "%s: thin outline" % b.name)
	check(pause.text == "", "PAUSE is an icon, not the word")
	check(pause.get_child_count() == 1 and pause.get_child(0) is UiTheme.IconOverlay, "PAUSE draws its icon")
	var inset := -(pause.get_theme_stylebox("normal") as StyleBoxFlat).expand_margin_left
	check(pause.size.x - inset * 2.0 <= 40.5, "PAUSE shows 40 across inside its 48 hit area (%s)" % (pause.size.x - inset * 2.0))
	check(pause.size.x >= 48.0, "PAUSE hit area is 48")
	# Pressed is the one place the accent fills a button (still translucent).
	var pressed := d.gas.get_theme_stylebox("pressed") as StyleBoxFlat
	check(_yellowish(pressed.bg_color) and pressed.bg_color.a < 0.8, "pressed: the translucent accent")
	(st["vp"] as SubViewport).queue_free()
	return true


func _yellowish(c: Color) -> bool:
	return c.r > 0.8 and c.g > 0.6 and c.b < 0.3


func test_touch_buttons_are_smaller_than_before_and_keep_their_hit_area() -> bool:
	check(ControlsLayout.ACTION_SIZE < 104.0, "ACTION is smaller than the old 104")
	check(ControlsLayout.GAS_SIZE.y < 124.0 and ControlsLayout.BRAKE_SIZE.x < 100.0, "GAS and BRAKE are smaller")
	var action := TouchButton.new("ACTION", ControlsLayout.ACTION_SIZE)
	root.add_child(action)
	action.place(Vector2(100, 100), ControlsLayout.ACTION_SIZE)
	var c := action.global_position + action.size * 0.5
	var edge := c + Vector2(ControlsLayout.ACTION_SIZE * 0.5 - 1.0, 0.0)
	check(action.hit(edge, 0.0), "a touch in the padding, outside the drawn circle, still hits")
	check(TouchButton.VISUAL < 0.9, "the drawn circle is inset in the hit area")
	action.free()
	return true


func test_overlay_is_off_by_default_and_shows_with_the_setting() -> bool:
	var st := await _stage(Vector2i(915, 412), false, false)
	var hud := st["hud"] as DebugHud
	assert_false(hud.overlay_visible(), "no FPS line during play")
	assert_false((hud.find_child("Fps", true, false) as Control).is_visible_in_tree(), "the label is not on screen")
	check((hud.find_child("Credit", true, false) as Control).is_visible_in_tree(), "the map credit stays")
	hud.settings.set_perf_overlay(true)
	await wait_frames(2)
	assert_true(hud.overlay_visible() and (hud.find_child("Fps", true, false) as Control).is_visible_in_tree(), "on with the setting")
	assert_contains(hud.text(), "FPS", "it shows FPS")
	hud.settings.set_perf_overlay(false)
	assert_false(hud.overlay_visible(), "and off again")
	(st["vp"] as SubViewport).queue_free()
	return true


func test_five_corner_taps_switch_the_overlay_and_slow_or_stray_taps_do_not() -> bool:
	var st := await _stage(Vector2i(915, 412), false, false)
	var hud := st["hud"] as DebugHud
	for i in 4:
		hud.corner_tap(Vector2(20, 20))
		await wait_game_seconds(0.2)
	assert_false(hud.overlay_visible(), "four taps are not enough")
	hud.corner_tap(Vector2(20, 20))
	assert_true(hud.overlay_visible(), "the fifth turns it on")
	for i in 5:
		await wait_game_seconds(0.2)
		hud.corner_tap(Vector2(20, 20))
	assert_false(hud.overlay_visible(), "five more turn it off")
	# Too slow: a pause longer than CornerTaps.GAP restarts the count.
	for i in 5:
		hud.corner_tap(Vector2(20, 20))
		await wait_game_seconds(CornerTaps.GAP + 0.3)
	assert_false(hud.overlay_visible(), "five slow taps do nothing")
	# A tap elsewhere in between restarts it too.
	for i in 2:
		hud.corner_tap(Vector2(20, 20))
	hud.corner_tap(Vector2(400, 200))
	for i in 3:
		hud.corner_tap(Vector2(20, 20))
	assert_false(hud.overlay_visible(), "a stray tap breaks the run")
	(st["vp"] as SubViewport).queue_free()
	return true


func test_corner_taps_reach_the_hud_through_the_touch_controls() -> bool:
	var st := await _stage(Vector2i(915, 412), false, false)
	var t := st["touch"] as TouchControls
	var vp := st["vp"] as SubViewport
	var corner := InputEventScreenTouch.new()
	corner.index = 0
	corner.pressed = true
	corner.position = Vector2(20, 20)
	t._input(corner)
	assert_false(vp.is_input_handled(), "a touch in the top-left corner is left for the overlay gesture")
	var stick := InputEventScreenTouch.new()
	stick.index = 1
	stick.pressed = true
	stick.position = Vector2(150, 300)
	t._input(stick)
	assert_true(vp.is_input_handled(), "a touch for the stick is still taken")
	(st["vp"] as SubViewport).queue_free()
	return true


func test_setting_is_saved_and_the_pause_menu_row_toggles_it() -> bool:
	DebugSettings.reset_shared()
	var shared := DebugSettings.shared()
	shared.path = SAVE
	shared.perf_overlay = false
	var menu := PauseMenu.new()
	root.add_child(menu)
	menu.add_setting(&"PerfOverlay", DebugSettings.label, DebugSettings.toggle)
	await wait_frames(2)
	var row := menu.setting_button(&"PerfOverlay")
	assert_eq(row.text, "Performance overlay: Off", "the row reads Off")
	row.pressed.emit()
	assert_eq(row.text, "Performance overlay: On", "pressing it turns it on")
	var again := DebugSettings.new()
	again.path = SAVE
	again.load_saved()
	assert_true(again.perf_overlay, "and it is saved")
	row.pressed.emit()
	assert_eq(row.text, "Performance overlay: Off", "pressing again turns it off")
	DebugSettings.reset_shared()
	menu.queue_free()
	return true


func test_corner_taps_pure() -> bool:
	var t := CornerTaps.new()
	var fired := false
	for i in CornerTaps.COUNT:
		fired = t.tap(Vector2(5, 5), float(i) * 0.3)
	assert_true(fired, "five quick taps fire")
	assert_false(t.tap(Vector2(5, 5), 3.0), "and start over")
	assert_false(CornerTaps.in_corner(Vector2(CornerTaps.CORNER + 1.0, 5.0)), "outside the corner")
	return true


func _click(vp: SubViewport, at: Vector2) -> void:
	for pressed: bool in [true, false]:
		var e := InputEventMouseButton.new()
		e.button_index = MOUSE_BUTTON_LEFT
		e.pressed = pressed
		e.position = at
		e.global_position = at
		e.button_mask = MOUSE_BUTTON_MASK_LEFT if pressed else 0
		vp.push_input(e)
		await wait_frames(1)


## The owner's bug: PAUSE and JOBS sat on the same rectangle and one did not work. Every button in
## the top-right row takes a real tap at its centre and reaches its own handler, on every screen.
func test_every_top_right_button_takes_its_tap() -> bool:
	for screen in SCREENS:
		var ui := _ui_size(screen)
		var st := await _stage(ui, true, true)
		var vp := st["vp"] as SubViewport
		vp.gui_disable_input = false
		var pause := st["pause"] as PauseMenu
		var missions := st["missions"] as MissionHud
		var d := st["driving"] as DrivingControls
		var got: Array[String] = []
		pause.pause_requested.connect(func() -> void: got.append("pause"))
		missions.jobs_pressed.connect(func() -> void: got.append("jobs"))
		d.exit_pressed.connect(func() -> void: got.append("exit"))
		var what := "%dx%d (UI %dx%d)" % [screen.x, screen.y, ui.x, ui.y]
		var rects := {"pause": pause.pause_button.get_global_rect(), "jobs": missions.jobs_button.get_global_rect(), "exit": d.exit_button.get_global_rect()}
		var keys := rects.keys()
		for i in keys.size():
			for j in range(i + 1, keys.size()):
				check(not (rects[keys[i]] as Rect2).intersects(rects[keys[j]] as Rect2), "%s: %s and %s do not intersect" % [what, keys[i], keys[j]])
		for key: String in keys:
			got.clear()
			await _click(vp, (rects[key] as Rect2).get_center())
			check(got == [key], "%s: a tap on %s reaches only its handler (got %s)" % [what, key, got])
			# Near the edge of the 48 hit area, outside the drawn circle, still counts.
			got.clear()
			await _click(vp, (rects[key] as Rect2).get_center() + Vector2(21.0, 0.0))
			check(got == [key], "%s: a tap in the padding of %s works (got %s)" % [what, key, got])
		vp.queue_free()
		await wait_frames(1)
	return true
