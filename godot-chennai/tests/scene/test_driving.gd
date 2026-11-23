extends YardTest
## Driving, the gear selector and getting in and out (G-74, G-77): the behaviours of the
## Three.js driving.spec.ts and boarding.spec.ts, in game time.


func test_get_in_the_car_walk_open_sit_shut() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	var start := car.global_position
	yard.rider.place(car.ground_point(Vector2(2.0, 0.0)), 0.0)
	await wait_physics_frames(1)
	assert_true(yard.driving.nearest_vehicle() == car, "the car is offered")
	assert_true(yard.driving.enter(car), "getting in starts")
	assert_eq(yard.driving.mode(), &"boarding", "neither on foot nor driving part way")
	var phases: Array[StringName] = []
	var max_door := 0.0
	var driving_with_door_open := false
	for i in 60 * 6:
		if yard.driving.boarding != null and not phases.has(yard.driving.boarding.phase()):
			phases.append(yard.driving.boarding.phase())
		max_door = maxf(max_door, car.door())
		if car.door() > 0.8 and yard.driving.mode() == &"driving":
			driving_with_door_open = true
		if yard.driving.mode() == &"driving" and yard.driving.boarding == null:
			break
		await wait_physics_frames(1)
	assert_eq(yard.driving.mode(), &"driving", "seated and driving at the end")
	assert_true(phases.find(&"open") >= 0 and phases.find(&"open") < phases.find(&"sit") and phases.find(&"sit") < phases.find(&"close"), "open, sit, close in order: %s" % [phases])
	assert_true(max_door > 0.8, "the door opened wide")
	assert_false(driving_with_door_open, "not driving while the door is wide open")
	assert_eq(car.door(), 0.0, "door shut at the end")
	assert_true(car.global_position.distance_to(start) < 0.15, "the car did not move while the driver got in")
	assert_eq(yard.driving.gear_label(), "D", "getting in selects D")
	assert_true(yard.controls.gas.is_visible_in_tree(), "the driving controls show")
	return true


func test_drive_brake_exit_refused_while_moving_then_beside_the_car() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	var ground_y := 0.0
	await board(car)
	var start := car.global_position
	await hold_gas(2.5)
	assert_true(car.forward_speed() > 5.0, "moving after 2.5 s of GAS (%.1f m/s)" % car.forward_speed())
	assert_true(car.global_position.distance_to(start) > 6.0, "moved more than 6 m")
	var toasts: Array[String] = []
	yard.driving.toast.connect(func(t: String) -> void: toasts.append(t))
	assert_false(yard.driving.exit(), "getting out refused while moving")
	assert_eq(yard.driving.mode(), &"driving", "still driving")
	assert_true(toasts.has("Stop the vehicle first"), "told to stop first")
	yard.driving.brake = true
	var stopped := await wait_until(func() -> bool: return absf(car.forward_speed()) < 1.0, 60 * 6)
	yard.driving.brake = false
	assert_true(stopped, "braked to a stop")
	var heading := car.yaw()
	assert_true(yard.driving.exit(), "getting out once stopped")
	var free_while_closing := false
	var max_door := 0.0
	for i in 60 * 4:
		max_door = maxf(max_door, car.door())
		if yard.driving.mode() == &"foot" and yard.driving.boarding != null and yard.driving.boarding.phase() == &"close":
			free_while_closing = true
		if yard.driving.mode() == &"foot" and yard.driving.boarding == null:
			break
		await wait_physics_frames(1)
	await wait_physics_frames(20)
	assert_eq(yard.driving.mode(), &"foot", "on foot")
	assert_true(max_door > 0.8, "the door opened to get out")
	assert_true(free_while_closing, "control back while the door swings shut")
	assert_eq(car.door(), 0.0, "door shut")
	var d := yard.rider.global_position - car.global_position
	var right := d.x * cos(heading) - d.z * sin(heading)
	assert_true(right > 1.0 and right < 2.0, "standing beside the driver's (right) door: %.2f m right" % right)
	assert_true(Vector2(d.x, d.z).length() < 2.5, "close to the car")
	assert_near(yard.rider.global_position.y, ground_y, 0.3, "feet on the ground")
	assert_false(yard.controls.gas.is_visible_in_tree(), "driving controls hidden on foot")
	return true


func test_gear_selector_reverse_park_drive() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	await board(car)
	var heading := car.yaw()
	yard.driving.select_gear("R")
	assert_eq(yard.driving.gear_label(), "R", "R engaged when stopped")
	var start := car.global_position
	await hold_gas(1.5)
	assert_true(YardTest.along(car, start, heading) < -1.5, "GAS in R goes backwards")
	await hold_brake(1.5)
	assert_true(await wait_until(func() -> bool: return absf(car.forward_speed()) < 0.5, 60 * 5), "stopped")
	yard.driving.select_gear("P")
	assert_eq(yard.driving.gear_label(), "P", "P")
	var parked := car.global_position
	await hold_gas(1.5)
	assert_true(car.global_position.distance_to(parked) < 0.2, "GAS in P does nothing")
	yard.driving.select_gear("D")
	var drive := car.global_position
	await hold_gas(1.5)
	assert_true(YardTest.along(car, drive, heading) > 2.0, "D drives forwards")
	assert_true(yard.driving.gear_label().length() == 2 and yard.driving.gear_label().begins_with("D"), "D with a gear number: %s" % yard.driving.gear_label())
	return true


