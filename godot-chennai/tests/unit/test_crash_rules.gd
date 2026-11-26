extends TestCase
## Crash rules (TD-29, G-75, G-270): bump, shaken, fall and thrown bands per kind; severity
## shared by mass against fixed (kinematic) bodies; the contact angle; damage by impact.


func _judge(kind: StringName, kmh: float, side: int = -1) -> CrashRules.Outcome:
	var speed := kmh / 3.6
	return CrashRules.judge(VehicleCatalog.type(kind).crash, speed, Vector2(0, -speed), side)


## A measured hit on `kind` at `measured` km/h against `other` (&"" the world) that the
## solver could not move (`fixed`), pushed along `push` (the bike heads -Z).
func _hit(kind: StringName, measured_kmh: float, other: StringName, fixed: bool, push: Vector2 = Vector2(0, 1)) -> CrashRules.Outcome:
	var t := VehicleCatalog.type(kind)
	var i := CrashRules.Impact.new()
	i.measured = measured_kmh / 3.6
	i.push = push
	i.approach = Vector2(0, -measured_kmh / 3.6)
	i.forward = Vector2(0, -1)
	i.self_mass = t.spec.mass
	i.other_kind = other
	i.other_fixed = fixed
	i.other_mass = INF if other == &"" else VehicleCatalog.type(other).spec.mass
	return CrashRules.judge_hit(t.crash, i, -1)


func test_thresholds_per_kind() -> bool:
	# [kind, shaken from, falls from (-1 never), thrown from (-1 never)]. The auto is thrown from
	# 38 km/h, not TD-29's 30 (G-270: between 24 and 38 its rider falls out instead).
	var rows: Array = [[&"bike", 18.0, 27.0, 35.0], [&"auto", 18.0, 24.0, 38.0], [&"car", 25.0, -1.0, 70.0], [&"ambulance", 25.0, -1.0, 75.0], [&"bus", 30.0, -1.0, -1.0], [&"race", 40.0, -1.0, -1.0]]
	for row: Array in rows:
		var kind: StringName = row[0]
		var hurt: float = row[1]
		var fall: float = row[2]
		var thrown: float = row[3]
		assert_eq(_judge(kind, CrashRules.BUMP_FROM - 0.5).type, &"none", "%s below %s km/h: not felt" % [kind, CrashRules.BUMP_FROM])
		assert_eq(_judge(kind, hurt - 1.0).type, &"bump", "%s below %s km/h: a bump" % [kind, hurt])
		assert_eq(_judge(kind, hurt + 1.0).type, &"shaken", "%s above %s km/h: shaken" % [kind, hurt])
		var seated_to := fall if fall > 0.0 else thrown
		if seated_to > 0.0:
			assert_eq(_judge(kind, seated_to - 0.5).type, &"shaken", "%s just below %s km/h: stays seated" % [kind, seated_to])
		if fall > 0.0:
			assert_eq(_judge(kind, fall + 0.5).type, &"fall", "%s just above %s km/h: falls off" % [kind, fall])
			assert_eq(_judge(kind, thrown - 0.5).type, &"fall", "%s just below %s km/h: falls, not thrown" % [kind, thrown])
		if thrown > 0.0:
			assert_eq(_judge(kind, thrown + 0.5).type, &"thrown", "%s just above %s km/h: thrown" % [kind, thrown])
		else:
			assert_eq(_judge(kind, 200.0).type, &"shaken", "%s: never thrown" % kind)
	return true


func test_bump_is_a_wobble_with_no_damage_and_no_launch() -> bool:
	var o := _judge(&"bike", 12.0)
	assert_eq(o.type, &"bump", "12 km/h on a bike: a bump")
	assert_eq(o.damage, 0.0, "no damage")
	assert_eq(o.launch, Vector3.ZERO, "no launch")
	assert_true(o.wobble >= CrashRules.WOBBLE_MIN and o.wobble < 1.0, "a small wobble (%.2f)" % o.wobble)
	assert_true(_judge(&"bike", 6.0).wobble < o.wobble, "a softer bump wobbles less")
	return true


