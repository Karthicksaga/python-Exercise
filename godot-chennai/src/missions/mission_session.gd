## One game's missions, jobs and life together (the rules half of `Game.ts` + `JobDesk.ts` +
## `PlaceDesk.ts` in the Three.js game): the stage runner, the job runner, the short stories and
## everyday life, sharing one purse and one save file. Pure logic, no nodes (AGENTS.md: the
## `missions` module), stepped with game-time `dt` by the composition root (`MissionsLayer`).
##
## The game tells it where the player is (`MissionData.PlayerStatus`) and which vehicles are
## parked where; it answers with the marker (`target`), the HUD panel (`view`), the job board
## rows, and signals for toasts and result screens. Decision G-130.
class_name MissionSession
extends RefCounted

## A short message in the middle of the screen (`Hud.showToast`).
signal notice(title: String, detail: String, seconds: float)
## A result screen that holds the game until closed (job complete or failed, story ending):
## `board` offers a JOB BOARD button beside CONTINUE.
signal result(title: String, message: String, board: bool)
## Something worth a sound: "chime", "fanfare", "cash", "fail".
signal cue(name: StringName)
## The save file was written.
signal saved()
## G-140: a stage was failed; offers RETRY (from the checkpoint) and START OVER. `checkpoint`: the
## index the retry resumes at (0: the stage's start).
signal retry_offered(reason: String, reason_id: String, checkpoint: int)
## G-142: a choice objective asks; `options` [{id, label, detail, reward, ...}].
signal choice_asked(title: String, options: Array)
## A choice raised the police heat (stars) for the combat runtime to apply.
signal heat_raised(stars: int)
## G-146: a dynamic event started or ended; `event` {kind, text, duration, time}.
signal event_started(event: Dictionary)
signal event_ended(event: Dictionary)
## G-142: a stage or extra was completed: the medals screen. `goals` [{label, met}], `medal`
## ("" for none), `paid` rupees, `replay`.
signal stage_result(title: String, medal: String, goals: Array, paid: int, replay: bool)
## G-143: a meter crossed into the warning band ("stability" or "suspicion").
signal meter_warning(meter: String)

## Seconds between a stage's completion toast and the next stage's brief (TS: 4.2 s timers;
## here in game time so tests replay it).
const NEXT_BRIEF_DELAY := 4.2
## How far a vehicle marker reaches round the vehicle (`Game.target`).
const VEHICLE_RADIUS := 2.6
## Labels of the vehicle kinds on the board and in the HUD (`VEHICLE_TYPES[kind].label`).
const VEHICLE_LABELS := {"car": "Hatchback", "auto": "Auto-rickshaw", "bike": "Motorbike", "ambulance": "Ambulance", "bus": "City bus"}

var content: GameContent
var store: SaveStore
var runner: MissionRunner
var jobs: JobRunner
var stories: StoryRunner
var life: Life
## G-146: the seeded events of the job or stage being played, and the zones they made.
var events: DynamicEvents = null
var _event_zones: Array[Dictionary] = []
var _event_clock := 0.0
var _attempt := 0
## True while a dynamic event is making it rain (the layer puts the weather back afterwards).
var rain_from_event := false
var _warned := {"stability": false, "suspicion": false}
## Notices waiting for their game time: [{at, title, detail, seconds}].
var _later: Array[Dictionary] = []
var _clock := 0.0
var _last_objective: MissionData.Objective = null


## A session over the baked content and a save file (`SaveStore.DEFAULT_PATH` in the game; tests
## pass their own). Reads the save: a missing or damaged file is a new game.
static func open(save_path: String = SaveStore.DEFAULT_PATH, content_path: String = GameContent.DEFAULT_PATH) -> MissionSession:
	var s := MissionSession.new()
	s.content = GameContent.load_file(content_path)
	s.store = SaveStore.new(save_path)
	s.reload()
	return s


## Read the save file again and rebuild every runner from it (what reopening the game does).
func reload() -> void:
	store.read()
	runner = MissionRunner.new(content.missions, store.progress(), content.extras, store.extras())
	var record: Variant = store.section(SaveStore.JOBS, {})
	jobs = JobRunner.new(record if record is Dictionary else {})
	var progress: Variant = store.section(SaveStore.PROGRESS, {})
	var life_saved: Variant = Life.life_from_save(progress)
	life = Life.new(life_saved)
	stories = StoryRunner.new(content.stories, (life.state().get("stories", []) as Array))
	_later.clear()
	_last_objective = null


## Write the stage progress (with the life state), the job record and the hour.
func save(hour: float = -1.0) -> Error:
	store.save_progress(runner.progress())
	store.save_extras(runner.extras_state())
	var progress: Variant = store.section(SaveStore.PROGRESS, {})
	store.set_section(SaveStore.PROGRESS, Life.save_with_life(progress, life.state()))
	store.set_section(SaveStore.JOBS, jobs.record())
	if hour >= 0.0:
		store.set_section(SaveStore.HOUR, hour)
	var error := store.write()
	saved.emit()
	return error


