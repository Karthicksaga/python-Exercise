extends TestCase
## What trains and crossings sound like as numbers (G-374): the running loops follow speed and
## braking, a train is heard from further than a crossing bell, inside is louder than outside,
## and a bell rings only while the gates are down or moving.


func test_a_stopped_train_is_silent_and_a_fast_one_rumbles_and_clatters() -> bool:
	var still := RailSounds.motion_levels(0.0, 0.0, true, 0.0)
	assert_eq(float(still["rumble"]), 0.0, "no rumble standing")
	assert_eq(float(still["clatter"]), 0.0, "no clatter standing")
	var slow := RailSounds.motion_levels(5.0, 0.0, true, 0.0)
	var fast := RailSounds.motion_levels(25.0, 0.0, true, 0.0)
	assert_true(float(fast["rumble"]) > float(slow["rumble"]) and float(fast["clatter"]) > float(slow["clatter"]), "faster, louder")
	assert_true(float(fast["clatter"]) > float(slow["clatter"]) * 4.0, "the clatter grows faster than the rumble")
	assert_true(float(fast["rumble_pitch"]) > float(slow["rumble_pitch"]), "the rumble rises with speed")
	return true


func test_the_clatter_keeps_time_with_the_train() -> bool:
	# The recording has a joint pair every 0.75 s at 20 m/s: at 10 m/s they are twice as far apart.
	var at20 := RailSounds.motion_levels(RailSounds.CLATTER_REF_SPEED, 0.0, true, 0.0)
	var at10 := RailSounds.motion_levels(RailSounds.CLATTER_REF_SPEED * 0.5, 0.0, true, 0.0)
	assert_near(float(at20["clatter_pitch"]), 1.0, 0.001, "the recorded speed plays as recorded")
	assert_near(float(at10["clatter_pitch"]), 0.5, 0.001, "half the speed, half the joints a second")
	return true


func test_squeal_is_a_hard_stop_at_low_speed_only() -> bool:
	var braking_slow := float(RailSounds.motion_levels(5.0, 1.0, false, 20.0)["squeal"])
	var coasting_slow := float(RailSounds.motion_levels(5.0, 0.0, false, 20.0)["squeal"])
	var braking_fast := float(RailSounds.motion_levels(25.0, 1.0, false, 20.0)["squeal"])
	var nearly_stopped := float(RailSounds.motion_levels(0.2, 1.0, false, 20.0)["squeal"])
	assert_true(braking_slow > 0.3, "squeals braking at 5 m/s (%.2f)" % braking_slow)
	assert_eq(coasting_slow, 0.0, "not without the brake")
	assert_eq(braking_fast, 0.0, "not braking from full speed")
	assert_eq(nearly_stopped, 0.0, "not once it has all but stopped")
	return true


func test_inside_is_louder_than_outside_and_distance_fades_a_train() -> bool:
	var inside := RailSounds.motion_levels(20.0, 0.0, true, 500.0)
	var beside := RailSounds.motion_levels(20.0, 0.0, false, 10.0)
	var far := RailSounds.motion_levels(20.0, 0.0, false, 200.0)
	var gone := RailSounds.motion_levels(20.0, 0.0, false, RailSounds.FAR + 1.0)
	assert_true(float(inside["rumble"]) > float(beside["rumble"]), "the rumble is loudest inside")
	assert_true(float(beside["rumble"]) > float(far["rumble"]) * 3.0, "and fades with distance")
	assert_eq(float(gone["rumble"]), 0.0, "a train beyond the range is not heard")
	assert_eq(float(gone["clatter"]), 0.0, "nor its clatter")
	return true


func test_a_bell_rings_only_while_the_gates_are_down_and_near() -> bool:
	assert_eq(RailSounds.bell_level(5.0, 0.0), 0.0, "open gates: no bell")
	assert_true(RailSounds.bell_level(5.0, 0.2) > 0.9, "gates moving: the bell rings at the crossing")
	assert_true(RailSounds.bell_level(80.0, 1.0) < RailSounds.bell_level(20.0, 1.0), "quieter with distance")
	assert_eq(RailSounds.bell_level(RailSounds.BELL_FAR + 1.0, 1.0), 0.0, "out of earshot")
	return true


func test_a_horn_carries_further_than_a_bell() -> bool:
	assert_true(RailSounds.horn_level(300.0) > 0.0 and RailSounds.bell_level(300.0, 1.0) == 0.0, "a horn at 300 m is heard, a bell is not")
	assert_eq(RailSounds.horn_level(RailSounds.HORN_FAR), 0.0, "silent at the end of its range")
	assert_true(RailSounds.horn_level(10.0) >= RailSounds.horn_level(100.0), "never louder further away")
	return true
