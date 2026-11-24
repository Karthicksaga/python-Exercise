class_name CityLife
extends Node3D
## The streets' life in the game (G-120…G-128): AI traffic, walkers and crowds round the player,
## wired from the pure `AiPopulation` to the views (`TrafficVehicleView`, `PersonView` through a
## `PeoplePool`, `SignalHeads`). Holds no AI rules of its own.
##
## - **Threads.** The roads round the player become an `AiArea` on a worker thread
##   (`BackgroundTask`) whenever the player moves REBUILD metres from the last centre; the AI's
##   step runs on the `WorkerThreadPool` while the frame is drawn. Each physics frame the main
##   thread waits for the last step (normally already done), adopts a finished area, copies the
##   agents to their views and starts the next step: it never runs the AI itself (G-127).
## - **Gating (brief §7).** Nothing steps while the chunks round the player are not loaded, and
##   no one is put on a chunk that is not shown (a snapshot of the shown chunks is the AI's
##   `ground_ready`, taken on the main thread between steps).
## - **Loading.** `prepare(start)` (awaited during loading) reads the stations, builds the first
##   area, loads the vehicles' and the people's models on threads and makes every view, so
##   nothing is loaded or built in play.
## Add it under the `CityWorld` (it pauses with the world), set `focus_node`, then `prepare`.

## After the last AI step finished and before the views are synced and the next step starts:
## the only time game code may change agents (hold, let go, scare). `dt` is the physics step.
signal between_steps(dt: float)

const TRAFFIC_POOL := 34
const WALKER_POOL := 34
## How many different people of the cast walk, stand in crowds or are children in families: the
## variety the phone keeps in memory (about 3.5 MB each).
const WALKER_VARIETY := 14
const CROWD_VARIETY := 10
const CHILD_VARIETY := 4
## Drivers are drawn this close to the camera (closed vehicles) and on open seats (bikes, autos).
const DRIVER_REACH := 45.0
const RIDER_REACH := 95.0
## The AI steps every this many physics frames (30 Hz); views move on in between (G-127).
const STEP_EVERY := 2
## Walkers and crowd people further than this from the camera are not drawn (the haze).
const PEOPLE_REACH := 85.0
## At most this many walkers and crowd people are drawn, the nearest (two draw calls each, and
## two more for a near one's shadow: the phone's budget is about 250 in all, G-127).
const FIGURE_CAP := 36
## Radius of the player on foot as an obstacle, metres.
const PLAYER_RADIUS := 0.45
## Vehicles (the player's, parked ones) within this distance are obstacles to the AI.
const VEHICLE_REACH := 80.0

## Live limits (quality presets, G-252; feature switches, G-254). `figure_cap`, the reaches and
## the caps take effect within a step; `traffic_on` false hides every vehicle, walker, driver and
## crowd person and stops the AI; `crowds_on` false leaves the crowds out.
var figure_cap: int = FIGURE_CAP
var driver_reach: float = DRIVER_REACH
var rider_reach: float = RIDER_REACH
var traffic_cap: int = -1
var walker_cap: int = -1
var traffic_on: bool = true:
	set(value):
		if value == traffic_on:
			return
		traffic_on = value
		if _prepared:
			if value:
				heads.visible = true
			else:
				_hide_all()