## Forget all progress (NEW GAME): stages, money, reputation, life and stories.
func new_game() -> void:
	runner.reset()
	jobs.reset()
	life.reset()
	stories.reset()
	_later.clear()
	_last_objective = null
	store.data = {}
	save()


## The toast that opens play: the current stage's brief, or free roam.
func announce_stage() -> void:
	var m := runner.mission()
	if m != null:
		notice.emit("Stage %d: %s" % [m.stage, m.title], brief_for(m), 5.0)
	else:
		notice.emit("Free roam", "Every stage is complete. The city is yours.", 4.0)


## One fixed step. `impact`: a crash of the player's vehicle this step (> 0), for job bumps.
func step(dt: float, p: MissionData.PlayerStatus, impact: float = 0.0) -> void:
	_clock += dt
	_step_events(dt, p)
	_flush_later()
	# A story or a city job puts the stage on hold until it is finished or quit (`Game.fixedUpdate`).
	if stories.story() != null:
		_on_story(stories.update(dt, p))
	if jobs.job() != null:
		if impact > 0.0:
			_on_job(jobs.bump())
		_on_job(jobs.update(dt, p.x, p.z, p.mode, p.speed))
	elif stories.story() == null:
		_on_stage(runner.update(dt, p))
		_watch_meters()
	var o := runner.objective()
	if o != _last_objective:
		_last_objective = o


func _flush_later() -> void:
	while not _later.is_empty() and float(_later[0]["at"]) <= _clock:
		var n: Dictionary = _later.pop_front()
		notice.emit(n["title"], n["detail"], n["seconds"])


func _notice_later(delay: float, title: String, detail: String, seconds: float) -> void:
	_later.append({"at": _clock + delay, "title": title, "detail": detail, "seconds": seconds})


func _on_stage(stage_events: Array[Dictionary]) -> void:
	for e in stage_events:
		match str(e["type"]):
			"objective":
				cue.emit(&"chime")
			"checkpoint":
				notice.emit("Checkpoint", "A retry starts here", 2.0)
			"completed":
				_on_completed(e)
			"failed":
				var fm: MissionData.Mission = e["mission"]
				cue.emit(&"fail")
				var cp := int(e.get("checkpoint", 0))
				notice.emit(str(e["reason"]), "%s: back to the checkpoint" % fm.title if cp > 0 else "%s starts again" % fm.title, 3.5)
				retry_offered.emit(str(e["reason"]), str(e.get("reason_id", "")), cp)
			"forwarded":
				cue.emit(&"fail")
				notice.emit(str(e["reason"]), "%s · half pay now" % str(e["label"]) if float(e["scale"]) <= 0.5 else str(e["label"]), 4.0)
			"choice":
				cue.emit(&"chime")
				var asked := runner.objective()
				choice_asked.emit(asked.label if asked != null else "", e["options"])
			"chosen":
				var opt: Dictionary = e["option"]
				cue.emit(&"click")
				var rep := int(opt.get("reputation", 0))
				if rep > 0:
					jobs.gain_reputation(rep)
				var heat := int(opt.get("wanted", 0))
				if heat > 0:
					heat_raised.emit(heat)
				var gain := int(opt.get("reward", 0))
				notice.emit(str(opt.get("label", "")), "+₹%s" % rupees(gain) if gain > 0 else "", 3.0)
				save()
			"allDone":
				_notice_later(NEXT_BRIEF_DELAY, "All stages complete", "Free roam: the city is yours.", 6.0)


func _on_completed(e: Dictionary) -> void:
	var m: MissionData.Mission = e["mission"]
	var medal := str(e.get("medal", ""))
	var replay := bool(e.get("replay", false))
	cue.emit(&"fanfare")
	var rep := ""
	if m.reputation > 0 and not replay:
		var gained := jobs.gain_reputation(m.reputation)
		rep = " · reputation +%d" % gained if gained > 0 else ""
	var paid := int(e.get("paid", m.reward))
	# Weapons a stage hands over wait for the combat runtime (phase 5).
	var head := "Stage %d complete" % m.stage if m.kind == "stage" and not replay else "%s complete" % m.title
	notice.emit(head, "%s · +₹%s%s%s" % [m.title, rupees(paid), rep, " · %s medal" % medal if medal != "" else ""], 4.0)
	if not m.goals.is_empty():
		var rows: Array[Dictionary] = []
		var met: Array = e.get("goals_met", [])
		for g in m.goals:
			rows.append({"label": str(g.get("label", "")), "met": met.has(str(g.get("id", "")))})
		stage_result.emit(m.title, medal, rows, paid, replay)
		if medal == "gold":
			cue.emit(&"fanfare")
	end_events()
	save()
	var next := runner.mission()
	if next != null and not runner.is_replay() and m.kind == "stage" and not replay:
		_notice_later(NEXT_BRIEF_DELAY, "Stage %d: %s" % [next.stage, next.title], brief_for(next), 5.0)


