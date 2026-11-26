extends TestCase
## The control layouts of G-170…G-177 at the phone screens (915x412 and 1830x824, UI units of the
## 915x412 base, stretch canvas_items): every button at least 48 dp at every button size, nothing
## overlapping the thumbs' resting areas (the stick's ring on the stick's side, ACTION or GAS
## under the other thumb), everything on screen, and the left-handed layout the exact mirror of
## the right-handed one, in the pure `ControlsLayout` and in the real nodes.

const SCREENS: Array[Vector2i] = [Vector2i(915, 412), Vector2i(1830, 824)]
const BASE := Vector2(915, 412)
const SETTINGS_PATH := "user://test-controls-layout.json"


func _settings(left: bool, size: int) -> ControlSettings:
	var s := ControlSettings.new()
	s.path = SETTINGS_PATH
	s.left_handed = left
	s.button_size = size
	return s


func _ui(screen: Vector2i) -> Vector2:
	var scale := minf(screen.x / BASE.x, screen.y / BASE.y)
	return Vector2(roundi(screen.x / scale), roundi(screen.y / scale))


func test_pure_layouts_have_big_enough_clear_buttons_for_every_size_and_hand() -> bool:
	for screen in SCREENS:
		var ui := _ui(screen)
		var scale := minf(screen.x / BASE.x, screen.y / BASE.y)
		for left: bool in [false, true]:
			for size: int in [ControlSettings.SIZE_SMALL, ControlSettings.SIZE_MEDIUM, ControlSettings.SIZE_LARGE]:
				var s := _settings(left, size)
				var what := "%dx%d left=%s size=%d" % [screen.x, screen.y, left, size]
				for layout: Dictionary in [ControlsLayout.foot(ui, s), ControlsLayout.driving(ui, s)]:
					var area := Rect2(Vector2.ZERO, ui)
					for key: Variant in layout:
						check(area.encloses(layout[key] as Rect2), "%s: %s on screen %s" % [what, key, layout[key]])
					var buttons := ControlsLayout.buttons_of(layout)
					for key: Variant in buttons:
						var r: Rect2 = buttons[key]
						check(r.size.x >= 48.0 and r.size.y >= 48.0, "%s: %s is %s dp" % [what, key, r.size])
						check(minf(r.size.x, r.size.y) * scale >= 48.0, "%s: %s is %.0f px" % [what, key, minf(r.size.x, r.size.y) * scale])
					var keys := buttons.keys()
					for i in keys.size():
						for j in range(i + 1, keys.size()):
							check(not (buttons[keys[i]] as Rect2).grow(4.0).intersects((buttons[keys[j]] as Rect2).grow(4.0)), "%s: %s and %s 8 apart" % [what, keys[i], keys[j]])
				# The thumbs' resting areas stay clear: foot (stick ring; ACTION is the other thumb's).
				var foot := ControlsLayout.foot(ui, s)
				var rest: Rect2 = foot[&"stick"]
				for key: StringName in [&"action", &"jump", &"run"]:
					check(not rest.intersects(foot[key] as Rect2), "%s: %s clear of the stick's resting ring" % [what, key])
				# Driving: the steering zone holds only the steering; the pedals are on the other side.
				var drive := ControlsLayout.driving(ui, s)
				var zone: Rect2 = drive[&"steer_zone"]
				for key: StringName in [&"gas", &"brake", &"horn"]:
					check(not zone.intersects(drive[key] as Rect2), "%s: %s clear of the steering zone" % [what, key])
				# Which side: right-handed has ACTION and GAS on the right.
				var action_x := (foot[&"action"] as Rect2).get_center().x
				check((action_x > ui.x * 0.5) == (not left), "%s: ACTION on the %s" % [what, "left" if left else "right"])
				var steer_x := zone.get_center().x
				check((steer_x < ui.x * 0.5) == (not left), "%s: the steering zone on the %s" % [what, "right" if left else "left"])
	return true


func test_left_handed_is_the_exact_mirror() -> bool:
	for screen in SCREENS:
		var ui := _ui(screen)
		for size: int in [ControlSettings.SIZE_SMALL, ControlSettings.SIZE_MEDIUM, ControlSettings.SIZE_LARGE]:
			var right_foot := ControlsLayout.foot(ui, _settings(false, size))
			var left_foot := ControlsLayout.foot(ui, _settings(true, size))
			var right_drive := ControlsLayout.driving(ui, _settings(false, size))
			var left_drive := ControlsLayout.driving(ui, _settings(true, size))
			for pair: Array in [[right_foot, left_foot], [right_drive, left_drive]]:
				var r: Dictionary = pair[0]
				var l: Dictionary = pair[1]
				check(r.keys() == l.keys(), "same controls both ways")
				for key: Variant in r:
					var a: Rect2 = r[key]
					var b: Rect2 = l[key]
					if key == &"exit":
						# GET OUT stays in the top-right row with PAUSE and JOBS, which never mirror
						# (G-494): mirrored, it sat on the mission column.
						check(a == b and is_equal_approx(a.end.x, ui.x) and a.position.y == 0.0, "GET OUT stays top-right either way (%s vs %s)" % [a, b])
						continue
					check(is_equal_approx(b.position.x, ui.x - a.position.x - a.size.x) and is_equal_approx(b.position.y, a.position.y) and b.size == a.size, "%s mirrored exactly (%s vs %s)" % [key, a, b])
	return true


