class_name HomeJson
extends RefCounted
## Reads the homes' data files (`data/homes/*.json`): a missing or damaged file gives {} and an
## error text, never a crash. Pure, safe on any thread.


## The file's top-level object, or {} (and `error` says why).
static func read(path: String) -> Dictionary:
	var text := FileAccess.get_file_as_string(path)
	if text == "":
		return {}
	var json := JSON.new()
	if json.parse(text) != OK or not (json.data is Dictionary):
		return {}
	return json.data


static func array_of(d: Dictionary, key: String) -> Array:
	var v: Variant = d.get(key)
	return v if v is Array else []


static func dict_of(d: Dictionary, key: String) -> Dictionary:
	var v: Variant = d.get(key)
	return v if v is Dictionary else {}


static func text_of(d: Dictionary, key: String, fallback: String = "") -> String:
	var v: Variant = d.get(key)
	return v if v is String else fallback


static func int_of(d: Dictionary, key: String, fallback: int = 0) -> int:
	var v: Variant = d.get(key)
	return int(v) if (v is int or v is float) else fallback


static func float_of(d: Dictionary, key: String, fallback: float = 0.0) -> float:
	var v: Variant = d.get(key)
	return float(v) if (v is int or v is float) else fallback
