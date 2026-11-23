class_name WorldCodec
extends RefCounted
## Decoders for the streamed world's binary files (TD-16 of the Three.js game, decision G-4).
##
## A faithful port of `chennai-open-world/packages/game-world/src/codec.ts` (format 1): files
## are little-endian, coordinates quantised to 5 cm. Road lines are a 32-bit start and 16-bit
## steps; chunk contents are 16-bit offsets from the chunk's centre.
##
## Pure data: no nodes, no files (WorldFiles reads the bytes), safe to call from a worker
## thread. Every decoder checks the magic number and the format version first, and never reads
## past the end of the buffer: a bad file gives an object whose `error` is set, never a crash.
##
## Coordinates (TD-2): metres, +X east, -Z north, so a world point (x, z) is
## Vector3(x, height, z) in Godot. Points are stored as Vector2(x, z).

## The format version this reader understands. A file with any other version is refused with
## a message to rebuild the world, so a richer v2 (archetypes, height source, provenance) can
## be added as a new branch in the decoders without breaking old readers silently.
const WORLD_FORMAT := 1
const SUPPORTED_FORMATS: Array[int] = [1]
## Quantisation steps per metre.
const Q := 20.0
const CHUNK_MAGIC := 0x43574f43  # "COWC"
const ROADS_MAGIC := 0x52574f43  # "COWR"

const ROAD_KINDS: Array[StringName] = [&"primary", &"secondary", &"tertiary", &"residential", &"service", &"footway"]
const BUILDING_KINDS: Array[StringName] = [&"house", &"apartments", &"commercial"]
const HEIGHT_FROM: Array[StringName] = [&"estimated", &"levels", &"height"]
const AREA_KINDS: Array[StringName] = [&"park", &"water", &"beach"]
## Wall colours as 0xRRGGBB, in the order the files index them (`WALL_COLORS` in
## `buildWorldMap.ts`). Invented: OSM has no colours.
const WALL_COLORS: Array[int] = [0xf2e3c6, 0xe8c9a0, 0xcfe3d4, 0xf4d6cf, 0xd9e2f0, 0xf7edb5, 0xe3d5ee, 0xfbf3e4, 0xc9dccb, 0xead9c4, 0xdfe7d2, 0xf1ddb8]


## Little-endian reader over a byte buffer that refuses to read past the end.
class ByteReader:
	extends RefCounted
	var bytes: PackedByteArray
	var at: int = 0
	## Set once a read would have gone past the end; reads then return 0.
	var overrun: bool = false

	func _init(data: PackedByteArray) -> void:
		bytes = data

	func _room(n: int) -> bool:
		if overrun or at + n > bytes.size():
			overrun = true
			return false
		return true

	func u8() -> int:
		if not _room(1):
			return 0
		at += 1
		return bytes[at - 1]

	func u16() -> int:
		if not _room(2):
			return 0
		at += 2
		return bytes.decode_u16(at - 2)

	func i16() -> int:
		if not _room(2):
			return 0
		at += 2
		return bytes.decode_s16(at - 2)

	func u32() -> int:
		if not _room(4):
			return 0
		at += 4
		return bytes.decode_u32(at - 4)

	func i32() -> int:
		if not _room(4):
			return 0
		at += 4
		return bytes.decode_s32(at - 4)

	func f64() -> float:
		if not _room(8):
			return 0.0
		at += 8
		return bytes.decode_double(at - 8)


## Centre of a chunk square, the origin of its quantised coordinates (x, z).
static func chunk_centre(bounds: Rect2, chunk_size: float, col: int, row: int) -> Vector2:
	return Vector2(bounds.position.x + (col + 0.5) * chunk_size, bounds.position.y + (row + 0.5) * chunk_size)


## The error for a file whose version this reader does not know, or "" when it is supported.
static func format_error(what: String, format: int) -> String:
	if SUPPORTED_FORMATS.has(format):
		return ""
	return "%s format %d, expected %d: rebuild the world (npm run build:world in chennai-open-world, then tools/sync_from_threejs.py)." % [what, format, WORLD_FORMAT]


## JavaScript's Math.round(v * 100) / 100, which the TS decoder applies to chunk points.
static func _round2(v: float) -> float:
	return floorf(v * 100.0 + 0.5) / 100.0


