class_name ParkedVehicles
extends Node
## Parked vehicles in the streamed city (decision G-110): one per `ParkingSpots` spot, spawned
## only on loaded ground and freed with the chunk ring, like the Three.js game's parked cars.
##
## - A spot resolves to its kerb on a worker thread once the focus is within `resolve_reach`.
## - Its vehicle is built on a worker thread (`Vehicle.create`, one at a time: the model's paint
##   cache is shared) once the spot is within `spawn_reach`, and joins the scene only when
##   `CityWorld.world_ready_around(spot)` (its chunks and colliders are in) and nothing stands on
##   the spot. The GLBs were loaded during loading (`prepare`), so nothing decodes in play.
## - A vehicle is freed when it is further than `free_reach` from the focus (before its chunk,
##   which goes at the streamer's unload distance) or when its chunk is hidden, unless the player
##   is driving or boarding it. Its spot fills again when in reach, unless the vehicle still
##   stands somewhere else (the player drove it away and left it).
## - Vehicles join `WorldOrigin.GROUP`; spots are world metres and convert at spawn (G-7).
## Holds no gameplay: getting in is `Driving`'s.

## Spots this close to the focus get their kerb worked out (metres).
@export var resolve_reach: float = 560.0
## Spots this close to the focus get their vehicle (inside the load distance, in the haze).
@export var spawn_reach: float = 200.0
## Vehicles this far from the focus are freed (below the streamer's unload distance).
@export var free_reach: float = 310.0
## Ground round a spot that must be loaded before its vehicle appears (metres).
const READY_RADIUS := 30.0
## Process frames between bookkeeping passes.
const EVERY := 6
## A spot found taken (a wall, a vehicle, the player) is tried again after this many frames.
const RETRY_FRAMES := 120

var world: CityWorld
## Asked whether the player is using a vehicle (driving or getting in or out); never freed then.
var driving: Driving = null
var spots: Array[ParkingSpots.Spot] = []
## Spot id → its vehicle while one exists.
var vehicles: Dictionary[StringName, Vehicle] = {}
## Counters for tests and the HUD: spawned, freed, blocked.
var stats: Dictionary = {"spawned": 0, "freed": 0, "blocked": 0}

var _models: Array[Resource] = []
var _resolving: Dictionary[StringName, BackgroundTask] = {}
var _building: BackgroundTask = null
var _building_spot: ParkingSpots.Spot = null
var _frame: int = 0
var _box := BoxShape3D.new()
## Spot id → the frame before which it is not tried again.
var _retry: Dictionary[StringName, int] = {}


static func make(city: CityWorld, session: Driving, list: Array[ParkingSpots.Spot]) -> ParkedVehicles:
	var p := ParkedVehicles.new()
	p.name = "ParkedVehicles"
	p.world = city
	p.driving = session
	p.spots = list
	return p


func _ready() -> void:
	world.streamer.chunk_hidden.connect(_on_chunk_hidden)


## Loading work: every parked variant's models loaded on threads, then the spots round `point`
## resolved and their vehicles in the scene. Returns "" or what went wrong.
func prepare(point: Vector2) -> String:
	var files: PackedStringArray = []
	for s in spots:
		var m := VehicleCatalog.manifest_for(VehicleCatalog.variant(s.variant).type)
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
		var r := ResourceLoader.load_threaded_get(f)
		if r == null:
			return "Could not load %s." % f
		_models.append(r)
	# The spots round the start, in place before play begins (game time, bounded).
	for i in 60 * 60:
		_update(point)
		if _settled_round(point):
			return ""
		await get_tree().process_frame
	return "The vehicles round the start did not park."


func _settled_round(point: Vector2) -> bool:
	if _building != null or not _resolving.is_empty():
		return false
	for s in spots:
		if s.state == &"new" and s.near.distance_to(point) <= resolve_reach:
			return false
		if s.state == &"ready" and s.point.distance_to(point) <= spawn_reach and not vehicles.has(s.id) and world.world_ready_around(s.point, READY_RADIUS):
			return false
	return true


func _process(_delta: float) -> void:
	_frame += 1
	if _frame % EVERY == 0 and world.streamer.active:
		_update(world.streamer.focus)


