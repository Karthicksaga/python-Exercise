extends YardTest
## A traffic view that is hidden (collision off) while a drivable vehicle stands where it was, then
## shown again somewhere else, must not shove that vehicle (the owner's report on afed12f: after
## TAKE OVER of a traffic bike the rider was thrown tens of metres the moment they sat down).


## A traffic view that drove up to `at` at 8 m/s (as the AI moves it) and was hidden there, as
## `Carjacking` hides the view of the vehicle it swaps in.
func _view_hidden_at(at: Vector3, look: StringName) -> TrafficVehicleView:
	var tv := TrafficVehicleView.make(look, 0.0)
	yard.add_child(tv)
	for i in range(30, -1, -1):
		tv.set_pose(at + Vector3(0, 0, i * 8.0 / 60.0), 0.0, 8.0, 1.0 / 60.0, 5.0)
		await wait_physics_frames(1)
	tv.set_shown(false)
	return tv


func _fastest(v: Vehicle, frames: int) -> float:
	var top := 0.0
	for i in frames:
		await wait_physics_frames(1)
		top = maxf(top, v.linear_velocity.length())
	return top


## The respawn point lies anywhere round the player; the shove came only for some directions (the
## contact's normal), so every side is tried.
func test_a_view_shown_far_away_does_not_shove_what_stands_where_it_was() -> bool:
	for away: Vector3 in [Vector3(120, 0, 0), Vector3(-120, 0, 0), Vector3(0, 0, -120), Vector3(0, 0, 120), Vector3(-80, 0, 80)]:
		var at := Vector3(40, 0, -60)
		var tv := await _view_hidden_at(at, &"motorbike")
		# The drivable bike stands where the view was drawn (`Carjacking._swap`) and is boarded.
		var bike := await spawn(&"motorbike", at)
		assert_true(await board(bike), "riding the bike")
		yard.driving.last_hit = null
		await wait_physics_frames(10)
		# The AI puts the agent back far away (`AgentSystem.let_go(respawn)`): shown there at once.
		tv.set_shown(true)
		tv.set_pose(at + away, 0.0, 8.0, 1.0 / 60.0, 120.0)
		var top := await _fastest(bike, 30)
		assert_true(top < 1.0, "the bike is not shoved when the view goes to %s (%.1f m/s)" % [away, top])
		assert_eq(yard.driving.mode(), &"driving", "still riding (%s)" % away)
		assert_true(yard.driving.last_hit == null, "no hit felt (%s)" % away)
		yard.driving.brake = true
		await wait_physics_frames(30)
		yard.driving.brake = false
		yard.driving.exit()
		await wait_until(func() -> bool: return yard.driving.mode() == &"foot" and yard.driving.boarding == null, 60 * 8)
		tv.queue_free()
		bike.queue_free()
		await wait_physics_frames(2)
	return true


func test_a_visible_view_that_jumps_does_not_sweep_through_a_vehicle() -> bool:
	var at := Vector3(40, 0, -60)
	var bike := await spawn(&"motorbike", at)
	assert_true(await board(bike), "riding the bike")
	# A traffic car stopped against the bike's side (queued in a jam), then the AI re-places it 100 m
	# away on the bike's far side (a stuck agent retired and spawned again).
	var tv := TrafficVehicleView.make(&"hatchback", 0.0)
	yard.add_child(tv)
	var touching := bike.type.spec.half_extents.x + tv.variant.type.spec.half_extents.x + 0.01
	tv.set_pose(bike.ground_point(Vector2.ZERO) + Vector3(touching, 0, 0), 0.0, 0.0, 1.0 / 60.0, 5.0)
	await wait_physics_frames(10)
	yard.driving.last_hit = null
	tv.set_pose(bike.ground_point(Vector2.ZERO) + Vector3(-100.0, 0, 0), 0.0, 8.0, 1.0 / 60.0, 100.0)
	var top := await _fastest(bike, 30)
	assert_true(top < 1.0, "the bike is not shoved (%.1f m/s)" % top)
	assert_true(yard.driving.last_hit == null, "no hit felt")
	assert_true(tv.is_solid(), "the view is solid again at its new place")
	return true


func test_a_shown_view_is_solid_a_step_later_and_still_stops_a_vehicle() -> bool:
	# The box is off only for the step of the jump: a bike ridden into a traffic view still hits it.
	var tv := TrafficVehicleView.make(&"hatchback", 0.0)
	yard.add_child(tv)
	tv.set_shown(false)
	tv.set_shown(true)
	tv.set_pose(Vector3(40, 0, -60), PI / 2.0, 0.0, 1.0 / 60.0, 5.0)
	assert_false(tv.is_solid(), "no box during the step it appears")
	await wait_physics_frames(2)
	assert_true(tv.is_solid(), "solid from the next step")
	var bike := await spawn(&"motorbike", Vector3(40, 0, -52))
	assert_true(await board(bike), "riding")
	bike.set_speed(20.0 / 3.6)
	assert_true(await wait_until(func() -> bool: return yard.driving.last_hit != null, 60 * 4), "the bike hits the car")
	return true


func test_getting_on_and_off_never_shoves_the_vehicle() -> bool:
	# The player's body is kinematic too: put back on its feet beside the seat it must not sweep
	# out of the vehicle's box and push it.
	for variant: StringName in [&"motorbike", &"auto", &"hatchback"]:
		var v := await spawn(variant, Vector3(-20, 0, -40))
		var top := [0.0]
		var watch := func() -> bool:
			top[0] = maxf(float(top[0]), v.linear_velocity.length())
			return false
		assert_true(await board(v), "%s: on" % variant)
		await wait_physics_frames(20)
		assert_true(yard.driving.exit(), "%s: getting off" % variant)
		await wait_until(func() -> bool: return watch.call() or (yard.driving.mode() == &"foot" and yard.driving.boarding == null), 60 * 8)
		await wait_until(watch, 30)
		assert_true(float(top[0]) < 0.6, "%s: not shoved getting off (%.2f m/s)" % [variant, float(top[0])])
		v.queue_free()
		await wait_physics_frames(2)
	return true
