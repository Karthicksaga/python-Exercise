## City jobs (port of `missions/src/jobs.ts`): ambulance runs, courier drops, cab fares, bus
## routes and share auto shifts picked from the job board. Finishing pays by time, bumps and
## lateness; failing costs a fine and reputation, never the game. Pure logic, game-time `dt`;
## `hour` is the injected game clock's hour (never the wall clock).
##
## `update()` returns event Dictionaries (TS shapes) and emits `job_event` for each.
class_name JobRunner
extends RefCounted

signal job_event(event: Dictionary)

const START_REPUTATION := 50
const STOPPED := 1.2
const FAIL_REPUTATION := 5
const AVOID_RATE := 0.008
const AVOID_MAX := 0.5
const AVOID_BONUS := 0.1

var _current: JobData.Job = null
var _stop_index := 0
var _running := false
var _elapsed := 0.0
## Seconds a dynamic event added (a detour) or took (G-146); reset with each job.
var _bonus := 0.0
var _dwelt := 0.0
var _bumps := 0
var _late := 0
var _avoid_time := 0.0
var _in_avoid := false
var _shift: ShareShift = null
var _fare_stop: FareStop = null
var _goods_stop: GoodsStop = null
var _riders := 0
var _rep: int
var _done := 0
var _failed := 0
var _best: Dictionary = {}


static func _count(v: Variant, fallback: int) -> int:
	if (v is int or v is float) and not is_nan(float(v)) and not is_inf(float(v)):
		return floori(float(v))
	return fallback


## `saved`: the job record {reputation, done, failed, best} (`cow-jobs-v1`); damaged values fall back.
func _init(saved: Dictionary = {}) -> void:
	var rep: Variant = saved.get("reputation", START_REPUTATION)
	if (rep is int or rep is float) and not is_nan(float(rep)) and not is_inf(float(rep)):
		_rep = clampi(RulesMath.js_round_int(float(rep)), 0, 100)
	else:
		_rep = START_REPUTATION
	_done = maxi(0, _count(saved.get("done", 0), 0))
	_failed = maxi(0, _count(saved.get("failed", 0), 0))
	var best: Variant = saved.get("best", {})
	if best is Dictionary:
		for k: Variant in best:
			_best[str(k)] = best[k]


## Whether a job with these hours ({from, to}, empty: always) is offered at `hour`.
static func open_at(hours: Dictionary, hour: float) -> bool:
	if hours.is_empty():
		return true
	var h := RulesMath.wrap_hour(hour)
	var from: float = hours["from"]
	var to: float = hours["to"]
	return (h >= from and h < to) if from <= to else (h >= from or h < to)


## "16:00–20:30"
static func hours_text(hours: Dictionary) -> String:
	return "%s–%s" % [_hm(hours["from"]), _hm(hours["to"])]


static func _hm(hour: float) -> String:
	var minutes: int = RulesMath.js_round_int(hour * 60.0) % (24 * 60)
	return "%02d:%02d" % [minutes / 60, minutes % 60]


static func inside_zone(zone: JobData.AvoidZone, x: float, z: float) -> bool:
	for p in zone.points:
		var dx: float = float(p["x"]) - x
		var dz: float = float(p["z"]) - z
		if dx * dx + dz * dz <= float(p["radius"]) * float(p["radius"]):
			return true
	return false


## What time inside an avoid zone does to a finished job: {share, stars, note}.
static func avoid_penalty(zone: JobData.AvoidZone, seconds: float) -> Dictionary:
	var over := maxf(0.0, seconds - zone.grace)
	if over <= 0.0:
		return {"share": AVOID_BONUS, "stars": 0, "note": Tr.t("job.avoid_kept", [zone.name, RulesMath.js_round_int(AVOID_BONUS * 100.0)])}
	var share := minf(AVOID_MAX, over * AVOID_RATE)
	return {"share": -share, "stars": 2 if over >= 60.0 else 1, "note": Tr.t("job.avoid_stuck", [zone.name, RulesMath.js_round_int(seconds), RulesMath.js_round_int(share * 100.0)])}