var crowds_on: bool = true
## Physics frames the main thread lets a running AI step lag before it waits for it (G-256).
## 2 is a step every second frame, waited for when late (as before); more lets a slow phone
## core finish the step while the frame goes on, the views moving on by extrapolation.
var ai_patience: int = 2
## Pool sizes (the most out at the busiest place and hour); set before `prepare`.
var traffic_pool: int = TRAFFIC_POOL
var walker_pool: int = WALKER_POOL
var world: CityWorld
## The player's body (on foot) or whatever the streets centre on.
var focus_node: Node3D
var population: AiPopulation
var cast: CastPicker
var pool: PeoplePool
var heads: SignalHeads
## One view per traffic agent (by id).
var views: Array[TrafficVehicleView] = []
## Agents the game took over (being carjacked): their views are not moved by the AI.
var taken: Dictionary[int, bool] = {}
## The hour of the day for the density curves (the game clock unless a test sets it).
var hour_override: float = -1.0
## Main-thread cost of the last physics frame and the worker's step (µs), for the HUD and the
## frame-time measurement: {"sync", "wait", "step"} and running maxima.
var stats: Dictionary = {"sync": 0, "wait": 0, "step": 0, "frames": 0, "sync_total": 0, "wait_total": 0, "step_total": 0, "sync_max": 0, "steps": 0, "traffic_total": 0, "walkers_total": 0, "crowd_total": 0}
## The AI's own thread (G-127): not the WorkerThreadPool, whose threads the physics engine's
## jobs and the chunk builds need at once (a pool slot held by the AI made Jolt's step wait).
var _thread: Thread = null
var _go := Semaphore.new()
var _done := Semaphore.new()
var _work: Callable = Callable()
var _quit := false
## A step was handed to the thread and is not collected yet.
var _busy := false
var _area_task: BackgroundTask = null
var _stations := PackedVector2Array()
var _ready_cells: Dictionary[Vector2i, bool] = {}
var _ready_next: Dictionary[Vector2i, bool] = {}
var _cells_changed := true
var _source: WorldSource
var _prepared := false
var _frame: int = 0
var _step_frame: int = 0
## Game seconds since the last finished step (views move on by this much) and the step's dt.
var _since: float = 0.0
var _step_dt: float = 0.0
var _vehicle_state: Array = [PackedVector4Array(), PackedFloat32Array()]
var _walker_state: Array = [PackedVector4Array(), PackedFloat32Array()]
var _people: Array[CrowdField.Person] = []
## Walkers and crowd people further than this are not drawn this step (FIGURE_CAP).
var _people_reach: float = PEOPLE_REACH
var _sync_start: int = 0
## Main-thread sync totals (µs): vehicles and drivers, walkers, crowd, the rest (signals, sound).
var _parts: Vector4i = Vector4i.ZERO


static func make(city: CityWorld, focus: Node3D) -> CityLife:
	var life := CityLife.new()
	life.name = "CityLife"
	life.world = city
	life.focus_node = focus
	return life


func _ready() -> void:
	world.streamer.chunk_shown.connect(func(cell: Vector2i) -> void:
		_ready_next[cell] = true
		_cells_changed = true)
	world.streamer.chunk_hidden.connect(func(cell: Vector2i) -> void:
		_ready_next.erase(cell)
		_cells_changed = true)
	for cell in world.streamer.shown_cells():
		_ready_next[cell] = true
	WorldOrigin.shifted.connect(func(_o: Vector3) -> void:
		if heads != null:
			heads.use(heads.signals))


func hour() -> float:
	return hour_override if hour_override >= 0.0 else GameLoop.clock.hour


func focus_world() -> Vector2:
	if focus_node != null and focus_node.is_inside_tree():
		return WorldOrigin.to_world(focus_node.global_position)
	return world.focus


## Loading work: the first area round `start`, the models and every view. "" or the error.
func prepare(start: Vector2) -> String:
	_source = world.source
	_stations = await BackgroundTask.start(AiArea.read_stations.bind(AiArea.RAIL)).finish(get_tree())
	var source := _source
	var stations := _stations
	var area: AiArea = await BackgroundTask.start(func() -> AiArea: return AiArea.build(source, start, stations)).finish(get_tree())
	if area == null:
		return "The streets' traffic could not be worked out."
	var people := PeopleManifest.open(PeoplePool.MANIFEST)
	var entries: Array[Dictionary] = []
	entries.assign(people.entries)
	cast = CastPicker.create(entries)
	cast.limit(WALKER_VARIETY, CROWD_VARIETY, CHILD_VARIETY)
	pool = PeoplePool.new()
	add_child(pool)
	var error := await pool.prepare(cast.used_ids())
	if error != "":
		return error
	population = AiPopulation.new(_source.get_bounds(), traffic_pool, walker_pool, AgentPresets.chennai_mix(), 17)
	population.ground_ready = _ground_ready
	# Closer spawn rings than the Three.js defaults: the phone's haze hides little beyond 170 m,
	# and a pool spread thinner than that leaves the street in front of the player empty.
	var ts := population.traffic_settings
	ts.spawn_min = 50.0
	ts.spawn_max = 170.0
	ts.despawn = 220.0
	ts.retire_beyond = 60.0
	var ws := population.walker_settings
	ws.spawn_min = 18.0
	ws.spawn_max = 85.0
	ws.despawn = 110.0
	ws.retire_beyond = 70.0
	error = await _load_vehicle_models()
	if error != "":
		return error
	# Footprints from the models (the AI keeps gaps by them).
	for k in population.traffic_settings.kinds:
		var t := VehicleCatalog.variant(k.name).type
		k.half_width = t.spec.half_extents.x
		k.half_length = t.spec.half_extents.z
	_ready_cells = _ready_next.duplicate()
	population.adopt(area, start)
	for a in population.traffic.agents:
		var v := TrafficVehicleView.make(population.traffic.kinds[a.kind].name, a.variation)
		v.agent_id = a.id
		v.visible = false
		add_child(v)
		views.append(v)
		# A frame between views keeps the loading screen alive (each is a model instance).
		if a.id % 6 == 5:
			await get_tree().process_frame
	pool.warm(cast.walkers, 2)
	heads = SignalHeads.new()
	add_child(heads)
	heads.use(area.signals)
	_thread = Thread.new()
	_thread.start(_run_steps, Thread.PRIORITY_LOW)
	_prepared = true
	return ""


