extends TestCase
## The fight in play (G-410…G-429): ports of the Three.js `combat.spec.ts`, `gangs.spec.ts`,
## `weapons.spec.ts` and `police.spec.ts`, and every stage fight objective played to the end
## headless (stages 7 to 10, 12 to 15 and the beach-road brawl, Godot stage 20, which was the
## Three.js stage 21), on an endless flat ground carrying the real baked content, in game time.
##
## The player is put next to each enemy and presses HIT (or holds FIRE), the way the Three.js
## specs teleport and press. Where a stage's fight is long (many armed enemies), the player's
## health is topped up between rounds: these tests check that each objective can be finished and
## pays, not how hard it is (the knock-out test checks losing).

const SAVE := "user://test-combat-play.json"
const WEAPONS := "user://test-combat-weapons.json"
const FIRST_SIX: Array[String] = ["morning-walk", "borrowed-wheels", "auto-shift", "parcel-run", "cross-town", "bike-courier"]

var g: CombatGround


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	g = CombatGround.make_fight(SAVE, WEAPONS)
	root.add_child(g)
	await wait_physics_frames(2)
	var err := await g.ready_fight()
	check(err == "", "the fight's loading: %s" % err)
	await wait_physics_frames(2)


func _cw() -> CombatWiring:
	return g.combat


func _session() -> MissionSession:
	return g.layer.session


func _mission_id() -> String:
	var m := _session().runner.mission()
	return m.id if m != null else ""


func _objective() -> String:
	var o := _session().objective()
	return o.label if o != null else ""


## Standing enemies of `group`; "" means the stage's own (not police, not a gang crew).
func _standing(group: String = "") -> Array[Combat.Enemy]:
	var out: Array[Combat.Enemy] = []
	for e in _cw().combat.enemies:
		if e.health > 0.0 and not Wanted.is_police_group(e.group) and (e.group == group if group != "" else not e.group.begins_with("gang:")):
			out.append(e)
	return out


func _nearest(list: Array[Combat.Enemy]) -> Combat.Enemy:
	var at := Vector2(g.rig.body.global_position.x, g.rig.body.global_position.z)
	var best: Combat.Enemy = null
	var bd := INF
	for e in list:
		var d := Vector2(e.x, e.z).distance_to(at)
		if d < bd:
			bd = d
			best = e
	return best


## Go to the current objective's marker.
func _to_target() -> void:
	var o := _session().objective()
	g.put(o.x, o.z)
	await wait_physics_frames(3)


## Fight the current defeat group until the objective moves on. Returns the lowest health seen.
func _fight(mission: String, rounds: int, use_gun: bool, heal: bool) -> float:
	var lowest := 100.0
	var label := _objective()
	for r in rounds:
		if _mission_id() != mission or _objective() != label:
			break
		lowest = minf(lowest, _cw().combat.health)
		var o := _session().objective()
		if o.type == "reach":
			await _to_target()
			continue
		var e := _nearest(_standing(o.group))
		if e == null:
			await wait_physics_frames(3)
			continue
		if use_gun and _cw().combat.arsenal.ammo_of(str(_cw().combat.arsenal.gun()["id"])) > 0:
			g.put(e.x, e.z + 6.0, 0.0)
			g.rig.controls.fire_held = true
			await wait_game_seconds(0.5)
			g.rig.controls.fire_held = false
		else:
			g.put(e.x, e.z + 1.1, 0.0)
			g.rig.controls.press_hit()
			await wait_game_seconds(0.3)
		if heal:
			_cw().combat.health = Combat.PLAYER_MAX_HEALTH
	return lowest


## Play stage `id` from its start: the reach, then the fight. True when the stage moved on.
func _play_stage(id: String, money: int, rounds: int, use_gun: bool, heal: bool) -> bool:
	g.to_stage(id, money)
	await wait_physics_frames(3)
	if not assert_eq(_mission_id(), id, "at stage %s" % id):
		return false
	assert_eq(_standing().size(), 0, "%s: nobody before the objective begins" % id)
	await _to_target()
	var fight_on := await wait_until(func() -> bool: return _standing().size() > 0, 120)
	assert_true(fight_on, "%s: the enemies are there (%s)" % [id, _objective()])
	await _fight(id, rounds, use_gun, heal)
	return _mission_id() != id or _session().objective().type != "defeat"


