## Ports of `missions/src/shareAuto.test.ts` (11 cases).
extends "res://tests/unit/rules/rules_test.gd"

var SA: Dictionary = ShareShift.SHARE_AUTO


## A straight 2 km route heading east; the kerb side (driver's left) is north (-Z).
func _route() -> JobData.ShareRoute:
	var pts: Array = [{"x": 0.0, "z": 0.0}, {"x": 1000.0, "z": 0.0}, {"x": 2000.0, "z": 0.0}]
	return JobData.ShareRoute.make("Test Avenue", "West End", "East End", pts, 4.5, 1.8)


## Gaps as short as allowed and rides as long as allowed.
func _crowded() -> Callable:
	var calls := [0]
	return func() -> float:
		calls[0] += 1
		var n: int = calls[0] - 1
		if n == 0:
			return 0.0
		return 1.0 if (n + 1) % 2 == 0 else 0.0


func drive(shift: ShareShift, from: float, to: float, speed: float = 8.0) -> Array:
	var events: Array = []
	var s := from
	while s < to:
		var p := shift.line.point_at(s, 1.8)
		events.append_array(shift.update(0.1, p["x"], p["z"], speed, true))
		s += speed * 0.1
	return events


func wait(shift: ShareShift, x: float, z: float, seconds: float, in_vehicle: bool = true) -> Array:
	var events: Array = []
	var t := 0.0
	while t < seconds - 1e-9:
		events.append_array(shift.update(0.1, x, z, 0, in_vehicle))
		t += 0.1
	return events


func _state(shift: ShareShift, id: int) -> String:
	for p in shift.passengers():
		if p["id"] == id:
			return p["state"]
	return ""


func test_fares_are_a_flat_part_plus_a_few_rupees_a_km() -> bool:
	eq(ShareShift.share_fare(0), SA["base_fare"])
	eq(ShareShift.share_fare(1000), int(SA["base_fare"]) + int(SA["per_km"]))
	eq(ShareShift.share_fare(2000), int(SA["base_fare"]) + 2 * int(SA["per_km"]))
	eq(ShareShift.share_fare(-50), SA["base_fare"])
	gt(ShareShift.share_estimate(2000), 50)
	lt(ShareShift.share_estimate(2000), 400)
	eq(SA["capacity"], 4)
	return true


func test_route_is_measured_and_projected_within_a_window() -> bool:
	var line := RouteLine.new(_route().points)
	eq(line.length, 2000)
	var p := line.point_at(1500, 4)
	near(p["x"], 1500)
	near(p["z"], -4)
	eq(line.project(700, 10), {"s": 700, "off": 10})
	eq(line.project(700, 0, 1200, 1800)["s"], 1200)
	return true


func test_puts_people_at_the_kerb_ahead_with_drops_further_on() -> bool:
	var shift := ShareShift.new(_route())
	shift.update(0.1, 0, 1.8, 0, true)
	var waiting := shift.waiting()
	gt(waiting.size(), 0)
	le(waiting.size(), SA["max_waiting"])
	for p in waiting:
		ge(p["at"], SA["spawn_ahead_min"])
		le(p["at"], SA["spawn_ahead_max"])
		near(p["z"], -4.5, 1)
		eq(p["stop"], {"x": p["x"], "z": -1.8})
		ge(float(p["drop_at"]) - float(p["at"]), SA["ride_min"])
		le(p["drop_at"], shift.length() - float(SA["end_margin"]))
	var again := ShareShift.new(_route())
	again.update(0.1, 0, 1.8, 0, true)
	eq(again.waiting(), waiting)
	drive(shift, 0, 900, 30)
	gt(shift.passengers().size(), waiting.size())
	le(shift.waiting().size(), SA["max_waiting"])
	for p in shift.waiting():
		gt(p["at"], shift.progress() - float(SA["pass_margin"]))
	return true


func test_lets_people_in_only_when_stopped_beside_them() -> bool:
	var shift := ShareShift.new(_route())
	shift.update(0.1, 0, -1.8, 0, true)
	var first: Dictionary = shift.waiting()[0]
	no(types(drive(shift, 0, float(first["at"]) + 3, 3)).has("boarded"))
	no(types(wait(shift, float(first["x"]) - 10, first["stop"]["z"], 3)).has("boarded"))
	no(types(wait(shift, first["stop"]["x"], first["stop"]["z"], 3, false)).has("boarded"))
	eq(types(wait(shift, first["stop"]["x"], first["stop"]["z"], float(SA["board_seconds"]) - 0.3)), [])
	ok(types(wait(shift, first["stop"]["x"], first["stop"]["z"], 0.5)).has("boarded"))
	eq(shift.aboard(), 1)
	eq(_state(shift, first["id"]), "riding")
	return true


