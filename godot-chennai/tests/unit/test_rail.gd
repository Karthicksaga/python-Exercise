extends TestCase
## The railway's rules, translated from `packages/rail/src/rail.test.ts` (RailPath, train motion,
## timetable, boarding; the build.ts cases are in `tools/rail/test_build_rail.py`) and
## `doors.test.ts`, plus the Godot terminus rule (G-322).


func _square() -> RailPath:
	return RailPath.new(PackedVector2Array([Vector2(0, 0), Vector2(0, -100), Vector2(100, -100)]))


func test_path_measures_length_and_walks_along_it() -> bool:
	var path := _square()
	assert_near(path.length(), 200.0, 1e-9, "length")
	assert_vec_near(path.at(50).point(), Vector2(0, -50), 1e-9, "at 50")
	assert_vec_near(path.at(150).point(), Vector2(50, -100), 1e-9, "at 150")
	# North is yaw 0; east is -90°.
	assert_near(path.at(50).yaw, 0.0, 1e-9, "north is yaw 0")
	assert_near(path.at(150).yaw, -PI / 2.0, 1e-9, "east is -90°")
	return true


func test_path_puts_left_on_the_left_of_the_direction_of_travel() -> bool:
	var path := _square()
	# Running north, left is west (-X); running east, left is north (-Z).
	assert_near(path.beside(50, 3).x, -3.0, 1e-9, "left of north is west")
	assert_near(path.beside(150, 3).y, -103.0, 1e-9, "left of east is north")
	var p := path.project(Vector2(-3, -50))
	assert_near(p.s, 50.0, 1e-9, "projected s")
	assert_near(p.distance, 3.0, 1e-9, "projected distance")
	assert_near(p.lateral, 3.0, 1e-9, "projected lateral (left positive)")
	assert_near(path.project(Vector2(50, -97)).lateral, -3.0, 1e-9, "right of east is negative")
	assert_near(path.project_near(Vector2(-3, -50), 10.0).s, 50.0, 1e-9, "project_near agrees")
	return true


func _profile() -> RunProfile:
	return RunProfile.new(5000.0, PackedFloat64Array([1000.0, 2200.0, 4000.0]))


func test_motion_enters_at_line_speed_and_stops_30_s_at_each_station() -> bool:
	var profile := _profile()
	var spec := RunProfile.MotionSpec.emu()
	assert_near(profile.state(0).speed, spec.top_speed, 1e-9, "enters at line speed")
	for i in profile.arrivals.size():
		var arrival := profile.arrivals[i]
		var at := profile.state(arrival + 1)
		assert_eq(at.stopped_at, i, "stopped at %d" % i)
		assert_near(at.s, profile.stops[i], 1e-3, "on the stop")
		assert_eq(at.speed, 0.0, "standing")
		assert_eq(profile.state(arrival + spec.dwell - 1).stopped_at, i, "still there before the dwell ends")
		assert_eq(profile.state(arrival + spec.dwell + 1).stopped_at, -1, "gone after it")
	return true


func test_motion_is_smooth_never_backwards_or_too_fast() -> bool:
	var profile := _profile()
	var spec := RunProfile.MotionSpec.emu()
	var last := profile.state(0)
	var t := 0.5
	var bad := 0
	while t <= profile.duration:
		var now := profile.state(t)
		if now.s < last.s - 1e-6 or now.speed > spec.top_speed + 1e-6 or absf(now.speed - last.speed) > 0.5 * spec.brake + 1e-6:
			bad += 1
		last = now
		t += 0.5
	assert_eq(bad, 0, "no sample runs backwards, too fast or jerks")
	assert_near(profile.state(profile.duration).s, 5000.0, 1e-3, "leaves at the end")
	return true


func test_motion_starts_from_a_terminus_standing_still() -> bool:
	var terminus := RunProfile.new(1500.0, PackedFloat64Array([0.0]))
	var first := terminus.state(1)
	assert_eq(first.stopped_at, 0, "stands at the terminus")
	assert_eq(first.speed, 0.0, "still")
	assert_eq(first.next_stop, -1, "no next stop")
	assert_true(terminus.state(RunProfile.MotionSpec.emu().dwell + 10).speed > 0.0, "then moves off")
	return true


func test_motion_says_which_stop_is_next() -> bool:
	var profile := _profile()
	assert_eq(profile.state(1).next_stop, 0, "first stop next")
	assert_eq(profile.state(profile.arrivals[0] + 5).next_stop, 1, "standing at 0: 1 is next")
	assert_eq(profile.state(profile.duration).next_stop, -1, "none after the last")
	return true


