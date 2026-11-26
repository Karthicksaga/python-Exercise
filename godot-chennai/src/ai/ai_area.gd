class_name AiArea
extends RefCounted
## What the AI knows of the roads round the player (the Three.js `Population.areaGraphs`): the
## road graphs for traffic and walkers, their spawn weights, the signals (main-road junctions
## plus every mapped OSM `traffic_signals` node) and the kinds of place (TD-31), for the roads
## within HALF of a centre. Not the whole region: about a twentieth of the memory, and the
## regional world (format 2) is read per tile anyway. Rebuilt on a worker thread when the
## player moves REBUILD from the centre; `AgentSystem.rebase` keeps everyone on their road.
##
## Everything is read through `WorldSource` (G-6): roads, the index (POIs, signals, areas),
## landmarks and sea; beaches of the regional world come from its chunks (its tile index has
## no areas). Pure data: built off the main thread.

const HALF := 1200.0
const REBUILD := 500.0
## Beach outlines are looked for in chunks this close to the centre, when the sea is near.
const BEACH_REACH := 900.0
## The game's railway file (`RailNetwork.PATH`, G-321): the Three.js lines plus the MRTS and the Central lines.
const RAIL := "res://world/rail/rail.json"

var centre: Vector2
var roads: Array[Road] = []
var drive: RoadGraph
var walk: RoadGraph
var drive_weights: PackedFloat32Array
var walk_weights: PackedFloat32Array
var signals: TrafficSignals
var places: PlaceMap
var stations: PackedVector2Array = PackedVector2Array()


static func vehicle_road(r: Road) -> bool:
	return r.kind != &"footway" and r.kind != &"service"


static func walking_road(r: Road) -> bool:
	return r.kind != &"service" and r.kind != &"motorway" and not r.tunnel


## Railway stations from the rail file (not the Metro's, G-462).
static func read_stations(path: String = RAIL) -> PackedVector2Array:
	var out := PackedVector2Array()
	if not FileAccess.file_exists(path):
		return out
	var d: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if d is Dictionary:
		for s: Variant in (d as Dictionary).get("stations", []):
			# Metro stations (G-462) are not the AI's busy station places: their crowds belong at
			# their street entrances, which the rail file does not map.
			if s is Dictionary and not bool((s as Dictionary).get("metro", false)):
				out.append(Vector2(float((s as Dictionary).get("x", 0.0)), float((s as Dictionary).get("z", 0.0))))
	return out


## Builds the area round `at` from an opened source (worker thread). `station_list`: from
## `read_stations` (read once by the caller).
## `decks`: roads on flyovers are raised (`RoadGraph.build`); only once the world draws decks.
static func build(source: WorldSource, at: Vector2, station_list: PackedVector2Array, decks: bool = false) -> AiArea:
	var road_list := source.roads_near(at, HALF * 1.2)
	var box := Rect2(at - Vector2(HALF, HALF), Vector2(HALF, HALF) * 2.0)
	var pois: Array[Place] = []
	var mapped := PackedVector2Array()
	var areas: Array[WorldArea] = []
	var seen: Dictionary[int, bool] = {}
	# The index of every tile the box touches (format 1 has one).
	for corner: Vector2 in [at, box.position, box.end, Vector2(box.position.x, box.end.y), Vector2(box.end.x, box.position.y)]:
		var index := source.index_at(corner)
		if index == null or seen.has(index.get_instance_id()):
			continue
		seen[index.get_instance_id()] = true
		for p in index.pois:
			if box.has_point(p.position):
				pois.append(p)
		for s in index.signals:
			if box.has_point(s):
				mapped.append(s)
		for a in index.areas:
			if a.kind == &"beach" or a.name != "":
				areas.append(a)
	var sea := source.get_sea()
	if source is RegionalWorldSource and sea != null and _near_coast(sea, at, BEACH_REACH + 600.0):
		areas.append_array(_chunk_beaches(source, at))
	return make(road_list, at, pois, mapped, areas, source.get_landmarks(), sea, station_list, decks)


## The area from what was read (also the tests' way in, with hand-made streets).
static func make(road_list: Array[Road], at: Vector2, pois: Array[Place], mapped: PackedVector2Array, areas: Array[WorldArea], landmarks: Array[Landmark], sea: WorldSea, station_list: PackedVector2Array, decks: bool = false) -> AiArea:
	var area := AiArea.new()
	area.centre = at
	area.stations = station_list
	area.roads = road_list
	var poi_points := PackedVector2Array()
	for p in pois:
		poi_points.append(p.position)
	area.drive = RoadGraph.build(road_list, vehicle_road, true, decks)
	area.walk = RoadGraph.build(road_list, walking_road, false, decks)
	area.drive_weights = TrafficDensity.edge_busyness(area.drive, poi_points)
	area.walk_weights = TrafficDensity.edge_busyness(area.walk, poi_points)
	area.signals = TrafficSignals.build(area.drive, mapped)
	area.places = PlaceMap.create(road_list, pois, areas, landmarks, sea, station_list)
	return area


static func _near_coast(sea: WorldSea, p: Vector2, reach: float) -> bool:
	for i in sea.coast.size() - 1:
		if Geometry2D.get_closest_point_to_segment(p, sea.coast[i], sea.coast[i + 1]).distance_to(p) < reach:
			return true
	return false


## Beach outlines from the chunks near a point (cut to each chunk; good enough for "on sand").
static func _chunk_beaches(source: WorldSource, at: Vector2) -> Array[WorldArea]:
	var out: Array[WorldArea] = []
	for cell in source.chunks_near(at, BEACH_REACH):
		var chunk := source.read_chunk(cell)
		if chunk == null:
			continue
		for a in chunk.areas:
			if a.kind == &"beach":
				out.append(a)
	return out
