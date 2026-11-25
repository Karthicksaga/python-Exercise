class_name MissionsLayer
extends Node
## The missions in the city (composition glue, G-130): steps the `MissionSession` (stages, city
## jobs, stories, life places) in the fixed step from the player's real state, draws its
## marker (`MissionBeacon`), HUD (`MissionHud`), the people getting in and out (`FareFigures`),
## parks the content's vehicles (`content.parking`) as the player comes near, and saves.
## No rules here: they are in `src/missions/`.
##
## In the game: `add_child(MissionsLayer.for_main(self))` once the player is in the city (see
## `docs/handoff.md`). Tests and tools call `setup(world, rig, driving)` on their own ground.

## Cast to vehicle variants for the content's parked kinds.
const VARIANTS := {"car": &"hatchback", "auto": &"auto", "bike": &"motorbike", "ambulance": &"ambulance", "bus": &"bus"}
## Parked vehicles appear within this distance of the player and are put away beyond the next.
const PARK_NEAR := 320.0
const PARK_FAR := 520.0
## Places you can enter show their label and ring within this many metres.
const PLACE_SHOW := 90.0

var session: MissionSession
var world: CityWorld = null
var rig: PlayerRig = null
var driving: Driving = null
var hud: MissionHud
var beacon: MissionBeacon
var figures: FareFigures
## The fight's part of the player's status (G-418): fills `cleared`, `wanted` and `down` of the
## rules' `PlayerStatus` each step; (PlayerStatus) -> void. Unset: nobody fights.
var combat_status: Callable = Callable()
## Why the job board takes no new job now ("" when it does): () -> String (the police, G-418).
var board_refusal: Callable = Callable()
## False: no parked vehicles are spawned (another system parks them).
var spawn_parking := true
## Only steps and shows while true (play, not the title).
var active := true:
	set(on):
		active = on
		# The map is drawn at once when play (re)starts, then at 10 Hz.
		if on:
			_map_clock = MAP_STEP
## The game is held behind a dialog (job board, a result, a place).
var held := false
## Parked vehicles this layer spawned, by parking id.
var parked: Dictionary[String, Vehicle] = {}
## The marker this frame in world metres {x, z, radius}, or {} (tests read it).
var target: Dictionary = {}

## G-143/G-144: driving feel measured each step for the fragile meters, the horn this step, the
## rain the layer asked of `Weather` (and what it was before), the checkpoint retry pending.
var _prev_speed := 0.0
var _prev_yaw := 0.0
var _have_prev := false
var _decel := 0.0
var _lateral := 0.0
var _horned := false
var _asked_rain := false
var _rain_before := false
var _retry_pending := false
var _board_tab := "jobs"
var _canvas: CanvasLayer
var _impact := 0.0
var _dialog := ""
var _place_id := ""
var _needle_on := false
var _needle_t := 0.0
var _lifts := 0
var _good := 0
var _needle_for := ""
var _watched: Vehicle = null
var _save_path: String
var _since_lookup := 0.0
var _main: Node = null


func _init(save_path: String = SaveStore.DEFAULT_PATH) -> void:
	_save_path = save_path
	name = "MissionsLayer"
	process_mode = Node.PROCESS_MODE_ALWAYS
	# After the player and `Driving` (-10) in each step: their state is this step's.
	process_physics_priority = 10


## The layer for the game's composition root: reads `world`, `rig`, `title` and `driving` (when
## Integration has added one) from `Main`, follows its play/title state and its NEW GAME.
static func for_main(main: Node) -> MissionsLayer:
	var layer := MissionsLayer.new()
	layer._main = main
	# In the game `ParkedVehicles` (PlayWiring, G-110) parks the content's vehicles; this layer finds
	# them through the vehicle group, so it must not spawn a second set.
	layer.spawn_parking = false
	return layer