func test_motion_terminus_on_the_map_starts_and_ends_standing() -> bool:
	# Godot addition (G-322): a line leaving Chennai Central stands there first, a line arriving
	# there ends standing, for the terminus dwell; no entry at line speed from the buffers.
	var spec := RunProfile.MotionSpec.make(0.4, 0.6, 25.0, 30.0, 150.0)
	var out := RunProfile.new(1500.0, PackedFloat64Array([60.0]), spec, true, false)
	var first := out.state(0.5)
	assert_eq(first.stopped_at, 0, "out: standing at the platform from the start")
	assert_near(first.s, 60.0, 1e-9, "at the stop, not the buffers")
	assert_near(first.dwell_total, 150.0, 1e-9, "for the terminus dwell")
	assert_true(out.state(151.0).speed > 0.0, "then pulls away")
	var into := RunProfile.new(1500.0, PackedFloat64Array([1440.0]), spec, false, true)
	var last := into.state(into.duration - 1.0)
	assert_eq(last.stopped_at, 0, "in: ends standing at the platform")
	assert_near(into.duration - into.arrivals[0], 150.0, 1e-6, "for the terminus dwell")
	assert_true(into.state(into.duration).s < 1441.0, "never runs on to the buffers")
	return true


func _line_data() -> Dictionary:
	return {
		"id": "south", "name": "Beach – Tambaram", "points": [0, 0, 0, 5000],
		"stops": [
			{"id": "a", "name": "A", "nameTa": "அ", "s": 1000, "side": 1, "width": 4},
			{"id": "b", "name": "B", "nameTa": "ஆ", "s": 2200, "side": -1, "width": 4},
			{"id": "c", "name": "C", "nameTa": "இ", "s": 4000, "side": 1, "width": 4},
		],
		"from": {"name": "Chennai Beach", "beyond": true},
		"to": {"name": "Tambaram", "beyond": true},
		"headwayMinutes": 6, "offsetMinutes": 1,
	}


func test_timetable_has_few_trains_spaced_well_apart() -> bool:
	var line := RailLine.from_data(_line_data())
	var coach_length := 4 * 21
	var crowded := 0
	var close := 0
	var clock := 0.0
	while clock < 3 * 3600:
		var trains := line.trains(clock)
		trains.sort_custom(func(a: RailLine.TrainAt, b: RailLine.TrainAt) -> bool: return a.state.s < b.state.s)
		if trains.size() > ceili(line.profile.duration / line.headway):
			crowded += 1
		for i in range(1, trains.size()):
			if trains[i].state.s - trains[i - 1].state.s <= coach_length + 100:
				close += 1
		clock += 7.0
	assert_eq(crowded, 0, "never more trains than the run holds")
	assert_eq(close, 0, "trains well apart")
	return true


func test_timetable_trains_keep_their_id_and_leave_after_their_run() -> bool:
	var line := RailLine.from_data(_line_data())
	var at := line.trains(4000)[0]
	var later: RailLine.TrainAt = null
	for t in line.trains(4010):
		if t.id == at.id:
			later = t
	assert_true(later != null, "still on the line 10 s later")
	assert_true(later.state.s >= at.state.s, "further along")
	var departure := int(at.id.split("#")[1])
	assert_true(line.train(departure, line.offset + departure * line.headway + line.profile.duration + 1) == null, "gone after its run")
	return true


func test_timetable_predicts_the_next_arrival() -> bool:
	var line := RailLine.from_data(_line_data())
	var clock := 5000.0
	var wait := line.next_arrival(1, clock)
	assert_true(wait >= 0.0 and wait <= line.headway, "within a headway")
	var standing := false
	for t in line.trains(clock + wait + 1):
		if t.state.stopped_at == 1:
			standing = true
	assert_true(standing, "a train stands there when predicted")
	assert_eq(line.next_arrival(1, clock + wait + 5), 0.0, "zero while it stands")
	return true


func test_network_lines_and_stations_from_the_file() -> bool:
	var network := RailNetwork.from_data({"attribution": "©", "tracks": [], "lines": [_line_data()], "stations": []})
	assert_eq(network.line("south").destination(), "Tambaram", "destination")
	assert_true(network.trains(5000).size() > 0, "trains running")
	return true


func _standing(line: RailLine, index: int, extra: float = 2.0) -> RailLine.TrainAt:
	var departure := 3
	var clock := line.offset + departure * line.headway + line.profile.arrivals[index] + extra
	return line.train(departure, clock)