func job() -> JobData.Job:
	return _current


func started() -> bool:
	return _running


func stop() -> JobData.Stop:
	if _current == null or _stop_index >= _current.stops.size():
		return null
	return _current.stops[_stop_index]


func stop_number() -> int:
	return _stop_index


func seconds_left() -> Variant:
	return _current.time_limit + _bonus - _elapsed if _current != null and _running else null


func share() -> ShareShift:
	return _shift


func fare() -> FareStop:
	return _fare_stop


func goods() -> GoodsStop:
	return _goods_stop


func aboard() -> int:
	return _riders + (_fare_stop.change() if _fare_stop != null else 0)


func bumps() -> int:
	return _bumps


func avoid_seconds() -> float:
	return _avoid_time


func reputation() -> int:
	return _rep


func jobs_done() -> int:
	return _done


## Seconds still to wait at the current stop, or null when not waiting.
func dwell_left() -> Variant:
	var s := stop()
	if s == null or s.dwell <= 0.0 or _dwelt <= 0.0:
		return null
	return maxf(0.0, s.dwell - _dwelt)


## Whether the board offers this job: {ok: true} or {ok: false, reason}. `hour` < 0: not checked.
func available(j: JobData.Job, hour: float = -1.0) -> Dictionary:
	if _current != null:
		return {"ok": false, "reason": Tr.t("msn.finish_job_first")}
	if j.min_reputation > _rep:
		return {"ok": false, "reason": Tr.t("job.needs_rep", [j.min_reputation])}
	if not j.hours.is_empty() and hour >= 0.0 and not open_at(j.hours, hour):
		return {"ok": false, "reason": Tr.t("job.offered_only", [hours_text(j.hours)])}
	return {"ok": true}


func accept(j: JobData.Job, hour: float = -1.0) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if not bool(available(j, hour)["ok"]):
		return events
	_current = j
	_stop_index = 0
	_running = false
	_elapsed = 0.0
	_bonus = 0.0
	_dwelt = 0.0
	_bumps = 0
	_late = 0
	_avoid_time = 0.0
	_in_avoid = false
	_riders = 0
	_arm_fare(j)
	# A different crowd each shift, the same for a given save (tests replay it).
	_shift = ShareShift.new(j.share, SeededRandom.new(1 + _done + _failed)) if j.share != null else null
	events.append({"type": "accepted", "job": j})
	return _emit(events)


## Give up the job: it counts as failed.
func quit() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if _current != null:
		events.append(_fail(_current, Tr.t("fail.job_abandoned")))
	return _emit(events)


## The vehicle hit something while on the job.
## A dynamic event gives (or takes, negative) seconds on the clock (a detour allows for itself).
func extend(seconds: float) -> void:
	_bonus += seconds


func elapsed() -> float:
	return _elapsed


func bump() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var j := _current
	if j == null or not _running:
		return events
	_bumps += 1
	events.append({"type": "bump", "job": j, "count": _bumps})
	if j.max_bumps >= 0 and _bumps >= j.max_bumps:
		events.append(_fail(j, Tr.t("fail.too_many_crashes")))
	return _emit(events)


func update(dt: float, x: float, z: float, mode: String, speed: float) -> Array[Dictionary]:
	return _emit(_update(dt, x, z, mode, speed))