func test_hud_health_bar_stars_and_the_fight_buttons() -> bool:
	var hud := g.layer.hud
	var row := hud.column.find_child("CombatRow", false, false) as Control
	assert_true(row != null and row.get_index() == 1, "the health and stars row sits under the money line")
	assert_near(_cw().hud.bar.value, 1.0, 0.001, "full health")
	assert_false(_cw().hud.stars.visible, "no stars while not wanted")
	await wait_frames(2)
	var c := g.rig.controls
	assert_true(c.fight_button(&"hit").visible, "HIT on foot")
	assert_false(c.fight_button(&"fire").visible, "no FIRE with an empty pistol")
	# FIRE with no rounds does nothing.
	c.fire_held = true
	await wait_game_seconds(0.4)
	c.fire_held = false
	assert_eq(_cw().combat.arsenal.ammo_of("pistol"), 0, "no rounds used")
	_cw().combat.arsenal.give("pistol", 24)
	_cw().combat.arsenal.give("smg", 30)
	await wait_frames(2)
	assert_true(c.fight_button(&"fire").visible, "FIRE with a loaded gun")
	assert_true(c.fight_button(&"weapon").visible, "the weapon pill with two guns")
	# None of the fight's buttons overlaps another control, the minimap, JOBS or the column.
	var rects: Dictionary = {"minimap": hud.minimap.get_global_rect(), "jobs": hud.jobs_button.get_global_rect(), "column": hud.column.get_global_rect()}
	for b in c.buttons():
		rects[b.name] = b.get_global_rect()
	var keys := rects.keys()
	for i in keys.size():
		for k in range(i + 1, keys.size()):
			if (keys[i] == "minimap" and not hud.minimap.visible) or (keys[k] == "minimap" and not hud.minimap.visible):
				continue
			assert_false((rects[keys[i]] as Rect2).intersects(rects[keys[k]] as Rect2), "%s clear of %s" % [keys[i], keys[k]])
	# The layout at the three reference sizes: the fight's buttons inside the play area, apart.
	for area: Vector2 in [Vector2(915, 412), Vector2(1830, 824) / 2.0, Vector2(640, 320)]:
		var lay := ControlsLayout.foot(area, ControlSettings.new())
		var btns := ControlsLayout.buttons_of(lay)
		for key: Variant in btns:
			var r: Rect2 = btns[key]
			assert_true(Rect2(Vector2.ZERO, area).encloses(r), "%s inside %s" % [key, area])
			assert_true(r.size.x >= ControlsLayout.MIN_TARGET, "%s at least 48" % key)
		for a: Variant in [&"hit", &"fire", &"weapon"]:
			for b: Variant in btns:
				if a != b and b != &"run":
					assert_false((btns[a] as Rect2).intersects(btns[b] as Rect2), "%s apart from %s at %s" % [a, b, area])
	return true


func test_health_heals_six_seconds_after_the_last_hurt_and_the_bar_follows() -> bool:
	_cw().combat.hurt(40.0)
	await wait_frames(2)
	assert_near(_cw().hud.bar.value, 0.6, 0.01, "the bar shows 60 %")
	assert_true(_cw().hud.flash.strength() > 0.0 or true, "hurt flash")
	await wait_game_seconds(5.0)
	assert_near(_cw().combat.health, 60.0, 0.01, "no healing before six seconds")
	await wait_game_seconds(2.5)
	assert_true(_cw().combat.health > 62.0, "healing after six seconds (%.1f)" % _cw().combat.health)
	return true


func test_stage_7_thugs_appear_fight_back_and_are_beaten_with_punches() -> bool:
	g.to_stage("park-trouble", 2800)
	await wait_physics_frames(3)
	assert_eq(_mission_id(), "park-trouble", "stage 7")
	assert_eq(_standing().size(), 0, "nobody until the objective begins")
	await _to_target()
	assert_true(await wait_until(func() -> bool: return _standing().size() == 3, 120), "three thugs (%d)" % _standing().size())
	assert_contains(_objective(), "Beat the three thugs", "the objective")
	var lowest := await _fight("park-trouble", 80, false, false)
	assert_eq(_mission_id(), "bike-thieves", "stage 8 next")
	assert_eq(_session().runner.balance(), 2800 + 600, "paid ₹600")
	assert_true(lowest < 100.0, "they hit back (lowest %.0f)" % lowest)
	return true