func _update(focus: Vector2) -> void:
	_collect()
	_free_far(focus)
	for s in spots:
		if s.state == &"new" and s.near.distance_to(focus) <= resolve_reach and _resolving.size() < 2:
			s.state = &"resolving"
			_resolving[s.id] = BackgroundTask.start(ParkingSpots.resolve.bind(s.near, world))
	if _building != null:
		return
	var best: ParkingSpots.Spot = null
	var best_d := spawn_reach
	for s in spots:
		if s.state != &"ready" or vehicles.has(s.id) or _frame < int(_retry.get(s.id, 0)):
			continue
		var d := s.point.distance_to(focus)
		if d <= best_d and world.world_ready_around(s.point, READY_RADIUS):
			if _ground_at(s) == null:
				_retry[s.id] = _frame + RETRY_FRAMES
				continue
			best = s
			best_d = d
	if best != null:
		_building_spot = best
		_building = BackgroundTask.start(Vehicle.create.bind(best.variant, best.id, best.paint))


## Finished worker tasks: resolved spots, and a built vehicle joins the scene if still wanted.
func _collect() -> void:
	for id: StringName in _resolving.keys():
		var task: BackgroundTask = _resolving[id]
		if not task.is_done():
			continue
		_resolving.erase(id)
		var k: Dictionary = task.result()
		for s in spots:
			if s.id == id:
				ParkingSpots.apply(s, k)
				if s.state == &"off_map":
					print("[parking] %s is not on this map (no road within %d m)" % [id, ParkingSpots.MAX_SNAP])
	if _building == null or not _building.is_done():
		return
	var v := _building.result() as Vehicle
	var s := _building_spot
	_building = null
	_building_spot = null
	if v == null:
		return
	var at: Variant = _ground_at(s) if world.world_ready_around(s.point, READY_RADIUS) and s.point.distance_to(world.streamer.focus) <= free_reach else null
	if at != null:
		v.place(at as Vector3, s.yaw)
		add_child(v)
		v.add_to_group(WorldOrigin.GROUP)
		vehicles[s.id] = v
		stats["spawned"] = int(stats["spawned"]) + 1
	else:
		v.free()


## The ground point (scene) where the spot's vehicle would stand, or null when a wall, a
## vehicle or the player is in the way (counted in `stats.blocked`; tried again later).
func _ground_at(s: ParkingSpots.Spot) -> Variant:
	var t := VehicleCatalog.variant(s.variant).type
	var space := world.get_world_3d().direct_space_state
	var at := WorldOrigin.to_scene(s.point)
	var ray := PhysicsRayQueryParameters3D.create(at + Vector3(0, 30, 0), at + Vector3(0, -30, 0), PhysicsLayers.WORLD)
	var hit := space.intersect_ray(ray)
	if not hit.is_empty():
		at.y = (hit["position"] as Vector3).y
	var h := t.spec.half_extents
	_box.size = Vector3(h.x * 2.0 + 0.3, h.y * 2.0 - 0.3, h.z * 2.0 + 0.3)
	var q := PhysicsShapeQueryParameters3D.new()
	q.shape = _box
	q.collision_mask = PhysicsLayers.WORLD | PhysicsLayers.VEHICLES | PhysicsLayers.PLAYER
	q.transform = Transform3D(Basis(Vector3.UP, s.yaw), at + Vector3(0, t.ride_height + h.y + 0.25, 0))
	if not space.intersect_shape(q, 1).is_empty():
		stats["blocked"] = int(stats["blocked"]) + 1
		return null
	return at


func _in_use(v: Vehicle) -> bool:
	if v.is_driven():
		return true
	return driving != null and (driving.boarding_vehicle == v or driving.vehicle == v)


func _free_far(focus: Vector2) -> void:
	for id: StringName in vehicles.keys():
		var v: Vehicle = vehicles[id]
		if not is_instance_valid(v):
			vehicles.erase(id)
			continue
		if not _in_use(v) and WorldOrigin.to_world(v.global_position).distance_to(focus) > free_reach:
			_free(id)


func _on_chunk_hidden(cell: Vector2i) -> void:
	for id: StringName in vehicles.keys():
		var v: Vehicle = vehicles[id]
		if is_instance_valid(v) and not _in_use(v) and world.source.cell_at(WorldOrigin.to_world(v.global_position)) == cell:
			_free(id)


func _free(id: StringName) -> void:
	var v: Vehicle = vehicles[id]
	vehicles.erase(id)
	v.queue_free()
	stats["freed"] = int(stats["freed"]) + 1


## The vehicle at a spot, or null.
func at_spot(id: StringName) -> Vehicle:
	var v: Vehicle = vehicles.get(id)
	return v if is_instance_valid(v) else null


func spot(id: StringName) -> ParkingSpots.Spot:
	for s in spots:
		if s.id == id:
			return s
	return null


func _exit_tree() -> void:
	for id: StringName in _resolving:
		_resolving[id].result()
	_resolving.clear()
	if _building != null:
		var v := _building.result() as Vehicle
		if v != null:
			v.free()
		_building = null
