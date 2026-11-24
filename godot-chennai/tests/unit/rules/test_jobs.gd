## Ports of `missions/src/jobs.test.ts` (15 cases) and `reputation.test.ts` (1 case).
extends "res://tests/unit/rules/rules_test.gd"

const S := JobData.Stop
const J := JobData.Job


func _ambulance() -> JobData.Job:
	var j := J.make("amb", "ambulance", "ambulance", [S.make("Pick up the patient", 100, 0, 6, 2), S.make("Drive to the hospital", 300, 0, 8)], 100, 1000, 150)
	j.max_bumps = 3
	return j


func _bus() -> JobData.Job:
	var j := J.make("bus", "bus", "bus", [S.make("Stop 1", 10, 0, 6, 1, 5), S.make("Stop 2", 20, 0, 6, 1, 6)], 60, 1000, 100)
	j.min_reputation = 55
	return j


## Step the runner for `seconds` at one place, collecting the event types.
func hold(runner: JobRunner, seconds: float, x: float, mode: String = "ambulance", speed: float = 0.0, z: float = 0.0) -> Array:
	var out: Array = []
	var t := 0.0
	while t < seconds:
		out.append_array(types(runner.update(0.1, x, z, mode, speed)))
		t += 0.1
	return out


func test_starts_the_clock_only_in_the_jobs_vehicle() -> bool:
	var runner := JobRunner.new()
	eq(types(runner.accept(_ambulance())), ["accepted"])
	eq(hold(runner, 5, 0, "foot"), [])
	is_nil(runner.seconds_left())
	eq(types(runner.update(0.1, 0, 0, "ambulance", 0)), ["started"])
	near(runner.seconds_left(), 99.9, 5)
	return true


func test_needs_the_vehicle_stopped_in_the_marker_for_the_dwell() -> bool:
	var runner := JobRunner.new()
	runner.accept(_ambulance())
	runner.update(0.1, 0, 0, "ambulance", 0)
	eq(hold(runner, 3, 100, "ambulance", 5), [])
	eq(runner.stop_number(), 0)
	hold(runner, 1, 100)
	gt(runner.dwell_left(), 0)
	eq(runner.stop_number(), 0)
	ok(hold(runner, 1.2, 100).has("stop"))
	eq(runner.stop().label, "Drive to the hospital")
	return true


func test_pays_more_for_a_fast_smooth_run() -> bool:
	var runner := JobRunner.new()
	runner.accept(_ambulance())
	runner.update(0.1, 0, 0, "ambulance", 0)
	hold(runner, 2.2, 100)
	var events := runner.update(0.1, 300, 0, "ambulance", 0)
	eq(types(events).back(), "completed")
	var result: Dictionary = events.back()["result"]
	gt(result["pay"], 1150)
	eq(result["stars"], 5)
	eq(runner.reputation(), JobRunner.START_REPUTATION + 3)
	is_nil(runner.job())
	eq(runner.record()["best"]["amb"], result["pay"])
	return true


func test_cuts_pay_for_bumps_and_fails_after_too_many() -> bool:
	var runner := JobRunner.new()
	runner.accept(_ambulance())
	eq(runner.bump(), [])
	runner.update(0.1, 0, 0, "ambulance", 0)
	runner.bump()
	runner.bump()
	eq(types(runner.bump()), ["bump", "failed"])
	is_nil(runner.job())
	eq(runner.reputation(), JobRunner.START_REPUTATION - 5)
	return true


func test_fails_when_time_runs_out_and_the_game_goes_on() -> bool:
	var runner := JobRunner.new()
	runner.accept(_ambulance())
	runner.update(0.1, 0, 0, "ambulance", 0)
	var events := runner.update(200, 0, 0, "ambulance", 0)
	match_obj(events.back(), {"type": "failed", "reason": "Out of time", "fine": 150, "reputation": -5})
	is_nil(runner.job())
	eq(runner.accept(_ambulance()).size(), 1)
	return true


func test_locks_jobs_behind_reputation_and_counts_late_stops() -> bool:
	var runner := JobRunner.new({"reputation": 40})
	eq(runner.available(_bus()), {"ok": false, "reason": "Needs reputation 55"})
	eq(runner.accept(_bus()), [])
	var trusted := JobRunner.new({"reputation": 60})
	trusted.accept(_bus())
	trusted.update(0.1, 0, 0, "bus", 0)
	hold(trusted, 1.2, 10, "bus")
	hold(trusted, 6, 0, "bus")
	ok(hold(trusted, 1.2, 20, "bus").has("completed"))
	is_nil(trusted.job())
	eq(trusted.record()["done"], 1)
	eq(trusted.reputation(), 60 + 4 - 2)
	return true


func test_quitting_counts_as_a_failure() -> bool:
	var runner := JobRunner.new()
	runner.accept(_ambulance())
	eq(runner.available(_ambulance())["ok"], false)
	match_obj(runner.quit()[0], {"type": "failed", "reason": "Job abandoned"})
	match_obj(runner.record(), {"failed": 1, "done": 0})
	return true


func test_ignores_damaged_saved_records() -> bool:
	var runner := JobRunner.new({"reputation": NAN, "done": -3})
	eq(runner.reputation(), JobRunner.START_REPUTATION)
	eq(runner.jobs_done(), 0)
	return true


# Evening hours, start radius and the avoid zone ----------------------------------------------

func _jam() -> JobData.AvoidZone:
	var z := JobData.AvoidZone.new()
	z.name = "Anna Salai"
	z.grace = 10
	for x: float in [400, 425, 450, 475, 500, 525, 550, 575, 600]:
		z.points.append({"x": x, "z": 0.0, "radius": 12.0})
	return z


