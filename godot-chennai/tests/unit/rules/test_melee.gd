## Ports of `combat/src/Melee.test.ts` on `agent/combat-redesign` (21 cases, TD-27).
extends "res://tests/unit/rules/combat_helpers.gd"

const F := Melee.COMBAT_FEEL


func test_combo_runs_jab_cross_hook_and_restarts_after_a_pause() -> bool:
	eq(Melee.next_combo_move("", 0), "jab")
	eq(Melee.next_combo_move("jab", 0.5), "cross")
	eq(Melee.next_combo_move("cross", 0.5), "hook")
	eq(Melee.next_combo_move("hook", 0.5), "jab")
	eq(Melee.next_combo_move("cross", float(F["combo_window"]) + 0.1), "jab")
	return true


func test_the_hook_finishes_harder() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(0, -1.2, false, 500)])
	var enemy := combat.enemies[0]
	var events: Array[Dictionary] = []
	var moves: Array = []
	for i in 3:
		enemy.z = -1.2
		combat.punch(player(), events)
		moves.append(combat.last_swing)
		step(combat, 0.5)
	eq(moves, ["jab", "cross", "hook"])
	var damage: Array = []
	var heavy: Array = []
	for e in events:
		if e["type"] == "enemyHit":
			damage.append(e["damage"])
			heavy.append(e["heavy"])
	eq(damage, [34, 34, 34 * 1.4])
	eq(heavy, [false, false, true])
	return true


func test_light_and_heavy_hit_reactions() -> bool:
	eq(Melee.hit_reaction(20), {"stun": 0.35, "knock": 0.25, "heavy": false})
	eq(Melee.hit_reaction(20, "hook"), {"stun": 0.9, "knock": 1.3, "heavy": true})
	eq(Melee.hit_reaction(60)["heavy"], true)
	return true


func test_a_stunned_enemy_is_pushed_away_and_does_not_strike_back() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(0, -1.2, false)])
	step(combat, 0.1)
	var events: Array[Dictionary] = []
	combat.punch(player(), events)
	var reeling := step(combat, float(F["light"]["stun"]) - 0.05)
	no(has_type(reeling, "enemyWindup") or has_type(reeling, "enemyPunch"))
	lt(combat.enemies[0].z, -1.3)
	return true


func test_knock_back_stops_at_a_wall() -> bool:
	var wall := with_solid(func(_x: float, z: float, _dx: float, dz: float, _m: float) -> Variant: return 0.5 if dz < 0 and z < -1.3 else null)
	var combat := Combat.new(wall)
	combat.spawn_group("a", [spot(0, -1.2, false)])
	combat.enemies[0].heavy_hit = false
	combat.punch(player(), [] as Array[Dictionary])
	step(combat, 0.4)
	gt(combat.enemies[0].z, -1.5)
	return true


func _brawl(blocking: bool) -> Dictionary:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, -1.2, false)])
	var events := step(combat, 2.2, player({"blocking": blocking}))
	return {"taken": 100 - combat.health, "events": events}


func test_blocking_takes_a_fifth_of_a_punch() -> bool:
	var unguarded := _brawl(false)
	var guarded := _brawl(true)
	gt(unguarded["taken"], 0)
	near(guarded["taken"], float(unguarded["taken"]) * float(F["block_share"]), 5)
	ok(has_type(guarded["events"], "blocked"))
	return true


func _shot(blocking: bool) -> float:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, -8, true)])
	step(combat, 2, player({"blocking": blocking}))
	return 100 - combat.health


func test_bullets_are_not_blocked() -> bool:
	gt(_shot(true), 0)
	eq(_shot(true), _shot(false))
	return true


