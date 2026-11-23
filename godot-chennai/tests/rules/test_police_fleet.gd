## New Godot tests for the finished TD-28 rules (no TypeScript unit tests existed for the police
## crews' state machine, which lived in `Police.ts`; the browser test `police.spec.ts` checked it
## end to end). Also checks the heat numbers TD-28 documents.
extends "res://tests/rules/combat_helpers.gd"

var _unseen := func(_u: PoliceFleet.Unit) -> bool: return false
var _seen := func(_u: PoliceFleet.Unit) -> bool: return true


## Deploy a car's officers into `combat` beside (0, -10), as the game does.
func _deploy(fleet: PoliceFleet, u: PoliceFleet.Unit, combat: Combat, stars: int) -> Dictionary:
	var d := fleet.deploy(u, stars, PoliceFleet.living_on_foot(combat))
	if d.is_empty():
		return d
	var spots: Array = []
	for i in int(d["count"]):
		spots.append(spot(-1.0 + 2.0 * i, -10, d["armed"]))
	combat.spawn_group(d["group"], spots)
	return d


func _kill(combat: Combat, group: String) -> void:
	for e in combat.enemies:
		if e.group == group:
			e.health = 0
			e.down_for = 0


func test_dead_officers_stay_dead_and_the_empty_car_is_abandoned() -> bool:
	var fleet := PoliceFleet.new()
	var combat := Combat.new(walled())
	var u := fleet.dispatch(1, _unseen)
	not_nil(u)
	var d := _deploy(fleet, u, combat, 1)
	eq(d["count"], 2)
	eq(u.state, "parked")
	eq(fleet.step_parked(u, PoliceFleet.living(combat, d["group"]), false), "wait")
	_kill(combat, d["group"])
	eq(fleet.step_parked(u, PoliceFleet.living(combat, d["group"]), false), "abandon")
	eq(u.state, "abandoned")
	eq(u.crew, 0)
	eq(fleet.deploy(u, 3, 0), {}, "an abandoned car never refills")
	eq(PoliceFleet.can_look(u), false)
	# The bodies lie until Combat removes the fallen, like any casualty.
	eq(combat.enemies.size(), 2)
	combat.update(Combat.DOWN_TIME + 0.1, player())
	eq(combat.enemies.size(), 0)
	return true


func test_one_officer_killed_the_partner_gets_out_alone_next_time() -> bool:
	var fleet := PoliceFleet.new()
	var combat := Combat.new(walled())
	var u := fleet.dispatch(3, _unseen)
	var d := _deploy(fleet, u, combat, 3)
	combat.enemies[0].health = 0
	eq(fleet.step_parked(u, PoliceFleet.living(combat, d["group"]), true), "recall")
	PoliceFleet.remove_living(combat, d["group"])
	eq(u.crew, 1)
	eq(combat.enemies.size(), 1, "the dead officer stays where he fell")
	eq(combat.enemies[0].health, 0)
	u.since_recall = PoliceFleet.REDEPLOY_AFTER + 1
	var again := _deploy(fleet, u, combat, 3)
	eq(again["count"], 1)
	return true


func test_an_abandoned_car_does_not_count_so_a_new_unit_is_sent() -> bool:
	var fleet := PoliceFleet.new()
	var first := fleet.dispatch(1, _unseen)
	eq(fleet.dispatch(1, _unseen), null, "one star: one car")
	fleet.abandon(first)
	var second := fleet.dispatch(1, _unseen)
	not_nil(second)
	ok(second != first)
	eq(second.crew, PoliceFleet.OFFICERS_PER_CAR)
	eq(fleet.counted(), 1)
	return true


func test_abandoned_cars_are_taken_away_once_far_and_out_of_sight() -> bool:
	eq(PoliceFleet.abandoned_should_go(50, false), false)
	eq(PoliceFleet.abandoned_should_go(PoliceFleet.LEAVE_BEYOND + 1, true), false)
	eq(PoliceFleet.abandoned_should_go(PoliceFleet.LEAVE_BEYOND + 1, false), true)
	eq(PoliceFleet.abandoned_should_go(PoliceFleet.RECYCLE_BEYOND + 1, true), true)
	return true


