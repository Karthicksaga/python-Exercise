## Base for the rules tests: assertion helpers that count passes and failures (never a bare
## `assert()`, which would stop the run before `quit()`). Each test method returns `true` on its
## last line, so one that dies half way is counted as a failure by the runner.
extends RefCounted

var passed := 0
var failed := 0
var failures: Array[String] = []
var current := ""


func fail(label: String, detail: String) -> void:
	failed += 1
	failures.append("%s: %s: %s" % [current, label, detail])


func ok(cond: bool, label: String = "") -> void:
	if cond:
		passed += 1
	else:
		fail(label, "expected true")


func no(cond: bool, label: String = "") -> void:
	ok(not cond, label)


## Deep equality that treats ints and floats as numbers (JSON numbers are floats in Godot).
static func same(a: Variant, b: Variant) -> bool:
	var na := typeof(a) == TYPE_INT or typeof(a) == TYPE_FLOAT
	var nb := typeof(b) == TYPE_INT or typeof(b) == TYPE_FLOAT
	if na and nb:
		return float(a) == float(b)
	if a is Array and b is Array:
		var aa: Array = a
		var ba: Array = b
		if aa.size() != ba.size():
			return false
		for i in aa.size():
			if not same(aa[i], ba[i]):
				return false
		return true
	if a is Dictionary and b is Dictionary:
		var da: Dictionary = a
		var db: Dictionary = b
		if da.size() != db.size():
			return false
		for k: Variant in da:
			if not db.has(k) or not same(da[k], db[k]):
				return false
		return true
	if (a is String or a is StringName) and (b is String or b is StringName):
		return str(a) == str(b)
	if typeof(a) != typeof(b):
		return false
	return a == b


## `toMatchObject`: every key of `subset` is in `actual` with the same value (recursively).
static func matches(actual: Variant, subset: Variant) -> bool:
	if subset is Dictionary and actual is Dictionary:
		for k: Variant in subset:
			if not (actual as Dictionary).has(k) or not matches(actual[k], subset[k]):
				return false
		return true
	if subset is Array and actual is Array:
		if (subset as Array).size() != (actual as Array).size():
			return false
		for i in (subset as Array).size():
			if not matches(actual[i], subset[i]):
				return false
		return true
	return same(actual, subset)


func eq(actual: Variant, expected: Variant, label: String = "") -> void:
	if same(actual, expected):
		passed += 1
	else:
		fail(label, "expected %s, got %s" % [var_to_str(expected), var_to_str(actual)])


func match_obj(actual: Variant, subset: Variant, label: String = "") -> void:
	if matches(actual, subset):
		passed += 1
	else:
		fail(label, "expected to match %s, got %s" % [var_to_str(subset), var_to_str(actual)])


## `toBeCloseTo(expected, digits)`: |actual - expected| < 10^-digits / 2.
func near(actual: float, expected: float, digits: int = 2, label: String = "") -> void:
	if absf(actual - expected) < pow(10.0, -digits) / 2.0:
		passed += 1
	else:
		fail(label, "expected about %s, got %s" % [expected, actual])


func gt(actual: float, than: float, label: String = "") -> void:
	if actual > than:
		passed += 1
	else:
		fail(label, "expected > %s, got %s" % [than, actual])


func ge(actual: float, than: float, label: String = "") -> void:
	if actual >= than:
		passed += 1
	else:
		fail(label, "expected >= %s, got %s" % [than, actual])


func lt(actual: float, than: float, label: String = "") -> void:
	if actual < than:
		passed += 1
	else:
		fail(label, "expected < %s, got %s" % [than, actual])


func le(actual: float, than: float, label: String = "") -> void:
	if actual <= than:
		passed += 1
	else:
		fail(label, "expected <= %s, got %s" % [than, actual])


func is_nil(v: Variant, label: String = "") -> void:
	if v == null:
		passed += 1
	else:
		fail(label, "expected null, got %s" % var_to_str(v))


func not_nil(v: Variant, label: String = "") -> void:
	if v != null:
		passed += 1
	else:
		fail(label, "expected a value, got null")


## The `type` of each event, as the TS tests' `events.map((e) => e.type)`.
static func types(events: Array) -> Array:
	var out: Array = []
	for e: Dictionary in events:
		out.append(e["type"])
	return out