func _ready() -> void:
	session = MissionSession.open(_save_path)
	if session.content.error != "":
		push_error("missions: %s" % session.content.error)
	_canvas = CanvasLayer.new()
	_canvas.name = "MissionUi"
	_canvas.layer = 3
	add_child(_canvas)
	hud = MissionHud.new()
	_canvas.add_child(hud)
	beacon = MissionBeacon.new()
	figures = FareFigures.new()
	hud.jobs_pressed.connect(open_board)
	hud.inside_pressed.connect(_go_inside)
	hud.map_pressed.connect(open_map)
	hud.row_chosen.connect(_on_row)
	hud.action_chosen.connect(_on_action)
	hud.lift_pressed.connect(_on_lift)
	session.notice.connect(func(title: String, detail: String, seconds: float) -> void: hud.toast(title, detail, seconds))
	session.result.connect(_on_result)
	session.cue.connect(_on_cue)
	session.retry_offered.connect(_on_retry_offered)
	session.choice_asked.connect(_on_choice_asked)
	session.stage_result.connect(_on_stage_result)
	session.event_started.connect(_on_event_started)
	session.event_ended.connect(_on_event_ended)
	session.heat_raised.connect(func(stars: int) -> void: hud.toast("Police heat +%d" % stars, "They may remember this", 3.0))
	session.meter_warning.connect(_on_meter_warning)
	if _main != null:
		_attach_main()


func _attach_main() -> void:
	var w: Variant = _main.get(&"world")
	var r: Variant = _main.get(&"rig")
	setup(w as CityWorld, r as PlayerRig, _main.get(&"driving") as Driving)
	if _main.has_signal(&"state_changed"):
		_main.connect(&"state_changed", func(s: StringName) -> void: set_active(s == &"play"))
	var t: Variant = _main.get(&"title")
	if t is TitleMenu:
		(t as TitleMenu).new_game_requested.connect(new_game)
	set_active(str(_main.get(&"state")) == "play")


## Wire the layer to the city (null: a flat test ground at y 0), the player and `Driving`.
func setup(city: CityWorld, player: PlayerRig, drive: Driving) -> void:
	world = city
	rig = player
	driving = drive
	var holder: Node = world if world != null else get_parent()
	if holder == null:
		holder = self
	if beacon.get_parent() == null:
		holder.add_child.call_deferred(beacon)
		holder.add_child.call_deferred(figures)
	_watch_driving()
	session.announce_stage()


func set_active(on: bool) -> void:
	active = on
	if hud != null:
		hud.visible = on
	if not on:
		hud.hide_dialog()
		_release()


# --- The fixed step -------------------------------------------------------------------------

func _physics_process(dt: float) -> void:
	if not active or held or rig == null:
		return
	_since_lookup += dt
	if driving == null and _since_lookup > 1.0:
		_since_lookup = 0.0
		_find_driving()
	_park_near()
	var st := status()
	_measure_feel(dt, st)
	session.step(dt, st, _impact)
	_apply_hazards(st)
	_follow_rain()
	_impact = 0.0
	_horned = false
	if driving != null and driving.mode() == &"driving" and driving.vehicle != null and driving.vehicle.type.kind == &"ambulance":
		session.by_ambulance = true


## Where the player is and how they travel, in world metres (the rules' `PlayerStatus`).
func status() -> MissionData.PlayerStatus:
	var v := driven()
	var at := WorldOrigin.to_world(v.global_position if v != null else rig.body.global_position)
	var speed := absf(v.forward_speed()) if v != null else Vector2(rig.body.velocity.x, rig.body.velocity.z).length()
	var p := MissionData.PlayerStatus.make(at.x, at.y, String(v.type.kind) if v != null else "foot", speed)
	p.decel = _decel
	p.lateral = _lateral
	p.crash = clampf(_impact, 0.0, 1.0)
	p.horn = _horned
	p.rain = Weather.rain_level()
	if combat_status.is_valid():
		combat_status.call(p)
	return p


## The vehicle the player is driving, or null (on foot, getting in or out).
func driven() -> Vehicle:
	if driving == null or driving.mode() != &"driving":
		return null
	return driving.vehicle


func _find_driving() -> void:
	if _main != null:
		driving = _main.get(&"driving") as Driving
	if driving == null and get_tree() != null:
		var found := get_tree().root.find_children("*", "Driving", true, false)
		if not found.is_empty():
			driving = found[0] as Driving
	_watch_driving()


