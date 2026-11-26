## Seeded random events during a city job or mission (G-146, `dynamic_event`): a blocked road, a
## procession, rain starting, a bandh closing an arterial, a passenger changing the destination.
## At most one is active; the first never comes before FIRST_AT seconds; the gap to the next is
## GAP_MIN..GAP_MAX seconds; none while the player is fighting; a kind comes once per run. The seed
## (job id + attempt) makes a run repeatable and different runs different. Pure logic.
class_name DynamicEvents
extends RefCounted

const FIRST_AT := 25.0
const GAP_MIN := 40.0
const GAP_MAX := 90.0
## The default table: kind, weight, how long it lasts (s), seconds it adds to the clock (a
## detour allows for itself), a zone around the player's route when it needs one.
const TABLE: Array[Dictionary] = [
	{"kind": "detour", "key": "event.detour", "weight": 3, "duration": 45.0, "time": 20.0, "text": "Road ahead blocked by a water-main repair. Find another way."},
	{"kind": "procession", "key": "event.procession", "weight": 2, "duration": 60.0, "time": 15.0, "text": "A temple procession fills the road ahead. Slow down or go round."},
	{"kind": "rain", "key": "event.rain", "weight": 2, "duration": 120.0, "time": 0.0, "text": "Rain starts. The road will be slick."},
	{"kind": "bandh", "key": "event.bandh", "weight": 1, "duration": 90.0, "time": 25.0, "text": "A bandh: shops are shutting and the main road is closed."},
	{"kind": "passenger_change", "key": "event.passenger_change", "weight": 2, "duration": 0.0, "time": 15.0, "text": "The passenger changes their mind: somewhere nearer, please."},
]

var _rng: SeededRandom
var _clock := 0.0
var _next_at := FIRST_AT
var _active: Dictionary = {}
var _active_until := 0.0
var _used: Array[String] = []
var _table: Array[Dictionary]
var _fare_jobs := false


## `seed_text`: the job or mission id plus the attempt number; `has_passenger`: whether a
## passenger event is possible (a cab or bus job).
func _init(seed_text: String, has_passenger: bool = false, table: Array[Dictionary] = TABLE) -> void:
	_rng = SeededRandom.new(hash(seed_text) & 0x7fffffff)
	_table = table
	_fare_jobs = has_passenger
	_next_at = FIRST_AT + _rng.next() * 10.0


## The event now active, or {}.
func active() -> Dictionary:
	return _active


## Advance by `dt`; `fighting`: no event may start during a fight. Returns the event that
## started this step ({kind, text, duration, time, at}) or {}; `ended` is set in `last_ended`.
var last_ended: Dictionary = {}


func step(dt: float, fighting: bool = false) -> Dictionary:
	_clock += dt
	last_ended = {}
	if not _active.is_empty() and float(_active["duration"]) > 0.0 and _clock >= _active_until:
		last_ended = _active
		_active = {}
		_next_at = _clock + GAP_MIN + _rng.next() * (GAP_MAX - GAP_MIN)
	if not _active.is_empty() or fighting or _clock < _next_at:
		return {}
	var pool: Array[Dictionary] = []
	var total := 0.0
	for e in _table:
		var kind := str(e["kind"])
		if _used.has(kind) or (kind == "passenger_change" and not _fare_jobs):
			continue
		pool.append(e)
		total += float(e["weight"])
	if pool.is_empty():
		return {}
	var roll := _rng.next() * total
	var chosen: Dictionary = pool[pool.size() - 1]
	for e in pool:
		roll -= float(e["weight"])
		if roll < 0.0:
			chosen = e
			break
	_used.append(str(chosen["kind"]))
	_active = chosen.duplicate()
	_active["at"] = _clock
	_active_until = _clock + float(chosen["duration"])
	if float(chosen["duration"]) <= 0.0:
		# An instant event (a changed destination) is over at once.
		last_ended = {}
		var started := _active
		_active = {}
		_next_at = _clock + GAP_MIN + _rng.next() * (GAP_MAX - GAP_MIN)
		return started
	return _active


## How many kinds have happened this run.
func used() -> Array[String]:
	return _used
