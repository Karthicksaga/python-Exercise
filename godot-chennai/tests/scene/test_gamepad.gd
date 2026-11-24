extends YardTest
## The gamepad through the same code as touch (G-178): synthetic InputEventJoypadMotion and
## InputEventJoypadButton events are parsed into the Input singleton; the walking rig and the
## driving reader turn them into moves, looks, jumps, ACTION, gas, brake, steering, horn and exit
## exactly as they do a touch. Time is game time.

const PAD := 0


func _axis(axis: JoyAxis, value: float) -> void:
	var e := InputEventJoypadMotion.new()
	e.device = PAD
	e.axis = axis
	e.axis_value = value
	Input.parse_input_event(e)
	Input.flush_buffered_events()


func _button(button: JoyButton, pressed: bool) -> void:
	var e := InputEventJoypadButton.new()
	e.device = PAD
	e.button_index = button
	e.pressed = pressed
	Input.parse_input_event(e)
	Input.flush_buffered_events()


func after_pad() -> void:
	for a: JoyAxis in [JOY_AXIS_LEFT_X, JOY_AXIS_LEFT_Y, JOY_AXIS_RIGHT_X, JOY_AXIS_RIGHT_Y, JOY_AXIS_TRIGGER_LEFT, JOY_AXIS_TRIGGER_RIGHT]:
		_axis(a, 0.0)


func test_actions_exist_with_pad_events_and_the_keyboard_kept() -> bool:
	for action: StringName in [&"player_forward", &"player_jump", &"player_action", &"drive_gas", &"drive_brake", &"drive_horn", &"drive_exit", &"pad_move_left", &"pad_look_right", &"pad_pause"]:
		assert_true(InputMap.has_action(action), "%s exists" % action)
	var kinds := {}
	for action: StringName in [&"player_action", &"player_jump", &"drive_gas", &"drive_brake", &"drive_horn", &"drive_exit", &"pad_pause"]:
		for e in InputMap.action_get_events(action):
			kinds[action] = kinds.get(action, "") + ("K" if e is InputEventKey else "B" if e is InputEventJoypadButton else "M" if e is InputEventJoypadMotion else "?")
	assert_true(String(kinds[&"player_action"]).contains("K") and String(kinds[&"player_action"]).contains("B"), "ACTION: key and A button")
	assert_true(String(kinds[&"drive_gas"]).contains("K") and String(kinds[&"drive_gas"]).contains("M"), "GAS: keys and RT")
	assert_true(String(kinds[&"drive_brake"]).contains("M"), "BRAKE: LT")
	assert_true(String(kinds[&"drive_horn"]).contains("B") and String(kinds[&"drive_exit"]).contains("B"), "horn Y and exit B")
	assert_false(InputMap.has_action(&"gear_park"), "no P/R/D actions")
	var has_a := false
	for e in InputMap.action_get_events(&"player_action"):
		if e is InputEventJoypadButton and (e as InputEventJoypadButton).button_index == JOY_BUTTON_A:
			has_a = true
	assert_true(has_a, "ACTION is the A button")
	return true


func test_left_stick_walks_and_runs_with_the_same_hysteresis_as_touch() -> bool:
	var rig := yard.rig
	await wait_physics_frames(30)
	var start := rig.body.global_position
	_axis(JOY_AXIS_LEFT_Y, -0.5)
	await wait_game_seconds(0.4)
	assert_false(rig.move_state.wants_run(), "half stick walks")
	_axis(JOY_AXIS_LEFT_Y, -0.9)
	await wait_game_seconds(0.4)
	assert_true(rig.move_state.wants_run(), "past 0.85 runs")
	_axis(JOY_AXIS_LEFT_Y, -0.75)
	await wait_game_seconds(0.2)
	assert_true(rig.move_state.wants_run(), "0.75 keeps running")
	_axis(JOY_AXIS_LEFT_Y, -0.65)
	await wait_game_seconds(0.2)
	assert_false(rig.move_state.wants_run(), "under 0.70 walks")
	_axis(JOY_AXIS_LEFT_Y, 0.0)
	await wait_game_seconds(0.3)
	assert_true(rig.body.global_position.distance_to(start) > 1.5, "the pad walked the player (%.1f m)" % rig.body.global_position.distance_to(start))
	assert_eq(rig.move_state.move, Vector2.ZERO, "released")
	after_pad()
	return true


func test_right_stick_looks_with_sensitivity_and_invert() -> bool:
	var rig := yard.rig
	var yaw := rig.camera.yaw
	var pitch := rig.camera.pitch
	_axis(JOY_AXIS_RIGHT_X, 1.0)
	await wait_game_seconds(0.5)
	_axis(JOY_AXIS_RIGHT_X, 0.0)
	await wait_game_seconds(0.3)
	var turned := yaw - rig.camera.yaw
	assert_true(turned > 0.7 and turned < 1.7, "right stick full for 0.5 s turned the camera right by %.2f rad" % turned)
	var s := ControlSettings.new()
	s.path = "user://test-controls-pad.json"
	rig.controls.settings = s
	s.look_sensitivity = 2.0
	var yaw2 := rig.camera.yaw
	_axis(JOY_AXIS_RIGHT_X, 1.0)
	await wait_game_seconds(0.5)
	_axis(JOY_AXIS_RIGHT_X, 0.0)
	await wait_game_seconds(0.3)
	var turned2 := yaw2 - rig.camera.yaw
	assert_true(turned2 > turned * 1.7 and turned2 < turned * 2.3, "2x sensitivity turns about twice as far (%.2f vs %.2f)" % [turned2, turned])
	var p0 := rig.camera.pitch
	_axis(JOY_AXIS_RIGHT_Y, 0.4)
	await wait_game_seconds(0.3)
	_axis(JOY_AXIS_RIGHT_Y, 0.0)
	await wait_game_seconds(0.2)
	var normal := rig.camera.pitch - p0
	s.invert_y = true
	p0 = rig.camera.pitch
	_axis(JOY_AXIS_RIGHT_Y, 0.4)
	await wait_game_seconds(0.3)
	_axis(JOY_AXIS_RIGHT_Y, 0.0)
	await wait_game_seconds(0.2)
	var inverted := rig.camera.pitch - p0
	assert_true(signf(normal) != signf(inverted) and absf(normal) > 0.01, "invert-Y flips the pitch direction (%.3f, %.3f)" % [normal, inverted])
	assert_true(pitch != rig.camera.pitch, "the pitch moved")
	rig.controls.settings = ControlSettings.shared()
	after_pad()
	return true