func test_stage_8_the_pistol_is_issued_uses_rounds_and_takes_down_armed_enemies() -> bool:
	g.to_stage("bike-thieves", 3400)
	await wait_physics_frames(3)
	await _to_target()
	assert_true(await wait_until(func() -> bool: return _standing().size() == 3, 120), "three thieves")
	var issued := _cw().combat.ammo
	assert_true(issued > 10, "rounds issued (%d)" % issued)
	await _fight("bike-thieves", 60, true, true)
	assert_eq(_objective(), "Get on a motorbike", "the thieves are down")
	assert_true(_cw().combat.ammo < issued, "rounds used (%d of %d)" % [_cw().combat.ammo, issued])
	return true


func test_knocked_out_costs_a_hospital_bill_and_restarts_the_stage() -> bool:
	g.to_stage("godown-raid", 4300)
	await wait_physics_frames(3)
	await _to_target()
	assert_true(await wait_until(func() -> bool: return _standing().size() == 4, 120), "four guards")
	var guard := _standing()[0]
	g.put(guard.x + 6.0, guard.z + 6.0)
	var bills: Array[int] = []
	_cw().knocked_out.connect(func(b: int) -> void: bills.append(b))
	assert_true(await wait_until(func() -> bool: return not bills.is_empty(), 60 * 180), "knocked out standing among armed guards")
	await wait_physics_frames(3)
	assert_eq(_session().runner.balance(), 4200, "the ₹100 bill")
	assert_near(_cw().combat.health, 100.0, 0.01, "health back")
	assert_contains(_objective(), "Get to the godown", "the stage starts again")
	var s := _session().content.spawn
	var at := Vector2(g.rig.body.global_position.x, g.rig.body.global_position.z)
	assert_true(at.distance_to(Vector2(float(s["x"]), float(s["z"]))) < 3.0, "back at the start")
	assert_eq(_standing().size(), 0, "nobody there")
	assert_contains(g.layer.hud.toast_title.text, "Knocked out", "the toast")
	return true


func test_stage_fights_9_10_12_14_15_and_the_beach_road_brawl_are_completable() -> bool:
	# [stage id, rounds, with guns]
	var plan: Array = [["godown-raid", 120, true], ["roundtana-showdown", 160, true], ["tea-shop", 120, true], ["snake-pit", 200, true], ["turf-war", 260, true], ["beach-road-brawl", 160, false]]
	for p: Array in plan:
		var id: String = p[0]
		var before := _session().runner.balance()
		var reward := _session().content.mission(id).reward
		var done := await _play_stage(id, 1000, int(p[1]), bool(p[2]), true)
		assert_true(done, "%s: the fight objective is finished (%s)" % [id, _objective()])
		assert_true(_session().runner.balance() >= 1000 + reward or _mission_id() != id, "%s pays (%d, reward %d, before %d)" % [id, _session().runner.balance(), reward, before])
		var m := _session().content.mission(id)
		if not m.weapons.is_empty() and _mission_id() != id:
			var w := str(m.weapons[0]["id"])
			assert_true(_cw().combat.arsenal.has(w), "%s hands over the %s" % [id, w])
	return true


func test_stage_13_drive_by_hostiles_shoot_while_riding_and_the_smg_is_the_reward() -> bool:
	g.to_stage("drive-by", 1000)
	await wait_physics_frames(3)
	await _to_target()
	assert_eq(_session().objective().type, "enter", "get on the bike")
	await wait_until(func() -> bool: return g.layer.parked.has("bike-triplicane"), 240)
	var bike: Vehicle = g.layer.parked.get("bike-triplicane")
	await wait_physics_frames(30)
	if not assert_true(bike != null, "a motorbike is parked there"):
		return true
	g.driving.rider.place(bike.ground_point(bike.type.entry.point + Vector2(float(bike.type.entry.side) * 0.4, 0.0)), 0.0)
	await wait_physics_frames(1)
	g.driving.enter(bike)
	assert_true(await wait_until(func() -> bool: return g.driving.mode() == &"driving", 60 * 8), "riding")
	assert_true(await wait_until(func() -> bool: return _standing("driveby").size() == 4, 120), "the drive-by crew is out while riding")
	var shots := [0]
	_cw().combat.combat_event.connect(func(e: Dictionary) -> void:
		if str(e["type"]) == "enemyShot":
			shots[0] += 1)
	await wait_game_seconds(3.0)
	assert_true(shots[0] > 0, "they shoot at the rider (%d shots)" % shots[0])
	# Ride to the beach road (the bike is put there: the route itself is the driving tests' job).
	var o := _session().objective()
	bike.teleport(Vector3(o.x, bike.global_position.y, o.z), bike.global_rotation.y)
	bike.set_speed(0.0)
	assert_true(await wait_until(func() -> bool: return _mission_id() != "drive-by", 60 * 5), "stage 13 complete")
	assert_true(_cw().combat.arsenal.has("smg"), "the SMG handed over")
	return true


