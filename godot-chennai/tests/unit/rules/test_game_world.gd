## Ports of `game-world/src/clock.test.ts` (2) and `districts.test.ts` (5), plus a Godot check
## that SeededRandom gives the TypeScript mulberry32 numbers bit for bit (new).
extends "res://tests/unit/rules/rules_test.gd"


func test_clock_starts_at_golden_hour_advances_and_wraps() -> bool:
	var clock := GameClock.new()
	near(clock.hour, 17.75)
	eq(clock.label(), "Evening")
	clock.hour = 23.9
	clock.advance(60 * 0.2)
	near(clock.hour, 0.1, 5)
	eq(clock.text(), "00:06")
	return true


func test_clock_cycles_named_times() -> bool:
	var clock := GameClock.new(21.5)
	clock.next()
	eq(clock.label(), "Morning")
	near(GameClock.new(NAN).hour, 17.75)
	return true


var _districts: Array = [
	{"name": "Anna Nagar", "kind": "suburb", "x": 0, "z": 0},
	{"name": "T. Nagar", "kind": "suburb", "x": 3000, "z": 5000},
	{"name": "Mylapore", "kind": "suburb", "x": 6500, "z": 5700},
]


func test_district_nearest_within_reach() -> bool:
	var index := DistrictIndex.new(_districts)
	eq(index.at(200, -300).get("name"), "Anna Nagar")
	eq(index.at(3400, 5200).get("name"), "T. Nagar")
	eq(index.at(5600, 5600).get("name"), "Mylapore")
	return true


func test_district_nothing_far_away() -> bool:
	ok(DistrictIndex.new(_districts).at(20000, 0).is_empty())
	return true


func test_district_looks_across_cells() -> bool:
	eq(DistrictIndex.new([{"name": "Edge", "kind": "suburb", "x": 999, "z": 999}]).at(1001, 1001).get("name"), "Edge")
	return true


func test_visited_records_once_and_summarises() -> bool:
	var v := VisitedDistricts.new()
	eq(v.visit("Anna Nagar"), true)
	eq(v.visit("Anna Nagar"), false)
	v.visit("T. Nagar")
	eq(v.summary(), "Anna Nagar and T. Nagar")
	for n: String in ["A", "B", "C"]:
		v.visit(n)
	eq(v.count(), 5)
	eq(v.summary(), "Anna Nagar, T. Nagar, A, B and 1 more")
	return true


func test_visited_ignores_damaged_saves() -> bool:
	eq(VisitedDistricts.new("nonsense").count(), 0)
	eq(VisitedDistricts.new(["X", 3, "X", "Y"]).list(), ["X", "Y"])
	return true


## New (Godot): the generator matches the TypeScript one (values printed by node).
func test_seeded_random_matches_typescript() -> bool:
	var expected := {
		1: [0.62707394058816135, 0.0027357211802154779, 0.52744703995995224, 0.98105096747167408],
		7: [0.011704753153026104, 0.061958257574588060, 0.97690763277933002, 0.69902870571240783],
		123456: [0.38233304349705577, 0.79726290749385953, 0.99653023737482727, 0.16001168475486338],
	}
	for s: int in expected:
		var r := SeededRandom.new(s)
		for v: float in expected[s]:
			near(r.next(), v, 15, "seed %d" % s)
	eq(RulesMath.js_round(-2.5), -2.0)
	eq(RulesMath.js_round(2.5), 3.0)
	return true
