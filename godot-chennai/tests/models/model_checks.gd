class_name ModelChecks
extends RefCounted
## Checks every vehicle, aircraft and train model against its manifest (decision G-37). Run by
## `tests/unit/test_vehicle_models.gd` in the project's runner (`./run_tests.sh`); each check is
## one assertion. The GLBs are read with GLTFDocument exactly as the files are (no import step).
##
## Per model (manifest `assets/{vehicles,vehicles/legacy,aircraft,trains}/<name>.json`):
## - every LOD file loads; triangles per LOD within the budget of its kind (BUDGETS, from the brief
##   and `chennai-game-design` §6), equal to the manifest's count, fewer than the LOD before;
## - named nodes: wheels, steering, doors, pivots (rotors, propellers, fans, control surfaces,
##   gear, bogies, pantographs), seats, grips, cargo anchors, required nodes;
## - scale in metres (bounds match `size_m` within 4 %), +Y up with the ground at y = 0, the front
##   towards -Z (TD-2): `marker_front` at the body's front, or steered wheels ahead of the others;
## - wheels touch the ground (or the rail, flange below it) and sit on their axles;
## - door, gear and control-surface origins on their hinge or pivot;
## - no vertex colours as albedo; textures at most 512 px (1024 for the airliner);
## - texture contents: each embedded palette atlas matches `assets/vehicles/shared/palette.json`
##   cell by cell, and each manifest's `texture_samples` texel reads back its expected colour.

const DIRS: PackedStringArray = ["assets/vehicles", "assets/vehicles/legacy", "assets/aircraft", "assets/trains"]

## kind -> [LOD0, LOD1, LOD2] triangle budgets (whole model: body, wheels, doors).
const BUDGETS: Dictionary = {
	"car": [12000, 3000, 800],
	"race_car": [12000, 3000, 800],
	"bike": [12000, 3000, 800],
	"ambulance": [12000, 3000, 800],  # the van ambulance, as a car (G-92); legacy counts below
	"bus": [15000, 3500, 600],  # brief: buses 15k / 3.5k / 600 (G-92)
	"auto": [12000, 3000, 800],  # autos as cars (G-92); the legacy auto keeps its counts below
	"helicopter": [10000, 2500, 400],
	"light_aircraft": [10000, 2500, 400],
	"airliner": [15000, 3500, 600],
	"train_coach": [3800, 600, 120],  # 3,000 body + bogies (<= 400 each) at LOD0; research note
	"train_cab": [6800, 1000, 150],  # 6,000 cab/loco/nose + bogies at LOD0
}
## Legacy (Three.js) models keep their measured counts; the hatchback's traffic model is 3,050.
const LEGACY_BUDGETS: Dictionary = {"hatchback": [10500, 3100], "motorbike": [7700, 2300], "ambulance": [15000, 4000],
	"bus": [13000, 5500], "auto_rickshaw": [16500, 12500]}
const BODY_BUDGET: Dictionary = {"train_coach": 3000, "train_cab": 6000}
## Per two-axle bogie with its wheelsets (research note); a three-axle bogie gets half as much again.
const BOGIE_BUDGET := 400

## Colour families for liveries and paints (G-93): hue range in degrees (wrapping when min > max),
## minimum saturation, value range; checked on `texture_samples[].family` and `paint_family`.
const FAMILIES: Dictionary = {
	"yellow": [38.0, 62.0, 0.6, 0.55, 1.0],
	"cream": [30.0, 60.0, 0.15, 0.6, 1.0],
	"maroon": [340.0, 20.0, 0.5, 0.15, 0.55],
	"red": [345.0, 25.0, 0.6, 0.35, 1.0],
	"green": [80.0, 160.0, 0.5, 0.2, 1.0],
	"white": [0.0, 360.0, 0.0, 0.8, 1.0],
	"brown": [10.0, 40.0, 0.5, 0.1, 0.45],
	"orange": [10.0, 38.0, 0.7, 0.5, 1.0],
	"magenta": [290.0, 345.0, 0.6, 0.3, 1.0],
	"black": [0.0, 360.0, 0.0, 0.0, 0.25],
}

var labels: PackedStringArray = PackedStringArray()
var oks: Array[bool] = []
var models := 0
var _palette: Dictionary = {}


## Runs every check under `root_dir` (the godot-chennai folder, absolute).
func run(root_dir: String) -> void:
	var pal: Variant = JSON.parse_string(FileAccess.get_file_as_string(root_dir.path_join("assets/vehicles/shared/palette.json")))
	if pal is Dictionary:
		_palette = pal
	_ok(not _palette.is_empty(), "palette.json present")
	for d: String in DIRS:
		var dir := DirAccess.open(root_dir.path_join(d))
		if dir == null:
			continue
		var names := dir.get_files()
		names.sort()
		for f: String in names:
			if f.ends_with(".json"):
				_check_model(root_dir.path_join(d), f)


