extends TestCase
## Driving from the cab (the owner's prototype rules, G-326) and level crossings (G-327).


func _line() -> RailLine:
	return RailLine.from_data({
		"id": "south", "name": "Test", "points": [0, 0, 0, 6000],
		"stops": [
			{"id": "a", "name": "Alpha", "nameTa": "அ", "s": 1000, "side": 1, "width": 4},
			{"id": "b", "name": "Bravo", "nameTa": "ப", "s": 3000, "side": 1, "width": 4},
		],
		"from": {"name": "North", "beyond": true}, "to": {"name": "South", "beyond": true},
		"headwayMinutes": 8, "offsetMinutes": 0,
	})


## Runs the cab for `seconds` at 60 Hz.
func _run(cab: CabDrive, seconds: float) -> void:
	for i in roundi(seconds * 60.0):
		cab.step(1.0 / 60.0)


func test_lever_has_the_prototypes_notches() -> bool:
	var cab := CabDrive.new(_line(), 10.0)
	assert_eq(cab.notch_name(), "OFF", "starts at OFF")
	cab.notch_up()
	assert_eq(cab.notch_name(), "P1", "up to P1")
	cab.set_notch(99)
	assert_eq(cab.notch_name(), "P4", "top is P4")
	cab.emergency()
	assert_eq(cab.notch_name(), "EMG", "emergency")
	cab.notch_down()
	assert_eq(cab.notch_name(), "EMG", "nothing below EMG")
	assert_eq(CabDrive.NOTCHES, ["EMG", "B3", "B2", "B1", "OFF", "P1", "P2", "P3", "P4"] as Array[String], "all nine")
	return true


func test_power_moves_the_train_and_the_effort_ramps() -> bool:
	var cab := CabDrive.new(_line(), 10.0)
	cab.set_notch(8)
	cab.step(1.0 / 60.0)
	assert_true(cab.effort < 0.1, "effort follows the lever, not at once")
	_run(cab, 10.0)
	assert_true(cab.v > 4.0 and cab.s > 30.0, "moving after 10 s of P4 (%.1f m/s)" % cab.v)
	cab.set_notch(CabDrive.OFF)
	var v := cab.v
	_run(cab, 5.0)
	assert_true(cab.v < v and cab.v > v - 1.5, "coasting slows a little (resistance)")
	cab.emergency()
	_run(cab, 20.0)
	assert_eq(cab.v, 0.0, "emergency stops it")
	return true


## Drives to the first stop with a simple controller: power, then brake to land on `aim` metres
## from the mark. Returns the cab, standing.
func _drive_to_first_stop(aim: float) -> CabDrive:
	var cab := CabDrive.new(_line(), 200.0)
	var guard := 0
	while cab.stops_made == 0 and guard < 60 * 400:
		guard += 1
		var left := cab.to_mark() + aim
		var need := cab.v * cab.v / (2.0 * 0.55)
		if left <= need + 1.0:
			cab.set_notch(2 if cab.v > 0.5 else 3)
		elif cab.kmh() < cab.limit() - 8.0:
			cab.set_notch(7)
		else:
			cab.set_notch(CabDrive.OFF)
		if cab.v < 0.25 and left < 2.0:
			cab.set_notch(1)
		cab.step(1.0 / 60.0)
	return cab


func test_a_stop_on_the_mark_scores_and_opens_the_doors() -> bool:
	var cab := _drive_to_first_stop(0.0)
	assert_eq(cab.stops_made, 1, "stopped at Alpha")
	assert_true(cab.doors_open, "doors open")
	assert_true(cab.score >= 25, "scored %d" % cab.score)
	assert_eq(cab.aspect(0), &"red", "the starter is red while the doors are open")
	# Interlock: power does nothing with the doors open.
	var s := cab.s
	cab.set_notch(8)
	_run(cab, 2.0)
	assert_near(cab.s, s, 0.01, "doors interlock holds the train")
	_run(cab, CabDrive.DOOR_DWELL)
	assert_false(cab.doors_open, "doors close after the dwell")
	assert_eq(cab.next, 1, "Bravo is next")
	_run(cab, 5.0)
	assert_true(cab.v > 0.5, "then power moves it")
	return true