func _watch_driving() -> void:
	if driving != null and not driving.crashed.is_connected(_on_crash):
		driving.crashed.connect(_on_crash)
	if driving != null and not driving.horn.is_connected(_on_horn):
		driving.horn.connect(_on_horn)


func _on_horn(_v: Vehicle) -> void:
	_horned = true


## Braking and cornering of the driven vehicle this step (m/s^2, positive): what the stability
## meter of a fragile load feels. Zero on foot. Speed breakers and potholes are the objective's
## own patches (data), crossed by position in the rules.
func _measure_feel(dt: float, st: MissionData.PlayerStatus) -> void:
	var v := driven()
	if v == null or dt <= 0.0:
		_decel = 0.0
		_lateral = 0.0
		_have_prev = false
		return
	var speed := v.forward_speed()
	var yaw := v.global_rotation.y
	if _have_prev:
		_decel = maxf(0.0, (_prev_speed - speed) / dt)
		_lateral = absf(speed * wrapf(yaw - _prev_yaw, -PI, PI) / dt)
	_prev_speed = speed
	_prev_yaw = yaw
	_have_prev = true
	st.decel = _decel
	st.lateral = _lateral


## Flood water slows the driven vehicle, deep water stalls it (G-143).
func _apply_hazards(st: MissionData.PlayerStatus) -> void:
	var v := driven()
	if v == null:
		return
	var e := session.hazard_effect(st.x, st.z, Weather.rain_level())
	if not bool(e["inside"]):
		return
	var forward := v.forward_speed()
	if bool(e["stalled"]) or float(e["speed_scale"]) <= 0.0:
		if forward > 0.0:
			v.set_speed(0.0)
	elif forward > 0.0:
		v.set_speed(forward * lerpf(1.0, float(e["speed_scale"]), 0.2))


## A mission that wants rain gets it (and the weather is put back after); events can start it.
func _follow_rain() -> void:
	var m := session.runner.mission() if session.jobs.job() == null else null
	var want := m != null and m.rain > 0.0 and active
	if want and not _asked_rain:
		_asked_rain = true
		_rain_before = Weather.raining
		Weather.set_raining(true, false, false)
	elif not want and _asked_rain and not session.rain_from_event:
		_asked_rain = false
		Weather.set_raining(_rain_before, false, false)


func _on_crash(_v: Vehicle, _outcome: CrashRules.Outcome) -> void:
	_impact = 1.0


## Every vehicle in the city as the rules see them: [{kind, x, z}] in world metres.
func vehicles() -> Array:
	var out: Array = []
	for n in get_tree().get_nodes_in_group(Vehicle.GROUP):
		var v := n as Vehicle
		if v == null:
			continue
		var p := WorldOrigin.to_world(v.global_position)
		out.append({"kind": String(v.type.kind), "x": p.x, "z": p.y})
	return out


# --- Parked vehicles ------------------------------------------------------------------------

func _park_near() -> void:
	if not spawn_parking:
		return
	var at := WorldOrigin.to_world(rig.body.global_position)
	for spot in session.content.parking:
		var id := str(spot["id"])
		var where := Vector2(float(spot["x"]), float(spot["z"]))
		var v: Vehicle = parked.get(id)
		if v == null:
			if where.distance_to(at) > PARK_NEAR or not _ground_ready(where):
				continue
			if not VARIANTS.has(str(spot["kind"])):
				continue
			v = Vehicle.create(VARIANTS[str(spot["kind"])], StringName(id))
			v.add_to_group(WorldOrigin.GROUP)
			_holder().add_child(v)
			v.place(WorldOrigin.to_scene(where, _ground_y()), float(spot["yaw"]))
			parked[id] = v
		elif not v.is_driven() and WorldOrigin.to_world(v.global_position).distance_to(at) > PARK_FAR:
			# Put away out of reach; it comes back where it was left.
			var left := WorldOrigin.to_world(v.global_position)
			spot["x"] = left.x
			spot["z"] = left.y
			spot["yaw"] = v.rotation.y
			parked.erase(id)
			v.queue_free()


