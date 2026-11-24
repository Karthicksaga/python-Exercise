class_name DetailTile
extends RefCounted
## One tile's `detail.bin` (format 2.2, `docs/world-format.md` §3.8, decisions G-190…): mapped
## building colours, materials and parts, street objects, barriers, zones and sign categories,
## decoded on a worker thread and indexed by 250 m cell so a chunk build finds its share fast.

const MAGIC := 0x44574f43
const FORMAT := 2
const BLDG := 0x47444c42
const PART := 0x54524150
const OBJ := 0x5f4a424f
const LINE := 0x454e494c
const ZONE := 0x454e4f5a
const SIGN := 0x4e474953
const Q := 20.0

const OBJ_KINDS: Array[StringName] = [&"bus_platform", &"bench", &"waste_basket", &"drinking_water", &"post_box", &"toilets", &"street_lamp", &"power_pole", &"power_tower", &"bollard", &"gate"]
const LINE_KINDS: Array[StringName] = [&"wall", &"fence", &"hedge", &"retaining_wall", &"kerb", &"jersey_barrier", &"tree_row", &"platform", &"guard_rail", &"bus_platform"]
const ZONE_KINDS: Array[StringName] = [&"pitch", &"playground", &"swimming_pool", &"track", &"allotments", &"platform", &"bus_platform"]
const SPORTS: Array[StringName] = [&"", &"football", &"cricket", &"basketball", &"tennis", &"volleyball", &"badminton", &"kabaddi", &"athletics", &"hockey", &"other"]
const MATERIALS: Array[StringName] = [&"", &"brick", &"concrete", &"stone", &"plaster", &"glass", &"metal", &"wood", &"other"]
const ROOF_MATERIALS: Array[StringName] = [&"", &"tiles", &"metal", &"concrete", &"glass", &"thatch", &"other"]

## Drawn height (m) of a barrier OSM gives no `height` for (estimated).
const LINE_HEIGHTS: Dictionary[StringName, float] = {&"wall": 1.9, &"fence": 1.5, &"hedge": 1.2, &"retaining_wall": 1.6, &"kerb": 0.15, &"jersey_barrier": 0.8, &"guard_rail": 0.8, &"tree_row": 0.0}

const F_PARTS_HOST := 1
const F_WALL_COLOUR := 2
const F_ROOF_COLOUR := 4
const F_HEIGHT_MAPPED := 8
const SF_PUBLIC_NAME := 4


## Mapped detail of one building (by game id).
class BuildingInfo:
	extends RefCounted
	var id: int = 0
	var flags: int = 0
	var material: StringName = &""
	var roof_material: StringName = &""
	## Sign category id (`SignCategories`), 0 = none.
	var category: int = 0
	var wall: int = 0
	var roof: int = 0

	func has_wall_colour() -> bool:
		return (flags & F_WALL_COLOUR) != 0

	func has_roof_colour() -> bool:
		return (flags & F_ROOF_COLOUR) != 0

	func is_parts_host() -> bool:
		return (flags & F_PARTS_HOST) != 0


class ObjectSpot:
	extends RefCounted
	var kind: StringName = &""
	var position: Vector2 = Vector2.ZERO


class LineFeature:
	extends RefCounted
	var kind: StringName = &""
	## 0 = not mapped (the renderer's estimate is used).
	var height: float = 0.0
	var closed: bool = false
	var points: PackedVector2Array = PackedVector2Array()


class Zone:
	extends RefCounted
	var kind: StringName = &""
	var sport: StringName = &""
	var outline: PackedVector2Array = PackedVector2Array()
	var centre: Vector2 = Vector2.ZERO


class SignSpot:
	extends RefCounted
	var category: int = 0
	var flags: int = 0
	var position: Vector2 = Vector2.ZERO
	## name:ta / name:en of public places only.
	var name_ta: String = ""
	var name_en: String = ""