func _in_viewport(node: Node, ui: Vector2) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = Vector2i(ui)
	root.add_child(vp)
	vp.add_child(node)
	return vp


func test_real_foot_controls_match_the_layout_and_mirror_when_left_handed() -> bool:
	for screen in SCREENS:
		var ui := _ui(screen)
		var rights: Dictionary = {}
		for left: bool in [false, true]:
			var s := _settings(left, ControlSettings.SIZE_MEDIUM)
			var c := TouchControls.new()
			c.settings = s
			var vp := _in_viewport(c, ui)
			await wait_frames(3)
			var rects := {}
			for b in c.buttons():
				rects[b.name] = b.get_global_rect()
			rects["Stick"] = c.stick_rect()
			rects["MoveZone"] = c.zone(&"move_zone")
			if not left:
				rights = rects
				check(rects.has("Action") and rects.has("Jump") and not rects.has("Run"), "ACTION and JUMP, no RUN button")
				check((rects["Action"] as Rect2).size.x > (rects["Jump"] as Rect2).size.x, "ACTION is the biggest control on foot")
			else:
				for key: String in rights:
					var a: Rect2 = rights[key]
					var b: Rect2 = rects[key]
					check(is_equal_approx(b.position.x, ui.x - a.position.x - a.size.x) and is_equal_approx(b.position.y, a.position.y), "%dx%d: %s mirrored (%s vs %s)" % [screen.x, screen.y, key, a, b])
			vp.queue_free()
			await wait_frames(1)
	return true


func test_changing_a_setting_relays_the_controls_out_live() -> bool:
	var ui := _ui(SCREENS[0])
	var s := _settings(false, ControlSettings.SIZE_MEDIUM)
	var c := TouchControls.new()
	c.settings = s
	var d := DrivingControls.new()
	d.settings = s
	var vp := _in_viewport(c, ui)
	var vp2 := _in_viewport(d, ui)
	d.set_mode(&"driving")
	await wait_frames(3)
	var action_before := c.buttons()[0].get_global_rect()
	var gas_before := d.gas.get_global_rect()
	s.set_button_size(ControlSettings.SIZE_LARGE)
	s.set_left_handed(true)
	await wait_frames(2)
	var action_after := c.buttons()[0].get_global_rect()
	check(action_after.size.x > action_before.size.x and action_after.get_center().x < ui.x * 0.5, "ACTION grew and moved to the left")
	check(d.gas.get_global_rect().size.x > gas_before.size.x and d.gas.get_global_rect().get_center().x < ui.x * 0.5, "GAS grew and moved to the left")
	s.set_opacity(0.5)
	check(is_equal_approx(d.gas.modulate.a, 0.5), "opacity applied to the driving buttons")
	check(is_equal_approx((c.get_node("Root/Safe/Layer") as Control).modulate.a, 0.5), "and to the walking ones")
	s.set_run_toggle(true)
	await wait_frames(1)
	# ACTION, JUMP, HIT (on foot since G-414) and RUN.
	check(c.buttons().size() == 4 and c.buttons().any(func(b: TouchButton) -> bool: return b.name == "Run"), "RUN shows only in toggle-run mode")
	vp.queue_free()
	vp2.queue_free()
	return true


func test_the_pause_menu_rows_edit_the_settings_and_show_their_values() -> bool:
	var s := _settings(false, ControlSettings.SIZE_MEDIUM)
	var menu := PauseMenu.new()
	root.add_child(menu)
	ControlSettingsRows.add_to(menu, s)
	await wait_frames(2)
	for id: StringName in [&"LeftHanded", &"LookSpeed", &"InvertY", &"ButtonSize", &"ButtonOpacity", &"Haptics", &"RunMode"]:
		check(menu.setting_button(id) != null, "%s row exists" % id)
	assert_eq(menu.setting_button(&"LeftHanded").text, "Left-handed: Off", "starts off")
	menu.setting_button(&"LeftHanded").pressed.emit()
	assert_true(s.left_handed, "pressing turned it on")
	assert_eq(menu.setting_button(&"LeftHanded").text, "Left-handed: On", "and relabelled")
	menu.setting_button(&"LookSpeed").pressed.emit()
	assert_eq(menu.setting_button(&"LookSpeed").text, "Look speed: 1.5x", "1.0x to 1.5x")
	menu.setting_button(&"ButtonSize").pressed.emit()
	assert_eq(menu.setting_button(&"ButtonSize").text, "Buttons: Large", "medium to large")
	menu.setting_button(&"RunMode").pressed.emit()
	assert_true(s.run_toggle, "toggle run on")
	menu.setting_button(&"Haptics").pressed.emit()
	assert_false(s.haptics, "vibration off")
	menu.setting_button(&"InvertY").pressed.emit()
	assert_true(s.invert_y, "invert on")
	menu.setting_button(&"ButtonOpacity").pressed.emit()
	assert_eq(menu.setting_button(&"ButtonOpacity").text, "Button opacity: 100%", "85 to 100")
	var saved := ControlSettings.new()
	saved.path = SETTINGS_PATH
	saved.load_saved()
	assert_true(saved.left_handed and saved.run_toggle and saved.invert_y and not saved.haptics, "every press was saved")
	menu.queue_free()
	return true
