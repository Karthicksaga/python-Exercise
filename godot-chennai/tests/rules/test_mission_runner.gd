## Ports of `missions/src/MissionRunner.test.ts` (6 cases) and `chase.test.ts` (6 cases).
extends "res://tests/rules/rules_test.gd"

const O := MissionData.Objective
const M := MissionData.Mission
const P := MissionData.PlayerStatus


func _missions() -> Array:
	var drop := O.reach("Drop off", 100, 0, 5)
	drop.mode = "auto"
	drop.stop = true
	drop.time_limit = 10
	var pick := O.reach("Pick up", 50, 0, 5)
	pick.mode = "auto"
	pick.stop = true
	return [
		M.make("walk", 1, 50, [O.reach("Go to the stall", 10, 0, 3)]),
		M.make("fare", 2, 300, [O.enter("Get in the auto", "auto"), pick, drop]),
	]


func at(x: float, mode: String = "foot", speed: float = 0.0) -> MissionData.PlayerStatus:
	return P.make(x, 0, mode, speed)


func test_starts_on_first_stage_and_completes_it() -> bool:
	var runner := MissionRunner.new(_missions())
	eq(runner.mission().id, "walk")
	eq(runner.update(0.1, at(0)), [])
	var events := runner.update(0.1, at(8))
	eq(types(events), ["completed"])
	eq(runner.balance(), 50)
	eq(runner.mission().id, "fare")
	return true


func test_requires_the_right_vehicle_and_a_full_stop() -> bool:
	var runner := MissionRunner.new(_missions(), {"completed": ["walk"], "money": 50})
	eq(runner.update(0.1, at(50)), [])
	eq(runner.update(0.1, at(0, "car")), [])
	match_obj(runner.update(0.1, at(0, "auto"))[0], {"type": "objective", "label": "Pick up"})
	eq(runner.update(0.1, at(50, "auto", 8)), [])
	match_obj(runner.update(0.1, at(50, "auto", 0.3))[0], {"type": "objective", "label": "Drop off"})
	eq(runner.seconds_left(), 10)
	return true


func test_fails_a_timed_objective_and_restarts_the_stage() -> bool:
	var runner := MissionRunner.new(_missions(), {"completed": ["walk"], "money": 50})
	runner.update(0.1, at(0, "auto"))
	runner.update(0.1, at(50, "auto", 0))
	eq(runner.update(6, at(60, "auto", 5)), [])
	var events := runner.update(6, at(70, "auto", 5))
	match_obj(events[0], {"type": "failed", "reason": "Out of time"})
	eq(runner.objective().label, "Get in the auto")
	eq(runner.balance(), 50)
	return true


func test_pays_the_reward_reports_the_end_and_keeps_progress() -> bool:
	var runner := MissionRunner.new(_missions(), {"completed": ["walk"], "money": 50})
	runner.update(0.1, at(0, "auto"))
	runner.update(0.1, at(50, "auto", 0))
	var events := runner.update(0.1, at(100, "auto", 0))
	eq(types(events), ["completed", "allDone"])
	eq(runner.balance(), 350)
	is_nil(runner.mission())
	eq(runner.progress(), {"completed": ["walk", "fare"], "money": 350})
	eq(runner.update(1, at(0)), [])
	return true


func test_defeat_waits_for_its_group_and_knockout_restarts() -> bool:
	var fight := [M.make("brawl", 1, 600, [O.reach("Go to the park", 10, 0, 3), O.defeat("Beat the thugs", "park", 10, 0, 12)])]
	var runner := MissionRunner.new(fight, {"completed": [], "money": 130})
	runner.update(0.1, at(10))
	eq(runner.objective().label, "Beat the thugs")
	eq(runner.update(0.1, at(10)), [])
	eq(runner.update(0.1, at(10).with_cleared(["other"])), [])
	runner.restart_stage()
	eq(runner.objective().label, "Go to the park")
	eq(runner.charge(100), 100)
	eq(runner.charge(100), 30)
	eq(runner.balance(), 0)
	runner.update(0.1, at(10))
	var events := runner.update(0.1, at(10).with_cleared(["park"]))
	match_obj(events[0], {"type": "completed"})
	eq(runner.balance(), 600)
	return true


