class_name FusionTile
extends RefCounted
## One tile's `fusion.bin` (format 2.3, `docs/world-format.md` §3.9, decisions G-220…G-226),
## decoded on a worker thread: buildings that Overture Maps, Google Open Buildings and
## Microsoft ML footprints add where OpenStreetMap has none, and the heights those datasets give
## OSM buildings whose height was estimated. A port of `tools/geo/chennai_geo/fusion_codec.py`.
##
## The added buildings are ordinary `Building` objects: the chunk builder draws them through the
## same building path (same mesh builder, palettes and roof rules as any estimated building).

const MAGIC := 0x46574f43
const FORMAT := 2
const HGHT := 0x54484748
const BLDG := 0x47444c42
## `source` bits of a record, append only (FUSION_SOURCES in Python).
const SOURCES: Array[StringName] = [&"osm", &"overture", &"google", &"microsoft"]
const ORIGINS: Array[StringName] = [&"", &"google", &"microsoft", &"other"]
## Provenance dataset index (`world.json datasets`) of each source.
const DATASET_OF: Array[int] = [0, 3, 4, 6]
const H_POLYGON := 16
const H_APARTMENTS := 32
const H_HEIGHT := 64
const H_FROM := 128
const FLOOR_HEIGHT := 3.1
const PARAPET := 0.9

var tile: Vector2i = Vector2i.ZERO
var minor: int = 0
## Cell -> the buildings added in that square.
var cells: Dictionary[Vector2i, Array] = {}
## OSM building id -> Vector3(height, floors, heightFrom index).
var heights: Dictionary[int, Vector3] = {}
var buildings: int = 0
var error: String = ""


func ok() -> bool:
	return error == ""


## Applies this tile's records to one decoded chunk: height fixes on its OSM buildings, then the
## added buildings of the square appended (ids from 0xC0000000, never an OSM id).
func apply(chunk: ChunkData, cell: Vector2i) -> void:
	if not heights.is_empty():
		for b in chunk.buildings:
			if heights.has(b.id) and b.height_from == &"estimated":
				var h: Vector3 = heights[b.id]
				b.height = h.x
				b.floors = int(h.y)
				b.height_from = WorldCodecV2._pick(WorldCodecV2.HEIGHT_FROM, int(h.z))
	var added: Array = cells.get(cell, [])
	for b: Building in added:
		chunk.buildings.append(b)


static func decode(bytes: PackedByteArray, grid_origin: Vector2, chunk_size: float) -> FusionTile:
	var out := FusionTile.new()
	var r := WorldCodec.ByteReader.new(bytes)
	if r.u32() != MAGIC:
		out.error = "Not a fusion file."
		return out
	var fmt := r.u16()
	if fmt != FORMAT:
		out.error = "Fusion file format %d, expected %d." % [fmt, FORMAT]
		return out
	out.minor = r.u16()
	out.tile = Vector2i(r.i16(), r.i16())
	var sections := r.u16()
	for s in sections:
		var tag := r.u32()
		var length := r.u32()
		var end := r.at + length
		if r.overrun or end > bytes.size():
			out.error = "Fusion file is truncated."
			return out
		match tag:
			HGHT:
				for k in r.u32():
					var id := r.u32()
					var h := r.u16() / 10.0
					var floors := r.u8()
					var from := r.u8()
					r.u8()  # source
					out.heights[id] = Vector3(h, floors, from)
			BLDG:
				for k in r.u32():
					var cell := Vector2i(r.i16(), r.i16())
					r.u8()  # ring
					var first := r.u32()
					var n := r.u16()
					var centre := WorldCodec.chunk_centre(Rect2(grid_origin, Vector2.ONE), chunk_size, cell.x, cell.y)
					var list: Array[Building] = []
					var last: Array[int] = [0, 0, 0, 0]
					for i in n:
						list.append(_building(r, centre, first + i, last))
						if r.overrun:
							break
					out.cells[cell] = list
					out.buildings += list.size()
		if r.overrun:
			out.error = "Fusion file is truncated."
			return out
		r.at = end
	if r.at != bytes.size():
		out.error = "Trailing bytes in the fusion file."
	return out


## Zigzag LEB128 (the source index delta).
static func _varint(r: WorldCodec.ByteReader) -> int:
	var z := 0
	var shift := 0
	while true:
		var b := r.u8()
		z |= (b & 0x7f) << shift
		shift += 7
		if (b & 0x80) == 0 or r.overrun or shift > 63:
			break
	return (z >> 1) if (z & 1) == 0 else -((z + 1) >> 1)


static func _building(r: WorldCodec.ByteReader, centre: Vector2, id: int, last: Array[int]) -> Building:
	var b := Building.new()
	b.id = id
	var head := r.u8()
	var source := head & 3
	b.fusion_source = SOURCES[source]
	b.fusion_origin = ORIGINS[(head >> 2) & 3]
	b.dataset = DATASET_OF[source]
	b.height_from = WorldCodecV2._pick(WorldCodecV2.HEIGHT_FROM, r.u8()) if head & H_FROM else &"estimated"
	b.floors = r.u8()
	b.height = r.u16() / 10.0 if head & H_HEIGHT else snappedf(b.floors * FLOOR_HEIGHT + PARAPET, 0.1)
	var colour := r.u8()
	b.color_hex = WorldCodec.WALL_COLORS[colour] if colour < WorldCodec.WALL_COLORS.size() else WorldCodec.WALL_COLORS[0]
	var conf := r.u8()
	b.confidence = -1.0 if conf == 255 else conf / 200.0
	last[source] += _varint(r)
	b.source_id = last[source]
	b.kind = &"apartments" if head & H_APARTMENTS else &"house"
	if head & H_POLYGON:
		var n := r.u8()
		var pts := PackedVector2Array()
		pts.resize(n)
		for k in n:
			pts[k] = Vector2(WorldCodec._round2(centre.x + r.i16() / WorldCodecV2.Q), WorldCodec._round2(centre.y + r.i16() / WorldCodecV2.Q))
		b.outline = pts
	else:
		var c := Vector2(centre.x + r.i16() / WorldCodecV2.Q, centre.y + r.i16() / WorldCodecV2.Q)
		var length := r.u8() / 10.0
		var width := r.u8() / 10.0
		var angle := r.u8() * PI / 256.0
		var u := Vector2(cos(angle), sin(angle)) * (length / 2.0)
		var v := Vector2(-sin(angle), cos(angle)) * (width / 2.0)
		b.outline = PackedVector2Array([_r2(c - u - v), _r2(c + u - v), _r2(c + u + v), _r2(c - u + v)])
	return b


static func _r2(p: Vector2) -> Vector2:
	return Vector2(WorldCodec._round2(p.x), WorldCodec._round2(p.y))
