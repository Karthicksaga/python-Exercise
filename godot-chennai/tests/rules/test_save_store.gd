## New Godot tests for the save file (G-43): the Three.js localStorage keys and shapes, a
## damaged file loading as a new game, and the progress write keeping the life state.
extends "res://tests/rules/rules_test.gd"

const PATH := "user://rules-test-save.json"


func _fresh() -> SaveStore:
	if FileAccess.file_exists(PATH):
		DirAccess.remove_absolute(PATH)
	return SaveStore.new(PATH)


func test_round_trip_keeps_every_section_in_the_ts_shapes() -> bool:
	var store := _fresh()
	var runner := MissionRunner.new([MissionData.Mission.make("walk", 1, 50, [MissionData.Objective.reach("Go", 0, 0, 3)])])
	runner.update(0.1, MissionData.PlayerStatus.make(0, 0))
	store.save_progress(runner.progress())
	var jobs := JobRunner.new({"reputation": 61, "done": 2, "failed": 1, "best": {"courier": 520}})
	store.set_section(SaveStore.JOBS, jobs.record())
	var arsenal := Arsenal.new()
	arsenal.give("shotgun", 7)
	store.set_section(SaveStore.WEAPONS, arsenal.save())
	var visited := VisitedDistricts.new()
	visited.visit("Egmore")
	store.set_section(SaveStore.DISTRICTS, visited.list())
	store.set_section(SaveStore.HOUR, DayClock.new(9.25).hour)
	store.set_section(SaveStore.WEATHER, "rain")
	eq(store.write(), OK)
	var back := SaveStore.new(PATH).read()
	eq(back.progress(), {"completed": ["walk"], "money": 50})
	eq(MissionRunner.new([MissionData.Mission.make("walk", 1, 50, [])], back.progress()).stages_done(), 1)
	eq(JobRunner.new(back.section(SaveStore.JOBS)).record(), jobs.record())
	var copy := Arsenal.new()
	copy.load_save(back.section(SaveStore.WEAPONS))
	eq(copy.ammo_of("shotgun"), 7)
	eq(VisitedDistricts.new(back.section(SaveStore.DISTRICTS)).list(), ["Egmore"])
	eq(back.section(SaveStore.HOUR), 9.25)
	eq(back.section(SaveStore.WEATHER), "rain")
	return true


func test_progress_write_keeps_the_life_state() -> bool:
	var store := _fresh()
	var life := Life.new()
	life.workout(Life.now_of(9), 5)
	store.set_section(SaveStore.PROGRESS, Life.save_with_life({"completed": [], "money": 0}, life.state()))
	store.save_progress({"completed": ["morning-walk"], "money": 350})
	eq(store.progress(), {"completed": ["morning-walk"], "money": 350})
	eq(Life.new(Life.life_from_save(store.section(SaveStore.PROGRESS))).fitness(), 1)
	return true


func test_a_missing_or_damaged_file_is_a_new_game() -> bool:
	var store := _fresh().read()
	eq(store.data, {})
	eq(store.progress(), {})
	var f := FileAccess.open(PATH, FileAccess.WRITE)
	f.store_string("{not json")
	f.close()
	eq(SaveStore.new(PATH).read().progress(), {})
	store.set_section(SaveStore.PROGRESS, {"completed": "x", "money": 3})
	eq(store.progress(), {}, "wrong types are ignored, as loadProgress does")
	DirAccess.remove_absolute(PATH)
	return true
