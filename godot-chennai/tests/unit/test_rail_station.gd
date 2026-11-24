extends TestCase
## Stations, boards and platform crowds, translated from `packages/rail/src/station.test.ts`.


func test_arriving_slows_all_the_way_to_a_stop_on_the_mark() -> bool:
	var profile := RunProfile.new(3000.0, PackedFloat64Array([1000.0, 2000.0]))
	var spec := RunProfile.MotionSpec.emu()
	var arrive := profile.arrivals[0]
	var last := INF
	var rising := 0
	var t := arrive - 20.0
	while t <= arrive:
		var st := profile.state(t)
		if st.speed > last + 1e-9:
			rising += 1
		last = st.speed
		t += 0.5
	assert_eq(rising, 0, "speed falls every sample")
	var at := profile.state(arrive)
	assert_eq(at.speed, 0.0, "0 on the mark")
	assert_near(at.s, 1000.0, 1e-6, "on the mark")
	assert_eq(at.stopped_at, 0, "stopped")
	var before := profile.state(arrive - 1)
	assert_true(before.speed > 0.0 and before.speed < 1.5, "creeping in just before")
	assert_true(before.s < 1000.0, "short of the mark")
	assert_near(profile.state(arrive - 2).speed - before.speed, spec.brake, 1e-6, "steady braking")
	return true


func test_stands_for_the_dwell_then_pulls_away_faster_and_faster() -> bool:
	var profile := RunProfile.new(3000.0, PackedFloat64Array([1000.0, 2000.0]))
	var spec := RunProfile.MotionSpec.emu()
	var arrive := profile.arrivals[0]
	var t := arrive
	while t < arrive + spec.dwell - 0.01:
		var st := profile.state(t)
		assert_true(st.speed == 0.0 and absf(st.s - 1000.0) < 1e-6, "standing at %.0f" % t)
		t += 1.0
	var last := 0.0
	t = arrive + spec.dwell + 0.5
	while t < arrive + spec.dwell + 15.0:
		var st := profile.state(t)
		assert_true(st.stopped_at == -1 and st.speed > last, "faster at %.1f" % t)
		last = st.speed
		t += 0.5
	assert_near(profile.state(arrive + spec.dwell + 5).s - 1000.0, 0.5 * spec.accel * 25.0, 1e-4, "s grows with t²")
	return true


## Two directions: the down line has a side platform at A and an island at B shared with the up line.
func _network() -> RailNetwork:
	return RailNetwork.from_data({
		"attribution": "© OpenStreetMap contributors",
		"tracks": [
			{"id": 1, "kind": "main", "points": [0, 0, 0, 3000]},
			{"id": 2, "kind": "main", "points": [-16, 0, -16, 3000]},
			{"id": 3, "kind": "main", "points": [10, 0, 10, 3000]},
		],
		"lines": [
			{"id": "down", "name": "Down", "points": [0, 0, 0, 3000],
				"stops": [
					{"id": "a", "name": "Alpha", "nameTa": "அ", "s": 1000, "side": 1, "width": 4},
					{"id": "b", "name": "Bravo", "nameTa": "ப", "s": 2000, "side": -1, "width": 12.5},
				],
				"from": {"name": "North", "beyond": true}, "to": {"name": "South", "beyond": true}, "headwayMinutes": 8, "offsetMinutes": 0},
			{"id": "up", "name": "Up", "points": [-16, 3000, -16, 0],
				"stops": [
					{"id": "b", "name": "Bravo", "nameTa": "ப", "s": 1000, "side": -1, "width": 12.5, "twin": true},
					{"id": "a", "name": "Alpha", "nameTa": "அ", "s": 2000, "side": 1, "width": 4},
				],
				"from": {"name": "South", "beyond": true}, "to": {"name": "North", "beyond": true}, "headwayMinutes": 8, "offsetMinutes": 3},
		],
		"stations": [
			{"id": "a", "name": "Alpha", "nameTa": "அ", "nameHi": "अ", "x": 4, "z": 1000},
			{"id": "b", "name": "Bravo", "nameTa": "ப", "x": -8, "z": 2000},
		],
	})


func _platform(all: Array[StationLayout.Platform], key: String) -> StationLayout.Platform:
	for p in all:
		if p.key == key:
			return p
	return null