func test_hitting_a_bike_shares_the_change_by_mass() -> bool:
	# The owner's bug: a traffic bike is kinematic, so the solver stops the player dead; the
	# rules give the bike-on-bike hit half the change.
	var slow := _hit(&"bike", 20.0, &"bike", true)
	assert_eq(slow.type, &"bump", "a bike into a slow traffic bike at 20 km/h: a bump (%.1f km/h)" % slow.impact_kmh)
	assert_near(slow.impact_kmh, 10.0, 0.01, "half the measured change")
	assert_eq(_hit(&"bike", 40.0, &"bike", true).type, &"shaken", "40 km/h into a bike: shaken, stays on")
	assert_eq(_hit(&"bike", 60.0, &"bike", true).type, &"fall", "60 km/h into a bike: falls off")
	assert_eq(_hit(&"bike", 80.0, &"bike", true).type, &"thrown", "80 km/h into a bike: thrown")
	# A free (parked) body: Jolt already shared it; the measured change is the severity.
	assert_near(_hit(&"bike", 20.0, &"bike", false).impact_kmh, 20.0, 0.01, "a parked bike: measured as is")
	# Heavier targets hit harder.
	var bus := _hit(&"bike", 40.0, &"bus", true)
	assert_true(bus.impact_kmh > 38.0, "into a bus almost the whole change (%.1f)" % bus.impact_kmh)
	assert_eq(bus.type, &"thrown", "40 km/h into a bus: thrown")
	assert_eq(_hit(&"bike", 40.0, &"car", true).type, &"fall", "40 km/h into a car (83 %%): falls off")
	assert_eq(_hit(&"bike", 50.0, &"car", true).type, &"thrown", "50 km/h into a car: thrown")
	assert_eq(_hit(&"car", 40.0, &"bike", true).type, &"bump", "a car into a bike at 40 km/h: a bump for the car driver")
	assert_eq(_hit(&"bus", 60.0, &"car", true).type, &"bump", "a bus into a car: a bump for the bus driver")
	return true


func test_contact_angle() -> bool:
	assert_eq(CrashRules.contact_of(Vector2(0, 1), Vector2(0, -1)), &"front", "pushed back: hit in front")
	assert_eq(CrashRules.contact_of(Vector2(0, -1), Vector2(0, -1)), &"rear", "pushed forwards: hit from behind")
	assert_eq(CrashRules.contact_of(Vector2(1, 0), Vector2(0, -1)), &"side", "pushed sideways: hit from the side")
	# A bike hit from the side falls sooner (75 % of 27 km/h).
	assert_eq(_hit(&"bike", 22.0, &"", true, Vector2(1, 0)).type, &"fall", "22 km/h from the side: the bike falls")
	assert_eq(_hit(&"bike", 22.0, &"", true).type, &"shaken", "22 km/h head on: stays on")
	# The seat holds a rider hit from behind: never thrown, at most a fall.
	assert_eq(_hit(&"bike", 60.0, &"", true, Vector2(0, -1)).type, &"fall", "rear-ended hard: falls, not thrown")
	assert_eq(_hit(&"car", 90.0, &"", true, Vector2(0, -1)).type, &"shaken", "a car rear-ended: stays in")
	return true


func test_fall_is_low_slow_and_to_the_side() -> bool:
	var o := _judge(&"bike", 30.0, 1)
	assert_eq(o.type, &"fall", "30 km/h: falls")
	assert_true(o.topples, "the bike falls over")
	assert_near(o.launch.y, CrashRules.FALL_UP, 0.01, "barely up")
	var flat := Vector2(o.launch.x, o.launch.z).length()
	assert_true(flat < 30.0 / 3.6 * 0.6, "keeps well under the speed (%.1f m/s)" % flat)
	assert_true(o.launch.x > 0.0, "slides off to the right")
	assert_true(o.damage > 0.0 and o.damage < _judge(&"bike", 36.0).damage, "hurts less than a throw")
	assert_true(o.lie_for < _judge(&"bike", 36.0).lie_for, "lies less long than a throw")
	return true


func test_damage_and_styles() -> bool:
	var bike := _judge(&"bike", 94.0)
	assert_near(bike.damage, 12.0 + 0.9 * (94.0 - 35.0), 0.01, "bike flat out into a wall")
	assert_near(_judge(&"auto", 30.0).damage, 6.0 + 0.4 * (30.0 - 18.0), 0.01, "a fall: base plus seated damage")
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
	assert_near(Vector2(o.launch.x, o.launch.z).length(), speed * CrashRules.THROW_KEEP, 0.01, "keeps 70 %")
	assert_true(o.launch.y >= 3.2 and o.launch.y <= CrashRules.THROW_UP_MAX, "up 3.2 m/s and more, at most 6.5")
	assert_true(o.launch.z < 0.0, "forwards (travel is -Z)")
	assert_true(o.launch.x > 0.0, "side 1: to the right of the line of travel")
	assert_true(_judge(&"bike", 60.0, -1).launch.x < 0.0, "side -1: to the left")
	assert_true(o.lie_for > 0.8 and o.lie_for <= 2.4, "lies still a while")
	var windscreen := _judge(&"car", 75.0)
	assert_true(windscreen.launch.y > _judge(&"auto", 75.0).launch.y, "over a windscreen goes higher")
	return true
