class_name CultureData
extends RefCounted
## The data of the culture module (G-480): the heritage journal's stops, the peace zones, the
## temple visit and the swimming rules, read from `assets/culture/culture.json`. Pure data: no
## nodes, no text (every visible word is a `cul.*` key in `assets/i18n`).

const DEFAULT_PATH := "res://assets/culture/culture.json"
## The catalog keys of a stop: `cul.stop.<id>.name` and `cul.stop.<id>.line`.
const KEY_PREFIX := "cul.stop."


## A place the heritage journal lists.
class Stop:
	extends RefCounted
	var id: String = ""
	var kind: StringName = &""
	## World metres (x, z).
	var position: Vector2 = Vector2.ZERO
	## Counts as visited within this many metres.
	var radius: float = 50.0
	## The landmark spec or world landmark this stop comes from ("" for a place of its own).
	var landmark: String = ""
	## Only on foot counts (the temple: you walk in).
	var on_foot: bool = false
	## A longer visit this stop offers (&"temple_visit"), or &"".
	var activity: StringName = &""
	var source: String = ""

	func name_key() -> String:
		return "%s%s.name" % [KEY_PREFIX, id]

	func line_key() -> String:
		return "%s%s.line" % [KEY_PREFIX, id]


## A place where some things are not allowed (a place of worship). `rules` maps a rule name to
## whether it is allowed inside; a rule that is not listed is allowed.
class Zone:
	extends RefCounted
	var id: String = ""
	var stop: String = ""
	var centre: Vector2 = Vector2.ZERO
	var radius: float = 0.0
	## Inside this (smaller) radius nobody gets into a vehicle: it stays outside.
	var walk_radius: float = 0.0
	var rules: Dictionary[String, bool] = {}


## The temple visit's places and numbers.
class Temple:
	extends RefCounted
	var zone: String = ""
	var stand: Vector2 = Vector2.ZERO
	var stand_reach: float = 4.0
	var lamp: Vector2 = Vector2.ZERO
	var lamp_reach: float = 3.0
	var circle_centre: Vector2 = Vector2.ZERO
	var circle_min: float = 10.0
	var circle_max: float = 30.0
	## Share of a full turn that counts as one walk round (the player does not need a perfect circle).
	var circle_turns: float = 0.9
	var clockwise: bool = true
	var barefoot_step_gain: float = 0.5


## The swimming rules (safe by construction: shallow, roped, tiring is never dangerous).
class Swim:
	extends RefCounted
	var kinds: Array[StringName] = []
	var entry_reach: float = 4.5
	## The sea's rope line: metres from the shore the swimmer cannot pass.
	var sea_limit: float = 30.0
	## A swimmer stays this far inside a river's banks.
	var bank_margin: float = 0.45
	var speed: float = 1.7
	var stamina_seconds: float = 75.0
	var recover_seconds: float = 20.0
	## Treading water costs this share of swimming's stamina.
	var idle_drain: float = 0.3
	var tired_drift_speed: float = 1.3
	var sea_surface: float = 0.01
	var river_surface: float = -0.75
	## Circles (x, z, radius) where nobody can swim: [Vector3].
	var no_swim: Array[Vector3] = []


var stops: Array[Stop] = []
var zones: Array[Zone] = []
var temple: Temple = null
var swim: Swim = null
var error: String = ""


static func load_file(path: String = DEFAULT_PATH) -> CultureData:
	var data := CultureData.new()
	if not FileAccess.file_exists(path):
		data.error = "%s not found." % path
		return data
	var parsed := parse(FileAccess.get_file_as_string(path))
	if parsed.error != "":
		parsed.error = "%s: %s" % [path, parsed.error]
	return parsed


## The data of a JSON text (tests build small places of their own).
static func parse(text: String) -> CultureData:
	var data := CultureData.new()
	var json := JSON.new()
	if json.parse(text) != OK or not (json.data is Dictionary):
		data.error = "not valid JSON."
		return data
	return _read(json.data as Dictionary, data)