func _holder() -> Node:
	return world if world != null else get_parent()


func _ground_ready(where: Vector2) -> bool:
	return world == null or world.world_ready_around(where)


## The street's height in the scene (the city is flat; a test ground is at 0).
func _ground_y() -> float:
	return 0.0


## Put every parked vehicle back on its content spot (NEW GAME).
func repark() -> void:
	var fresh := GameContent.load_file()
	for id in parked:
		var v := parked[id]
		if driving != null and driving.vehicle == v:
			driving.exit()
		v.queue_free()
	parked.clear()
	session.content.parking = fresh.parking


# --- What is drawn each frame ---------------------------------------------------------------

func _process(dt: float) -> void:
	if rig == null or hud == null:
		return
	if _needle_on:
		_needle_t += dt
		hud.show_needle(true, Life.needle_at(_needle_t), Vector2(Life.WORKOUT_ZONE[0], Life.WORKOUT_ZONE[1]))
	_poll_map()
	if not active:
		return
	var st := status()
	var at := Vector2(st.x, st.z)
	target = session.target(at, st.mode, vehicles())
	var distance := -1.0
	var bearing := NAN
	if not target.is_empty():
		var t := Vector2(float(target["x"]), float(target["z"]))
		distance = t.distance_to(at)
		var spot := WorldOrigin.to_scene(t, _ground_y())
		if distance > float(target["radius"]):
			var kind := StringName(str(target.get("kind", MarkerKind.MISSION)))
			beacon.place_at(spot, float(target["radius"]), kind, MarkerKind.colour_of(kind), MarkerKind.label_of(kind), distance)
		else:
			beacon.clear()
		bearing = _bearing(spot)
	else:
		beacon.clear()
	# Places you can go inside: a label and a small ring, only within a short walk (no circles from afar).
	var entrances: Array[Dictionary] = []
	for p in session.content.places:
		var where := Vector2(float(p["x"]), float(p["z"]))
		if where.distance_to(at) <= PLACE_SHOW:
			entrances.append({"position": WorldOrigin.to_scene_xz(where.x, where.y, _ground_y()), "radius": float(p["radius"]), "name": str(p["name"])})
	beacon.set_entrances(entrances)
	hud.set_stats(MissionSession.rupees(session.runner.balance()), session.runner.stages_done(), session.runner.stage_count(), session.jobs.reputation())
	hud.set_mission(session.view(st.mode, distance), bearing)
	var place := session.place_near(at, st.mode)
	hud.set_place_prompt(str(place.get("name", "")) if not held else "")
	figures.watch = (driven().global_position if driven() != null else rig.body.global_position)
	figures.show_scene(dt, session.fare_scene(), session.goods_scene(), driven(), _ground_y(), session.upcoming_fare())
	_update_minimap(dt, at, st)


## Radians clockwise from where the camera looks to `spot` (scene position).
func _bearing(spot: Vector3) -> float:
	var cam := rig.camera if rig != null else null
	if cam == null:
		return NAN
	var fwd := -cam.global_transform.basis.z
	# From the player (as the minimap would), in the direction the camera looks.
	var v := driven()
	var to := spot - (v.global_position if v != null else rig.body.global_position)
	var a := atan2(fwd.x, -fwd.z)
	var b := atan2(to.x, -to.z)
	return wrapf(b - a, -PI, PI)


# --- Dialogs: the job board, results, places ------------------------------------------------

func _hold() -> void:
	held = true
	get_tree().paused = true


func _release() -> void:
	if held:
		held = false
		get_tree().paused = false


func open_board() -> void:
	if not active:
		return
	var refusal := str(board_refusal.call()) if board_refusal.is_valid() else ""
	if refusal != "":
		hud.toast("Job board closed", refusal, 3.0)
		return
	_hold()
	_dialog = "board"
	_show_board()


