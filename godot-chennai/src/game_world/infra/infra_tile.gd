class_name InfraTile
extends RefCounted
## One tile's `infra.bin` (format 2.1, `docs/world-format.md` §3.7, decisions G-150…G-153),
## decoded on a worker thread: road heights per road piece, waterways and street spots.

const MAGIC := 0x49574f43
const FORMAT := 2
const DECK := 0x4b434544
const WATR := 0x52544157
const SPOT := 0x544f5053
const WATERWAY_KINDS: Array[StringName] = [&"river", &"canal", &"stream", &"drain", &"ditch"]
const SPOT_KINDS: Array[StringName] = [&"zebra", &"signal_crossing", &"unmarked", &"bump", &"hump", &"table", &"cushion", &"rumble_strip"]

var tile: Vector2i = Vector2i.ZERO
var minor: int = 0
## Metres between height samples.
var step: float = 5.0
## Road piece index in the tile's `roads.bin` -> heights every `step` metres.
var decks: Dictionary[int, PackedFloat32Array] = {}
var waterways: Array[WorldWaterway] = []
var spots: Array[WorldSpot] = []
var error: String = ""


func ok() -> bool:
	return error == ""


static func decode(bytes: PackedByteArray) -> InfraTile:
	var out := InfraTile.new()
	var r := WorldCodec.ByteReader.new(bytes)
	if r.u32() != MAGIC:
		out.error = "Not an infra file."
		return out
	var fmt := r.u16()
	if fmt != FORMAT:
		out.error = "Infra file format %d, expected %d." % [fmt, FORMAT]
		return out
	out.minor = r.u16()
	out.tile = Vector2i(r.i16(), r.i16())
	var sections := r.u16()
	for s in sections:
		var tag := r.u32()
		var length := r.u32()
		var end := r.at + length
		if r.overrun or end > bytes.size():
			out.error = "Infra file is truncated."
			return out
		match tag:
			DECK:
				out.step = WorldCodecV2._f32(r)
				for k in r.u32():
					var piece := r.u32()
					var n := r.u16()
					var hs := PackedFloat32Array()
					hs.resize(n)
					for j in n:
						hs[j] = r.u16() / 100.0
					out.decks[piece] = hs
			WATR:
				for k in r.u32():
					var w := WorldWaterway.new()
					w.id = int(r.f64())
					r.u8()
					WorldCodecV2._u64(r)
					var kind := r.u8()
					w.kind = WATERWAY_KINDS[kind] if kind < WATERWAY_KINDS.size() else &"stream"
					var flags := r.u8()
					w.tunnel = (flags & 1) != 0
					w.intermittent = (flags & 2) != 0
					w.width = r.u16() / 100.0
					var name_len := r.u8()
					if r.at + name_len <= bytes.size():
						w.name = bytes.slice(r.at, r.at + name_len).get_string_from_utf8()
					r.at += name_len
					w.points = _line(r)
					out.waterways.append(w)
			SPOT:
				for k in r.u32():
					var sp := WorldSpot.new()
					var kind := r.u8()
					sp.kind = SPOT_KINDS[kind] if kind < SPOT_KINDS.size() else &"unmarked"
					sp.mapped = (r.u8() & 1) != 0
					sp.position = Vector2(r.i32() / WorldCodecV2.Q, r.i32() / WorldCodecV2.Q)
					sp.yaw = r.i16() / 10000.0
					sp.width = r.u16() / 100.0
					sp.road_id = int(r.f64())
					out.spots.append(sp)
		if r.overrun:
			out.error = "Infra file is truncated."
			return out
		# Unknown sections are skipped; known ones must end where they say.
		r.at = end
	if r.at != bytes.size():
		out.error = "Trailing bytes in the infra file."
	return out


static func _line(r: WorldCodec.ByteReader) -> PackedVector2Array:
	var n := r.u16()
	var x := r.i32()
	var z := r.i32()
	var pts := PackedVector2Array()
	pts.resize(n)
	if n > 0:
		pts[0] = Vector2(x / WorldCodecV2.Q, z / WorldCodecV2.Q)
	for k in range(1, n):
		x += r.i16()
		z += r.i16()
		pts[k] = Vector2(x / WorldCodecV2.Q, z / WorldCodecV2.Q)
	return pts