func test_a_button_runs_the_action_context_and_x_jumps() -> bool:
	var rig := yard.rig
	await wait_physics_frames(30)
	var log: Array[String] = []
	var src := rig.controls.action_context.add_source(func() -> Variant: return ActionCandidate.make("TALK", ActionContext.P_TALK, 1.0, func() -> void: log.append("talked")))
	_button(JOY_BUTTON_A, true)
	await wait_physics_frames(2)
	_button(JOY_BUTTON_A, false)
	assert_eq(log, ["talked"], "A pressed ACTION once")
	rig.controls.action_context.remove_source(src)
	assert_true(rig.body.is_on_floor(), "standing")
	var y0 := rig.body.global_position.y
	_button(JOY_BUTTON_X, true)
	await wait_physics_frames(1)
	_button(JOY_BUTTON_X, false)
	var rose := await wait_until(func() -> bool: return rig.body.global_position.y > y0 + 0.3, 40)
	assert_true(rose, "X jumped")
	after_pad()
	return true


func test_triggers_gas_and_brake_analogue_and_the_stick_steers() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	assert_true(await board(car), "boarded")
	var d := yard.driving
	_axis(JOY_AXIS_TRIGGER_RIGHT, 0.5)
	await wait_physics_frames(3)
	assert_true(d.gas and d.gas_amount > 0.2 and d.gas_amount < 0.8, "RT half pulled: gas at %.2f" % d.gas_amount)
	_axis(JOY_AXIS_TRIGGER_RIGHT, 1.0)
	await wait_game_seconds(2.0)
	assert_true(car.forward_speed() > 3.0, "RT drives (%.1f m/s)" % car.forward_speed())
	_axis(JOY_AXIS_LEFT_X, 0.8)
	await wait_physics_frames(3)
	assert_true(d.steer > 0.3 and d.steer < 0.95, "the stick steers right through the curve (%.2f)" % d.steer)
	_axis(JOY_AXIS_LEFT_X, -1.0)
	await wait_physics_frames(3)
	assert_true(d.steer < -0.5, "and left (%.2f)" % d.steer)
	_axis(JOY_AXIS_LEFT_X, 0.0)
	_axis(JOY_AXIS_TRIGGER_RIGHT, 0.0)
	_axis(JOY_AXIS_TRIGGER_LEFT, 1.0)
	await wait_physics_frames(3)
	assert_true(d.brake and d.brake_amount > 0.9, "LT brakes")
	var stopped := await wait_until(func() -> bool: return absf(car.forward_speed()) < 0.5, 60 * 8)
	assert_true(stopped, "stopped under LT")
	_axis(JOY_AXIS_TRIGGER_LEFT, 0.0)
	var horns: Array[int] = []
	d.horn.connect(func(_v: Vehicle) -> void: horns.append(1))
	_button(JOY_BUTTON_Y, true)
	await wait_physics_frames(2)
	_button(JOY_BUTTON_Y, false)
	assert_eq(horns.size(), 1, "Y is the horn")
	_button(JOY_BUTTON_B, true)
	await wait_physics_frames(2)
	_button(JOY_BUTTON_B, false)
	var out := await wait_until(func() -> bool: return d.mode() == &"foot" and d.boarding == null, 60 * 8)
	assert_true(out, "B gets out when stopped")
	after_pad()
	return true


func test_lt_held_when_stopped_reverses_and_releasing_stops() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	assert_true(await board(car), "boarded")
	var d := yard.driving
	d.reverse_on_hold = true
	var start := car.global_position
	_axis(JOY_AXIS_TRIGGER_LEFT, 1.0)
	await wait_game_seconds(0.25)
	assert_eq(d.gear_label(), "D", "not yet at 0.25 s")
	await wait_game_seconds(1.6)
	assert_eq(d.gear_label(), "R", "after the hold the gear reads R")
	assert_true(YardTest.along(car, start, 0.0) < -1.0, "and the car went back %.1f m" % YardTest.along(car, start, 0.0))
	_axis(JOY_AXIS_TRIGGER_LEFT, 0.0)
	await wait_game_seconds(0.2)
	assert_eq(d.gear_label().left(1), "D", "releasing LT is drive again")
	after_pad()
	return true


func test_start_pause_action_is_registered() -> bool:
	var found := false
	for e in InputMap.action_get_events(&"pad_pause"):
		if e is InputEventJoypadButton and (e as InputEventJoypadButton).button_index == JOY_BUTTON_START:
			found = true
	assert_true(found, "Start is pad_pause")
	return true
