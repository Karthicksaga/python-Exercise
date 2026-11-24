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
## G-140..G-142: a retry from a checkpoint is offered, a failure branched forward, a checkpoint
## was reached, a choice is asked, a medal earned.
signal checkpoint_reached(index: int)
signal choice_asked(options: Array)

## Below this speed (m/s) a vehicle counts as stopped.
const STOPPED := 1.2
## A replayed stage or extra pays this fraction of its reward (a replay is for the medal).
const REPLAY_SCALE := 0.25

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
## --- G-140..G-143 state ---
var _extras: Array[MissionData.Mission] = []
var _override: MissionData.Mission = null
var _checkpoint := 0
var _reward_scale := 1.0
var _stats := MissionStats.new()
var _stability := Stability.new()
var _tail: TailWatch = null
var _tail_travelled := 0.0
var _tail_pause := 0.0
var _tail_paused: Array[int] = []
var _object_clock := 0.0
var _choosing := false
var _rough_in: Dictionary = {}
var _hazard: Dictionary = {"inside": false, "speed_scale": 1.0, "stalled": false, "depth": 0.0}
## Best medal per mission id, choices made (flag -> true), extras finished.
var _medals: Dictionary = {}
var _flags: Dictionary = {}
var _extras_done: Array[String] = []
var _starting_replay := false


## `saved`: the progress shape {completed: [ids], money} (the `cow-progress-v1` save).
func _init(missions: Array, saved: Dictionary = {}, extras: Array = [], extra_saved: Dictionary = {}) -> void:
	for m: MissionData.Mission in missions:
		_missions.append(m)
	for m: MissionData.Mission in extras:
		_extras.append(m)
	var medals: Variant = extra_saved.get("medals", {})
	if medals is Dictionary:
		for id: Variant in medals:
			if Medals.RANK.has(str(medals[id])):
				_medals[str(id)] = str(medals[id])
	var flags: Variant = extra_saved.get("flags", {})
	if flags is Dictionary:
		for f: Variant in flags:
			_flags[str(f)] = true
	for id: Variant in extra_saved.get("extrasDone", []):
		_extras_done.append(str(id))
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
	if _override != null:
		return _override
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
	_timed = o != null and (o.type == "reach" or o.type == "fragile" or o.type == "hazard_zone") and o.time_limit > 0.0
	_time_left = o.time_limit if _timed else -1.0
	_chased = 0.0
	_wanted_seen = false
	_object_clock = 0.0
	_tail = null
	_tail_travelled = 0.0
	_tail_pause = 0.0
	_tail_paused.clear()
	_rough_in.clear()
	_choosing = o != null and o.type == "choice"
	_hazard = {"inside": false, "speed_scale": 1.0, "stalled": false, "depth": 0.0}
	if o != null and o.type == "tail":
		_tail = TailWatch.make(o.near, o.far, o.notice, o.grace)
	if _objective_index == 0:
		_riders = 0
	var reach_like := o != null and (o.type == "reach" or o.type == "fragile" or o.type == "hazard_zone")
	var kind := "car"
	if o != null and o.mode != "" and o.mode != "foot":
		kind = o.mode
	_fare_stop = FareStop.new(o.fare, kind) if reach_like and o.fare != null else null
	_goods_stop = GoodsStop.new(o.goods, kind) if reach_like and o.goods != null else null


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
	_object_clock += dt
	_stats.seconds += dt
	_stats.max_wanted = maxi(_stats.max_wanted, p.wanted)
	if p.crash > 0.0:
		_stats.damage_taken += 1
	if p.horn and p.in_quiet_zone:
		_stats.horns_in_quiet_zone += 1
	if o.type == "evade" and p.wanted > 0:
		_wanted_seen = true
	if o.strict and (p.wrecked or p.down):
		_fail(m, MissionFailure.Reason.VEHICLE_DESTROYED if p.wrecked else MissionFailure.Reason.PLAYER_DOWN, events)
		return events
	if _choosing:
		return events
	_step_hazards(o, p)
	if o.type == "fragile":
		var breaker := p.breaker_speed
		var pothole := p.pothole
		if p.mode != "foot":
			for i in o.rough.size():
				var r := o.rough[i]
				var in_patch := RulesMath.hypot(p.x - float(r["x"]), p.z - float(r["z"])) < float(r.get("radius", 4.0))
				if in_patch and not bool(_rough_in.get(i, false)):
					if str(r.get("kind", "pothole")) == "breaker":
						breaker = maxf(breaker, p.speed)
					else:
						pothole = true
				_rough_in[i] = in_patch
		_stability.step(dt, p.decel, p.lateral, p.speed, breaker, pothole, p.crash)
		_stats.stability_lowest = minf(_stats.stability_lowest, _stability.value)
		if _stability.is_ruined():
			_fail(m, MissionFailure.from_id(o.ruin) as MissionFailure.Reason, events)
			return events
	# The clock waits while people or goods change hands: arriving in time is what counts.
	if _timed and not (_fare_stop != null and _fare_stop.started()) and not (_goods_stop != null and _goods_stop.started()):
		_time_left -= dt
		if _time_left <= 0.0:
			_fail(m, MissionFailure.Reason.OUT_OF_TIME, events)
			return events
	if o.type == "tail":
		return _step_tail(dt, p, m, o, events)
	if o.type == "chase" and not _met(o, p):
		var q := Chase.point_along(o.path, _chased)
		_chased += Chase.quarry_speed(o.speed, RulesMath.hypot(p.x - float(q["x"]), p.z - float(q["z"]))) * dt
		if _chased >= Chase.path_length(o.path):
			_fail(m, MissionFailure.Reason.TARGET_ESCAPED, events)
		return events
	if _fare_stop != null:
		if not _fare_stop.step(dt, _met(o, p), p.x, p.z):
			return events
	elif _goods_stop != null:
		if not _goods_stop.step(dt, _met(o, p), p.x, p.z):
			return events
	elif not _met(o, p):
		return events
	if _timed:
		_stats.seconds_left = _time_left
	_complete_objective(m, o, events, -1)
	return events


