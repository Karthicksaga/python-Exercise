class_name RegionalWorldSource
extends WorldSource
## The regional world, format 2 (`world/`, `docs/world-format.md`, decision G-56): one
## `world.json`, then per 10 km tile a `tile.json` (chunk table, bus stops, places), a packed
## `chunks.bin` read by seeking to one record, and `roads.bin` with the tile's road pieces.
##
## `open_index()` reads `world.json` and every tile's table (about 2 MB of JSON, once, on a
## worker thread); road pieces are read per tile on first use (`tile_roads`, thread-safe, cached)
## so the region's roads never all sit in memory. One global 250 m grid: a chunk's (col, row) is
## the same in every tile.

const DEFAULT_DIR := "res://world"

var dir: String
var format: int = 0
var name: String = ""
var latitude: float = 0.0
var longitude: float = 0.0
var attribution: String = ""
var data_date: String = ""
var bounds: Rect2 = Rect2()
var grid_origin: Vector2 = Vector2.ZERO
var grid_size: Vector2i = Vector2i.ZERO
var chunk_size: float = 250.0
var tile_chunks: int = 40
## Today's chunk (c, r) is this grid's (c + legacy.x, r + legacy.y).
var legacy: Vector2i = Vector2i.ZERO
var landmarks: Array[Landmark] = []
var sea: WorldSea = null
## Tile -> its WorldIndex (places, bus stops, signals, districts; landmarks and sea shared).
var tiles: Dictionary[Vector2i, WorldIndex] = {}
## Cell -> Vector3i(offset, length, ring) in its tile's chunks.bin.
var cells: Dictionary[Vector2i, Vector3i] = {}
## Tile -> road names table.
var _names: Dictionary[Vector2i, PackedStringArray] = {}
var _roads: Dictionary[Vector2i, RoadNetwork] = {}
## Format 2.1 (`world.json` `minor` >= 1): the per-tile `infra.bin` (road heights, waterways,
## street spots; G-150), "" when the world has none.
var minor: int = 0
var infra_file: String = ""
var _infra: Dictionary[Vector2i, InfraTile] = {}
## Format 2.3 (`minor` >= 3, G-221): the per-tile `fusion.bin` (buildings from Overture, Google
## Open Buildings and Microsoft where OSM has none), "" when the world has none; the credit line
## of every dataset present.
var fusion_file: String = ""
var fusion_credits: PackedStringArray = PackedStringArray()
var _fusion: Dictionary[Vector2i, FusionTile] = {}
var _mutex := Mutex.new()
var error: String = ""


func _init(folder: String = DEFAULT_DIR) -> void:
	dir = folder


static func available(folder: String = DEFAULT_DIR) -> bool:
	return FileAccess.file_exists(folder.path_join("world.json"))


func open() -> String:
	var e := open_index()
	if e != "":
		return e
	return open_roads()


