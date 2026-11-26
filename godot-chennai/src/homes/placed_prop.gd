class_name PlacedProp
extends RefCounted
## One piece standing, hanging or leaning in a home: which prop (`k`), its cell (`x`, `z`; for a
## wall piece the first slot along its wall), its quarter-turns (`r`, floor pieces only) and its
## wall (`wall`: "b" the back wall along x, "l" the left wall along z, "" for floor and ceiling).

var k: String = ""
var x: int = 0
var z: int = 0
var r: int = 0
var wall: String = ""


static func make(k_: String, x_: int, z_: int, r_: int = 0, wall_: String = "") -> PlacedProp:
	var p := PlacedProp.new()
	p.k = k_
	p.x = x_
	p.z = z_
	p.r = r_
	p.wall = wall_
	return p


func to_dict() -> Dictionary:
	var d := {"k": k, "x": x, "z": z, "r": r}
	if wall != "":
		d["wall"] = wall
	return d


static func from_dict(v: Variant) -> PlacedProp:
	if not (v is Dictionary):
		return null
	var d: Dictionary = v
	if not (d.get("k") is String):
		return null
	var wall_value: Variant = d.get("wall", "")
	var w: String = str(wall_value) if wall_value is String else ""
	return PlacedProp.make(str(d["k"]), HomeJson.int_of(d, "x"), HomeJson.int_of(d, "z"), posmod(HomeJson.int_of(d, "r"), 4), w if (w == "b" or w == "l") else "")
