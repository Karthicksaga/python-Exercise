## Share auto (port of `missions/src/shareAuto.ts`): an auto-rickshaw on one fixed route,
## people waiting at the kerb anywhere along it, each paying a small fare by the distance ridden.
## One `ShareShift` per shift. Fares are estimates, not a published tariff.
class_name ShareShift
extends RefCounted

const SHARE_AUTO := {
	"capacity": 4,
	"base_fare": 10,
	"per_km": 5,
	"stopped": 1.2,
	"board_radius": 6.0,
	"drop_radius": 8.0,
	"board_seconds": 1.5,
	"drop_seconds": 1.0,
	"max_waiting": 3,
	"spawn_ahead_min": 60.0,
	"spawn_ahead_max": 320.0,
	"spawn_gap_min": 90.0,
	"spawn_gap_max": 240.0,
	"ride_min": 250.0,
	"ride_max": 1200.0,
	"pass_margin": 20.0,
	"miss_margin": 40.0,
	"end_margin": 40.0,
	"end_radius": 10.0,
	"off_route": 30.0,
}


class Passenger:
	var id := 0
	## waiting, riding, dropped, missed, left, gone
	var state := "waiting"
	var at := 0.0
	var drop_at := 0.0
	var x := 0.0
	var z := 0.0
	var stop_x := 0.0
	var stop_z := 0.0
	var drop_x := 0.0
	var drop_z := 0.0
	var fare := 0

	func to_dict() -> Dictionary:
		return {"id": id, "state": state, "at": at, "drop_at": drop_at, "x": x, "z": z, "stop": {"x": stop_x, "z": stop_z}, "drop": {"x": drop_x, "z": drop_z}, "fare": fare}


var route: JobData.ShareRoute
var line: RouteLine
var _random: Callable
## Keeps a SeededRandom alive: a Callable alone does not hold its object.
var _rng: RefCounted
var _people: Array[Passenger] = []
var _progress := 0.0
var _next_at: float
var _next_id := 1
var _stopped_for := 0.0
var _fare_total := 0


## Rupees for a ride of `metres`.
static func share_fare(metres: float) -> int:
	return RulesMath.js_round_int(float(SHARE_AUTO["base_fare"]) + float(SHARE_AUTO["per_km"]) * maxf(0.0, metres) / 1000.0)


## About what a good shift on a route this long earns.
static func share_estimate(route_length: float) -> int:
	var gap := (float(SHARE_AUTO["spawn_gap_min"]) + float(SHARE_AUTO["spawn_gap_max"])) / 2.0
	var ride := (float(SHARE_AUTO["ride_min"]) + float(SHARE_AUTO["ride_max"])) / 2.0
	var riders := maxi(1, floori((route_length - float(SHARE_AUTO["ride_min"]) - float(SHARE_AUTO["end_margin"])) / gap) + 1)
	return riders * share_fare(minf(ride, route_length))


## Reputation for a finished shift: a little per person carried, off per let-down, -5..+3.
static func share_reputation(summary: Dictionary) -> int:
	var carried: int = summary["carried"]
	var earned := 3 if carried >= 6 else (2 if carried >= 3 else (1 if carried >= 1 else 0))
	return maxi(-5, mini(3, earned - int(summary["missed"]) - int(summary["left"])))


## Rating for a finished shift, 1 to 5.
static func share_stars(summary: Dictionary, bumps: int) -> int:
	if int(summary["carried"]) == 0:
		return 1
	return maxi(1, mini(5, 5 - int(summary["missed"]) - int(summary["left"]) - floori(bumps / 2.0)))


## `random`: a SeededRandom, or a Callable returning a float in [0, 1). Default: seed 1.
func _init(share_route: JobData.ShareRoute, random: Variant = null) -> void:
	route = share_route
	if random is Callable:
		_random = random
	else:
		_rng = random if random is SeededRandom else SeededRandom.new(1)
		_random = (_rng as SeededRandom).next
	line = RouteLine.new(route.points)
	_next_at = _between(SHARE_AUTO["spawn_ahead_min"], float(SHARE_AUTO["spawn_ahead_min"]) + float(SHARE_AUTO["spawn_gap_min"]))


func progress() -> float:
	return _progress


func length() -> float:
	return line.length


