class_name AiPopulation
extends RefCounted
## The life of the streets round the player in one step (the Three.js `Population.ts`): traffic
## on the road graph, walkers on the pavements, the signals between them and the crowds that
## stand, sit and stroll, as many as the place and the hour call for (TD-31, G-126).
##
## - Traffic stops for walkers in its path (people crossing a street) and for whatever the
##   caller passes (the player, the player's vehicle); walkers step round each other, the
##   player and vehicles; crowds make way for both.
## - How many are out: every LEVELS_EVERY seconds the kinds of place within 250 m and the hour
##   give the walkers and vehicles wanted (`PlaceMap.area_levels`, `area_counts`); the rest are
##   put away out of sight.
## - Nothing is placed on ground that has not loaded (`ground_ready`, brief §7).
##
## Pure logic: no nodes. `step` touches only this object's data, so the game runs it on a worker
## thread while the frame is drawn, and reads the agents when the step is done (`CityLife`).

## Seconds between re-reading the kinds of place round the focus.
const LEVELS_EVERY := 2.0
## Radius of a walker as an obstacle to traffic, metres.
const WALKER_RADIUS := 0.4

var bounds: Rect2
var traffic_settings: AgentPresets.Settings
var walker_settings: AgentPresets.Settings
var area: AiArea = null
var traffic: AgentSystem = null
var walkers: AgentSystem = null
var crowd: CrowdField = null
## ground_ready(Vector2) -> bool: the chunks and colliders round a point are in.
var ground_ready: Callable = Callable()
## solid(Vector2) -> bool: inside a building (crowd spots skip it).
var solid: Callable = Callable()
## Game seconds since the population started (crowd strollers follow it).
var time: float = 0.0
## The last reading of the places round the focus: {people, traffic, place}.
var levels: Dictionary = {"people": 0.0, "traffic": 0.0, "place": &""}
## The crowd to draw after the last step, nearest first.
var people: Array[CrowdField.Person] = []
## Step cost on the thread that ran it (microseconds): traffic, walkers, crowd.
var cost_usec: Vector3i = Vector3i.ZERO
## Caps on how many are out, below the pools (quality presets, G-252); -1 is the pool.
var traffic_cap: int = -1
var walker_cap: int = -1
## False: no crowds are worked out or drawn (feature switch, G-254).
var crowds_on: bool = true
var _until_levels: float = 0.0
var _seed: int = 1


func _init(world_bounds: Rect2, traffic_pool: int, walker_pool: int, mix: Array[AgentPresets.Kind] = [], seed_value: int = 1) -> void:
	bounds = world_bounds
	traffic_settings = AgentPresets.traffic(traffic_pool, mix)
	walker_settings = AgentPresets.pedestrians(walker_pool)
	_seed = seed_value


## Re-reads the place and applies the caps at the next step (after a cap changed).
func refresh_levels() -> void:
	_until_levels = 0.0


## A fresh area is needed (none yet, or the focus moved REBUILD metres from its centre).
func needs_area(focus: Vector2) -> bool:
	return area == null or focus.distance_to(area.centre) > AiArea.REBUILD


## Use a new area (built on a worker thread). The first one fills the streets round `focus`;
## later ones move everyone onto the new graphs where they are (`AgentSystem.rebase`), keep the
## signal clock and the crowd spots already made.
func adopt(next: AiArea, focus: Vector2) -> void:
	var old_signals := area.signals if area != null else null
	area = next
	if old_signals != null:
		next.signals.time = old_signals.time
	if traffic == null:
		traffic = AgentSystem.new(next.drive, bounds, traffic_settings, _seed)
		walkers = AgentSystem.new(next.walk, bounds, walker_settings, _seed + 1)
		traffic.ground_ready = ground_ready
		walkers.ground_ready = ground_ready
		traffic.set_spawn_weights(next.drive_weights)
		walkers.set_spawn_weights(next.walk_weights)
		traffic.use_signals(next.signals)
		_read_levels(focus, 12.0)
		_apply_levels(12.0, true)
		traffic.populate(focus)
		walkers.populate(focus)
	else:
		traffic.rebase(next.drive, focus)
		walkers.rebase(next.walk, focus)
		traffic.set_spawn_weights(next.drive_weights)
		walkers.set_spawn_weights(next.walk_weights)
		traffic.use_signals(next.signals)
	var cells: Dictionary[Vector2i, Array] = {}
	if crowd != null:
		cells = crowd.take_cells()
	crowd = CrowdField.new(next.places)
	crowd.ground_ready = ground_ready
	crowd.solid = solid
	crowd.give_cells(cells)


func _read_levels(focus: Vector2, hour: float) -> void:
	levels = area.places.area_levels(focus, hour)


func _apply_levels(hour: float, immediately: bool = false) -> void:
	var counts := PlaceMap.area_counts(levels, walker_settings.count, traffic_settings.count, TrafficDensity.traffic(hour))
	walkers.set_active_count(counts.x if walker_cap < 0 else mini(counts.x, walker_cap), immediately)
	traffic.set_active_count(counts.y if traffic_cap < 0 else mini(counts.y, traffic_cap), immediately)


## One step of everything. `obstacles`: Vector3(x, z, radius) of the player and anything else
## everyone must keep clear of (world metres); `siren`: Vector3(x, z, heading) or null.
func step(dt: float, focus: Vector2, hour: float, obstacles: PackedVector3Array, siren: Variant = null) -> void:
	if traffic == null:
		return
	time += dt
	_until_levels -= dt
	if _until_levels <= 0.0:
		_until_levels = LEVELS_EVERY
		_read_levels(focus, hour)
		_apply_levels(hour)
	var t0 := Time.get_ticks_usec()
	var walking := walkers.positions()
	area.signals.update(dt, walking)
	var for_traffic := obstacles.duplicate()
	for p in walking:
		for_traffic.append(Vector3(p.x, p.y, WALKER_RADIUS))
	traffic.update(dt, for_traffic, focus, siren)
	var t1 := Time.get_ticks_usec()
	var vehicles := vehicle_obstacles()
	var for_walkers := obstacles.duplicate()
	for_walkers.append_array(vehicles)
	walkers.update(dt, for_walkers, focus)
	var t2 := Time.get_ticks_usec()
	var avoid := obstacles.duplicate()
	avoid.append_array(vehicles)
	people = crowd.people_near(focus, hour, time, avoid) if crowds_on else ([] as Array[CrowdField.Person])
	cost_usec = Vector3i(t1 - t0, t2 - t1, Time.get_ticks_usec() - t2)


## Vehicles as circles people keep clear of: one per car, three along a bus.
func vehicle_obstacles() -> PackedVector3Array:
	var out := PackedVector3Array()
	for a in traffic.agents:
		if not a.active:
			continue
		var k := traffic.kinds[a.kind]
		var f := Vector2(-sin(a.heading), -cos(a.heading))
		var r := maxf(k.half_width, 0.4) + 0.2
		var pieces := maxi(1, ceili(k.half_length / maxf(r, 0.5)))
		for i in pieces:
			var t := 0.0 if pieces == 1 else lerpf(-1.0, 1.0, float(i) / (pieces - 1))
			var p := a.pos + f * (k.half_length - r) * t
			out.append(Vector3(p.x, p.y, r))
	return out
