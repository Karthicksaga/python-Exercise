## Ports of `combat/src/Weapons.test.ts` on `agent/combat-redesign` (21 cases, including the two
## WeaponPickups cases).
extends "res://tests/unit/rules/combat_helpers.gd"

var W := Weapons.TABLE


func _shotgun_combat(random: Variant) -> Combat:
	var combat := Combat.new(open(), random)
	combat.arsenal.give("shotgun", 5)
	combat.arsenal.select("shotgun")
	return combat


func test_each_weapon_has_a_distinct_role() -> bool:
	gt(W["bat"]["damage"], W["fists"]["damage"])
	gt(W["bat"]["range"], W["fists"]["range"])
	gt(W["bat"]["interval"], W["fists"]["interval"])
	gt(float(W["shotgun"]["damage"]) * int(W["shotgun"]["pellets"]), float(W["pistol"]["damage"]) * 3)
	lt(W["shotgun"]["range"], W["smg"]["range"])
	lt(W["shotgun"]["range"], W["pistol"]["range"])
	gt(W["shotgun"]["interval"], W["pistol"]["interval"])
	lt(W["smg"]["interval"], float(W["pistol"]["interval"]) / 3)
	gt(W["smg"]["spread"], 0)
	eq(W["pistol"]["spread"], 0)
	gt(W["smg"]["max_ammo"], W["pistol"]["max_ammo"])
	eq(Weapons.GUNS, ["pistol", "shotgun", "smg"])
	return true


func test_damage_falls_off_to_the_stated_fraction_at_the_range() -> bool:
	eq(Weapons.damage_factor(W["shotgun"], 2), 1)
	near(Weapons.damage_factor(W["shotgun"], 5), 1, 6)
	near(Weapons.damage_factor(W["shotgun"], 14), 0.4, 6)
	near(Weapons.damage_factor(W["shotgun"], 9.5), 0.7, 6)
	eq(Weapons.damage_factor(W["shotgun"], 14.1), 0)
	eq(Weapons.hit_damage(W["shotgun"], 3), 20)
	eq(Weapons.hit_damage(W["shotgun"], 14), 8)
	eq(Weapons.hit_damage(W["pistol"], 40), 34)
	eq(Weapons.hit_damage(W["smg"], 30), RulesMath.js_round(14 * 0.6))
	return true


func test_strays_within_the_spread_both_ways() -> bool:
	near(Weapons.stray_angle(W["smg"], 1, 0), 1 - float(W["smg"]["spread"]), 9)
	near(Weapons.stray_angle(W["smg"], 1, 0.5), 1, 9)
	near(Weapons.stray_angle(W["smg"], 1, 0.999999), 1 + float(W["smg"]["spread"]), 5)
	eq(Weapons.stray_angle(W["pistol"], 1, 0.9), 1)
	return true


func test_arsenal_starts_with_fists_and_an_empty_pistol() -> bool:
	var a := Arsenal.new()
	ok(a.has("fists") and a.has("pistol"))
	eq(a.has("shotgun"), false)
	eq(a.gun()["id"], "pistol")
	eq(a.melee()["id"], "fists")
	eq(a.try_fire(), {})
	return true


func test_one_round_per_shot_and_the_fire_interval() -> bool:
	var a := Arsenal.new()
	a.give("shotgun", 3)
	eq(a.select("shotgun"), true)
	eq(a.try_fire().get("id"), "shotgun")
	eq(a.ammo_of("shotgun"), 2)
	eq(a.try_fire(), {})
	a.tick(float(W["shotgun"]["interval"]) - 0.01)
	eq(a.try_fire(), {})
	a.tick(0.02)
	no(a.try_fire().is_empty())
	a.tick(1)
	no(a.try_fire().is_empty())
	a.tick(1)
	eq(a.try_fire(), {})
	eq(a.ammo_of("shotgun"), 0)
	return true


func test_the_smg_fires_about_eleven_rounds_a_second() -> bool:
	var a := Arsenal.new()
	a.give("smg", 100)
	a.select("smg")
	var shots := 0
	for i in 60:
		if not a.try_fire().is_empty():
			shots += 1
		a.tick(1.0 / 60.0)
	ge(shots, 10)
	le(shots, 12)
	eq(a.ammo_of("smg"), 100 - shots)
	return true


