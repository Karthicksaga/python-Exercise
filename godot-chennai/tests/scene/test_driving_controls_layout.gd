extends TestCase
## The touch driving controls at every UI size phones give (chennai-game-design §3, G-78): all
## inside the screen, buttons at least 48 x 48 and 8 apart, nothing overlapping, steering under
## the left thumb, GAS and BRAKE under the right; GET IN alone on foot.

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]


func _controls(size: Vector2i) -> DrivingControls:
	var vp := SubViewport.new()
	vp.size = size
	root.add_child(vp)
	var c := DrivingControls.new()
	vp.add_child(c)
	return c


func _visible_rects(c: DrivingControls) -> Dictionary:
	var out := {}
	for n: Control in [c.steer_pad, c.gas, c.brake, c.horn, c.exit_button, c.get_in, c.readout, c.gears["P"], c.gears["R"], c.gears["D"]]:
		if n.is_visible_in_tree():
			out[n.name] = n.get_global_rect()
	return out


func test_driving_set_fits_every_size() -> bool:
	for size in SIZES:
		var c := _controls(size)
		c.set_mode(&"driving")
		await wait_frames(3)
		var screen := Rect2(Vector2.ZERO, Vector2(size))
		var rects := _visible_rects(c)
		check(rects.size() == 9, "%s: the driving set shows (%s)" % [size, rects.keys()])
		var names: Array = rects.keys()
		for i in names.size():
			var a: Rect2 = rects[names[i]]
			check(screen.encloses(a), "%s: %s inside the screen %s" % [size, names[i], a])
			if names[i] not in [&"Readout", &"Steer"]:
				check(a.size.x >= UiTheme.MIN_TARGET and a.size.y >= UiTheme.MIN_TARGET, "%s: %s at least 48x48 (%s)" % [size, names[i], a.size])
			for j in range(i + 1, names.size()):
				var b: Rect2 = rects[names[j]]
				check(not a.grow(4.0).intersects(b.grow(4.0)), "%s: %s and %s at least 8 apart" % [size, names[i], names[j]])
		var half := Vector2(size) / 2.0
		var steer: Rect2 = rects[&"Steer"]
		check(steer.get_center().x < half.x and steer.get_center().y > half.y, "%s: steering bottom-left" % size)
		for n: StringName in [&"Gas", &"Brake"]:
			var r: Rect2 = rects[n]
			check(r.get_center().x > half.x and r.get_center().y > half.y, "%s: %s bottom-right" % [size, n])
		check((rects[&"Gas"] as Rect2).get_area() >= (rects[&"Brake"] as Rect2).get_area(), "GAS is the biggest pedal")
		c.get_parent().queue_free()
		await wait_frames(1)
	return true


func test_on_foot_and_busy_modes() -> bool:
	var c := _controls(SIZES[0])
	c.set_mode(&"foot")
	await wait_frames(2)
	check(_visible_rects(c).is_empty(), "on foot and away from vehicles: nothing (GET IN only when near)")
	c.set_get_in(true)
	await wait_frames(1)
	var rect := c.get_in.get_global_rect()
	check(Rect2(Vector2.ZERO, Vector2(SIZES[0])).encloses(rect), "GET IN inside the screen")
	check(rect.size.y >= UiTheme.MIN_TARGET, "GET IN is a thumb-sized target")
	c.set_mode(&"boarding")
	await wait_frames(1)
	check(_visible_rects(c).is_empty(), "nothing while getting in or out")
	c.set_mode(&"thrown")
	check(_visible_rects(c).is_empty(), "nothing while thrown")
	c.get_parent().queue_free()
	return true


func test_touch_holds_gas_while_another_finger_steers() -> bool:
	var c := _controls(SIZES[0])
	c.set_mode(&"driving")
	await wait_frames(2)
	var down := InputEventScreenTouch.new()
	down.index = 0
	down.pressed = true
	c.gas._gui_input(down)
	var steer := InputEventScreenTouch.new()
	steer.index = 1
	steer.pressed = true
	steer.position = c.steer_pad.size / 2.0
	c.steer_pad._gui_input(steer)
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = c.steer_pad.size / 2.0 + Vector2(c.steer_pad.reach, 0)
	c.steer_pad._gui_input(drag)
	assert_true(c.gas_held(), "GAS held by finger 0")
	assert_near(c.steer_value(), 1.0, 0.001, "finger 1 steers full right")
	var lift := InputEventScreenTouch.new()
	lift.index = 1
	lift.pressed = false
	c.steer_pad._gui_input(lift)
	assert_eq(c.steer_value(), 0.0, "lifting the thumb centres the steering")
	assert_true(c.gas_held(), "GAS still held")
	down.pressed = false
	c.gas._gui_input(down)
	assert_false(c.gas_held(), "released")
	var small := InputEventScreenDrag.new()
	small.index = 1
	steer.position = Vector2(100, 60)
	c.steer_pad._gui_input(steer)
	small.position = Vector2(103, 60)
	c.steer_pad._gui_input(small)
	assert_eq(c.steer_value(), 0.0, "a small wobble is inside the deadzone")
	c.get_parent().queue_free()
	return true