func failed() -> int:
	return oks.count(false)


func _ok(cond: bool, what: String) -> bool:
	oks.append(cond)
	labels.append(what)
	return cond


# ----------------------------------------------------------------------------- typed access


static func _arr(d: Dictionary, key: String) -> Array:
	var v: Variant = d.get(key, [])
	return v if v is Array else []


static func _dict(d: Dictionary, key: String) -> Dictionary:
	var v: Variant = d.get(key, {})
	return v if v is Dictionary else {}


static func _v3(a: Array) -> Vector3:
	return Vector3(float(a[0]), float(a[1]), float(a[2]))


static func _str(d: Dictionary, key: String) -> String:
	return str(d.get(key, ""))


# ----------------------------------------------------------------------------- one model


func _check_model(dir: String, file: String) -> void:
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(dir.path_join(file)))
	if not _ok(parsed is Dictionary, file + ": manifest parses"):
		return
	var m: Dictionary = parsed
	models += 1
	var name := _str(m, "name")
	var kind := _str(m, "kind")
	_ok(BUDGETS.has(kind), name + ": known kind " + kind)
	_ok(_str(m, "licence").length() > 20, name + ": licence recorded")
	var lods := _arr(m, "lods")
	_ok(lods.size() >= 2, name + ": at least two LODs")
	var lod0: Node3D = null
	var prev_tris := 1 << 30
	for i in lods.size():
		var lod: Dictionary = lods[i]
		var file_name := _str(lod, "file")
		var scene := _load(dir.path_join(file_name))
		if not _ok(scene != null, "%s: LOD%d loads (%s)" % [name, i, file_name]):
			continue
		var tris := _triangles(scene)
		var budgets: Array = BUDGETS.get(kind, [0, 0, 0])
		var budget := int(budgets[mini(i, 2)])
		if bool(m.get("ported", false)) and LEGACY_BUDGETS.has(name):
			var lb: Array = LEGACY_BUDGETS[name]
			budget = int(lb[mini(i, 1)])
		_ok(tris <= budget, "%s LOD%d: %d triangles <= %d" % [name, i, tris, budget])
		_ok(tris == int(lod.get("triangles", -1)), "%s LOD%d: manifest triangles %s == measured %d" % [name, i, lod.get("triangles"), tris])
		_ok(tris < prev_tris, "%s LOD%d: fewer triangles than the LOD before" % [name, i])
		prev_tris = tris
		_check_materials(scene, name, i, kind)
		_check_wheels(scene, m, name, i)
		if i == 0:
			lod0 = scene
		else:
			scene.free()
	if lod0 == null:
		return
	var first: Dictionary = lods[0]
	_check_textures(dir.path_join(_str(first, "file")), m, name)
	var paint_family := _str(m, "paint_family")
	if paint_family != "":
		var paints := _arr(m, "paints")
		if _ok(not paints.is_empty(), "%s: has paints" % name):
			var p0: Dictionary = paints[0]
			var srgb := _arr(p0, "srgb")
			var col := Color(float(srgb[0]), float(srgb[1]), float(srgb[2]))
			_ok(in_family(col, paint_family), "%s: first paint %s is in the %s colour family" % [name, p0.get("name"), paint_family])
	_check_frame(lod0, m, name)
	_check_nodes(lod0, m, name, kind)
	lod0.free()


func _load(path: String) -> Node3D:
	if not FileAccess.file_exists(path):
		return null
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	if doc.append_from_file(path, state) != OK:
		return null
	return doc.generate_scene(state) as Node3D


## Transform of a node relative to the scene root (the scene is not in the tree).
static func _xf(n: Node) -> Transform3D:
	var t := Transform3D.IDENTITY
	var cur: Node = n
	while cur != null and cur is Node3D and cur.get_parent() != null:
		t = (cur as Node3D).transform * t
		cur = cur.get_parent()
	return t


## Mesh nodes under `n` (n included). GLTFDocument makes ImporterMeshInstance3D nodes outside a
## project and MeshInstance3D inside one; both are handled.
static func _meshes(n: Node) -> Array[Node3D]:
	var out: Array[Node3D] = []
	if n is ImporterMeshInstance3D or n is MeshInstance3D:
		out.append(n as Node3D)
	for c: Node in n.find_children("*", "", true, false):
		if c is ImporterMeshInstance3D or c is MeshInstance3D:
			out.append(c as Node3D)
	return out