## The mission's brief with the lines its set choice flags add (a later stage reacting).
func brief_for(m: MissionData.Mission) -> String:
	var text := m.brief
	for flag: Variant in m.brief_if:
		if runner.has_flag(str(flag)):
			text += " " + str(m.brief_if[flag])
	return text


## The player chose option `id` of the question being asked.
func choose(id: String) -> void:
	_on_stage(runner.choose(id))


## RETRY: nothing to rebuild (the runner is at the checkpoint); START OVER: from the first objective.
func start_over() -> void:
	runner.restart_stage()
	end_events()


## Where a retry puts the player: {x, z, mode} of the checkpoint, or {} for the stage's start.
func checkpoint_place() -> Dictionary:
	return runner.checkpoint_place()


# --- Dynamic events (G-146) ---------------------------------------------------------------------

func _wants_events(p: MissionData.PlayerStatus) -> bool:
	var j := jobs.job()
	if j != null:
		return jobs.started()
	var m := runner.mission()
	return stories.story() == null and m != null and m.dynamic and runner.objective() != null and p.mode != "foot"


func _step_events(dt: float, p: MissionData.PlayerStatus) -> void:
	if not _wants_events(p):
		if events != null:
			end_events()
		return
	if events == null:
		_attempt += 1
		var j := jobs.job()
		var id: String = j.id if j != null else runner.mission().id
		var fares := (j != null and (j.kind == "cab" or j.kind == "bus" or j.kind == "ambulance")) or (j == null and runner.fare() != null)
		events = DynamicEvents.new("%s#%d" % [id, _attempt], fares)
		_event_clock = 0.0
	_event_clock += dt
	var started := events.step(dt, false)
	if not events.last_ended.is_empty():
		_end_event(events.last_ended)
	if not started.is_empty():
		_begin_event(started, p)
	_event_zones = _event_zones.filter(func(z: Dictionary) -> bool: return float(z["until"]) > _event_clock)


func _begin_event(e: Dictionary, p: MissionData.PlayerStatus) -> void:
	var seconds := float(e.get("time", 0.0))
	if seconds != 0.0:
		if jobs.job() != null:
			jobs.extend(seconds)
		else:
			runner.extend_time(seconds)
	var kind := str(e["kind"])
	if kind == "rain":
		rain_from_event = true
	var tgt := _event_target(p)
	if tgt != Vector2.INF and (kind == "detour" or kind == "procession" or kind == "bandh"):
		var from := Vector2(p.x, p.z)
		var ahead := from + (tgt - from).normalized() * minf(140.0, from.distance_to(tgt) * 0.5)
		var zone := HazardZone.new()
		zone.kind = "strike" if kind == "bandh" else ("procession" if kind == "procession" else "strike")
		zone.label = {"detour": "Road blocked", "procession": "Procession", "bandh": "Bandh"}[kind]
		zone.x = ahead.x
		zone.z = ahead.y
		zone.radius = 40.0 if kind == "bandh" else (30.0 if kind == "procession" else 18.0)
		zone.max_radius = zone.radius
		zone.blocks = kind != "procession"
		zone.inside_scale = 0.4
		zone.start = _event_clock
		_event_zones.append({"zone": zone, "until": _event_clock + float(e["duration"]), "kind": kind})
	cue.emit(&"chime")
	notice.emit({"detour": "Detour", "procession": "Procession", "rain": "Rain", "bandh": "Bandh", "passenger_change": "Change of plan"}.get(kind, "Event"), str(e["text"]), 4.0)
	event_started.emit(e)


func _end_event(e: Dictionary) -> void:
	if str(e["kind"]) == "rain":
		rain_from_event = false
	_event_zones = _event_zones.filter(func(z: Dictionary) -> bool: return str(z["kind"]) != str(e["kind"]))
	event_ended.emit(e)


## Stop the run's events and forget their zones (the job or stage is over).
func end_events() -> void:
	if events != null and not events.active().is_empty():
		event_ended.emit(events.active())
	events = null
	rain_from_event = false
	_event_zones.clear()


func _event_target(p: MissionData.PlayerStatus) -> Vector2:
	var t := job_stop_target() if jobs.job() != null else _objective_target(runner.objective(), Vector2(p.x, p.z), [])
	return Vector2(float(t["x"]), float(t["z"])) if not t.is_empty() else Vector2.INF


