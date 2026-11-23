## Ports of `combat/src/Combat.test.ts` (9 cases on `agent/combat-redesign`, plus the `hurt` case
## from `agent/crash-ejection`, TD-29).
extends "res://tests/unit/rules/combat_helpers.gd"


func test_punches_hit_only_close_and_in_front_with_a_recovery() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(0, -1.2, false), spot(0, 1.2, false)])
	var events: Array[Dictionary] = []
	var hit: Combat.Enemy = combat.punch(player(), events)
	eq(hit.z, -1.2)
	eq(hit.health, 66)
	eq(combat.punch(player(), events), false)
	combat.update(0.5, player({"x": 500.0}))
	is_nil(combat.punch(player({"heading": PI / 2}), events))
	return true


func test_three_punches_knock_an_enemy_down_and_clear_the_group() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(0, -1.2, false)])
	var events: Array[Dictionary] = []
	for i in 3:
		combat.punch(player(), events)
		combat.update(0.5, player())
	eq(types(events), ["enemyHit", "enemyHit", "enemyHit", "enemyDown", "groupCleared"])
	eq(combat.remaining("a"), 0)
	combat.update(6, player())
	eq(combat.enemies.size(), 0)
	return true


func test_shooting_uses_ammo_is_pulled_onto_an_enemy_and_stopped_by_walls() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(3, -20, false)])
	var events: Array[Dictionary] = []
	eq(combat.shoot(player(), events)["fired"], false)
	combat.ammo = 2
	var shot := combat.shoot(player(), events)
	eq((shot["hit"] as Combat.Enemy).health, 66)
	eq(combat.ammo, 1)
	eq(combat.shoot(player(), events)["fired"], false)
	combat.update(0.4, player({"x": 500.0}))
	var miss := combat.shoot(player({"heading": PI}), events)
	match_obj(miss, {"fired": true, "hit": null})
	near(miss["to_z"], 45, 0)
	var blocked := Combat.new(walled())
	blocked.spawn_group("a", [spot(0, -20, false)])
	blocked.ammo = 1
	var stopped := blocked.shoot(player(), [] as Array[Dictionary])
	is_nil(stopped["hit"])
	near(stopped["to_z"], -6, 5)
	return true


func test_unarmed_enemies_notice_run_up_and_punch() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, -15, false)])
	var events := run(combat, 6, player())
	lt(RulesMath.hypot(combat.enemies[0].x, combat.enemies[0].z), 1.8)
	ok(has_type(events, "enemyPunch"))
	lt(combat.health, Combat.PLAYER_MAX_HEALTH)
	return true


func test_enemies_ignore_a_player_they_cannot_see() -> bool:
	var combat := Combat.new(walled(), always(0))
	combat.spawn_group("a", [spot(0, -15, true)])
	eq(run(combat, 5, player()), [])
	eq(combat.enemies[0].z, -15)
	return true


func test_armed_enemies_shoot_from_a_distance_and_can_kill() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, -12, true), spot(4, -12, true)])
	var events := run(combat, 20, player())
	gt(count_type(events, "enemyShot"), 10)
	eq(events.back()["type"], "playerDied")
	eq(combat.health, 0)
	gt(absf(combat.enemies[0].z), 5)
	combat.revive()
	eq(combat.health, Combat.PLAYER_MAX_HEALTH)
	return true


func test_health_comes_back_after_a_few_seconds() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, -1, false)])
	run(combat, 2, player())
	var hurt := combat.health
	lt(hurt, Combat.PLAYER_MAX_HEALTH)
	combat.keep_only([])
	run(combat, 5, player())
	eq(combat.health, hurt)
	run(combat, 20, player())
	eq(combat.health, Combat.PLAYER_MAX_HEALTH)
	return true


func test_a_fast_vehicle_knocks_enemies_down_and_its_driver_cannot_attack() -> bool:
	var combat := Combat.new(open(), always(1))
	combat.spawn_group("a", [spot(0, -1, false)])
	combat.ammo = 5
	var driver := player({"in_vehicle": true, "speed": 10.0})
	eq(combat.punch(driver, [] as Array[Dictionary]), false)
	eq(combat.shoot(driver, [] as Array[Dictionary])["fired"], false)
	ok(has_type(run(combat, 0.2, driver), "enemyDown"))
	return true


func test_spawning_a_group_twice_does_not_double_it() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(0, 0, false)])
	combat.spawn_group("a", [spot(0, 0, false)])
	eq(combat.enemies.size(), 1)
	return true


func test_hurt_a_crash_ignores_the_dodge_and_reports_a_knockout() -> bool:
	var combat := Combat.new(open())
	eq(combat.dodge(), true)
	eq(combat.hurt(30), [{"type": "playerHurt", "amount": 30}])
	eq(combat.health, Combat.PLAYER_MAX_HEALTH - 30)
	eq(types(combat.hurt(500)), ["playerHurt", "playerDied"])
	eq(combat.health, 0)
	eq(combat.hurt(10), [])
	return true
