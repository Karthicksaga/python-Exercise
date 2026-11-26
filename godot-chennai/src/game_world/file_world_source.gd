class_name FileWorldSource
extends WorldSource
## Today's world files (TD-16 of the Three.js game): one `index.json`, one `roads.bin` read at
## start, and `c/<col>_<row>.bin` per chunk read on demand, all in one folder.

var dir: String
var index: WorldIndex = null
var roads: RoadNetwork = null


func _init(folder: String = WorldFiles.DEFAULT_DIR) -> void:
	dir = folder


func open() -> String:
	index = WorldFiles.read_index(dir)
	if not index.ok():
		return index.error
	roads = WorldFiles.read_roads(index, dir)
	if not roads.ok():
		return roads.error
	return ""


## The two halves of `open()`, for a loading screen that reports them as separate steps.
func open_index() -> String:
	index = WorldFiles.read_index(dir)
	return index.error


func open_roads() -> String:
	roads = WorldFiles.read_roads(index, dir)
	return roads.error


func get_bounds() -> Rect2:
	return index.bounds


func get_chunk_size() -> float:
	return index.chunk_size


func get_origin_lat_lng() -> Vector2:
	return Vector2(index.latitude, index.longitude)


func get_attribution() -> String:
	return index.attribution


func get_data_date() -> String:
	return index.data_date


func chunks_near(point: Vector2, radius: float) -> Array[Vector2i]:
	return index.chunks_near(point, radius)


func read_chunk(cell: Vector2i) -> ChunkData:
	return WorldFiles.read_chunk(index, cell.x, cell.y, dir)


## A linear scan over every road (about 5 ms for the city on a desktop): fine for occasional
## queries; the streamer will keep roads per chunk instead (`roadSpansByChunk`).
func roads_near(point: Vector2, radius: float) -> Array[Road]:
	var out: Array[Road] = []
	var r2 := radius * radius
	for road in roads.roads:
		var pts := road.points
		for i in pts.size():
			var near := pts[i].distance_squared_to(point) <= r2
			if not near and i > 0:
				near = Geometry2D.get_closest_point_to_segment(point, pts[i - 1], pts[i]).distance_squared_to(point) <= r2
			if near:
				out.append(road)
				break
	return out


func loaded_roads() -> RoadNetwork:
	return roads


func index_at(point: Vector2) -> WorldIndex:
	return index if index != null and index.bounds.has_point(point) else null