## What the hazards do at a point now (the stage's own zones and the events'): the slowest speed
## scale, stalled if any stalls. {inside, speed_scale, stalled, depth}.
func hazard_effect(x: float, z: float, rain: float) -> Dictionary:
	var out: Dictionary = {"inside": false, "speed_scale": 1.0, "stalled": false, "depth": 0.0}
	var all := hazard_zones()
	for h in all:
		var zone: HazardZone = h["zone"]
		var e := zone.effect(x, z, float(h["t"]), rain)
		if bool(e["inside"]):
			out["inside"] = true
			out["speed_scale"] = minf(float(out["speed_scale"]), float(e["speed_scale"]))
			out["stalled"] = bool(out["stalled"]) or bool(e["stalled"])
			out["depth"] = maxf(float(out["depth"]), float(e["depth"]))
	return out


## Every zone to draw or to apply: [{zone: HazardZone, t: its clock}].
func hazard_zones() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if jobs.job() == null and stories.story() == null:
		for z in runner.hazards():
			out.append({"zone": z, "t": runner.objective_clock()})
	for z in _event_zones:
		out.append({"zone": z["zone"], "t": _event_clock})
	return out


func _watch_meters() -> void:
	var o := runner.objective()
	var stab := o != null and o.type == "fragile"
	var low := stab and runner.stability().is_warning()
	if low and not bool(_warned["stability"]):
		meter_warning.emit("stability")
	_warned["stability"] = low
	var tw := runner.tail()
	var high := tw != null and tw.is_warning()
	if high and not bool(_warned["suspicion"]):
		meter_warning.emit("suspicion")
	_warned["suspicion"] = high


# --- Stages tab: replay and extras (G-142) ---------------------------------------------------------

## One row per stage that can be played again or is an extra: {id, title, detail, meta, disabled}.
func stage_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var extras_done: Array = runner.extras_state()["extrasDone"]
	for m in runner.replayable():
		var medal := runner.medal_of(m.id)
		var done := runner.stages_done() > 0 and m.kind == "stage"
		var pay := "up to ₹%s" % rupees(m.reward) if m.kind == "extra" and not extras_done.has(m.id) else "replay pays ₹%s" % rupees(floori(float(m.reward) * MissionRunner.REPLAY_SCALE))
		var meta := "%s · %s%s" % ["Mission" if m.kind == "extra" else "Stage %d" % m.stage, pay, " · %s medal" % medal if medal != "" else ""]
		var disabled := ""
		if jobs.job() != null:
			disabled = "Finish or quit the current job first"
		elif runner.is_replay() and runner.mission().id == m.id:
			disabled = "Playing now"
		rows.append({"id": m.id, "title": m.title, "detail": brief_for(m), "meta": meta, "disabled": disabled, "done": done})
	return rows


## Play a stage again, or an extra, from the Stages tab; false if it is not open.
func play_stage(id: String) -> bool:
	if jobs.job() != null or not runner.play(id):
		return false
	end_events()
	var m := runner.mission()
	notice.emit(m.title, brief_for(m), 5.0)
	return true


func leave_stage() -> void:
	runner.leave_replay()
	end_events()


func _on_job(events: Array[Dictionary]) -> void:
	for e in events:
		var j: JobData.Job = e.get("job") as JobData.Job
		match str(e["type"]):
			"accepted":
				notice.emit(j.title, j.brief, 5.0)
			"started":
				cue.emit(&"chime")
				notice.emit("The clock is running", "%s for the whole job" % clock_text(j.time_limit), 3.0)
			"stop":
				cue.emit(&"chime")
			"bump":
				notice.emit("Bump!", "Careful with the patient" if j.kind == "ambulance" else "That will cost you", 1.4)
			"boarded":
				cue.emit(&"chime")
				notice.emit("Passenger in", "%d/%d aboard" % [int(e.get("aboard", 0)), int(ShareShift.SHARE_AUTO["capacity"])], 2.2)
			"dropped":
				runner.earn(float(e.get("fare", 0)))
				save()
				cue.emit(&"cash")
				notice.emit("Fare +₹%d" % int(e.get("fare", 0)), "%d/%d aboard" % [int(e.get("aboard", 0)), int(ShareShift.SHARE_AUTO["capacity"])], 1.8)
			"missed":
				notice.emit("Missed their stop", "They got off further on and paid nothing", 2.4)
			"left":
				notice.emit("Passed someone waiting", "There was a free seat: that costs reputation", 2.2)
			"avoid":
				notice.emit("%s is jammed" % str(e.get("name", "")), "Cross it, don't drive along it: time on it cuts the pay", 2.5)
			"completed":
				var r: Dictionary = e["result"]
				var rj: JobData.Job = r["job"]
				var is_share: bool = r.has("share")
				# A share auto's fares were paid one by one as people got off.
				if not is_share:
					runner.earn(float(r["pay"]))
				save()
				cue.emit(&"fanfare")
				cue.emit(&"cash")
				var stars: int = r["stars"]
				var notes: Array[String] = []
				for n: Variant in r["notes"]:
					notes.append(str(n))
				var rep: int = r["reputation"]
				result.emit("%s %s" % [rj.title, "shift over" if is_share else "complete"], "+₹%s · %s%s · %d s · reputation %s%d. %s." % [rupees(int(r["pay"])), "★".repeat(stars), "☆".repeat(5 - stars), RulesMath.js_round_int(float(r["seconds"])), "+" if rep >= 0 else "", rep, ". ".join(notes)], true)
			"failed":
				var fine := runner.charge(float(e.get("fine", 0)))
				save()
				cue.emit(&"fail")
				result.emit("Job failed", "%s. %sReputation %d. The city still needs drivers: try again from the board." % [str(e["reason"]), "Fine ₹%s. " % rupees(fine) if fine > 0 else "", int(e["reputation"])], true)


