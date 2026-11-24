@abstract
class_name WorldSource
extends RefCounted
## Where the streamed world comes from (decision G-6). The game only talks to this interface,
## never to `index.json` or `roads.bin` directly, so the single-file world of today
## (`FileWorldSource`) can later be replaced by a regional one (for example 10 km tiles, each
## with its own chunk table and roads) without changing the streamer, AI or HUD.
##
## Rules for every implementation:
## - Positions are world metres (TD-2: +X east, -Z north) from the one fixed geographic origin
##   (`latitude`, `longitude`); the scene's floating origin is applied later (`WorldOrigin`).
## - Bounds and the chunk grid come from the data, never from constants (G-5). All tiles of a
##   regional world share one global chunk grid (same anchor and chunk size), so a chunk's
##   (col, row) means the same square everywhere.
## - `open()`, `read_chunk()` and `roads_near()` may block on files: call them on a worker
##   thread (`BackgroundTask`); they touch no nodes.


## Reads what must be known before play (today: the index and every road). "" or an error.
@abstract func open() -> String

## Playable area in world metres.
@abstract func get_bounds() -> Rect2

## Side of a streaming chunk in metres.
@abstract func get_chunk_size() -> float

## Geographic position of world (0, 0): latitude, longitude in degrees.
@abstract func get_origin_lat_lng() -> Vector2

## Credit for the map data and the OSM extract date, shown wherever the map is.
@abstract func get_attribution() -> String
@abstract func get_data_date() -> String

## Chunks with content or road surface within `radius` m of a point, nearest first.
@abstract func chunks_near(point: Vector2, radius: float) -> Array[Vector2i]

## Decodes one chunk (thread-safe). `error` says why when it failed.
@abstract func read_chunk(cell: Vector2i) -> ChunkData

## Roads that come within `radius` m of a point, from whatever is loaded (thread-safe once opened).
@abstract func roads_near(point: Vector2, radius: float) -> Array[Road]

## Every road currently in memory (today the whole city).
@abstract func loaded_roads() -> RoadNetwork

## The index whose area holds a point (places, landmarks, bus stops, districts); null outside.
@abstract func index_at(point: Vector2) -> WorldIndex


## Corner of chunk (0, 0) of the shared grid, world metres (format 1: the bounds' corner).
func get_grid_origin() -> Vector2:
	return get_bounds().position


## Grid cell of a point on the shared chunk grid.
func cell_at(point: Vector2) -> Vector2i:
	var o := get_grid_origin()
	var size := get_chunk_size()
	return Vector2i(floori((point.x - o.x) / size), floori((point.y - o.y) / size))


## Landmarks of the whole world (always loaded; they are seen from afar).
func get_landmarks() -> Array[Landmark]:
	var index := index_at(get_bounds().get_center())
	return index.landmarks if index != null else ([] as Array[Landmark])


## The sea where the map has a coast, or null.
func get_sea() -> WorldSea:
	var index := index_at(get_bounds().get_center())
	return index.sea if index != null else null
