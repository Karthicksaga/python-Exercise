## The mission systems of docs/mission-design.md §2 and §3 (G-140..G-143, G-146), with numbers and
## the fail and success edges: failure reasons, checkpoints and retry, fail-forward, medals, the
## save version, choices, `fragile`, `tail`, `hazard_zone`, `dynamic_event`. New (Godot) cases.
extends "res://tests/unit/rules/rules_test.gd"

const O := MissionData.Objective
const M := MissionData.Mission
const P := MissionData.PlayerStatus
const SAVE := "user://test-mission-systems.json"


func at(x: float, mode: String = "foot", speed: float = 0.0, z: float = 0.0) -> MissionData.PlayerStatus:
	return P.make(x, z, mode, speed)


# --- Failure reasons ----------------------------------------------------------------------------

func test_every_failure_reason_has_a_text_and_an_id_that_round_trips() -> bool:
	eq(MissionFailure.IDS.size(), 7)
	for r: Variant in MissionFailure.IDS:
		var reason: MissionFailure.Reason = r
		ok(MissionFailure.text(reason).length() > 3, "text")
		eq(MissionFailure.from_id(MissionFailure.id_of(reason)), int(reason))
	eq(MissionFailure.from_id("nonsense"), -1)
	eq(MissionFailure.text(MissionFailure.Reason.OUT_OF_TIME), "Out of time")
	return true


# --- Stability (fragile) -----------------------------------------------------------------------

func test_stability_drops_by_the_numbers_and_not_below_the_safe_limits() -> bool:
	var s := Stability.new()
	s.step(1.0, 4.5, 3.5, 10.0)
	near(s.value, 100.0, 4, "at the safe limits nothing is lost")
	s.step(1.0, 8.0, 0.0, 10.0)
	near(s.value, 89.5, 4, "braking 8 m/s2 for 1 s: (8-4.5)*3 = 10.5")
	s.step(1.0, 0.0, 5.5, 10.0)
	near(s.value, 84.5, 4, "cornering 5.5: (5.5-3.5)*2.5 = 5")
	s.step(0.0, 0.0, 0.0, 10.0, 10.0)
	near(s.value, 69.5, 4, "a breaker at 10 m/s: (10-4)*2.5 = 15")
	s.step(0.0, 0.0, 0.0, 4.0, 4.0)
	near(s.value, 69.5, 4, "a breaker at the safe 4 m/s costs nothing")
	s.step(0.0, 0.0, 0.0, 20.0, 0.0, true)
	near(s.value, 59.5, 4, "a pothole at speed 20: 4 + 12*0.5 = 10 (speed capped at 12)")
	s.step(0.0, 0.0, 0.0, 5.0, 0.0, false, 0.5)
	near(s.value, 39.5, 4, "a crash of impact 0.5 costs 20")
	near(s.lowest, 39.5, 4, "the lowest is kept")
	ok(s.is_warning(), "below 40 the HUD warns")
	return true


func test_stability_recovers_slowly_only_while_smooth_and_never_above_100() -> bool:
	var s := Stability.new()
	s.step(0.0, 0.0, 0.0, 5.0, 0.0, false, 0.25)
	near(s.value, 90.0, 4)
	s.step(2.0, 1.0, 1.0, 5.0)
	near(s.value, 92.0, 4, "smooth: +1 per second")
	s.step(1.0, 3.0, 3.0, 5.0)
	near(s.value, 92.0, 4, "neither smooth nor rough: no change")
	s.step(1.0, 1.0, 1.0, 0.2)
	near(s.value, 92.0, 4, "standing still does not heal")
	s.step(60.0, 0.0, 0.0, 5.0)
	near(s.value, 100.0, 4, "capped at 100")
	near(s.lowest, 90.0, 4)
	ok(not s.stayed_above(95.0) and s.stayed_above(90.0), "the bonus goal looks at the lowest point")
	return true


