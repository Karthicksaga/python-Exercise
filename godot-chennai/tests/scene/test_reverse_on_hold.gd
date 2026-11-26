extends YardTest
## Reverse by holding BRAKE on a real vehicle (G-175): only after it has stopped and BRAKE has been
## held 0.4 s; BRAKE from speed brakes (no reversing while moving); releasing stops reversing; GAS
## goes forwards again; the gear is a readout (no P/R/D selector). Game time throughout.


func test_holding_brake_when_stopped_reverses_after_0_4_s_and_release_stops() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	assert_true(await board(car), "boarded")
	var d := yard.driving
	d.reverse_on_hold = true
	var start := car.global_position
	d.brake = true
	await wait_game_seconds(0.3)
	assert_true(absf(along(car, start, 0.0)) < 0.2, "not moving at 0.3 s")
	assert_eq(d.gear_label(), "D", "still D")
	await wait_game_seconds(1.5)
	assert_eq(d.gear_label(), "R", "R after the hold")
	assert_true(d.reverse_hold.reversing, "reversing")
	var back := along(car, start, 0.0)
	assert_true(back < -1.5, "reversed %.1f m" % back)
	assert_true(car.forward_speed() < -0.5, "moving backwards at %.1f m/s" % car.forward_speed())
	var at_release := car.forward_speed()
	d.brake = false
	await wait_game_seconds(0.1)
	assert_false(d.reverse_hold.reversing, "released: not reversing")
	assert_eq(d.gear_label().left(1), "D", "back in D")
	assert_false(d.gas, "no gas was needed")
	await wait_game_seconds(3.0)
	assert_true(absf(car.forward_speed()) < absf(at_release) - 0.3, "no more throttle: it coasts down from %.1f to %.1f m/s" % [at_release, car.forward_speed()])
	return true


func test_braking_from_speed_does_not_reverse_and_gas_ends_a_reverse() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	assert_true(await board(car), "boarded")
	var d := yard.driving
	d.reverse_on_hold = true
	d.gas = true
	await wait_game_seconds(2.5)
	d.gas = false
	d.brake = true
	var reversed_while_moving := false
	for i in 60 * 4:
		await wait_physics_frames(1)
		if d.reverse_hold.reversing and car.forward_speed() > 0.5:
			reversed_while_moving = true
	assert_false(reversed_while_moving, "never reverses while still rolling forward")
	d.brake = true
	await wait_game_seconds(1.2)
	assert_true(d.reverse_hold.reversing and car.forward_speed() < -0.3, "stopped and held: reverses (%.1f m/s)" % car.forward_speed())
	d.gas = true
	await wait_game_seconds(0.2)
	assert_false(d.reverse_hold.reversing, "GAS while holding BRAKE ends the reverse")
	d.brake = false
	await wait_game_seconds(3.0)
	assert_true(car.forward_speed() > 1.0, "and drives forwards (%.1f m/s)" % car.forward_speed())
	d.gas = false
	return true


func test_without_the_option_brake_still_just_brakes() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	assert_true(await board(car), "boarded")
	var d := yard.driving
	assert_false(d.reverse_on_hold, "off unless the game turns it on")
	var start := car.global_position
	d.brake = true
	await wait_game_seconds(2.0)
	assert_true(absf(along(car, start, 0.0)) < 0.3, "the car stayed put")
	d.brake = false
	return true