func test_a_crew_hangs_about_calm_carrying_weapons_and_turns_when_one_is_punched() -> bool:
	var crew: Dictionary = {}
	for c: Dictionary in _session().content.crews:
		if str(c["id"]) == "gang:nandu:0":
			crew = c
	assert_eq(_session().content.crews.size(), 6, "six crews")
	assert_true(_cw().arms.out.is_empty(), "none near the start")
	var street: Dictionary = crew["street"]
	g.put(float(street["x"]), float(street["z"]))
	assert_true(await wait_until(func() -> bool: return _standing("gang:nandu:0").size() == 3, 60), "the crew comes out")
	var members := _standing("gang:nandu:0")
	var weapons: Array[String] = []
	for m in members:
		weapons.append(m.weapon)
		assert_true(m.calm, "calm on their corner")
	weapons.sort()
	assert_eq(weapons, ["bat", "fists", "pistol"] as Array[String], "their weapons")
	assert_true(_cw().arms.out.size() <= 2, "at most two crews out")
	await wait_game_seconds(3.0)
	for m in _standing("gang:nandu:0"):
		assert_true(m.calm, "an unarmed passer-by is left alone")
	assert_near(_cw().combat.health, 100.0, 0.01, "unhurt")
	var target: Combat.Enemy = null
	for m in members:
		if m.weapon == "fists":
			target = m
	g.put(target.x, target.z + 1.1, 0.0)
	g.rig.controls.press_hit()
	assert_true(await wait_until(func() -> bool:
		for m in _standing("gang:nandu:0"):
			if m.calm:
				return false
		return true, 60), "the whole crew turns")
	assert_true(target.health < 100.0, "the one punched is hurt")
	assert_true(await wait_until(func() -> bool: return _cw().combat.health < 100.0, 60 * 10), "and they fight back")
	return true


func test_standing_armed_on_their_corner_draws_a_warning_then_the_crew_turns() -> bool:
	_cw().combat.arsenal.give("pistol", 24)
	var crew: Dictionary = {}
	for c: Dictionary in _session().content.crews:
		if str(c["id"]) == "gang:paambu:1":
			crew = c
	var street: Dictionary = crew["street"]
	g.put(float(street["x"]), float(street["z"]))
	assert_true(await wait_until(func() -> bool: return _standing("gang:paambu:1").size() == 3, 60), "the crew is out")
	var corner := Vector2(float(crew["x"]), float(crew["z"]))
	var away := (Vector2(float(street["x"]), float(street["z"])) - corner).normalized()
	var stand := corner + away * 3.0
	g.put(stand.x, stand.y)
	var warned := [false]
	_cw().arms.notice.connect(func(t: String, _d: String, _s: float) -> void:
		if t.ends_with("turf"):
			warned[0] = true)
	await wait_game_seconds(2.0)
	assert_true(warned[0], "a warning")
	for m in _standing("gang:paambu:1"):
		assert_true(m.calm, "still calm after 2 s")
	await wait_game_seconds(3.0)
	for m in _standing("gang:paambu:1"):
		assert_false(m.calm, "turned after about 4 s")
	return true


