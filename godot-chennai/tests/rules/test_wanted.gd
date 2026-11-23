## Ports of `combat/src/Wanted.test.ts`: the 32 cases on `agent/police-tuning` (TD-28, which
## replaced two older cases on purpose) and the carjacking case from `agent/carjacking` (TD-30).
extends "res://tests/rules/rules_test.gd"

const C := Wanted.CRIMES


## Run the rules for `seconds` in 1/60 s steps, collecting the events.
func run(w: Wanted, seconds: float, seen: bool, held: bool = false, responding: bool = false) -> Array:
	var events: Array = []
	var t := 0.0
	while t < seconds:
		var e := w.update(1.0 / 60.0, seen, held, responding)
		if not e.is_empty():
			events.append(e)
		t += 1.0 / 60.0
	return events


func test_starts_at_zero_stars() -> bool:
	var w := Wanted.new()
	eq(w.stars, 0)
	eq(w.update(1, true, false), {})
	eq(w.seen, false)
	return true


func test_firing_a_gun_in_public_gives_one_star() -> bool:
	var w := Wanted.new()
	eq(w.report("gunfire"), {"type": "raised", "stars": 1, "crime": "gunfire"})
	eq(w.stars, 1)
	return true


func test_counts_a_burst_of_gunfire_once_and_again_after_a_pause() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	eq(w.report("gunfire"), {})
	eq(w.points, 1)
	run(w, float(C["gunfire"]["every"]) + 0.1, true)
	w.report("gunfire")
	eq(w.points, 2)
	return true


func test_keeps_firing_and_it_reaches_two_stars() -> bool:
	var w := Wanted.new()
	for i in 5:
		w.report("gunfire")
		run(w, float(C["gunfire"]["every"]) + 0.05, true)
	eq(w.stars, 2)
	return true


func test_one_or_two_knockdowns_give_no_star_a_third_soon_after_does() -> bool:
	var w := Wanted.new()
	eq(w.report("pedestrianInjured"), {})
	run(w, 3, false)
	eq(w.report("pedestrianInjured"), {})
	eq(w.stars, 0)
	run(w, 3, false)
	eq(w.report("pedestrianInjured"), {"type": "raised", "stars": 1, "crime": "pedestrianInjured"})
	return true


func test_a_few_punches_give_no_star_a_fight_with_several_does() -> bool:
	var w := Wanted.new()
	for i in 3:
		w.report("pedestrianAssaulted")
		run(w, float(C["pedestrianAssaulted"]["every"]) + 0.05, false)
	eq(w.stars, 0)
	w.report("pedestrianInjured")
	eq(w.stars, 1)
	return true


func test_heat_cools_off_while_not_wanted() -> bool:
	var w := Wanted.new()
	for i in 10:
		w.report("pedestrianInjured")
		eq(w.stars, 0)
		run(w, 30, false)
	lt(w.points, Wanted.STAR_AT[1])
	run(w, 60, false)
	eq(w.points, 0)
	return true


func test_once_wanted_each_incident_raises_heat_more() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	var before := w.points
	w.report("pedestrianInjured")
	eq(w.points - before, C["pedestrianInjured"]["points_wanted"])
	for i in 3:
		w.report("pedestrianInjured")
	eq(w.stars, 2)
	return true


func test_an_incident_the_police_see_gives_a_star_at_once() -> bool:
	var w := Wanted.new()
	eq(w.report("pedestrianAssaulted", true), {"type": "raised", "stars": 1, "crime": "pedestrianAssaulted"})
	var v := Wanted.new()
	v.report("pedestrianInjured", true)
	eq(v.stars, 1)
	return true


func test_killing_a_pedestrian_star_at_once_two_kills_two_seen_two() -> bool:
	var killed := Wanted.new()
	eq(killed.report("pedestrianKilled"), {"type": "raised", "stars": 1, "crime": "pedestrianKilled"})
	killed.report("pedestrianKilled")
	eq(killed.stars, 2)
	var seen_kill := Wanted.new()
	seen_kill.report("pedestrianKilled", true)
	eq(seen_kill.stars, 2)
	return true


func test_being_seen_does_not_change_crimes_that_give_a_star_anyway() -> bool:
	var w := Wanted.new()
	w.report("gunfire", true)
	eq(w.stars, 1)
	return true


