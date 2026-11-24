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
	runner = MissionRunner.new(content.missions, store.progress())
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
		notice.emit("Stage %d: %s" % [m.stage, m.title], m.brief, 5.0)
	else:
		notice.emit("Free roam", "Every stage is complete. The city is yours.", 4.0)


## One fixed step. `impact`: a crash of the player's vehicle this step (> 0), for job bumps.
func step(dt: float, p: MissionData.PlayerStatus, impact: float = 0.0) -> void:
	_clock += dt
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
	var o := runner.objective()
	if o != _last_objective:
		_last_objective = o


func _flush_later() -> void:
	while not _later.is_empty() and float(_later[0]["at"]) <= _clock:
		var n: Dictionary = _later.pop_front()
		notice.emit(n["title"], n["detail"], n["seconds"])


func _notice_later(delay: float, title: String, detail: String, seconds: float) -> void:
	_later.append({"at": _clock + delay, "title": title, "detail": detail, "seconds": seconds})


func _on_stage(events: Array[Dictionary]) -> void:
	for e in events:
		match str(e["type"]):
			"objective":
				cue.emit(&"chime")
			"completed":
				var m: MissionData.Mission = e["mission"]
				cue.emit(&"fanfare")
				var rep := ""
				if m.reputation > 0:
					var gained := jobs.gain_reputation(m.reputation)
					rep = " · reputation +%d" % gained if gained > 0 else ""
				# Weapons a stage hands over wait for the combat runtime (phase 5).
				notice.emit("Stage %d complete" % m.stage, "%s · +₹%s%s" % [m.title, rupees(m.reward), rep], 4.0)
				save()
				var next := runner.mission()
				if next != null:
					_notice_later(NEXT_BRIEF_DELAY, "Stage %d: %s" % [next.stage, next.title], next.brief, 5.0)
			"failed":
				var fm: MissionData.Mission = e["mission"]
				cue.emit(&"fail")
				notice.emit(str(e["reason"]), "%s starts again" % fm.title, 3.5)
			"allDone":
				_notice_later(NEXT_BRIEF_DELAY, "All stages complete", "Free roam: the city is yours.", 6.0)


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
		"reach", "defeat", "activity":
			return {"x": o.x, "z": o.z, "radius": o.radius}
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
	return _panel("Stage %d · %s" % [m.stage, m.title], "%s · %s" % [o.label, note] if note != "" else o.label, distance, runner.seconds_left())


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
