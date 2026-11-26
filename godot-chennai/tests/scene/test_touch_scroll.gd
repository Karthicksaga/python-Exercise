extends TestCase
## Real touch scrolling (G-350): events go into the viewport as `InputEventScreenTouch` and
## `InputEventScreenDrag` (and as mouse events, and as both at once like a phone), not as scroll
## values. The list follows the finger one-to-one, a tap still presses the row under it, a flick
## continues and stops, the ends bounce, the bar is wide and drags, and the last row is reachable.
## `TouchScroll.step(1/60)` is the clock, so nothing here depends on the wall clock.

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(938, 412), Vector2i(915, 458), Vector2i(2460, 1080)]
const TITLE := preload("res://src/ui/title_menu/title_menu.tscn")
const DT := 1.0 / 60.0

var _taps: Dictionary = {}


func _rows(host: Object) -> void:
	for id: String in ["Time", "Weather", "Sound", "Quality", "PerfOverlay", "Looks", "Speed", "Invert", "Size", "Opacity"]:
		var key := id
		host.call(&"add_setting", StringName(id), func() -> String: return "%s: %s" % [key, _taps.get(key, 0)], func() -> void: _taps[key] = int(_taps.get(key, 0)) + 1)


func _viewport(size: Vector2i) -> SubViewport:
	var vp := SubViewport.new()
	vp.size = size
	vp.gui_disable_input = false
	root.add_child(vp)
	return vp


func _pause(vp: SubViewport) -> PauseMenu:
	var menu := PauseMenu.new()
	vp.add_child(menu)
	_rows(menu)
	await wait_frames(2)
	menu.open()
	await wait_frames(4)
	return menu


func _touch(vp: Viewport, at: Vector2, down: bool, index: int = 0) -> void:
	var e := InputEventScreenTouch.new()
	e.index = index
	e.position = at
	e.pressed = down
	vp.push_input(e)


func _drag_to(vp: Viewport, from: Vector2, to: Vector2, index: int = 0) -> void:
	var e := InputEventScreenDrag.new()
	e.index = index
	e.position = to
	e.relative = to - from
	vp.push_input(e)


## A finger down at `from`, moving `step` px per frame (with a TouchScroll step between), then up.
func _swipe(vp: Viewport, sc: TouchScroll, from: Vector2, step: Vector2, frames: int, release: bool = true, hold: int = 0) -> Vector2:
	_touch(vp, from, true)
	var p := from
	for i in frames:
		var q := p + step
		_drag_to(vp, p, q)
		p = q
		sc.step(DT)
	for i in hold:
		sc.step(DT)  # the finger rests before it lifts: no flick
	if release:
		_touch(vp, p, false)
	return p


func _centre(c: Control) -> Vector2:
	return c.get_global_rect().get_center()


func test_a_finger_drag_scrolls_the_list_one_to_one() -> bool:
	for size in SIZES:
		var vp := _viewport(size)
		var menu := await _pause(vp)
		var sc := menu.find_child("Scroll", true, false) as TouchScroll
		check(sc != null, "%s: the pause list is a TouchScroll" % size)
		var from := _centre(sc)
		if sc.max_scroll() <= 0.0:
			var all := menu.find_child("QuitToTitle", true, false) as Control
			check(sc.get_global_rect().encloses(all.get_global_rect()), "%s: everything fits, nothing to scroll" % size)
			vp.queue_free()
			await wait_frames(1)
			continue
		sc.scroll_vertical = 0
		sc.step(DT)
		# Slow drag (finger up 90 px over 18 frames): the list moves 90.
		_swipe(vp, sc, from, Vector2(0, -5), 18, true, 8)
		check(absf(float(sc.scroll_vertical) - 90.0) <= 2.0, "%s: 90 px of finger moved the list %s" % [size, sc.scroll_vertical])
		check(_taps.is_empty(), "%s: a drag does not press the row it started on %s" % [size, _taps])
		# Let go slowly (paused finger): no flick.
		var at := sc.scroll_vertical
		for i in 30:
			sc.step(DT)
		check(sc.scroll_vertical == at, "%s: a held-then-released drag does not coast" % size)
		# And back down.
		_swipe(vp, sc, from, Vector2(0, 4), 10, true, 8)
		check(absf(float(sc.scroll_vertical) - float(at - 40)) <= 2.0, "%s: dragging down moves it back (%s from %s)" % [size, sc.scroll_vertical, at])
		vp.queue_free()
		await wait_frames(1)
	return true