func test_stability_ruins_the_cargo_at_zero_once() -> bool:
	var s := Stability.new()
	var count := [0]
	s.ruined.connect(func() -> void: count[0] += 1)
	s.step(0.0, 0.0, 0.0, 5.0, 0.0, false, 1.0)
	s.step(0.0, 0.0, 0.0, 5.0, 0.0, false, 1.0)
	no(s.is_ruined(), "80 lost")
	s.step(0.0, 0.0, 0.0, 5.0, 0.0, false, 1.0)
	ok(s.is_ruined(), "a third crash ruins it")
	s.step(0.0, 0.0, 0.0, 5.0, 0.0, false, 1.0)
	eq(count[0], 1, "announced once")
	eq(s.value, 0.0)
	return true


# --- TailWatch ---------------------------------------------------------------------------------

func test_tail_close_for_longer_than_grace_fills_suspicion_until_spotted() -> bool:
	var t := TailWatch.make(25, 90, 12, 2)
	for i in 4:
		t.step(0.5, 5.0)
	eq(t.suspicion, 0.0, "2 s inside notice is within grace")
	t.step(0.5, 5.0)
	near(t.suspicion, 12.5, 4, "the 5th half-second is past grace: 25/s")
	for i in 3:
		t.step(0.5, 5.0)
	near(t.suspicion, 50.0, 4)
	ok(t.is_warning(), "the HUD warns from 50")
	eq(t.outcome, "")
	t.step(0.5, 5.0)
	t.step(0.5, 5.0)
	t.step(0.5, 5.0)
	t.step(0.5, 5.0)
	eq(t.outcome, "spotted")
	near(t.suspicion, 100.0, 4, "capped")
	t.step(1.0, 50.0)
	eq(t.outcome, "spotted", "stays spotted")
	return true


func test_tail_grace_resets_when_you_back_off() -> bool:
	var t := TailWatch.make(25, 90, 12, 2)
	t.step(1.5, 5.0)
	t.step(0.5, 40.0)
	t.step(1.9, 5.0)
	eq(t.suspicion, 0.0, "backing off to 20 m resets the grace timer")
	return true


func test_tail_band_edges_between_notice_near_and_far() -> bool:
	var t := TailWatch.make(25, 90, 12, 2)
	t.step(1.0, 20.0)
	near(t.suspicion, 4.0, 4, "between notice and near: +4/s")
	t.step(0.25, 40.0)
	near(t.suspicion, 2.0, 4, "in the safe band it drains 8/s")
	t.step(1.0, 40.0)
	eq(t.suspicion, 0.0, "never below 0")
	t.step(0.0, 40.0, true)
	near(t.suspicion, 15.0, 4, "a red light run beside the target: +15")
	near(t.peak, 15.0, 4)
	ok(t.stayed_under(15.0) and not t.stayed_under(14.0), "peak for the no-suspicion goal")
	return true


func test_tail_loses_the_target_after_six_seconds_beyond_far() -> bool:
	var t := TailWatch.make(25, 90, 12, 2)
	t.step(6.0, 100.0)
	eq(t.outcome, "", "exactly 6 s is not lost")
	t.step(0.1, 100.0)
	eq(t.outcome, "lost")
	var u := TailWatch.make(25, 90, 12, 2)
	u.step(5.0, 100.0)
	u.step(0.5, 80.0)
	u.step(5.0, 100.0)
	eq(u.outcome, "", "coming back within far resets the lost timer")
	return true


# --- HazardZone --------------------------------------------------------------------------------

func _flood() -> HazardZone:
	return HazardZone.from_dict({"kind": "flood", "x": 100, "z": 0, "radius": 20, "growth": 0.5, "maxRadius": 40, "start": 10, "maxDepth": 0.8, "rise": 0.01, "label": "Underpass"})


func test_flood_grows_and_deepens_with_game_time() -> bool:
	var f := _flood()
	eq(f.radius_at(5.0), 0.0, "not there before it starts")
	eq(f.radius_at(10.0), 20.0)
	near(f.radius_at(30.0), 30.0, 4, "0.5 m/s for 20 s")
	eq(f.radius_at(1000.0), 40.0, "capped at max_radius")
	eq(f.depth_at(100, 0, 5.0), 0.0)
	near(f.depth_at(100, 0, 20.0, 1.0), 0.1 * 1.0 * 1.0 * (1.0 - 0.0 / 25.0), 4, "10 s of full rain at 0.01: 0.1 m at the centre")
	near(f.depth_at(100, 0, 20.0, 0.0), 0.05, 4, "no rain: half the rise")
	near(f.depth_at(112.5, 0, 20.0, 1.0), 0.05, 4, "half the radius out: half the depth")
	eq(f.depth_at(100 + 25.1, 0, 20.0), 0.0, "outside")
	near(f.depth_at(100, 0, 500.0, 1.0), 0.8, 4, "capped at max depth")
	return true