func _show_board() -> void:
	var actions: Array[Dictionary] = []
	var stages := _board_tab == "stages"
	actions.append({"id": "tab", "label": "JOBS" if stages else "STAGES", "quiet": true})
	if session.jobs.job() != null:
		actions.append({"id": "quit", "label": "QUIT JOB", "quiet": true})
	actions.append({"id": "close", "label": "CLOSE", "quiet": true})
	if stages:
		var rows := session.stage_rows()
		for r in rows:
			r["button"] = "PLAY"
		hud.show_dialog("Stages", "Missions and finished stages, for the medal. A replay pays a quarter.", rows, actions)
	else:
		var rows := session.board_rows(GameLoop.clock.hour)
		for r in rows:
			r["button"] = "TAKE JOB"
		hud.show_dialog("Job board", session.board_message(), rows, actions)


func close_dialog() -> void:
	hud.hide_dialog()
	_needle_on = false
	_dialog = ""
	_release()


func _on_result(title: String, message: String, board: bool) -> void:
	_hold()
	_dialog = "result"
	var actions: Array[Dictionary] = [{"id": "continue", "label": "CONTINUE"}]
	if board:
		actions.append({"id": "board", "label": "JOB BOARD", "quiet": true})
	hud.show_dialog(title, message, [], actions)


## A stage was failed: RETRY at the checkpoint (or the stage's start), or START OVER (G-140).
func _on_retry_offered(reason: String, _reason_id: String, checkpoint: int) -> void:
	_hold()
	_dialog = "retry"
	var actions: Array[Dictionary] = [{"id": "retry", "label": "RETRY"}]
	if checkpoint > 0:
		actions.append({"id": "start_over", "label": "START OVER", "quiet": true})
	var m := session.runner.mission()
	var where := "from the checkpoint" if checkpoint > 0 else "from the start"
	hud.show_dialog(reason, "%s: try again %s." % [m.title if m != null else "The stage", where], [] as Array[Dictionary], actions)


## The retry itself: the player and their vehicle go back to where the checkpoint was reached.
func do_retry() -> void:
	var place := session.checkpoint_place()
	if place.is_empty() or rig == null:
		return
	var at := WorldOrigin.to_scene_xz(float(place["x"]), float(place["z"]), _ground_y() + 0.05)
	var v := driven()
	if v != null:
		v.teleport(Vector3(at.x, v.global_position.y, at.z), v.global_rotation.y)
		v.set_speed(0.0)
	elif str(place["mode"]) == "foot" or driving == null or driving.mode() == &"foot":
		rig.place(at, 0.0)
	_have_prev = false


## A choice: its options as rows; the game waits (G-142).
func _on_choice_asked(title: String, options: Array) -> void:
	_hold()
	_dialog = "choice"
	var rows: Array[Dictionary] = []
	for o: Dictionary in options:
		var meta := PackedStringArray()
		if int(o.get("reward", 0)) > 0:
			meta.append("+₹%s" % MissionSession.rupees(int(o["reward"])))
		if int(o.get("reputation", 0)) > 0:
			meta.append("★ +%d" % int(o["reputation"]))
		if int(o.get("wanted", 0)) > 0:
			meta.append("police heat")
		rows.append({"id": str(o["id"]), "title": str(o["label"]), "detail": str(o.get("detail", "")), "meta": " · ".join(meta), "button": "CHOOSE"})
	hud.show_dialog(title, "Nothing happens until you decide.", rows, [] as Array[Dictionary])


## The medals screen after a stage with goals (G-142).
func _on_stage_result(title: String, medal: String, goals: Array, paid: int, replay: bool) -> void:
	_hold()
	_dialog = "medals"
	var actions: Array[Dictionary] = [{"id": "continue", "label": "CONTINUE"}, {"id": "stages", "label": "STAGES", "quiet": true}]
	hud.show_medals(title, medal, goals, paid, replay, actions)


func _on_row(id: String) -> void:
	match _dialog:
		"board":
			if _board_tab == "stages":
				close_dialog()
				session.play_stage(id)
			else:
				var hour := GameLoop.clock.hour
				close_dialog()
				session.take_job(id, hour)
		"choice":
			close_dialog()
			session.choose(id)
		"place":
			_do_place(id)