func test_attacking_officers_escalates_fastest() -> bool:
	var w := Wanted.new()
	w.report("officerAssaulted")
	eq(w.stars, 2)
	w.report("officerDown")
	eq(w.stars, 3)
	w.report("officerDown")
	eq(w.stars, 4)
	w.report("officerDown")
	w.report("officerDown")
	eq(w.stars, 5)
	w.report("officerDown")
	eq(w.stars, Wanted.MAX_STARS)
	return true


func test_theft_ramming_or_shooting_a_police_car_give_a_star() -> bool:
	for crime: String in ["vehicleTheft", "policeCarRammed", "policeCarShot"]:
		var w := Wanted.new()
		w.report(crime)
		eq(w.stars, 1, crime)
	return true


func test_a_minimum_never_lowers_the_level() -> bool:
	var w := Wanted.new()
	w.set_level(4)
	w.report("vehicleTheft")
	eq(w.stars, 4)
	return true


func test_maps_points_to_stars_at_the_thresholds() -> bool:
	eq(Wanted.STAR_AT.map(func(p: float) -> int: return Wanted.stars_for(p)), [0, 1, 2, 3, 4, 5])
	eq(Wanted.stars_for(Wanted.STAR_AT[2] - 0.5), 1)
	eq(Wanted.stars_for(1000), 5)
	return true


func test_drops_a_star_after_not_being_seen_for_a_while() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	eq(run(w, Wanted.LOSE_AFTER[1] - 0.5, false), [])
	eq(w.stars, 1)
	eq(run(w, 1, false), [{"type": "lowered", "stars": 0}])
	eq(w.stars, 0)
	return true


func test_takes_longer_at_higher_levels_one_star_at_a_time() -> bool:
	var w := Wanted.new()
	w.set_level(3)
	var events := run(w, Wanted.LOSE_AFTER[3] + Wanted.LOSE_AFTER[2] + Wanted.LOSE_AFTER[1] + 1, false)
	eq(events, [{"type": "lowered", "stars": 2}, {"type": "lowered", "stars": 1}, {"type": "lowered", "stars": 0}])
	gt(Wanted.LOSE_AFTER[3], Wanted.LOSE_AFTER[1])
	return true


func test_a_sighting_starts_the_wait_again() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	run(w, Wanted.LOSE_AFTER[1] - 2, false)
	run(w, 0.1, true)
	eq(w.seen, true)
	eq(w.unseen_for, 0)
	run(w, Wanted.LOSE_AFTER[1] - 2, false)
	eq(w.stars, 1)
	return true


func test_does_not_decay_while_the_police_are_on_their_way() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	eq(run(w, Wanted.LOSE_AFTER[1] * 2, false, false, true), [])
	eq(w.stars, 1)
	eq(w.unseen_for, 0)
	run(w, Wanted.LOSE_AFTER[1] - 1, false)
	eq(w.stars, 1)
	eq(run(w, 2, false), [{"type": "lowered", "stars": 0}])
	return true


func test_never_decays_while_seen() -> bool:
	var w := Wanted.new()
	w.set_level(2)
	eq(run(w, 200, true), [])
	eq(w.stars, 2)
	return true


func test_a_new_crime_also_restarts_the_search() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	run(w, Wanted.LOSE_AFTER[1] - 1, false)
	run(w, C["gunfire"]["every"], false)
	eq(w.stars, 0)
	w.report("gunfire")
	eq(w.unseen_for, 0)
	return true


func test_arrests_a_player_kept_still_beside_an_officer() -> bool:
	var w := Wanted.new()
	w.report("gunfire")
	eq(run(w, Wanted.BUST_AFTER - 0.2, true, true), [])
	eq(run(w, 0.4, true, true), [{"type": "busted", "stars": 1, "fine": Wanted.BUST_FINE[1]}])
	eq(w.stars, 0)
	return true


func test_moving_away_starts_the_arrest_again() -> bool:
	var w := Wanted.new()
	w.set_level(2)
	run(w, Wanted.BUST_AFTER - 0.3, true, true)
	run(w, 0.1, true)
	eq(w.held_for, 0)
	eq(run(w, Wanted.BUST_AFTER - 0.3, true, true), [])
	eq(w.stars, 2)
	return true