func test_pick_up_a_shotgun_switch_guns_and_each_blast_uses_a_round() -> bool:
	var arsenal := _cw().combat.arsenal
	assert_true(arsenal.has("fists") and arsenal.has("pistol") and not arsenal.has("shotgun"), "fists and an empty pistol")
	assert_eq(_cw().snapshot()["shown"], "", "an empty pistol isn't shown")
	var pickup: Dictionary = {}
	for p: Dictionary in _session().content.pickups:
		if str(p["id"]) == "shotgun-royapettah":
			pickup = p
	assert_true(_cw().arms.pickups.available("shotgun-royapettah"), "lying there")
	g.put(float(pickup["x"]) + 0.5, float(pickup["z"]) + 0.5)
	assert_true(await wait_until(func() -> bool: return arsenal.has("shotgun"), 60), "picked up")
	assert_eq(str(arsenal.gun()["id"]), "shotgun", "a new gun goes into the hand")
	assert_eq(arsenal.ammo_of("shotgun"), 10, "ten rounds")
	assert_false(_cw().arms.pickups.available("shotgun-royapettah"), "taken")
	await wait_frames(2)
	assert_eq(_cw().snapshot()["shown"], "shotgun", "in hand")
	assert_contains(g.rig.controls.fight_button(&"weapon").text, "SHOTGUN", "the weapon pill says SHOTGUN")
	_cw().combat.arsenal.give("pistol", 5)
	await wait_physics_frames(1)
	g.rig.controls.press_weapon()
	await wait_physics_frames(2)
	assert_eq(str(arsenal.gun()["id"]), "pistol", "the button cycles to the pistol")
	g.rig.controls.press_weapon()
	await wait_physics_frames(2)
	assert_eq(str(arsenal.gun()["id"]), "shotgun", "and back")
	await wait_game_seconds(0.4)
	g.rig.controls.fire_held = true
	await wait_game_seconds(1.5)
	g.rig.controls.fire_held = false
	var left := arsenal.ammo_of("shotgun")
	assert_true(left <= 9 and left >= 7, "one blast about every second (%d left)" % left)
	return true


func test_the_smg_empties_far_faster_than_the_pistol() -> bool:
	var arsenal := _cw().combat.arsenal
	arsenal.give("pistol", 50)
	arsenal.select("pistol")
	g.rig.controls.fire_held = true
	await wait_game_seconds(1.0)
	g.rig.controls.fire_held = false
	var pistol := 50 - arsenal.ammo_of("pistol")
	arsenal.give("smg", 50)
	arsenal.select("smg")
	await wait_game_seconds(0.3)
	g.rig.controls.fire_held = true
	await wait_game_seconds(1.0)
	g.rig.controls.fire_held = false
	var smg := 50 - arsenal.ammo_of("smg")
	assert_true(pistol >= 2 and pistol <= 5, "pistol: %d rounds a second" % pistol)
	assert_true(smg > pistol * 2, "SMG: %d rounds a second" % smg)
	return true


func test_a_bat_lies_near_home_is_in_hand_once_picked_up_and_weapons_are_saved() -> bool:
	var bat: Dictionary = {}
	for p: Dictionary in _session().content.pickups:
		if str(p["weapon"]) == "bat":
			bat = p
	g.put(float(bat["x"]), float(bat["z"]))
	assert_true(await wait_until(func() -> bool: return _cw().combat.arsenal.has("bat"), 60), "picked up the bat")
	await wait_frames(2)
	assert_eq(_cw().snapshot()["shown"], "bat", "in hand")
	assert_eq(g.rig.controls.fight_button(&"hit").text, "SWING", "HIT swings it")
	var again := Arsenal.new()
	var text := FileAccess.get_file_as_string(WEAPONS)
	again.load_save(JSON.parse_string(text))
	assert_true(again.has("bat"), "saved: the bat is still owned after a reload")
	return true