func test_overrunning_the_platform_costs_points() -> bool:
	var cab := _drive_to_first_stop(35.0)
	assert_eq(cab.stops_made, 1, "stopped")
	assert_true(cab.to_mark() < -25.0, "past the mark (%.1f m)" % -cab.to_mark())
	assert_true(cab.score <= -40, "overran: %d" % cab.score)
	return true


func test_missing_a_stop_and_overspeed_cost_points() -> bool:
	var cab := CabDrive.new(_line(), 200.0)
	cab.set_notch(8)
	_run(cab, 90.0)
	assert_true(cab.s > 1070.0, "ran past Alpha")
	assert_true(cab.served.has(0) and cab.next == 1, "Alpha counted as missed")
	assert_true(cab.score <= -60 - 10, "missed (-60) and over the 40 km/h limit there (%d)" % cab.score)
	return true


func test_speed_limits_follow_the_stations() -> bool:
	var cab := CabDrive.new(_line(), 10.0)
	assert_eq(cab.limit_at(1000.0), 40.0, "40 at a station")
	assert_eq(cab.limit_at(1400.0), 60.0, "60 near one")
	assert_eq(cab.limit_at(2000.0), 80.0, "80 between")
	return true


func test_a_train_ahead_turns_the_starter_red_and_passing_it_costs() -> bool:
	var cab := CabDrive.new(_line(), 900.0, 8.0)
	cab.ahead = PackedFloat64Array([1200.0])
	assert_eq(cab.aspect(0), &"red", "red with a train 200 m beyond it")
	cab.ahead = PackedFloat64Array([1700.0])
	assert_eq(cab.aspect(0), &"yellow", "yellow with one 700 m beyond")
	cab.ahead = PackedFloat64Array([1200.0])
	cab.set_notch(6)
	_run(cab, 25.0)
	assert_true(cab.s > 1006.0, "ran through the signal")
	assert_true(cab.score <= -80, "signal passed at danger (%d)" % cab.score)
	return true


func _crossing_network() -> RailNetwork:
	return RailNetwork.from_data({
		"attribution": "©", "tracks": [], "stations": [],
		"lines": [{"id": "south", "name": "T", "points": [0, 0, 0, 4000], "stops": [], "from": {"name": "N", "beyond": true}, "to": {"name": "S", "beyond": true}, "headwayMinutes": 8, "offsetMinutes": 0}],
		"crossings": [{"id": "x", "x": 0, "z": 2000, "yaw": 0, "lines": [{"line": "south", "s": 2000}]}],
	})


func test_crossing_barriers_come_down_before_a_train_and_rise_after() -> bool:
	var net := _crossing_network()
	var crossing := net.crossings[0]
	var line := net.lines[0]
	# A train enters at 22 m/s; its front reaches s = 2000 at about (2000 - 45) / 22 s.
	var arrive := (2000.0 - LevelCrossing.HALF_TRAIN) / 22.0
	var clock := 10 * line.headway
	assert_eq(LevelCrossing.closed_amount(net, crossing, clock + arrive - 60.0), 0.0, "up a minute before")
	assert_true(LevelCrossing.closed_amount(net, crossing, clock + arrive - 32.0) > 0.0, "coming down 32 s before")
	assert_eq(LevelCrossing.closed_amount(net, crossing, clock + arrive - 20.0), 1.0, "down 20 s before")
	assert_eq(LevelCrossing.closed_amount(net, crossing, clock + arrive + 2.0), 1.0, "down while it passes")
	assert_eq(LevelCrossing.closed_amount(net, crossing, clock + arrive + 15.0), 0.0, "up once its rear is past")
	var extra: Dictionary[String, float] = {"south": 1900.0}
	assert_eq(LevelCrossing.closed_amount(net, crossing, clock + arrive - 60.0, extra), 1.0, "down for the player's train near it")
	return true


## A train running at about 12 m/s on the open line, lever in P2, so it holds speed for a while.
func _cruising(vigilance: bool) -> CabDrive:
	var cab := CabDrive.new(_line(), 10.0, 12.0)
	cab.served[0] = true
	cab.next = 1
	cab.set_notch(6)
	cab.vigilance_on = vigilance
	cab.handle_held = false
	return cab


func test_vigilance_handle_is_off_unless_the_game_turns_it_on() -> bool:
	# The prototype's rules are untouched: nobody holds a handle in the old tests.
	var cab := _cruising(false)
	_run(cab, 40.0)
	assert_false(cab.warning or cab.tripped, "no warning, no brake")
	assert_true(cab.v > 5.0, "still running (%.1f m/s)" % cab.v)
	assert_eq(cab.vigilance_left(), 0.0, "and nothing counts down")
	return true