func open_index() -> String:
	var path := dir.path_join("world.json")
	if not FileAccess.file_exists(path):
		error = "%s not found." % path
		return error
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		error = "world.json: %s" % json.get_error_message()
		return error
	var d: Dictionary = json.data
	format = int(d.get("format", 0))
	if format != WorldCodecV2.FORMAT:
		error = "world.json format %d, expected %d." % [format, WorldCodecV2.FORMAT]
		return error
	name = str(d.get("name", ""))
	minor = int(d.get("minor", 0))
	var infra: Variant = d.get("infra")
	if minor >= 1 and infra is Dictionary:
		infra_file = str((infra as Dictionary).get("file", "infra.bin"))
	var fusion: Variant = d.get("fusion")
	if minor >= 3 and fusion is Dictionary:
		var fd: Dictionary = fusion
		fusion_file = str(fd.get("file", "fusion.bin"))
		for c: Variant in fd.get("credits", []):
			fusion_credits.append(str(c))
	var origin: Dictionary = d.get("origin", {})
	latitude = float(origin.get("lat", 0.0))
	longitude = float(origin.get("lng", 0.0))
	attribution = str(d.get("attribution", ""))
	data_date = str(d.get("dataDate", ""))
	chunk_size = float(d.get("chunkSize", 250))
	tile_chunks = int(d.get("tileChunks", 40))
	var g: Dictionary = d.get("grid", {})
	grid_origin = Vector2(float(g.get("minX", 0)), float(g.get("minZ", 0)))
	grid_size = Vector2i(int(g.get("cols", 0)), int(g.get("rows", 0)))
	var b: Dictionary = d.get("bounds", {})
	bounds = Rect2(float(b.get("minX", 0)), float(b.get("minZ", 0)), float(b.get("maxX", 0)) - float(b.get("minX", 0)), float(b.get("maxZ", 0)) - float(b.get("minZ", 0)))
	var leg: Dictionary = d.get("legacy", {})
	legacy = Vector2i(int(leg.get("colOffset", 0)), int(leg.get("rowOffset", 0)))
	# Landmarks and sea come in today's shapes: reuse the index parser on a small document.
	var shared := WorldIndex.parse(JSON.stringify({"format": 1, "bounds": {"minX": bounds.position.x, "minZ": bounds.position.y, "maxX": bounds.end.x, "maxZ": bounds.end.y}, "chunkSize": chunk_size, "chunks": [], "roads": "", "roadNames": [], "landmarks": d.get("landmarks", []), "sea": d.get("sea", {"coast": [], "outline": []})}))
	if not shared.ok():
		error = shared.error
		return error
	landmarks = shared.landmarks
	sea = shared.sea if shared.sea != null and shared.sea.outline.size() >= 3 else null
	for t: Array in d.get("tiles", []):
		var key := Vector2i(int(t[0]), int(t[1]))
		var e := _open_tile(key)
		if e != "":
			error = e
			return error
	# Squares that hold only added buildings: streamed like road-only squares (no chunk record).
	if fusion_file != "":
		for c: Array in (fusion as Dictionary).get("cells", []):
			var cell := Vector2i(int(c[0]), int(c[1]))
			if not cells.has(cell):
				cells[cell] = Vector3i(0, 0, int(c[2]))
	return ""


func _open_tile(key: Vector2i) -> String:
	var path := dir.path_join("tiles/%d_%d/tile.json" % [key.x, key.y])
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		return "%s: %s" % [path, json.get_error_message()]
	var d: Dictionary = json.data
	if int(d.get("format", 0)) != WorldCodecV2.FORMAT:
		return "%s has format %s." % [path, d.get("format")]
	var index := WorldIndex.new()
	index.format = 2
	index.name = name
	index.latitude = latitude
	index.longitude = longitude
	index.attribution = attribution
	index.data_date = data_date
	var tb: Dictionary = d.get("bounds", {})
	index.bounds = Rect2(float(tb.get("minX", 0)), float(tb.get("minZ", 0)), float(tb.get("maxX", 0)) - float(tb.get("minX", 0)), float(tb.get("maxZ", 0)) - float(tb.get("minZ", 0)))
	index.chunk_size = chunk_size
	index.landmarks = landmarks
	index.sea = sea
	for c: Array in d.get("chunks", []):
		var cell := Vector2i(int(c[0]), int(c[1]))
		cells[cell] = Vector3i(int(c[2]), int(c[3]), int(c[4]))
		index.chunk_sizes["%d,%d" % [cell.x, cell.y]] = int(c[3])
	var names := PackedStringArray()
	for n: Variant in d.get("roadNames", []):
		names.append(str(n))
	_names[key] = names
	index.road_names = names
	index.roads_file = str(d.get("roads", "roads.bin"))
	for p: Array in d.get("pois", []):
		var poi := Place.new()
		poi.kind = StringName(str(p[0]))
		poi.position = Vector2(float(p[1]), float(p[2]))
		poi.name = str(p[3]) if p.size() > 3 and p[3] != null else ""
		index.pois.append(poi)
	for s: Dictionary in d.get("busStops", []):
		index.bus_stops.append(_place(s, &"bus_stop"))
	for s: Dictionary in d.get("signals", []):
		index.signals.append(Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0))))
	for s: Dictionary in d.get("districts", []):
		index.districts.append(_place(s, StringName(str(s.get("kind", "")))))
	tiles[key] = index
	return ""


