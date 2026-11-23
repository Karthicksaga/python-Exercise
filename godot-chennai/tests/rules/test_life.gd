## Ports of `missions/src/life.test.ts` (17 cases) and `stories.test.ts` (3 cases).
extends "res://tests/rules/rules_test.gd"


func now(hour: float, money: float = 1000, health: float = Life.MAX_HEALTH) -> Dictionary:
	return Life.now_of(hour, money, health)


func test_sleeps_until_seven_restores_health_and_counts_the_day() -> bool:
	var life := Life.new()
	var out := life.sleep(now(22, 0, 30))
	eq(out["ok"], true)
	near(out["hours"], 9)
	eq(out["health"], Life.MAX_HEALTH)
	eq(out["cost"], 0)
	eq(life.day(), 1)
	return true


func test_sleeping_in_the_small_hours_stays_on_the_same_day() -> bool:
	var life := Life.new()
	near(life.sleep(now(2))["hours"], 5)
	eq(life.day(), 0)
	eq(Life.sleep_hours(7), 24)
	return true


func test_changes_into_the_next_outfit_owned() -> bool:
	var life := Life.new()
	eq(life.outfit()["id"], "everyday")
	life.change_clothes()
	eq(life.outfit()["id"], "festival")
	life.change_clothes()
	eq(life.outfit()["id"], "everyday")
	return true


func test_hospital_charges_by_missing_health() -> bool:
	eq(Life.treatment_fee(100, false), 0)
	eq(Life.treatment_fee(90, false), 50)
	eq(Life.treatment_fee(40, false), 180)
	eq(Life.treatment_fee(40, true), 0)
	return true


func test_treats_for_the_fee_and_passes_half_an_hour() -> bool:
	var out := Life.new().treat(now(10, 500, 40), false)
	match_obj(out, {"ok": true, "cost": 180, "health": Life.MAX_HEALTH})
	eq(out["hours"], Life.TREATMENT_HOURS)
	return true


func test_treatment_is_free_by_ambulance() -> bool:
	match_obj(Life.new().treat(now(10, 0, 20), true), {"ok": true, "cost": 0, "health": Life.MAX_HEALTH})
	return true


func test_refuses_without_money_and_the_free_queue_takes_three_hours() -> bool:
	var life := Life.new()
	match_obj(life.treat(now(10, 20, 40), false), {"ok": false, "cost": 0, "hours": 0})
	match_obj(life.free_queue(now(10, 0, 40)), {"ok": true, "cost": 0, "health": Life.MAX_HEALTH, "hours": Life.FREE_QUEUE_HOURS})
	eq(life.treat(now(10, 500, 100), false)["ok"], false)
	return true


func test_gym_needle_sweeps_and_back() -> bool:
	eq(Life.needle_at(0), 0)
	near(Life.needle_at(Life.NEEDLE_PERIOD / 2), 1)
	near(Life.needle_at(Life.NEEDLE_PERIOD / 4), 0.5)
	near(Life.needle_at(Life.NEEDLE_PERIOD), 0)
	eq(Life.good_rep(0.5), true)
	eq(Life.good_rep(Life.WORKOUT_ZONE[0] - 0.01), false)
	eq(Life.good_rep(0.95), false)
	return true


func test_fitness_rises_once_a_day_with_enough_good_reps() -> bool:
	var life := Life.new()
	match_obj(life.workout(now(9), Life.WORKOUT_GOOD_NEEDED - 1), {"ok": true, "cost": Life.GYM_PASS, "hours": Life.WORKOUT_HOURS})
	eq(life.fitness(), 0)
	life.workout(now(10), Life.WORKOUT_REPS)
	eq(life.fitness(), 1)
	ok(str(life.workout(now(11), Life.WORKOUT_REPS)["message"]).contains("tomorrow"))
	eq(life.fitness(), 1)
	life.sleep(now(22))
	life.workout(now(8), Life.WORKOUT_REPS)
	eq(life.fitness(), 2)
	return true


func test_fitness_raises_sprint_a_little() -> bool:
	eq(Life.sprint_factor(0), 1)
	near(Life.sprint_factor(1), 1.02)
	near(Life.sprint_factor(Life.MAX_FITNESS), 1.1)
	near(Life.sprint_factor(99), 1.1)
	var life := Life.new({"fitness": Life.MAX_FITNESS})
	life.workout(now(8), Life.WORKOUT_REPS)
	eq(life.fitness(), Life.MAX_FITNESS)
	near(life.sprint(), 1.1)
	return true