func test_a_tap_presses_the_row_under_the_finger() -> bool:
	for size in SIZES:
		_taps.clear()
		var vp := _viewport(size)
		var menu := await _pause(vp)
		var sc := menu.find_child("Scroll", true, false) as TouchScroll
		var target := menu.setting_button(&"Weather")
		var other := menu.setting_button(&"Sound")
		check(sc.get_global_rect().encloses(target.get_global_rect()), "%s: the row to tap is in view" % size)
		var at := _centre(target)
		_touch(vp, at, true)
		sc.step(DT)
		_touch(vp, at + Vector2(3, 2), false)  # 3 px of wobble is still a tap
		await wait_frames(1)
		check(int(_taps.get("Weather", 0)) == 1, "%s: the tap pressed Weather once %s" % [size, _taps])
		check(not _taps.has("Sound") and not _taps.has("Time"), "%s: and no other row %s" % [size, _taps])
		check(other.text.begins_with("Sound"), "%s: the neighbour is untouched" % size)
		vp.queue_free()
		await wait_frames(1)
	return true


func test_a_flick_continues_and_stops() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var menu := await _pause(vp)
	var sc := menu.find_child("Scroll", true, false) as TouchScroll
	var from := _centre(sc)
	var end := _swipe(vp, sc, from, Vector2(0, -2), 8, true, 8)  # slow, paused: no flick
	var slow := sc.scroll_vertical
	for i in 60:
		sc.step(DT)
	check(sc.scroll_vertical <= slow + 40, "a slow drag does not fling far (%s to %s)" % [slow, sc.scroll_vertical])
	sc.scroll_vertical = 0
	sc.step(DT)
	_swipe(vp, sc, from, Vector2(0, -8), 5)  # 480 px/s at release
	var at_release := sc.scroll_vertical
	check(at_release >= 38, "the drag moved the list (%s)" % at_release)
	for i in 20:
		sc.step(DT)
	var later := sc.scroll_vertical
	check(later > at_release + 20 or later >= int(sc.max_scroll()), "a flick keeps going after the finger left (%s -> %s)" % [at_release, later])
	for i in 400:
		sc.step(DT)
	var settled := sc.scroll_vertical
	for i in 30:
		sc.step(DT)
	check(sc.scroll_vertical == settled and not sc.is_interacting(), "and comes to rest (%s)" % settled)
	# A touch during a flick stops it.
	sc.scroll_vertical = 0
	sc.step(DT)
	_swipe(vp, sc, from, Vector2(0, -10), 5)
	sc.step(DT)
	var held := sc.scroll_vertical
	_touch(vp, from, true)
	for i in 10:
		sc.step(DT)
	check(sc.scroll_vertical == held, "a finger laid on a moving list stops it")
	_touch(vp, from, false)
	end = end
	vp.queue_free()
	return true


func test_the_ends_bounce_and_settle() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var menu := await _pause(vp)
	var sc := menu.find_child("Scroll", true, false) as TouchScroll
	var list := menu.find_child("List", true, false) as Control
	var from := _centre(sc)
	sc.scroll_vertical = 0
	sc.step(DT)
	var base_y := list.position.y
	# Pull down at the top: the list follows part of the way and shows a gap.
	_swipe(vp, sc, from, Vector2(0, 6), 10, false)
	check(sc.scroll_vertical == 0, "the top is the top")
	check(list.position.y > base_y + 5.0, "pulled past the top the list moves down (%s vs %s)" % [list.position.y, base_y])
	check(list.position.y < base_y + 60.0, "but only part of the way")
	_touch(vp, from + Vector2(0, 60), false)
	for i in 120:
		sc.step(DT)
		await wait_frames(1)
	check(absf(list.position.y - base_y) < 1.5, "it springs back (%s vs %s)" % [list.position.y, base_y])
	check(not sc.is_interacting(), "and rests")
	vp.queue_free()
	return true