func _on_action(id: String) -> void:
	match id:
		"close", "continue":
			close_dialog()
		"board":
			close_dialog()
			_board_tab = "jobs"
			open_board()
		"stages":
			close_dialog()
			_board_tab = "stages"
			open_board()
		"tab":
			_board_tab = "jobs" if _board_tab == "stages" else "stages"
			_show_board()
		"quit":
			close_dialog()
			session.quit_job()
		"retry":
			close_dialog()
			do_retry()
		"start_over":
			close_dialog()
			session.start_over()


func _go_inside() -> void:
	var st := status()
	var place := session.place_near(Vector2(st.x, st.z), st.mode)
	if place.is_empty():
		return
	_place_id = str(place["id"])
	_hold()
	_show_place("")


func _show_place(message: String) -> void:
	_dialog = "place"
	var place := session.content.place(_place_id)
	var rows := session.place_actions(_place_id, GameLoop.clock.hour)
	for r in rows:
		r["title"] = r["label"]
		r["button"] = "GO"
	hud.show_dialog(str(place.get("name", "")), message if message != "" else "%s · %s · ₹%s" % [GameLoop.clock.text(), "health %d" % roundi(session.health), MissionSession.rupees(session.runner.balance())], rows, [{"id": "close", "label": "LEAVE", "quiet": true}])


func _do_place(id: String) -> void:
	if id == "workout" or id == "activity:gym-bet":
		_needle_for = id
		_needle_on = true
		_needle_t = 0.0
		_lifts = 0
		_good = 0
		hud.show_dialog("Workout", "Tap LIFT while the needle is in the green: %d reps." % Life.WORKOUT_REPS, [], [{"id": "close", "label": "STOP", "quiet": true}])
		hud.show_needle(true, 0.0, Vector2(Life.WORKOUT_ZONE[0], Life.WORKOUT_ZONE[1]))
		return
	_apply_place(id, 0)


func _on_lift() -> void:
	if not _needle_on:
		return
	_lifts += 1
	if Life.good_rep(Life.needle_at(_needle_t)):
		_good += 1
	if _lifts >= Life.WORKOUT_REPS:
		_needle_on = false
		_apply_place(_needle_for, _good)


func _apply_place(id: String, good: int) -> void:
	var out := session.do_place(_place_id, id, GameLoop.clock.hour, good)
	var hours := float(out.get("hours", 0.0))
	if hours > 0.0:
		GameLoop.clock.hour = GameLoop.clock.hour + hours
	if bool(out.get("close", false)):
		close_dialog()
		return
	var text := str(out.get("message", ""))
	var lines: Variant = out.get("lines")
	if lines is Array and not (lines as Array).is_empty():
		text = " ".join(PackedStringArray(lines as Array)) + " " + text
	_show_place(text)


## The cues the rules ask for go to the real `Sound` autoload (W10): "chime", "fanfare", "cash",
## "fail" and "click" are its UI tones; a warning meter plays "hurt".
func _on_cue(cue_name: StringName) -> void:
	Sound.cue(String(cue_name))


func _on_meter_warning(meter: String) -> void:
	if meter == "stability":
		hud.toast("Careful", "The load is shaking: smooth and slow", 2.2)
		Sound.cue("hurt")
	else:
		hud.toast("He is noticing you", "Drop back", 2.2)
		Sound.cue("click")


func _on_event_started(e: Dictionary) -> void:
	if str(e["kind"]) == "rain" and not _asked_rain:
		_asked_rain = true
		_rain_before = Weather.raining
		Weather.set_raining(true, false, false)


func _on_event_ended(_e: Dictionary) -> void:
	pass


## The corner minimap (G-281): the streets round the player, the marker with its kind, the places
## in reach and the hazards (flood, procession, strike), refreshed at 10 Hz at most (game time).
const MAP_STEP := 0.1
var _map_clock := 0.0
var _mini_roads: MapRoads = MapRoads.new()
var _map_feed := MapRoadFeed.new()
var full_map: FullMap
var _map_held := false