func _list(state: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for p in _people:
		if state == "" or p.state == state:
			out.append(p.to_dict())
	return out


## Everyone who has appeared this shift (snapshots), in order.
func passengers() -> Array[Dictionary]:
	return _list("")


func waiting() -> Array[Dictionary]:
	return _list("waiting")


func riding() -> Array[Dictionary]:
	return _list("riding")


func aboard() -> int:
	var n := 0
	for p in _people:
		if p.state == "riding":
			n += 1
	return n


func fares() -> int:
	return _fare_total


## The end of the route (middle of the left lane): {x, z}.
func end_point() -> Dictionary:
	var p := line.point_at(line.length, route.lane)
	return {"x": p["x"], "z": p["z"]}


func stopped_seconds() -> float:
	return _stopped_for


func _count(state: String) -> int:
	var n := 0
	for p in _people:
		if p.state == state:
			n += 1
	return n


## {carried, fares, missed, left}
func summary() -> Dictionary:
	return {"carried": _count("dropped"), "fares": _fare_total, "missed": _count("missed"), "left": _count("left")}


## The auto is stopped at the end of the route.
func at_end(x: float, z: float, speed: float, in_vehicle: bool) -> bool:
	var e := end_point()
	return in_vehicle and speed < float(SHARE_AUTO["stopped"]) and RulesMath.hypot(x - float(e["x"]), z - float(e["z"])) <= float(SHARE_AUTO["end_radius"])


## End the shift: anyone still aboard never got where they were going.
func close() -> Dictionary:
	for p in _people:
		if p.state == "riding":
			p.state = "missed"
		elif p.state == "waiting":
			p.state = "gone"
	return summary()


func update(dt: float, x: float, z: float, speed: float, in_vehicle: bool) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if in_vehicle:
		var hit := line.project(x, z, _progress - 100.0, _progress + 1500.0)
		if float(hit["off"]) <= float(SHARE_AUTO["off_route"]):
			_progress = maxf(_progress, float(hit["s"]))
	for p in _people:
		if p.state == "waiting" and p.at < _progress - float(SHARE_AUTO["pass_margin"]):
			p.state = "left" if aboard() < int(SHARE_AUTO["capacity"]) else "gone"
			if p.state == "left":
				events.append({"type": "left", "passenger": p.to_dict()})
		elif p.state == "riding" and p.drop_at < _progress - float(SHARE_AUTO["miss_margin"]):
			p.state = "missed"
			events.append({"type": "missed", "passenger": p.to_dict()})
	var stopped := in_vehicle and speed < float(SHARE_AUTO["stopped"])
	_stopped_for = _stopped_for + dt if stopped else 0.0
	if stopped:
		# Out first, then in, so a seat freed here can be taken here.
		if _stopped_for >= float(SHARE_AUTO["drop_seconds"]):
			for p in _people:
				if p.state != "riding" or RulesMath.hypot(x - p.drop_x, z - p.drop_z) > float(SHARE_AUTO["drop_radius"]):
					continue
				p.state = "dropped"
				p.fare = share_fare(p.drop_at - p.at)
				_fare_total += p.fare
				events.append({"type": "dropped", "passenger": p.to_dict(), "fare": p.fare, "aboard": aboard()})
		if _stopped_for >= float(SHARE_AUTO["board_seconds"]):
			for p in _people:
				if aboard() >= int(SHARE_AUTO["capacity"]):
					break
				if p.state != "waiting" or RulesMath.hypot(x - p.x, z - p.z) > float(SHARE_AUTO["board_radius"]):
					continue
				p.state = "riding"
				events.append({"type": "boarded", "passenger": p.to_dict(), "aboard": aboard()})
	_spawn()
	return events


func _spawn() -> void:
	var last := line.length - float(SHARE_AUTO["end_margin"]) - float(SHARE_AUTO["ride_min"])
	var ahead_min := float(SHARE_AUTO["spawn_ahead_min"])
	if _next_at < _progress + ahead_min:
		_next_at = _progress + _between(ahead_min, ahead_min + float(SHARE_AUTO["spawn_gap_min"]))
	while _count("waiting") < int(SHARE_AUTO["max_waiting"]) and _next_at <= last and _next_at <= _progress + float(SHARE_AUTO["spawn_ahead_max"]):
		var at := _next_at
		var drop_at := minf(line.length - float(SHARE_AUTO["end_margin"]), at + _between(SHARE_AUTO["ride_min"], SHARE_AUTO["ride_max"]))
		var kerb := line.point_at(at, route.kerb)
		var stop := line.point_at(at, route.lane)
		var drop := line.point_at(drop_at, route.lane)
		var p := Passenger.new()
		p.id = _next_id
		_next_id += 1
		p.at = at
		p.drop_at = drop_at
		p.x = RulesMath.round1(kerb["x"])
		p.z = RulesMath.round1(kerb["z"])
		p.stop_x = RulesMath.round1(stop["x"])
		p.stop_z = RulesMath.round1(stop["z"])
		p.drop_x = RulesMath.round1(drop["x"])
		p.drop_z = RulesMath.round1(drop["z"])
		_people.append(p)
		_next_at += _between(SHARE_AUTO["spawn_gap_min"], SHARE_AUTO["spawn_gap_max"])


func _between(lo: float, hi: float) -> float:
	var r: float = _random.call()
	return RulesMath.js_round(lo + (hi - lo) * r)
