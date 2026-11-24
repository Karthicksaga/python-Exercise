class_name AreaPalettes
extends RefCounted
## The colours, roof types and storey counts the renderer chooses from where OpenStreetMap maps
## none (G-190). ONE data file, `data/areas/palettes.json`: {"<area_id>": {walls, roofs,
## roof_types, storeys}, "default": {...}}. The area is the nearest district (`DistrictIndex`)
## slugged to lower case a-z0-9_; with no entry the "default" (today's Chennai palette) is used.
## This class is the only reader of the file. Everything it returns is **estimated**; a mapped
## OSM tag (building:colour, roof:colour, roof:shape, height) always wins over it.

const PATH := "res://data/areas/palettes.json"

class Palette:
	extends RefCounted
	var id: String = "default"
	var walls: Array[int] = []
	var roofs: Array[int] = []
	## Roof shape name -> weight (cumulative picks in `roof_shape`).
	var roof_names: Array[StringName] = []
	var roof_weights: PackedFloat32Array = PackedFloat32Array()
	## Storey counts and weights; empty keeps the data's storeys.
	var storey_counts: PackedInt32Array = PackedInt32Array()
	var storey_weights: PackedFloat32Array = PackedFloat32Array()

	func pick_roof(unit: float) -> StringName:
		var total := 0.0
		for w in roof_weights:
			total += w
		var acc := 0.0
		for i in roof_names.size():
			acc += roof_weights[i] / maxf(total, 0.0001)
			if unit < acc:
				return roof_names[i]
		return &"flat"

	func pick_storeys(unit: float) -> int:
		var total := 0.0
		for w in storey_weights:
			total += w
		var acc := 0.0
		for i in storey_counts.size():
			acc += storey_weights[i] / maxf(total, 0.0001)
			if unit < acc:
				return storey_counts[i]
		return storey_counts[storey_counts.size() - 1] if not storey_counts.is_empty() else 0

var areas: Dictionary[String, Palette] = {}
var default: Palette = Palette.new()
var _districts: DistrictIndex = null
var _mutex := Mutex.new()


static func slug(name: String) -> String:
	var out := ""
	for ch in name.to_lower():
		out += ch if (ch >= "a" and ch <= "z") or (ch >= "0" and ch <= "9") else "_"
	while out.contains("__"):
		out = out.replace("__", "_")
	return out.trim_prefix("_").trim_suffix("_")


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
	for k: String in d:
		if k.begins_with("_") or typeof(d[k]) != TYPE_DICTIONARY:
			continue
		var p := _parse(k, d[k], out.default)
		if k == "default":
			out.default = p
		else:
			out.areas[k] = p
	return out


## The palette of the area a point is in (the default when no entry matches).
func at(point: Vector2) -> Palette:
	if areas.is_empty() or _districts == null:
		return default
	var district := _districts.at(point.x, point.y)
	if district.is_empty():
		return default
	return areas.get(slug(str(district.get("name", ""))), default)


func set_districts(index: DistrictIndex) -> void:
	_districts = index


static func _hex_list(v: Variant, fallback: Array[int]) -> Array[int]:
	var out: Array[int] = []
	if v is Array:
		for s: Variant in v:
			var c := Color.html(str(s))
			out.append((c.r8 << 16) | (c.g8 << 8) | c.b8)
	return out if not out.is_empty() else fallback


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
			p.storey_counts.append(int(k))
			p.storey_weights.append(float(st[k]))
	return p


static func _fallback() -> Palette:
	var p := Palette.new()
	p.walls = [0xF2E3C6, 0xE8C9A0, 0xCFE3D4, 0xF4D6CF, 0xD9E2F0, 0xF7EDB5, 0xE3D5EE, 0xFBF3E4, 0xC9DCCB, 0xEAD9C4, 0xDFE7D2, 0xF1DDB8]
	p.roofs = [0x9A9690, 0xA8A39B, 0x8C8883, 0xB0553A, 0xC4704A]
	p.roof_names = [&"flat", &"hipped", &"gabled", &"pyramidal"]
	p.roof_weights = PackedFloat32Array([0.66, 0.3, 0.03, 0.01])
	return p


## The district points of the whole world as the `DistrictIndex` wants them.
static func districts_of(world: WorldSource) -> Array:
	var out: Array = []
	var regional := world as RegionalWorldSource
	if regional != null:
		for t: Vector2i in regional.tiles:
			for d in regional.tiles[t].districts:
				out.append({"name": d.name, "kind": d.kind, "x": d.position.x, "z": d.position.y})
	else:
		var index := world.index_at(world.get_bounds().get_center())
		if index != null:
			for d in index.districts:
				out.append({"name": d.name, "kind": d.kind, "x": d.position.x, "z": d.position.y})
	return out