func test_gym_refuses_without_money_unless_a_friend_pays() -> bool:
	var life := Life.new()
	eq(life.workout(now(8, 10), Life.WORKOUT_REPS)["ok"], false)
	match_obj(life.workout(now(8, 0), Life.WORKOUT_REPS, true), {"ok": true, "cost": 0})
	eq(life.fitness(), 1)
	return true


func test_snacks_restore_health_capped_at_full() -> bool:
	var life := Life.new()
	match_obj(life.buy_snack(now(12, 500, 50), "bajji-plate"), {"ok": true, "cost": 60, "health": 70})
	eq(life.buy_snack(now(12, 500, 95), "bajji-plate")["health"], Life.MAX_HEALTH)
	eq(life.buy_snack(now(12, 10, 50), "bajji-plate")["ok"], false)
	return true


func test_clothes_bought_once_worn_at_once_with_free_socks() -> bool:
	var life := Life.new()
	var out := life.buy_outfit(now(12, 1000), "maroon-shirt")
	match_obj(out, {"ok": true, "cost": 600})
	ok(str(out["message"]).contains("BUY 1 GET 1"))
	eq(life.outfit()["id"], "maroon-shirt")
	eq(life.owns(Life.FREE_SOCKS), true)
	eq(life.buy_outfit(now(12, 1000), "maroon-shirt")["ok"], false)
	eq(life.buy_outfit(now(12, 100), "track-suit")["ok"], false)
	eq(life.buy_outfit(now(12, 1000), "everyday")["ok"], false)
	return true


func test_the_escalator_takes_ten_minutes() -> bool:
	near(Life.new().escalator(now(12))["hours"], Life.ESCALATOR_HOURS)
	return true


func test_cinema_has_three_invented_films_in_different_genres() -> bool:
	eq(Life.FILMS.size(), 3)
	var genres := {}
	for f in Life.FILMS:
		genres[f["genre"]] = true
	eq(genres.size(), 3)
	return true


func test_finds_the_next_show_also_across_midnight() -> bool:
	eq(Life.next_show(10), {"start": 11, "wait": 1})
	eq(Life.next_show(14.5), {"start": 14.5, "wait": 0})
	eq(Life.next_show(19), {"start": 21.5, "wait": 2.5})
	var late := Life.next_show(23)
	eq(late["start"], 11)
	near(late["wait"], 12)
	return true


func test_watching_passes_the_wait_plus_the_film() -> bool:
	var life := Life.new()
	var film: Dictionary = Life.FILMS[1]
	var out := life.watch(now(18), film["id"])
	eq(out["ok"], true)
	eq(out["cost"], Life.TICKET_PRICE)
	near(out["hours"], 0.5 + float(film["runtime"]))
	var text := " ".join(out["lines"])
	ok(text.contains("whistles"))
	ok(text.contains("phone rings"))
	ok(text.contains("INTERVAL"))
	eq(life.state()["films"], [film["id"]])
	eq(Life.clock_text(18 + float(out["hours"])), "21:15")
	return true


func test_a_late_show_counts_the_new_day_no_money_no_ticket() -> bool:
	var life := Life.new()
	life.watch(now(21.5), Life.FILMS[0]["id"])
	eq(life.day(), 1)
	eq(life.watch(now(10, 100), Life.FILMS[0]["id"])["ok"], false)
	eq(life.watch(now(10, 0), Life.FILMS[0]["id"], true)["ok"], true)
	match_obj(life.popcorn(now(12, 100, 50)), {"ok": true, "cost": Life.POPCORN_PRICE, "health": 55})
	return true


func test_counts_midnights_as_the_clock_runs() -> bool:
	var life := Life.new()
	life.tick(23.99, 0.01)
	eq(life.day(), 1)
	life.tick(10, 10.02)
	eq(life.day(), 1)
	eq(Life.days_passed(20, 30), 2)
	eq(Life.days_passed(20, 2), 0)
	return true


func test_an_old_save_loads_fresh_and_writing_keeps_completed_and_money() -> bool:
	var old := {"completed": ["morning-walk", "borrowed-wheels"], "money": 350}
	var life := Life.new(Life.life_from_save(old))
	eq(life.state(), {"day": 0, "fitness": 0, "trainedDay": -1, "outfit": "everyday", "owned": ["everyday", "festival"], "films": [], "stories": []})
	life.workout(now(9), 5)
	var written := Life.save_with_life(old, life.state())
	eq(written["completed"], old["completed"])
	eq(written["money"], 350)
	var reloaded := Life.new(Life.life_from_save(JSON.parse_string(JSON.stringify(written))))
	eq(reloaded.fitness(), 1)
	eq(reloaded.trained_today(), true)
	return true


