extends YardTest
## The walking touch controls end to end (G-170…G-173, G-176): the ACTION button's label follows
## what is near and it does nothing when nothing is; pressing it near a car gets in (and the old
## separate GET IN control is gone); the stick takes the stick's side, the other side looks, and
## left-handed swaps them; run is the stick's edge with hysteresis; JUMP is buffered.

func _touch(index: int, at: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = index
	e.position = tree.root.get_final_transform() * at
	e.pressed = pressed
	tree.root.push_input(e)


func _drag(index: int, at: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = index
	e.position = tree.root.get_final_transform() * at
	tree.root.push_input(e)


func test_action_button_follows_what_is_near_and_gets_in() -> bool:
	var rig := yard.rig
	var c := rig.controls
	var ab := c.action_button()
	await wait_frames(3)
	assert_eq(ab.text, "ACTION", "nothing near: the plain label")
	assert_true(ab.dim, "and dimmed")
	assert_false(c.press_action(), "pressing it with nothing near does nothing")
	var car := await spawn(&"hatchback", Vector3(30, 0, 0))
	yard.rider.place(car.ground_point(car.type.entry.point + Vector2(float(car.type.entry.side) * 0.6, 0.0)), 0.0)
	await wait_frames(4)
	assert_eq(ab.text, "GET IN", "beside a car: GET IN")
	assert_false(ab.dim, "bright")
	assert_true(c.press_action(), "pressed")
	var seated := await wait_until(func() -> bool: return yard.driving.mode() == &"driving", 60 * 8)
	assert_true(seated, "ACTION boarded the car")
	assert_false(c.visible and ab.is_visible_in_tree() and false, "(walking controls are hidden while driving by the wiring)")
	return true


func test_a_touch_on_the_action_button_presses_it() -> bool:
	var rig := yard.rig
	var c := rig.controls
	await wait_frames(3)
	var log: Array[String] = []
	c.action_context.add_source(func() -> Variant: return ActionCandidate.make("TALK", ActionContext.P_TALK, 1.0, func() -> void: log.append("talk")))
	await wait_frames(3)
	var ab := c.action_button()
	assert_eq(ab.text, "TALK", "label from the context")
	_touch(5, ab.get_global_rect().get_center(), true)
	_touch(5, ab.get_global_rect().get_center(), false)
	assert_eq(log, ["talk"], "a touch on the big button runs it")
	# G-290: smaller on purpose (hit area 88, was 104; the drawn circle is 70), still the biggest.
	assert_true(ab.get_global_rect().size.x >= 88.0, "it keeps an 88 hit area")
	for other in c.buttons():
		if other != ab:
			assert_true(ab.get_global_rect().size.x > other.get_global_rect().size.x, "it is bigger than %s" % other.name)
	return true


func test_the_stick_and_look_sides_and_left_handed_swaps_them() -> bool:
	var rig := yard.rig
	var c := rig.controls
	await wait_frames(3)
	var size := tree.root.get_visible_rect().size
	var left_at := Vector2(size.x * 0.2, size.y * 0.6)
	var right_at := Vector2(size.x * 0.7, size.y * 0.3)
	_touch(1, left_at, true)
	_drag(1, left_at + Vector2(0, -56))
	assert_true(c.move.y > 0.95, "a touch on the left takes the stick (%s)" % c.move)
	_touch(1, left_at, false)
	var s := ControlSettings.new()
	s.path = "user://test-controls-foot.json"
	c.settings = s
	s.set_left_handed(true)
	await wait_frames(2)
	_touch(2, left_at, true)
	_drag(2, left_at + Vector2(-60, 0))
	assert_eq(c.move, Vector2.ZERO, "left-handed: the left side is no longer the stick")
	assert_true(c.consume_look().x < -50.0, "it looks instead")
	_touch(2, left_at, false)
	_touch(3, right_at, true)
	_drag(3, right_at + Vector2(0, -56))
	assert_true(c.move.y > 0.95, "left-handed: the right side takes the stick")
	_touch(3, right_at, false)
	c.settings = ControlSettings.shared()
	return true


func test_stick_edge_runs_and_the_body_follows_the_hysteresis() -> bool:
	var rig := yard.rig
	var c := rig.controls
	await wait_frames(3)
	var size := tree.root.get_visible_rect().size
	var at := Vector2(size.x * 0.2, size.y * 0.6)
	_touch(1, at, true)
	_drag(1, at + Vector2(0, -50))
	await wait_game_seconds(1.5)
	assert_true(rig.move_state.wants_run(), "50 of 56 units is past 0.85: running")
	assert_true(rig.body.speed > 4.5, "and the body runs (%.1f m/s)" % rig.body.speed)
	_drag(1, at + Vector2(0, -42))
	await wait_game_seconds(0.3)
	assert_true(rig.move_state.wants_run(), "42 units (0.75): still running")
	_drag(1, at + Vector2(0, -36))
	await wait_game_seconds(1.0)
	assert_false(rig.move_state.wants_run(), "36 units (0.64): walking")
	assert_true(rig.body.speed < 3.0, "the body walks (%.1f m/s)" % rig.body.speed)
	_touch(1, at, false)
	return true


func test_touch_look_uses_sensitivity_and_buffered_jump_lands_a_jump() -> bool:
	var rig := yard.rig
	var c := rig.controls
	await wait_physics_frames(30)
	var size := tree.root.get_visible_rect().size
	var at := Vector2(size.x * 0.75, size.y * 0.3)
	var yaw0 := rig.camera.yaw
	_touch(4, at, true)
	for k in range(1, 11):
		_drag(4, at + Vector2(-20.0 * k, 0))
		await wait_physics_frames(1)
	_touch(4, at + Vector2(-200, 0), false)
	await wait_game_seconds(0.4)
	var one := rig.camera.yaw - yaw0
	var s := ControlSettings.new()
	s.path = "user://test-controls-foot.json"
	s.look_sensitivity = 0.5
	c.settings = s
	var yaw1 := rig.camera.yaw
	_touch(4, at, true)
	for k in range(1, 11):
		_drag(4, at + Vector2(-20.0 * k, 0))
		await wait_physics_frames(1)
	_touch(4, at + Vector2(-200, 0), false)
	await wait_game_seconds(0.4)
	var half := rig.camera.yaw - yaw1
	assert_near(half / one, 0.5, 0.05, "0.5x sensitivity turns half as far (%.2f vs %.2f)" % [half, one])
	assert_near(one, 200.0 * FollowCamera.SENSITIVITY, 0.03, "1x: 200 units is exactly what the camera always turned (%.3f)" % one)
	c.settings = ControlSettings.shared()
	# Jump pressed in the air just before landing still jumps on landing.
	rig.body.global_position.y += 0.6
	rig.body.velocity.y = 0.0
	await wait_physics_frames(3)
	assert_false(rig.body.is_on_floor(), "in the air")
	# About 0.07 s above the ground (v = -3.6 m/s of a 0.22 s fall): inside the 100 ms buffer.
	var fell := await wait_until(func() -> bool: return rig.body.velocity.y < -3.6, 30)
	assert_true(fell, "falling")
	rig.body.press_jump()
	var jumped_up := await wait_until(func() -> bool: return rig.body.velocity.y > 3.0, 20)
	assert_true(jumped_up, "a press just before landing jumped on landing")
	return true
