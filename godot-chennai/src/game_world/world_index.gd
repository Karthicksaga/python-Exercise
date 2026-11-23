class_name WorldIndex
extends RefCounted
## The world's `index.json`: everything always loaded, and the table of chunk files
## (`WorldIndexFile` in `codec.ts`).
##
## Bounds, chunk size and the chunk table are read from the file, never assumed: the world
## grows from today's box to the whole city (decision G-1) without code changes.
## Pure data, safe to build on a worker thread. `error` is "" when the index parsed.

var format: int = 0
var name: String = ""
var latitude: float = 0.0
var longitude: float = 0.0
## Credit that must be shown wherever the map is used.
var attribution: String = ""
## OSM data timestamp of the extract.
var data_date: String = ""
## Playable area in metres: position = (minX, minZ), end = (maxX, maxZ).
var bounds: Rect2 = Rect2()
## Side of a streaming chunk in metres (250 in today's files).
var chunk_size: float = 0.0
## "col,row" -> file size in bytes, for every chunk in the table. Size 0 means the square has
## only road surface and no file.
var chunk_sizes: Dictionary[String, int] = {}
## Roads file name relative to the index.
var roads_file: String = ""
var road_names: PackedStringArray = PackedStringArray()
var areas: Array[WorldArea] = []
var pois: Array[Place] = []
var landmarks: Array[Landmark] = []
var bus_stops: Array[Place] = []
## Mapped traffic signals (x, z).
var signals: PackedVector2Array = PackedVector2Array()
var districts: Array[Place] = []
## null when the map has no coast.
var sea: WorldSea = null
var error: String = ""


func ok() -> bool:
	return error == ""


static func parse(text: String) -> WorldIndex:
	var index := WorldIndex.new()
	var json := JSON.new()
	if json.parse(text) != OK:
		index.error = "index.json: %s at line %d" % [json.get_error_message(), json.get_error_line()]
		return index
	if typeof(json.data) != TYPE_DICTIONARY:
		index.error = "index.json is not an object."
		return index
	var d: Dictionary = json.data
	index.format = int(d.get("format", 0))
	index.error = WorldCodec.format_error("World index", index.format)
	if index.error != "":
		return index
	for field: String in ["bounds", "chunkSize", "chunks", "roads", "roadNames"]:
		if not d.has(field):
			index.error = "index.json has no %s." % field
			return index
	index.name = str(d.get("name", ""))
	var origin: Dictionary = d.get("origin", {})
	index.latitude = float(origin.get("lat", 0.0))
	index.longitude = float(origin.get("lng", 0.0))
	index.attribution = str(d.get("attribution", ""))
	index.data_date = str(d.get("dataDate", ""))
	var b: Dictionary = d["bounds"]
	var min_x := float(b.get("minX", 0.0))
	var min_z := float(b.get("minZ", 0.0))
	index.bounds = Rect2(min_x, min_z, float(b.get("maxX", 0.0)) - min_x, float(b.get("maxZ", 0.0)) - min_z)
	index.chunk_size = float(d["chunkSize"])
	if index.chunk_size <= 0.0 or index.bounds.size.x <= 0.0 or index.bounds.size.y <= 0.0:
		index.error = "index.json has empty bounds or chunk size."
		return index
	for entry: Array in d["chunks"]:
		index.chunk_sizes[_key(int(entry[0]), int(entry[1]))] = int(entry[2])
	index.roads_file = str(d["roads"])
	for n: Variant in d["roadNames"]:
		index.road_names.append(str(n))
	for a: Dictionary in d.get("areas", []):
		var area := WorldArea.new()
		area.id = int(a.get("id", 0))
		area.kind = StringName(str(a.get("kind", "park")))
		area.name = str(a.get("name", ""))
		area.outline = _outline(a.get("outline", []))
		index.areas.append(area)
	for p: Array in d.get("pois", []):
		var poi := Place.new()
		poi.kind = StringName(str(p[0]))
		poi.position = Vector2(float(p[1]), float(p[2]))
		poi.name = str(p[3]) if p.size() > 3 else ""
		index.pois.append(poi)
	for l: Dictionary in d.get("landmarks", []):
		var mark := Landmark.new()
		mark.id = str(l.get("id", ""))
		mark.kind = StringName(str(l.get("kind", "")))
		mark.name = str(l.get("name", ""))
		mark.position = Vector2(float(l.get("x", 0.0)), float(l.get("z", 0.0)))
		mark.height = float(l.get("height", 0.0))
		mark.levels = int(l.get("levels", 0))
		mark.radius = float(l.get("radius", 0.0))
		mark.opened = int(l.get("opened", 0))
		mark.source = str(l.get("source", ""))
		for e: Variant in l.get("estimated", []):
			mark.estimated.append(str(e))
		index.landmarks.append(mark)
	for s: Dictionary in d.get("busStops", []):
		index.bus_stops.append(_place(s, &"bus_stop"))
	for s: Dictionary in d.get("signals", []):
		index.signals.append(Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0))))
	for s: Dictionary in d.get("districts", []):
		index.districts.append(_place(s, StringName(str(s.get("kind", "")))))
	if d.has("sea"):
		var sd: Dictionary = d["sea"]
		index.sea = WorldSea.new()
		index.sea.coast = _outline(sd.get("coast", []))
		index.sea.outline = _outline(sd.get("outline", []))
		index.sea.source = str(sd.get("source", ""))
	return index


