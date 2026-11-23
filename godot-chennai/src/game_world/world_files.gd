class_name WorldFiles
extends RefCounted
## Reads the world's files from a folder (`WorldFiles.ts` in the Three.js game).
##
## Every function is static, allocates only its result and touches no node, so it can run on
## a worker thread (`WorkerThreadPool`, see `BackgroundTask`); the streamer in wave 2 reads and
## decodes chunks off the main thread and builds meshes in time-sliced steps.

## Where the synced world lives (tools/sync_from_threejs.py).
const DEFAULT_DIR := "res://assets/world"


static func read_index(dir: String = DEFAULT_DIR) -> WorldIndex:
	var path := dir.path_join("index.json")
	if not FileAccess.file_exists(path):
		var missing := WorldIndex.new()
		missing.error = "%s not found." % path
		return missing
	return WorldIndex.parse(FileAccess.get_file_as_string(path))


static func read_roads(index: WorldIndex, dir: String = DEFAULT_DIR) -> RoadNetwork:
	var path := dir.path_join(index.roads_file)
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		var missing := RoadNetwork.new()
		missing.error = "%s not found or empty." % path
		return missing
	return WorldCodec.decode_roads(bytes, index.road_names)


## A chunk in the table without a file (road surface only) decodes as an empty chunk.
static func read_chunk(index: WorldIndex, col: int, row: int, dir: String = DEFAULT_DIR) -> ChunkData:
	if not index.has_chunk_file(col, row):
		var empty := ChunkData.new()
		empty.col = col
		empty.row = row
		empty.key = "%d,%d" % [col, row]
		empty.format = index.format
		if not index.has_chunk(col, row):
			empty.error = "Chunk %s is not in the index." % empty.key
		return empty
	var path := dir.path_join(WorldIndex.chunk_file(col, row))
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		var missing := ChunkData.new()
		missing.error = "%s not found or empty." % path
		return missing
	var chunk := WorldCodec.decode_chunk(bytes, index.bounds, index.chunk_size)
	if chunk.ok() and (chunk.col != col or chunk.row != row):
		chunk.error = "%s holds chunk %s." % [path, chunk.key]
	return chunk