func test_one_platform_per_stop_an_island_once_for_both_directions() -> bool:
	var platforms := StationLayout.platforms(_network())
	var keys: Array[String] = []
	for p in platforms:
		keys.append(p.key)
	assert_eq(keys, ["down:0", "down:1", "up:1"] as Array[String], "keys")
	var island := _platform(platforms, "down:1")
	assert_true(island.island, "island")
	assert_eq(island.services.size(), 2, "two services")
	assert_eq([island.services[0].line.id, island.services[0].number, island.services[1].line.id, island.services[1].number], ["down", 1, "up", 2], "numbered 1 and 2")
	var up := island.services[1]
	assert_near(up.track, -16.0, 0.5, "up track 16 m to the right")
	assert_eq(up.inward, 1, "its edge faces back in")
	assert_near(up.edge, -14.25, 0.05, "edge")
	return true


func test_the_fob_spans_every_track_nearby_and_the_office_is_beyond() -> bool:
	var side := _platform(StationLayout.platforms(_network()), "down:0")
	assert_true(side.fob_from < -16.0, "past the other direction")
	assert_true(side.fob_to > 10.0, "past the track behind")
	assert_true(side.office_w > side.fob_to, "office beyond the landing")
	assert_eq(side.exits.size(), 3, "three exits")
	return true


func test_numbers_the_other_directions_side_platform_2() -> bool:
	assert_eq(_platform(StationLayout.platforms(_network()), "up:1").services[0].number, 2, "PF 2")
	return true


func test_board_lists_the_next_trains_soonest_first_both_directions() -> bool:
	var network := _network()
	var island := _platform(StationLayout.platforms(network), "down:1")
	var clock := 4.0 * 3600.0
	var rows := StationLayout.departure_rows(island, clock)
	assert_eq(rows.size(), 3, "three rows")
	for i in range(1, rows.size()):
		assert_true(rows[i].wait >= rows[i - 1].wait, "sorted")
	var dests: Dictionary[String, bool] = {}
	for r in rows:
		dests[r.destination] = true
	assert_true(dests.has("South") and dests.has("North") and dests.size() == 2, "both directions")
	assert_near(rows[0].wait, minf(network.line("down").next_arrival(1, clock), network.line("up").next_arrival(0, clock)), 1e-6, "agrees with the timetable")
	return true


func test_board_says_when_a_train_stands_at_the_platform() -> bool:
	var network := _network()
	var island := _platform(StationLayout.platforms(network), "down:1")
	var down := network.line("down")
	var clock := down.offset + 10 * down.headway + down.profile.arrivals[1] + 5.0
	var rows := StationLayout.departure_rows(island, clock)
	assert_eq([rows[0].destination, rows[0].platform, rows[0].wait, rows[0].status], ["South", 1, 0.0, "On platform"], "first row")
	var text := StationLayout.board_text(island, clock, 17.5)
	assert_eq(text[0], "BRAVO  17:30", "header")
	assert_eq(text[1], "PF 1  SOUTH  ON PLATFORM", "row")
	return true


func test_board_words_the_status_by_the_wait() -> bool:
	assert_eq(StationLayout.board_status(0, true), "On platform", "standing")
	assert_eq(StationLayout.board_status(30, false), "Arriving", "30 s")
	assert_eq(StationLayout.board_status(55, false), "Due", "55 s")
	assert_eq(StationLayout.board_status(301, false), "6 min", "301 s")
	assert_eq(StationLayout.clock_text(9.25), "09:15", "09:15")
	assert_eq(StationLayout.clock_text(23.999), "23:59", "23:59")
	return true


func test_passengers_wait_in_rush_hours_far_more_than_at_night() -> bool:
	assert_true(StationCrowd.waiting_count(8.5) > StationCrowd.waiting_count(3) * 4, "rush vs night")
	assert_eq(StationCrowd.waiting_count(18), StationCrowd.MAX_WAITING, "18:00 full")
	assert_true(StationCrowd.waiting_count(3) >= 1, "at least one")
	assert_true(StationCrowd.waiting_count(12, 0.5) < StationCrowd.waiting_count(12, 1), "quieter station")
	var over := 0
	var h := 0.0
	while h < 24.0:
		if StationCrowd.waiting_count(h) > StationCrowd.MAX_WAITING:
			over += 1
		h += 0.25
	assert_eq(over, 0, "within the cap")
	return true


