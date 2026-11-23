## The police cars' crew and dispatch rules (TD-28, "dead officers stay dead"), finished here as
## pure rules. In the Three.js game they were written inside `apps/game/src/Police.ts`, mixed with
## the cars' models and routing (`agent/police-tuning`, unfinished); this keeps the same rules and
## numbers, without the rendering, so they are unit-tested:
## - Each car has a crew (two). Officers who die while out are struck off it for good
##   (`Wanted.crew_left`); only the living get out again (`Wanted.officers_to_deploy`).
## - A car whose crew is all dead is abandoned where it stopped: it sees nothing, never lets
##   anyone out, and does not count towards the level's cars, so a new unit is dispatched (from
##   out of sight: the game picks the spawn point).
## - An abandoned car is taken away once the player is more than `leave_beyond` m off and cannot
##   see it (or beyond `recycle_beyond`); at most `abandoned_max` are kept besides the chasing
##   cars, and when all slots are used the abandoned one the player can't see makes way.
## - The dead lie where they fell until `Combat` removes the fallen (`Combat.DOWN_TIME`), like
##   any casualty; recalling a crew removes only the living (`remove_living`).
## The game supplies what needs the world: whether the player can see a car, the car's distance,
## whether it has pulled up near the player. Numbers are the TS game's estimates.
class_name PoliceFleet
extends RefCounted

const OFFICERS_PER_CAR := 2
const ABANDONED_MAX := 2
const LEAVE_BEYOND := 90.0
const RECYCLE_BEYOND := 600.0
const RECALL_RANGE := 45.0
const DEPLOY_RANGE := 16.0
const REDEPLOY_AFTER := 6.0


class Unit:
	var id := 0
	var active := false
	## "chase" drives after the player, "parked" waits while officers are out, "abandoned": the
	## whole crew is dead.
	var state := "chase"
	## The Combat group of its officers while they are out, or "".
	var group := ""
	## Officers of this car still alive (in it or out of it).
	var crew := OFFICERS_PER_CAR
	## How many of them are out now.
	var out := 0
	var deployments := 0
	var since_recall := 99.0


var units: Array[Unit] = []
var _next_id := 1


## Active cars that count towards the level's cap (abandoned ones do not).
func counted() -> int:
	var n := 0
	for u in units:
		if u.active and u.state != "abandoned":
			n += 1
	return n


## A unit may look for the player (sight lines, arrival at a reported crime).
static func can_look(u: Unit) -> bool:
	return u.active and u.state != "abandoned"


## A free unit, else a new one under the cap (Wanted.CARS[5] + ABANDONED_MAX), else an abandoned
## one the player cannot see (put away first). `player_sees`: Callable(Unit) -> bool. Null: none.
func _take(player_sees: Callable) -> Unit:
	for u in units:
		if not u.active:
			return u
	if units.size() >= Wanted.CARS[Wanted.MAX_STARS] + ABANDONED_MAX:
		for u in units:
			if u.state == "abandoned" and not player_sees.call(u):
				put_away(u)
				return u
		return null
	var u := Unit.new()
	u.id = _next_id
	_next_id += 1
	units.append(u)
	return u


## Send a new car if the level allows another (abandoned cars don't count). Returns it, or null.
func dispatch(stars: int, player_sees: Callable) -> Unit:
	if counted() >= int(Wanted.police_units(stars)["cars"]):
		return null
	var u := _take(player_sees)
	if u == null:
		return null
	u.active = true
	u.state = "chase"
	u.crew = OFFICERS_PER_CAR
	u.out = 0
	u.since_recall = 99.0
	return u


## Whether a chasing car that has pulled up lets its officers out now (the TS conditions).
static func should_deploy(u: Unit, stars: int, police_see_player: bool, ramming: bool, player_stopped: bool, to_player: float, car_speed: float) -> bool:
	return u.state == "chase" and stars > 0 and police_see_player and not ramming and player_stopped and to_player < DEPLOY_RANGE and car_speed < 1.5 and u.since_recall > REDEPLOY_AFTER


## Officers out of a stopped car: returns {group, count, armed} for `Combat.spawn_group`, or {}
## when nobody can get out. `living_on_foot`: officers of every car standing now.
func deploy(u: Unit, stars: int, living_on_foot: int) -> Dictionary:
	var count := Wanted.officers_to_deploy(u.crew, stars, living_on_foot)
	if count <= 0:
		return {}
	u.deployments += 1
	u.out = count
	u.group = "%s%d-%d" % [Wanted.POLICE_GROUP, u.id, u.deployments]
	u.state = "parked"
	return {"group": u.group, "count": count, "armed": Wanted.police_units(stars)["armed"]}


## Strike the officers who died while out off the crew.
func settle(u: Unit, living_out: int) -> void:
	if u.group == "":
		return
	var left := Wanted.crew_left(u.crew, u.out, living_out)
	u.crew = left["crew"]
	u.out = left["out"]


## A parked car's step: "abandon" (crew all dead), "recall" (all out are down, or the player got
## away) or "wait". Applies the change.
func step_parked(u: Unit, living_out: int, escaped: bool) -> String:
	settle(u, living_out)
	if u.crew == 0:
		abandon(u)
		return "abandon"
	if u.out == 0 or escaped:
		recall(u)
		return "recall"
	return "wait"


## The player got away from a parked car's officers (the TS `escaped` test).
static func escaped(to_player: float, player_in_vehicle: bool, player_speed: float) -> bool:
	return to_player > RECALL_RANGE or (player_in_vehicle and player_speed > 6.0 and to_player > 20.0)


## Officers back in the car (the game removes the living with `remove_living`).
func recall(u: Unit) -> void:
	u.group = ""
	u.out = 0
	u.state = "chase"
	u.since_recall = 0.0


func abandon(u: Unit) -> void:
	u.group = ""
	u.out = 0
	u.state = "abandoned"


## An abandoned car is taken away once the player is far off and can't see it.
static func abandoned_should_go(to_player: float, player_sees_it: bool) -> bool:
	return (to_player > LEAVE_BEYOND and not player_sees_it) or to_player > RECYCLE_BEYOND


func put_away(u: Unit) -> void:
	u.group = ""
	u.out = 0
	u.active = false
	u.state = "chase"


func tick(dt: float) -> void:
	for u in units:
		u.since_recall += dt


## Officers of a group still standing in `combat`.
static func living(combat: Combat, group: String) -> int:
	return combat.remaining(group)


## The living officers of a group leave (back into the car); the dead stay where they fell
## until Combat removes them like any other casualty.
static func remove_living(combat: Combat, group: String) -> void:
	for i in range(combat.enemies.size() - 1, -1, -1):
		var e: Combat.Enemy = combat.enemies[i]
		if e.group == group and e.health > 0.0:
			combat.enemies.remove_at(i)


## Officers on foot standing now, every car's.
static func living_on_foot(combat: Combat) -> int:
	var n := 0
	for e in combat.enemies:
		if Wanted.is_police_group(e.group) and e.health > 0.0:
			n += 1
	return n
