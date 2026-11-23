## The wanted level (port of `combat/src/Wanted.ts`: the TD-27 base, TD-28 heat before stars and
## police crews from `agent/police-tuning`, and the TD-30 `carjacking` crime from
## `agent/carjacking`). 0 (not wanted) to 5 stars. Crimes add heat points; stars follow from the
## points, with a minimum for the worse crimes. Street incidents add only part of a star and cool
## off while not wanted; once wanted each adds more; one a police unit sees gives a star at once.
## The level drops a star at a time once no unit has seen the player for a while; at low levels
## an officer beside a player who keeps still arrests them. Every number is a game-design
## estimate. Events are Dictionaries {type: raised|lowered|busted, ...}, also emitted as signals.
class_name Wanted
extends RefCounted

signal raised(stars: int, crime: String)
signal lowered(stars: int)
signal busted(stars: int, fine: int)

const MAX_STARS := 5
## Heat points at which each level starts (index = stars).
const STAR_AT: Array[float] = [0.0, 1.0, 5.0, 12.0, 22.0, 35.0]
## Heat lost per second while not wanted (about a point per 33 s).
const HEAT_COOL := 0.03
## Per crime: points, points_wanted (instead, once wanted; -1: same), min_stars,
## witnessed_stars (-1: none), every (seconds before the same crime counts again).
const CRIMES := {
	"gunfire": {"points": 1.0, "points_wanted": -1.0, "min_stars": 1, "witnessed_stars": -1, "every": 3.0},
	# Street incidents (TD-28): no star by themselves.
	"pedestrianInjured": {"points": 0.45, "points_wanted": 1.0, "min_stars": 0, "witnessed_stars": 1, "every": 0.0},
	"pedestrianAssaulted": {"points": 0.3, "points_wanted": 0.5, "min_stars": 0, "witnessed_stars": 1, "every": 2.0},
	# A death: a star at once, a second soon after makes two (2.5 + 2.5 = 5).
	"pedestrianKilled": {"points": 2.5, "points_wanted": -1.0, "min_stars": 1, "witnessed_stars": 2, "every": 0.0},
	"vehicleTheft": {"points": 1.0, "points_wanted": -1.0, "min_stars": 1, "witnessed_stars": -1, "every": 0.0},
	"policeCarRammed": {"points": 2.0, "points_wanted": -1.0, "min_stars": 1, "witnessed_stars": -1, "every": 3.0},
	"policeCarShot": {"points": 2.0, "points_wanted": -1.0, "min_stars": 1, "witnessed_stars": -1, "every": 2.0},
	"officerAssaulted": {"points": 4.0, "points_wanted": -1.0, "min_stars": 2, "witnessed_stars": -1, "every": 1.0},
	"officerDown": {"points": 10.0, "points_wanted": -1.0, "min_stars": 3, "witnessed_stars": -1, "every": 0.0},
	# TD-30: a vehicle taken from traffic, its driver pulled out. Two in a row make two stars.
	"carjacking": {"points": 3.0, "points_wanted": -1.0, "min_stars": 1, "witnessed_stars": -1, "every": 0.0},
}
## Seconds unseen before the level drops one star (index = stars).
const LOSE_AFTER: Array[float] = [0.0, 30.0, 40.0, 55.0, 70.0, 85.0]
const SIGHT_CAR := 70.0
const SIGHT_OFFICER := 45.0
const BUST_UP_TO := 2
const BUST_RANGE := 3.2
const STILL_BELOW := 0.6
const BUST_AFTER := 2.0
const BUST_FINE: Array[int] = [0, 500, 1000, 2000, 3500, 5000]
const CARS: Array[int] = [0, 1, 2, 2, 3, 3]
const OFFICERS: Array[int] = [0, 2, 2, 3, 4, 4]
const ARMED_FROM := 3
const RAM_FROM := 3
const JOBS_BLOCKED_FROM := 2
## Officers on foot are ordinary Combat enemies in groups named after their car.
const POLICE_GROUP := "police:"

var points := 0.0
var stars := 0
var unseen_for := 0.0
var seen := false
var held_for := 0.0
var _since: Dictionary = {}


static func stars_for(heat: float) -> int:
	var s := 0
	for i in range(1, MAX_STARS + 1):
		if heat >= STAR_AT[i]:
			s = i
	return s


