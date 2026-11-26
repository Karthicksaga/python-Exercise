class_name WorldCodecV2
extends RefCounted
## Decoders for the regional world, format 2 (`docs/world-format.md` §3.3–3.5, decision G-56):
## a chunk record from a tile's `chunks.bin` pack and a tile's `roads.bin`. A port of the Python
## reference (`tools/geo/chennai_geo/codec_v2.py`) checked against it by
## `tests/unit/test_regional_world_source.gd`. Pure data, safe on a worker thread; a bad buffer
## gives an object whose `error` is set, never a crash (`WorldCodec.ByteReader`).

const FORMAT := 2
const Q := 20.0
const CHUNK_MAGIC := 0x43574f43
const ROADS_MAGIC := 0x52574f43
const PACK_MAGIC := 0x50574f43

const ROAD_KINDS: Array[StringName] = [&"primary", &"secondary", &"tertiary", &"residential", &"service", &"footway", &"motorway", &"track", &"raceway"]
const HIGHWAY_CLASSES: Array[StringName] = [&"", &"motorway", &"motorway_link", &"trunk", &"trunk_link", &"primary", &"primary_link", &"secondary", &"secondary_link", &"tertiary", &"tertiary_link", &"residential", &"unclassified", &"living_street", &"service", &"footway", &"path", &"pedestrian", &"track", &"raceway", &"steps", &"cycleway", &"bridleway", &"busway", &"road"]
const BUILDING_KINDS: Array[StringName] = [&"house", &"apartments", &"commercial"]
const HEIGHT_FROM: Array[StringName] = [&"estimated", &"levels", &"height", &"overture", &"openbuildings", &"min-height", &"microsoft"]
const BUILDING_USES: Array[StringName] = [&"unknown", &"house", &"residential", &"commercial", &"retail", &"office", &"industrial", &"warehouse", &"religious", &"school", &"hospital", &"public", &"transport", &"hangar", &"shed", &"garage", &"hut", &"construction", &"roof", &"other"]
const ROOF_SHAPES: Array[StringName] = [&"unknown", &"flat", &"gabled", &"hipped", &"pyramidal", &"dome", &"skillion", &"half-hipped", &"gambrel", &"mansard", &"round", &"onion", &"cone", &"saltbox", &"other"]
const AREA_KINDS: Array[StringName] = [&"park", &"water", &"beach", &"reservoir", &"wetland", &"farmland", &"orchard", &"meadow", &"scrub", &"forest", &"residential", &"commercial", &"industrial", &"military", &"cemetery", &"bare", &"saltpan", &"aerodrome", &"apron", &"sport", &"railway", &"helipad", &"mangrove"]


static func _pick(table: Array[StringName], i: int) -> StringName:
	return table[i] if i < table.size() else table[0]


static func _ring(r: WorldCodec.ByteReader, centre: Vector2) -> PackedVector2Array:
	var n := r.u16()
	var out := PackedVector2Array()
	out.resize(n)
	for k in n:
		out[k] = Vector2(WorldCodec._round2(centre.x + r.i16() / Q), WorldCodec._round2(centre.y + r.i16() / Q))
	return out


static func _u64(r: WorldCodec.ByteReader) -> int:
	var lo := r.u32()
	var hi := r.u32()
	return (hi << 32) | lo