func test_ignores_saved_stages_that_no_longer_exist_and_resets() -> bool:
	var runner := MissionRunner.new(_missions(), {"completed": ["walk", "deleted"], "money": 70.9})
	eq(runner.stages_done(), 1)
	eq(runner.balance(), 70)
	runner.reset()
	eq(runner.mission().id, "walk")
	eq(runner.balance(), 0)
	return true


## New (Godot): the runner's signals carry the same events.
func test_signals_follow_the_events() -> bool:
	var runner := MissionRunner.new(_missions())
	var seen: Array = []
	runner.stage_completed.connect(func(m: MissionData.Mission) -> void: seen.append(m.id))
	runner.update(0.1, at(8))
	eq(seen, ["walk"])
	return true


# chase.test.ts -------------------------------------------------------------------------------

var path: Array = [{"x": 0.0, "z": 0.0}, {"x": 0.0, "z": -100.0}, {"x": 100.0, "z": -100.0}]


func test_chase_measures_a_path_and_finds_points_with_heading() -> bool:
	eq(Chase.path_length(path), 200)
	eq(Chase.point_along(path, 50), {"x": 0, "z": -50, "heading": 0})
	var corner := Chase.point_along(path, 150)
	near(corner["x"], 50, 9)
	eq(corner["z"], -100)
	near(corner["heading"], -PI / 2, 9)
	match_obj(Chase.point_along(path, 999), {"x": 100, "z": -100})
	match_obj(Chase.point_along(path, -5), {"x": 0, "z": 0})
	return true


func test_chase_quarry_eases_off_far_and_bursts_close() -> bool:
	eq(Chase.quarry_speed(10, 30), 10)
	near(Chase.quarry_speed(10, 100), 10 * Chase.EASE, 9)
	near(Chase.quarry_speed(10, 5), 10 * Chase.BURST, 9)
	return true


func _chase() -> MissionData.Mission:
	var take := O.reach("Take the package back", 0, 0, 5)
	take.hostiles = "ambush"
	var m := M.make("courier", 11, 2000, [O.chase("Stop the courier", path, 10, 6, "bike"), take])
	m.weapons.append({"id": "shotgun", "ammo": 10})
	return m


func car(x: float, z: float, mode: String = "car") -> MissionData.PlayerStatus:
	return P.make(x, z, mode, 10)


func test_chase_quarry_runs_from_the_start_of_the_objective() -> bool:
	var runner := MissionRunner.new([_chase()])
	match_obj(runner.quarry(), {"x": 0, "z": 0})
	for i in 60:
		runner.update(1.0 / 60.0, car(0, 30))
	near(runner.quarry()["z"], -10, 6)
	return true


func test_chase_caught_alongside_in_a_vehicle_not_on_foot() -> bool:
	var runner := MissionRunner.new([_chase()])
	runner.update(1, car(0, 30))
	var q: Dictionary = runner.quarry()
	eq(runner.update(0.01, car(q["x"] + 3, q["z"], "foot")), [])
	eq(runner.update(0.01, car(q["x"] + 3, q["z"], "bike")), [{"type": "objective", "label": "Take the package back"}])
	is_nil(runner.quarry())
	return true


func test_chase_fails_when_the_quarry_gets_away() -> bool:
	var chase := _chase()
	var runner := MissionRunner.new([chase])
	var events: Array = []
	var i := 0
	while i < 60 * 60 and events.is_empty():
		events.append_array(runner.update(1.0 / 60.0, car(900, 900)))
		i += 1
	eq(events.size(), 1)
	match_obj(events[0], {"type": "failed", "reason": "They got away"})
	ok(events[0]["mission"] == chase)
	eq(runner.objective().type, "chase")
	match_obj(runner.quarry(), {"x": 0, "z": 0})
	return true


func test_chase_pays_money_and_weapons_travel_with_the_mission() -> bool:
	var chase := _chase()
	var runner := MissionRunner.new([chase])
	runner.update(0.01, car(0, 2))
	var done := runner.update(0.01, car(0, 0, "foot"))
	eq(done[0]["type"], "completed")
	ok(done[0]["mission"] == chase)
	eq(runner.balance(), 2000)
	eq(chase.weapons, [{"id": "shotgun", "ammo": 10}])
	return true
