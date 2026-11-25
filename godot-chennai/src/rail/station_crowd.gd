class_name StationCrowd
extends RefCounted
## Passengers on a platform (port of `packages/rail/src/crowd.ts`): people wait along the edge for
## their line's train, walk to the nearest open door when it stops and get on; others get off and
## walk to the exits. Counts follow the time of day. All numbers are estimates for the look of
## the game, not passenger counts. Adults only (AGENTS.md: children never by the platform edge).
##
## The crowd works in the platform's own frame: `u` metres along the owning line from the stop's
## centre, `w` metres to its left. The view turns that into world positions.

## Most people waiting on one platform, and on it at all (waiting plus walking).
const MAX_WAITING := 24
const MAX_ON_PLATFORM := 36
## Most people getting on, and off, one train at one stop.
const MAX_BOARDING := 12
const MAX_ALIGHTING := 10
## People already on a train when it comes into view: least and most (estimated).
const LOAD_MIN := 40
const LOAD_MAX := 160
## A 4-coach train's room, people (estimated; crush load is far more).
const TRAIN_CAPACITY := 400
## Walking pace, m/s: people waiting stroll, people with a train to catch hurry.
const STROLL := 1.1
const HURRY := 1.6
## A newcomer arrives every this many seconds while the platform is short of its count.
const ARRIVE_EVERY := 1.4
## People step off one after another, this many seconds apart per door.
const ALIGHT_GAP := 0.6
const SHAPE: Array[float] = [0.08, 0.05, 0.04, 0.04, 0.1, 0.25, 0.45, 0.75, 1, 0.95, 0.7, 0.55, 0.5, 0.5, 0.5, 0.55, 0.7, 0.9, 1, 0.95, 0.7, 0.45, 0.25, 0.15]

const ARRIVING := 0
const WAITING := 1
const BOARDING := 2
const ALIGHTING := 3


class Passenger:
	extends RefCounted
	var id: int = 0
	var u: float = 0.0
	var w: float = 0.0
	## Heading in the platform's frame: radians from +u towards +w.
	var heading: float = 0.0
	var state: int = WAITING
	## Which service (index into the platform's edges) they wait for.
	var service: int = 0
	var tu: float = 0.0
	var tw: float = 0.0
	## Metres walked (drives the walk cycle).
	var walked: float = 0.0
	## Look index 0..7 (which person of the cast, which shirt).
	var look: int = 0
	## The train being boarded (or got off), else "".
	var train: String = ""
	## Seconds before an alighting passenger steps out.
	var delay: float = 0.0


## A platform edge a service's trains stand at.
class Edge:
	extends RefCounted
	var w: float = 0.0
	var inward: int = 1


## A train standing at the platform now.
class CrowdTrain:
	extends RefCounted
	var id: String = ""
	var service: int = 0
	## Its doorways on the platform's side, in the platform frame (x = u along, y = w at the edge).
	var doors: PackedVector2Array
	## Doors open, 0 shut to 1 open.
	var open: float = 0.0
	var dwell_left: float = 0.0
	## People on board when it stopped.
	var load: int = 0


class Spec:
	extends RefCounted
	var half: float = 55.0
	var edges: Array[Edge] = []
	var exits: PackedFloat64Array
	var middle: float = 0.0
	var key: String = ""
	## Furthest in from the edge people wait, metres.
	var depth: float = 3.0
	## Stretches along the platform where nobody waits (under stairs, at a stall), as (u0, u1).
	var blocked: PackedVector2Array = PackedVector2Array()


## What happened at one stop of one train: people on and off.
class Flow:
	extends RefCounted
	var board: int = 0
	var alight: int = 0
	var boarded: int = 0
	var alighted: int = 0


var people: Array[Passenger] = []
## Per train id standing here.
var flows: Dictionary[String, Flow] = {}
var spec: Spec
var _next_id: int = 0
var _since_arrival: float = 0.0
var _filled: bool = false
var _seq: int = 0


func _init(with_spec: Spec) -> void:
	spec = with_spec