func test_a_punch_is_telegraphed_and_a_dodge_in_time_avoids_it() -> bool:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, -1.2, false)])
	var windup_at := -1
	var landed_at := -1
	var i := 0
	while i < 180 and landed_at < 0:
		for e in combat.update(1.0 / 60.0, player()):
			if e["type"] == "enemyWindup":
				windup_at = i
			if e["type"] == "enemyPunch":
				landed_at = i
		i += 1
	ge(windup_at, 0)
	near((landed_at - windup_at) / 60.0, F["windup"], 1)
	var dodger := Combat.new(open(), always(0))
	dodger.spawn_group("a", [spot(0, -1.2, false)])
	var events: Array = []
	var seen_at := -1
	for k in 180:
		var now := dodger.update(1.0 / 60.0, player())
		events.append_array(now)
		if has_type(now, "enemyWindup"):
			seen_at = k
		if seen_at >= 0 and k == seen_at + 6:
			eq(dodger.dodge(), true)
		if has_type(now, "enemyPunch"):
			break
	ok(has_type(events, "dodged"))
	eq(dodger.health, 100)
	return true


func test_a_dodge_needs_a_moment_to_recover() -> bool:
	var combat := Combat.new(open())
	eq(combat.dodge(), true)
	eq(combat.dodge(), false)
	step(combat, float(F["dodge_every"]) + 0.05)
	eq(combat.dodge(), true)
	return true


func test_only_two_brawlers_attack_at_once_the_others_circle() -> bool:
	var combat := Combat.new(open(), always(0.5))
	var spots: Array = []
	for i in 5:
		spots.append(spot(sin(i * 1.3) * 6, cos(i * 1.3) * 6, false, 10000))
	combat.spawn_group("a", spots)
	var most := 0
	for i in 600:
		combat.update(1.0 / 60.0, player())
		var swinging := 0
		for e in combat.enemies:
			if e.windup >= 0:
				swinging += 1
		most = maxi(most, swinging)
	gt(most, 0)
	le(most, F["attackers"])
	var d: Array = []
	for e in combat.enemies:
		d.append(RulesMath.hypot(e.x, e.z))
	d.sort()
	for x: float in d.slice(F["attackers"]):
		gt(x, float(F["circle_at"]) - 1)
	return true


func test_a_gunman_strafes_between_shots_and_keeps_his_distance() -> bool:
	var combat := Combat.new(open(), always(0.99))
	combat.spawn_group("a", [spot(0, -9, true)])
	var start_x := combat.enemies[0].x
	step(combat, 2)
	gt(absf(combat.enemies[0].x - start_x), 0.5)
	var close := Combat.new(open(), always(0.99))
	close.spawn_group("a", [spot(0, -5.5, true)])
	step(close, 1)
	gt(RulesMath.hypot(close.enemies[0].x, close.enemies[0].z), 5.5)
	return true


func test_a_badly_hurt_enemy_backs_off_once() -> bool:
	var combat := Combat.new(open(), always(0.5))
	combat.spawn_group("a", [spot(0, -1.5, false, 100)])
	step(combat, 0.1)
	combat.enemies[0].health = 20
	step(combat, 1.5)
	gt(RulesMath.hypot(combat.enemies[0].x, combat.enemies[0].z), 4)
	return true


func test_a_hurt_enemy_with_a_wall_behind_keeps_fighting() -> bool:
	var wall := with_solid(func(_x: float, z: float, _dx: float, dz: float, _m: float) -> Variant: return 0.5 if dz < -0.1 and z < -1.6 else null)
	var combat := Combat.new(wall, always(0.5))
	combat.spawn_group("a", [spot(0, -1.7, false, 100)])
	step(combat, 0.1)
	combat.enemies[0].health = 20
	var events := step(combat, 1.5)
	gt(combat.enemies[0].z, -2.2)
	ok(has_type(events, "enemyWindup"))
	return true


func test_an_enemy_blocked_ahead_and_on_one_side_goes_round_the_other() -> bool:
	var corner := with_solid(func(x: float, z: float, dx: float, dz: float, _m: float) -> Variant:
		if z < -4 and dz > 0.6:
			return 0.5
		if x > -0.5 and dx > 0.3:
			return 0.5
		return null)
	var combat := Combat.new(corner, always(0.5))
	combat.spawn_group("a", [spot(0, -6, false)])
	combat.enemies[0].strafe = -1
	step(combat, 1)
	lt(combat.enemies[0].x, -0.5)
	return true


