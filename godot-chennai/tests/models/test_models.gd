extends SceneTree
## Headless checks of every vehicle, aircraft and train model against its manifest.
##
##   godot --headless --audio-driver Dummy --script godot-chennai/tests/models/test_models.gd [-- <godot-chennai dir>]
##
## Standalone on purpose: needs no project.godot and no import step (GLBs are read with
## GLTFDocument, exactly as the files are), so it can be wired into the project's test runner
## as one more suite. Exit code 0 when every check passes, 1 otherwise; prints one line per
## failure and a summary "MODEL TESTS: <passed>/<total> checks, <n> models".
##
## Checks per model (manifest `assets/{vehicles,aircraft,trains}/<name>.json`):
## - every LOD file loads; triangles per LOD within the budget of its kind (BUDGETS below, from
##   the brief and `chennai-game-design` §6), and equal to the count the manifest records;
## - named nodes: wheels, steering, doors, rotors, propellers, control surfaces, gear, bogies,
##   pantographs, seats, grips, cargo anchors, as the manifest lists them;
## - scale in metres (bounds match `size_m` within 4 %), +Y up with the ground at y = 0, the front
##   towards -Z (TD-2): a `marker_front` node at the front of the bounds, or steered wheels ahead
##   of the others;
## - wheels touch the ground plane at rest (lowest point of each wheel at y = 0 within 3 cm, or
##   the flange depth for rail wheels) and sit where the manifest says;
## - door, gear and control-surface nodes have their origins on the hinge or pivot;
## - no vertex colours used as albedo (no COLOR attribute, no material with it on);
## - textures at most 512 px (1024 for the airliner's livery);
## - textures hold the right colours: every GLB's embedded palette atlas matches
##   `assets/vehicles/shared/palette.json` cell by cell, and each manifest's `texture_samples`
##   (livery texels: body colour, bands, cab front) read back with the expected sRGB colour, so a
##   wrong or stale atlas or livery region fails (the green-roof mix-up of 23 Nov).

const DIRS := ["assets/vehicles", "assets/aircraft", "assets/trains"]

## kind -> [LOD0, LOD1, LOD2] triangle budgets (whole model: body, wheels, doors).
const BUDGETS := {
	"car": [12000, 3000, 800],
	"race_car": [12000, 3000, 800],
	"bike": [12000, 3000, 800],
	"ambulance": [15000, 4000, 1000],  # ported: the old game's van (14.6k / 3.9k), kept as is
	"bus": [13000, 5500, 1000],  # ported: 12.4k / 5.3k
	"auto": [16500, 12500, 1000],  # ported: 16.4k / 12.3k, over the car budget (noted in docs)
	"helicopter": [10000, 2500, 400],
	"light_aircraft": [10000, 2500, 400],
	"airliner": [15000, 3500, 600],
	"train_coach": [3800, 600, 120],  # 3,000 body + bogies (<= 400 each) at LOD0; research note
	"train_cab": [6800, 1000, 150],  # 6,000 cab/loco/nose + bogies at LOD0
}
## Ported Three.js models keep their measured counts (docs/vehicles.md of the old game); the
## hatchback's traffic model is 3,050, "about 3k".
const PORTED_BUDGETS := {"hatchback": [10500, 3100], "motorbike": [7700, 2300]}
const BODY_BUDGET := {"train_coach": 3000, "train_cab": 6000}
const BOGIE_BUDGET := 400

var root_dir := ""
var palette: Dictionary = {}
var passed := 0
var failed := 0
var models := 0


func _initialize() -> void:
	await process_frame
	var args := OS.get_cmdline_user_args()
	root_dir = args[0] if args.size() > 0 else _default_root()
	var pal_text := FileAccess.get_file_as_string(root_dir.path_join("assets/vehicles/shared/palette.json"))
	palette = JSON.parse_string(pal_text) if pal_text != "" else {}
	_ok(not palette.is_empty(), "palette.json present")
	for d in DIRS:
		var dir := DirAccess.open(root_dir.path_join(d))
		if dir == null:
			continue
		var names := dir.get_files()
		names.sort()
		for f in names:
			if f.ends_with(".json"):
				_check_model(root_dir.path_join(d), f)
	print("MODEL TESTS: %d/%d checks passed, %d models" % [passed, passed + failed, models])
	quit(0 if failed == 0 and models > 0 else 1)


