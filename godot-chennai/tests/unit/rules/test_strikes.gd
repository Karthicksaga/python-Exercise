## Ports of `combat/src/Strikes.test.ts` (strike timing, the swing clock, knock-back room) and the
## children rule of the fight (`FightSafety`, G-415).
extends "res://tests/unit/rules/combat_helpers.gd"

const STEP := 1.0 / 60.0


func test_every_blow_lands_within_its_weapons_interval() -> bool:
	eq(Strikes.strike_kind("fists"), "punch")
	eq(Strikes.strike_kind("pistol"), "punch")
	eq(Strikes.strike_kind("bat"), "bat")
	ok(Strikes.windup("punch") < float(Weapons.spec("fists")["interval"]), "punch wind-up inside the interval")
	ok(Strikes.windup("bat") < float(Weapons.spec("bat")["interval"]), "bat wind-up inside the interval")
	ok(Strikes.windup("punch") + Strikes.recover("punch") <= float(Weapons.spec("fists")["interval"]), "a whole punch")
	ok(Strikes.windup("bat") + Strikes.recover("bat") <= float(Weapons.spec("bat")["interval"]), "a whole swing")
	ok(Strikes.windup("bat") > Strikes.windup("punch"), "the bat is drawn back for longer")
	return true


func test_the_swing_lands_once_at_the_end_of_its_windup() -> bool:
	for kind: String in ["punch", "bat"]:
		var clock := SwingClock.new()
		ok(clock.begin(kind), "begins")
		no(clock.begin("punch"), "one swing at a time")
		var landed_at := -1.0
		for i in range(1, 61):
			var landed := clock.step(STEP)
			if landed != "":
				eq(landed_at, -1.0)
				eq(landed, kind)
				landed_at = i * STEP
		ok(absf(landed_at - Strikes.windup(kind)) < 0.02, "%s lands at its wind-up (%.3f)" % [kind, landed_at])
		ok(landed_at >= Strikes.windup(kind) - 1e-9, "never before")
		eq(clock.kind(), "")
	var cancelled := SwingClock.new()
	cancelled.begin("punch")
	cancelled.cancel()
	eq(cancelled.step(1.0), "")
	return true


func test_knock_back_stops_short_of_a_wall() -> bool:
	ok(is_equal_approx(Strikes.knock_back_room(open(), 0, 0, 1, 0, 0.65), 0.65), "open ground: the whole push")
	var wall := with_solid(func(_x: float, _z: float, _dx: float, _dz: float, _m: float) -> Variant: return 0.7)
	ok(is_equal_approx(Strikes.knock_back_room(wall, 0, 0, 1, 0, 0.65), 0.3), "a wall 0.7 m off: 0.3 m")
	var touching := with_solid(func(_x: float, _z: float, _dx: float, _dz: float, _m: float) -> Variant: return 0.2)
	eq(Strikes.knock_back_room(touching, 0, 0, 1, 0, 0.65), 0.0)
	eq(Strikes.knock_back_room(open(), 0, 0, 1, 0, 0.0), 0.0)
	return true


func test_children_are_kept_clear_of_every_fight() -> bool:
	var combat := Combat.new(open())
	combat.spawn_group("a", [spot(100, 0, false)])
	var calm := EnemySpot.make(-500, 0, false)
	calm.calm = true
	combat.spawn_group("crew", [calm])
	var points := FightSafety.fight_points(combat)
	eq(points.size(), 1)
	no(FightSafety.child_allowed(Vector2(100 + FightSafety.CHILD_CLEAR - 1.0, 0), points), "inside the ring")
	ok(FightSafety.child_allowed(Vector2(100 + FightSafety.CHILD_CLEAR + 1.0, 0), points), "outside it")
	ok(FightSafety.child_allowed(Vector2(-500, 0), points), "a calm crew on its corner is no fight")
	# A recent shot is a fight; an old one is not.
	var shots := PackedVector3Array([Vector3(0, 0, 1.0), Vector3(1000, 0, FightSafety.SHOT_MEMORY + 1.0)])
	var with_shots := FightSafety.fight_points(null, shots)
	no(FightSafety.child_allowed(Vector2(10, 0), with_shots), "near a fresh shot")
	ok(FightSafety.child_allowed(Vector2(1000, 0), with_shots), "an old shot is forgotten")
	return true


func test_only_adults_can_be_hit() -> bool:
	var people: Array[Dictionary] = [{"id": 1, "x": 0.0, "z": -1.0, "person": "young-man"}, {"id": 2, "x": 0.0, "z": -1.0, "person": "school-boy"}, {"id": 3, "x": 0.0, "z": -1.0, "person": ""}]
	var adults := FightSafety.adults_only(people, {"school-boy": true})
	eq(adults.size(), 1)
	eq(int(adults[0]["id"]), 1)
	# Even a child standing right in front of a swing is never in the rules' list, so never hit.
	var combat := Combat.new(open())
	var events: Array[Dictionary] = []
	combat.punch(player(), events, FightSafety.adults_only([people[1]] as Array[Dictionary], {"school-boy": true}))
	for e in events:
		ok(str(e["type"]) != "civilianHit", "no blow lands on a child")
	return true