## The objective is done: on to the next (`jump` >= 0: to that index), or the stage is complete.
func _complete_objective(m: MissionData.Mission, o: MissionData.Objective, events: Array[Dictionary], jump: int) -> void:
	_riders = aboard()
	var next := jump if jump >= 0 else _objective_index + 1
	if o.checkpoint and next < m.objectives.size():
		_checkpoint = next
		events.append({"type": "checkpoint", "index": next, "label": m.objectives[next].label})
	_objective_index = next
	if _objective_index < m.objectives.size():
		_arm_timer()
		events.append({"type": "objective", "label": m.objectives[_objective_index].label})
		if _choosing:
			events.append({"type": "choice", "options": m.objectives[_objective_index].options})
		return
	_finish_stage(m, events)


func _finish_stage(m: MissionData.Mission, events: Array[Dictionary]) -> void:
	var replay := _is_done(m)
	var pay := floori(float(m.reward) * _reward_scale)
	if replay:
		pay = floori(float(pay) * REPLAY_SCALE)
	var result := Medals.evaluate(m.goals, _stats)
	var medal: String = result["medal"]
	if medal != Medals.NONE:
		_medals[m.id] = Medals.best(str(_medals.get(m.id, "")), medal)
	_money += pay
	if _override != null:
		if not _extras_done.has(m.id):
			_extras_done.append(m.id)
	elif not _completed.has(m.id):
		_completed.append(m.id)
	events.append({"type": "completed", "mission": m, "paid": pay, "medal": medal, "goals_met": result["met"], "replay": replay, "forwarded": _reward_scale < 1.0})
	_override = null
	_reset_attempt()
	_mission_index = _first_open()
	_objective_index = 0
	_arm_timer()
	if mission() == null:
		events.append({"type": "allDone"})


func _is_done(m: MissionData.Mission) -> bool:
	return _completed.has(m.id) or _extras_done.has(m.id)


## A fresh attempt: no checkpoint, full reward, new stats and meters.
func _reset_attempt() -> void:
	_checkpoint = 0
	_reward_scale = 1.0
	_stats = MissionStats.new()
	_stability.reset()


## A failure: branch forward if the objective says so, else back to the last checkpoint.
func _fail(m: MissionData.Mission, reason: MissionFailure.Reason, events: Array[Dictionary]) -> void:
	var o := objective()
	var text := MissionFailure.text(reason)
	if o != null and o.on_fail != "":
		var to := objective_index_of(o.on_fail)
		if to >= 0:
			_reward_scale = minf(_reward_scale, o.on_fail_scale)
			_objective_index = to
			_arm_timer()
			events.append({"type": "forwarded", "mission": m, "reason": text, "reason_id": MissionFailure.id_of(reason), "label": m.objectives[to].label, "scale": _reward_scale})
			return
	var retries := _stats.retries + 1
	_objective_index = _checkpoint
	_stats = MissionStats.new()
	_stats.retries = retries
	_stability.reset()
	_arm_timer()
	events.append({"type": "failed", "mission": m, "reason": text, "reason_id": MissionFailure.id_of(reason), "checkpoint": _checkpoint})


func objective_index_of(id: String) -> int:
	var m := mission()
	if m == null or id == "":
		return -1
	for i in m.objectives.size():
		if m.objectives[i].id == id:
			return i
	return -1


func _step_hazards(o: MissionData.Objective, p: MissionData.PlayerStatus) -> void:
	var scale := 1.0
	var stalled := false
	var inside := false
	var depth := 0.0
	for h in o.hazards:
		var e := h.effect(p.x, p.z, _object_clock, p.rain)
		if bool(e["inside"]):
			inside = true
			scale = minf(scale, float(e["speed_scale"]))
			stalled = stalled or bool(e["stalled"])
			depth = maxf(depth, float(e["depth"]))
	_hazard = {"inside": inside, "speed_scale": scale, "stalled": stalled, "depth": depth}
	if inside:
		_stats.hazard_seconds += 0.0