func test_the_scrollbar_is_wide_and_drags() -> bool:
	for size in SIZES:
		var vp := _viewport(size)
		var menu := await _pause(vp)
		var sc := menu.find_child("Scroll", true, false) as TouchScroll
		var bar := sc.get_v_scroll_bar()
		if sc.max_scroll() <= 0.0:
			vp.queue_free()
			await wait_frames(1)
			continue
		check(bar.visible and bar.get_combined_minimum_size().x >= 14.0, "%s: the bar is at least 14 wide (%s)" % [size, bar.get_combined_minimum_size().x])
		var top := bar.get_global_rect()
		var x := top.get_center().x
		_touch(vp, Vector2(x, top.position.y + 20.0), true)
		_drag_to(vp, Vector2(x, top.position.y + 20.0), Vector2(x, top.end.y - 2.0))
		_touch(vp, Vector2(x, top.end.y - 2.0), false)
		check(sc.scroll_vertical >= int(sc.max_scroll()) - 1, "%s: dragging the bar to the bottom reaches the end (%s of %s)" % [size, sc.scroll_vertical, sc.max_scroll()])
		var last := menu.find_child("QuitToTitle", true, false) as Button
		await wait_frames(2)
		check(sc.get_global_rect().grow(1.0).encloses(last.get_global_rect()), "%s: the last row is reachable %s in %s" % [size, last.get_global_rect(), sc.get_global_rect()])
		check(vp.get_visible_rect().encloses(last.get_global_rect()), "%s: and on the screen" % size)
		_touch(vp, Vector2(x, top.end.y - 2.0), true)
		_drag_to(vp, Vector2(x, top.end.y - 2.0), Vector2(x, top.position.y - 40.0))
		_touch(vp, Vector2(x, top.position.y - 40.0), false)
		check(sc.scroll_vertical == 0, "%s: and back to the top" % size)
		vp.queue_free()
		await wait_frames(1)
	return true


func test_a_phone_sends_touch_and_emulated_mouse_and_the_list_moves_once() -> bool:
	var vp := _viewport(Vector2i(915, 412))
	var menu := await _pause(vp)
	var sc := menu.find_child("Scroll", true, false) as TouchScroll
	var from := _centre(sc)
	sc.scroll_vertical = 0
	sc.step(DT)
	# Touch first, then the same move as an emulated mouse event.
	_touch(vp, from, true)
	var m := InputEventMouseButton.new()
	m.button_index = MOUSE_BUTTON_LEFT
	m.pressed = true
	m.position = from
	vp.push_input(m)
	var p := from
	for i in 10:
		var q := p + Vector2(0, -5)
		_drag_to(vp, p, q)
		var mm := InputEventMouseMotion.new()
		mm.position = q
		mm.relative = q - p
		mm.button_mask = MOUSE_BUTTON_MASK_LEFT
		vp.push_input(mm)
		p = q
		sc.step(DT)
	_touch(vp, p, false)
	m = InputEventMouseButton.new()
	m.button_index = MOUSE_BUTTON_LEFT
	m.position = p
	vp.push_input(m)
	check(absf(float(sc.scroll_vertical) - 50.0) <= 2.0, "touch plus emulated mouse moved it 50, not 100 (%s)" % sc.scroll_vertical)
	check(_taps.is_empty(), "and pressed nothing %s" % _taps)
	for i in 600:
		sc.step(DT)
	# A real mouse drag (desktop) alone.
	sc.scroll_vertical = 0
	sc.step(DT)
	m = InputEventMouseButton.new()
	m.button_index = MOUSE_BUTTON_LEFT
	m.pressed = true
	m.position = from
	vp.push_input(m)
	p = from
	for i in 8:
		var q := p + Vector2(0, -5)
		var mm := InputEventMouseMotion.new()
		mm.position = q
		mm.relative = q - p
		mm.button_mask = MOUSE_BUTTON_MASK_LEFT
		vp.push_input(mm)
		p = q
		sc.step(DT)
	m = InputEventMouseButton.new()
	m.button_index = MOUSE_BUTTON_LEFT
	m.position = p
	vp.push_input(m)
	check(absf(float(sc.scroll_vertical) - 40.0) <= 2.0, "a mouse drag moves it too (%s)" % sc.scroll_vertical)
	# Another finger elsewhere does not disturb a drag.
	vp.queue_free()
	return true