## Decodes one chunk file. `bounds` and `chunk_size` come from the world index.
static func decode_chunk(bytes: PackedByteArray, bounds: Rect2, chunk_size: float) -> ChunkData:
	var chunk := ChunkData.new()
	var r := ByteReader.new(bytes)
	if r.u32() != CHUNK_MAGIC:
		chunk.error = "Not a chunk file."
		return chunk
	chunk.format = r.u16()
	chunk.error = format_error("Chunk file", chunk.format)
	if chunk.error != "":
		return chunk
	chunk.col = r.i16()
	chunk.row = r.i16()
	chunk.key = "%d,%d" % [chunk.col, chunk.row]
	var centre := chunk_centre(bounds, chunk_size, chunk.col, chunk.row)
	chunk.centre = centre
	var nb := r.u16()
	var nt := r.u16()
	var na := r.u16()
	for i in nb:
		var b := Building.new()
		b.id = r.u32()
		b.height = r.u16() / 10.0
		b.floors = r.u8()
		var packed := r.u8()
		b.kind = BUILDING_KINDS[packed & 3] if (packed & 3) < BUILDING_KINDS.size() else &"house"
		var from := (packed >> 2) & 3
		b.height_from = HEIGHT_FROM[from] if from < HEIGHT_FROM.size() else &"estimated"
		var colour := r.u8()
		b.color_hex = WALL_COLORS[colour] if colour < WALL_COLORS.size() else WALL_COLORS[0]
		b.outline = _points(r, r.u16(), centre)
		chunk.buildings.append(b)
	for i in nt:
		var t := WorldTree.new()
		t.position = Vector2(_round2(centre.x + r.i16() / Q), _round2(centre.y + r.i16() / Q))
		t.scale = r.u8() / 100.0
		t.source = &"osm" if r.u8() == 1 else &"generated"
		chunk.trees.append(t)
	for i in na:
		var a := WorldArea.new()
		a.id = r.u32()
		var kind := r.u8()
		a.kind = AREA_KINDS[kind] if kind < AREA_KINDS.size() else &"park"
		a.outline = _points(r, r.u16(), centre)
		chunk.areas.append(a)
	if r.overrun:
		chunk.error = "Chunk file %s is truncated (%d bytes)." % [chunk.key, bytes.size()]
	return chunk


static func _points(r: ByteReader, n: int, centre: Vector2) -> PackedVector2Array:
	var out := PackedVector2Array()
	out.resize(n)
	for k in n:
		out[k] = Vector2(_round2(centre.x + r.i16() / Q), _round2(centre.y + r.i16() / Q))
	return out


## Decodes the roads file. `names` is the index's `roadNames` table.
static func decode_roads(bytes: PackedByteArray, names: PackedStringArray) -> RoadNetwork:
	var net := RoadNetwork.new()
	var r := ByteReader.new(bytes)
	if r.u32() != ROADS_MAGIC:
		net.error = "Not a roads file."
		return net
	net.format = r.u16()
	net.error = format_error("Roads file", net.format)
	if net.error != "":
		return net
	var count := r.u32()
	for i in count:
		if r.overrun:
			break
		var road := Road.new()
		var kind := r.u8()
		road.kind = ROAD_KINDS[kind] if kind < ROAD_KINDS.size() else &"residential"
		var flags := r.u8()
		road.width = r.u16() / 100.0
		var lanes := r.u8()
		road.lanes = lanes if flags & 2 else -1
		road.oneway = (flags & 1) == 1
		var name := r.u16()
		if name > 0:
			if name - 1 >= names.size():
				net.error = "Road %d names entry %d of %d." % [i, name, names.size()]
				return net
			road.name = names[name - 1]
		road.id = int(r.f64())
		var n := r.u16()
		var x := r.i32()
		var z := r.i32()
		var points := PackedVector2Array()
		points.resize(n)
		if n > 0:
			points[0] = Vector2(x / Q, z / Q)
		for k in range(1, n):
			x += r.i16()
			z += r.i16()
			points[k] = Vector2(x / Q, z / Q)
		road.points = points
		net.roads.append(road)
	if r.overrun:
		net.error = "Roads file is truncated (%d bytes, %d of %d roads read)." % [bytes.size(), net.roads.size(), count]
	return net