func _evening() -> JobData.Job:
	var j := J.make("evening", "cab", "car", [S.make("Pick up your friend", 0, 0, 8, 1), S.make("Drop at the beach", 1000, 0, 8, 1)], 600, 1000, 100)
	j.hours = {"from": 16.0, "to": 20.5}
	j.avoid = _jam()
	j.start_radius = 300
	return j


func _evening_run(on_jam: float) -> Dictionary:
	var runner := JobRunner.new()
	runner.accept(_evening(), 17)
	runner.update(0.1, 0, 0, "car", 0)
	hold(runner, 1.2, 0, "car")
	var t := 0.0
	while t < on_jam - 1e-9:
		runner.update(0.1, 500, 0, "car", 3)
		t += 0.1
	var events: Array = []
	t = 0.0
	while t < 1.3:
		events.append_array(runner.update(0.1, 1000, 0, "car", 0))
		t += 0.1
	for e: Dictionary in events:
		if e["type"] == "completed":
			return e["result"]
	return {}


func test_evening_is_open_inside_the_window_also_across_midnight() -> bool:
	var h: Dictionary = _evening().hours
	eq(JobRunner.open_at({}, 3), true)
	eq(JobRunner.open_at(h, 15.9), false)
	eq(JobRunner.open_at(h, 16), true)
	eq(JobRunner.open_at(h, 20.4), true)
	eq(JobRunner.open_at(h, 20.5), false)
	eq(JobRunner.open_at({"from": 22.0, "to": 2.0}, 23), true)
	eq(JobRunner.open_at({"from": 22.0, "to": 2.0}, 1), true)
	eq(JobRunner.open_at({"from": 22.0, "to": 2.0}, 12), false)
	eq(JobRunner.open_at(h, 24 + 17), true)
	eq(JobRunner.hours_text({"from": 16.0, "to": 20.5}), "16:00–20:30")
	return true


func test_board_offers_the_evening_job_only_in_the_evening() -> bool:
	var runner := JobRunner.new()
	eq(runner.available(_evening(), 9), {"ok": false, "reason": "Offered 16:00–20:30 only"})
	eq(runner.accept(_evening(), 9), [])
	eq(runner.available(_evening(), 18), {"ok": true})
	eq(runner.available(_ambulance(), 3), {"ok": true})
	eq(types(runner.accept(_evening(), 18)), ["accepted"])
	return true


func test_start_radius_makes_the_drive_there_free() -> bool:
	var runner := JobRunner.new()
	runner.accept(_evening(), 17)
	eq(hold(runner, 5, -2000, "car"), [])
	eq(runner.started(), false)
	eq(types(runner.update(0.1, -250, 0, "car", 0)), ["started"])
	return true


func test_avoid_zone_tells_when_a_point_is_on_the_road() -> bool:
	eq(JobRunner.inside_zone(_jam(), 500, 8), true)
	eq(JobRunner.inside_zone(_jam(), 510, 20), false)
	eq(JobRunner.inside_zone(_jam(), 300, 0), false)
	return true


func test_avoid_bonus_within_grace_and_cuts_beyond_it() -> bool:
	eq(JobRunner.avoid_penalty(_jam(), 4), {"share": 0.1, "stars": 0, "note": "Kept off Anna Salai: +10%"})
	var p := JobRunner.avoid_penalty(_jam(), 50)
	near(p["share"], -0.32, 12)
	match_obj(p, {"stars": 1, "note": "Stuck on Anna Salai for 50 s: -32%"})
	eq(JobRunner.avoid_penalty(_jam(), 75)["stars"], 2)
	eq(JobRunner.avoid_penalty(_jam(), 1000)["share"], -0.5)
	return true


func test_avoid_time_counts_only_while_the_job_runs() -> bool:
	var runner := JobRunner.new()
	runner.accept(_evening(), 17)
	runner.update(1, 500, 0, "car", 3)
	eq(runner.avoid_seconds(), 0)
	runner.update(0.1, 0, 0, "car", 0)
	eq(types(runner.update(0.1, 500, 0, "car", 3)), ["avoid"])
	eq(runner.update(0.1, 500, 0, "car", 3), [])
	runner.update(0.1, 300, 0, "car", 3)
	eq(types(runner.update(0.1, 500, 0, "car", 3)), ["avoid"])
	near(runner.avoid_seconds(), 0.3, 5)
	return true


func test_a_clean_drive_earns_more_than_one_stuck_on_the_road() -> bool:
	var clean := _evening_run(3)
	var stuck := _evening_run(40)
	ok((clean["notes"] as Array).has("Kept off Anna Salai: +10%"))
	eq(clean["stars"], 5)
	near(stuck["avoided"], 40, 0)
	ok((stuck["notes"] as Array).has("Stuck on Anna Salai for 40 s: -24%"))
	eq(stuck["stars"], 4)
	lt(stuck["pay"], float(clean["pay"]) * 0.8)
	return true


# reputation.test.ts ---------------------------------------------------------------------------

func test_reputation_lost_outside_a_job_never_below_zero() -> bool:
	var runner := JobRunner.new({"reputation": 50})
	eq(runner.lose_reputation(20), 20)
	eq(runner.reputation(), 30)
	eq(runner.record()["reputation"], 30)
	eq(runner.lose_reputation(45), 30)
	eq(runner.reputation(), 0)
	eq(runner.lose_reputation(-5), 0)
	eq(runner.reputation(), 0)
	return true