static func _key(col: int, row: int) -> String:
	return "%d,%d" % [col, row]


static func _place(s: Dictionary, kind: StringName) -> Place:
	var p := Place.new()
	p.position = Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0)))
	p.name = str(s.get("name", ""))
	p.kind = kind
	return p


static func _outline(points: Array) -> PackedVector2Array:
	var out := PackedVector2Array()
	for p: Dictionary in points:
		out.append(Vector2(float(p.get("x", 0.0)), float(p.get("z", 0.0))))
	return out


## Grid column and row of the chunk holding a point (x, z) (`chunkKeyAt` in `roadChunks.ts`).
func cell_at(point: Vector2) -> Vector2i:
	return Vector2i(floori((point.x - bounds.position.x) / chunk_size), floori((point.y - bounds.position.y) / chunk_size))


func key_at(point: Vector2) -> String:
	var c := cell_at(point)
	return _key(c.x, c.y)


## True when the chunk is in the table (with or without a file).
func has_chunk(col: int, row: int) -> bool:
	return chunk_sizes.has(_key(col, row))


## True when the chunk has buildings, trees or areas, so a file to read.
func has_chunk_file(col: int, row: int) -> bool:
	return chunk_sizes.get(_key(col, row), 0) > 0


## The chunk file's path relative to the index (`chunkFile` in `codec.ts`).
static func chunk_file(col: int, row: int) -> String:
	return "c/%d_%d.bin" % [col, row]


func chunk_centre(col: int, row: int) -> Vector2:
	return WorldCodec.chunk_centre(bounds, chunk_size, col, row)


## Chunks in the table whose squares come within `radius` metres of a point, nearest first:
## the order a streamer loads them in.
func chunks_near(point: Vector2, radius: float) -> Array[Vector2i]:
	var lo := cell_at(point - Vector2(radius, radius))
	var hi := cell_at(point + Vector2(radius, radius))
	var found: Array[Vector2i] = []
	var gaps: Array[float] = []
	for col in range(lo.x, hi.x + 1):
		for row in range(lo.y, hi.y + 1):
			if not has_chunk(col, row):
				continue
			var square := Rect2(bounds.position + Vector2(col, row) * chunk_size, Vector2(chunk_size, chunk_size))
			var nearest := point.clamp(square.position, square.end)
			var gap := nearest.distance_to(point)
			if gap > radius:
				continue
			var at := gaps.bsearch(gap)
			gaps.insert(at, gap)
			found.insert(at, Vector2i(col, row))
	return found
