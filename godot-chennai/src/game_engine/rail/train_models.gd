class_name TrainModels
extends RefCounted
## The trains' cars as merged meshes for instancing (G-328): each car type's GLB of each LOD
## (`assets/trains/*`, built by `tools/blender/vehicles/trains.py`) flattened into one mesh per
## material (body, bogies, wheelsets, pantographs), with the sliding door leaves kept apart so
## they can open, and the manifest's door, seat and length data. The trains view draws every car
## of a type and LOD with one `MultiMesh`, so a whole train is a few draw calls (the manifest's
## `draw_note`). Loads and merges on a worker thread.

const DIR := "res://assets/trains"
## The game's four-car rakes per train type (estimated: real Chennai EMUs run 9 or 12 cars and
## expresses 18-24 coaches; the platforms and timetable are sized for four, as in the Three.js
## game). `@reversed` turns the car round (the rear cab).
const FORMATIONS := {
	"emu": ["emu_cab", "emu_motor", "emu_trailer", "emu_cab@reversed"],
	"emu_ac": ["emu_ac_cab", "emu_ac_motor", "emu_ac_trailer", "emu_ac_cab@reversed"],
	"express": ["wap7", "lhb_coach", "lhb_coach", "lhb_coach"],
}


## One door leaf of a car: where it rests, which side, and how it slides open.
class Door:
	extends RefCounted
	var rest: Transform3D
	## -1 on the car's left (-X), +1 on its right (+X).
	var side: int = 1
	var slide: Vector3 = Vector3(0, 0, -1)
	var slide_m: float = 1.2


class CarType:
	extends RefCounted
	var name: String = ""
	## Merged meshes per LOD (0 near … 2 far) and the distance each is drawn to.
	var lods: Array[Mesh] = []
	var lod_end: PackedFloat32Array = PackedFloat32Array()
	var door_left: Mesh = null
	var door_right: Mesh = null
	var doors: Array[Door] = []
	var length: float = 21.95
	var width: float = 3.5
	var height: float = 4.1
	## The driver's seat (cab cars), car frame; and the floor height inside.
	var driver_seat: Vector3 = Vector3.ZERO
	var has_cab: bool = false
	var floor_height: float = 1.2
	var triangles: PackedInt32Array = PackedInt32Array()


var types: Dictionary[String, CarType] = {}
var error: String = ""


## Loads every car type the formations use (worker thread).
static func load_all() -> TrainModels:
	var out := TrainModels.new()
	var names: Dictionary[String, bool] = {}
	for f: String in FORMATIONS.keys():
		for car: Variant in FORMATIONS[f] as Array:
			names[str(car).get_slice("@", 0)] = true
	for n: String in names.keys():
		var t := _load_type(n)
		if t == null:
			out.error = "Could not load the train car %s." % n
			continue
		out.types[n] = t
	return out


static func _load_type(n: String) -> CarType:
	var manifest_text := FileAccess.get_file_as_string("%s/%s.json" % [DIR, n])
	var parsed: Variant = JSON.parse_string(manifest_text)
	if not parsed is Dictionary:
		return null
	var m: Dictionary = parsed
	var t := CarType.new()
	t.name = n
	var size: Dictionary = m.get("size_m", {})
	t.width = float(size.get("width", 3.5))
	t.height = float(size.get("height", 4.1))
	var faces: Dictionary = m.get("coupler_faces_z", {})
	t.length = absf(float(faces.get("front", -10.975))) + absf(float(faces.get("rear", 10.975)))
	var door_specs: Dictionary[String, Dictionary] = {}
	for d: Variant in m.get("doors", []) as Array:
		var dd: Dictionary = d
		door_specs[str(dd.get("node", ""))] = dd
	for lod: Variant in m.get("lods", []) as Array:
		var ld: Dictionary = lod
		var scene := load("%s/%s" % [DIR, str(ld.get("file", ""))]) as PackedScene
		if scene == null:
			return null
		var root := scene.instantiate() as Node3D
		var keep_doors := t.lods.is_empty()
		var merged := _merge(root, keep_doors, t, door_specs)
		root.free()
		t.lods.append(merged)
		t.lod_end.append(float(ld.get("max_distance_m", 900.0)))
		t.triangles.append(int(ld.get("triangles", 0)))
	return t


