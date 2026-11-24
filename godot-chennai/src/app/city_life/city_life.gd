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

const TRAFFIC_POOL := 26
const WALKER_POOL := 34
## How many different people of the cast walk, stand in crowds or are children in families: the
## variety the phone keeps in memory (about 3.5 MB each).
const WALKER_VARIETY := 14
const CROWD_VARIETY := 10
const CHILD_VARIETY := 4
## Drivers are drawn this close to the camera (closed vehicles) and on open seats (bikes, autos).
const DRIVER_REACH := 45.0
const RIDER_REACH := 95.0
## Radius of the player on foot as an obstacle, metres.
const PLAYER_RADIUS := 0.45
## Vehicles (the player's, parked ones) within this distance are obstacles to the AI.
const VEHICLE_REACH := 80.0

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
var stats: Dictionary = {"sync": 0, "wait": 0, "step": 0, "frames": 0, "sync_total": 0, "wait_total": 0, "step_total": 0, "sync_max": 0}
var _task: int = -1
var _area_task: BackgroundTask = null
var _stations := PackedVector2Array()
var _ready_cells: Dictionary[Vector2i, bool] = {}
var _ready_next: Dictionary[Vector2i, bool] = {}
var _cells_changed := true
var _source: WorldSource
var _prepared := false


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
	population = AiPopulation.new(_source.get_bounds(), TRAFFIC_POOL, WALKER_POOL, AgentPresets.chennai_mix(), 17)
	population.ground_ready = _ground_ready
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
	_prepared = true
	return ""


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
	var t0 := Time.get_ticks_usec()
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
	var t1 := Time.get_ticks_usec()
	var focus := focus_world()
	if _area_task != null and _area_task.is_done():
		var next: AiArea = _area_task.result()
		_area_task = null
		if next != null:
			population.adopt(next, focus)
			heads.use(next.signals)
	between_steps.emit(delta)
	_sync(delta, focus)
	if _cells_changed:
		_ready_cells = _ready_next.duplicate()
		_cells_changed = false
	if world.world_ready_around(focus):
		var obstacles := _obstacles(focus)
		var siren: Variant = _siren()
		var h := hour()
		_task = WorkerThreadPool.add_task(population.step.bind(delta, focus, h, obstacles, siren), false, "city life")
	if _area_task == null and population.needs_area(focus):
		var source := _source
		var stations := _stations
		_area_task = BackgroundTask.start(func() -> AiArea: return AiArea.build(source, focus, stations))
	var t2 := Time.get_ticks_usec()
	stats["wait"] = t1 - t0
	stats["sync"] = t2 - t1
	stats["step"] = population.cost_usec.x + population.cost_usec.y + population.cost_usec.z
	stats["frames"] = int(stats["frames"]) + 1
	stats["wait_total"] = int(stats["wait_total"]) + t1 - t0
	stats["sync_total"] = int(stats["sync_total"]) + t2 - t1
	stats["step_total"] = int(stats["step_total"]) + int(stats["step"])
	stats["sync_max"] = maxi(int(stats["sync_max"]), t2 - t1)


func reset_stats() -> void:
	for k: String in stats:
		stats[k] = 0


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


## Copy the agents to their views (main thread, between steps).
func _sync(dt: float, focus: Vector2) -> void:
	var cam := _camera_point()
	pool.begin_frame()
	var traffic := population.traffic
	var sounds: Array[Dictionary] = []
	for a in traffic.agents:
		var v := views[a.id]
		if taken.has(a.id):
			continue
		if not a.active:
			_show_vehicle(v, false)
			continue
		var at := WorldOrigin.to_scene(a.pos, a.y)
		_show_vehicle(v, true)
		var d := at.distance_to(cam)
		v.set_pose(at, a.heading, a.speed, dt, d)
		var k := traffic.kinds[a.kind]
		if d < (RIDER_REACH if v.open_seat else DRIVER_REACH):
			var who := cast.driver(k.group, a.id)
			var fig := pool.take(-1 - a.id, who) if who != "" else null
			if fig != null:
				var seat := v.driver_transform()
				fig.global_transform = Transform3D(seat.basis, seat.origin - seat.basis.y * fig.seat_height)
				fig.play(&"sit", 0.0, a.variation * 4.0)
				fig.advance(dt, d)
		sounds.append({"id": a.id, "position": at, "speed": a.speed, "kind": sound_kind(k)})
	for a in population.walkers.agents:
		if not a.active:
			continue
		var at := WorldOrigin.to_scene(a.pos, a.y)
		var d := at.distance_to(cam)
		var fig := pool.take(-100000 - a.id, cast.walker(a.id))
		if fig == null:
			continue
		fig.global_transform = Transform3D(Basis(Vector3.UP, a.heading), at)
		if a.speed > 2.6:
			fig.play(&"run", a.speed, a.variation * 3.0)
		elif a.speed > 0.15:
			fig.play(&"walk", a.speed, a.variation * 3.0)
		else:
			fig.play(&"idle", 0.0, a.variation * 3.0)
		fig.advance(dt, d)
	for p in population.people:
		var who := cast.crowd_person(p.look, p.child, p.play)
		if who == "":
			continue
		var fig := pool.take(p.key, who)
		if fig == null:
			continue
		var at := WorldOrigin.to_scene(p.pos, 0.0)
		fig.global_transform = Transform3D(Basis(Vector3.UP, p.yaw), at)
		match p.pose:
			CrowdField.WALK:
				fig.play(&"walk", 1.1, float(p.look) * 0.01)
			CrowdField.TALK:
				fig.play(&"talk", 0.0, float(p.look) * 0.01)
			_:
				# Sitting on the sand has no clip (the cast's `sit` is on a seat): they stand.
				fig.play(&"idle", 0.0, float(p.look) * 0.01)
		fig.advance(dt, at.distance_to(cam))
	pool.end_frame()
	heads.refresh(focus)
	if Sound.active:
		Sound.set_traffic(sounds, dt, hour())


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
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
