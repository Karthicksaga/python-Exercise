## Ports of `combat/src/Gangs.test.ts` (12 cases).
extends "res://tests/unit/rules/combat_helpers.gd"

const R := Gangs.GANG_RULES


func _crew() -> Array:
	return [calm_spot(0, -6, false, "bat", 0xd4a017), calm_spot(2, -6, true, "pistol", 0xd4a017)]


func test_unease_builds_only_armed_and_close_and_fades_slower() -> bool:
	var s := Gangs.linger_step(0, 5, true, 1)
	eq(s, {"unease": 1, "provoked": false})
	s = Gangs.linger_step(s["unease"], 5, false, 1)
	near(s["unease"], 1 - float(R["linger_cool_rate"]), 9)
	eq(Gangs.linger_step(0, float(R["linger_range"]) + 0.1, true, 1)["unease"], 0)
	eq(Gangs.linger_step(float(R["linger_time"]) - 0.5, 3, true, 0.5)["provoked"], true)
	return true


func test_gunshots_are_heard_within_the_alarm_distance() -> bool:
	eq(Gangs.hears_gunshot(0, 0, float(R["gunshot_alarm"]) - 1, 0), true)
	eq(Gangs.hears_gunshot(0, 0, float(R["gunshot_alarm"]) + 1, 0), false)
	return true


func test_a_calm_crew_ignores_an_unarmed_player() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("gang:a:0", _crew())
	var events := step(combat, 10, player())
	eq(count_type(events, "playerHurt"), 0)
	ok(combat.enemies.all(func(e: Combat.Enemy) -> bool: return e.calm and not e.alerted))
	return true


func test_turns_hostile_all_together_when_one_is_hit() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("gang:a:0", _crew())
	var far := EnemySpot.make(50, 50, false)
	far.calm = true
	combat.spawn_group("gang:b:0", [far])
	combat.ammo = 5
	var events: Array[Dictionary] = []
	var shot := combat.shoot(player(), events)
	not_nil(shot["hit"])
	ok(events.any(func(e: Dictionary) -> bool: return same(e, {"type": "crewProvoked", "group": "gang:a:0"})))
	for e in combat.enemies:
		if e.group == "gang:a:0":
			ok(not e.calm and e.alerted)
		else:
			eq(e.calm, true)
	ok(has_type(step(combat, 4, player()), "playerHurt"))
	return true


func test_a_punch_turns_the_crew_too() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("gang:a:0", [calm_spot(0, -1.2, false), calm_spot(3, -6, true)])
	var events: Array[Dictionary] = []
	combat.punch(player(), events)
	ok(has_type(events, "crewProvoked"))
	ok(combat.enemies.all(func(e: Combat.Enemy) -> bool: return not e.calm))
	return true


func test_a_shot_nearby_turns_a_crew_even_when_it_misses() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("gang:a:0", _crew())
	combat.ammo = 5
	var events: Array[Dictionary] = []
	is_nil(combat.shoot(player({"heading": PI}), events)["hit"])
	eq(types(events), ["playerShot", "crewProvoked"])
	return true


func test_lingering_armed_draws_a_warning_then_the_crew_turns() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("gang:a:0", _crew())
	var close := player({"z": -2.0, "armed": true})
	eq(types(step(combat, float(R["warn_at"]) + 0.1, close)), ["crewWarning"])
	ok(combat.enemies.all(func(e: Combat.Enemy) -> bool: return e.calm))
	ok(has_type(step(combat, float(R["linger_time"]) - float(R["warn_at"]), close), "crewProvoked"))
	ok(combat.enemies.all(func(e: Combat.Enemy) -> bool: return not e.calm))
	return true


func test_an_armed_player_keeping_distance_or_driving_past_is_left_alone() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("gang:a:0", _crew())
	step(combat, 20, player({"z": 6.0, "armed": true}))
	step(combat, 20, player({"z": -5.0, "armed": true, "in_vehicle": true}))
	ok(combat.enemies.all(func(e: Combat.Enemy) -> bool: return e.calm))
	return true


func test_remove_group_takes_a_crew_off_at_once() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("gang:a:0", _crew())
	combat.spawn_group("park", [spot(9, 9, false)])
	combat.remove_group("gang:a:0")
	eq(combat.enemies.map(func(e: Combat.Enemy) -> String: return e.group), ["park"])
	return true


var _crews := [{"id": "a", "x": 0.0, "z": 50.0}, {"id": "b", "x": 0.0, "z": 80.0}, {"id": "c", "x": 0.0, "z": 100.0}, {"id": "d", "x": 0.0, "z": 400.0}]


func test_fields_the_nearest_crews_in_range_up_to_the_cap() -> bool:
	eq(Gangs.crews_to_field(_crews, 0, 0, {}, {}), ["a", "b"])
	eq(Gangs.crews_to_field(_crews, 0, 0, {}, {}, 3), ["a", "b", "c"])
	eq(Gangs.crews_to_field(_crews, 0, 1000, {}, {}), [])
	return true


func test_keeps_a_crew_out_until_well_past_the_edge() -> bool:
	var one := [{"id": "a", "x": 0.0, "z": 130.0}]
	eq(Gangs.crews_to_field(one, 0, 0, {}, {}), [])
	eq(Gangs.crews_to_field(one, 0, 0, {"a": true}, {}), ["a"])
	eq(Gangs.crews_to_field([{"id": "a", "x": 0.0, "z": float(R["leave_range"]) + 1}], 0, 0, {"a": true}, {}), [])
	return true


func test_leaves_a_beaten_crews_corner_empty_while_it_regroups() -> bool:
	eq(Gangs.crews_to_field(_crews, 0, 0, {"a": true}, {"a": true}), ["b", "c"])
	return true