func _on_story(events: Array[Dictionary]) -> void:
	for e in events:
		var s: StoryRunner.Story = e["story"]
		match str(e["type"]):
			"started":
				notice.emit(s.title, s.brief, 5.0)
			"step":
				cue.emit(&"chime")
			"completed":
				var reward: int = e["reward"]
				runner.earn(reward)
				life.finish_story(s.id)
				save()
				cue.emit(&"fanfare")
				result.emit("%s: done" % s.title, "%s%s" % [s.ending, " +₹%s." % rupees(reward) if reward > 0 else ""], false)
			"failed":
				cue.emit(&"fail")
				notice.emit(str(e["reason"]), "%s is over; ask again at the place" % s.title, 3.5)


# --- What the game draws -------------------------------------------------------------------

## The objective being played: a story's step, else the stage's (not a job's).
func objective() -> MissionData.Objective:
	var st := stories.step()
	return st if st != null else runner.objective()


## The marker: {x, z, radius} or {} (`Game.currentTarget`). `vehicles`: the parked and driven
## vehicles as [{kind, x, z}] in world metres; `mode`: how the player travels now.
func target(at: Vector2, mode: String, vehicles: Array) -> Dictionary:
	var j := jobs.job()
	if j == null:
		return _objective_target(objective(), at, vehicles)
	if mode != j.vehicle:
		return _nearest_vehicle(j.vehicle, at, vehicles)
	return job_stop_target()


func _objective_target(o: MissionData.Objective, at: Vector2, vehicles: Array) -> Dictionary:
	if o == null:
		return {}
	match o.type:
		"reach", "defeat", "activity", "fragile", "hazard_zone":
			return {"x": o.x, "z": o.z, "radius": o.radius}
		"tail":
			var t: Variant = runner.tail_target()
			return {"x": float(t["x"]), "z": float(t["z"]), "radius": o.near} if t is Dictionary else {}
		"choice":
			return {}
		"evade":
			# Losing the police has no marker: the stars on the HUD show how it is going.
			return {}
		"chase":
			var q: Variant = runner.quarry()
			if q is Dictionary:
				return {"x": float(q["x"]), "z": float(q["z"]), "radius": o.radius}
			return {}
	return _nearest_vehicle(o.vehicle, at, vehicles)


func _nearest_vehicle(kind: String, at: Vector2, vehicles: Array) -> Dictionary:
	var best: Dictionary = {}
	var best_d := INF
	for v: Dictionary in vehicles:
		if str(v["kind"]) != kind:
			continue
		var d := Vector2(float(v["x"]), float(v["z"])).distance_to(at)
		if d < best_d:
			best_d = d
			best = {"x": float(v["x"]), "z": float(v["z"]), "radius": VEHICLE_RADIUS}
	if best.is_empty():
		# None in the city yet (they appear as the player nears): lead to the nearest parking spot.
		for spot in content.parking:
			if str(spot["kind"]) != kind:
				continue
			var d := Vector2(float(spot["x"]), float(spot["z"])).distance_to(at)
			if d < best_d:
				best_d = d
				best = {"x": float(spot["x"]), "z": float(spot["z"]), "radius": VEHICLE_RADIUS}
	return best


## The job's next stop once the player is in its vehicle (`JobDesk.stopTarget`).
func job_stop_target() -> Dictionary:
	var shift := jobs.share()
	if shift != null:
		if not jobs.started():
			var first: Dictionary = shift.route.points[0]
			return {"x": float(first["x"]), "z": float(first["z"]), "radius": 8.0}
		var next := next_share_stop(shift)
		return {"x": next["x"], "z": next["z"], "radius": next["radius"]}
	var s := jobs.stop()
	return {"x": s.x, "z": s.z, "radius": s.radius} if s != null else {}


