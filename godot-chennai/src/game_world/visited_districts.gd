## Names of the districts visited, in the order first visited (port of `VisitedDistricts`).
## Saved as a JSON array (`cow-districts-v1`).
class_name VisitedDistricts
extends RefCounted

var _names: Array[String] = []


func _init(saved: Variant = []) -> void:
	if saved is Array:
		for n: Variant in saved:
			if n is String and not _names.has(n):
				_names.append(n)


## Record a visit; true when the district is new.
func visit(district_name: String) -> bool:
	if _names.has(district_name):
		return false
	_names.append(district_name)
	return true


func count() -> int:
	return _names.size()


func list() -> Array[String]:
	return _names


func clear() -> void:
	_names.clear()


## "Anna Nagar, T. Nagar and 3 more"
func summary(max_names: int = 4) -> String:
	var n := _names.size()
	if n == 0:
		return ""
	if n <= max_names:
		if n == 1:
			return _names[0]
		return "%s and %s" % [", ".join(_names.slice(0, n - 1)), _names[n - 1]]
	return "%s and %d more" % [", ".join(_names.slice(0, max_names)), n - max_names]
