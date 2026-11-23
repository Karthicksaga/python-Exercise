## Ports of `ai/src/Carjack.test.ts` on `agent/carjacking` (10 cases, TD-30).
extends "res://tests/rules/rules_test.gd"


func car(over: Dictionary = {}) -> Dictionary:
	var c := {"id": 1, "kind": "car", "x": 0.0, "z": 0.0, "heading": 0.0, "speed": 0.0, "half_width": 0.85, "half_length": 2.0}
	c.merge(over, true)
	return c


func test_takes_cars_autos_and_bikes_stopped_or_crawling() -> bool:
	for kind: String in ["car", "auto", "bike"]:
		eq(Carjack.carjackable(kind, 0), true, kind)
	eq(Carjack.carjackable("car", Carjack.MAX_SPEED - 0.1), true)
	return true


func test_never_buses_ambulances_or_anything_faster() -> bool:
	eq(Carjack.carjackable("bus", 0), false)
	eq(Carjack.carjackable("ambulance", 0), false)
	eq(Carjack.carjackable("car", Carjack.MAX_SPEED + 0.1), false)
	eq(Carjack.carjackable("bike", 8), false)
	return true


func test_measures_from_the_body_turned_with_the_heading() -> bool:
	near(Carjack.distance_to_footprint(2, 0, car()), 1.15)
	near(Carjack.distance_to_footprint(0, -3, car()), 1)
	eq(Carjack.distance_to_footprint(0, 0, car()), 0)
	var east := car({"heading": -PI / 2})
	near(Carjack.distance_to_footprint(3, 0, east), 1)
	near(Carjack.distance_to_footprint(0, 2, east), 1.15)
	return true


func test_picks_the_nearest_takeable_vehicle_in_reach() -> bool:
	eq(Carjack.pick(0, 0, [car({"id": 1, "x": 3.0}), car({"id": 2, "x": -2.5})]).get("id"), 2)
	return true


func test_reaches_a_car_stopped_for_the_player_in_front() -> bool:
	eq(Carjack.pick(0, -2 - 2.3, [car()]).get("id"), 1)
	return true


func test_skips_moving_buses_and_out_of_reach() -> bool:
	eq(Carjack.pick(0, 0, [car({"x": 2.0, "speed": 6.0})]), {})
	eq(Carjack.pick(0, 0, [car({"x": 2.0, "kind": "bus"})]), {})
	eq(Carjack.pick(0, 0, [car({"x": 0.85 + Carjack.REACH + 0.2})]), {})
	return true


func test_reuses_a_free_vehicle_of_the_same_kind_and_colour() -> bool:
	eq(Carjack.choose_slot([{"kind": "car", "color": 1, "free": true, "used_at": 1}], "car", 1), 0)
	return true


func test_makes_a_new_one_under_the_cap() -> bool:
	var slots := [{"kind": "car", "color": 1, "free": true, "used_at": 1}]
	eq(Carjack.choose_slot(slots, "car", 2), -1)
	eq(Carjack.choose_slot(slots, "bike", 1), -1)
	return true


func test_at_the_cap_reuses_the_oldest_free_one() -> bool:
	var slots := [
		{"kind": "car", "color": 1, "free": false, "used_at": 1},
		{"kind": "car", "color": 2, "free": true, "used_at": 5},
		{"kind": "bike", "color": 3, "free": true, "used_at": 0},
	]
	eq(Carjack.choose_slot(slots, "car", 9, 2), 1)
	var three := slots.duplicate()
	three.append({"kind": "car", "color": 4, "free": true, "used_at": 3})
	eq(Carjack.choose_slot(three, "car", 9, 3), 3)
	return true


func test_keeps_the_spares_per_kind_bounded() -> bool:
	var slots: Array = []
	var driving := -1
	for t in 50:
		if driving >= 0:
			slots[driving]["free"] = true
		var color := t % 7
		var choice := Carjack.choose_slot(slots, "car", color)
		if choice == -1:
			slots.append({"kind": "car", "color": color, "free": false, "used_at": t})
			driving = slots.size() - 1
		else:
			slots[choice] = {"kind": "car", "color": color, "free": false, "used_at": t}
			driving = choice
	eq(slots.size(), Carjack.PER_KIND)
	return true