## The godot-chennai folder: the argument, else found from the --script path, else the
## working directory (or its godot-chennai/ subfolder).
func _default_root() -> String:
	var args := OS.get_cmdline_args()
	var i := args.find("--script")
	if i >= 0 and i + 1 < args.size():
		var p := args[i + 1]
		if not p.is_absolute_path():
			p = OS.get_environment("PWD").path_join(p)
		return p.get_base_dir().path_join("../..").simplify_path()
	var cwd := OS.get_environment("PWD")
	return cwd.path_join("godot-chennai") if DirAccess.dir_exists_absolute(cwd.path_join("godot-chennai")) else cwd


func _ok(cond: bool, what: String) -> bool:
	if cond:
		passed += 1
	else:
		failed += 1
		print("FAIL ", what)
	return cond


func _check_model(dir: String, file: String) -> void:
	var text := FileAccess.get_file_as_string(dir.path_join(file))
	var m: Dictionary = JSON.parse_string(text)
	if not _ok(m != null, file + ": manifest parses"):
		return
	models += 1
	var name: String = m["name"]
	var kind: String = m["kind"]
	_ok(BUDGETS.has(kind), name + ": known kind " + kind)
	_ok(String(m.get("licence", "")).length() > 20, name + ": licence recorded")
	var lods: Array = m["lods"]
	_ok(lods.size() >= 2, name + ": at least two LODs")
	var lod0: Node3D = null
	var prev_tris := 1 << 30
	for i in lods.size():
		var lod: Dictionary = lods[i]
		var scene := _load(dir.path_join(lod["file"]))
		if not _ok(scene != null, "%s: LOD%d loads (%s)" % [name, i, lod["file"]]):
			continue
		var tris := _triangles(scene)
		var budget: int = BUDGETS.get(kind, [0, 0, 0])[min(i, 2)]
		if m.get("ported", false) and PORTED_BUDGETS.has(name):
			budget = PORTED_BUDGETS[name][min(i, 1)]
		_ok(tris <= budget, "%s LOD%d: %d triangles <= %d" % [name, i, tris, budget])
		_ok(tris == int(lod["triangles"]), "%s LOD%d: manifest triangles %d == measured %d" % [name, i, int(lod["triangles"]), tris])
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
	_check_textures(dir.path_join(lods[0]["file"]), m, name)
	_check_frame(lod0, m, name, kind)
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
func _xf(n: Node) -> Transform3D:
	var t := Transform3D.IDENTITY
	var cur := n
	while cur != null and cur is Node3D and cur.get_parent() != null:
		t = (cur as Node3D).transform * t
		cur = cur.get_parent()
	return t


func _meshes(n: Node) -> Array[ImporterMeshInstance3D]:
	var out: Array[ImporterMeshInstance3D] = []
	if n is ImporterMeshInstance3D:
		out.append(n)
	for c in n.find_children("*", "ImporterMeshInstance3D", true, false):
		out.append(c as ImporterMeshInstance3D)
	return out


func _triangles(n: Node) -> int:
	var t := 0
	for mi in _meshes(n):
		for s in mi.mesh.get_surface_count():
			var arr := mi.mesh.get_surface_arrays(s)
			var idx: PackedInt32Array = arr[Mesh.ARRAY_INDEX]
			var v: PackedVector3Array = arr[Mesh.ARRAY_VERTEX]
			t += idx.size() / 3 if idx.size() > 0 else v.size() / 3
	return t


## Bounds of every mesh under `n` (n included) in the scene root's frame.
func _bounds(n: Node) -> AABB:
	var box := AABB()
	var first := true
	for mi in _meshes(n):
		var xf := _xf(mi)
		for s in mi.mesh.get_surface_count():
			var v: PackedVector3Array = mi.mesh.get_surface_arrays(s)[Mesh.ARRAY_VERTEX]
			for p in v:
				var w := xf * p
				if first:
					box = AABB(w, Vector3.ZERO)
					first = false
				else:
					box = box.expand(w)
	return box


func _find(scene: Node, node_name: String) -> Node3D:
	if scene.name == node_name:
		return scene as Node3D
	return scene.find_child(node_name, true, false) as Node3D