func test_attackers_are_kept_while_close_then_the_nearest() -> bool:
	var fighters := [{"id": 1, "distance": 5.0}, {"id": 2, "distance": 2.0}, {"id": 3, "distance": 3.0}, {"id": 4, "distance": 1.0}]
	var a := Melee.choose_attackers(fighters, {}).keys()
	a.sort()
	eq(a, [2, 4])
	var b := Melee.choose_attackers(fighters, {1: true}).keys()
	b.sort()
	eq(b, [1, 4])
	return true


var _sees := func(_c: Dictionary) -> bool: return true


func test_lock_picks_the_nearest_in_front() -> bool:
	eq(Melee.choose_lock(0, 0, 0, [{"id": 1, "x": 0.0, "z": 5.0}, {"id": 2, "x": 0.5, "z": -6.0}, {"id": 3, "x": 6.0, "z": -6.0}], -1, _sees), 2)
	return true


func test_lock_an_enemy_in_the_face_takes_it_from_a_farther_one() -> bool:
	eq(Melee.choose_lock(0, 0, 0, [{"id": 1, "x": 0.0, "z": -6.0}, {"id": 2, "x": 1.2, "z": -1.0}], 1, _sees), 2)
	eq(Melee.choose_lock(0, 0, 0, [{"id": 1, "x": 0.0, "z": -2.0}, {"id": 2, "x": 1.2, "z": -1.0}], 1, _sees), 1)
	return true


func test_lock_keeps_the_current_target_while_close_and_in_sight() -> bool:
	var targets := [{"id": 1, "x": 0.0, "z": -3.0}, {"id": 2, "x": 9.0, "z": 9.0}]
	eq(Melee.choose_lock(0, 0, 0, targets, 2, _sees), 2)
	eq(Melee.choose_lock(0, 0, 0, targets, 2, func(c: Dictionary) -> bool: return c["id"] != 2), 1)
	eq(Melee.choose_lock(0, 0, 0, [{"id": 2, "x": 30.0, "z": 0.0}], 2, _sees), -1)
	return true


func test_pedestrian_outcomes() -> bool:
	eq(Melee.attack_outcome(60, 34, "fists"), {"health": 26, "outcome": "flinch"})
	eq(Melee.attack_outcome(26, 34, "fists"), {"health": 0, "outcome": "injured"})
	eq(Melee.attack_outcome(60, 50, "bat"), {"health": 10, "outcome": "stumble"})
	eq(Melee.attack_outcome(30, 34, "pistol"), {"health": 0, "outcome": "killed"})
	return true


func test_pedestrians_can_be_punched_and_shot_and_are_reported() -> bool:
	var combat := Combat.new(open())
	var events: Array[Dictionary] = []
	is_nil(combat.punch(player(), events, [{"id": 7, "x": 0.0, "z": -1.0}]))
	match_obj(events, [{"type": "civilianHit", "id": 7, "weapon": "fists"}])
	combat.update(1, player())
	combat.ammo = 1
	var shot: Array[Dictionary] = []
	var result := combat.shoot(player(), shot, [{"id": 8, "x": 0.0, "z": -10.0}])
	eq(result["pellets"][0]["civilian"], 8)
	var found := false
	for e in shot:
		if e["type"] == "civilianHit" and e["id"] == 8 and e["weapon"] == "pistol":
			found = true
	ok(found)
	return true


func test_an_enemy_nearer_than_a_pedestrian_takes_the_punch() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(0, -1, false)])
	var events: Array[Dictionary] = []
	not_nil(combat.punch(player(), events, [{"id": 7, "x": 0.0, "z": -1.6}]))
	no(has_type(events, "civilianHit"))
	return true
