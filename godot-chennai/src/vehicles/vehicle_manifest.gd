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
	return float(s.get("height", 1.5))


## Wheel nodes: [{node, centre (model frame), radius}].
func wheels() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for w: Dictionary in data.get("wheels", []):
		out.append({"node": String(w["node"]), "centre": _v3(w["centre"]), "radius": float(w["radius"])})
	return out


## Door nodes with their leaf and full opening angle. Leaf 0 is the driver's door (the one the
## driver's seat names, else the first door on the entry side); the others follow in order.
## Doors that swing together share a leaf: a pair on one hinge line at the very front or back
## (the ambulance's rear doors), and folding leaves of one doorway (the bus's, within 1.2 m).
func doors() -> Array[Dictionary]:
	var listed: Array[Dictionary] = []
	for d: Dictionary in data.get("doors", []):
		if not d.has("node") or d["node"] == null:
			continue
		var notes: Variant = d.get("notes")
		listed.append({"node": String(d["node"]), "open": deg_to_rad(float(d.get("open_deg", 65.0))),
			"hinge": _v3(d.get("hinge", [0, 0, 0])), "folding": notes != null and String(notes).contains("folding")})
	var driver := _driver_door(listed)
	if driver > 0:
		var first: Dictionary = listed[driver]
		listed.remove_at(driver)
		listed.insert(0, first)
	var half_z := half_extents().z
	var leaf := -1
	var prev: Dictionary = {}
	for door in listed:
		var hinge: Vector3 = door["hinge"]
		var together := false
		if not prev.is_empty():
			var ph: Vector3 = prev["hinge"]
			var end_pair := leaf > 0 and absf(hinge.z) > half_z - 0.4 and absf(hinge.z - ph.z) < 0.05 and signf(hinge.x) != signf(ph.x)
			var folding_pair := bool(door["folding"]) and bool(prev["folding"]) and absf(hinge.z - ph.z) < 1.2 and signf(hinge.x) == signf(ph.x)
			together = end_pair or folding_pair
		if not together:
			leaf += 1
		door["leaf"] = leaf
		prev = door
	return listed


## Index in `listed` of the driver's door, or -1 for none.
func _driver_door(listed: Array[Dictionary]) -> int:
	var named := ""
	for s: Dictionary in data.get("seats", []):
		if String(s.get("role", "")) == "driver" and s.get("door") != null:
			named = String(s["door"])
	var side := float((data.get("entry", {}) as Dictionary).get("side", 1))
	for i in listed.size():
		if named != "" and listed[i]["node"] == named:
			return i
	if named == "":
		# The door on the entry side whose hinge is just ahead of the driver's hips (a front
		# door's hinge is about 0.5–1 m ahead of the seat; a rear door's is beside or behind it).
		var best := -1
		var best_d := INF
		var hip := Vector3.ZERO
		for s: Dictionary in data.get("seats", []):
			if String(s.get("role", "")) == "driver":
				hip = _v3(s["hip"])
		for i in listed.size():
			var h: Vector3 = listed[i]["hinge"]
			var d := absf(h.z - (hip.z - 0.8))
			if signf(h.x) == signf(side) and d < best_d:
				best_d = d
				best = i
		return best
	return -1


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
	t.spec.boxes = _clear_of_road(boxes(), VehicleModel.settled_ground(t.spec))
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
	var leaf_of := {}
	for d in doors():
		leaf_of[d["node"]] = int(d["leaf"])
	var passengers: Array[VehicleType.PassengerDoor] = []
	for seat: Dictionary in data.get("seats", []):
		if String(seat.get("role", "")) != "passenger":
			continue
		var door_node: Variant = seat.get("door")
		var stand: Variant = seat.get("stand")
		if door_node == null and stand == null:
			continue
		var pd := VehicleType.PassengerDoor.new()
		pd.inside = _v3(seat["hip"]) - Vector3(0, y0, 0)
		pd.leaf = int(leaf_of.get(String(door_node), -1)) if door_node != null else -1
		if stand != null:
			var sp := _v3(stand)
			pd.point = Vector2(sp.x, sp.z)
		else:
			pd.point = _outside(String(door_node), pd.inside)
		passengers.append(pd)
	if not passengers.is_empty():
		t.passengers = passengers


## Collision boxes trimmed from below so the chassis rides at least 6 cm clear of the road
## when settled on its springs (`ground`: the settled ground in the chassis frame). A very low
## car (the race car) otherwise rests on its belly instead of its wheels.
static func _clear_of_road(list: Array[Dictionary], ground: float) -> Array[Dictionary]:
	var lowest := ground + 0.06
	var out: Array[Dictionary] = []
	for b in list:
		var c: Vector3 = b["centre"]
		var h: Vector3 = b["half"]
		var top := c.y + h.y
		var bottom := maxf(c.y - h.y, lowest)
		if top - bottom < 0.05:
			continue
		out.append({"centre": Vector3(c.x, (top + bottom) / 2.0, c.z), "half": Vector3(h.x, (top - bottom) / 2.0, h.z)})
	return out


## Where a passenger stands outside a door: beside it, or behind the vehicle for a rear door.
func _outside(door_node: String, inside: Vector3) -> Vector2:
	for d: Dictionary in data.get("doors", []):
		if String(d.get("node", "")) == door_node:
			var h := _v3(d["hinge"])
			if absf(h.z) > half_extents().z - 0.4:
				return Vector2(0.0, h.z + signf(h.z) * 1.0)
			return Vector2(signf(h.x) * (absf(h.x) + 0.45), inside.z + 0.4)
	return Vector2(signf(inside.x) * (half_extents().x + 0.45), inside.z)


static func _v3(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))
