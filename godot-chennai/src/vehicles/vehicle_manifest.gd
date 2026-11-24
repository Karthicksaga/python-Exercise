class_name VehicleManifest
extends RefCounted
## A vehicle model's manifest, `assets/vehicles/<name>.json` beside its GLBs, in the schema the
## Models agent defined (decision G-73; `docs/vehicles.md` "The manifest"): LOD files, wheel and
## door nodes, seats, pose, entry, collision boxes, paints and the proposed `physics`. Frame:
## metres, +Y up, front -Z, +X right, ground at y = 0, origin between the axles.
##
## The game reads the model's geometry from here (wheels, chassis box, ride height, seat, entry,
## pose), so a new GLB with its manifest drops in without code changes; the handling scalars
## (engine, top speed, brakes, drift, grip, mass) stay in `vehicle_types.json`, where the tests
## hold them to the Three.js game (G-71, G-72).

## Material names that take the paint colour in the GLBs ported from the Three.js game.
const LEGACY_PAINT: Array[String] = ["v_paint_body", "auto_paint"]
const LEGACY_BEACONS := {"red": ["v_beaconred"], "blue": ["v_beaconblue"]}

var id: String = ""
## The folder of the manifest: LOD files are relative to it.
var dir: String = ""
var data: Dictionary = {}


static func read(path: String) -> VehicleManifest:
	if not FileAccess.file_exists(path):
		return null
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if not parsed is Dictionary:
		return null
	var m := VehicleManifest.new()
	m.id = path.get_file().get_basename()
	m.dir = path.get_base_dir()
	m.data = parsed
	return m


## The LOD files, nearest first: [{file (res:// path), min, max}] (metres; max -1 for no limit).
func lods() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for l: Dictionary in data.get("lods", []):
		out.append({"file": dir.path_join(String(l["file"])), "min": float(l.get("min_distance_m", 0.0)), "max": float(l.get("max_distance_m", -1.0))})
	return out


## Height of the chassis centre above the model's ground (the physics frame's origin).
func chassis_height() -> float:
	if data.has("chassis_to_model_y"):
		return float(data["chassis_to_model_y"])
	return float((data.get("physics", {}) as Dictionary).get("rideHeight", 0.7))


## The model's main collision box half-extents (the body the GLB was made for).
func half_extents() -> Vector3:
	var p: Dictionary = data.get("physics", {})
	if p.has("halfExtents"):
		return _v3(p["halfExtents"])
	var boxes: Array = data.get("collision", [])
	return _v3((boxes[0] as Dictionary)["half_extents"]) if not boxes.is_empty() else Vector3(0.8, 0.4, 2.0)


## Collision boxes in the chassis frame: [{centre: Vector3, half: Vector3}].
func boxes() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var y0 := chassis_height()
	for b: Dictionary in data.get("collision", []):
		if String(b.get("shape", "box")) == "box":
			out.append({"centre": _v3(b["centre"]) - Vector3(0, y0, 0), "half": _v3(b["half_extents"])})
	return out


## Material names that take the variant's paint.
func paint_materials() -> Array[String]:
	if data.has("paint_surface") or data.has("paints"):
		var out: Array[String] = ["paint"]
		return out
	return LEGACY_PAINT


## Siren beacon materials by colour (the ported ambulance), else empty.
func beacons() -> Dictionary:
	return LEGACY_BEACONS if bool(data.get("siren", false)) else {}


## Roof height above the ground (for a light bar or roof sign).
func roof() -> float:
	var s: Dictionary = data.get("body_size_m", data.get("size_m", {}))
	return float(s.get("height", 1.5)) * 0.93


## Wheel nodes: [{node, centre (model frame), radius}].
func wheels() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for w: Dictionary in data.get("wheels", []):
		out.append({"node": String(w["node"]), "centre": _v3(w["centre"]), "radius": float(w["radius"])})
	return out


## Door nodes with their leaf (0 the driver's, then passengers' in order) and full opening angle.
## Double doors (the ambulance's rear pair: the same hinge line, opposite sides) and folding
## leaves (the bus) swing together as one leaf.
func doors() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var leaf := -1
	var prev: Dictionary = {}
	for d: Dictionary in data.get("doors", []):
		if not d.has("node") or d["node"] == null:
			continue
		var hinge := _v3(d.get("hinge", [0, 0, 0]))
		var folding := String(d.get("notes", "") if d.get("notes") != null else "").contains("folding")
		# A pair at the very front or back (rear doors), on one hinge line, opposite sides.
		var at_end := absf(hinge.z) > half_extents().z - 0.4
		var pair := at_end and not prev.is_empty() and absf(hinge.z - (prev["hinge"] as Vector3).z) < 0.05 and signf(hinge.x) != signf((prev["hinge"] as Vector3).x)
		if not (pair or (folding and bool(prev.get("folding", false)))):
			leaf += 1
		var door := {"node": String(d["node"]), "leaf": leaf, "open": deg_to_rad(float(d.get("open_deg", 65.0))), "hinge": hinge, "folding": folding}
		out.append(door)
		prev = door
	return out


## Puts the model's geometry into `t` (wheels, chassis box, ride height, seat, pose, entry). The
## handling scalars are left as they are.
func apply_geometry(t: VehicleType) -> void:
	var p: Dictionary = data.get("physics", {})
	var y0 := chassis_height()
	if p.has("wheels"):
		var wheels: Array[VehicleSpec.WheelSpec] = []
		for w: Dictionary in p["wheels"]:
			var ws := VehicleSpec.WheelSpec.new()
			ws.at = Vector3(float(w["x"]), float(w["y"]), float(w["z"]))
			ws.radius = float(w["radius"])
			ws.steers = bool(w["steers"])
			ws.driven = bool(w["driven"])
			wheels.append(ws)
		t.spec.wheels = wheels
	t.spec.half_extents = half_extents()
	t.spec.boxes = boxes()
	if p.has("rideHeight"):
		t.ride_height = float(p["rideHeight"])
	for s: Dictionary in data.get("seats", []):
		if String(s.get("role", "")) == "driver":
			t.driver = _v3(s["hip"]) - Vector3(0, y0, 0)
	if data.has("pose"):
		var pose: Dictionary = data["pose"]
		t.pose.lean = float(pose["lean"])
		t.pose.hand = _v3(pose["hand"])
		t.pose.foot = _v3(pose["foot"])
		t.pose.knees = float(pose["knees"]) if pose.get("knees") != null else 0.0
	if data.has("entry"):
		var e: Dictionary = data["entry"]
		var point: Array = e["point"]
		t.entry.side = int(e["side"])
		t.entry.point = Vector2(float(point[0]), float(point[point.size() - 1]))
		t.entry.door = String(e["door"])
		t.entry.style = String(e["style"])
		var aisle: Array[Vector3] = []
		for a: Array in e.get("aisle", []):
			aisle.append(_v3(a) - Vector3(0, y0, 0))
		t.entry.aisle = aisle


static func _v3(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))