func _step_tail(dt: float, p: MissionData.PlayerStatus, m: MissionData.Mission, o: MissionData.Objective, events: Array[Dictionary]) -> Array[Dictionary]:
	if _tail_pause > 0.0:
		_tail_pause = maxf(0.0, _tail_pause - dt)
	else:
		_tail_travelled += o.speed * dt
		for i in o.pauses.size():
			if not _tail_paused.has(i) and _tail_travelled >= float(o.pauses[i]["at"]):
				_tail_paused.append(i)
				_tail_pause = float(o.pauses[i]["seconds"])
	var length := Chase.path_length(o.path)
	var q := Chase.point_along(o.path, minf(_tail_travelled, length))
	var gap := RulesMath.hypot(p.x - float(q["x"]), p.z - float(q["z"]))
	_tail.step(dt, gap, p.red_light)
	_stats.suspicion_peak = maxf(_stats.suspicion_peak, _tail.peak)
	if _tail.outcome == "spotted":
		_fail(m, MissionFailure.Reason.SPOTTED, events)
	elif _tail.outcome == "lost":
		_fail(m, MissionFailure.Reason.TARGET_ESCAPED, events)
	elif _tail_travelled >= length:
		if gap <= o.far:
			_complete_objective(m, o, events, -1)
		else:
			_fail(m, MissionFailure.Reason.TARGET_ESCAPED, events)
	return events


# --- Choices, extras and what the HUD asks -----------------------------------------------------

## The options of the choice being asked, or [].
func pending_choice() -> Array[Dictionary]:
	var o := objective()
	if _choosing and o != null:
		return o.options
	return [] as Array[Dictionary]


## The player chose option `id`: its money is paid, its flag saved, and the stage goes on (to the
## option's `next` objective if it names one). Returns the events.
func choose(id: String) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var m := mission()
	var o := objective()
	if not _choosing or m == null or o == null:
		return events
	for opt in o.options:
		if str(opt.get("id", "")) != id:
			continue
		_choosing = false
		_money += maxi(0, floori(float(opt.get("reward", 0))))
		if str(opt.get("flag", "")) != "":
			_flags[str(opt["flag"])] = true
		events.append({"type": "chosen", "option": opt})
		var jump := objective_index_of(str(opt.get("next", "")))
		_complete_objective(m, o, events, jump)
		_emit(events)
		return events
	return events


func has_flag(flag: String) -> bool:
	return _flags.has(flag)


func medal_of(id: String) -> String:
	return str(_medals.get(id, ""))


## What is saved besides `progress()` (G-142): medals, choices made, extras finished.
func extras_state() -> Dictionary:
	return {"medals": _medals.duplicate(), "flags": _flags.duplicate(), "extrasDone": _extras_done.duplicate()}


func extras() -> Array[MissionData.Mission]:
	return _extras


## Stages that can be played again, in order: the finished ones, then the extras (always open).
func replayable() -> Array[MissionData.Mission]:
	var out: Array[MissionData.Mission] = []
	for m in _missions:
		if _completed.has(m.id):
			out.append(m)
	for m in _extras:
		out.append(m)
	return out


## Play a finished stage again, or an extra, from its first objective; the story's own stage
## waits. Returns false for one that is not open.
func play(id: String) -> bool:
	for m in replayable():
		if m.id == id:
			_override = m
			_objective_index = 0
			_reset_attempt()
			_arm_timer()
			return true
	return false


## Give up an extra or replay and go back to the story's stage.
func leave_replay() -> void:
	_override = null
	_objective_index = 0
	_reset_attempt()
	_arm_timer()


func is_replay() -> bool:
	return _override != null


func stats() -> MissionStats:
	return _stats


## The checkpoint to restart from: {index, label}; index 0 is the stage's start.
func checkpoint_index() -> int:
	return _checkpoint


func stability() -> Stability:
	return _stability


func tail() -> TailWatch:
	return _tail


## Where the target of a tail is ({x, z, heading}), or null.
func tail_target() -> Variant:
	var o := objective()
	if o == null or o.type != "tail":
		return null
	return Chase.point_along(o.path, minf(_tail_travelled, Chase.path_length(o.path)))


func hazard_effect() -> Dictionary:
	return _hazard


## The zones of the current objective and how long it has run (for the minimap overlay).
func hazards() -> Array[HazardZone]:
	var o := objective()
	return o.hazards if o != null else ([] as Array[HazardZone])


func objective_clock() -> float:
	return _object_clock


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
			"checkpoint":
				checkpoint_reached.emit(int(e["index"]))
			"choice":
				choice_asked.emit(e["options"])


## Start the current stage again from its first objective (after a knock-out).
func restart_stage() -> void:
	_objective_index = 0
	_reset_attempt()
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
	_medals.clear()
	_flags.clear()
	_extras_done.clear()
	_override = null
	_reset_attempt()
	_money = 0
	_mission_index = 0
	_objective_index = 0
	_arm_timer()