func _update_minimap(dt: float, at: Vector2, st: MissionData.PlayerStatus) -> void:
	_map_clock += dt
	if _map_clock < MAP_STEP:
		return
	_map_clock = 0.0
	var zones: Array[Dictionary] = []
	for h in session.hazard_zones():
		var z: HazardZone = h["zone"]
		var t := float(h["t"])
		if not z.active(t):
			continue
		var c := z.centre_at(t)
		var depth := z.depth_at(c.x, c.y, t, Weather.rain_level()) / HazardZone.STALL_DEPTH if z.kind == "flood" else 0.0
		zones.append({"x": c.x, "z": c.y, "radius": z.radius_at(t), "kind": z.kind, "depth": depth, "label": z.label})
	var followed := Vector2.INF
	var q: Variant = session.runner.tail_target() if session.jobs.job() == null else null
	if q is Dictionary:
		followed = Vector2(float(q["x"]), float(q["z"]))
	if not _mini_roads.covers(at, Minimap.RANGE):
		_map_feed.world = world
		_mini_roads = _map_feed.nearby(at, Minimap.RANGE + 140.0)
	var yaw := rig.body.global_rotation.y if driven() == null else driven().global_rotation.y
	hud.minimap.set_view(at, yaw, zones, _mini_roads, map_markers(at, Minimap.RANGE), followed)


## The markers the maps draw: the mission's first (kind, label, radius from the session), then
## the places within `reach` metres (everywhere when `reach` is INF), as PLACE markers.
func map_markers(at: Vector2, reach: float) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	if not target.is_empty():
		var kind := StringName(str(target.get("kind", MarkerKind.MISSION)))
		out.append({"x": float(target["x"]), "z": float(target["z"]), "radius": float(target["radius"]), "kind": kind, "label": MarkerKind.label_of(kind), "primary": true})
	for p in session.content.places:
		var where := Vector2(float(p["x"]), float(p["z"]))
		if reach == INF or where.distance_to(at) <= reach:
			out.append({"x": where.x, "z": where.y, "radius": 0.0, "kind": MarkerKind.PLACE, "label": str(p["name"]), "primary": false})
	return out


## The full-screen map (from the pause menu, or by tapping the minimap). Holds the game while open
## unless the game is already paused (the pause menu).
func open_map() -> void:
	if rig == null or hud == null:
		return
	if full_map == null:
		full_map = FullMap.new()
		full_map.credit = "%s, estimated heights and widths" % (world.source.get_attribution() if world != null and world.source != null else "© OpenStreetMap contributors")
		full_map.closed.connect(_on_map_closed)
		add_child(full_map)
	var at := Vector2(status().x, status().z)
	var yaw := rig.body.global_rotation.y if driven() == null else driven().global_rotation.y
	if not get_tree().paused:
		_hold()
		_map_held = true
	_map_feed.world = world
	_map_feed.wide_task(at)
	var near := _mini_roads
	full_map.loading = true
	full_map.open(at, yaw, near, null, map_markers(at, INF))
	full_map.set_zoom(1)


func close_map() -> bool:
	if full_map != null and full_map.is_open():
		full_map.close()
		return true
	return false


func _exit_tree() -> void:
	# A road read on a worker must end before the game does.
	_map_feed.wait()


func _on_map_closed() -> void:
	if _map_held:
		_map_held = false
		_release()


## While the full map is open: take the wide road sets in as soon as the worker has them.
func _poll_map() -> void:
	if full_map == null or not full_map.is_open() or _map_feed.result.is_empty() or not _map_feed.finished():
		return
	_map_feed.wait()
	var got: Dictionary = _map_feed.result
	_map_feed.result = {}
	full_map.loading = false
	full_map.set_roads(got["near"], got["wide"])


## NEW GAME: forget the progress, park everything back and put the player at the start.
func new_game() -> void:
	close_dialog()
	if session.jobs.job() != null:
		session.jobs.reset()
	session.new_game()
	repark()
	var s := session.content.spawn
	if rig != null and not s.is_empty():
		if driving != null and driving.mode() != &"foot":
			driving.cancel_boarding()
		rig.place(WorldOrigin.to_scene_xz(float(s["x"]), float(s["z"]), _ground_y() + 0.05), float(s["yaw"]))
	session.announce_stage()
