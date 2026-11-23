extends TestCase
## Crash rules (TD-29, G-75): thrown above each kind's threshold, never below; damage by impact.


func _judge(kind: StringName, kmh: float, side: int = -1) -> CrashRules.Outcome:
	var speed := kmh / 3.6
	return CrashRules.judge(VehicleCatalog.type(kind).crash, speed, Vector2(0, -speed), side)


func test_thresholds_per_kind() -> bool:
	# [kind, shaken from, thrown from (-1 never)]
	var rows: Array = [[&"bike", 18.0, 35.0], [&"auto", 18.0, 30.0], [&"car", 25.0, 70.0], [&"ambulance", 25.0, 75.0], [&"bus", 30.0, -1.0]]
	for row: Array in rows:
		var kind: StringName = row[0]
		var hurt: float = row[1]
		var thrown: float = row[2]
		assert_eq(_judge(kind, hurt - 1.0).type, &"none", "%s below %s km/h: nothing" % [kind, hurt])
		assert_eq(_judge(kind, hurt + 1.0).type, &"shaken", "%s above %s km/h: shaken" % [kind, hurt])
		if thrown > 0.0:
			assert_eq(_judge(kind, thrown - 0.5).type, &"shaken", "%s just below %s km/h: stays seated" % [kind, thrown])
			assert_eq(_judge(kind, thrown + 0.5).type, &"thrown", "%s just above %s km/h: thrown" % [kind, thrown])
		else:
			assert_eq(_judge(kind, 200.0).type, &"shaken", "%s: never thrown" % kind)
	return true


func test_damage_and_styles() -> bool:
	var bike := _judge(&"bike", 94.0)
	assert_near(bike.damage, 12.0 + 0.9 * (94.0 - 35.0), 0.01, "bike flat out into a wall")
	assert_eq(bike.style, "off", "off the seat")
	assert_true(bike.topples, "the bike falls over")
	var car := _judge(&"car", 80.0)
	assert_eq(car.style, "windscreen", "car: through the windscreen")
	assert_false(car.topples, "a car does not topple")
	assert_near(car.damage, 35.0 + 1.2 * 10.0, 0.01, "car damage")
	assert_eq(_judge(&"bike", 200.0).damage, 100.0, "damage capped at 100")
	var shaken := _judge(&"car", 45.0)
	assert_near(shaken.damage, 0.35 * 20.0, 0.01, "seated damage per km/h")
	return true


func test_launch_keeps_most_speed_goes_up_and_to_the_side() -> bool:
	var o := _judge(&"bike", 60.0, 1)
	var speed := 60.0 / 3.6
	assert_near(Vector2(o.launch.x, o.launch.z).length(), speed * CrashRules.THROW_KEEP, 0.01, "keeps 80 %")
	assert_true(o.launch.y >= 3.2 and o.launch.y <= CrashRules.THROW_UP_MAX, "up 3.2 m/s and more, at most 6.5")
	assert_true(o.launch.z < 0.0, "forwards (travel is -Z)")
	assert_true(o.launch.x > 0.0, "side 1: to the right of the line of travel")
	assert_true(_judge(&"bike", 60.0, -1).launch.x < 0.0, "side -1: to the left")
	assert_true(o.lie_for > 0.8 and o.lie_for <= 2.4, "lies still a while")
	var windscreen := _judge(&"car", 75.0)
	assert_true(windscreen.launch.y > _judge(&"auto", 75.0).launch.y, "over a windscreen goes higher")
	return true