func test_at_most_two_abandoned_cars_are_kept_and_the_unseen_one_makes_way() -> bool:
	var fleet := PoliceFleet.new()
	# Five stars: three chasing cars, plus two abandoned ones = every slot used.
	var a := fleet.dispatch(5, _unseen)
	var b := fleet.dispatch(5, _unseen)
	fleet.abandon(a)
	fleet.abandon(b)
	for i in 3:
		not_nil(fleet.dispatch(5, _unseen))
	eq(fleet.units.size(), Wanted.CARS[5] + PoliceFleet.ABANDONED_MAX)
	fleet.abandon(fleet.units[4])
	# A slot is needed: an abandoned car the player can see stays, the unseen one makes way.
	var sees_a := func(u: PoliceFleet.Unit) -> bool: return u == a
	var next := fleet.dispatch(5, sees_a)
	ok(next == b, "the unseen abandoned car is reused")
	eq(a.state, "abandoned")
	eq(fleet.units.size(), 5, "no extra car is ever built past the cap")
	eq(fleet.dispatch(5, _seen), null, "all seen and the level is full")
	return true


func test_officers_get_out_only_when_the_car_has_pulled_up_and_the_player_is_seen() -> bool:
	var fleet := PoliceFleet.new()
	var u := fleet.dispatch(2, _unseen)
	ok(PoliceFleet.should_deploy(u, 2, true, false, true, 10, 1.0))
	no(PoliceFleet.should_deploy(u, 2, false, false, true, 10, 1.0), "not seen")
	no(PoliceFleet.should_deploy(u, 2, true, true, true, 10, 1.0), "ramming")
	no(PoliceFleet.should_deploy(u, 2, true, false, true, PoliceFleet.DEPLOY_RANGE + 1, 1.0), "too far")
	no(PoliceFleet.should_deploy(u, 2, true, false, true, 10, 3.0), "still moving")
	fleet.recall(u)
	no(PoliceFleet.should_deploy(u, 2, true, false, true, 10, 1.0), "just recalled")
	fleet.tick(PoliceFleet.REDEPLOY_AFTER + 0.1)
	ok(PoliceFleet.should_deploy(u, 2, true, false, true, 10, 1.0))
	eq(PoliceFleet.escaped(PoliceFleet.RECALL_RANGE + 1, false, 0), true)
	eq(PoliceFleet.escaped(25, true, 8), true)
	eq(PoliceFleet.escaped(25, false, 8), false)
	return true


func test_only_incidents_with_a_witnessed_rule_count_as_witnessed() -> bool:
	eq(Wanted.witnessed("pedestrianAssaulted", true), true)
	eq(Wanted.witnessed("pedestrianKilled", true), true)
	eq(Wanted.witnessed("gunfire", true), false)
	eq(Wanted.witnessed("pedestrianInjured", false), false)
	return true


func test_heat_numbers_as_td28_documents_them() -> bool:
	# A star starts at 1 point; cooling is about a point per 33 s.
	near(1.0 / Wanted.HEAT_COOL, 33.3, 0)
	# Three knock-downs in a short time make a star; two do not.
	var w := Wanted.new()
	w.report("pedestrianInjured")
	w.report("pedestrianInjured")
	eq(w.stars, 0)
	w.report("pedestrianInjured")
	eq(w.stars, 1)
	# Once wanted, about four more knock-downs make two stars.
	for i in 3:
		w.report("pedestrianInjured")
	eq(w.stars, 1)
	w.report("pedestrianInjured")
	eq(w.stars, 2)
	# A street incident adds heat but never cools once wanted: the stars fade instead.
	var held := w.points
	w.update(10, false, false)
	eq(w.points, held)
	return true