## One chunk record. `grid_origin` is (grid.minX, grid.minZ) of `world.json`.
static func decode_chunk(bytes: PackedByteArray, grid_origin: Vector2, chunk_size: float) -> ChunkData:
	var chunk := ChunkData.new()
	var r := WorldCodec.ByteReader.new(bytes)
	if r.u32() != CHUNK_MAGIC:
		chunk.error = "Not a chunk record."
		return chunk
	chunk.format = r.u16()
	if chunk.format != FORMAT:
		chunk.error = "Chunk record format %d, expected %d." % [chunk.format, FORMAT]
		return chunk
	chunk.col = r.i16()
	chunk.row = r.i16()
	chunk.key = "%d,%d" % [chunk.col, chunk.row]
	r.u8()  # ring
	r.u8()
	var centre := WorldCodec.chunk_centre(Rect2(grid_origin, Vector2.ONE), chunk_size, chunk.col, chunk.row)
	chunk.centre = centre
	var nb := r.u16()
	var nt := r.u16()
	var na := r.u16()
	var ns := r.u16()
	for i in nb:
		var b := Building.new()
		b.id = r.u32()
		b.dataset = r.u8()
		b.source_id = _u64(r)
		for m in r.u8():
			r.u8()
			_u64(r)
		b.height = r.u16() / 10.0
		b.min_height = r.u16() / 10.0
		b.floors = r.u8()
		b.kind = _pick(BUILDING_KINDS, r.u8())
		b.height_from = _pick(HEIGHT_FROM, r.u8())
		b.use = _pick(BUILDING_USES, r.u8())
		r.u8()  # archetype
		b.roof_shape = _pick(ROOF_SHAPES, r.u8())
		r.u8()  # roof levels
		var colour := r.u8()
		b.color_hex = WorldCodec.WALL_COLORS[colour] if colour < WorldCodec.WALL_COLORS.size() else WorldCodec.WALL_COLORS[0]
		r.u8()  # flags
		var rings := r.u8()
		for k in rings:
			var ring := _ring(r, centre)
			if k == 0:
				b.outline = ring
			else:
				b.holes.append(ring)
		chunk.buildings.append(b)
		if r.overrun:
			break
	for i in nt:
		var t := WorldTree.new()
		t.position = Vector2(WorldCodec._round2(centre.x + r.i16() / Q), WorldCodec._round2(centre.y + r.i16() / Q))
		t.scale = r.u8() / 100.0
		t.source = &"osm" if r.u8() == 1 else &"generated"
		chunk.trees.append(t)
	for i in na:
		var a := WorldArea.new()
		a.id = r.u32()
		r.u8()
		_u64(r)
		a.kind = _pick(AREA_KINDS, r.u8())
		var rings := r.u8()
		for k in rings:
			var ring := _ring(r, centre)
			if k == 0:
				a.outline = ring
		chunk.areas.append(a)
		if r.overrun:
			break
	for i in ns:
		r.u32()
		var length := r.u32()
		r.at += length
	if r.overrun:
		chunk.error = "Chunk record %s is truncated (%d bytes)." % [chunk.key, bytes.size()]
	elif r.at != bytes.size():
		chunk.error = "%d trailing bytes in chunk %s." % [bytes.size() - r.at, chunk.key]
	return chunk


## A tile's road pieces. `names` is the tile's `roadNames`.
static func decode_roads(bytes: PackedByteArray, names: PackedStringArray) -> RoadNetwork:
	var net := RoadNetwork.new()
	var r := WorldCodec.ByteReader.new(bytes)
	if r.u32() != ROADS_MAGIC:
		net.error = "Not a roads file."
		return net
	net.format = r.u16()
	if net.format != FORMAT:
		net.error = "Roads file format %d, expected %d." % [net.format, FORMAT]
		return net
	r.i16()
	r.i16()
	var count := r.u32()
	for i in count:
		if r.overrun:
			break
		var road := Road.new()
		road.id = int(r.f64())
		road.piece = r.u16()
		road.kind = _pick(ROAD_KINDS, r.u8())
		road.highway = _pick(HIGHWAY_CLASSES, r.u8())
		var flags := r.u8()
		var layer := r.u8()
		road.layer = layer - 256 if layer > 127 else layer
		road.width = r.u16() / 100.0
		var lanes := r.u8()
		road.lanes = lanes if flags & 2 else -1
		road.oneway = (flags & 1) == 1
		road.bridge = (flags & 4) != 0
		road.tunnel = (flags & 8) != 0
		r.u8()  # width from
		r.u8()  # surface
		r.u8()  # sidewalk
		r.u8()  # maxspeed
		var name := r.u16()
		var ref := r.u16()
		if name > 0 and name - 1 < names.size():
			road.name = names[name - 1]
		if ref > 0 and ref - 1 < names.size():
			road.ref = names[ref - 1]
		r.u8()
		_u64(r)
		road.offset_along = _f32(r)
		road.total_length = _f32(r)
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
		net.error = "Roads file is truncated (%d bytes)." % bytes.size()
	return net


static func _f32(r: WorldCodec.ByteReader) -> float:
	if r.at + 4 > r.bytes.size():
		r.overrun = true
		return 0.0
	r.at += 4
	return r.bytes.decode_float(r.at - 4)
