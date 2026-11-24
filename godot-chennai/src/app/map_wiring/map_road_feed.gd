class_name MapRoadFeed
extends RefCounted
## Road lines for the maps, out of the world's own road data (G-281; no second source). The
## minimap asks for the streets round the player (`nearby`, from the layout's segment grid: cheap,
## main thread, once per 100 m of travel); the full map asks for a whole neighbourhood
## (`wide_task`, on a worker thread: the first read of a road tile takes a few hundred ms).
## Footways are left out; points closer than `STEP` metres are dropped on the wide set.

const NEAR_RADIUS := 4000.0
const WIDE_RADIUS := 12500.0
const STEP := 30.0
const MAX_NEAR_SEGMENTS := 3500

var world: CityWorld = null


## The streets within `radius` of `at`, from the city layout (an empty set with no world).
func nearby(at: Vector2, radius: float) -> MapRoads:
	var out := MapRoads.new()
	out.centre = at
	out.radius = radius
	if world == null or world.layouts == null or world.source == null:
		return out
	var layout := world.layouts.layout_for(world.source.cell_at(at))
	var r2 := radius * radius
	var major := out.major
	var minor := out.minor
	layout.segments_near(at, radius, func(ri: int, i: int) -> bool:
		var road := layout.roads[ri]
		if road.kind == &"footway":
			return false
		var a := road.points[i]
		var b := road.points[i + 1]
		if a.distance_squared_to(at) > r2 and b.distance_squared_to(at) > r2:
			return false
		var into := major if Road.MAIN_KINDS.has(road.kind) else minor
		if (major.size() + minor.size()) / 2 < MAX_NEAR_SEGMENTS:
			into.append(a)
			into.append(b)
		return false)
	out.major = major
	out.minor = minor
	return out


## Starts building the full map's two sets on a worker thread; poll `finished` and read `result`.
## Safe to call again: a running build is left to finish and the call does nothing.
func wide_task(centre: Vector2) -> void:
	if _task >= 0 and not WorkerThreadPool.is_task_completed(_task):
		return
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
	_task = -1
	result = {}
	if world == null or world.source == null:
		result = {"near": MapRoads.new(), "wide": MapRoads.new()}
		return
	var source := world.source
	var job := func() -> void:
		var near := MapRoads.new()
		near.centre = centre
		near.radius = NEAR_RADIUS
		var wide := MapRoads.new()
		wide.centre = centre
		wide.radius = WIDE_RADIUS
		for road in source.roads_near(centre, WIDE_RADIUS):
			if road.kind == &"footway" or road.tunnel:
				continue
			var main := Road.MAIN_KINDS.has(road.kind)
			var in_near := false
			var last := Vector2.INF
			var pts := road.points
			for i in pts.size():
				var p := pts[i]
				if not in_near and p.distance_squared_to(centre) < NEAR_RADIUS * NEAR_RADIUS:
					in_near = true
			if in_near:
				var into := near.major if main else near.minor
				for i in range(pts.size() - 1):
					into.append(pts[i])
					into.append(pts[i + 1])
			if main:
				for i in pts.size():
					var p := pts[i]
					if last == Vector2.INF:
						last = p
						continue
					if p.distance_squared_to(last) >= STEP * STEP or i == pts.size() - 1:
						wide.major.append(last)
						wide.major.append(p)
						last = p
		result = {"near": near, "wide": wide}
	_task = WorkerThreadPool.add_task(job, false, "map roads")


## True once the build started by `wide_task` has produced `result` (also when none was started).
func finished() -> bool:
	return _task < 0 or WorkerThreadPool.is_task_completed(_task)


## Waits for a running build (tests; the game polls `finished`).
func wait() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


## {near: MapRoads, wide: MapRoads} of the last finished build, or {}.
var result: Dictionary = {}
var _task := -1