func test_takes_at_most_four_and_a_full_auto_passing_is_no_fault() -> bool:
	var shift := ShareShift.new(_route(), _crowded())
	var s := 0.0
	for n in range(1, 6):
		var p := shift.line.point_at(s, 1.8)
		shift.update(0.1, p["x"], p["z"], 5, true)
		var next: Dictionary = shift.waiting()[0]
		drive(shift, s, next["at"])
		s = next["at"]
		wait(shift, next["stop"]["x"], next["stop"]["z"], 2)
		eq(shift.aboard(), mini(n, SA["capacity"]))
		if n == 5:
			eq(_state(shift, next["id"]), "waiting")
	var fifth: Dictionary = shift.waiting()[0]
	var events := drive(shift, s, s + 60)
	no(types(events).has("left"))
	eq(_state(shift, fifth["id"]), "gone")
	eq(shift.summary()["left"], 0)
	return true


func test_drops_at_their_point_and_charges_by_distance() -> bool:
	var shift := ShareShift.new(_route())
	shift.update(0.1, 0, -1.8, 0, true)
	var rider: Dictionary = shift.waiting()[0]
	drive(shift, 0, rider["at"])
	wait(shift, rider["stop"]["x"], rider["stop"]["z"], 2)
	eq(shift.aboard(), 1)
	drive(shift, rider["at"], float(rider["drop_at"]) - 30)
	var short := shift.line.point_at(float(rider["drop_at"]) - 30, 1.8)
	no(types(wait(shift, short["x"], short["z"], 3)).has("dropped"))
	drive(shift, float(rider["drop_at"]) - 30, rider["drop_at"])
	var events := wait(shift, rider["drop"]["x"], rider["drop"]["z"], 1.5)
	var dropped: Dictionary = {}
	for e: Dictionary in events:
		if e["type"] == "dropped":
			dropped = e
	eq(dropped.get("type"), "dropped")
	eq(dropped["fare"], ShareShift.share_fare(float(rider["drop_at"]) - float(rider["at"])))
	ge(dropped["fare"], SA["base_fare"])
	eq(shift.fares(), dropped["fare"])
	eq(shift.summary()["carried"], 1)
	return true


func test_counts_a_missed_drop_and_people_left_waiting() -> bool:
	var shift := ShareShift.new(_route())
	shift.update(0.1, 0, -1.8, 0, true)
	var rider: Dictionary = shift.waiting()[0]
	drive(shift, 0, rider["at"])
	wait(shift, rider["stop"]["x"], rider["stop"]["z"], 2)
	var events := drive(shift, rider["at"], float(rider["drop_at"]) + float(SA["miss_margin"]) + 5)
	ok(types(events).has("missed"))
	ok(types(events).has("left"))
	var summary := shift.summary()
	eq(summary["missed"], 1)
	gt(summary["left"], 0)
	eq(summary["carried"], 0)
	eq(shift.aboard(), 0)
	return true


func test_knows_the_end_and_closing_counts_anyone_aboard() -> bool:
	var shift := ShareShift.new(_route(), _crowded())
	shift.update(0.1, 0, -1.8, 0, true)
	var rider: Dictionary = shift.waiting()[0]
	drive(shift, 0, rider["at"])
	wait(shift, rider["stop"]["x"], rider["stop"]["z"], 2)
	var e := shift.end_point()
	eq(shift.at_end(e["x"], e["z"], 0, true), true)
	eq(shift.at_end(e["x"], e["z"], 4, true), false)
	eq(shift.at_end(float(e["x"]) - 30, e["z"], 0, true), false)
	eq(shift.close()["missed"], 1)
	eq(shift.aboard(), 0)
	return true


func test_share_reputation_and_rating() -> bool:
	eq(ShareShift.share_reputation({"carried": 0, "fares": 0, "missed": 0, "left": 0}), 0)
	eq(ShareShift.share_reputation({"carried": 1, "fares": 12, "missed": 0, "left": 0}), 1)
	eq(ShareShift.share_reputation({"carried": 4, "fares": 50, "missed": 0, "left": 0}), 2)
	eq(ShareShift.share_reputation({"carried": 9, "fares": 120, "missed": 0, "left": 0}), 3)
	eq(ShareShift.share_reputation({"carried": 4, "fares": 50, "missed": 1, "left": 2}), -1)
	eq(ShareShift.share_reputation({"carried": 0, "fares": 0, "missed": 4, "left": 6}), -5)
	eq(ShareShift.share_stars({"carried": 5, "fares": 60, "missed": 0, "left": 0}, 0), 5)
	eq(ShareShift.share_stars({"carried": 5, "fares": 60, "missed": 1, "left": 1}, 2), 2)
	eq(ShareShift.share_stars({"carried": 0, "fares": 0, "missed": 0, "left": 0}, 0), 1)
	return true


