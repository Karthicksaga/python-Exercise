class_name GameClock
extends RefCounted
## Time of day in the game (`clock.ts`). One real minute is one game hour by default, so a full
## day takes 24 minutes. Pure logic: the renderer reads `hour` for light and sky, the AI for traffic.
## Advanced by the fixed step (`GameLoop`), so it follows game time, never the wall clock.

## Named times the player can jump to from the pause menu.
const TIMES_OF_DAY: Array[Dictionary] = [
	{"label": "Morning", "hour": 8.5},
	{"label": "Noon", "hour": 12.5},
	{"label": "Evening", "hour": 17.75},
	{"label": "Night", "hour": 21.5},
]
const GOLDEN_HOUR := 17.75

## Game hours per real second; 0 stops the clock.
var hours_per_second: float = 1.0 / 60.0
var _time: float = GOLDEN_HOUR

## 0 (midnight) to just under 24.
var hour: float:
	get:
		return _time
	set(value):
		_time = _wrap(value)


func _init(start_hour: float = GOLDEN_HOUR, rate: float = 1.0 / 60.0) -> void:
	_time = _wrap(start_hour)
	hours_per_second = rate


static func _wrap(h: float) -> float:
	if is_nan(h) or is_inf(h):
		return GOLDEN_HOUR
	return fposmod(h, 24.0)


func advance(dt: float) -> void:
	_time = _wrap(_time + dt * hours_per_second)


## The named time closest to now.
func label() -> String:
	var best: String = TIMES_OF_DAY[0]["label"]
	var gap := INF
	for t: Dictionary in TIMES_OF_DAY:
		var h: float = t["hour"]
		var d := minf(absf(h - _time), 24.0 - absf(h - _time))
		if d < gap:
			gap = d
			best = t["label"]
	return best


## Jump to the next named time (pause menu).
func next() -> void:
	var current := label()
	for i in TIMES_OF_DAY.size():
		if TIMES_OF_DAY[i]["label"] == current:
			_time = TIMES_OF_DAY[(i + 1) % TIMES_OF_DAY.size()]["hour"]
			return


## "17:45"
func text() -> String:
	var minutes := roundi(_time * 60.0) % (24 * 60)
	return "%02d:%02d" % [floori(minutes / 60.0), minutes % 60]