var tile: Vector2i = Vector2i.ZERO
var minor: int = 0
var buildings: Dictionary[int, BuildingInfo] = {}
## `building:part` polygons as Buildings (id, outline, height, min_height, roof shape, colour).
var parts: Array[Building] = []
var objects: Array[ObjectSpot] = []
var lines: Array[LineFeature] = []
var zones: Array[Zone] = []
var signs: Array[SignSpot] = []
var error: String = ""
## Cell -> indices into the lists above.
var _objects_by_cell: Dictionary[Vector2i, PackedInt32Array] = {}
var _lines_by_cell: Dictionary[Vector2i, PackedInt32Array] = {}
var _zones_by_cell: Dictionary[Vector2i, PackedInt32Array] = {}
var _signs_by_cell: Dictionary[Vector2i, PackedInt32Array] = {}
var _parts_by_cell: Dictionary[Vector2i, PackedInt32Array] = {}
var _origin: Vector2 = Vector2.ZERO
var _size: float = 250.0


func ok() -> bool:
	return error == ""


func cell_of(p: Vector2) -> Vector2i:
	return Vector2i(floori((p.x - _origin.x) / _size), floori((p.y - _origin.y) / _size))


static func _add(map: Dictionary[Vector2i, PackedInt32Array], cell: Vector2i, i: int) -> void:
	var list: PackedInt32Array = map.get(cell, PackedInt32Array())
	list.append(i)
	map[cell] = list


func objects_in(cell: Vector2i) -> Array[ObjectSpot]:
	var out: Array[ObjectSpot] = []
	for i: int in _objects_by_cell.get(cell, PackedInt32Array()):
		out.append(objects[i])
	return out


func lines_in(cell: Vector2i) -> Array[LineFeature]:
	var out: Array[LineFeature] = []
	for i: int in _lines_by_cell.get(cell, PackedInt32Array()):
		out.append(lines[i])
	return out


func zones_in(cell: Vector2i) -> Array[Zone]:
	var out: Array[Zone] = []
	for i: int in _zones_by_cell.get(cell, PackedInt32Array()):
		out.append(zones[i])
	return out


func signs_in(cell: Vector2i) -> Array[SignSpot]:
	var out: Array[SignSpot] = []
	for i: int in _signs_by_cell.get(cell, PackedInt32Array()):
		out.append(signs[i])
	return out


func parts_in(cell: Vector2i) -> Array[Building]:
	var out: Array[Building] = []
	for i: int in _parts_by_cell.get(cell, PackedInt32Array()):
		out.append(parts[i])
	return out