func test_damaged_values_fall_back_to_safe_ones() -> bool:
	var s := Life.parse_life({"day": "x", "fitness": 99, "outfit": "track-suit", "owned": [1, "socks"], "films": null, "stories": ["a", "a"]})
	eq(s["day"], 0)
	eq(s["fitness"], Life.MAX_FITNESS)
	eq(s["outfit"], "everyday")
	eq(s["owned"], ["everyday", "festival", "socks"])
	eq(s["stories"], ["a"])
	eq(Life.life_from_save(null)["fitness"], 0)
	eq(Life.life_from_save("junk")["outfit"], "everyday")
	return true


func test_reset_forgets_everything() -> bool:
	var life := Life.new({"fitness": 3, "owned": ["track-suit"], "outfit": "track-suit", "stories": ["x"]})
	eq(life.outfit()["id"], "track-suit")
	life.reset()
	eq(life.fitness(), 0)
	eq(life.outfit()["id"], "everyday")
	eq(life.state()["stories"], [])
	return true


# stories.test.ts ------------------------------------------------------------------------------

const O := MissionData.Objective
const St := StoryRunner.Story
const Step := StoryRunner.Step


func _checkup() -> StoryRunner.Story:
	var drive := O.reach("Drive to the hospital", 100, 0, 8)
	drive.mode = "car"
	drive.stop = true
	var home := O.reach("Drive home", 0, 0, 8)
	home.mode = "car"
	home.stop = true
	home.time_limit = 60
	return St.make("checkup", 400, "home", [O.enter("Get in a car", "car"), drive, Step.make_activity("Go in for the check-up", "hospital", "checkup", 100, 5, 3), home])


func _race() -> StoryRunner.Story:
	var juice := O.reach("Race to the juice shop", 50, 0, 4)
	juice.mode = "foot"
	juice.time_limit = 20
	return St.make("race", 300, "gym", [Step.make_activity("Win the workout", "gym", "challenge", 0, 0, 3), juice])


func at(x: float, z: float, mode: String = "foot", speed: float = 0.0) -> MissionData.PlayerStatus:
	return MissionData.PlayerStatus.make(x, z, mode, speed)


func _ids(list: Array) -> Array:
	var out: Array = []
	for s: StoryRunner.Story in list:
		out.append(s.id)
	return out


func test_stories_offered_at_their_place_and_run_in_order() -> bool:
	var runner := StoryRunner.new([_checkup(), _race()])
	eq(_ids(runner.offered_at("home")), ["checkup"])
	eq(_ids(runner.offered_at("gym")), ["race"])
	eq(runner.start("checkup")[0]["type"], "started")
	eq(runner.start("race"), [])
	eq(runner.update(0.1, at(0, 0)), [])
	match_obj(runner.update(0.1, at(0, 0, "car"))[0], {"type": "step", "index": 1})
	eq(runner.update(0.1, at(100, 0, "car", 5)), [])
	match_obj(runner.update(0.1, at(100, 0, "car", 0))[0], {"type": "step", "index": 2})
	eq(runner.wanted("hospital").activity, "checkup")
	is_nil(runner.wanted("home"))
	eq(runner.update(5, at(100, 5)), [])
	eq(runner.activity("hospital", "treat"), [])
	match_obj(runner.activity("hospital", "checkup")[0], {"type": "step", "index": 3})
	eq(runner.seconds_left(), 60)
	match_obj(runner.update(1, at(0, 0, "car", 0))[0], {"type": "completed", "reward": 400})
	is_nil(runner.story())
	ok(runner.completed().has("checkup"))
	eq(runner.offered_at("home"), [])
	eq(runner.start("checkup"), [])
	return true


func test_running_out_of_time_ends_a_story_that_can_start_again() -> bool:
	var runner := StoryRunner.new([_race()])
	runner.start("race")
	runner.activity("gym", "challenge")
	eq(runner.seconds_left(), 20)
	eq(runner.update(19, at(10, 0)), [])
	match_obj(runner.update(1.5, at(20, 0))[0], {"type": "failed", "reason": "Out of time"})
	is_nil(runner.story())
	eq(runner.offered_at("gym").size(), 1)
	runner.start("race")
	runner.activity("gym", "challenge")
	eq(runner.update(1, at(50, 0, "bike")), [])
	match_obj(runner.update(1, at(50, 0))[0], {"type": "completed", "reward": 300})
	return true


func test_quitting_is_free_saved_ids_kept_unknown_dropped() -> bool:
	var runner := StoryRunner.new([_checkup(), _race()], ["race", "gone"])
	eq(runner.completed(), ["race"])
	runner.start("checkup")
	match_obj(runner.quit()[0], {"type": "failed", "reason": "Story abandoned"})
	is_nil(runner.story())
	runner.reset()
	eq(runner.completed().size(), 0)
	return true
