## Time of day in the game (port of `game-world/src/clock.ts`). One real minute is one game hour
## by default. Pure: the game advances it with the fixed step's dt; rules and tests read `hour`
## (game time, never the wall clock). Named `DayClock` so it does not clash with an autoload.
class_name DayClock
extends RefCounted

## Named times the player can jump to from the pause menu.
const TIMES_OF_DAY: Array[Dictionary] = [
	{"label": "Morning", "hour": 8.5},
	{"label": "Noon", "hour": 12.5},
	{"label": "Evening", "hour": 17.75},
	{"label": "Night", "hour": 21.5},
]

var hours_per_second: float
var _time: float


func _init(start_hour: float = 17.75, per_second: float = 1.0 / 60.0) -> void:
	hours_per_second = per_second
	_time = _wrap(start_hour)


static func _wrap(h: float) -> float:
	if is_nan(h) or is_inf(h):
		return 17.75
	return RulesMath.wrap_hour(h)


var hour: float:
	get:
		return _time
	set(value):
		_time = _wrap(value)


func advance(dt: float) -> void:
	_time = _wrap(_time + dt * hours_per_second)


## The named time closest to now.
func label() -> String:
	var best: String = TIMES_OF_DAY[0]["label"]
	var gap := INF
	for t: Dictionary in TIMES_OF_DAY:
		var h: float = t["hour"]
		var d: float = minf(absf(h - _time), 24.0 - absf(h - _time))
		if d < gap:
			gap = d
			best = t["label"]
	return best


## Jump to the next named time.
func next() -> void:
	var current := label()
	for i in TIMES_OF_DAY.size():
		if TIMES_OF_DAY[i]["label"] == current:
			_time = TIMES_OF_DAY[(i + 1) % TIMES_OF_DAY.size()]["hour"]
			return


## "17:45"
func text() -> String:
	var minutes: int = RulesMath.js_round_int(_time * 60.0) % (24 * 60)
	return "%02d:%02d" % [minutes / 60, minutes % 60]
