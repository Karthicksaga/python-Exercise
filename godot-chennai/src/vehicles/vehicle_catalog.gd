class_name VehicleCatalog
extends RefCounted
## The vehicle kinds and variants (decision G-72), read once from `data/vehicle_types.json`,
## and the per-model manifests in `res://assets/vehicles/<model>.vehicle.json` (decision G-73).
##
## A *kind* is a handling profile (car, auto, bike, ambulance, bus, saloon, suv, coupe, race); a
## *variant* is what spawns (taxi, police, gang are the car kind with their own paint and extras).

const TYPES_PATH := "res://src/vehicles/data/vehicle_types.json"
const MODELS_DIR := "res://assets/vehicles"


## One spawnable vehicle: a kind plus its paint and extras.
class VariantInfo:
	extends RefCounted
	var id: StringName = &""
	var type: VehicleType
	var label: String = ""
	var paint: Color = Color.WHITE
	var siren: bool = false
	var light_bar: bool = false
	var roof_sign: bool = false


static var _types: Dictionary = {}
static var _variants: Dictionary = {}
static var _manifests: Dictionary = {}


static func _load() -> void:
	if not _types.is_empty():
		return
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(TYPES_PATH))
	var kinds: Dictionary = data["kinds"]
	for k: String in kinds:
		_types[StringName(k)] = VehicleType.from_dict(StringName(k), kinds[k])
	var variants: Dictionary = data["variants"]
	for id: String in variants:
		var d: Dictionary = variants[id]
		var v := VariantInfo.new()
		v.id = StringName(id)
		v.type = _types[StringName(String(d["kind"]))]
		v.label = String(d.get("label", v.type.label))
		v.paint = Color(String(d["paint"]))
		v.siren = bool(d.get("siren", v.type.siren))
		v.light_bar = bool(d.get("light_bar", false))
		v.roof_sign = bool(d.get("roof_sign", false))
		_variants[v.id] = v


static func kinds() -> Array[StringName]:
	_load()
	var out: Array[StringName] = []
	for k: StringName in _types:
		out.append(k)
	return out


static func type(kind: StringName) -> VehicleType:
	_load()
	return _types[kind]


static func variant_ids() -> Array[StringName]:
	_load()
	var out: Array[StringName] = []
	for k: StringName in _variants:
		out.append(k)
	return out


static func variant(id: StringName) -> VariantInfo:
	_load()
	return _variants[id]


## The model manifest for a type: its own model's when the GLB exists, else the fallback's
## (premium and race cars until the Models agent's GLBs land). Empty when neither exists.
static func manifest_for(t: VehicleType) -> Dictionary:
	for id: String in [t.model, t.fallback_model]:
		if id == "":
			continue
		var m := manifest(id)
		if not m.is_empty() and ResourceLoader.exists(MODELS_DIR.path_join(String(m["glb"]))):
			return m
	return {}


static func manifest(model_id: String) -> Dictionary:
	if _manifests.has(model_id):
		return _manifests[model_id]
	var path := MODELS_DIR.path_join(model_id + ".vehicle.json")
	var m: Dictionary = {}
	if FileAccess.file_exists(path):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if parsed is Dictionary:
			m = parsed
	_manifests[model_id] = m
	return m
