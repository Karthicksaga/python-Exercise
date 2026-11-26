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
		var p := yard.rider.position()
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
	assert_near(yard.rider.position().y, 0.0, 0.3, "standing on the ground")
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
		min_z = minf(min_z, yard.rider.position().z)
		if yard.driving.mode() == &"foot":
			break
		await wait_physics_frames(1)
	assert_true(min_z > _wall_face(), "never through the wall (closest z %.2f)" % min_z)
	assert_true(car.global_position.z > _wall_face(), "the car stopped at the wall")
	assert_eq(yard.driving.mode(), &"foot", "up again")
	assert_near(yard.rider.position().y, 0.0, 0.3, "on the ground")
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


## Ride `variant` at `kmh` into `target` standing across the road 8 m ahead: "parked" (a parked
## motorbike, a free rigid body) or a traffic variant (a kinematic AI view). Waits for the hit.
func ride_into(variant: StringName, kmh: float, target: String) -> Vehicle:
	var at := Vector3(40, 0, -60)
	var v := await spawn(variant, at + Vector3(0, 0, 8.0))
	if target == "parked":
		await spawn(&"motorbike", at, PI / 2.0)
	else:
		var tv := TrafficVehicleView.make(StringName(target), 0.0)
		yard.add_child(tv)
		tv.set_pose(at, PI / 2.0, 0.0, 1.0 / 60.0, 5.0)
	await board(v)
	v.set_speed(kmh / 3.6)
	await wait_until(func() -> bool: return yard.driving.last_hit != null, 60 * 4)
	var hit := yard.driving.last_hit
	if hit != null:
		print("    %s at %.0f km/h into %s: severity %.1f km/h, %s" % [variant, kmh, target, hit.impact_kmh, hit.type])
	return v


func test_parked_bike_at_low_speed_is_only_a_bump() -> bool:
	var bike := await ride_into(&"motorbike", 20.0, "parked")
	var hit := yard.driving.last_hit
	if not assert_true(hit != null, "the hit was felt"):
		return true
	assert_eq(hit.type, &"bump", "a bump (%.1f km/h)" % hit.impact_kmh)
	assert_true(yard.driving.last_crash == null, "no crash")
	assert_true(bike.wobbling() > 0.05, "the bike wobbles")
	await wait_physics_frames(30)
	assert_eq(yard.driving.mode(), &"driving", "still riding")
	assert_eq(yard.rider.health, 100.0, "unhurt")
	assert_false(bike.toppled(), "the bike stays up")
	return true


func test_slow_traffic_bike_at_low_speed_is_only_a_bump() -> bool:
	await ride_into(&"motorbike", 20.0, "motorbike")
	var hit := yard.driving.last_hit
	if not assert_true(hit != null, "the hit was felt"):
		return true
	assert_eq(hit.type, &"bump", "a bump (%.1f km/h)" % hit.impact_kmh)
	assert_true(hit.hit != null and hit.hit.other is TrafficVehicleView, "the traffic bike was identified as the other body")
	await wait_physics_frames(30)
	assert_eq(yard.driving.mode(), &"driving", "still riding")
	assert_eq(yard.rider.health, 100.0, "unhurt")
	return true


func test_traffic_bike_at_40_kmh_shakes_but_never_throws() -> bool:
	# The owner's bug: the same hit judged as a wall threw the rider (40.7 km/h measured).
	await ride_into(&"motorbike", 40.0, "motorbike")
	var hit := yard.driving.last_hit
	if not assert_true(hit != null, "the hit was felt"):
		return true
	assert_eq(hit.type, &"shaken", "shaken (%.1f km/h, half the measured change)" % hit.impact_kmh)
	await wait_physics_frames(20)
	assert_eq(yard.driving.mode(), &"driving", "still riding")
	return true