func _check_materials(scene: Node, name: String, lod: int, kind: String) -> void:
	var max_px := 1024 if kind == "airliner" else 512
	var vc := false
	var too_big := ""
	for mi in _meshes(scene):
		for s in mi.mesh.get_surface_count():
			var arr := mi.mesh.get_surface_arrays(s)
			if arr[Mesh.ARRAY_COLOR] != null and (arr[Mesh.ARRAY_COLOR] as PackedColorArray).size() > 0:
				vc = true
			var mat := mi.mesh.get_surface_material(s) as BaseMaterial3D
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
	var rail: bool = String(m["kind"]).begins_with("train")
	for w: Dictionary in m.get("wheels", []):
		if lod > int(w.get("lod_max", 99)):
			continue
		var node := _find(scene, w["node"])
		if not _ok(node != null, "%s LOD%d: wheel node %s" % [name, lod, w["node"]]):
			continue
		var c: Array = w["centre"]
		var origin := _xf(node).origin
		_ok(origin.distance_to(Vector3(c[0], c[1], c[2])) < 0.03, "%s LOD%d: %s on its axle %s (at %s)" % [name, lod, w["node"], c, origin])
		var b := _bounds(node)
		var low := b.position.y
		var r: float = w["radius"]
		_ok(absf(origin.y - r) < 0.03, "%s LOD%d: %s axle height = radius %.3f (%.3f)" % [name, lod, w["node"], r, origin.y])
		if rail:
			# The tread sits on the rail top (y = 0); the flange reaches up to 4 cm below it.
			_ok(low <= 0.005 and low > -0.045, "%s LOD%d: %s tread on the rail (lowest %.3f)" % [name, lod, w["node"], low])
		else:
			_ok(absf(low) < 0.03, "%s LOD%d: %s touches the ground (lowest %.3f)" % [name, lod, w["node"], low])


func _check_frame(scene: Node3D, m: Dictionary, name: String, kind: String) -> void:
	var b := _bounds(scene)
	var size: Dictionary = m["size_m"]
	var want := Vector3(size["width"], size["height"], size["length"])
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
		for w: Dictionary in m.get("wheels", []):
			var c: Array = w["centre"]
			if w.get("steers", false):
				steer_z += float(c[2])
				ns += 1
			else:
				other_z += float(c[2])
				no += 1
		_ok(ns > 0 and no > 0 and steer_z / ns < other_z / no, "%s: steered wheels towards -Z (front)" % name)
	# Upright: nothing far below the ground, height above it.
	_ok(b.end.y > 0.3, "%s: +Y up (top at %.2f)" % [name, b.end.y])