static func _read(d: Dictionary, out: CultureData) -> CultureData:
	for s: Variant in d.get("stops", []):
		var sd: Dictionary = s
		var stop := Stop.new()
		stop.id = str(sd.get("id", ""))
		stop.kind = StringName(str(sd.get("kind", "")))
		stop.position = _point(sd.get("position", [0, 0]))
		stop.radius = float(sd.get("radius", 50.0))
		stop.landmark = str(sd.get("landmark", ""))
		stop.on_foot = bool(sd.get("on_foot", false))
		stop.activity = StringName(str(sd.get("activity", "")))
		stop.source = str(sd.get("source", ""))
		out.stops.append(stop)
	for z: Variant in d.get("peace_zones", []):
		var zd: Dictionary = z
		var zone := Zone.new()
		zone.id = str(zd.get("id", ""))
		zone.stop = str(zd.get("stop", ""))
		zone.centre = _point(zd.get("centre", [0, 0]))
		zone.radius = float(zd.get("radius", 0.0))
		zone.walk_radius = float(zd.get("walk_radius", 0.0))
		var rules: Dictionary = zd.get("rules", {})
		for rule: Variant in rules:
			zone.rules[str(rule)] = bool(rules[rule])
		out.zones.append(zone)
	var t: Variant = d.get("temple_visit")
	if t is Dictionary:
		var td: Dictionary = t
		var temple := Temple.new()
		temple.zone = str(td.get("zone", ""))
		temple.stand = _point(td.get("stand", [0, 0]))
		temple.stand_reach = float(td.get("stand_reach", 4.0))
		temple.lamp = _point(td.get("lamp", [0, 0]))
		temple.lamp_reach = float(td.get("lamp_reach", 3.0))
		var c: Dictionary = td.get("circle", {})
		temple.circle_centre = _point(c.get("centre", [0, 0]))
		temple.circle_min = float(c.get("r_min", 10.0))
		temple.circle_max = float(c.get("r_max", 30.0))
		temple.circle_turns = float(c.get("turns", 0.9))
		temple.clockwise = bool(c.get("clockwise", true))
		temple.barefoot_step_gain = float(td.get("barefoot_step_gain", 0.5))
		out.temple = temple
	var s: Variant = d.get("swim")
	if s is Dictionary:
		var sd2: Dictionary = s
		var swim := Swim.new()
		for k: Variant in sd2.get("kinds", []):
			swim.kinds.append(StringName(str(k)))
		swim.entry_reach = float(sd2.get("entry_reach", 4.5))
		swim.sea_limit = float(sd2.get("sea_limit", 30.0))
		swim.bank_margin = float(sd2.get("bank_margin", 0.45))
		swim.speed = float(sd2.get("speed", 1.7))
		swim.stamina_seconds = float(sd2.get("stamina_seconds", 75.0))
		swim.recover_seconds = float(sd2.get("recover_seconds", 20.0))
		swim.idle_drain = float(sd2.get("idle_drain", 0.3))
		swim.tired_drift_speed = float(sd2.get("tired_drift_speed", 1.3))
		swim.sea_surface = float(sd2.get("sea_surface", 0.01))
		swim.river_surface = float(sd2.get("river_surface", -0.75))
		for n: Variant in sd2.get("no_swim_zones", []):
			var nz: Array = n
			swim.no_swim.append(Vector3(float(nz[0]), float(nz[1]), float(nz[2])))
		out.swim = swim
	return out


static func _point(v: Variant) -> Vector2:
	var a: Array = v
	return Vector2(float(a[0]), float(a[1]))


func stop(id: String) -> Stop:
	for s in stops:
		if s.id == id:
			return s
	return null


func zone(id: String) -> Zone:
	for z in zones:
		if z.id == id:
			return z
	return null