static func _surface_count(mi: Node3D) -> int:
	if mi is ImporterMeshInstance3D:
		return (mi as ImporterMeshInstance3D).mesh.get_surface_count()
	var mesh := (mi as MeshInstance3D).mesh
	return mesh.get_surface_count() if mesh != null else 0


static func _surface_arrays(mi: Node3D, s: int) -> Array:
	if mi is ImporterMeshInstance3D:
		return (mi as ImporterMeshInstance3D).mesh.get_surface_arrays(s)
	return (mi as MeshInstance3D).mesh.surface_get_arrays(s)


static func _surface_material(mi: Node3D, s: int) -> BaseMaterial3D:
	if mi is ImporterMeshInstance3D:
		return (mi as ImporterMeshInstance3D).mesh.get_surface_material(s) as BaseMaterial3D
	return (mi as MeshInstance3D).mesh.surface_get_material(s) as BaseMaterial3D


static func _triangles(n: Node) -> int:
	var t := 0
	for mi in _meshes(n):
		for s in _surface_count(mi):
			var arr := _surface_arrays(mi, s)
			var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX] if arr[Mesh.ARRAY_INDEX] != null else PackedInt32Array()
			var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			t += idx.size() / 3 if idx.size() > 0 else v.size() / 3
	return t


## Bounds of every mesh under `n` (n included) in the scene root's frame.
static func _bounds(n: Node) -> AABB:
	var box := AABB()
	var first := true
	for mi in _meshes(n):
		var xf := _xf(mi)
		for s in _surface_count(mi):
			var v: PackedVector3Array = _surface_arrays(mi, s)[Mesh.ARRAY_VERTEX]
			for p: Vector3 in v:
				var w := xf * p
				if first:
					box = AABB(w, Vector3.ZERO)
					first = false
				else:
					box = box.expand(w)
	return box


static func _find(scene: Node, node_name: String) -> Node3D:
	if scene.name == node_name:
		return scene as Node3D
	return scene.find_child(node_name, true, false) as Node3D


func _check_materials(scene: Node, name: String, lod: int, kind: String) -> void:
	var max_px := 1024 if kind == "airliner" else 512
	var vc := false
	var too_big := ""
	for mi in _meshes(scene):
		for s in _surface_count(mi):
			var arr := _surface_arrays(mi, s)
			var colours: Variant = arr[Mesh.ARRAY_COLOR]
			if colours is PackedColorArray and not (colours as PackedColorArray).is_empty():
				vc = true
			var mat := _surface_material(mi, s)
			if mat == null:
				continue
			if mat.vertex_color_use_as_albedo:
				vc = true
			for tex: Texture2D in [mat.albedo_texture, mat.metallic_texture, mat.roughness_texture, mat.emission_texture]:
				if tex != null and (tex.get_width() > max_px or tex.get_height() > max_px):
					too_big = "%s %dx%d" % [mat.resource_name, tex.get_width(), tex.get_height()]
	_ok(not vc, "%s LOD%d: no vertex colour as albedo" % [name, lod])
	_ok(too_big == "", "%s LOD%d: textures <= %d px %s" % [name, lod, max_px, too_big])


func _check_wheels(scene: Node, m: Dictionary, name: String, lod: int) -> void:
	var rail := _str(m, "kind").begins_with("train")
	for w: Dictionary in _arr(m, "wheels"):
		if lod > int(w.get("lod_max", 99)):
			continue
		var node_name := _str(w, "node")
		var node := _find(scene, node_name)
		if not _ok(node != null, "%s LOD%d: wheel node %s" % [name, lod, node_name]):
			continue
		var centre := _v3(_arr(w, "centre"))
		var origin := _xf(node).origin
		_ok(origin.distance_to(centre) < 0.03, "%s LOD%d: %s on its axle %s (at %s)" % [name, lod, node_name, centre, origin])
		var low := _bounds(node).position.y
		var r := float(w.get("radius", 0.0))
		_ok(absf(origin.y - r) < 0.03, "%s LOD%d: %s axle height = radius %.3f (%.3f)" % [name, lod, node_name, r, origin.y])
		if rail:
			# The tread sits on the rail top (y = 0); the flange reaches up to 4 cm below it.
			_ok(low <= 0.005 and low > -0.045, "%s LOD%d: %s tread on the rail (lowest %.3f)" % [name, lod, node_name, low])
		else:
			_ok(absf(low) < 0.03, "%s LOD%d: %s touches the ground (lowest %.3f)" % [name, lod, node_name, low])