func _update(dt: float, x: float, z: float, mode: String, speed: float) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var j := _current
	if j == null:
		return events
	var in_vehicle := mode == j.vehicle
	if not _running:
		if not in_vehicle:
			return events
		var fx := 0.0
		var fz := 0.0
		var has_first := false
		if j.share != null and j.share.points.size() > 0:
			fx = j.share.points[0]["x"]
			fz = j.share.points[0]["z"]
			has_first = true
		elif j.stops.size() > 0:
			fx = j.stops[0].x
			fz = j.stops[0].z
			has_first = true
		if j.start_radius >= 0.0 and has_first and RulesMath.hypot(x - fx, z - fz) > j.start_radius:
			return events
		_running = true
		events.append({"type": "started", "job": j})
	if not (_fare_stop != null and _fare_stop.started()) and not (_goods_stop != null and _goods_stop.started()):
		_elapsed += dt
	if _elapsed >= j.time_limit + _bonus:
		if _shift != null:
			events.append({"type": "completed", "result": _finish_share(j, _shift, false)})
		else:
			events.append(_fail(j, Tr.t("fail.out_of_time")))
		return events
	if _shift != null:
		var shift := _shift
		for e in shift.update(dt, x, z, speed, in_vehicle):
			e["job"] = j
			events.append(e)
		if shift.at_end(x, z, speed, in_vehicle):
			events.append({"type": "completed", "result": _finish_share(j, shift, true)})
		return events
	if j.avoid != null:
		var inside_avoid := inside_zone(j.avoid, x, z)
		if inside_avoid:
			_avoid_time += dt
			if not _in_avoid:
				events.append({"type": "avoid", "job": j, "name": j.avoid.name})
		_in_avoid = inside_avoid
	var s := stop()
	if s == null:
		return events
	var inside := in_vehicle and RulesMath.hypot(x - s.x, z - s.z) <= s.radius and speed < STOPPED
	if _fare_stop != null:
		if not _fare_stop.step(dt, inside, x, z):
			return events
	elif _goods_stop != null:
		if not _goods_stop.step(dt, inside, x, z):
			return events
	else:
		if not inside:
			_dwelt = 0.0
			return events
		_dwelt += dt
		if _dwelt < s.dwell:
			return events
	if s.due >= 0.0 and _elapsed > s.due:
		_late += 1
	_dwelt = 0.0
	_riders = aboard()
	_stop_index += 1
	_arm_fare(j)
	if _stop_index < j.stops.size():
		events.append({"type": "stop", "job": j, "label": j.stops[_stop_index].label, "index": _stop_index})
		return events
	events.append({"type": "completed", "result": _finish(j)})
	return events


func _emit(events: Array[Dictionary]) -> Array[Dictionary]:
	for e in events:
		job_event.emit(e)
	return events


func _arm_fare(j: JobData.Job) -> void:
	var s: JobData.Stop = j.stops[_stop_index] if _stop_index < j.stops.size() else null
	_fare_stop = FareStop.new(s.fare, j.vehicle) if s != null and s.fare != null else null
	_goods_stop = GoodsStop.new(s.goods, j.vehicle) if s != null and s.goods != null else null


func _clear_job() -> void:
	_current = null
	_running = false
	_fare_stop = null
	_goods_stop = null
	_riders = 0