## The share auto's next thing to do, whichever comes first along the route: a pick-up, a drop,
## or the end (`nextShareStop`). {kind, x, z, radius}.
static func next_share_stop(shift: ShareShift) -> Dictionary:
	var end := shift.end_point()
	var best := {"kind": "end", "x": float(end["x"]), "z": float(end["z"]), "radius": float(ShareShift.SHARE_AUTO["end_radius"]), "at": INF}
	for p: Dictionary in shift.riding():
		if float(p["drop_at"]) < float(best["at"]):
			var drop: Dictionary = p["drop"]
			best = {"kind": "drop", "x": float(drop["x"]), "z": float(drop["z"]), "radius": float(ShareShift.SHARE_AUTO["drop_radius"]), "at": float(p["drop_at"])}
	if shift.aboard() < int(ShareShift.SHARE_AUTO["capacity"]):
		for p: Dictionary in shift.waiting():
			if float(p["at"]) < float(best["at"]):
				var stop: Dictionary = p["stop"]
				best = {"kind": "pickup", "x": float(stop["x"]), "z": float(stop["z"]), "radius": float(ShareShift.SHARE_AUTO["board_radius"]), "at": float(p["at"])}
	best.erase("at")
	return best


## The HUD's mission panel: {title, objective, distance (-1: none), seconds_left (-1: none)}, or
## {} when there is nothing to do (`Hud.setMission`).
func view(mode: String, distance: float) -> Dictionary:
	var j := jobs.job()
	if j != null:
		return _job_view(j, mode == j.vehicle, distance)
	var st := stories.story()
	if st != null:
		var step_now := stories.step()
		return _panel(st.title, step_now.label if step_now != null else "", distance, stories.seconds_left())
	var m := runner.mission()
	var o := runner.objective()
	if m == null or o == null:
		return {}
	var note := ""
	if runner.fare() != null:
		note = runner.fare().note()
	if note == "" and runner.goods() != null:
		note = runner.goods().note()
	var title := "Stage %d · %s" % [m.stage, m.title] if m.kind == "stage" else "%s · %s" % ["Replay" if runner.is_replay() and runner.stages_done() > 0 and m.kind == "stage" else "Mission", m.title]
	var panel := _panel(title, "%s · %s" % [o.label, note] if note != "" else o.label, distance, runner.seconds_left())
	panel["stability"] = runner.stability().value if o.type == "fragile" else -1.0
	panel["stability_label"] = "Patient" if o.ruin == "patient_lost" else "Cargo"
	panel["suspicion"] = runner.tail().suspicion if runner.tail() != null else -1.0
	panel["hazard"] = bool(runner.hazard_effect()["inside"])
	return panel


static func _panel(title: String, text: String, distance: float, seconds: Variant) -> Dictionary:
	return {"title": title, "objective": text, "distance": distance, "seconds_left": float(seconds) if seconds != null else -1.0}


func _job_view(j: JobData.Job, in_vehicle: bool, distance: float) -> Dictionary:
	var vehicle := str(VEHICLE_LABELS.get(j.vehicle, j.vehicle)).to_lower()
	var bumps := " · %d bump%s" % [jobs.bumps(), "" if jobs.bumps() == 1 else "s"] if jobs.bumps() > 0 else ""
	var shift := jobs.share()
	if shift != null:
		var next := next_share_stop(shift)
		var near := distance >= 0.0 and distance <= float(next["radius"])
		var text := ""
		if not in_vehicle:
			text = "%s the %s" % ["Get back in" if jobs.started() else "Get in", vehicle]
		elif not jobs.started():
			text = "Drive to the start of the route at %s; the clock starts there" % shift.route.from
		elif next["kind"] == "pickup":
			text = "Stop here to let them in" if near else "Someone is waving at the kerb: pull up beside them"
		elif next["kind"] == "drop":
			text = "Stop here: a passenger gets off" if near else "Drop the passenger where they asked"
		else:
			text = "Drive on to %s, the end of the route" % shift.route.to
		return _panel("Job · %s · %d/%d aboard · ₹%d%s" % [j.title, shift.aboard(), int(ShareShift.SHARE_AUTO["capacity"]), shift.fares(), bumps], text, distance, jobs.seconds_left())
	var s := jobs.stop()
	if s == null:
		return {}
	var note := ""
	if jobs.fare() != null:
		note = jobs.fare().note()
	if note == "" and jobs.goods() != null:
		note = jobs.goods().note()
	var dwell: Variant = jobs.dwell_left()
	var text := s.label
	if not in_vehicle:
		text = "%s the %s" % ["Get back in" if jobs.started() else "Get in", vehicle]
	elif note != "":
		text = "%s · %s" % [s.label, note]
	elif dwell != null:
		text = "%s: wait %d s" % [s.label, ceili(float(dwell))]
	elif not jobs.started() and j.start_radius >= 0.0:
		text = "Drive to the start; the clock starts there. %s" % s.label
	var avoided := " · %d s on %s" % [RulesMath.js_round_int(jobs.avoid_seconds()), j.avoid.name] if j.avoid != null and jobs.avoid_seconds() >= 1.0 else ""
	return _panel("Job · %s%s%s" % [j.title, bumps, avoided], text, distance, jobs.seconds_left())