func _check_frame(scene: Node3D, m: Dictionary, name: String) -> void:
	var b := _bounds(scene)
	var size := _dict(m, "size_m")
	var want := Vector3(float(size.get("width", 0.0)), float(size.get("height", 0.0)), float(size.get("length", 0.0)))
	var tol := want * 0.04 + Vector3.ONE * 0.03
	var diff := (b.size - want).abs()
	_ok(diff.x <= tol.x and diff.y <= tol.y and diff.z <= tol.z, "%s: size %s m matches manifest %s" % [name, b.size, want])
	_ok(b.position.y > -0.06 and b.position.y < 0.06, "%s: rests on y = 0 (lowest %.3f)" % [name, b.position.y])
	var front := _find(scene, "marker_front")
	if front != null:
		# Against the body's bounds: a helicopter's rotor blade can reach further forwards.
		var body := _find(scene, "body")
		var bb := _bounds(body) if body != null else b
		var z := _xf(front).origin.z
		_ok(z < 0.0 and absf(z - bb.position.z) < 0.2, "%s: front marker at the body's -Z end (%.2f, bounds %.2f)" % [name, z, bb.position.z])
	else:
		var steer_z := 0.0
		var other_z := 0.0
		var ns := 0
		var no := 0
		for w: Dictionary in _arr(m, "wheels"):
			var c := _v3(_arr(w, "centre"))
			if bool(w.get("steers", false)):
				steer_z += c.z
				ns += 1
			else:
				other_z += c.z
				no += 1
		_ok(ns > 0 and no > 0 and steer_z / ns < other_z / no, "%s: steered wheels towards -Z (front)" % name)
	_ok(b.end.y > 0.3, "%s: +Y up (top at %.2f)" % [name, b.end.y])


func _check_nodes(scene: Node3D, m: Dictionary, name: String, kind: String) -> void:
	for d: Dictionary in _arr(m, "doors"):
		var door_name := _str(d, "node")
		var n := _find(scene, door_name)
		if _ok(n != null, "%s: door node %s" % [name, door_name]):
			var o := _xf(n).origin
			# A vertical hinge line (axis y, car doors): compare x and z; others the whole point.
			var hp := _v3(_arr(d, "hinge"))
			var axis: Array = d.get("axis", [0, 1, 0])
			if absf(float(axis[1])) > 0.9:
				hp.y = o.y
			_ok(o.distance_to(hp) < 0.03, "%s: %s origin on its hinge %s (at %s)" % [name, door_name, hp, o])
	var st := _dict(m, "steering")
	if not st.is_empty() and st.get("node") != null:
		var n := _find(scene, _str(st, "node"))
		if _ok(n != null, "%s: steering node" % name):
			_ok(_xf(n).origin.distance_to(_v3(_arr(st, "hub"))) < 0.03, "%s: steering origin on the hub" % name)
	var bounds := _bounds(scene).grow(0.05)
	for group: String in ["seats", "grips", "cargo", "anchors"]:
		for a: Dictionary in _arr(m, group):
			if a.get("node") == null:
				continue
			var anchor := _str(a, "node")
			var n := _find(scene, anchor)
			if _ok(n != null, "%s: %s node %s" % [name, group, anchor]):
				_ok(bounds.has_point(_xf(n).origin), "%s: %s inside the model's bounds" % [name, anchor])
	# Exit and kerb points (where a rider steps out or a passenger waits): beside the vehicle, on
	# the ground, within two metres of its bounds.
	var near := _bounds(scene).grow(2.0)
	for e: Dictionary in _arr(m, "exits"):
		var exit_name := _str(e, "node")
		var n := _find(scene, exit_name)
		if _ok(n != null, "%s: exit node %s" % [name, exit_name]):
			var o := _xf(n).origin
			_ok(absf(o.y) < 0.05 and near.has_point(o), "%s: %s on the ground beside the vehicle (%s)" % [name, exit_name, o])
	for p: Dictionary in _arr(m, "pivots"):
		var pivot_name := _str(p, "node")
		var n := _find(scene, pivot_name)
		if _ok(n != null, "%s: pivot node %s (%s)" % [name, pivot_name, p.get("what", "")]):
			_ok(_xf(n).origin.distance_to(_v3(_arr(p, "pivot"))) < 0.03, "%s: %s origin on its pivot" % [name, pivot_name])
			if p.has("axis"):
				_ok(absf(_v3(_arr(p, "axis")).length() - 1.0) < 0.01, "%s: %s axis is a unit vector" % [name, pivot_name])
	if BODY_BUDGET.has(kind):
		var bogie_nodes := _arr(m, "bogies")
		# A Co-Co bogie has three axles: its budget grows with them.
		var axles_per_bogie := maxi(2, roundi(float(_arr(m, "wheels").size()) / maxf(1.0, float(bogie_nodes.size()))))
		var bogie_budget := BOGIE_BUDGET * axles_per_bogie / 2
		var bogies := 0
		for bn: String in bogie_nodes:
			var n := _find(scene, bn)
			if _ok(n != null, "%s: bogie node %s" % [name, bn]):
				var t := _triangles(n)
				bogies += t
				_ok(t <= bogie_budget, "%s: %s %d triangles <= %d" % [name, bn, t, bogie_budget])
		var body := _triangles(scene) - bogies
		var body_budget := int(BODY_BUDGET[kind])
		_ok(body <= body_budget, "%s: body %d triangles <= %d" % [name, body, body_budget])
	for req: String in _arr(m, "required_nodes"):
		_ok(_find(scene, req) != null, "%s: node %s" % [name, req])