func test_flood_slows_then_stalls_at_the_depth_edges() -> bool:
	var f := _flood()
	var shallow := f.effect(100, 0, 19.0, 1.0)
	ok(bool(shallow["inside"]) and float(shallow["speed_scale"]) == 1.0 and not bool(shallow["stalled"]), "0.09 m: still free")
	var mid := f.effect(100, 0, 10.0 + 22.0, 1.0)
	near(float(mid["depth"]), 0.22 * (1.0 - 0.0), 3)
	gt(float(mid["speed_scale"]), 0.35, "partly slowed")
	lt(float(mid["speed_scale"]), 1.0)
	var deep := f.effect(100, 0, 10.0 + 60.0, 1.0)
	ok(bool(deep["stalled"]) and float(deep["speed_scale"]) == 0.0, "0.6 m: the engine stalls")
	var just_under := f.effect(100, 0, 10.0 + 49.0, 1.0)
	no(bool(just_under["stalled"]), "0.49 m: still going")
	near(float(just_under["speed_scale"]), 0.35, 3, "at 0.35 m and deeper the speed floor is 35 %")
	var out := f.effect(300, 0, 70.0)
	no(bool(out["inside"]), "outside is untouched")
	return true


func test_a_procession_crawls_a_strike_blocks_and_both_can_drift() -> bool:
	var p := HazardZone.from_dict({"kind": "procession", "x": 0, "z": 0, "radius": 15, "vx": 2.0, "insideScale": 0.4})
	near(float(p.effect(10, 0, 0.0)["speed_scale"]), 0.4, 4)
	no(bool(p.effect(30, 0, 0.0)["inside"]), "30 m away at first")
	ok(bool(p.effect(30, 0, 10.0)["inside"]), "it has moved 20 m east by 10 s")
	var b := HazardZone.from_dict({"kind": "strike", "x": 0, "z": 0, "radius": 10, "blocks": true})
	eq(float(b.effect(0, 0, 0.0)["speed_scale"]), 0.0)
	ok(b.blocks_segment(Vector2(-30, 0), Vector2(30, 0), 0.0), "a road through it is blocked")
	no(b.blocks_segment(Vector2(-30, 20), Vector2(30, 20), 0.0), "a parallel road is not")
	var f := _flood()
	no(f.blocks_segment(Vector2(60, 0), Vector2(140, 0), 20.0), "shallow water does not block")
	ok(f.blocks_segment(Vector2(60, 0), Vector2(140, 0), 100.0), "deep water blocks the road through it")
	return true


# --- Dynamic events -----------------------------------------------------------------------------

func _run_events(seed_text: String, seconds: int, fares: bool = false) -> Array:
	var ev := DynamicEvents.new(seed_text, fares)
	var out: Array = []
	for i in seconds:
		var e := ev.step(1.0)
		if not e.is_empty():
			out.append({"kind": e["kind"], "at": i})
	return out


func test_dynamic_events_are_seeded_spaced_and_once_per_kind() -> bool:
	var a := _run_events("cab-ride#1", 900, true)
	eq(a, _run_events("cab-ride#1", 900, true), "same seed, same run")
	ok(a != _run_events("cab-ride#2", 900, true) or a != _run_events("bus-route#1", 900, true), "another seed, another run")
	ge(float(a[0]["at"]), DynamicEvents.FIRST_AT, "never before 25 s")
	var kinds: Array = []
	for i in a.size():
		ok(not kinds.has(a[i]["kind"]), "%s only once" % a[i]["kind"])
		kinds.append(a[i]["kind"])
		if i > 0:
			ge(float(a[i]["at"]) - float(a[i - 1]["at"]), DynamicEvents.GAP_MIN, "events are spaced")
	eq(a.size(), 5, "all five kinds happen in a long run with fares")
	var no_fare := _run_events("courier#1", 900, false)
	eq(no_fare.size(), 4, "no passenger change without a passenger")
	return true


