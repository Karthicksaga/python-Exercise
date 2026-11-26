extends TestCase
## The settings lists scroll (G-293): every row of the pause menu and of the title's SETTINGS page
## (time, weather, sound, the controls rows, graphics, performance overlay) is reachable at the
## phone sizes, the last one by scrolling, with a visible bar and drag scrolling under a thumb.

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458)]
const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")


func _rows(host: Object, s: ControlSettings, d: DebugSettings) -> void:
	host.call(&"add_setting", &"Time", func() -> String: return "Time: Evening (17:45)", func() -> void: pass)
	host.call(&"add_setting", &"Weather", func() -> String: return "Weather: Clear", func() -> void: pass)
	host.call(&"add_setting", &"Sound", func() -> String: return "Sound: On", func() -> void: pass)
	if host is PauseMenu:
		ControlSettingsRows.add_to(host as PauseMenu, s)
	host.call(&"add_setting", &"Quality", func() -> String: return "Graphics: High (auto)", func() -> void: pass)
	host.call(&"add_setting", &"PerfOverlay", func() -> String: return "Performance overlay: %s" % ("On" if d.perf_overlay else "Off"), func() -> void: d.toggle_perf_overlay())


func _settings() -> Array:
	var s := ControlSettings.new()
	s.path = "user://settings-scroll-controls.json"
	var d := DebugSettings.new()
	d.path = "user://settings-scroll-debug.json"
	return [s, d]


func test_pause_menu_settings_scroll_to_the_last_row() -> bool:
	for size in SIZES:
		var vp := SubViewport.new()
		vp.size = size
		vp.gui_disable_input = false
		root.add_child(vp)
		var st := _settings()
		var menu := PauseMenu.new()
		vp.add_child(menu)
		_rows(menu, st[0] as ControlSettings, st[1] as DebugSettings)
		await wait_frames(2)
		menu.open()
		await wait_frames(4)
		var screen := Rect2(Vector2.ZERO, Vector2(size))
		var sc := menu.find_child("Scroll", true, false) as ScrollContainer
		check(screen.encloses(sc.get_global_rect()), "%s: the list is inside the screen %s" % [size, sc.get_global_rect()])
		var bar := sc.get_v_scroll_bar()
		check(bar.visible and bar.get_combined_minimum_size().x >= 8.0, "%s: a visible scrollbar (%s wide)" % [size, bar.get_combined_minimum_size().x])
		var last := menu.find_child("QuitToTitle", true, false) as Button
		check(not sc.get_global_rect().encloses(last.get_global_rect()), "%s: the last row starts out of view" % size)
		# Real touch drags are tested in test_touch_scroll.gd (G-350).
		check(sc is TouchScroll and sc.follow_focus, "%s: the list is a TouchScroll, focus scrolls into view" % size)
		sc.scroll_vertical = int(bar.max_value)
		await wait_frames(2)
		check(sc.get_global_rect().grow(1.0).encloses(last.get_global_rect()), "%s: scrolled to the end, QUIT TO TITLE is in view %s in %s" % [size, last.get_global_rect(), sc.get_global_rect()])
		check(vp.get_visible_rect().encloses(last.get_global_rect()), "%s: and on the screen" % size)
		var perf := menu.setting_button(&"PerfOverlay")
		var quality := menu.setting_button(&"Quality")
		check(perf != null and quality != null, "%s: the graphics and overlay rows are in the list" % size)
		vp.queue_free()
		await wait_frames(1)
	return true


func test_title_settings_scroll_to_the_last_row() -> bool:
	for size in SIZES:
		var vp := SubViewport.new()
		vp.size = size
		vp.gui_disable_input = false
		root.add_child(vp)
		var st := _settings()
		var title: TitleMenu = TITLE.instantiate()
		vp.add_child(title)
		title.reduced_motion = true
		_rows(title, st[0] as ControlSettings, st[1] as DebugSettings)
		title.show_settings()
		await wait_frames(4)
		var page := title.find_child("List", true, false) as Control
		var sc := page.get_parent() as ScrollContainer
		var screen := Rect2(Vector2.ZERO, Vector2(size))
		check(screen.encloses(sc.get_global_rect()), "%s: the SETTINGS list is inside the screen %s" % [size, sc.get_global_rect()])
		var bar := sc.get_v_scroll_bar()
		var last := title.setting_button(&"PerfOverlay")
		check(bar.get_combined_minimum_size().x >= 8.0, "%s: a thick scrollbar" % size)
		sc.scroll_vertical = int(bar.max_value)
		await wait_frames(2)
		check(sc.get_global_rect().grow(1.0).encloses(last.get_global_rect()), "%s: scrolled to the end, the last row is in view %s in %s" % [size, last.get_global_rect(), sc.get_global_rect()])
		check(sc is TouchScroll, "%s: the list is a TouchScroll" % size)
		vp.queue_free()
		await wait_frames(1)
	return true
