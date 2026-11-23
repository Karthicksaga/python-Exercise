## Ports of `combat/src/PedestrianHits.test.ts` (10 cases).
extends "res://tests/unit/rules/rules_test.gd"

const H := PedestrianHits.PEDESTRIAN_HIT


## A hatchback-sized box facing `yaw` at the origin going `speed` m/s.
func car(speed: float, yaw: float = 0.0) -> Dictionary:
	return {"x": 0.0, "z": 0.0, "yaw": yaw, "vx": -sin(yaw) * speed, "vz": -cos(yaw) * speed, "half_width": 0.85, "half_length": 2.0}


func test_impact_speed_decides_the_outcome() -> bool:
	eq(PedestrianHits.hit_outcome(0), "")
	eq(PedestrianHits.hit_outcome(float(H["min_speed"]) - 0.01), "")
	eq(PedestrianHits.hit_outcome(H["min_speed"]), "stumble")
	eq(PedestrianHits.hit_outcome(float(H["injured_from"]) - 0.01), "stumble")
	eq(PedestrianHits.hit_outcome(H["injured_from"]), "injured")
	eq(PedestrianHits.hit_outcome(float(H["killed_from"]) - 0.01), "injured")
	eq(PedestrianHits.hit_outcome(H["killed_from"]), "killed")
	eq(PedestrianHits.hit_outcome(-20), "killed")
	return true


func test_thresholds_in_order_about_7_16_45_kmh() -> bool:
	lt(H["min_speed"], H["injured_from"])
	lt(H["injured_from"], H["killed_from"])
	near(float(H["killed_from"]) * 3.6, 45, 0)
	return true


func test_penalties() -> bool:
	eq(PedestrianHits.hit_penalty("stumble"), {"fine": 0, "reputation": 0})
	var injured := PedestrianHits.hit_penalty("injured")
	var killed := PedestrianHits.hit_penalty("killed")
	gt(injured["fine"], 0)
	gt(injured["reputation"], 0)
	gt(killed["fine"], injured["fine"])
	gt(killed["reputation"], injured["reputation"])
	eq(killed, {"fine": 5000, "reputation": 20})
	eq(injured, {"fine": 1500, "reputation": 8})
	return true


func test_the_vehicle_loses_a_little_speed() -> bool:
	var hatchback := PedestrianHits.speed_kept(950)
	var bike := PedestrianHits.speed_kept(190)
	gt(hatchback, 0.9)
	lt(hatchback, 1)
	lt(bike, hatchback)
	gt(bike, 0.6)
	return true


func test_touches_someone_in_front_beside_or_about_to_be_reached() -> bool:
	var v := car(10)
	eq(PedestrianHits.vehicle_touches(v, 0, -2.2, 0), true)
	eq(PedestrianHits.vehicle_touches(v, 1.1, 0, 0), true)
	eq(PedestrianHits.vehicle_touches(v, 0, -2.6, 0), false)
	eq(PedestrianHits.vehicle_touches(v, 0, -2.6, 1.0 / 30.0), true)
	eq(PedestrianHits.vehicle_touches(v, 1.4, -1, 1.0 / 30.0), false)
	var east := car(10, -PI / 2)
	eq(PedestrianHits.vehicle_touches(east, 2.2, 0, 0), true)
	eq(PedestrianHits.vehicle_touches(east, 0, -2.2, 0), false)
	return true


func test_throws_people_further_the_faster_and_clear_of_the_path() -> bool:
	lt(PedestrianHits.throw_distance("stumble", 3), 1)
	lt(PedestrianHits.throw_distance("injured", 6), PedestrianHits.throw_distance("killed", 14))
	eq(PedestrianHits.throw_distance("killed", 30), H["max_throw"])
	var v := car(14)
	var rest := PedestrianHits.resting_spot(v, 0.3, -2.3, "killed")
	lt(rest["z"], -2.3 - 4)
	gt(rest["x"], float(v["half_width"]) + float(H["person_radius"]))
	near(RulesMath.hypot(rest["dx"], rest["dz"]), 1, 6)
	near(rest["distance"], RulesMath.hypot(float(rest["x"]) - 0.3, float(rest["z"]) + 2.3), 6)
	lt(PedestrianHits.resting_spot(v, -0.3, -2.3, "injured")["x"], -float(v["half_width"]))
	return true


var _near := func(_id: int) -> float: return 5.0
var _far := func(_id: int) -> float: return 100.0


func run(c: Casualties, seconds: float, distance: Callable) -> Array:
	var changes: Array = []
	for i in roundi(seconds * 60.0):
		changes.append_array(c.update(1.0 / 60.0, distance))
	return changes


func test_an_injured_person_lies_down_gets_up_limps_and_recovers() -> bool:
	var c := Casualties.new()
	c.hit(3, "injured")
	eq(c.is_down(3), true)
	eq(c.can_hit(3), false)
	eq(run(c, float(H["injured_down"]) - 0.1, _near), [])
	eq(run(c, 0.2, _near), [{"id": 3, "type": "getsUp"}])
	eq(c.get_casualty(3)["state"], "limping")
	eq(c.is_down(3), false)
	eq(c.can_hit(3), true)
	eq(run(c, float(H["limp_for"]) + 0.1, _near), [{"id": 3, "type": "recovered"}])
	eq(c.get_casualty(3), {})
	return true


func test_a_killed_person_stays_then_is_removed() -> bool:
	var c := Casualties.new()
	c.hit(1, "killed")
	c.hit(2, "killed")
	eq(c.is_down(1), true)
	eq(run(c, float(H["killed_stay"]) - 0.1, _far), [])
	eq(run(c, 1, _near), [])
	eq(run(c, 0.1, func(id: int) -> float: return 100.0 if id == 1 else 5.0), [{"id": 1, "type": "remove"}])
	eq(c.get_casualty(1), {})
	eq(run(c, float(H["killed_max"]) - float(H["killed_stay"]), _near), [{"id": 2, "type": "remove"}])
	eq(c.list(), [])
	return true


func test_someone_who_stumbled_cannot_be_hit_again_for_a_moment() -> bool:
	var c := Casualties.new()
	c.hit(4, "stumble")
	eq(c.is_down(4), false)
	eq(c.can_hit(4), false)
	eq(run(c, float(H["stumble_grace"]) + 0.05, _near), [])
	eq(c.get_casualty(4), {})
	eq(c.can_hit(4), true)
	return true


func test_a_new_hit_replaces_the_old_one() -> bool:
	var c := Casualties.new()
	c.hit(5, "injured")
	run(c, float(H["injured_down"]) + 0.1, _near)
	eq(c.get_casualty(5)["state"], "limping")
	c.hit(5, "killed")
	match_obj(c.get_casualty(5), {"state": "dead", "time": 0})
	c.clear()
	eq(c.list(), [])
	return true