func test_no_dynamic_event_starts_during_a_fight_and_only_one_at_a_time() -> bool:
	var ev := DynamicEvents.new("fight#1")
	for i in 200:
		ev.step(1.0, true)
	eq(ev.used().size(), 0, "nothing while fighting")
	var first := {}
	for i in 100:
		first = ev.step(1.0)
		if not first.is_empty():
			break
	not_nil(first)
	ok(not first.is_empty(), "then one starts")
	if float(first["duration"]) > 0.0:
		eq(ev.step(1.0), {}, "none while it is active")
		eq(ev.active()["kind"], first["kind"])
	return true


# --- Medals ------------------------------------------------------------------------------------

func _goals() -> Array:
	return [{"id": "clean", "kind": "no_damage"}, {"id": "fast", "kind": "par_time", "value": 100}, {"id": "quiet", "kind": "no_police"}]


func test_medals_follow_how_many_goals_were_met() -> bool:
	var s := MissionStats.new()
	s.seconds = 90.0
	var r := Medals.evaluate(_goals(), s)
	eq(r["medal"], "gold")
	eq(r["met"], ["clean", "fast", "quiet"])
	s.seconds = 101.0
	eq(Medals.evaluate(_goals(), s)["medal"], "silver", "2 of 3")
	s.damage_taken = 1
	eq(Medals.evaluate(_goals(), s)["medal"], "bronze", "1 of 3")
	s.max_wanted = 2
	eq(Medals.evaluate(_goals(), s)["medal"], "bronze", "none met is still bronze for finishing")
	eq(Medals.evaluate([], s)["medal"], "", "a stage without goals has no medal")
	eq(Medals.evaluate([{"id": "a", "kind": "no_damage"}], MissionStats.new())["medal"], "gold", "one goal, met")
	eq(Medals.evaluate([{"id": "a", "kind": "no_damage"}, {"id": "b", "kind": "no_police"}], s)["medal"], "bronze", "0 of 2")
	s.seconds = 100.0
	s.damage_taken = 0
	s.max_wanted = 0
	eq(Medals.evaluate(_goals(), s)["medal"], "gold", "exactly the par time counts")
	s.retries = 1
	eq(Medals.evaluate(_goals(), s)["medal"], "silver", "a retry caps gold at silver")
	return true


func test_each_goal_kind_and_the_better_medal() -> bool:
	var s := MissionStats.new()
	s.stability_lowest = 91.0
	s.horns_in_quiet_zone = 0
	s.suspicion_peak = 30.0
	s.seconds_left = 600.0
	ok(Medals.met({"kind": "cargo", "value": 90}, s) and not Medals.met({"kind": "cargo", "value": 92}, s), "cargo")
	ok(Medals.met({"kind": "quiet_zone"}, s), "no horn")
	s.horns_in_quiet_zone = 1
	no(Medals.met({"kind": "quiet_zone"}, s), "a horn in the quiet zone")
	ok(Medals.met({"kind": "no_suspicion", "value": 30}, s) and not Medals.met({"kind": "no_suspicion", "value": 29}, s), "suspicion")
	ok(Medals.met({"kind": "time_left", "value": 600}, s) and not Medals.met({"kind": "time_left", "value": 601}, s), "time left")
	no(Medals.met({"kind": "unknown"}, s), "an unknown goal is never met")
	eq(Medals.best("silver", "gold"), "gold")
	eq(Medals.best("gold", "bronze"), "gold", "a replay never lowers a medal")
	eq(Medals.best("", "bronze"), "bronze")
	return true


# --- The runner: checkpoints, retry, fail-forward, choices, replay ----------------------------

func _timed(label: String, x: float, limit: float, extra: Dictionary = {}) -> MissionData.Objective:
	var d := {"type": "reach", "label": label, "x": x, "z": 0, "radius": 5, "timeLimit": limit}
	d.merge(extra, true)
	return O.from_dict(d)


func _mission(id: String, stage: int, reward: int, objectives: Array, extra: Dictionary = {}) -> MissionData.Mission:
	var d := {"id": id, "stage": stage, "title": id, "reward": reward, "objectives": objectives.map(func(o: MissionData.Objective) -> Dictionary: return {})}
	d.merge(extra, true)
	var m := M.from_dict(d)
	m.objectives.clear()
	for o: MissionData.Objective in objectives:
		m.objectives.append(o)
	return m