## A deterministic 0..1 value for a key (same train, same stop, same answer): crowd.ts `hash01`.
static func hash01(key: String) -> float:
	var h := 2166136261
	var bytes := key.to_utf16_buffer()
	for i in range(0, bytes.size(), 2):
		var unit := bytes[i] | (bytes[i + 1] << 8)
		h = (h ^ unit) & 0xFFFFFFFF
		h = (h * 16777619) & 0xFFFFFFFF
	h = (h ^ (h >> 13)) & 0xFFFFFFFF
	h = (h * 0x5bd1e995) & 0xFFFFFFFF
	h = (h ^ (h >> 15)) & 0xFFFFFFFF
	return float(h) / 4294967296.0


## How many wait on a platform at this hour (0–24), for a station `busy` 0.5–1.
static func waiting_count(hour: float, busy: float = 1.0) -> int:
	var h := fposmod(hour, 24.0)
	var i := floori(h)
	var t := h - i
	var share := SHAPE[i] * (1.0 - t) + SHAPE[(i + 1) % 24] * t
	return maxi(1, mini(MAX_WAITING, roundi(MAX_WAITING * share * minf(1.0, maxf(0.3, busy)))))


## People on a train when it is first seen (stable per train id).
static func initial_load(train_id: String) -> int:
	return roundi(LOAD_MIN + (LOAD_MAX - LOAD_MIN) * hash01("load:%s" % train_id))


## How many get on and off a train at a stop (x = board, y = alight).
static func passenger_flow(waiting: int, load: int, train_id: String, stop: String, capacity: int = TRAIN_CAPACITY) -> Vector2i:
	var off := mini(maxi(0, load), roundi(2 + (MAX_ALIGHTING - 2) * hash01("off:%s:%s" % [train_id, stop])))
	var room := maxi(0, capacity - (load - off))
	var on := maxi(0, mini(mini(waiting, MAX_BOARDING), room))
	return Vector2i(on, off)


## People waiting (not walking to a door or away).
func waiting() -> int:
	var n := 0
	for p in people:
		if p.state == WAITING:
			n += 1
	return n


func count(state: int) -> int:
	var n := 0
	for p in people:
		if p.state == state:
			n += 1
	return n


func _random(tag: String) -> float:
	var v := hash01("%s:%s:%d" % [spec.key, tag, _seq])
	_seq += 1
	return v


## A spot to wait at for a service: along the platform, 1–3 m in from its edge.
func _spot(service: int) -> Vector2:
	var edge := spec.edges[service]
	var depth := maxf(1.2, spec.depth)
	var u := 0.0
	for tries in 8:
		u = (_random("u") * 2.0 - 1.0) * spec.half * 0.8
		var blocked := false
		for b in spec.blocked:
			if u > b.x and u < b.y:
				blocked = true
		if not blocked:
			break
	var w := edge.w + edge.inward * (1.1 + _random("w") * (depth - 1.1))
	return Vector2(u, w)


func _add(state: int, u: float, w: float, service: int, to: Vector2) -> Passenger:
	var p := Passenger.new()
	p.id = _next_id
	_next_id += 1
	p.u = u
	p.w = w
	p.state = state
	p.service = service
	p.tu = to.x
	p.tw = to.y
	p.look = floori(_random("look") * 8.0)
	people.append(p)
	return p