## The AI thread: one step per `_go`, then `_done`.
func _run_steps() -> void:
	while true:
		_go.wait()
		if _quit:
			return
		_work.call()
		_done.post()


func _load_vehicle_models() -> String:
	var files: PackedStringArray = []
	for k in population.traffic_settings.kinds:
		var m := VehicleCatalog.manifest_for(VehicleCatalog.variant(k.name).type)
		if m == null:
			continue
		for lod: Dictionary in m.lods():
			var f := String(lod["file"])
			if not files.has(f) and ResourceLoader.exists(f):
				files.append(f)
	for f in files:
		if ResourceLoader.load_threaded_request(f) != OK:
			return "Could not start loading %s." % f
	for f in files:
		while ResourceLoader.load_threaded_get_status(f) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			await get_tree().process_frame
		if ResourceLoader.load_threaded_get(f) == null:
			return "Could not load %s." % f
	return ""


## Worker-thread side of the gate: only the snapshot taken between steps is read.
func _ground_ready(p: Vector2) -> bool:
	return _ready_cells.has(_source.cell_at(p))


func _physics_process(delta: float) -> void:
	if not _prepared:
		return
	if not traffic_on:
		return
	var t0 := Time.get_ticks_usec()
	_frame += 1
	_since += delta
	var stepping := not _busy or _frame % STEP_EVERY == 0
	var focus := focus_world()
	if stepping and _busy:
		if _done.try_wait():
			_busy = false
		elif _frame - _step_frame < ai_patience:
			stepping = false
			stats["late"] = int(stats.get("late", 0)) + 1
		else:
			_done.wait()
			_busy = false
	var t1 := Time.get_ticks_usec()
	if stepping:
		if _area_task != null and _area_task.is_done():
			var next: AiArea = _area_task.result()
			_area_task = null
			if next != null:
				population.adopt(next, focus)
				heads.use(next.signals)
		between_steps.emit(_since)
		_snapshot()
	_sync(delta, focus)
	if stepping:
		if _cells_changed:
			_ready_cells = _ready_next.duplicate()
			_cells_changed = false
		if world.world_ready_around(focus):
			var obstacles := _obstacles(focus)
			var siren: Variant = _siren()
			var h := hour()
			_step_dt = _since if _since > 0.0 else delta
			population.traffic_cap = traffic_cap
			population.walker_cap = walker_cap
			population.crowds_on = crowds_on
			_work = population.step.bind(_step_dt, focus, h, obstacles, siren)
			_step_frame = _frame
			_busy = true
			_go.post()
		_since = 0.0
		if _area_task == null and population.needs_area(focus):
			var source := _source
			var stations := _stations
			_area_task = BackgroundTask.start(func() -> AiArea: return AiArea.build(source, focus, stations))
	var t2 := Time.get_ticks_usec()
	stats["wait"] = t1 - t0
	stats["sync"] = t2 - t1
	stats["frames"] = int(stats["frames"]) + 1
	stats["wait_total"] = int(stats["wait_total"]) + t1 - t0
	stats["sync_total"] = int(stats["sync_total"]) + t2 - t1
	stats["sync_max"] = maxi(int(stats["sync_max"]), t2 - t1)
	if stepping:
		stats["step"] = population.cost_usec.x + population.cost_usec.y + population.cost_usec.z
		stats["steps"] = int(stats["steps"]) + 1
		stats["step_total"] = int(stats["step_total"]) + int(stats["step"])
		stats["traffic_total"] = int(stats["traffic_total"]) + population.cost_usec.x
		stats["walkers_total"] = int(stats["walkers_total"]) + population.cost_usec.y
		stats["crowd_total"] = int(stats["crowd_total"]) + population.cost_usec.z


## Copy what the views need of the finished step (the worker writes the agents during the next).
func _snapshot() -> void:
	_vehicle_state = _state_of(population.traffic)
	_walker_state = _state_of(population.walkers)
	_people = population.people
	var cam := WorldOrigin.to_world(_camera_point())
	var d := PackedFloat32Array()
	var ws: PackedVector4Array = _walker_state[0]
	for st in ws:
		if st.w >= 0.0:
			d.append(Vector2(st.x, st.y).distance_to(cam))
	for p in _people:
		d.append(p.pos.distance_to(cam))
	_people_reach = PEOPLE_REACH
	if d.size() > figure_cap:
		d.sort()
		_people_reach = minf(PEOPLE_REACH, d[figure_cap - 1] + 0.01) if figure_cap > 0 else -1.0