func test_a_failure_goes_back_to_the_last_checkpoint_not_the_start() -> bool:
	var a := _timed("First leg", 100, 0, {"checkpoint": true})
	var b := _timed("Second leg", 200, 5)
	var runner := MissionRunner.new([_mission("m", 1, 400, [a, b])])
	var cps: Array = []
	runner.checkpoint_reached.connect(func(i: int) -> void: cps.append(i))
	var events := runner.update(0.1, at(100))
	eq(types(events), ["checkpoint", "objective"])
	eq(cps, [1])
	eq(runner.checkpoint_index(), 1)
	var failed := runner.update(6.0, at(150))
	match_obj(failed[0], {"type": "failed", "reason": "Out of time", "reason_id": "out_of_time", "checkpoint": 1})
	eq(runner.objective().label, "Second leg", "retry resumes at the checkpoint")
	eq(runner.stats().retries, 1)
	eq(runner.seconds_left(), 5, "its clock is fresh")
	runner.update(0.1, at(200))
	var done := runner.update(0.1, at(200))
	eq(runner.balance(), 400, "completed: paid once")
	eq(runner.checkpoint_index(), 0, "a finished stage forgets its checkpoint")
	return true


func test_failing_before_any_checkpoint_restarts_the_stage_and_start_over_clears_a_checkpoint() -> bool:
	var a := _timed("A", 10, 0, {"checkpoint": true})
	var b := _timed("B", 20, 1)
	var runner := MissionRunner.new([_mission("m", 1, 100, [a, b])])
	runner.update(0.1, at(10))
	runner.update(2.0, at(15))
	eq(runner.objective().label, "A" if false else "B", "B failed back to the checkpoint")
	runner.restart_stage()
	eq(runner.objective().label, "A", "START OVER")
	eq(runner.checkpoint_index(), 0)
	eq(runner.stats().retries, 0)
	return true


func test_fail_forward_branches_to_the_side_gate_with_a_smaller_reward() -> bool:
	var dash := _timed("Reach the main gate", 500, 30, {"onFail": "side", "onFailScale": 0.5})
	var side := _timed("Run to the side gate", 520, 0, {"id": "side"})
	var runner := MissionRunner.new([_mission("exam", 1, 1000, [dash, side])])
	var events := runner.update(31.0, at(0))
	eq(types(events), ["forwarded"])
	match_obj(events[0], {"reason_id": "out_of_time", "label": "Run to the side gate", "scale": 0.5})
	eq(runner.objective().label, "Run to the side gate")
	eq(runner.update(0.1, at(100)), [], "not there yet")
	var done := runner.update(0.1, at(520))
	match_obj(done[0], {"type": "completed", "paid": 500, "forwarded": true})
	eq(runner.balance(), 500, "half the reward")
	return true


func test_fail_forward_to_an_unknown_objective_falls_back_to_a_retry() -> bool:
	var dash := _timed("Dash", 500, 5, {"onFail": "nowhere"})
	var runner := MissionRunner.new([_mission("m", 1, 100, [dash])])
	eq(types(runner.update(6.0, at(0))), ["failed"])
	return true


func test_a_choice_pays_flags_and_jumps_and_waits_until_chosen() -> bool:
	var drop := _timed("Reach the drop", 10, 0)
	var ask := O.from_dict({"type": "choice", "label": "What now?", "options": [
		{"id": "report", "label": "Report it", "reward": 200, "reputation": 5, "next": "end_police", "flag": "reported"},
		{"id": "take", "label": "Take the envelope", "reward": 900, "wanted": 1, "flag": "took_envelope"},
	]})
	var police := _timed("Walk to the police station", 50, 0, {"id": "end_police"})
	var runner := MissionRunner.new([_mission("wn", 1, 300, [drop, ask, police])])
	var asked: Array = []
	runner.choice_asked.connect(func(options: Array) -> void: asked.append(options.size()))
	var events := runner.update(0.1, at(10))
	eq(types(events), ["objective", "choice"])
	eq(asked, [2])
	eq(runner.pending_choice().size(), 2)
	eq(runner.update(5.0, at(10)), [], "nothing moves while the choice waits")
	eq(runner.choose("nope"), [] as Array[Dictionary], "an unknown option is ignored")
	var chosen := runner.choose("report")
	eq(types(chosen), ["chosen", "objective"])
	eq(runner.balance(), 200)
	ok(runner.has_flag("reported") and not runner.has_flag("took_envelope"))
	eq(runner.objective().label, "Walk to the police station")
	eq(runner.pending_choice().size(), 0)
	eq(runner.choose("take"), [] as Array[Dictionary], "no second choice")
	return true


