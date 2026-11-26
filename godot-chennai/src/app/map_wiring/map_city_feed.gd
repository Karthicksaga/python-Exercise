class_name MapCityFeed
extends RefCounted
## The whole loaded city as the full map's `MapCity` (G-466), from the world's own data: every main
## road of every tile (points STEP metres apart; the Low preset LOW_STEP), the names of the main
## roads every ROAD_LABEL_EVERY metres along them, every district of the tile indexes (suburbs,
## neighbourhoods, localities), hospitals, police stations and bus stands as generic words (TD-18:
## no business's own name), named bus stops, and the world's edge. Pure; run on a worker thread
## (reading every tile's roads takes seconds on a phone; the map shows "Drawing the map..." until
## then), once a game: `shared_task` keeps the result.

const STEP := 40.0
const LOW_STEP := 90.0
const ROAD_LABEL_EVERY := 1800.0
## A second label of the same words closer than this to the first is dropped (metres).
const SAME_NAME_GAP := 1200.0

static var _cached: MapCity = null
static var _cached_source: WorldSource = null
static var _task := -1
static var _building: Array = []


## Starts (once per source) the build on a worker thread; `shared()` gives it when done.
static func shared_task(source: WorldSource, low: bool) -> void:
	if source == null or (_cached_source == source and (_cached != null or _task >= 0)):
		return
	_cached = null
	_cached_source = source
	var holder: Array = []
	_building = holder
	_task = WorkerThreadPool.add_task(func() -> void: holder.append(build(source, low)), false, "map city")


## The finished city, or null while it is being built (or never asked for).
static func shared() -> MapCity:
	if _cached == null and _task >= 0 and WorkerThreadPool.is_task_completed(_task):
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		_cached = _building[0] as MapCity if not _building.is_empty() else null
	return _cached


## Waits for a running build (tests and the end of the game).
static func wait() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1
		_cached = _building[0] as MapCity if not _building.is_empty() else null


static func build(source: WorldSource, low: bool = false) -> MapCity:
	var city := MapCity.new()
	var step := LOW_STEP if low else STEP
	var seen: Dictionary[String, PackedVector2Array] = {}
	var regional := source as RegionalWorldSource
	var networks: Array[RoadNetwork] = []
	var indexes: Array[WorldIndex] = []
	if regional != null:
		for tile: Vector2i in regional.tiles.keys():
			indexes.append(regional.tiles[tile])
			var net := regional.read_tile_roads(tile)
			if net != null:
				networks.append(net)
		city.boundary = regional.boundary()
	else:
		var b := source.get_bounds()
		var net := RoadNetwork.new()
		net.roads = source.roads_near(b.get_center(), b.size.length() / 2.0)
		networks.append(net)
		var idx := source.index_at(b.get_center())
		if idx != null:
			indexes.append(idx)
	for net in networks:
		for road in net.roads:
			if road.tunnel or not Road.MAIN_KINDS.has(road.kind):
				continue
			var pts := road.points
			var last := pts[0]
			var run := 0.0
			var since_label := ROAD_LABEL_EVERY / 2.0
			for i in range(1, pts.size()):
				var p := pts[i]
				var d := p.distance_to(pts[i - 1])
				run += d
				since_label += d
				if road.name != "" and since_label >= ROAD_LABEL_EVERY and d > 30.0:
					var mid := (pts[i - 1] + p) / 2.0
					if _fresh(seen, road.name, mid):
						var ang := atan2(p.y - pts[i - 1].y, p.x - pts[i - 1].x)
						if ang > PI / 2.0:
							ang -= PI
						elif ang < -PI / 2.0:
							ang += PI
						var major := road.kind == &"primary" or road.kind == &"motorway"
						city.add_label(mid, road.name, MapCity.Kind.ROAD_MAJOR if major else MapCity.Kind.ROAD, ang)
					since_label = 0.0
				if p.distance_squared_to(last) >= step * step or i == pts.size() - 1:
					city.add_road(last, p)
					last = p
	for idx in indexes:
		for d in idx.districts:
			if d.name == "" or not _fresh(seen, d.name, d.position):
				continue
			city.add_label(d.position, d.name, MapCity.Kind.SUBURB if d.kind == &"suburb" else MapCity.Kind.NEIGHBOURHOOD)
		for poi in idx.pois:
			match poi.kind:
				&"hospital":
					if poi.name != "":
						city.add_label(poi.position, RailText.MAP_HOSPITAL, MapCity.Kind.HOSPITAL)
				&"police":
					city.add_label(poi.position, RailText.MAP_POLICE, MapCity.Kind.POLICE)
				&"bus_station":
					city.add_label(poi.position, poi.name if poi.name != "" else RailText.MAP_BUS_STAND, MapCity.Kind.BUS_STAND)
		for stop in idx.bus_stops:
			if stop.name != "" and _fresh(seen, "stop:" + stop.name, stop.position):
				city.add_label(stop.position, stop.name, MapCity.Kind.BUS_STOP)
	if city.boundary.size() >= 3:
		city.land_triangles = Geometry2D.triangulate_polygon(city.boundary)
	return city


## True (and remembered) when no label of these words is within SAME_NAME_GAP of `at`.
static func _fresh(seen: Dictionary[String, PackedVector2Array], words: String, at: Vector2) -> bool:
	var where: PackedVector2Array = seen.get(words, PackedVector2Array())
	for p in where:
		if p.distance_squared_to(at) < SAME_NAME_GAP * SAME_NAME_GAP:
			return false
	where.append(at)
	seen[words] = where
	return true
