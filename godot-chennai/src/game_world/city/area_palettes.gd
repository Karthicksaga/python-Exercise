class_name AreaPalettes
extends RefCounted
## The colours, roof types and storey counts the renderer chooses from where OpenStreetMap maps
## none (G-190, G-194). ONE data file, `data/areas/palettes.json` (format 1, derived from
## `areas.json` by `chennai_geo.area_palettes`, never edited by hand): `default` and `areas`,
## each {walls, roofs, roof_types {shape: weight}, storeys {bin: weight}, boundary}. A boundary is
## a circle {centre_xz, radius_m} or a corridor {spine_xz[], half_width_m}, in world metres.
## The area of a point is the one whose boundary contains it with the smallest distance / radius
## (or distance / half width); no area contains it: `default`. This class is the only reader.
## Everything it returns is **estimated**; a mapped OSM tag (building:colour, roof:colour,
## roof:shape, height) always wins, and the `default` palette changes nothing of today's look.

const PATH := "res://data/areas/palettes.json"


class Palette:
	extends RefCounted
	var id: String = "default"
	var walls: Array[int] = []
	var roofs: Array[int] = []
	var roof_names: Array[StringName] = []
	var roof_weights: PackedFloat32Array = PackedFloat32Array()
	## Storey bins ("1", "2", "3", "4-5", "6-9", "10+") as lowest and highest count, and weights.
	var storey_lo: PackedInt32Array = PackedInt32Array()
	var storey_hi: PackedInt32Array = PackedInt32Array()
	var storey_weights: PackedFloat32Array = PackedFloat32Array()
	## Boundary: "circle" (centre, radius) or "corridor" (spine, half width); "" for the default.
	var shape: String = ""
	var centre: Vector2 = Vector2.ZERO
	var size: float = 0.0
	var spine: PackedVector2Array = PackedVector2Array()

	func has_storeys() -> bool:
		return not storey_lo.is_empty()

	func pick_roof(unit: float) -> StringName:
		var total := 0.0
		for w in roof_weights:
			total += w
		var acc := 0.0
		for i in roof_names.size():
			acc += roof_weights[i] / maxf(total, 0.0001)
			if unit < acc:
				return roof_names[i]
		return roof_names[roof_names.size() - 1] if not roof_names.is_empty() else &"flat"

	## A storey count: the bin by weight from `unit`, then a count inside the bin.
	func pick_storeys(unit: float) -> int:
		var total := 0.0
		for w in storey_weights:
			total += w
		var acc := 0.0
		var bin := storey_lo.size() - 1
		var lo_edge := 0.0
		for i in storey_lo.size():
			var share := storey_weights[i] / maxf(total, 0.0001)
			if unit < acc + share:
				bin = i
				lo_edge = acc
				break
			acc += share
		var span := storey_hi[bin] - storey_lo[bin] + 1
		var inner := clampf((unit - lo_edge) / maxf(storey_weights[bin] / maxf(total, 0.0001), 0.0001), 0.0, 0.9999)
		return storey_lo[bin] + int(inner * span)

	## How far inside the boundary a point is: 0 at the centre or spine, 1 at the edge, above 1 outside.
	func depth(p: Vector2) -> float:
		if shape == "circle":
			return p.distance_to(centre) / maxf(size, 1.0)
		if shape == "corridor":
			var best := INF
			for i in spine.size() - 1:
				best = minf(best, Geometry2D.get_closest_point_to_segment(p, spine[i], spine[i + 1]).distance_to(p))
			if spine.size() == 1:
				best = p.distance_to(spine[0])
			return best / maxf(size, 1.0)
		return INF


var areas: Array[Palette] = []
var default: Palette = Palette.new()


static func load_file(path: String = PATH) -> AreaPalettes:
	var out := AreaPalettes.new()
	out.default = _fallback()
	if not FileAccess.file_exists(path):
		return out
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		push_warning("%s: %s" % [path, json.get_error_message()])
		return out
	var d: Dictionary = json.data
	if d.get("default") is Dictionary:
		out.default = _parse("default", d["default"], out.default)
	var list: Variant = d.get("areas")
	if list is Dictionary:
		for id: String in list:
			if typeof(list[id]) == TYPE_DICTIONARY:
				var p := _parse(id, list[id], out.default)
				if p.shape != "":
					out.areas.append(p)
	return out


## The palette of the area a point is in (the default when no boundary contains it).
func at(point: Vector2) -> Palette:
	var best := default
	var best_depth := 1.0
	for a in areas:
		var depth := a.depth(point)
		if depth <= best_depth:
			best_depth = depth
			best = a
	return best


static func _hex_list(v: Variant, fallback: Array[int]) -> Array[int]:
	var out: Array[int] = []
	if v is Array:
		for s: Variant in v:
			var c := Color.html(str(s))
			out.append((c.r8 << 16) | (c.g8 << 8) | c.b8)
	return out if not out.is_empty() else fallback


static func _xz(v: Variant) -> Vector2:
	var a: Array = v if v is Array else [0, 0]
	return Vector2(float(a[0]), float(a[1]))


## "4-5" -> (4, 5), "10+" -> (10, 12), "3" -> (3, 3).
static func _bin(name: String) -> Vector2i:
	if name.ends_with("+"):
		var lo := int(name.trim_suffix("+"))
		return Vector2i(lo, lo + 2)
	if name.contains("-"):
		var parts := name.split("-")
		return Vector2i(int(parts[0]), int(parts[1]))
	return Vector2i(int(name), int(name))


static func _parse(id: String, d: Dictionary, base: Palette) -> Palette:
	var p := Palette.new()
	p.id = id
	p.walls = _hex_list(d.get("walls"), base.walls)
	p.roofs = _hex_list(d.get("roofs"), base.roofs)
	var rt: Variant = d.get("roof_types")
	if rt is Dictionary:
		for k: String in rt:
			p.roof_names.append(StringName(k))
			p.roof_weights.append(float(rt[k]))
	if p.roof_names.is_empty():
		p.roof_names = base.roof_names
		p.roof_weights = base.roof_weights
	var st: Variant = d.get("storeys")
	if st is Dictionary:
		for k: String in st:
			var r := _bin(k)
			p.storey_lo.append(r.x)
			p.storey_hi.append(r.y)
			p.storey_weights.append(float(st[k]))
	var bv: Variant = d.get("boundary")
	if bv is Dictionary:
		var b: Dictionary = bv
		p.shape = str(b.get("type", ""))
		if p.shape == "circle":
			p.centre = _xz(b.get("centre_xz"))
			p.size = float(b.get("radius_m", 0.0))
		elif p.shape == "corridor":
			for pt: Variant in b.get("spine_xz", []):
				p.spine.append(_xz(pt))
			p.size = float(b.get("half_width_m", 0.0))
			if p.spine.is_empty() or p.size <= 0.0:
				p.shape = ""
		else:
			p.shape = ""
	return p


static func _fallback() -> Palette:
	var p := Palette.new()
	p.walls = [0xF2E3C6, 0xE8C9A0, 0xCFE3D4, 0xF4D6CF, 0xD9E2F0, 0xF7EDB5, 0xE3D5EE, 0xFBF3E4, 0xC9DCCB, 0xEAD9C4, 0xDFE7D2, 0xF1DDB8]
	p.roofs = [0x9A9690, 0xA8A39B, 0x8C8883, 0xB0553A, 0xC4704A]
	p.roof_names = [&"flat", &"hipped", &"gabled", &"pyramidal"]
	p.roof_weights = PackedFloat32Array([0.66, 0.3, 0.03, 0.01])
	return p