func test_the_other_choice_takes_the_next_objective_and_the_flag_survives_the_save() -> bool:
	var ask := O.from_dict({"type": "choice", "label": "Now?", "options": [{"id": "take", "label": "Take it", "reward": 900, "flag": "took_envelope"}]})
	var runner := MissionRunner.new([_mission("wn", 1, 300, [ask])])
	runner.update(0.0, at(0))
	var events := runner.choose("take")
	eq(types(events), ["chosen", "completed", "allDone"], "the last objective: the stage completes")
	eq(runner.balance(), 1200, "900 for the choice, 300 for the stage")
	var again := MissionRunner.new([_mission("wn", 1, 300, [ask])], runner.progress(), [], runner.extras_state())
	ok(again.has_flag("took_envelope"), "the flag is restored from the save")
	return true


func test_medals_are_kept_best_and_a_replay_pays_a_quarter() -> bool:
	var goal := [{"id": "fast", "kind": "par_time", "value": 10}]
	var m := _mission("m", 1, 400, [_timed("Go", 10, 0)], {"goals": goal})
	var runner := MissionRunner.new([m])
	var events := runner.update(5.0, at(10))
	match_obj(events[0], {"type": "completed", "medal": "gold", "paid": 400, "replay": false})
	eq(runner.medal_of("m"), "gold")
	ok(runner.play("m"), "a finished stage can be replayed")
	ok(runner.is_replay())
	var slow := runner.update(20.0, at(10))
	match_obj(slow[0], {"type": "completed", "medal": "bronze", "paid": 100, "replay": true})
	eq(runner.balance(), 500, "400 + a quarter of 400")
	eq(runner.medal_of("m"), "gold", "a worse replay keeps the gold")
	no(runner.is_replay())
	eq(runner.stages_done(), 1, "the stage counts once")
	return true


func test_an_extra_mission_is_open_from_the_start_and_counts_apart_from_the_stages() -> bool:
	var story := _mission("s1", 1, 50, [_timed("Walk", 10, 0)])
	var extra := _mission("x1", 22, 600, [_timed("Go", 30, 0)], {"kind": "extra"})
	var runner := MissionRunner.new([story], {}, [extra])
	eq(runner.replayable().size(), 1, "only the extra is open before stage 1 is done")
	no(runner.play("s1"), "an unfinished stage is not on the replay list")
	ok(runner.play("x1"))
	eq(runner.mission().id, "x1")
	var events := runner.update(0.1, at(30))
	match_obj(events[0], {"type": "completed", "paid": 600, "replay": false})
	eq(runner.mission().id, "s1", "back to the story")
	eq(runner.stages_done(), 0, "an extra is not a stage")
	var again := MissionRunner.new([story], runner.progress(), [extra], runner.extras_state())
	ok(again.play("x1"))
	match_obj(again.update(0.1, at(30))[0], {"replay": true, "paid": 150})
	return true


func test_a_strict_stage_fails_when_the_vehicle_is_wrecked_or_the_player_is_down() -> bool:
	var strict := _timed("Drive", 100, 0, {"strict": true})
	var loose := _timed("Drive", 100, 0)
	var s := at(0, "car", 5)
	s.wrecked = true
	match_obj(MissionRunner.new([_mission("m", 1, 10, [strict])]).update(0.1, s)[0], {"type": "failed", "reason_id": "vehicle_destroyed"})
	var d := at(0)
	d.down = true
	match_obj(MissionRunner.new([_mission("m", 1, 10, [strict])]).update(0.1, d)[0], {"type": "failed", "reason_id": "player_down"})
	eq(MissionRunner.new([_mission("m", 1, 10, [loose])]).update(0.1, s), [], "the old stages ignore it")
	return true