func _check_nodes(scene: Node3D, m: Dictionary, name: String, kind: String) -> void:
	for d: Dictionary in m.get("doors", []):
		var n := _find(scene, d["node"])
		if _ok(n != null, "%s: door node %s" % [name, d["node"]]):
			var h: Array = d["hinge"]
			var o := _xf(n).origin
			# The hinge line is vertical (axis y) for car doors: compare x and z; others the whole point.
			var hp := Vector3(h[0], h[1], h[2])
			var axis: Array = d.get("axis", [0, 1, 0])
			if absf(float(axis[1])) > 0.9:
				hp.y = o.y
			_ok(o.distance_to(hp) < 0.03, "%s: %s origin on its hinge %s (at %s)" % [name, d["node"], hp, o])
	var st = m.get("steering")
	if st is Dictionary and st.get("node") != null:
		var n := _find(scene, st["node"])
		if _ok(n != null, "%s: steering node" % name):
			var hub: Array = st["hub"]
			_ok(_xf(n).origin.distance_to(Vector3(hub[0], hub[1], hub[2])) < 0.03, "%s: steering origin on the hub" % name)
	for group in ["seats", "grips", "cargo", "anchors"]:
		for a: Dictionary in m.get(group, []):
			if a.get("node") == null:
				continue
			var n := _find(scene, a["node"])
			if _ok(n != null, "%s: %s node %s" % [name, group, a["node"]]):
				var b := _bounds(scene)
				_ok(b.grow(0.05).has_point(_xf(n).origin), "%s: %s inside the model's bounds" % [name, a["node"]])
	for p: Dictionary in m.get("pivots", []):
		var n := _find(scene, p["node"])
		if _ok(n != null, "%s: pivot node %s (%s)" % [name, p["node"], p.get("what", "")]):
			var at: Array = p["pivot"]
			_ok(_xf(n).origin.distance_to(Vector3(at[0], at[1], at[2])) < 0.03, "%s: %s origin on its pivot" % [name, p["node"]])
			if p.has("axis"):
				var ax: Array = p["axis"]
				_ok(absf(Vector3(ax[0], ax[1], ax[2]).length() - 1.0) < 0.01, "%s: %s axis is a unit vector" % [name, p["node"]])
	if BODY_BUDGET.has(kind):
		var bogies := 0
		var bogie_nodes: Array = m.get("bogies", [])
		# 400 triangles per two-axle bogie with its wheelsets (research note); a Co-Co bogie has three.
		var axles_per_bogie := maxi(2, int(round(float(m.get("wheels", []).size()) / maxf(1.0, bogie_nodes.size()))))
		var bogie_budget := BOGIE_BUDGET * axles_per_bogie / 2
		for bn: String in bogie_nodes:
			var n := _find(scene, bn)
			if _ok(n != null, "%s: bogie node %s" % [name, bn]):
				var t := _triangles(n)
				bogies += t
				_ok(t <= bogie_budget, "%s: %s %d triangles <= %d" % [name, bn, t, bogie_budget])
		var body := _triangles(scene) - bogies
		_ok(body <= int(BODY_BUDGET[kind]), "%s: body %d triangles <= %d" % [name, body, int(BODY_BUDGET[kind])])
	for req: String in m.get("required_nodes", []):
		_ok(_find(scene, req) != null, "%s: node %s" % [name, req])


## The PNG images embedded in a GLB, by name (decoded from the BIN chunk, as the file holds them).
func _glb_images(path: String) -> Dictionary:
	var out := {}
	var data := FileAccess.get_file_as_bytes(path)
	if data.size() < 28:
		return out
	var json_len := data.decode_u32(12)
	var j: Dictionary = JSON.parse_string(data.slice(20, 20 + json_len).get_string_from_utf8())
	var bin_start := 20 + json_len + 8
	for im: Dictionary in j.get("images", []):
		if not im.has("bufferView"):
			continue
		var bv: Dictionary = j["bufferViews"][int(im["bufferView"])]
		var off := bin_start + int(bv.get("byteOffset", 0))
		var img := Image.new()
		if img.load_png_from_buffer(data.slice(off, off + int(bv["byteLength"]))) == OK:
			out[String(im.get("name", ""))] = img
	return out


func _texel(img: Image, uv: Array) -> Color:
	var x := clampi(int(float(uv[0]) * img.get_width()), 0, img.get_width() - 1)
	var y := clampi(int(float(uv[1]) * img.get_height()), 0, img.get_height() - 1)
	return img.get_pixel(x, y)


func _close(c: Color, srgb: Array, tol: int = 6) -> bool:
	return absi(c.r8 - int(srgb[0])) <= tol and absi(c.g8 - int(srgb[1])) <= tol and absi(c.b8 - int(srgb[2])) <= tol


func _check_textures(path: String, m: Dictionary, name: String) -> void:
	var images := _glb_images(path)
	if images.has("vehicle_palette_albedo") and not palette.is_empty():
		var img: Image = images["vehicle_palette_albedo"]
		var bad := ""
		var roles: Dictionary = palette["roles"]
		for r: String in roles:
			var cell: Dictionary = roles[r]
			if not _close(_texel(img, cell["uv"]), cell["albedo_srgb"], 2):
				bad += r + " "
		_ok(bad == "", "%s: embedded palette atlas matches palette.json %s" % [name, bad])
	for smp: Dictionary in m.get("texture_samples", []):
		var img2: Image = images.get(smp["image"])
		if not _ok(img2 != null, "%s: texture %s embedded" % [name, smp["image"]]):
			continue
		var c := _texel(img2, smp["uv"])
		_ok(_close(c, smp["srgb"]), "%s: %s texel is %s (got %d,%d,%d)" % [name, smp["what"], smp["srgb"], c.r8, c.g8, c.b8])