## Per agent: (x, z, heading, speed), with w = -1 for an agent put away; y in a second array.
static func _state_of(s: AgentSystem) -> Array:
	var xz := PackedVector4Array()
	var ys := PackedFloat32Array()
	xz.resize(s.agents.size())
	ys.resize(s.agents.size())
	for a in s.agents:
		xz[a.id] = Vector4(a.pos.x, a.pos.y, a.heading, a.speed if a.active else -1.0)
		ys[a.id] = a.y
	return [xz, ys]


func reset_stats() -> void:
	for k: String in stats:
		stats[k] = 0
	_parts = Vector4i.ZERO


## Main-thread sync per frame by part (µs): vehicles and drivers, walkers, crowd, the rest.
func sync_parts() -> Vector4i:
	return _parts / maxi(1, int(stats["frames"]))


## The player (and the vehicle they drive, and any vehicle near) as obstacles, world metres.
func _obstacles(focus: Vector2) -> PackedVector3Array:
	var out := PackedVector3Array()
	if focus_node != null and focus_node.is_visible_in_tree():
		out.append(Vector3(focus.x, focus.y, PLAYER_RADIUS))
	for node in get_tree().get_nodes_in_group(Vehicle.GROUP):
		var v := node as Vehicle
		if v == null or not v.is_inside_tree():
			continue
		var at := WorldOrigin.to_world(v.global_position)
		if at.distance_to(focus) > VEHICLE_REACH:
			continue
		var h := v.type.spec.half_extents
		var fwd3 := -v.global_basis.z
		var fwd := Vector2(fwd3.x, fwd3.z).normalized()
		var r := maxf(h.x, 0.4) + 0.15
		var pieces := maxi(1, ceili(h.z / r))
		for i in pieces:
			var t := 0.0 if pieces == 1 else lerpf(-1.0, 1.0, float(i) / (pieces - 1))
			var p := at + fwd * (h.z - r) * t
			out.append(Vector3(p.x, p.y, r))
	return out


## The siren of a driven emergency vehicle, as (x, z, heading), or null.
func _siren() -> Variant:
	for node in get_tree().get_nodes_in_group(Vehicle.GROUP):
		var v := node as Vehicle
		if v != null and v.is_driven() and v.siren():
			var at := WorldOrigin.to_world(v.global_position)
			var f := -v.global_basis.z
			return Vector3(at.x, at.y, atan2(-f.x, -f.z))
	return null


func _camera_point() -> Vector3:
	var cam := get_viewport().get_camera_3d()
	return cam.global_position if cam != null else Vector3.ZERO