func test_fragile_cargo_is_ruined_by_rough_patches_and_the_stage_goes_back() -> bool:
	var carry := O.from_dict({"type": "fragile", "label": "Carry the vessel", "x": 1000, "z": 0, "radius": 8, "stop": true, "ruin": "cargo_ruined", "rough": [
		{"x": 100, "z": 0, "radius": 5, "kind": "breaker"}, {"x": 200, "z": 0, "radius": 5, "kind": "pothole"}]})
	var runner := MissionRunner.new([_mission("sambar", 1, 800, [carry])])
	var p := at(100, "car", 10)
	runner.update(0.1, p)
	near(runner.stability().value, 85.0, 4, "a breaker at 10 m/s costs 15")
	runner.update(0.1, p)
	near(runner.stability().value, 85.1, 4, "still on the same breaker: charged once (0.1 s of recovery)")
	runner.update(0.1, at(150, "car", 10))
	runner.update(0.1, at(100, "car", 10))
	near(runner.stability().value, 70.2, 3, "a second pass is charged again")
	runner.update(0.1, at(200, "car", 10))
	near(runner.stability().value, 61.2, 3, "a pothole at 10 m/s costs 4 + 5 = 9")
	var crash := at(300, "car", 5)
	crash.crash = 1.0
	eq(runner.update(0.1, crash), [] as Array[Dictionary], "a crash: 61.2 - 40 = 21.2, still carrying")
	var events := runner.update(0.1, crash)
	match_obj(events[0], {"type": "failed", "reason_id": "cargo_ruined"})
	near(runner.stability().value, 100.0, 4, "the meter is fresh after the retry")
	return true


func test_fragile_cargo_arrives_and_reports_the_lowest_for_the_bonus_goal() -> bool:
	var carry := O.from_dict({"type": "fragile", "label": "Carry", "x": 50, "z": 0, "radius": 8, "stop": true})
	var m := _mission("sambar", 1, 800, [carry], {"goals": [{"id": "intact", "kind": "cargo", "value": 90}]})
	var runner := MissionRunner.new([m])
	var hard := at(10, "car", 10)
	hard.decel = 6.5
	runner.update(1.0, hard)
	near(runner.stability().value, 94.0, 3, "(6.5-4.5)*3 = 6")
	var events := runner.update(0.1, at(50, "car", 0.5))
	match_obj(events[0], {"type": "completed", "medal": "gold"})
	var m2 := _mission("sambar2", 2, 800, [O.from_dict({"type": "fragile", "label": "Carry", "x": 50, "z": 0, "radius": 8, "stop": true})], {"goals": [{"id": "intact", "kind": "cargo", "value": 95}]})
	var r2 := MissionRunner.new([m2])
	r2.update(1.0, hard)
	match_obj(r2.update(0.1, at(50, "car", 0.5))[0], {"medal": "bronze"})
	return true


func _tail_objective() -> MissionData.Objective:
	return O.from_dict({"type": "tail", "label": "Follow him", "near": 25, "far": 90, "notice": 12, "grace": 2, "radius": 90, "speed": 10,
		"path": [{"x": 0, "z": 0}, {"x": 400, "z": 0}], "pauses": [{"at": 100, "seconds": 5, "label": "signal"}]})


func test_tail_succeeds_when_you_stay_in_the_band_to_the_end() -> bool:
	var runner := MissionRunner.new([_mission("wn", 1, 500, [_tail_objective()])])
	var events: Array[Dictionary] = []
	var t := 0.0
	while t < 60.0 and events.is_empty():
		t += 0.5
		var target: Variant = runner.tail_target()
		var tx: float = float(target["x"])
		events = runner.update(0.5, at(maxf(0.0, tx - 40.0), "bike", 10, 0.0))
	eq(types(events), ["completed", "allDone"])
	near(t, 45.0, 0, "400 m at 10 m/s plus a 5 s pause")
	near(runner.stats().suspicion_peak, 0.0, 3)
	return true