func test_boarding_finds_the_stop_whose_platform_the_player_is_on() -> bool:
	var line := RailLine.from_data(_line_data())
	var platform := RailRules.platform_of(line, line.stops[1])
	assert_eq(RailRules.stop_at(line, platform.point()), 1, "on the platform")
	assert_eq(RailRules.stop_at(line, platform.point() + Vector2(0, 200)), -1, "200 m along: none")
	assert_eq(RailRules.stop_at(line, Vector2(40, 2200)), -1, "40 m off: none")
	return true


func test_boarding_a_standing_train_with_a_ticket() -> bool:
	var line := RailLine.from_data(_line_data())
	var ok := RailRules.boarding(_standing(line, 1), 1, 100)
	assert_true(ok.ok and ok.fare == RailRules.FARE, "boards for the fare")
	assert_false(RailRules.boarding(_standing(line, 1), 0, 100).ok, "not at another stop")
	assert_contains(RailRules.boarding(_standing(line, 1), 1, 2).reason, "₹", "no money: the fare")
	assert_contains(RailRules.boarding(_standing(line, 1, RunProfile.MotionSpec.emu().dwell - 0.5), 1, 100).reason, "closing", "doors closing")
	return true


func test_boarding_refused_when_the_next_stop_is_beyond_the_map() -> bool:
	var line := RailLine.from_data(_line_data())
	var last := _standing(line, 2)
	assert_contains(RailRules.boarding(last, 2, 100).reason, "Tambaram", "beyond the map towards Tambaram")
	assert_true(RailRules.ride_ends_at(last), "the ride ends at the last stop on the map")
	assert_false(RailRules.ride_ends_at(_standing(line, 1)), "not before")
	assert_true(RailRules.can_step_off(_standing(line, 1)), "step off while standing")
	var moving := line.train(3, line.offset + 3 * line.headway + line.profile.arrivals[1] + RunProfile.MotionSpec.emu().dwell + 20)
	assert_false(RailRules.can_step_off(moving), "not while moving")
	return true


func _stopped(dwell_left: float) -> RunProfile.TrainState:
	var st := RunProfile.TrainState.new()
	st.stopped_at = 0
	st.dwell_left = dwell_left
	st.dwell_total = 30.0
	st.next_stop = 1
	return st


func test_doors_shut_while_moving_and_open_mid_stop() -> bool:
	var dwell := RunProfile.MotionSpec.emu().dwell
	var moving := RunProfile.TrainState.new()
	moving.s = 10
	moving.speed = 5
	assert_eq(RailRules.door_openness(moving, dwell), 0.0, "shut while moving")
	assert_eq(RailRules.door_openness(_stopped(dwell / 2.0), dwell), 1.0, "open mid stop")
	return true


func test_doors_open_after_stopping_and_shut_before_leaving() -> bool:
	var dwell := RunProfile.MotionSpec.emu().dwell
	assert_eq(RailRules.door_openness(_stopped(dwell), dwell), 0.0, "shut on arrival")
	assert_near(RailRules.door_openness(_stopped(dwell - RailRules.DOOR_DELAY - RailRules.DOOR_SLIDE / 2.0), dwell), 0.5, 1e-5, "half open mid slide")
	assert_eq(RailRules.door_openness(_stopped(RailRules.DOOR_DELAY), dwell), 0.0, "shut before leaving")
	assert_eq(RailRules.door_openness(_stopped(0), dwell), 0.0, "shut at the end")
	return true


func test_doors_still_open_at_the_last_ticket() -> bool:
	var dwell := RunProfile.MotionSpec.emu().dwell
	assert_eq(RailRules.door_openness(_stopped(1.5), dwell), 1.0, "open at 1.5 s left")
	assert_true(RailRules.door_openness(_stopped(1.4), dwell) < 1.0, "closing at 1.4 s")
	return true


func test_doors_move_smoothly_through_a_real_run() -> bool:
	var profile := RunProfile.new(3000.0, PackedFloat64Array([1000.0, 2000.0]))
	var last := 0.0
	var most := 0.0
	var jumps := 0
	var t := 0.0
	while t < profile.duration:
		var amount := RailRules.door_openness(profile.state(t), 30.0)
		if absf(amount - last) >= 0.08:
			jumps += 1
		last = amount
		most = maxf(most, amount)
		t += 0.05
	assert_eq(jumps, 0, "no jumps")
	assert_eq(most, 1.0, "fully open at some point")
	return true