## Copy the last step's agents to their views (main thread). Between steps (the AI steps every
## STEP_EVERY physics frames) everyone moves on along their heading at their speed for the time
## since the step, so motion stays smooth at 60 Hz.
func _sync(dt: float, focus: Vector2) -> void:
	_sync_start = Time.get_ticks_usec()
	var cam := _camera_point()
	var camera := get_viewport().get_camera_3d()
	var ahead := _since
	pool.begin_frame()
	var traffic := population.traffic
	var sounds: Array[Dictionary] = []
	var vs: PackedVector4Array = _vehicle_state[0]
	var vy: PackedFloat32Array = _vehicle_state[1]
	for i in mini(vs.size(), views.size()):
		var v := views[i]
		if taken.has(i):
			continue
		var st := vs[i]
		if st.w < 0.0:
			_show_vehicle(v, false)
			continue
		var pos := Vector2(st.x, st.y) + Vector2(-sin(st.z), -cos(st.z)) * st.w * ahead
		var at := WorldOrigin.to_scene(pos, vy[i])
		_show_vehicle(v, true)
		var d := at.distance_to(cam)
		v.set_pose(at, st.z, st.w, dt, d)
		var k := traffic.kinds[traffic.agents[i].kind]
		if d < (rider_reach if v.open_seat else driver_reach):
			var who := cast.driver(k.group, i)
			var fig := pool.take(-1 - i, who) if who != "" else null
			if fig != null:
				var seat := v.driver_transform()
				fig.global_transform = Transform3D(seat.basis, seat.origin - seat.basis.y * fig.seat_height)
				fig.play(&"sit", 0.0, traffic.agents[i].variation * 4.0)
				fig.advance(dt, d, camera == null or camera.is_position_in_frustum(seat.origin))
		sounds.append({"id": i, "position": at, "speed": st.w, "kind": sound_kind(k)})
	var tv := Time.get_ticks_usec()
	var ws: PackedVector4Array = _walker_state[0]
	var wy: PackedFloat32Array = _walker_state[1]
	for i in ws.size():
		var st := ws[i]
		if st.w < 0.0:
			continue
		var pos := Vector2(st.x, st.y) + Vector2(-sin(st.z), -cos(st.z)) * st.w * ahead
		var at := WorldOrigin.to_scene(pos, wy[i])
		var d := at.distance_to(cam)
		if d > _people_reach:
			continue
		var fig := pool.take(-100000 - i, cast.walker(i))
		if fig == null:
			continue
		var variation := population.walkers.agents[i].variation
		fig.global_transform = Transform3D(Basis(Vector3.UP, st.z), at)
		if st.w > 2.6:
			fig.play(&"run", st.w, variation * 3.0)
		elif st.w > 0.15:
			fig.play(&"walk", st.w, variation * 3.0)
		else:
			fig.play(&"idle", 0.0, variation * 3.0)
		fig.advance(dt, d, camera == null or camera.is_position_in_frustum(at + Vector3(0, 1.0, 0)))
	var tw := Time.get_ticks_usec()
	for p in _people:
		var who := cast.crowd_person(p.look, p.child, p.play)
		if who == "":
			continue
		var pos := p.pos
		if p.pose == CrowdField.WALK:
			pos += Vector2(-sin(p.yaw), -cos(p.yaw)) * p.speed * ahead
		var at := WorldOrigin.to_scene(pos, 0.0)
		var d := at.distance_to(cam)
		if d > _people_reach:
			continue
		var fig := pool.take(p.key, who)
		if fig == null:
			continue
		fig.global_transform = Transform3D(Basis(Vector3.UP, p.yaw), at)
		match p.pose:
			CrowdField.WALK:
				fig.play(&"walk", p.speed, float(p.look) * 0.01)
			CrowdField.TALK:
				fig.play(&"talk", 0.0, float(p.look) * 0.01)
			_:
				# Sitting on the sand has no clip (the cast's `sit` is on a seat): they stand.
				fig.play(&"idle", 0.0, float(p.look) * 0.01)
		fig.advance(dt, d, camera == null or camera.is_position_in_frustum(at + Vector3(0, 1.0, 0)))
	var tc := Time.get_ticks_usec()
	pool.end_frame()
	heads.refresh(focus)
	if Sound.active:
		Sound.set_traffic(sounds, dt, hour())
	_parts += Vector4i(tv - _sync_start, tw - tv, tc - tw, Time.get_ticks_usec() - tc)


## Everyone out of sight at once (traffic switched off); the AI's step is collected first.
func _hide_all() -> void:
	if _busy:
		_done.wait()
		_busy = false
	for v in views:
		if not taken.has(v.agent_id):
			_show_vehicle(v, false)
	pool.begin_frame()
	pool.end_frame()
	heads.visible = false
	if Sound.active:
		Sound.set_traffic([] as Array[Dictionary], 0.0, hour())


## Settings changed: re-read the place so new caps apply at the next step.
func refresh_caps() -> void:
	if population != null:
		population.traffic_cap = traffic_cap
		population.walker_cap = walker_cap
		population.crowds_on = crowds_on
		population.refresh_levels()


func _show_vehicle(v: TrafficVehicleView, on: bool) -> void:
	if v.visible == on:
		return
	v.visible = on
	(v.get_child(0) as CollisionShape3D).disabled = not on


## The engine sound of a look (`SoundProfiles.sound_kind` names).
static func sound_kind(k: AgentPresets.Kind) -> String:
	match k.group:
		&"bike":
			return "motorbike"
		&"auto":
			return "auto_rickshaw"
		&"bus":
			return "bus"
	if k.name in [&"saloon", &"suv", &"coupe"]:
		return String(k.name)
	return "hatchback"


## Counts for the HUD, tests and the frame-time log.
func counts() -> Dictionary:
	if population == null or population.traffic == null:
		return {}
	return {"vehicles": population.traffic.active_count(), "walkers": population.walkers.active_count(), "crowd": population.people.size(), "figures": pool.shown(), "made": pool.made, "place": population.levels.get("place", &"")}


func _exit_tree() -> void:
	if _thread != null:
		if _busy:
			_done.wait()
			_busy = false
		_quit = true
		_go.post()
		_thread.wait_to_finish()
		_thread = null