static func _place(s: Dictionary, kind: StringName) -> Place:
	var p := Place.new()
	p.position = Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0)))
	p.name = str(s.get("name", "")) if s.get("name") != null else ""
	p.kind = kind
	return p


## Reads the road pieces of the tile holding the world origin (the start), so `loaded_roads`
## has something before streaming; other tiles load as they are needed.
func open_roads() -> String:
	var net := tile_roads(tile_at(Vector2.ZERO))
	return net.error if net != null else ""


func get_bounds() -> Rect2:
	return bounds


func get_grid_origin() -> Vector2:
	return grid_origin


func get_chunk_size() -> float:
	return chunk_size


func get_origin_lat_lng() -> Vector2:
	return Vector2(latitude, longitude)


func get_attribution() -> String:
	return attribution


func get_data_date() -> String:
	return data_date


func chunk_count() -> int:
	return cells.size()


func get_landmarks() -> Array[Landmark]:
	return landmarks


func get_sea() -> WorldSea:
	return sea


func cell_at(point: Vector2) -> Vector2i:
	return Vector2i(floori((point.x - grid_origin.x) / chunk_size), floori((point.y - grid_origin.y) / chunk_size))


func tile_of(cell: Vector2i) -> Vector2i:
	return Vector2i(floori(float(cell.x) / tile_chunks), floori(float(cell.y) / tile_chunks))


func tile_at(point: Vector2) -> Vector2i:
	return tile_of(cell_at(point))


func tile_rect(tile: Vector2i) -> Rect2:
	var side := tile_chunks * chunk_size
	return Rect2(grid_origin + Vector2(tile) * side, Vector2(side, side))


func chunks_near(point: Vector2, radius: float) -> Array[Vector2i]:
	var lo := cell_at(point - Vector2(radius, radius))
	var hi := cell_at(point + Vector2(radius, radius))
	var found: Array[Vector2i] = []
	var gaps: Array[float] = []
	for col in range(lo.x, hi.x + 1):
		for row in range(lo.y, hi.y + 1):
			var cell := Vector2i(col, row)
			if not cells.has(cell):
				continue
			var p0 := grid_origin + Vector2(cell) * chunk_size
			var gap := point.clamp(p0, p0 + Vector2(chunk_size, chunk_size)).distance_to(point)
			if gap > radius:
				continue
			var at := gaps.bsearch(gap)
			gaps.insert(at, gap)
			found.insert(at, cell)
	return found


func read_chunk(cell: Vector2i) -> ChunkData:
	var entry: Vector3i = cells.get(cell, Vector3i(-1, -1, -1))
	if entry.x < 0 or entry.y == 0:
		var empty := ChunkData.new()
		empty.col = cell.x
		empty.row = cell.y
		empty.key = "%d,%d" % [cell.x, cell.y]
		empty.format = WorldCodecV2.FORMAT
		empty.centre = WorldCodec.chunk_centre(Rect2(grid_origin, Vector2.ONE), chunk_size, cell.x, cell.y)
		if entry.x < 0:
			empty.error = "Chunk %s is not in the world." % empty.key
		return empty
	var tile := tile_of(cell)
	var path := dir.path_join("tiles/%d_%d/chunks.bin" % [tile.x, tile.y])
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		var missing := ChunkData.new()
		missing.error = "%s could not be opened." % path
		return missing
	f.seek(entry.x)
	var bytes := f.get_buffer(entry.y)
	var chunk := WorldCodecV2.decode_chunk(bytes, grid_origin, chunk_size)
	if chunk.ok() and (chunk.col != cell.x or chunk.row != cell.y):
		chunk.error = "%s at %d holds chunk %s." % [path, entry.x, chunk.key]
	return chunk