# ----------------------------------------------------------------------------- textures


## The PNG images embedded in a GLB, by name (decoded from the BIN chunk, as the file holds them).
static func _glb_images(path: String) -> Dictionary:
	var out := {}
	var data := FileAccess.get_file_as_bytes(path)
	if data.size() < 28:
		return out
	var json_len := data.decode_u32(12)
	var parsed: Variant = JSON.parse_string(data.slice(20, 20 + json_len).get_string_from_utf8())
	if not parsed is Dictionary:
		return out
	var j: Dictionary = parsed
	var views := _arr(j, "bufferViews")
	var bin_start := 20 + json_len + 8
	for im: Dictionary in _arr(j, "images"):
		if not im.has("bufferView"):
			continue
		var bv: Dictionary = views[int(im["bufferView"])]
		var off := bin_start + int(bv.get("byteOffset", 0))
		var img := Image.new()
		if img.load_png_from_buffer(data.slice(off, off + int(bv.get("byteLength", 0)))) == OK:
			out[_str(im, "name")] = img
	return out


static func _texel(img: Image, uv: Array) -> Color:
	var x := clampi(int(float(uv[0]) * img.get_width()), 0, img.get_width() - 1)
	var y := clampi(int(float(uv[1]) * img.get_height()), 0, img.get_height() - 1)
	return img.get_pixel(x, y)


static func _close(c: Color, srgb: Array, tol: int = 6) -> bool:
	return absi(c.r8 - int(srgb[0])) <= tol and absi(c.g8 - int(srgb[1])) <= tol and absi(c.b8 - int(srgb[2])) <= tol


func _check_textures(path: String, m: Dictionary, name: String) -> void:
	var images := _glb_images(path)
	if images.has("vehicle_palette_albedo") and not _palette.is_empty():
		var img: Image = images["vehicle_palette_albedo"]
		var bad := ""
		var roles := _dict(_palette, "roles")
		for r: String in roles:
			var cell: Dictionary = roles[r]
			if not _close(_texel(img, _arr(cell, "uv")), _arr(cell, "albedo_srgb"), 2):
				bad += r + " "
		_ok(bad == "", "%s: embedded palette atlas matches palette.json %s" % [name, bad])
	for smp: Dictionary in _arr(m, "texture_samples"):
		var image_name := _str(smp, "image")
		var sample: Image = images.get(image_name)
		if not _ok(sample != null, "%s: texture %s embedded" % [name, image_name]):
			continue
		var c := _texel(sample, _arr(smp, "uv"))
		_ok(_close(c, _arr(smp, "srgb")), "%s: %s texel is %s (got %d,%d,%d)" % [name, smp.get("what"), smp.get("srgb"), c.r8, c.g8, c.b8])
		var family := _str(smp, "family")
		if family != "":
			_ok(in_family(c, family), "%s: %s is in the %s colour family (h %.0f s %.2f v %.2f)" % [name, smp.get("what"), family, c.h * 360.0, c.s, c.v])


## True when the colour (sRGB) belongs to a named family of FAMILIES.
static func in_family(c: Color, family: String) -> bool:
	if not FAMILIES.has(family):
		return false
	var f: Array = FAMILIES[family]
	var h := c.h * 360.0
	var lo := float(f[0])
	var hi := float(f[1])
	var hue_ok := (h >= lo and h <= hi) if lo <= hi else (h >= lo or h <= hi)
	if c.s < 0.08:
		hue_ok = lo == 0.0 and hi == 360.0  # greys: only the hue-free families (white, black)
	return hue_ok and c.s >= float(f[2]) and c.v >= float(f[3]) and c.v <= float(f[4])
