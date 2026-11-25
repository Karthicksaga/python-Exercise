extends TestCase
## The police in play without the city (`PoliceWiring`, G-418, G-419), fed the player's state
## directly (no traffic, no randomness that matters: the spawn ring is fixed in open ground):
## a roadblock across the road ahead of a fast driver from four stars (never below), and the
## arrest of a player keeping still beside an officer.

const STEP := 1.0 / 60.0


func _police() -> PoliceWiring:
	var p := PoliceWiring.make(Combat.new(CombatWorld.new()))
	p.load_models = false
	root.add_child(p)
	return p


func _driving(x: float, z: float, vx: float) -> Dictionary:
	return {"x": x, "z": z, "speed": absf(vx), "vx": vx, "vz": 0.0, "on_foot": false, "vehicle_id": "car-start", "vehicle_kind": "car", "half_length": 2.0, "impact": 0.0, "allowed_kinds": []}


## Drive east at 15 m/s for `seconds`; returns the cars seen as roadblocks.
func _drive(p: PoliceWiring, seconds: float) -> int:
	var x := 0.0
	var blocks := 0
	for i in int(seconds / STEP):
		x += 15.0 * STEP
		p.step(STEP, _driving(x, 0.0, 15.0))
		for c in p.cars():
			if bool(c["roadblock"]):
				blocks += 1
				var ahead := float(c["x"]) - x
				check(ahead > 0.0, "the roadblock is ahead of the driver (%.0f m)" % ahead)
				return blocks
	return blocks


func test_a_roadblock_ahead_of_a_fast_driver_from_four_stars() -> bool:
	var p := _police()
	p.set_stars(4)
	assert_true(_drive(p, 40.0) > 0, "a car parks across the road ahead at four stars")
	p.queue_free()
	var q := _police()
	q.set_stars(3)
	assert_eq(_drive(q, 40.0), 0, "no roadblock at three stars")
	q.queue_free()
	return true


func test_keeping_still_beside_an_officer_is_an_arrest_with_the_fine() -> bool:
	var p := _police()
	p.stations = PackedVector2Array([Vector2(300, 0)])
	p.set_stars(1)
	var busts: Array[int] = []
	p.busted.connect(func(fine: int, _s: int, _at: Vector2, _y: float) -> void: busts.append(fine))
	var me := {"x": 0.0, "z": 0.0, "speed": 0.0, "vx": 0.0, "vz": 0.0, "on_foot": true, "vehicle_id": "", "vehicle_kind": "", "half_length": 0.0, "impact": 0.0, "allowed_kinds": []}
	for i in 60 * 60:
		p.step(STEP, me)
		p.combat.update(STEP, Combat.PlayerState.make(0.0, 0.0, 0.0))
		if not busts.is_empty():
			break
	assert_eq(busts.size(), 1, "busted")
	if not busts.is_empty():
		assert_eq(busts[0], Wanted.BUST_FINE[1], "the one-star fine")
	assert_eq(p.wanted.stars, 0, "not wanted after")
	assert_eq(p.cars().size(), 0, "no cars after")
	assert_near(float(p.last_bust.get("x", 0.0)), 300.0, 0.01, "released at the station")
	p.queue_free()
	return true