## One step: newcomers arrive while the platform is short of `target` waiting; when a train stands
## with its doors open, its share of the waiting walk to its doors and get on, and others get off
## and walk to the exits.
func step(dt: float, target: float, trains: Array[CrowdTrain]) -> void:
	var want := mini(MAX_WAITING, maxi(0, roundi(target)))
	if not _filled:
		# The first time the platform is seen, people are already waiting.
		_filled = true
		for i in want:
			var service := i % spec.edges.size()
			var at := _spot(service)
			var p := _add(WAITING, at.x, at.y, service, at)
			p.heading = atan2(-spec.edges[service].inward, 0.0)
	_since_arrival += dt
	var arriving := count(ARRIVING)
	if waiting() + arriving < want and people.size() < MAX_ON_PLATFORM and _since_arrival > ARRIVE_EVERY:
		_since_arrival = 0.0
		var service := floori(_random("svc") * spec.edges.size())
		var exit := spec.exits[floori(_random("exit") * spec.exits.size())]
		_add(ARRIVING, exit, spec.middle, service, _spot(service))

	# Trains at the platform: decide each stop's flow once, when the doors first open.
	var here: Dictionary[String, bool] = {}
	for train in trains:
		here[train.id] = true
		if train.open < 0.6 or train.doors.is_empty():
			continue
		if flows.has(train.id):
			continue
		var waiting_for: Array[Passenger] = []
		for p in people:
			if p.state == WAITING and p.service == train.service:
				waiting_for.append(p)
		var got := passenger_flow(waiting_for.size(), train.load, train.id, spec.key)
		var flow := Flow.new()
		flow.board = got.x
		flow.alight = got.y
		flows[train.id] = flow
		# Those nearest a door go first.
		waiting_for.sort_custom(func(a: Passenger, b: Passenger) -> bool: return _nearest_door(train.doors, a).z < _nearest_door(train.doors, b).z)
		for k in mini(flow.board, waiting_for.size()):
			var p := waiting_for[k]
			var door := _nearest_door(train.doors, p)
			p.state = BOARDING
			p.train = train.id
			p.tu = door.x
			p.tw = door.y
		# People getting off appear in the doorways, one after another at each door.
		var space := MAX_ON_PLATFORM - people.size()
		var edge := spec.edges[train.service]
		for i in mini(flow.alight, maxi(0, space)):
			var door := train.doors[i % train.doors.size()]
			var exit := _nearest_exit(door.x)
			var p := _add(ALIGHTING, door.x, door.y + edge.inward * 0.2, train.service, Vector2(exit, spec.middle))
			p.train = train.id
			p.delay = floorf(float(i) / train.doors.size()) * ALIGHT_GAP
	# A train that left takes no one else: anyone still walking to it waits for the next.
	for p in people:
		if p.state == BOARDING and p.train != "" and not here.has(p.train):
			p.state = WAITING
			p.train = ""
			var at := _spot(p.service)
			p.tu = at.x
			p.tw = at.y
	for id: String in flows.keys():
		if not here.has(id):
			flows.erase(id)

	# Walk.
	for i in range(people.size() - 1, -1, -1):
		var p := people[i]
		if p.delay > 0.0:
			p.delay -= dt
			continue
		if p.state == WAITING:
			var face := atan2(-spec.edges[p.service].inward, 0.0)
			p.heading += wrapf(face - p.heading, -PI, PI) * minf(1.0, dt * 2.0)
			continue
		var pace := HURRY if p.state == BOARDING else STROLL
		var du := p.tu - p.u
		var dw := p.tw - p.w
		var d := sqrt(du * du + dw * dw)
		var step_length := minf(d, pace * dt)
		if d > 1e-6:
			p.u += du / d * step_length
			p.w += dw / d * step_length
			p.walked += step_length
			p.heading = atan2(dw, du)
		if d - step_length > 0.15:
			continue
		if p.state == ARRIVING:
			p.state = WAITING
		elif p.state == BOARDING:
			if flows.has(p.train):
				flows[p.train].boarded += 1
			people.remove_at(i)
		elif p.state == ALIGHTING:
			people.remove_at(i)
	# Count people off once they are clear of the doorway.
	for p in people:
		if p.state != ALIGHTING or p.train == "" or p.delay > 0.0:
			continue
		if p.walked > 0.5:
			if flows.has(p.train):
				flows[p.train].alighted += 1
			p.train = ""


## (u, w, distance) of the door nearest a passenger.
static func _nearest_door(doors: PackedVector2Array, p: Passenger) -> Vector3:
	var best := Vector3(doors[0].x, doors[0].y, INF)
	for door in doors:
		var d := Vector2(door.x - p.u, door.y - p.w).length()
		if d < best.z:
			best = Vector3(door.x, door.y, d)
	return best


func _nearest_exit(u: float) -> float:
	var best := spec.exits[0]
	for e in spec.exits:
		if absf(e - u) < absf(best - u):
			best = e
	return best