## People getting in or out now, for drawing: {stop: FareStop, aboard, kind, marker: {x, z}}
## or {} (`Game.fareScene`).
func fare_scene() -> Dictionary:
	var j := jobs.job()
	if j != null:
		var s := jobs.stop()
		if jobs.fare() == null or s == null:
			return {}
		return {"stop": jobs.fare(), "aboard": jobs.aboard(), "kind": j.vehicle, "marker": {"x": s.x, "z": s.z}}
	var o := runner.objective()
	if stories.story() != null or runner.fare() == null or o == null or o.type != "reach":
		return {}
	return {"stop": runner.fare(), "aboard": runner.aboard(), "kind": runner.fare().vehicle, "marker": {"x": o.x, "z": o.z}}


## Goods changing hands now: {stop: GoodsStop, kind, cargo: Array[String]} or {}.
func goods_scene() -> Dictionary:
	var j := jobs.job()
	if j != null:
		if jobs.goods() == null:
			return {}
		var list: Array = []
		for st in j.stops:
			list.append(st.goods)
		return {"stop": jobs.goods(), "kind": j.vehicle, "cargo": GoodsStop.cargo_aboard(list, jobs.stop_number(), jobs.goods())}
	var m := runner.mission()
	if stories.story() != null or m == null or runner.goods() == null:
		return {}
	var goods_list: Array = []
	for o in m.objectives:
		goods_list.append(o.goods if o.type == "reach" else null)
	return {"stop": runner.goods(), "kind": runner.goods().vehicle, "cargo": GoodsStop.cargo_aboard(goods_list, runner.objective_number(), runner.goods())}


## Vehicle kinds the player may get into now: everything, but a job or an "enter" objective
## names the one it needs (the marker points there).
func wanted_vehicle() -> String:
	var j := jobs.job()
	if j != null:
		return j.vehicle
	var o := objective()
	return o.vehicle if o != null and o.type == "enter" else ""


# --- The job board ---------------------------------------------------------------------------

## The board's text above the rows.
func board_message() -> String:
	var current := jobs.job()
	if current != null:
		return "On the job: %s. Quitting costs ₹%d and reputation." % [current.title, current.fine]
	return "Everyday work around the city. Failing a job costs a fine and reputation, never the game. Reputation %d." % jobs.reputation()


## One row per job: {id, title, detail, meta, disabled ("" when it can be taken)} (`JobDesk.openBoard`).
func board_rows(hour: float) -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var current := jobs.job()
	var best: Dictionary = jobs.record()["best"]
	for j in content.jobs:
		var check := jobs.available(j, hour)
		var meta := "%s · up to ₹%d · %d min" % [VEHICLE_LABELS.get(j.vehicle, j.vehicle), j.payout, RulesMath.js_round_int(j.time_limit / 60.0)]
		if not j.hours.is_empty():
			meta += " · %s" % JobRunner.hours_text(j.hours)
		if best.has(j.id):
			meta += " · best ₹%d" % int(best[j.id])
		var disabled := ""
		if not bool(check["ok"]):
			disabled = "On this job now" if current != null and current.id == j.id else str(check["reason"])
		rows.append({"id": j.id, "title": j.title, "detail": j.brief, "meta": meta, "disabled": disabled})
	return rows


## Take a job from the board; false if the board refuses it now.
func take_job(id: String, hour: float) -> bool:
	var j := content.job(id)
	if j == null:
		return false
	return not _on_job_returning(jobs.accept(j, hour)).is_empty()


func quit_job() -> void:
	_on_job(jobs.quit())


func _on_job_returning(events: Array[Dictionary]) -> Array[Dictionary]:
	_on_job(events)
	return events


# --- Life places (`PlaceDesk.ts`) -----------------------------------------------------------

## The player's health, 0 to 100. Only places change it until the combat runtime (phase 5).
var health := float(Life.MAX_HEALTH)
## Came to the hospital by ambulance just now (treatment is free).
var by_ambulance := false


## The place whose entrance is within reach of a player on foot at `at`, or {}.
func place_near(at: Vector2, mode: String) -> Dictionary:
	if mode != "foot":
		return {}
	for p in content.places:
		if Vector2(float(p["x"]), float(p["z"])).distance_to(at) <= float(p["radius"]) + 1.0:
			return p
	return {}


