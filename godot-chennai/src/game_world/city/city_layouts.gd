class_name CityLayouts
extends RefCounted
## Which `CityLayout` a chunk uses (decision G-56). Format 1: one layout for the whole box,
## built once. Format 2: one per 10 km tile, built on first use on a worker thread from the
## tile's road pieces plus its neighbours' pieces and bus stops within MARGIN of its edges (so
## junctions, shelters and "on another road" checks see across the edge), cached, and started
## ahead of time when the player nears a tile (`prefetch`).

const MARGIN := 300.0
## Start a tile's layout when the focus is this close to it.
const PREFETCH := 1500.0

var source: WorldSource
var single: CityLayout
var _tiles: Dictionary[Vector2i, CityLayout] = {}
var _locks: Dictionary[Vector2i, Mutex] = {}
var _tasks: Dictionary[Vector2i, int] = {}
var _mutex := Mutex.new()


## For format 1, builds the single layout now (call on a worker thread).
static func create(world: WorldSource) -> CityLayouts:
	var l := CityLayouts.new()
	l.source = world
	if not (world is RegionalWorldSource):
		var index := world.index_at(world.get_bounds().get_center())
		var stops: Array[Place] = index.bus_stops if index != null else ([] as Array[Place])
		l.single = CityLayout.build(world.loaded_roads(), Rect2(world.get_grid_origin(), world.get_bounds().size), world.get_chunk_size(), stops)
	return l


## The layout for a chunk; may block while its tile's layout is built (worker threads only for
## format 2 tiles not prefetched).
func layout_for(cell: Vector2i) -> CityLayout:
	if single != null:
		return single
	var regional := source as RegionalWorldSource
	return tile_layout(regional.tile_of(cell))


func tile_layout(tile: Vector2i) -> CityLayout:
	_mutex.lock()
	var done: CityLayout = _tiles.get(tile)
	if done != null:
		_mutex.unlock()
		return done
	if not _locks.has(tile):
		_locks[tile] = Mutex.new()
	var lock: Mutex = _locks[tile]
	_mutex.unlock()
	lock.lock()
	_mutex.lock()
	done = _tiles.get(tile)
	_mutex.unlock()
	if done == null:
		done = _build_tile(tile)
		_mutex.lock()
		_tiles[tile] = done
		_mutex.unlock()
	lock.unlock()
	return done


## True when the tile's layout is ready (never blocks).
func has_tile(tile: Vector2i) -> bool:
	_mutex.lock()
	var ok := _tiles.has(tile)
	_mutex.unlock()
	return ok


func _build_tile(tile: Vector2i) -> CityLayout:
	var regional := source as RegionalWorldSource
	var rect := regional.tile_rect(tile)
	var reach := rect.grow(MARGIN)
	var network := RoadNetwork.new()
	var stops: Array[Place] = []
	var water: Array[WorldWaterway] = []
	var street_spots: Array[WorldSpot] = []
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			var t := tile + Vector2i(dx, dz)
			var net := regional.tile_roads(t)
			if net == null:
				continue
			var own := dx == 0 and dz == 0
			var infra := regional.tile_infra(t)
			if infra != null and infra.ok():
				for w in infra.waterways:
					if own or _touches(w.points, reach.grow(w.width)):
						water.append(w)
				for sp in infra.spots:
					if own or reach.has_point(sp.position):
						street_spots.append(sp)
			for road in net.roads:
				if own or _touches(road.points, reach):
					network.roads.append(road)
			var index: WorldIndex = regional.tiles.get(t)
			if index != null:
				for s in index.bus_stops:
					if own or reach.has_point(s.position):
						stops.append(s)
	var size := Vector2(regional.grid_size) * regional.chunk_size
	return CityLayout.build(network, Rect2(regional.grid_origin, size), regional.chunk_size, stops, water, street_spots)


static func _touches(points: PackedVector2Array, r: Rect2) -> bool:
	for p in points:
		if r.has_point(p):
			return true
	return false


## Starts building the layouts of tiles near a point in the background (main thread, cheap).
func prefetch(point: Vector2) -> void:
	if single != null:
		return
	var regional := source as RegionalWorldSource
	for t in _tiles_near(regional, point, PREFETCH):
		if has_tile(t) or _tasks.has(t) or not regional.tiles.has(t):
			continue
		var tile := t
		_tasks[t] = WorkerThreadPool.add_task(func() -> void: tile_layout(tile), false, "layout %d,%d" % [t.x, t.y])
	for t: Vector2i in _tasks.keys():
		if WorkerThreadPool.is_task_completed(_tasks[t]):
			WorkerThreadPool.wait_for_task_completion(_tasks[t])
			_tasks.erase(t)


static func _tiles_near(regional: RegionalWorldSource, point: Vector2, reach: float) -> Array[Vector2i]:
	var lo := regional.tile_at(point - Vector2(reach, reach))
	var hi := regional.tile_at(point + Vector2(reach, reach))
	var out: Array[Vector2i] = []
	for x in range(lo.x, hi.x + 1):
		for z in range(lo.y, hi.y + 1):
			out.append(Vector2i(x, z))
	return out


## Waits for background layout builds (before freeing).
func finish() -> void:
	for t: Vector2i in _tasks.keys():
		WorkerThreadPool.wait_for_task_completion(_tasks[t])
	_tasks.clear()
