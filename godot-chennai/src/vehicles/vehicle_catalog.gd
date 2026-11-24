class_name VehicleCatalog
extends RefCounted
## The vehicle kinds and variants (decision G-72), read once from `data/vehicle_types.json`,
## and the per-model manifests `res://assets/vehicles/<model>.json`, else `legacy/<model>.json`
## (decision G-73,
## `VehicleManifest`): a kind whose own model is there takes its geometry from the manifest.
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
		var t := VehicleType.from_dict(StringName(k), kinds[k])
		var own := manifest(t.model)
		if own != null and _has_glb(own):
			own.apply_geometry(t)
		_types[StringName(k)] = t
	var variants: Dictionary = data["variants"]
	for id: String in variants:
		var d: Dictionary = variants[id]
		var v := VariantInfo.new()
		v.id = StringName(id)
		var kind := StringName(String(d["kind"]))
		v.type = _types[kind]
		if d.has("model"):
			# A variant with a model of its own (the taxi): the kind's handling, that model's geometry.
			var own_type := VehicleType.from_dict(kind, kinds[String(kind)])
			own_type.model = String(d["model"])
			own_type.fallback_model = v.type.model
			var m := manifest(own_type.model)
			if m != null and _has_glb(m):
				m.apply_geometry(own_type)
			v.type = own_type
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


## A copy of a variant with another paint (one vehicle's colour; the catalog's stays).
static func repainted(v: VariantInfo, paint: Color) -> VariantInfo:
	var c := VariantInfo.new()
	c.id = v.id
	c.type = v.type
	c.label = v.label
	c.paint = paint
	c.siren = v.siren
	c.light_bar = v.light_bar
	c.roof_sign = v.roof_sign
	return c


## The model manifest for a type: its own model's when the GLB exists, else the fallback's
## (premium and race cars until the Models agent's GLBs land). Null when neither exists.
static func manifest_for(t: VehicleType) -> VehicleManifest:
	for id: String in [t.model, t.fallback_model]:
		if id == "":
			continue
		var m := manifest(id)
		if m != null and _has_glb(m):
			return m
	return null


static func _has_glb(m: VehicleManifest) -> bool:
	var lods := m.lods()
	return not lods.is_empty() and ResourceLoader.exists(String(lods[0]["file"]))


static func manifest(model_id: String) -> VehicleManifest:
	if not _manifests.has(model_id):
		# A model of its own (Models, Tamil Nadu vehicles) wins over the ported one in `legacy/`.
		var m := VehicleManifest.read(MODELS_DIR.path_join(model_id + ".json"))
		if m == null:
			m = VehicleManifest.read(MODELS_DIR.path_join("legacy").path_join(model_id + ".json"))
		_manifests[model_id] = m
	return _manifests[model_id]