func test_passengers_board_up_to_the_cap_and_alight_a_few() -> bool:
	assert_eq(StationCrowd.passenger_flow(5, 100, "t#1", "s").x, 5, "all 5 board")
	assert_eq(StationCrowd.passenger_flow(50, 100, "t#1", "s").x, StationCrowd.MAX_BOARDING, "cap")
	var full := StationCrowd.passenger_flow(50, 400, "t#1", "s", 400)
	assert_eq(full.x, full.y, "full train takes as many as get off")
	var bad := 0
	for k in 50:
		var alight := StationCrowd.passenger_flow(10, 100, "t#%d" % k, "s").y
		if alight < 2 or alight > StationCrowd.MAX_ALIGHTING or StationCrowd.passenger_flow(3, 100, "t#%d" % k, "s").y != alight:
			bad += 1
	assert_eq(bad, 0, "between 2 and the cap, stable")
	assert_true(StationCrowd.passenger_flow(10, 1, "t#1", "s").y <= 1, "never more than on board")
	var load := StationCrowd.initial_load("down#7")
	assert_true(load >= StationCrowd.LOAD_MIN and load <= StationCrowd.LOAD_MAX, "load in range")
	return true


func test_hash_matches_the_typescript_hash() -> bool:
	# Values of crowd.ts hash01 computed with node for these keys (stable per key across games).
	assert_near(StationCrowd.hash01(""), 0.9921139925718307, 1e-12, "empty key")
	assert_near(StationCrowd.hash01("load:down#7"), 0.7117560252081603, 1e-12, "a train's load key")
	assert_near(StationCrowd.hash01("off:t#1:s"), 0.6872944864444435, 1e-12, "an alighting key")
	return true


func _spec() -> StationCrowd.Spec:
	var spec := StationCrowd.Spec.new()
	spec.half = 55.0
	var a := StationCrowd.Edge.new()
	a.w = 1.75
	a.inward = 1
	var b := StationCrowd.Edge.new()
	b.w = 14.0
	b.inward = -1
	spec.edges = [a, b]
	spec.exits = PackedFloat64Array([-54, 54, -16.7])
	spec.middle = 7.9
	spec.key = "test"
	return spec


func _train(open: float, dwell_left: float) -> StationCrowd.CrowdTrain:
	var t := StationCrowd.CrowdTrain.new()
	t.id = "down#3"
	t.service = 0
	for u: float in [-20.0, -10.0, 0.0, 10.0, 20.0]:
		t.doors.append(Vector2(u, 1.75))
	t.open = open
	t.dwell_left = dwell_left
	t.load = 120
	return t


func test_crowd_fills_then_a_stopped_train_takes_some_and_lets_others_off() -> bool:
	var crowd := StationCrowd.new(_spec())
	crowd.step(1.0 / 60.0, 20, [])
	assert_eq(crowd.waiting(), 20, "filled at once")
	var for_down := 0
	var off_deck := 0
	for p in crowd.people:
		if p.service == 0:
			for_down += 1
		if p.w <= 1.75 or p.w >= 14.0:
			off_deck += 1
	assert_eq(off_deck, 0, "everyone on the deck")
	crowd.step(1.0 / 60.0, 20, [_train(0.2, 29)])
	assert_eq(crowd.waiting(), 20, "doors shut: nobody moves")
	crowd.step(1.0 / 60.0, 20, [_train(1, 27)])
	var flow: StationCrowd.Flow = crowd.flows["down#3"]
	assert_eq(flow.board, mini(for_down, StationCrowd.MAX_BOARDING), "board count")
	assert_true(flow.alight > 0, "some get off")
	assert_eq(crowd.waiting(), 20 - flow.board, "boarders left the waiting")
	for i in 25 * 60:
		crowd.step(1.0 / 60.0, 20, [_train(1, 27 - i / 60.0)])
	assert_eq(flow.boarded, flow.board, "every boarder reached a door")
	assert_eq(flow.alighted, flow.alight, "every alighter got clear")
	assert_true(crowd.people.size() <= StationCrowd.MAX_ON_PLATFORM, "within the cap")
	return true


func test_crowd_sends_walkers_back_when_the_train_leaves() -> bool:
	var crowd := StationCrowd.new(_spec())
	crowd.step(1.0 / 60.0, 20, [])
	crowd.step(1.0 / 60.0, 20, [_train(1, 3)])
	assert_true(crowd.count(StationCrowd.BOARDING) > 0, "some walking to the doors")
	crowd.step(0.2, 20, [_train(1, 2.8)])
	crowd.step(1.0 / 60.0, 20, [])
	assert_eq(crowd.count(StationCrowd.BOARDING), 0, "back to waiting")
	for i in 90 * 60:
		crowd.step(1.0 / 60.0, 20, [])
	assert_eq(crowd.count(StationCrowd.ALIGHTING), 0, "the people off are gone")
	assert_eq(crowd.waiting(), 20, "back to its count")
	return true