# JobRunner with a share auto shift ------------------------------------------------------------

func _job() -> JobData.Job:
	var j := JobData.Job.make("share", "share", "auto", [JobData.Stop.make("End of the route", 2000, -1.8, 10)], 400, 150, 50)
	j.start_radius = 100
	j.share = _route()
	return j


func run(runner: JobRunner, x: float, z: float, seconds: float, speed: float = 0.0, mode: String = "auto") -> Array:
	var events: Array = []
	var t := 0.0
	while t < seconds - 1e-9:
		events.append_array(runner.update(0.1, x, z, mode, speed))
		t += 0.1
	return events


func test_job_starts_the_clock_near_the_start_of_the_route() -> bool:
	var runner := JobRunner.new()
	runner.accept(_job())
	not_nil(runner.share())
	eq(types(run(runner, 500, -1.8, 1)), [])
	eq(types(run(runner, -40, -1.8, 1, 0, "foot")), [])
	eq(types(runner.update(0.1, -40, -1.8, "auto", 0)), ["started"])
	return true


func test_job_pays_the_fares_at_the_end_of_the_route() -> bool:
	var runner := JobRunner.new()
	runner.accept(_job())
	runner.update(0.1, 0, -1.8, "auto", 0)
	var shift := runner.share()
	var rider: Dictionary = shift.waiting()[0]
	var s := 0.0
	while s < float(rider["at"]):
		runner.update(0.1, s, -1.8, "auto", 8)
		s += 1
	ok(types(run(runner, rider["stop"]["x"], rider["stop"]["z"], 2)).has("boarded"))
	s = rider["at"]
	while s < float(rider["drop_at"]):
		runner.update(0.1, s, -1.8, "auto", 8)
		s += 1
	var dropped: Dictionary = {}
	for e: Dictionary in run(runner, rider["drop"]["x"], rider["drop"]["z"], 1.5):
		if e["type"] == "dropped":
			dropped = e
	eq(dropped.get("fare"), ShareShift.share_fare(float(rider["drop_at"]) - float(rider["at"])))
	s = rider["drop_at"]
	while s < 2000:
		runner.update(0.1, s, -1.8, "auto", 8)
		s += 1
	var done: Dictionary = {}
	for e: Dictionary in run(runner, 2000, -1.8, 0.5):
		if e["type"] == "completed":
			done = e
	eq(done.get("type"), "completed")
	var result: Dictionary = done["result"]
	var summary: Dictionary = result["share"]
	eq(summary["carried"], 1)
	eq(result["pay"], summary["fares"])
	gt(summary["left"], 0)
	eq(result["reputation"], ShareShift.share_reputation(summary))
	eq(runner.reputation(), JobRunner.START_REPUTATION + ShareShift.share_reputation(summary))
	ok(". ".join(result["notes"]).contains("1 passenger carried"))
	is_nil(runner.job())
	is_nil(runner.share())
	eq(runner.record()["best"]["share"], summary["fares"])
	return true


func test_job_shift_ends_when_time_runs_out_paying_what_was_earned() -> bool:
	var runner := JobRunner.new()
	runner.accept(_job())
	runner.update(0.1, 0, -1.8, "auto", 0)
	var events := run(runner, 0, -1.8, 400 + 1)
	ok(types(events).has("completed"))
	no(types(events).has("failed"))
	for e: Dictionary in events:
		if e["type"] == "completed":
			eq(e["result"]["pay"], 0)
			eq(e["result"]["notes"][0], "Shift time up")
			eq(e["result"]["reputation"], 0)
	return true


func test_quitting_a_shift_costs_the_usual_fine_and_reputation() -> bool:
	var runner := JobRunner.new()
	runner.accept(_job())
	runner.update(0.1, 0, -1.8, "auto", 0)
	eq(runner.quit()[0]["type"], "failed")
	eq(runner.reputation(), JobRunner.START_REPUTATION - 5)
	is_nil(runner.share())
	return true