func test_caps_rounds_and_reports_what_was_added() -> bool:
	var a := Arsenal.new()
	eq(a.give("shotgun"), W["shotgun"]["clip"])
	eq(a.give("shotgun", 1000), int(W["shotgun"]["max_ammo"]) - int(W["shotgun"]["clip"]))
	eq(a.ammo_of("shotgun"), W["shotgun"]["max_ammo"])
	eq(a.give("shotgun", 5), 0)
	return true


func test_cycles_guns_in_order_and_pauses_before_the_new_gun_fires() -> bool:
	var a := Arsenal.new()
	eq(a.cycle(), "pistol")
	a.give("smg", 10)
	a.give("shotgun", 10)
	eq(a.guns(), ["pistol", "shotgun", "smg"])
	eq(a.cycle(), "shotgun")
	eq(a.try_fire(), {})
	a.tick(0.3)
	eq(a.try_fire().get("id"), "shotgun")
	eq(a.cycle(), "smg")
	eq(a.cycle(), "pistol")
	eq(a.select("bat"), false)
	return true


func test_swings_the_bat_once_owned() -> bool:
	var a := Arsenal.new()
	eq(a.try_swing().get("id"), "fists")
	a.tick(1)
	a.give("bat")
	eq(a.try_swing().get("id"), "bat")
	a.tick(float(W["bat"]["interval"]) - 0.05)
	eq(a.try_swing(), {})
	return true


func test_saves_and_loads_ignoring_damaged_data() -> bool:
	var a := Arsenal.new()
	a.give("shotgun", 7)
	a.give("bat")
	a.select("shotgun")
	var copy := Arsenal.new()
	copy.load_save(JSON.parse_string(JSON.stringify(a.save())))
	eq(copy.ammo_of("shotgun"), 7)
	eq(copy.has("bat"), true)
	eq(copy.gun()["id"], "shotgun")
	copy.load_save({"owned": ["rocket", 3], "ammo": {"pistol": "many", "smg": 9999}, "gun": "rocket"})
	eq(copy.has("bat"), false)
	eq(copy.ammo_of("smg"), W["smg"]["max_ammo"])
	eq(copy.gun()["id"], "pistol")
	copy.load_save(null)
	eq(copy.guns(), ["pistol"])
	return true


func test_the_shotgun_knocks_down_close_but_only_wounds_far() -> bool:
	var combat := _shotgun_combat(always(0.5))
	combat.spawn_group("near", [spot(0, -3, false)])
	var events: Array[Dictionary] = []
	var shot := combat.shoot(player(), events)
	eq(shot["weapon"], "shotgun")
	eq((shot["pellets"] as Array).size(), 6)
	eq(combat.remaining("near"), 0)
	combat.update(1, player({"x": 500.0}))
	combat.spawn_group("far", [spot(0, -13, false)])
	combat.shoot(player(), events)
	var far: Combat.Enemy = null
	for e in combat.enemies:
		if e.group == "far":
			far = e
	eq(far.health, 100 - 6 * Weapons.hit_damage(W["shotgun"], 13))
	gt(far.health, 0)
	return true


func test_the_shotgun_pellets_spread_and_at_range_most_miss() -> bool:
	var combat := _shotgun_combat(rolls([0, 1, 0, 1, 0.5, 0.5]))
	combat.spawn_group("a", [spot(0, -12, false)])
	var shot := combat.shoot(player(), [] as Array[Dictionary])
	var hits := 0
	for p: Dictionary in shot["pellets"]:
		if p["hit"] != null:
			hits += 1
	eq(hits, 2)
	return true


func test_the_smg_bullets_stray() -> bool:
	var combat := Combat.new(open(), rolls([0.5, 1]))
	combat.arsenal.give("smg", 10)
	combat.arsenal.select("smg")
	combat.spawn_group("a", [spot(0, -20, false)])
	not_nil(combat.shoot(player(), [] as Array[Dictionary])["hit"])
	combat.update(0.2, player({"x": 900.0}))
	is_nil(combat.shoot(player(), [] as Array[Dictionary])["hit"])
	eq(combat.arsenal.ammo_of("smg"), 8)
	return true