func test_reverse_asked_while_moving_brakes_first() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	await board(car)
	await hold_gas(2.0)
	assert_true(car.forward_speed() > 5.0, "moving")
	yard.driving.select_gear("R")
	assert_eq(yard.driving.gear_label(), "N", "N while the gearbox brakes")
	assert_true(await wait_until(func() -> bool: return yard.driving.gear_label() == "R", 60 * 6), "R once stopped")
	var heading := car.yaw()
	var stopped := car.global_position
	await hold_brake(0.8)
	assert_true(YardTest.along(car, stopped, heading) > -0.3, "BRAKE once stopped does not reverse")
	var before := car.global_position
	await hold_gas(1.2)
	assert_true(YardTest.along(car, before, heading) < -0.8, "GAS in R reverses")
	return true


func test_parked_in_p_stays_put() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	await board(car)
	yard.driving.select_gear("P")
	assert_true(yard.driving.exit(), "out")
	await wait_until(func() -> bool: return yard.driving.mode() == &"foot" and yard.driving.boarding == null, 60 * 4)
	var at := car.global_position
	await wait_game_seconds(1.0)
	assert_true(car.global_position.distance_to(at) < 0.05, "the parked car stays where it was left")
	return true


func test_steering_right_turns_clockwise() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	await board(car)
	var yaw := car.yaw()
	await hold_gas(2.6, 1.0)
	assert_true(wrapf(car.yaw() - yaw, -PI, PI) < -0.25, "turned clockwise (right)")
	return true


func test_bike_and_auto_ridden_no_door() -> bool:
	for variant: StringName in [&"motorbike", &"auto"]:
		var v := await spawn(variant, Vector3(6 if variant == &"auto" else -6, 0, 30))
		var door_moved := false
		yard.rider.place(v.ground_point(Vector2(2.0, 0.0)), 0.0)
		await wait_physics_frames(1)
		yard.driving.enter(v)
		var phases: Array[StringName] = []
		for i in 60 * 6:
			if yard.driving.boarding != null and not phases.has(yard.driving.boarding.phase()):
				phases.append(yard.driving.boarding.phase())
			door_moved = door_moved or v.door() != 0.0
			if yard.driving.mode() == &"driving":
				break
			await wait_physics_frames(1)
		check(yard.driving.mode() == &"driving", "%s: riding" % variant)
		check(phases.has(&"sit") and not phases.has(&"open"), "%s: straight onto the seat (%s)" % [variant, phases])
		check(not door_moved, "%s: no door" % variant)
		check(yard.rider.visible, "%s: the rider can be seen" % variant)
		await hold_gas(2.0)
		check(v.forward_speed() > 3.0, "%s moves (%.1f m/s)" % [variant, v.forward_speed()])
		yard.driving.brake = true
		check(await wait_until(func() -> bool: return absf(v.forward_speed()) < 1.5, 60 * 5), "%s brakes" % variant)
		yard.driving.brake = false
		await wait_until(func() -> bool: return absf(v.forward_speed()) < 2.4, 60 * 3)
		check(yard.driving.exit(), "%s: get off" % variant)
		check(await wait_until(func() -> bool: return yard.driving.mode() == &"foot" and yard.driving.boarding == null, 60 * 4), "%s: on foot" % variant)
	return true


func test_bus_front_door_and_aisle() -> bool:
	var bus := await spawn(&"bus", Vector3(0, 0, 0))
	yard.rider.place(bus.ground_point(Vector2(-3.0, -3.6)), 0.0)
	await wait_physics_frames(1)
	yard.driving.enter(bus)
	var phases: Array[StringName] = []
	var max_door := 0.0
	for i in 60 * 8:
		if yard.driving.boarding != null and not phases.has(yard.driving.boarding.phase()):
			phases.append(yard.driving.boarding.phase())
		max_door = maxf(max_door, bus.door())
		if yard.driving.mode() == &"driving":
			break
		await wait_physics_frames(1)
	assert_eq(yard.driving.mode(), &"driving", "driving the bus")
	for p: StringName in [&"open", &"climb", &"sit", &"close"]:
		check(phases.has(p), "bus phase %s (%s)" % [p, phases])
	assert_true(max_door > 0.8, "the folding door opened")
	assert_eq(bus.door(), 0.0, "and shut")
	return true


func test_ambulance_siren_and_controls() -> bool:
	var amb := await spawn(&"ambulance", Vector3(0, 0, 0))
	await board(amb)
	assert_eq(yard.controls.horn.text, "SIREN", "the horn button is the siren")
	yard.driving.press_horn()
	assert_true(amb.siren(), "siren on")
	yard.driving.press_horn()
	assert_false(amb.siren(), "and off")
	var car := await spawn(&"hatchback", Vector3(20, 0, 0))
	car.set_siren(true)
	assert_false(car.siren(), "no siren on a plain hatchback")
	return true