func test_every_scrolling_menu_is_a_touch_scroll_that_reaches_its_last_row() -> bool:
	for size in SIZES:
		var vp := _viewport(size)
		var title: TitleMenu = TITLE.instantiate()
		vp.add_child(title)
		title.reduced_motion = true
		_rows(title)
		for page: String in ["settings", "controls"]:
			if page == "settings":
				title.show_settings()
			else:
				title.show_controls()
			await wait_frames(4)
			var scrolls: Array[TouchScroll] = []
			for n: Node in title.find_children("Scroll", "ScrollContainer", true, false):
				if (n as Control).is_visible_in_tree():
					check(n is TouchScroll, "%s %s: the visible scroll is a TouchScroll" % [size, page])
					scrolls.append(n as TouchScroll)
			check(not scrolls.is_empty(), "%s %s: there is a visible list" % [size, page])
			for sc in scrolls:
				check(Rect2(Vector2.ZERO, Vector2(size)).encloses(sc.get_global_rect()), "%s %s: inside the screen %s" % [size, page, sc.get_global_rect()])
				sc.scroll_vertical = int(sc.max_scroll())
				await wait_frames(2)
				var content := sc.get_child(0) as Control
				for c: Node in sc.get_children():
					if c is Control and not (c is ScrollBar):
						content = c as Control
				check(content.get_global_rect().end.y <= sc.get_global_rect().end.y + 2.0, "%s %s: at the end the last row is in view" % [size, page])
				if sc.max_scroll() > 0.0:
					sc.scroll_vertical = 0
					sc.step(DT)
					_swipe(vp, sc, sc.get_global_rect().get_center(), Vector2(0, -6), 8)
					check(sc.scroll_vertical >= 40, "%s %s: a finger drag scrolls it (%s)" % [size, page, sc.scroll_vertical])
		vp.queue_free()
		await wait_frames(1)
	return true


func test_menus_sit_above_the_performance_overlay() -> bool:
	var pause := PauseMenu.new()
	var title: TitleMenu = TITLE.instantiate()
	var overlay := PerfOverlay.new()
	var map := FullMap.new()
	root.add_child(title)
	await wait_frames(1)
	check(pause.layer > overlay.layer, "the pause menu draws above the performance overlay (%s > %s)" % [pause.layer, overlay.layer])
	check(title.layer > overlay.layer, "and so does the title (%s > %s)" % [title.layer, overlay.layer])
	check(map.layer > pause.layer, "the full map sits above the pause menu (%s > %s)" % [map.layer, pause.layer])
	pause.free()
	overlay.free()
	map.free()
	return true


func test_tap_on_scaled_viewport_hits_row() -> bool:
	_taps.clear()
	var vp := _viewport(Vector2i(1830, 824))
	vp.size_2d_override = Vector2i(915, 412)
	vp.size_2d_override_stretch = true
	var menu := await _pause(vp)
	var sc := menu.find_child("Scroll", true, false) as TouchScroll
	check(sc.max_scroll() > 0.0, "scaled pause menu scrolls")
	var target := menu.setting_button(&"Weather")
	var win_pt := vp.get_screen_transform() * _centre(target)
	for down: bool in [true, false]:
		var b := InputEventMouseButton.new()
		b.button_index = MOUSE_BUTTON_LEFT
		b.pressed = down
		b.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
		b.position = win_pt
		b.global_position = win_pt
		vp.push_input(b)
	await wait_frames(2)
	check(int(_taps.get("Weather", 0)) == 1, "scaled viewport mouse tap hits row (%s)" % _taps)
	vp.queue_free()
	return true