func test_pellets_hit_people_whose_own_box_the_wall_ray_meets() -> bool:
	var box := func(_x: float, _z: float, _dx: float, dz: float, _m: float) -> Variant: return 8 - 0.28 if dz < 0 else null
	var combat := Combat.new(CombatWorld.make(Callable(), box, box), always(0.5))
	combat.arsenal.give("smg", 5)
	combat.arsenal.select("smg")
	combat.spawn_group("a", [spot(0, -8, false)])
	not_nil(combat.shoot(player(), [] as Array[Dictionary])["hit"])
	var seven := func(_x: float, _z: float, _dx: float, _dz: float, _m: float) -> Variant: return 7.0
	var walled_combat := Combat.new(CombatWorld.make(Callable(), seven, seven), always(0.5))
	walled_combat.arsenal.give("smg", 5)
	walled_combat.arsenal.select("smg")
	walled_combat.spawn_group("a", [spot(0, -8, false)])
	is_nil(walled_combat.shoot(player(), [] as Array[Dictionary])["hit"])
	return true


func test_a_gun_does_not_reach_past_its_range() -> bool:
	var combat := _shotgun_combat(always(0.5))
	combat.spawn_group("a", [spot(0, -16, false)])
	var shot := combat.shoot(player(), [] as Array[Dictionary])
	eq(shot["fired"], true)
	is_nil(shot["hit"])
	near(RulesMath.hypot(shot["to_x"], shot["to_z"]), W["shotgun"]["range"], 6)
	return true


func test_every_shot_reports_where_it_was_fired_from() -> bool:
	var combat := Combat.new(open())
	combat.ammo = 2
	var events: Array[Dictionary] = []
	combat.shoot(player({"x": 4.0, "z": 5.0}), events)
	ok(events.any(func(e: Dictionary) -> bool: return same(e, {"type": "playerShot", "x": 4, "z": 5, "weapon": "pistol"})))
	combat.update(1, player())
	combat.shoot(player({"in_vehicle": true}), events)
	eq(count_type(events, "playerShot"), 1)
	return true


func test_the_bat_knocks_an_enemy_down_in_two_swings() -> bool:
	var combat := Combat.new(open())
	combat.arsenal.give("bat")
	combat.spawn_group("a", [spot(0, -2.1, false)])
	var events: Array[Dictionary] = []
	eq((combat.punch(player(), events) as Combat.Enemy).health, 50)
	for i in 90:
		combat.update(1.0 / 60.0, player())
	combat.punch(player(), events)
	eq(combat.remaining("a"), 0)
	return true


func _hurt_by(weapon: String, z: float) -> float:
	var combat := Combat.new(open(), always(0))
	combat.spawn_group("a", [spot(0, z, weapon == "pistol" or weapon == "shotgun", 0, weapon)])
	for i in 120:
		combat.update(1.0 / 60.0, player())
	return 100 - combat.health


func test_enemies_use_their_own_weapons() -> bool:
	gt(_hurt_by("shotgun", -8), _hurt_by("pistol", -8))
	gt(_hurt_by("bat", -1.2), _hurt_by("fists", -1.2))
	return true


var _spots := [{"id": "s", "weapon": "shotgun", "ammo": 10, "x": 10.0, "z": 0.0}]


func test_pickup_taken_on_foot_not_by_driving_past() -> bool:
	var pickups := WeaponPickups.new(_spots)
	eq(pickups.update(0.1, 10 + WeaponPickups.PICKUP_RADIUS + 0.1, 0, true).size(), 0)
	eq(pickups.update(0.1, 10, 0, false).size(), 0)
	var taken := pickups.update(0.1, 10.5, 0.5, true)
	eq(taken.size(), 1)
	eq(taken[0]["weapon"], "shotgun")
	eq(pickups.available("s"), false)
	eq(pickups.update(0.1, 10, 0, true).size(), 0)
	return true


func test_pickup_comes_back_after_a_while() -> bool:
	var pickups := WeaponPickups.new(_spots)
	pickups.update(0.1, 10, 0, true)
	pickups.update(WeaponPickups.PICKUP_RESPAWN - 1, 0, 0, true)
	eq(pickups.available("s"), false)
	pickups.update(1.1, 0, 0, true)
	eq(pickups.available("s"), true)
	return true