func test_parked_bike_fast_the_rider_slides_off_low() -> bool:
	var bike := await ride_into(&"motorbike", 55.0, "parked")
	var hit := yard.driving.last_hit
	if not assert_true(hit != null, "the hit was felt"):
		return true
	assert_eq(hit.type, &"fall", "falls off (%.1f km/h)" % hit.impact_kmh)
	var start := yard.rider.position()
	var peak := -INF
	var far := 0.0
	for i in 60 * 6:
		var p := yard.rider.position()
		peak = maxf(peak, p.y)
		far = maxf(far, Vector2(p.x - start.x, p.z - start.z).length())
		if yard.driving.mode() == &"foot":
			break
		await wait_physics_frames(1)
	assert_true(peak < 0.9, "low, not launched (peak %.2f m)" % peak)
	assert_true(far < 5.0, "slides a short way (%.1f m)" % far)
	assert_true(bike.toppled(), "the bike fell over")
	assert_eq(yard.driving.mode(), &"foot", "up again")
	assert_true(yard.rider.health < 100.0 and yard.rider.health > 80.0, "hurt a little (%.0f)" % yard.rider.health)
	return true


func test_bike_into_traffic_bus_at_speed_is_a_throw() -> bool:
	await ride_into(&"motorbike", 55.0, "bus")
	var hit := yard.driving.last_hit
	if not assert_true(hit != null, "the hit was felt"):
		return true
	assert_eq(hit.type, &"thrown", "thrown off against a bus (%.1f km/h)" % hit.impact_kmh)
	return true


func test_crash_feedback_effects_shake_damage_and_smoke() -> bool:
	var car := await crash_into_wall(&"hatchback", 78.0)
	var crash := yard.driving.last_crash
	if not assert_true(crash != null, "a crash was judged"):
		return true
	var fx := yard.wiring.effects
	assert_true(fx.alive(CrashEffects.Pool.SPARK) > 0 or fx.alive(CrashEffects.Pool.SHARD) > 0, "sparks and glass fly")
	assert_true(fx.alive(CrashEffects.Pool.SHARD) >= 10, "a car's windscreen sheds glass (%d)" % fx.alive(CrashEffects.Pool.SHARD))
	assert_true(yard.camera().trauma > 0.3, "the camera shakes (trauma %.2f)" % yard.camera().trauma)
	assert_eq(car.damage_stage(), 2, "wrecked at %.0f km/h (damage %.0f)" % [crash.impact_kmh, car.damage])
	assert_eq(car.model.damage_stage(), 2, "the model shows it")
	await wait_game_seconds(1.0)
	assert_eq(fx.smoking(), 1, "the wreck smokes")
	assert_true(fx.alive(CrashEffects.Pool.PUFF) > 0, "puffs rise")
	await wait_game_seconds(2.0)
	assert_eq(fx.alive(CrashEffects.Pool.SPARK) + fx.alive(CrashEffects.Pool.SHARD), 0, "the debris is gone in 3 s")
	assert_eq(yard.camera().trauma, 0.0, "the shake has died away")
	return true


## Records the knockdown hooks a figure with clips would get (agent/godot-anim's API).
class RecordingLink:
	extends RiderLink
	var calls: Array[String] = []

	func _show_fall(velocity: Vector3) -> void:
		calls.append("fall %.1f" % velocity.y)

	func _show_landed() -> void:
		calls.append("landed")

	func _show_getup() -> void:
		calls.append("getup")


func test_knockdown_hooks_fall_land_get_up_in_order() -> bool:
	var body := CharacterBody3D.new()
	var shape := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.3
	capsule.height = 1.7
	shape.shape = capsule
	shape.position = Vector3(0, 0.85, 0)
	body.add_child(shape)
	yard.add_child(body)
	body.global_position = Vector3(100, 0.4, 100)
	var link := RecordingLink.new()
	link.body = body
	link.throw_off(body.global_position, Vector3(4, 3, 0), 0.3, null)
	for i in 60 * 6:
		await wait_physics_frames(1)
		link.physics_step(1.0 / 60.0)
		if link.knockdown() == &"":
			break
	assert_eq(link.knockdown(), &"", "up again")
	assert_eq(link.calls.size(), 3, "three hooks (%s)" % [link.calls])
	if link.calls.size() == 3:
		assert_eq(link.calls[0], "fall 3.0", "the fall gets the launch")
		assert_eq(link.calls[1], "landed", "then the landing")
		assert_eq(link.calls[2], "getup", "then getting up")
	body.queue_free()
	return true