func test_tail_fails_when_spotted_or_lost() -> bool:
	var runner := MissionRunner.new([_mission("wn", 1, 500, [_tail_objective()])])
	var failed := {}
	for i in 40:
		var e := runner.update(0.5, at(float(runner.tail_target()["x"]) - 5.0, "bike", 10))
		if not e.is_empty():
			failed = e[0]
			break
	match_obj(failed, {"type": "failed", "reason_id": "spotted"})
	var r2 := MissionRunner.new([_mission("wn", 1, 500, [_tail_objective()])])
	var lost := {}
	for i in 60:
		var e2 := r2.update(0.5, at(-150, "bike", 0))
		if not e2.is_empty():
			lost = e2[0]
			break
	match_obj(lost, {"type": "failed", "reason_id": "target_escaped"})
	var r3 := MissionRunner.new([_mission("wn", 1, 500, [_tail_objective()])])
	var finished := {}
	for i in 120:
		var tx: float = float(r3.tail_target()["x"])
		var e3 := r3.update(0.5, at(minf(tx - 40.0, 120.0), "bike", 10))
		if not e3.is_empty():
			finished = e3[0]
			break
	ok(not finished.is_empty() and str(finished["type"]) == "failed", "a target that finishes while you are beyond far is lost")
	return true


func test_hazard_zone_objective_slows_and_stalls_the_player_by_game_time() -> bool:
	var obj := O.from_dict({"type": "hazard_zone", "label": "Reach the hospital", "x": 500, "z": 0, "radius": 10, "mode": "ambulance", "hazards": [
		{"kind": "flood", "x": 100, "z": 0, "radius": 20, "start": 10, "maxDepth": 0.8, "rise": 0.05, "label": "Underpass"}]})
	var runner := MissionRunner.new([_mission("monsoon", 1, 900, [obj])])
	var p := at(100, "ambulance", 12)
	p.rain = 1.0
	runner.update(5.0, p)
	eq(runner.hazard_effect()["inside"], false, "the water has not come yet")
	runner.update(10.0, p)
	ok(bool(runner.hazard_effect()["inside"]), "at 15 s the underpass floods")
	lt(float(runner.hazard_effect()["speed_scale"]) + 1.0, 2.0)
	runner.update(10.0, p)
	ok(bool(runner.hazard_effect()["stalled"]), "at 25 s: 0.75 m deep, stalled")
	var away := at(400, "ambulance", 12)
	runner.update(0.1, away)
	eq(runner.hazard_effect()["inside"], false)
	eq(runner.hazards().size(), 1)
	return true


# --- The save: version and migration -----------------------------------------------------------

func test_a_version_1_save_is_migrated_and_nothing_is_lost() -> bool:
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	f.store_string(JSON.stringify({"cow-progress-v1": {"completed": ["morning-walk"], "money": 50}, "cow-jobs-v1": {"reputation": 60}}))
	f.close()
	var store := SaveStore.new(SAVE).read()
	eq(store.read_version, 1, "a file without the key is version 1")
	eq(store.progress(), {"completed": ["morning-walk"], "money": 50}, "the old keys are intact")
	eq(store.extras(), {"medals": {}, "flags": {}, "extrasDone": []}, "the new fields are added")
	store.save_extras({"medals": {"morning-walk": "gold"}})
	eq(store.write(), OK)
	var back := SaveStore.new(SAVE).read()
	eq(back.read_version, 2, "written as version 2")
	eq(back.extras()["medals"], {"morning-walk": "gold"})
	eq(back.progress(), {"completed": ["morning-walk"], "money": 50}, "progress() is still exactly the Three.js shape")
	eq((back.section(SaveStore.JOBS, {}) as Dictionary)["reputation"], 60)
	DirAccess.remove_absolute(SAVE)
	return true


func test_a_save_from_a_newer_game_is_left_alone() -> bool:
	var f := FileAccess.open(SAVE, FileAccess.WRITE)
	f.store_string(JSON.stringify({"chennai-save-version": 9, "cow-progress-v1": {"completed": [], "money": 7}}))
	f.close()
	var store := SaveStore.new(SAVE).read()
	ok(store.too_new)
	store.write()
	eq(int(SaveStore.new(SAVE).read().data["chennai-save-version"]), 9, "not downgraded")
	DirAccess.remove_absolute(SAVE)
	return true