## What can be done inside: [{id, label, detail}] (ids "sleep", "clothes", "treat", "queue",
## "workout", "escalator", "snack:<id>", "outfit:<id>", "film:<id>", "popcorn", "story:<id>",
## "activity:<id>"). `hour`: the game clock.
func place_actions(place_id: String, hour: float) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var p := content.place(place_id)
	if p.is_empty():
		return out
	var wanted := stories.wanted(place_id)
	if wanted != null:
		out.append({"id": "activity:%s" % wanted.activity, "label": wanted.label, "detail": "Story"})
	match str(p["kind"]):
		"home":
			out.append({"id": "sleep", "label": "Sleep until %s" % Life.clock_text(Life.SLEEP_UNTIL), "detail": "%s hours · saves the game" % _hours(Life.sleep_hours(hour))})
			out.append({"id": "clothes", "label": "Change clothes", "detail": "Wearing: %s" % life.outfit()["name"]})
		"hospital":
			out.append({"id": "treat", "label": "Treatment", "detail": "Free after the ambulance" if by_ambulance else "₹%d at your health" % Life.treatment_fee(health, false)})
			out.append({"id": "queue", "label": "Free counter", "detail": "%s hours in the queue" % _hours(Life.FREE_QUEUE_HOURS)})
		"gym":
			out.append({"id": "workout", "label": "Workout: %d reps" % Life.WORKOUT_REPS, "detail": "Day pass ₹%d · fitness %d/%d" % [Life.GYM_PASS, life.fitness(), Life.MAX_FITNESS]})
		"mall":
			out.append({"id": "escalator", "label": "Take the escalator up", "detail": "Ten minutes, usually"})
			for snack in Life.SNACKS:
				out.append({"id": "snack:%s" % snack["id"], "label": str(snack["name"]), "detail": "₹%d · +%d health" % [snack["price"], snack["health"]]})
			for o in Life.OUTFITS:
				if int(o["price"]) > 0:
					out.append({"id": "outfit:%s" % o["id"], "label": str(o["name"]), "detail": "Owned" if life.owns(o["id"]) else "₹%d" % o["price"]})
		"cinema":
			var show := Life.next_show(hour)
			for f in Life.FILMS:
				out.append({"id": "film:%s" % f["id"], "label": "%s (%s)" % [f["title"], f["genre"]], "detail": "₹%d · next show %s" % [Life.TICKET_PRICE, Life.clock_text(float(show["start"]))]})
			out.append({"id": "popcorn", "label": "Popcorn", "detail": "₹%d" % Life.POPCORN_PRICE})
	for st in stories.offered_at(place_id):
		if stories.story() == null:
			out.append({"id": "story:%s" % st.id, "label": "Story: %s" % st.title, "detail": "+₹%d · %s" % [st.reward, st.brief]})
	return out


static func _hours(h: float) -> String:
	return ("%.1f" % h).trim_suffix(".0")


## Do one place action. `good`: good reps of a workout (the needle game). Returns the outcome
## {ok, message, cost, hours, lines?}; money is charged here, `hours` is for the game clock.
func do_place(place_id: String, action: String, hour: float, good: int = 0) -> Dictionary:
	var now := Life.now_of(hour, runner.balance(), health)
	var out: Dictionary = {}
	var parts := action.split(":", true, 1)
	var what := parts[1] if parts.size() > 1 else ""
	match parts[0]:
		"sleep":
			out = life.sleep(now)
		"clothes":
			out = life.change_clothes()
		"treat":
			out = life.treat(now, by_ambulance)
			if bool(out["ok"]):
				by_ambulance = false
		"queue":
			out = life.free_queue(now)
		"workout":
			out = life.workout(now, good)
		"escalator":
			out = life.escalator(now)
		"snack":
			out = life.buy_snack(now, what)
		"outfit":
			out = life.buy_outfit(now, what)
		"film":
			out = life.watch(now, what)
		"popcorn":
			out = life.popcorn(now)
		"story":
			_on_story(stories.start(what))
			return {"ok": true, "message": "", "cost": 0, "hours": 0.0, "close": true}
		"activity":
			var st := stories.wanted(place_id)
			if st == null or st.activity != what:
				return {"ok": false, "message": "Not now.", "cost": 0, "hours": 0.0}
			if what == "gym-bet" and good < 4:
				return {"ok": false, "message": "%d good reps: Selva did four. Try again." % good, "cost": 0, "hours": 0.0}
			_on_story(stories.activity(place_id, what))
			return {"ok": true, "message": "", "cost": 0, "hours": 0.0, "close": true}
		_:
			return {"ok": false, "message": "Nothing to do.", "cost": 0, "hours": 0.0}
	if bool(out.get("ok", false)):
		runner.charge(float(out.get("cost", 0)))
		if out.has("health"):
			health = float(out["health"])
		save()
	return out


# --- Small helpers ---------------------------------------------------------------------------

## "1,23,456" (Indian grouping, `toLocaleString("en-IN")`).
static func rupees(n: int) -> String:
	var s := str(absi(n))
	if s.length() > 3:
		var head := s.left(s.length() - 3)
		var out := s.right(3)
		while head.length() > 2:
			out = head.right(2) + "," + out
			head = head.left(head.length() - 2)
		s = head + "," + out
	return ("-" if n < 0 else "") + s


## "4:05"
static func clock_text(seconds: float) -> String:
	var s := maxi(0, ceili(seconds))
	return "%d:%02d" % [s / 60, s % 60]


## "120 m", "1.4 km"
static func distance_text(metres: float) -> String:
	return "%.1f km" % (metres / 1000.0) if metres >= 1000.0 else "%d m" % RulesMath.js_round_int(metres)
