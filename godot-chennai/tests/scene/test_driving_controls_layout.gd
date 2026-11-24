extends TestCase
## The touch driving controls (scheme A, wheel) at every UI size phones give (chennai-game-design
## §3, G-78, G-174): all inside the screen, buttons at least 48 x 48 and 8 apart, nothing
## overlapping, the steering zone on the left, GAS and BRAKE under the right thumb. After G-174:
## no steering slider, no P / R / D chips, no GET IN (that is the ACTION button on foot).

const SIZES: Array[Vector2i] = [Vector2i(915, 412), Vector2i(915, 458), Vector2i(1098, 412), Vector2i(915, 686)]


func _controls(size: Vector2i, settings: ControlSettings = null) -> DrivingControls:
	var vp := SubViewport.new()
	vp.size = size
	root.add_child(vp)
	var c := DrivingControls.new()
	if settings != null:
		c.settings = settings
	vp.add_child(c)
	return c


func _visible_rects(c: DrivingControls) -> Dictionary:
	var out := {}
	for n: Control in [c.gas, c.brake, c.horn, c.exit_button, c.readout]:
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
		check(rects.size() == 5, "%s: the driving set shows (%s)" % [size, rects.keys()])
		var names: Array = rects.keys()
		for i in names.size():
			var a: Rect2 = rects[names[i]]
			check(screen.encloses(a), "%s: %s inside the screen %s" % [size, names[i], a])
			if names[i] != &"Readout":
				check(a.size.x >= UiTheme.MIN_TARGET and a.size.y >= UiTheme.MIN_TARGET, "%s: %s at least 48x48 (%s)" % [size, names[i], a.size])
			for j in range(i + 1, names.size()):
				var b: Rect2 = rects[names[j]]
				check(not a.grow(4.0).intersects(b.grow(4.0)), "%s: %s and %s at least 8 apart" % [size, names[i], names[j]])
		var half := Vector2(size) / 2.0
		var zone := c.steer_pad.get_global_rect()
		check(zone.get_center().x < half.x and zone.size.x >= size.x * 0.45, "%s: the steering zone is the left side %s" % [size, zone])
		for n: StringName in [&"Gas", &"Brake"]:
			var r: Rect2 = rects[n]
			check(r.get_center().x > half.x and r.get_center().y > half.y, "%s: %s bottom-right" % [size, n])
			check(not zone.intersects(r), "%s: %s clear of the steering zone" % [size, n])
		check((rects[&"Gas"] as Rect2).get_area() >= (rects[&"Brake"] as Rect2).get_area(), "GAS is the biggest pedal")
		check(c.find_child("Gear*", true, false) == null, "no P/R/D chips")
		check(c.find_child("GetIn", true, false) == null, "no GET IN here (it is the ACTION button)")
		c.get_parent().queue_free()
		await wait_frames(1)
	return true


func test_on_foot_and_busy_modes() -> bool:
	var c := _controls(SIZES[0])
	c.set_mode(&"foot")
	await wait_frames(2)
	check(_visible_rects(c).is_empty() and not c.steer_pad.visible, "on foot: nothing of the driving set")
	c.set_mode(&"boarding")
	await wait_frames(1)
	check(_visible_rects(c).is_empty(), "nothing while getting in or out")
	c.set_mode(&"thrown")
	check(_visible_rects(c).is_empty(), "nothing while thrown")
	c.get_parent().queue_free()
	return true


func test_touch_holds_gas_while_another_finger_slides_to_steer() -> bool:
	var c := _controls(SIZES[0])
	c.set_mode(&"driving")
	await wait_frames(2)
	var down := InputEventScreenTouch.new()
	down.index = 0
	down.pressed = true
	c.gas._gui_input(down)
	# The thumb lands anywhere on the left: 300 px in, 200 down. No need to find a centre.
	var land := InputEventScreenTouch.new()
	land.index = 1
	land.pressed = true
	land.position = Vector2(300, 200)
	c.steer_pad._gui_input(land)
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = Vector2(300.0 + SteerState.FULL_LOCK, 200)
	c.steer_pad._gui_input(drag)
	assert_true(c.gas_held(), "GAS held by finger 0")
	await wait_game_seconds(0.6)
	assert_near(c.steer_value(), 1.0, 0.02, "finger 1 slid 70 units: full lock right")
	drag.position = Vector2(300.0 - SteerState.FULL_LOCK * 0.5, 200)
	c.steer_pad._gui_input(drag)
	await wait_game_seconds(0.6)
	assert_near(c.steer_value(), -0.5, 0.02, "slid 35 left of where it landed: half lock left")
	var lift := InputEventScreenTouch.new()
	lift.index = 1
	lift.pressed = false
	c.steer_pad._gui_input(lift)
	await wait_game_seconds(1.5)
	assert_eq(c.steer_value(), 0.0, "lifting the thumb centres the steering")
	assert_true(c.gas_held(), "GAS still held")
	down.pressed = false
	c.gas._gui_input(down)
	assert_false(c.gas_held(), "released")
	land.position = Vector2(100, 60)
	c.steer_pad._gui_input(land)
	drag.position = Vector2(102, 60)
	c.steer_pad._gui_input(drag)
	await wait_game_seconds(0.4)
	assert_eq(c.steer_value(), 0.0, "a 2-unit wobble is inside the dead zone")
	c.get_parent().queue_free()
	return true


func test_brake_says_hold_to_reverse_and_shows_reverse() -> bool:
	var c := _controls(SIZES[0])
	c.set_mode(&"driving")
	await wait_frames(2)
	assert_true(c.brake_hint.visible and c.brake_hint.text == "hold to reverse", "BRAKE carries the reverse hint")
	c.set_reversing(true)
	assert_eq(c.brake.text, "REVERSE", "BRAKE reads REVERSE while reversing")
	c.set_reversing(false)
	assert_eq(c.brake.text, "BRAKE", "and BRAKE again after")
	c.set_mode(&"driving", "SIREN")
	assert_eq(c.horn.text, "SIREN", "HORN is SIREN on an ambulance")
	c.get_parent().queue_free()
	return true
