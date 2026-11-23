## People getting in and out at one pick-up or drop (port of `missions/src/fares.ts`). Someone
## waits at the kerb, walks to the vehicle once it has stopped and gets in; at a drop they get
## out and walk off; a bus stop does both (off first, then on). Each person has their own clock
## so the game can draw them from `people()`. All times are estimates.
##
## Rules: nobody moves until the vehicle is stopped in the marker; those getting off go first,
## one after the other, then those getting on; someone walking over walks back if the vehicle
## drives off before they reach the door; once at the door they finish; the stop is done when
## every boarder is in and every leaver has walked off.
class_name FareStop
extends RefCounted

## Every timing in one place (estimates).
const FARES := {
	"walk_speed": 1.3,
	"max_walk": 14.0,
	"min_walk": 0.6,
	"door_offset": 1.0,
	"enter": {"auto": 1.2, "car": 1.8, "ambulance": 2.6, "bus": 1.0, "bike": 1.0},
	"patient_factor": 1.5,
	"gap": 0.9,
	"walk_off": 2.5,
}


class Person:
	var action := "board"
	var index := 0
	var t := 0.0
	var walk := 0.0


var fare: MissionData.Fare
var vehicle: String
var _people: Array[Person] = []
var _door: float


## Seconds of a walk of `metres`, clamped to the counted range.
static func walk_time(metres: float) -> float:
	return minf(FARES["max_walk"], maxf(FARES["min_walk"], metres)) / float(FARES["walk_speed"])


## Seconds at the door for one person.
static func door_time(kind: String, patient: bool = false) -> float:
	return float(FARES["enter"][kind]) * (float(FARES["patient_factor"]) if patient else 1.0)


## Who gets on and off at each of a bus route's stops: [{board, alight}], empty at the start,
## everyone off at the end.
static func bus_crowd(stops: int, capacity: int = 6) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var aboard := 0
	for i in stops:
		var last := i == stops - 1
		var alight := aboard if last else mini(aboard, 0 if i == 0 else 1 + (i % 2))
		aboard -= alight
		var board := 0 if last else mini(capacity - aboard, 3 if i == 0 else 2 - (i % 2))
		aboard += board
		out.append({"board": board, "alight": alight})
	return out


func _init(f: MissionData.Fare, kind: String) -> void:
	fare = f
	vehicle = kind
	_door = door_time(kind, f.patient)
	for i in maxi(0, f.alight):
		var p := Person.new()
		p.action = "alight"
		p.index = i
		_people.append(p)
	for i in maxi(0, f.board):
		var p := Person.new()
		p.action = "board"
		p.index = i
		_people.append(p)


## Someone has started moving: the stage's clock waits while people get in and out.
func started() -> bool:
	for p in _people:
		if p.t > 0.0:
			return true
	return false


func done() -> bool:
	for p in _people:
		if not _finished(p):
			return false
	return true


## Change in the people inside so far: those in, less those who have got out.
func change() -> int:
	var n := 0
	for p in _people:
		if p.action == "board" and p.walk > 0.0 and p.t >= p.walk + _door:
			n += 1
		if p.action == "alight" and p.t > 0.0:
			n -= 1
	return n


func _finished(p: Person) -> bool:
	if p.action == "board":
		return p.walk > 0.0 and p.t >= p.walk + _door
	return p.walk > 0.0 and p.t >= _door + p.walk


func _committed(p: Person) -> bool:
	return p.t > 0.0 if p.action == "alight" else (p.walk > 0.0 and p.t >= p.walk)


## One step. `ready`: the vehicle is stopped in the marker with the player driving it; (x, z):
## the vehicle's position. Returns true once everyone is in and out.
func step(dt: float, ready: bool, x: float, z: float) -> bool:
	var kerb_to_vehicle := maxf(0.0, RulesMath.hypot(x - fare.kerb_x, z - fare.kerb_z) - float(FARES["door_offset"]))
	var before: Person = null
	for p in _people:
		if _finished(p):
			before = p
			continue
		if _committed(p):
			p.t += dt
		elif ready and _may_start(p, before):
			if p.t == 0.0:
				p.walk = walk_time(kerb_to_vehicle) if p.action == "board" else walk_time(kerb_to_vehicle + float(FARES["walk_off"]))
			p.t += dt
		elif p.t > 0.0:
			p.t = maxf(0.0, p.t - dt)
		before = p
	return done()


func _may_start(p: Person, before: Person) -> bool:
	if p.action == "board":
		for q in _people:
			if q.action == "alight" and q.t < _door:
				return false
	if before == null or before.action != p.action:
		return true
	return before.t >= float(FARES["gap"]) or _finished(before)


## Everyone at this stop: [{action, index, stage, share, walk_seconds}].
func people() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for p in _people:
		var stage := ""
		var share := 0.0
		if p.action == "board":
			if p.t <= 0.0 or p.walk <= 0.0:
				stage = "waiting"
			elif p.t < p.walk:
				stage = "walking"
				share = p.t / p.walk
			elif p.t < p.walk + _door:
				stage = "entering"
				share = (p.t - p.walk) / _door
			else:
				stage = "inside"
		else:
			if p.t <= 0.0:
				stage = "riding"
			elif p.t < _door:
				stage = "exiting"
				share = p.t / _door
			elif p.t < _door + p.walk:
				stage = "leaving"
				share = (p.t - _door) / p.walk
			else:
				stage = "gone"
		out.append({"action": p.action, "index": p.index, "stage": stage, "share": share, "walk_seconds": p.walk})
	return out


## A line for the HUD while people are moving, or "".
func note() -> String:
	if not started() or done():
		return ""
	var out := false
	var into := false
	for p in _people:
		if not _finished(p):
			if p.action == "alight":
				out = true
			else:
				into = true
	var many := fare.board + fare.alight > 1
	if fare.patient:
		return "The patient is being taken in" if out else "The patient is being loaded"
	if out and into:
		return "People getting off and on"
	if out:
		return "Passengers getting out" if many else "Passenger getting out"
	return "Passengers getting in" if many else "Passenger getting in"