func test_a_held_handle_keeps_the_train_running() -> bool:
	var cab := _cruising(true)
	cab.set_handle(true)
	_run(cab, 30.0)
	assert_false(cab.warning or cab.tripped, "held: nothing happens")
	assert_eq(cab.released_for, 0.0, "the count stays at zero")
	return true


func test_let_go_for_eight_seconds_at_speed_warns_then_brakes() -> bool:
	var cab := _cruising(true)
	var events: Array[String] = []
	cab.vigilance_warning.connect(func() -> void: events.append("warning"))
	cab.vigilance_tripped.connect(func() -> void: events.append("tripped"))
	var texts: Array[String] = []
	cab.message.connect(func(t: String) -> void: texts.append(t))
	var warned_at := -1.0
	var tripped_at := -1.0
	for i in 60 * 30:
		cab.step(1.0 / 60.0)
		if warned_at < 0.0 and cab.warning:
			warned_at = cab.released_for
		if tripped_at < 0.0 and cab.tripped:
			tripped_at = cab.released_for
	assert_true(warned_at > CabDrive.VIGILANCE_LIMIT and warned_at < CabDrive.VIGILANCE_LIMIT + 0.1, "the warning comes just after 8 s (%.2f s)" % warned_at)
	assert_true(tripped_at > CabDrive.VIGILANCE_LIMIT + CabDrive.WARNING_GRACE and tripped_at < CabDrive.VIGILANCE_LIMIT + CabDrive.WARNING_GRACE + 0.1, "the brake three seconds later (%.2f s)" % tripped_at)
	assert_eq(events, ["warning", "tripped"] as Array[String], "once each, in order")
	assert_true(texts.any(func(t: String) -> bool: return t.contains("hold the handle")), "the warning has words for the toast")
	assert_eq(cab.v, 0.0, "the emergency brake stopped the train")
	assert_false(cab.tripped, "and the trip clears once it stands")
	assert_eq(cab.notch_name(), "EMG", "the lever stays at EMG until the driver moves it")
	return true


func test_taking_hold_again_in_time_cancels_the_warning() -> bool:
	var cab := _cruising(true)
	_run(cab, 7.0)
	assert_false(cab.warning, "seven seconds is allowed")
	assert_true(cab.vigilance_left() > 0.5 and cab.vigilance_left() < 1.5, "about a second left (%.2f)" % cab.vigilance_left())
	_run(cab, 2.0)
	assert_true(cab.warning and not cab.tripped, "warning sounds")
	cab.set_handle(true)
	cab.step(1.0 / 60.0)
	assert_false(cab.warning, "holding it again silences the warning")
	assert_eq(cab.released_for, 0.0, "and starts the count over")
	cab.set_handle(false)
	_run(cab, 7.0)
	assert_false(cab.warning or cab.tripped, "another seven seconds is allowed again")
	return true


func test_standing_or_creeping_needs_no_handle() -> bool:
	var cab := CabDrive.new(_line(), 10.0, 0.0)
	cab.vigilance_on = true
	cab.handle_held = false
	_run(cab, 60.0)
	assert_false(cab.warning or cab.tripped, "a standing train never warns")
	var slow := CabDrive.new(_line(), 10.0, 0.8)
	slow.vigilance_on = true
	slow.handle_held = false
	slow.set_notch(5)
	slow.effort = 0.0
	slow.v = 0.8
	for i in 60 * 3:
		slow.v = 0.8
		slow.step(1.0 / 60.0)
	assert_false(slow.warning, "under 1 m/s needs no handle either")
	return true


func test_the_vigilance_brake_holds_the_lever_and_adds_no_points() -> bool:
	var with_handle := _cruising(true)
	with_handle.set_handle(true)
	var without := _cruising(true)
	_run(with_handle, 5.0)
	_run(without, 5.0)
	assert_eq(with_handle.score, without.score, "the handle changes no score")
	_run(without, 15.0)
	assert_true(without.tripped or without.v == 0.0, "tripped or stopped by now")
	without.set_notch(8)
	without.step(1.0 / 60.0)
	if without.tripped:
		assert_eq(without.notch_name(), "EMG", "moving the lever while tripped changes nothing")
	return true