static func decode(bytes: PackedByteArray, origin: Vector2 = Vector2.ZERO, size: float = 250.0) -> DetailTile:
	var out := DetailTile.new()
	out._origin = origin
	out._size = size
	var r := WorldCodec.ByteReader.new(bytes)
	if r.u32() != MAGIC:
		out.error = "Not a detail file."
		return out
	var fmt := r.u16()
	if fmt != FORMAT:
		out.error = "Detail file format %d, expected %d." % [fmt, FORMAT]
		return out
	out.minor = r.u16()
	out.tile = Vector2i(r.i16(), r.i16())
	var sections := r.u16()
	for s in sections:
		var tag := r.u32()
		var length := r.u32()
		var end := r.at + length
		if r.overrun or end > bytes.size():
			out.error = "Detail file is truncated."
			return out
		match tag:
			BLDG:
				for k in r.u32():
					var b := BuildingInfo.new()
					b.id = r.u32()
					b.flags = r.u8()
					b.material = MATERIALS[mini(r.u8(), MATERIALS.size() - 1)]
					b.roof_material = ROOF_MATERIALS[mini(r.u8(), ROOF_MATERIALS.size() - 1)]
					b.category = r.u8()
					b.wall = _rgb(r)
					b.roof = _rgb(r)
					out.buildings[b.id] = b
			PART:
				for k in r.u32():
					var part := _part(r)
					_add(out._parts_by_cell, out.cell_of(_mean(part.outline)), out.parts.size())
					out.parts.append(part)
			OBJ:
				for k in r.u32():
					var o := ObjectSpot.new()
					var kind := r.u8()
					o.kind = OBJ_KINDS[mini(kind, OBJ_KINDS.size() - 1)]
					r.u8()
					o.position = Vector2(r.i32() / Q, r.i32() / Q)
					_add(out._objects_by_cell, out.cell_of(o.position), out.objects.size())
					out.objects.append(o)
			LINE:
				for k in r.u32():
					var li := LineFeature.new()
					li.kind = LINE_KINDS[mini(r.u8(), LINE_KINDS.size() - 1)]
					li.closed = (r.u8() & 2) != 0
					li.height = r.u16() / 100.0
					li.points = InfraTile._line(r)
					var seen := {}
					for p in li.points:
						var c := out.cell_of(p)
						if not seen.has(c):
							seen[c] = true
							_add(out._lines_by_cell, c, out.lines.size())
					out.lines.append(li)
			ZONE:
				for k in r.u32():
					var z := Zone.new()
					z.kind = ZONE_KINDS[mini(r.u8(), ZONE_KINDS.size() - 1)]
					z.sport = SPORTS[mini(r.u8(), SPORTS.size() - 1)]
					r.u8()
					WorldCodecV2._u64(r)
					z.outline = InfraTile._line(r)
					z.centre = _mean(z.outline)
					_add(out._zones_by_cell, out.cell_of(z.centre), out.zones.size())
					out.zones.append(z)
			SIGN:
				for k in r.u32():
					var sg := SignSpot.new()
					sg.category = r.u8()
					sg.flags = r.u8()
					sg.position = Vector2(r.i32() / Q, r.i32() / Q)
					if (sg.flags & SF_PUBLIC_NAME) != 0:
						sg.name_ta = _str(r, bytes)
						sg.name_en = _str(r, bytes)
					_add(out._signs_by_cell, out.cell_of(sg.position), out.signs.size())
					out.signs.append(sg)
		if r.overrun:
			out.error = "Detail file is truncated."
			return out
		r.at = end
	if r.at != bytes.size():
		out.error = "Trailing bytes in the detail file."
	return out


static func _rgb(r: WorldCodec.ByteReader) -> int:
	return (r.u8() << 16) | (r.u8() << 8) | r.u8()


static func _str(r: WorldCodec.ByteReader, bytes: PackedByteArray) -> String:
	var n := r.u8()
	var s := ""
	if r.at + n <= bytes.size():
		s = bytes.slice(r.at, r.at + n).get_string_from_utf8()
	r.at += n
	return s


static func _mean(pts: PackedVector2Array) -> Vector2:
	var c := Vector2.ZERO
	for p in pts:
		c += p
	return c / maxi(1, pts.size())


static func _part(r: WorldCodec.ByteReader) -> Building:
	var b := Building.new()
	b.id = r.u32()
	b.dataset = r.u8()
	b.source_id = WorldCodecV2._u64(r)
	var flags := r.u8()
	b.height = r.u16() / 10.0
	b.min_height = r.u16() / 10.0
	b.floors = r.u8()
	var shape := r.u8()
	b.roof_shape = WorldCodecV2.ROOF_SHAPES[mini(shape, WorldCodecV2.ROOF_SHAPES.size() - 1)]
	r.u8()
	var material := r.u8()
	var roof_material := r.u8()
	var wall := _rgb(r)
	var roof := _rgb(r)
	var rings := r.u8()
	b.outline = InfraTile._line(r)
	for k in range(1, rings):
		b.holes.append(InfraTile._line(r))
	b.height_from = &"height" if (flags & F_HEIGHT_MAPPED) != 0 else &"estimated"
	b.kind = &"apartments" if b.floors >= 3 else &"house"
	b.use = &"other"
	b.wall_mapped = (flags & F_WALL_COLOUR) != 0
	b.color_hex = wall if b.wall_mapped else 0
	b.detail_roof = roof if (flags & F_ROOF_COLOUR) != 0 else -1
	b.detail_material = MATERIALS[mini(material, MATERIALS.size() - 1)]
	b.detail_roof_material = ROOF_MATERIALS[mini(roof_material, ROOF_MATERIALS.size() - 1)]
	b.is_part = true
	return b