func test_no_arrest_at_three_stars_and_above() -> bool:
	var w := Wanted.new()
	w.set_level(3)
	eq(run(w, 10, true, true), [])
	eq(w.stars, 3)
	return true


func test_the_fine_grows_with_the_level() -> bool:
	for s in range(2, Wanted.MAX_STARS + 1):
		gt(Wanted.BUST_FINE[s], Wanted.BUST_FINE[s - 1])
	return true


func test_caps_cars_and_officers_and_arms_them_from_three_stars() -> bool:
	eq(Wanted.police_units(0), {"cars": 0, "officers": 0, "armed": false, "ram": false})
	eq(Wanted.police_units(1)["cars"], 1)
	eq(Wanted.police_units(2)["armed"], false)
	match_obj(Wanted.police_units(3), {"armed": true, "ram": true})
	for s in range(1, 6):
		ge(Wanted.police_units(s)["cars"], Wanted.police_units(s - 1)["cars"])
		ge(Wanted.police_units(s)["officers"], Wanted.police_units(s - 1)["officers"])
	le(Wanted.police_units(5)["cars"], 3)
	le(Wanted.police_units(5)["officers"], 4)
	eq(Wanted.police_units(99), Wanted.police_units(5))
	return true


func test_no_new_jobs_from_two_stars() -> bool:
	eq(Wanted.jobs_allowed(0), true)
	eq(Wanted.jobs_allowed(1), true)
	eq(Wanted.jobs_allowed(2), false)
	eq(Wanted.jobs_allowed(5), false)
	return true


func test_names_police_groups() -> bool:
	eq(Wanted.is_police_group("police:3"), true)
	eq(Wanted.is_police_group("thieves"), false)
	return true


func test_the_players_own_vehicle_is_never_theft() -> bool:
	eq(Wanted.is_vehicle_theft({"id": "car-start", "kind": "car"}, ["car-start"], [], {}), false)
	return true


func test_someone_elses_parked_car_is_theft() -> bool:
	eq(Wanted.is_vehicle_theft({"id": "car-3", "kind": "car"}, ["car-start"], [], {}), true)
	return true


func test_a_jobs_vehicle_is_not_while_the_job_asks_for_that_kind() -> bool:
	eq(Wanted.is_vehicle_theft({"id": "ambulance", "kind": "ambulance"}, ["car-start"], ["ambulance"], {}), false)
	eq(Wanted.is_vehicle_theft({"id": "ambulance", "kind": "ambulance"}, ["car-start"], [], {}), true)
	return true


func test_theft_is_reported_once_per_vehicle() -> bool:
	eq(Wanted.is_vehicle_theft({"id": "car-3", "kind": "car"}, ["car-start"], [], {"car-3": true}), false)
	return true


func test_officers_killed_while_out_are_gone_from_the_crew() -> bool:
	eq(Wanted.crew_left(2, 2, 2), {"crew": 2, "out": 2})
	eq(Wanted.crew_left(2, 2, 1), {"crew": 1, "out": 1})
	eq(Wanted.crew_left(2, 2, 0), {"crew": 0, "out": 0})
	eq(Wanted.crew_left(2, 1, 0), {"crew": 1, "out": 0})
	return true


func test_a_car_lets_out_only_the_crew_it_still_has() -> bool:
	eq(Wanted.officers_to_deploy(2, 3, 0), 2)
	eq(Wanted.officers_to_deploy(1, 3, 0), 1)
	eq(Wanted.officers_to_deploy(0, 5, 0), 0)
	eq(Wanted.officers_to_deploy(2, 1, 1), 1)
	eq(Wanted.officers_to_deploy(2, 1, 2), 0)
	return true


func test_carjacking_gives_a_star_weighs_more_and_two_make_two() -> bool:
	var w := Wanted.new()
	eq(w.report("carjacking"), {"type": "raised", "stars": 1, "crime": "carjacking"})
	gt(C["carjacking"]["points"], C["vehicleTheft"]["points"])
	eq(w.report("carjacking"), {"type": "raised", "stars": 2, "crime": "carjacking"})
	return true
