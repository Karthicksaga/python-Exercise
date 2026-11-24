## Runs the story stages in order (port of `missions/src/MissionRunner.ts`): the current
## objective, its countdown, money earned and which stages are done. Pure logic, stepped by the
## game's fixed step with game-time `dt`.
##
## Event-driven (godot-signals-groups): `update()` returns the events as Dictionaries (the TS
## shapes: {type: "objective"|"completed"|"failed"|"allDone", ...}) and also emits a typed
## signal for each, so the HUD, sound and save can listen without holding the runner.
class_name MissionRunner
extends RefCounted

signal objective_started(label: String)
signal stage_completed(mission: MissionData.Mission)
signal stage_failed(mission: MissionData.Mission, reason: String)
signal all_done()

## Below this speed (m/s) a vehicle counts as stopped.
const STOPPED := 1.2

var _missions: Array[MissionData.Mission] = []
var _completed: Array[String] = []
var _money := 0
var _mission_index := 0
var _objective_index := 0
var _time_left := -1.0
var _timed := false
var _chased := 0.0
var _fare_stop: FareStop = null
var _goods_stop: GoodsStop = null
var _riders := 0
var _wanted_seen := false


## `saved`: the progress shape {completed: [ids], money} (the `cow-progress-v1` save).
func _init(missions: Array, saved: Dictionary = {}) -> void:
	for m: MissionData.Mission in missions:
		_missions.append(m)
	var known := {}
	for m in _missions:
		known[m.id] = true
	for id: Variant in saved.get("completed", []):
		var s := str(id)
		if known.has(s) and not _completed.has(s):
			_completed.append(s)
	var money: Variant = saved.get("money", 0)
	_money = maxi(0, floori(float(money))) if (money is int or money is float) else 0
	_mission_index = _first_open()
	_arm_timer()


func _first_open() -> int:
	for i in _missions.size():
		if not _completed.has(_missions[i].id):
			return i
	return _missions.size()


## The stage being played, or null when every stage is finished.
func mission() -> MissionData.Mission:
	return _missions[_mission_index] if _mission_index < _missions.size() else null


func objective() -> MissionData.Objective:
	var m := mission()
	if m == null or _objective_index >= m.objectives.size():
		return null
	return m.objectives[_objective_index]


## Seconds left on the current objective, or null when it isn't timed.
func seconds_left() -> Variant:
	return _time_left if _timed else null


## Where the quarry of the current chase is ({x, z, heading}), or null.
func quarry() -> Variant:
	var o := objective()
	return Chase.point_along(o.path, _chased) if o != null and o.type == "chase" else null


func fare() -> FareStop:
	return _fare_stop


func goods() -> GoodsStop:
	return _goods_stop


## Where the current objective sits in its stage (for `GoodsStop.cargo_aboard`).
func objective_number() -> int:
	return _objective_index


## Passengers in the vehicle now.
func aboard() -> int:
	return _riders + (_fare_stop.change() if _fare_stop != null else 0)


func balance() -> int:
	return _money


func stages_done() -> int:
	return _completed.size()


func stage_count() -> int:
	return _missions.size()


## The progress shape that is saved: {completed, money}.
func progress() -> Dictionary:
	return {"completed": _completed.duplicate(), "money": _money}


func _arm_timer() -> void:
	var o := objective()
	_timed = o != null and o.type == "reach" and o.time_limit > 0.0
	_time_left = o.time_limit if _timed else -1.0
	_chased = 0.0
	_wanted_seen = false
	if _objective_index == 0:
		_riders = 0
	var kind := "car"
	if o != null and o.mode != "" and o.mode != "foot":
		kind = o.mode
	_fare_stop = FareStop.new(o.fare, kind) if o != null and o.type == "reach" and o.fare != null else null
	_goods_stop = GoodsStop.new(o.goods, kind) if o != null and o.type == "reach" and o.goods != null else null


func _met(o: MissionData.Objective, p: MissionData.PlayerStatus) -> bool:
	match o.type:
		"enter":
			return p.mode == o.vehicle
		"defeat":
			return p.cleared.has(o.group)
		"evade":
			return _wanted_seen and p.wanted == 0
		"chase":
			var q := Chase.point_along(o.path, _chased)
			return p.mode != "foot" and RulesMath.hypot(p.x - float(q["x"]), p.z - float(q["z"])) <= o.radius
	if o.mode != "" and p.mode != o.mode:
		return false
	if o.by_train and not p.on_train:
		return false
	if RulesMath.hypot(p.x - o.x, p.z - o.z) > o.radius:
		return false
	return not o.stop or p.speed < STOPPED


## Advance by `dt` game seconds. Returns what happened (and emits the signals).
func update(dt: float, p: MissionData.PlayerStatus) -> Array[Dictionary]:
	var events := _update(dt, p)
	_emit(events)
	return events


func _update(dt: float, p: MissionData.PlayerStatus) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var m := mission()
	var o := objective()
	if m == null or o == null:
		return events
	if o.type == "evade" and p.wanted > 0:
		_wanted_seen = true
	# The clock waits while people or goods change hands: arriving in time is what counts.
	if _timed and not (_fare_stop != null and _fare_stop.started()) and not (_goods_stop != null and _goods_stop.started()):
		_time_left -= dt
		if _time_left <= 0.0:
			_objective_index = 0
			_arm_timer()
			events.append({"type": "failed", "mission": m, "reason": "Out of time"})
			return events
	if o.type == "chase" and not _met(o, p):
		var q := Chase.point_along(o.path, _chased)
		_chased += Chase.quarry_speed(o.speed, RulesMath.hypot(p.x - float(q["x"]), p.z - float(q["z"]))) * dt
		if _chased >= Chase.path_length(o.path):
			_objective_index = 0
			_arm_timer()
			events.append({"type": "failed", "mission": m, "reason": "They got away"})
		return events
	if _fare_stop != null:
		if not _fare_stop.step(dt, _met(o, p), p.x, p.z):
			return events
	elif _goods_stop != null:
		if not _goods_stop.step(dt, _met(o, p), p.x, p.z):
			return events
	elif not _met(o, p):
		return events

	_riders = aboard()
	_objective_index += 1
	if _objective_index < m.objectives.size():
		_arm_timer()
		events.append({"type": "objective", "label": m.objectives[_objective_index].label})
		return events
	_completed.append(m.id)
	_money += m.reward
	events.append({"type": "completed", "mission": m})
	_mission_index = _first_open()
	_objective_index = 0
	_arm_timer()
	if mission() == null:
		events.append({"type": "allDone"})
	return events


func _emit(events: Array[Dictionary]) -> void:
	for e in events:
		match e["type"]:
			"objective":
				objective_started.emit(e["label"])
			"completed":
				stage_completed.emit(e["mission"])
			"failed":
				stage_failed.emit(e["mission"], e["reason"])
			"allDone":
				all_done.emit()


## Start the current stage again from its first objective (after a knock-out).
func restart_stage() -> void:
	_objective_index = 0
	_arm_timer()


## Take money away (hospital bill); never below zero. Returns what was actually taken.
func charge(rupees: float) -> int:
	var taken := mini(_money, maxi(0, floori(rupees)))
	_money -= taken
	return taken


## Add money earned outside the stages (city jobs).
func earn(rupees: float) -> void:
	_money += maxi(0, floori(rupees))


## Forget all progress (new game).
func reset() -> void:
	_completed.clear()
	_money = 0
	_mission_index = 0
	_objective_index = 0
	_arm_timer()