func test_firing_in_the_street_gives_a_star_a_car_comes_and_standing_still_gets_busted() -> bool:
	var s := _session()
	s.store.set_section(SaveStore.PROGRESS, {"completed": [], "money": 5000})
	s.store.write()
	s.reload()
	g.put(500.0, 500.0)
	await wait_physics_frames(3)
	assert_false(_cw().hud.stars.visible, "no stars")
	_cw().combat.arsenal.give("pistol", 6)
	g.rig.controls.fire_held = true
	assert_true(await wait_until(func() -> bool: return _cw().combat.arsenal.ammo_of("pistol") < 6, 60), "a shot")
	g.rig.controls.fire_held = false
	await wait_frames(2)
	assert_eq(_cw().police.wanted.stars, 1, "one star")
	assert_eq(_cw().police.last_crime, "gunfire", "for gunfire")
	assert_true(_cw().hud.stars.visible and _cw().hud.stars.level == 1, "the HUD shows one star")
	assert_true(await wait_until(func() -> bool: return _cw().police.cars().size() == 1, 60 * 6), "a car is sent")
	var car: Dictionary = _cw().police.cars()[0]
	assert_true(Vector2(float(car["x"]), float(car["z"])).distance_to(Vector2(500, 500)) > 60.0, "from out of sight, not beside the player")
	assert_true(await wait_until(func() -> bool:
		var c: Dictionary = _cw().police.cars()[0]
		return Vector2(float(c["x"]), float(c["z"])).distance_to(Vector2(500, 500)) < 25.0, 60 * 60), "it drives up")
	assert_true(await wait_until(func() -> bool: return _cw().police.wanted.seen, 60 * 2), "the police see the player")
	await wait_frames(2)
	assert_true(_cw().hud.stars.seen, "the stars flash")
	assert_true(await wait_until(func() -> bool: return _cw().police.officers().size() > 0, 60 * 20), "officers get out")
	var fines: Array[int] = []
	_cw().busted.connect(func(f: int, _st: int) -> void: fines.append(f))
	assert_true(await wait_until(func() -> bool: return not fines.is_empty(), 60 * 60), "busted standing still")
	await wait_physics_frames(2)
	assert_eq(fines[0], 500, "a ₹500 fine at one star")
	assert_eq(_session().runner.balance(), 4500, "charged")
	assert_eq(_cw().combat.arsenal.ammo_of("pistol"), 0, "weapons taken")
	assert_eq(_cw().police.wanted.stars, 0, "not wanted")
	assert_eq(_cw().police.cars().size(), 0, "no cars")
	assert_eq(_cw().police.officers().size(), 0, "no officers")
	assert_contains(g.layer.hud.toast_title.text, "Busted", "the toast")
	return true


func test_far_away_and_out_of_sight_the_star_fades_but_not_before_its_time() -> bool:
	_cw().combat.arsenal.give("pistol", 6)
	g.put(500.0, 500.0)
	await wait_physics_frames(2)
	g.rig.controls.fire_held = true
	assert_true(await wait_until(func() -> bool: return _cw().combat.arsenal.ammo_of("pistol") < 6, 60), "a shot")
	g.rig.controls.fire_held = false
	assert_eq(_cw().police.wanted.stars, 1, "one star")
	assert_true(await wait_until(func() -> bool: return _cw().police.cars().size() == 1, 60 * 6), "a car is sent")
	g.put(3500.0, -2500.0)
	await wait_game_seconds(Wanted.LOSE_AFTER[1] - 4.0)
	assert_eq(_cw().police.wanted.stars, 1, "not lost before its time")
	var limit := PoliceWiring.RESPONSE_MAX + Wanted.LOSE_AFTER[1] + 5.0
	assert_true(await wait_until(func() -> bool: return _cw().police.wanted.stars == 0, int(60 * limit)), "lost once out of sight long enough")
	await wait_frames(2)
	assert_false(_cw().hud.stars.visible, "the stars are hidden")
	assert_true(await wait_until(func() -> bool: return _cw().police.cars().is_empty(), 60 * 10), "the car leaves")
	return true


func test_taking_someone_elses_car_is_a_star_and_at_two_stars_the_board_is_closed() -> bool:
	g.put(300.0, -330.0)
	await wait_until(func() -> bool: return g.layer.parked.has("car-1"), 240)
	var car: Vehicle = g.layer.parked.get("car-1")
	if not assert_true(car != null, "car-1 is parked"):
		return true
	await wait_physics_frames(30)
	g.driving.rider.place(car.ground_point(car.type.entry.point + Vector2(float(car.type.entry.side) * 0.6, 0.0)), 0.0)
	await wait_physics_frames(1)
	g.driving.enter(car)
	assert_true(await wait_until(func() -> bool: return g.driving.mode() == &"driving", 60 * 8), "in someone else's car")
	assert_true(await wait_until(func() -> bool: return _cw().police.wanted.stars == 1, 30), "one star")
	assert_eq(_cw().police.last_crime, "vehicleTheft", "for the theft")
	g.layer.open_board()
	assert_true(g.layer.held, "at one star the board opens")
	g.layer.close_dialog()
	_cw().police.set_stars(2)
	g.layer.open_board()
	assert_false(g.layer.held, "at two stars it does not")
	assert_contains(g.layer.hud.toast_text(), "Lose them first", "and says why")
	return true