## The road pieces of one tile, read on first use (thread-safe); null outside the world.
func tile_roads(tile: Vector2i) -> RoadNetwork:
	_mutex.lock()
	var net: RoadNetwork = _roads.get(tile)
	_mutex.unlock()
	if net != null:
		return net
	if not tiles.has(tile):
		return null
	var path := dir.path_join("tiles/%d_%d/%s" % [tile.x, tile.y, tiles[tile].roads_file])
	var bytes := FileAccess.get_file_as_bytes(path)
	if bytes.is_empty():
		net = RoadNetwork.new()
		net.error = "%s not found or empty." % path
	else:
		net = WorldCodecV2.decode_roads(bytes, _names[tile])
		var infra := tile_infra(tile)
		if infra != null and infra.ok():
			for piece: int in infra.decks:
				if piece < net.roads.size():
					net.roads[piece].set_heights(infra.decks[piece], infra.step)
	_mutex.lock()
	if not _roads.has(tile):
		_roads[tile] = net
	net = _roads[tile]
	_mutex.unlock()
	return net


## One tile's `infra.bin` (thread-safe, cached), or null when the world has none or outside it.
func tile_infra(tile: Vector2i) -> InfraTile:
	if infra_file == "" or not tiles.has(tile):
		return null
	_mutex.lock()
	var done: InfraTile = _infra.get(tile)
	_mutex.unlock()
	if done != null:
		return done
	var path := dir.path_join("tiles/%d_%d/%s" % [tile.x, tile.y, infra_file])
	var bytes := FileAccess.get_file_as_bytes(path)
	var t: InfraTile
	if bytes.is_empty():
		t = InfraTile.new()
		t.error = "%s not found or empty." % path
	else:
		t = InfraTile.decode(bytes)
	if not t.ok():
		push_warning(t.error)
	_mutex.lock()
	if not _infra.has(tile):
		_infra[tile] = t
	t = _infra[tile]
	_mutex.unlock()
	return t


## One tile's `fusion.bin` (thread-safe, cached), or null when the world has none or outside it.
func tile_fusion(tile: Vector2i) -> FusionTile:
	if fusion_file == "" or not tiles.has(tile):
		return null
	_mutex.lock()
	var done: FusionTile = _fusion.get(tile)
	_mutex.unlock()
	if done != null:
		return done
	var path := dir.path_join("tiles/%d_%d/%s" % [tile.x, tile.y, fusion_file])
	var bytes := FileAccess.get_file_as_bytes(path)
	var t: FusionTile
	if bytes.is_empty():
		t = FusionTile.new()
		t.error = "%s not found or empty." % path
	else:
		t = FusionTile.decode(bytes, grid_origin, chunk_size)
	if not t.ok():
		push_warning(t.error)
	_mutex.lock()
	if not _fusion.has(tile):
		_fusion[tile] = t
	t = _fusion[tile]
	_mutex.unlock()
	return t


func apply_fusion(chunk: ChunkData) -> void:
	var cell := Vector2i(chunk.col, chunk.row)
	var t := tile_fusion(tile_of(cell))
	if t != null and t.ok():
		t.apply(chunk, cell)


func get_data_credits() -> PackedStringArray:
	return fusion_credits if not fusion_credits.is_empty() else PackedStringArray([attribution])


func roads_near(point: Vector2, radius: float) -> Array[Road]:
	var out: Array[Road] = []
	var r2 := radius * radius
	var lo := tile_at(point - Vector2(radius, radius))
	var hi := tile_at(point + Vector2(radius, radius))
	for tx in range(lo.x, hi.x + 1):
		for tz in range(lo.y, hi.y + 1):
			var net := tile_roads(Vector2i(tx, tz))
			if net == null:
				continue
			for road in net.roads:
				var pts := road.points
				for i in pts.size():
					var near := pts[i].distance_squared_to(point) <= r2
					if not near and i > 0:
						near = Geometry2D.get_closest_point_to_segment(point, pts[i - 1], pts[i]).distance_squared_to(point) <= r2
					if near:
						out.append(road)
						break
	return out


## Every road piece of the tiles read so far.
func loaded_roads() -> RoadNetwork:
	var all := RoadNetwork.new()
	all.format = WorldCodecV2.FORMAT
	_mutex.lock()
	for net: RoadNetwork in _roads.values():
		all.roads.append_array(net.roads)
	_mutex.unlock()
	return all


func index_at(point: Vector2) -> WorldIndex:
	return tiles.get(tile_at(point))
