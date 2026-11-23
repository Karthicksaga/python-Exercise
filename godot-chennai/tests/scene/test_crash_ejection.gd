extends YardTest
## Crash ejection (TD-29, G-75) in the yard: driven into the wall at a set speed, a rider is
## thrown above the kind's threshold and stays seated below it; the body flies, never passes the
## wall, lands on the ground, lies, gets up; the bike topples. And no tunnelling at top speed
## (CCD): the race car flat out into a 30 cm wall stops on the near side.

## Start this far before the wall (metres), nose to it.
const RUN_IN := 6.0


## Send `variant` at `kmh` into the yard's wall (coasting the last few metres, as a driver who
## saw it too late), until a crash is judged or 5 s pass.
func crash_into_wall(variant: StringName, kmh: float) -> Vehicle:
	var v := await spawn(variant, Vector3(0, 0, VehicleYard.WALL_Z + RUN_IN + VehicleCatalog.variant(variant).type.spec.half_extents.z))
	await board(v)
	v.set_speed(kmh / 3.6)
	await wait_until(func() -> bool: return yard.driving.last_crash != null or yard.driving.mode() != &"driving", 60 * 5)
	if yard.driving.last_crash != null:
		print("    crash at %.0f km/h: impact %.1f km/h, %s" % [kmh, yard.driving.last_crash.impact_kmh, yard.driving.last_crash.type])
	return v


func _wall_face() -> float:
	return VehicleYard.WALL_Z + VehicleYard.WALL_THICKNESS / 2.0


func test_motorbike_thrown_above_35_kmh() -> bool:
	var bike := await crash_into_wall(&"motorbike", 50.0)
	var crash := yard.driving.last_crash
	if not assert_true(crash != null, "a crash was judged"):
		return true
	assert_eq(crash.type, &"thrown", "thrown at %.0f km/h impact" % crash.impact_kmh)
	assert_eq(yard.driving.mode(), &"thrown", "the player has no control while thrown")
	var health_before := yard.rider.health
	var min_z := INF
	var landed := false
	var max_y := -INF
	for i in 60 * 8:
		var p := yard.rider.global_position
		min_z = minf(min_z, p.z)
		max_y = maxf(max_y, p.y)
		if yard.rider.knockdown() in [&"sliding", &"lying"]:
			landed = true
		if yard.driving.mode() == &"foot":
			break
		await wait_physics_frames(1)
	assert_true(max_y > 0.6, "the body flew (peak %.2f m)" % max_y)
	assert_true(landed, "it landed and lay down")
	assert_true(min_z > _wall_face(), "never through the wall (closest z %.2f, wall face %.2f)" % [min_z, _wall_face()])
	assert_eq(yard.driving.mode(), &"foot", "up again and on foot")
	assert_near(yard.rider.global_position.y, 0.0, 0.3, "standing on the ground")
	assert_near(yard.rider.health, health_before - crash.damage, 0.01, "damage taken on landing")
	assert_true(bike.toppled(), "the motorbike fell over")
	return true


func test_motorbike_stays_seated_below_35_kmh() -> bool:
	await crash_into_wall(&"motorbike", 24.0)
	var crash := yard.driving.last_crash
	if not assert_true(crash != null, "a crash was judged"):
		return true
	assert_true(crash.impact_kmh < 35.0, "impact below the threshold (%.1f km/h)" % crash.impact_kmh)
	assert_eq(crash.type, &"shaken", "shaken, not thrown")
	await wait_physics_frames(10)
	assert_eq(yard.driving.mode(), &"driving", "still riding")
	assert_true(yard.rider.health < 100.0, "hurt a little")
	return true


func test_car_driver_through_the_windscreen_only_near_top_speed() -> bool:
	var car := await crash_into_wall(&"hatchback", 78.0)
	var crash := yard.driving.last_crash
	if not assert_true(crash != null, "a crash was judged"):
		return true
	assert_eq(crash.type, &"thrown", "thrown at %.0f km/h impact" % crash.impact_kmh)
	assert_eq(crash.style, "windscreen", "through the windscreen")
	var min_z := INF
	for i in 60 * 8:
		min_z = minf(min_z, yard.rider.global_position.z)
		if yard.driving.mode() == &"foot":
			break
		await wait_physics_frames(1)
	assert_true(min_z > _wall_face(), "never through the wall (closest z %.2f)" % min_z)
	assert_true(car.global_position.z > _wall_face(), "the car stopped at the wall")
	assert_eq(yard.driving.mode(), &"foot", "up again")
	assert_near(yard.rider.global_position.y, 0.0, 0.3, "on the ground")
	return true


func test_car_driver_stays_in_at_50_kmh() -> bool:
	await crash_into_wall(&"hatchback", 50.0)
	var crash := yard.driving.last_crash
	if not assert_true(crash != null, "a crash was judged"):
		return true
	assert_eq(crash.type, &"shaken", "shaken (%.0f km/h impact)" % crash.impact_kmh)
	assert_eq(yard.driving.mode(), &"driving", "still driving")
	return true


func test_no_tunnelling_at_top_speed() -> bool:
	var race := await crash_into_wall(&"race_car", VehicleCatalog.type(&"race").spec.max_speed * 3.6)
	await wait_physics_frames(30)
	var h := race.type.spec.half_extents.z
	assert_true(race.global_position.z - h > _wall_face() - 0.05, "the race car stayed on the near side of a 30 cm wall at %.0f km/h (front at z %.2f)" % [race.type.spec.max_speed * 3.6, race.global_position.z - h])
	assert_true(yard.driving.last_crash != null, "the hit was felt")
	assert_eq(yard.driving.mode(), &"driving", "the race driver is never thrown (harness)")
	return true