## How a finished run is paid: time left, bumps, lateness, and a bonus per job type.
func _finish(j: JobData.Job) -> Dictionary:
	var time_share := clampf(1.0 - _elapsed / (j.time_limit + _bonus), 0.0, 1.0)
	var notes: Array[String] = []
	var pay := j.payout * (0.7 + 0.3 * time_share)
	notes.append(Tr.t("job.note.time_left", [RulesMath.js_round_int(time_share * 100.0)]))
	if _bumps > 0:
		var share_lost := minf(0.6, _bumps * (0.15 if j.kind == "ambulance" else 0.1))
		pay *= 1.0 - share_lost
		notes.append(Tr.n("job.note.bumps", _bumps, {"pct": RulesMath.js_round_int(share_lost * 100.0)}))
	elif j.kind == "courier":
		pay += j.payout * 0.25
		notes.append(Tr.t("job.note.parcel"))
	elif j.kind == "ambulance":
		pay += j.payout * 0.2
		notes.append(Tr.t("job.note.smooth"))
	if _late > 0:
		var late_share := minf(0.5, _late * 0.12)
		pay *= 1.0 - late_share
		notes.append(Tr.n("job.note.late", _late, {"pct": RulesMath.js_round_int(late_share * 100.0)}))
	var avoid_stars := 0
	if j.avoid != null:
		var penalty := avoid_penalty(j.avoid, _avoid_time)
		pay *= 1.0 + float(penalty["share"])
		avoid_stars = penalty["stars"]
		notes.append(penalty["note"])
	var stars := clampi(5 - _bumps - _late - avoid_stars - (1 if time_share < 0.15 else 0), 1, 5)
	if j.kind == "cab":
		var tip := j.payout * (stars - 3) * 0.08
		pay += tip
		notes.append(Tr.t("job.note.rating", [stars, "+" if tip >= 0.0 else "-", RulesMath.js_round_int(absf(tip))]))
	var earned := maxi(RulesMath.js_round_int(j.payout * 0.25), RulesMath.js_round_int(pay))
	var before := _rep
	_rep = clampi(_rep + stars - 2, 0, 100)
	_done += 1
	_best[j.id] = maxi(int(_best.get(j.id, 0)), earned)
	var result := {"job": j, "pay": earned, "stars": stars, "bumps": _bumps, "seconds": _elapsed, "late": _late, "avoided": _avoid_time, "notes": notes, "reputation": _rep - before}
	_clear_job()
	return result


## How a share auto shift is paid: the fares the passengers paid, nothing more.
func _finish_share(j: JobData.Job, shift: ShareShift, reached_end: bool) -> Dictionary:
	var summary := shift.close()
	var stars := ShareShift.share_stars(summary, _bumps)
	var carried: int = summary["carried"]
	var notes: Array[String] = [
		Tr.t("job.note.reached", [shift.route.to]) if reached_end else Tr.t("job.note.shift_up"),
		Tr.n("job.note.carried", carried, {"fares": int(summary["fares"])}),
	]
	if int(summary["missed"]) > 0:
		notes.append(Tr.t("job.note.missed", [int(summary["missed"])]))
	if int(summary["left"]) > 0:
		notes.append(Tr.t("job.note.left", [int(summary["left"])]))
	if _bumps > 0:
		notes.append(Tr.n("job.note.bumps_only", _bumps))
	var before := _rep
	_rep = clampi(_rep + ShareShift.share_reputation(summary), 0, 100)
	_done += 1
	_best[j.id] = maxi(int(_best.get(j.id, 0)), int(summary["fares"]))
	var result := {"job": j, "pay": summary["fares"], "stars": stars, "bumps": _bumps, "seconds": _elapsed, "late": 0, "avoided": 0.0, "notes": notes, "reputation": _rep - before, "share": summary}
	_clear_job()
	_shift = null
	return result


func _fail(j: JobData.Job, reason: String) -> Dictionary:
	var before := _rep
	_rep = clampi(_rep - FAIL_REPUTATION, 0, 100)
	_failed += 1
	_clear_job()
	_shift = null
	return {"type": "failed", "job": j, "reason": reason, "fine": j.fine, "reputation": _rep - before}


## Reputation gained outside a job (a story stage's reward); never above 100. Returns the gain.
func gain_reputation(points: float) -> int:
	var before := _rep
	_rep = clampi(_rep + maxi(0, RulesMath.js_round_int(points)), 0, 100)
	return _rep - before


## Reputation lost outside a job (hitting a pedestrian); never below 0. Returns the loss.
func lose_reputation(points: float) -> int:
	var before := _rep
	_rep = clampi(_rep - maxi(0, RulesMath.js_round_int(points)), 0, 100)
	return before - _rep


## The saved record {reputation, done, failed, best}.
func record() -> Dictionary:
	return {"reputation": _rep, "done": _done, "failed": _failed, "best": _best.duplicate()}


## Forget everything (new game).
func reset() -> void:
	_clear_job()
	_shift = null
	_rep = START_REPUTATION
	_done = 0
	_failed = 0
	_best.clear()