## Flattens every mesh under `root` into one mesh per material; door leaves (LOD 0) become the
## type's door meshes. Seats and the floor come from the named marker nodes.
static func _merge(root: Node3D, keep_doors: bool, t: CarType, door_specs: Dictionary[String, Dictionary]) -> Mesh:
	var by_material: Dictionary[Material, SurfaceTool] = {}
	var stack: Array[Node] = [root]
	while not stack.is_empty():
		var node: Node = stack.pop_back()
		for c: Node in node.get_children():
			stack.append(c)
		if node is Node3D and keep_doors:
			var n3 := node as Node3D
			if n3.name == &"seat_driver":
				t.driver_seat = _relative(root, n3).origin
				t.has_cab = true
			elif n3.name == &"standing_area":
				t.floor_height = _relative(root, n3).origin.y
		if not node is MeshInstance3D:
			continue
		var mi := node as MeshInstance3D
		var xform := _relative(root, mi)
		var is_door := String(mi.name).begins_with("door_")
		if is_door:
			if not keep_doors:
				continue
			var spec: Dictionary = door_specs.get(String(mi.name), {})
			var door := Door.new()
			door.rest = xform
			door.side = -1 if String(mi.name).begins_with("door_l") else 1
			var sl: Array = spec.get("slide", [0, 0, -1])
			door.slide = Vector3(float(sl[0]), float(sl[1]), float(sl[2]))
			door.slide_m = float(spec.get("slide_m", 1.2))
			t.doors.append(door)
			if door.side < 0 and t.door_left == null:
				t.door_left = mi.mesh
			elif door.side > 0 and t.door_right == null:
				t.door_right = mi.mesh
			continue
		var mesh := mi.mesh
		for s in mesh.get_surface_count():
			var mat := mi.get_active_material(s)
			if mat == null:
				mat = StandardMaterial3D.new()
			if not by_material.has(mat):
				var st := SurfaceTool.new()
				st.begin(Mesh.PRIMITIVE_TRIANGLES)
				by_material[mat] = st
			by_material[mat].append_from(mesh, s, xform)
	var out := ArrayMesh.new()
	for mat: Material in by_material.keys():
		var st: SurfaceTool = by_material[mat]
		st.set_material(mat)
		st.commit(out)
	return out


static func _relative(root: Node3D, n: Node3D) -> Transform3D:
	var xf := Transform3D.IDENTITY
	var cur: Node = n
	while cur != null and cur != root:
		xf = (cur as Node3D).transform * xf
		cur = cur.get_parent()
	return xf


static var _formations: Dictionary[String, Array] = {}


## The cars of a train type, front first: car type names and whether each is turned round (cached).
static func formation(train_type: String) -> Array[Array]:
	if _formations.has(train_type):
		return _formations[train_type]
	var out: Array[Array] = []
	var cars: Array = FORMATIONS.get(train_type, FORMATIONS["emu"])
	for c: Variant in cars:
		var s := str(c)
		out.append([s.get_slice("@", 0), s.ends_with("@reversed")])
	_formations[train_type] = out
	return out


## Distance from the middle of a train to each car's middle (front car first, positive ahead).
var _offsets: Dictionary[String, PackedFloat32Array] = {}


func car_offsets(train_type: String) -> PackedFloat32Array:
	if _offsets.has(train_type):
		return _offsets[train_type]
	var f := formation(train_type)
	var lengths := PackedFloat32Array()
	var total := 0.0
	for c in f:
		var t: CarType = types.get(str(c[0]), null)
		var l := t.length if t != null else 21.95
		lengths.append(l)
		total += l
	var out := PackedFloat32Array()
	var at := total / 2.0
	for l in lengths:
		out.append(at - l / 2.0)
		at -= l
	_offsets[train_type] = out
	return out


func train_length(train_type: String) -> float:
	var offsets := car_offsets(train_type)
	var f := formation(train_type)
	var first: CarType = types.get(str(f[0][0]), null)
	var last: CarType = types.get(str(f[f.size() - 1][0]), null)
	var lf := first.length if first != null else 21.95
	var ll := last.length if last != null else 21.95
	return offsets[0] - offsets[offsets.size() - 1] + (lf + ll) / 2.0