## {cars, officers, armed, ram} at a level.
static func police_units(level: float) -> Dictionary:
	var s := clampi(floori(level), 0, MAX_STARS)
	return {"cars": CARS[s], "officers": OFFICERS[s], "armed": s >= ARMED_FROM, "ram": s >= RAM_FROM}


static func jobs_allowed(level: int) -> bool:
	return level < JOBS_BLOCKED_FROM


## Getting into `vehicle` ({id, kind}) is a theft: not the player's own (`own` ids), not a kind
## the current job or story step asks for, not already taken. `taken`: set (id -> true).
static func is_vehicle_theft(vehicle: Dictionary, own: Array, allowed_kinds: Array, taken: Dictionary) -> bool:
	if own.has(vehicle["id"]) or taken.has(vehicle["id"]):
		return false
	return not allowed_kinds.has(vehicle["kind"])


static func is_police_group(group: String) -> bool:
	return group.begins_with(POLICE_GROUP)


## A car's crew after a look at the officers it let out (TD-28): those who died are gone for good.
## Returns {crew, out}; crew 0 means the car is abandoned.
static func crew_left(crew: int, out: int, living_out: int) -> Dictionary:
	var living := maxi(0, mini(out, living_out))
	return {"crew": maxi(0, crew - (out - living)), "out": living}


## How many of a car's living crew get out: never more than it has, nor than the level allows.
static func officers_to_deploy(crew: int, level: int, living_on_foot: int) -> int:
	return maxi(0, mini(crew, int(police_units(level)["officers"]) - living_on_foot))


## Whether a report counts as witnessed (TD-28, `Police.report`): only crimes that have a
## witnessed minimum, and only when a police unit can see the player at that moment.
static func witnessed(crime: String, police_sees_player: bool) -> bool:
	return int(CRIMES[crime]["witnessed_stars"]) >= 0 and police_sees_player


## Count a crime. Returns the "raised" event, or {} when the level did not rise.
func report(crime: String, was_witnessed: bool = false) -> Dictionary:
	var rule: Dictionary = CRIMES[crime]
	if _since.has(crime) and float(_since[crime]) < float(rule["every"]):
		return {}
	_since[crime] = 0.0
	var before := stars
	var wanted_points: float = rule["points_wanted"]
	points += wanted_points if before > 0 and wanted_points >= 0.0 else float(rule["points"])
	var min_stars: int = rule["min_stars"]
	if was_witnessed:
		min_stars = maxi(min_stars, maxi(0, int(rule["witnessed_stars"])))
	stars = maxi(maxi(stars_for(points), min_stars), stars)
	stars = mini(stars, MAX_STARS)
	points = maxf(points, STAR_AT[stars])
	unseen_for = 0.0
	if stars > before:
		raised.emit(stars, crime)
		return {"type": "raised", "stars": stars, "crime": crime}
	return {}


func set_level(level: float) -> void:
	stars = clampi(floori(level), 0, MAX_STARS)
	points = STAR_AT[stars]
	unseen_for = 0.0
	held_for = 0.0


func clear() -> void:
	set_level(0)
	seen = false
	_since.clear()


## Advance the timers. `sight_seen`: a unit has a clear view; `held`: an officer is within
## BUST_RANGE of a player on foot keeping still; `responding`: the police have not reached the
## reported crime yet. Returns the event, or {}.
func update(dt: float, sight_seen: bool, held: bool, responding: bool = false) -> Dictionary:
	for crime: String in _since:
		_since[crime] = float(_since[crime]) + dt
	seen = stars > 0 and sight_seen
	if stars == 0:
		points = maxf(0.0, points - HEAT_COOL * dt)
		unseen_for = 0.0
		held_for = 0.0
		return {}
	if held and stars <= BUST_UP_TO:
		held_for += dt
		if held_for >= BUST_AFTER:
			var level := stars
			clear()
			busted.emit(level, BUST_FINE[level])
			return {"type": "busted", "stars": level, "fine": BUST_FINE[level]}
	else:
		held_for = 0.0
	if seen:
		unseen_for = 0.0
		return {}
	if responding:
		return {}
	unseen_for += dt
	if unseen_for < LOSE_AFTER[stars]:
		return {}
	stars -= 1
	points = STAR_AT[stars]
	unseen_for = 0.0
	lowered.emit(stars)
	return {"type": "lowered", "stars": stars}
