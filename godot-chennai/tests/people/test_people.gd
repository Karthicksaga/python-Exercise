## Headless checks of the cast in assets/people/ (every GLB listed in people.json), measured on
## the real models as Godot loads them:
## - manifest: fields, files, unique ids, children flagged, board figure recorded, 10/10 or
##   30/30 men and women per board;
## - one shared skeleton: the same 52 bone names (Godot's `mixamorig_X`) and parents in every file;
## - budgets: LOD0 (`Body`) <= 10,000 triangles, LOD1 (`Body_LOD1`) <= 3,500, textures <= 512 px,
##   and the manifest's counts match the files;
## - the five clips idle, walk, run, sit, talk, named the same everywhere;
## - feet on the ground: the lowest sole vertex (skinned on the CPU with the file's own weights)
##   stays at 0 through every clip, and does not sink far during 0.22 s gait blends;
## - wrists not bent: the hand stays within a small angle of the forearm's line (the 70 degree
##   wrist lesson of the Three.js version);
## - no material uses the vertex-colour channel, and the meshes carry none.
## Time is game time only: clips are sampled with seek() and blends advanced with advance().
## Run: tools/run_people_tests.sh  (exit code 0 = all passed).
extends SceneTree

const PeopleGltf := preload("res://tests/people/people_gltf.gd")
const SolePlant := preload("res://assets/people/sole_plant.gd")
const CLIPS: Array[String] = ["idle", "walk", "run", "sit", "talk"]
const LOD0_BUDGET := 10000
const LOD1_BUDGET := 3500
const TEXTURE_MAX := 512
const SOLE_TOLERANCE := 0.02  # metres: lowest sole vs the ground in a clip
const BLEND_SINK := 0.02  # metres: how far a sole may dip during a 0.22 s blend (with SolePlant)
## Largest angle between the forearm's line and the hand (wrist to middle knuckle) per clip. The
## Mixamo clips themselves flex the wrist up to 8.9 deg (idle), 33.6 (walk) and 40.8 (run); a
## retarget that misses the hand frames bends every wrist ~70 deg, which these limits catch.
const WRIST_MAX_DEG := {"idle": 20.0, "walk": 40.0, "run": 46.0, "sit": 35.0, "talk": 40.0}
const SAMPLES := 12

var passed := 0
var failed := 0
var reference_bones: PackedStringArray = []
var reference_parents: PackedInt32Array = []
var worst := {"sole": 0.0, "blend": 0.0, "wrist": 0.0}


func _initialize() -> void:
	await process_frame
	var only: PackedStringArray = []
	var args := OS.get_cmdline_user_args()
	if args.size() >= 2 and args[0] == "--only":
		only = args[1].split(",", false)
	var people := PeopleGltf.read_manifest()
	check(people.size() > 0, "manifest lists people")
	test_manifest(people)
	for entry: Dictionary in people:
		if not only.is_empty() and not only.has(entry["id"]):
			continue
		if test_person(entry) != true:
			failed += 1
			push_error("FAIL %s: test did not finish (runtime error?)" % entry["id"])
	print("worst sole %.3f m, worst blend %.3f m (%.3f m without planting), worst wrist %.1f deg" % [worst["sole"], worst["blend"], worst.get("blend_raw", 0.0), worst["wrist"]])
	print("Results: %d passed, %d failed" % [passed, failed])
	quit(1 if failed > 0 else 0)


func check(ok: bool, label: String) -> void:
	if ok:
		passed += 1
	else:
		failed += 1
		push_error("FAIL " + label)


# ---------------------------------------------------------------------------------------------
# Manifest
# ---------------------------------------------------------------------------------------------
func test_manifest(people: Array) -> void:
	var ids := {}
	var per_board := {}
	for entry: Dictionary in people:
		var id := String(entry.get("id", ""))
		check(id != "" and not ids.has(id), "unique id %s" % id)
		ids[id] = true
		for key in ["file", "sex", "age", "roles", "clothing", "outfit", "board", "figure", "figureLabel", "heightM", "lods", "texture", "animations", "licence", "assets"]:
			check(entry.has(key), "%s has %s" % [id, key])
		check(FileAccess.file_exists(PeopleGltf.glb_path(entry)), "%s file exists" % id)
		check(["male", "female"].has(entry.get("sex")), "%s sex" % id)
		check(["child", "teen", "young", "middle", "elderly"].has(entry.get("age")), "%s age band" % id)
		check(bool(entry.get("child", false)) == (entry.get("age") == "child"), "%s child flag matches age" % id)
		if entry.get("age") == "child":
			# Children never where they can be hurt: no street, police, driver or worker roles.
			for role: String in entry.get("roles", []):
				check(["school", "passenger", "family"].has(role), "%s (child) has only safe roles, not %s" % [id, role])
		check(Array(entry.get("animations", [])) == CLIPS, "%s lists the five clips" % id)
		var board := String(entry.get("board", ""))
		if not per_board.has(board):
			per_board[board] = {"male": 0, "female": 0}
		per_board[board][entry.get("sex")] += 1
	for board: String in per_board:
		var counts: Dictionary = per_board[board]
		var expected := 10 if board.contains("phase1") else 20
		check(counts["male"] == expected and counts["female"] == expected,
			"%s: %d men and %d women (expected %d + %d)" % [board, counts["male"], counts["female"], expected, expected])


# ---------------------------------------------------------------------------------------------
# One person
# ---------------------------------------------------------------------------------------------
func test_person(entry: Dictionary) -> bool:
	var id := String(entry["id"])
	var scene := PeopleGltf.load_person(entry)
	check(scene != null, "%s loads" % id)
	if scene == null:
		return true
	root.add_child(scene)
	var skeleton := PeopleGltf.find_skeleton(scene)
	var player := PeopleGltf.find_player(scene)
	var lod0 := PeopleGltf.find_mesh(scene, "Body")
	var lod1 := PeopleGltf.find_mesh(scene, "Body_LOD1")
	check(skeleton != null and player != null and lod0 != null and lod1 != null, "%s has skeleton, player, Body and Body_LOD1" % id)
	if skeleton == null or player == null or lod0 == null or lod1 == null:
		scene.queue_free()
		return true
	_check_skeleton(id, skeleton)
	_check_budgets(id, entry, lod0, lod1)
	_check_materials(id, lod0)
	_check_materials(id, lod1)
	for clip in CLIPS:
		check(player.has_animation(clip), "%s has clip %s" % [id, clip])
	if player.has_animation("idle") and player.has_animation("walk") and player.has_animation("run"):
		var sole := SoleProbe.new(skeleton, lod0)
		check(sole.count() > 20, "%s has sole vertices (%d)" % [id, sole.count()])
		for clip in CLIPS:
			if player.has_animation(clip):
				_check_clip(id, player, skeleton, sole, clip)
		_check_blends(id, player, skeleton, lod0, sole)
	scene.queue_free()
	return true


func _check_skeleton(id: String, skeleton: Skeleton3D) -> void:
	var names: PackedStringArray = []
	var parents: PackedInt32Array = []
	for i in skeleton.get_bone_count():
		names.append(skeleton.get_bone_name(i))
		parents.append(skeleton.get_bone_parent(i))
	check(names.size() == 52, "%s has 52 bones (%d)" % [id, names.size()])
	for required in ["mixamorig_Hips", "mixamorig_Head", "mixamorig_LeftHand", "mixamorig_RightFoot", "mixamorig_LeftHandIndex1"]:
		check(names.has(required), "%s has bone %s" % [id, required])
	var prefixed := true
	for n in names:
		prefixed = prefixed and n.begins_with("mixamorig_")
	check(prefixed, "%s bones are named mixamorig_<Bone>" % id)
	if reference_bones.is_empty():
		reference_bones = names
		reference_parents = parents
	else:
		check(names == reference_bones and parents == reference_parents, "%s shares the cast's skeleton (names and hierarchy)" % id)


func _triangles(mi: MeshInstance3D) -> int:
	var total := 0
	for s in mi.mesh.get_surface_count():
		var arrays := mi.mesh.surface_get_arrays(s)
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		total += idx.size() / 3 if idx.size() > 0 else (arrays[Mesh.ARRAY_VERTEX] as PackedVector3Array).size() / 3
	return total


func _check_budgets(id: String, entry: Dictionary, lod0: MeshInstance3D, lod1: MeshInstance3D) -> void:
	var t0 := _triangles(lod0)
	var t1 := _triangles(lod1)
	check(t0 <= LOD0_BUDGET, "%s LOD0 %d <= %d triangles" % [id, t0, LOD0_BUDGET])
	check(t1 <= LOD1_BUDGET, "%s LOD1 %d <= %d triangles" % [id, t1, LOD1_BUDGET])
	check(t1 < t0, "%s LOD1 is lighter than LOD0" % id)
	var lods: Array = entry["lods"]
	# Godot's importer drops the odd zero-area triangle the decimator leaves: allow 3.
	check(absi(int(lods[0]["triangles"]) - t0) <= 3 and absi(int(lods[1]["triangles"]) - t1) <= 3,
		"%s manifest triangle counts match the file (%d/%d vs %s/%s)" % [id, t0, t1, lods[0]["triangles"], lods[1]["triangles"]])
	for s in lod0.mesh.get_surface_count():
		var mat := lod0.mesh.surface_get_material(s) as BaseMaterial3D
		if mat and mat.albedo_texture:
			var size := mat.albedo_texture.get_size()
			check(size.x <= TEXTURE_MAX and size.y <= TEXTURE_MAX, "%s texture %dx%d <= %d px" % [id, size.x, size.y, TEXTURE_MAX])


func _check_materials(id: String, mi: MeshInstance3D) -> void:
	for s in mi.mesh.get_surface_count():
		var mat := mi.mesh.surface_get_material(s) as BaseMaterial3D
		check(mat != null and not mat.vertex_color_use_as_albedo, "%s %s surface %d: vertex colour not used as albedo" % [id, mi.name, s])
		var arrays := mi.mesh.surface_get_arrays(s)
		check(arrays[Mesh.ARRAY_COLOR] == null, "%s %s surface %d: no vertex colour channel" % [id, mi.name, s])


func _check_clip(id: String, player: AnimationPlayer, skeleton: Skeleton3D, sole: SoleProbe, clip: String) -> void:
	var anim := player.get_animation(clip)
	check(anim.length > 0.1, "%s %s has a length" % [id, clip])
	player.play(clip)
	var low := INF
	var high := -INF
	var wrist := 0.0
	for k in SAMPLES:
		player.seek(anim.length * k / SAMPLES, true)
		var h := sole.lowest()
		low = minf(low, h)
		high = maxf(high, h)
		wrist = maxf(wrist, _wrist_angle(skeleton))
	player.stop()
	worst["sole"] = maxf(worst["sole"], maxf(absf(low), absf(high)))
	worst["wrist"] = maxf(worst["wrist"], wrist)
	check(absf(low) <= SOLE_TOLERANCE and absf(high) <= SOLE_TOLERANCE,
		"%s %s: lowest sole stays on the ground (%.3f .. %.3f m)" % [id, clip, low, high])
	check(wrist <= WRIST_MAX_DEG[clip], "%s %s: wrists straight enough (%.1f <= %.0f deg)" % [id, clip, wrist, WRIST_MAX_DEG[clip]])


func _check_blends(id: String, player: AnimationPlayer, skeleton: Skeleton3D, body: MeshInstance3D, sole: SoleProbe) -> void:
	# Cross-fades between the gaits, advanced in game time, with the runtime sole planting the
	# game uses (assets/people/sole_plant.gd); the dip without it is reported for information.
	skeleton.reset_bone_poses()
	var plant := SolePlant.new(skeleton, body)
	var dip := 0.0
	var raw_dip := 0.0
	for pair in [["idle", "walk"], ["walk", "run"], ["run", "walk"], ["walk", "idle"], ["run", "idle"], ["idle", "talk"], ["talk", "walk"]]:
		player.play(pair[0])
		player.seek(0.0, true)
		player.advance(0.37)
		player.play(pair[1], 0.22)
		for k in 12:
			player.advance(0.022)
			skeleton.position.y = plant.base_y
			raw_dip = maxf(raw_dip, -sole.lowest())
			plant.apply()
			dip = maxf(dip, absf(sole.lowest()))
		player.stop()
	skeleton.position.y = plant.base_y
	worst["blend"] = maxf(worst["blend"], dip)
	worst["blend_raw"] = maxf(worst.get("blend_raw", 0.0), raw_dip)
	check(dip <= BLEND_SINK, "%s: soles within %.3f m of the ground in gait blends (%.3f; %.3f without planting)" % [id, BLEND_SINK, dip, raw_dip])


func _wrist_angle(skeleton: Skeleton3D) -> float:
	var worst_deg := 0.0
	for side in ["Left", "Right"]:
		var fore := skeleton.find_bone("mixamorig_%sForeArm" % side)
		var hand := skeleton.find_bone("mixamorig_%sHand" % side)
		var mid := skeleton.find_bone("mixamorig_%sHandMiddle1" % side)
		var elbow := skeleton.get_bone_global_pose(fore).origin
		var wrist := skeleton.get_bone_global_pose(hand).origin
		var knuckle := skeleton.get_bone_global_pose(mid).origin
		var a := (wrist - elbow).normalized()
		var b := (knuckle - wrist).normalized()
		worst_deg = maxf(worst_deg, rad_to_deg(a.angle_to(b)))
	return worst_deg


## The lowest vertices of the feet (soles, shoes), skinned on the CPU with the mesh's own
## weights, in world space.
class SoleProbe:
	var skeleton: Skeleton3D
	var skin: Skin
	var bind_bone: PackedInt32Array = []
	var points: Array = []  # [Vector3 rest position, PackedInt32Array bind indices, PackedFloat32Array weights]

	func _init(skel: Skeleton3D, mi: MeshInstance3D) -> void:
		skeleton = skel
		skin = mi.skin
		for b in skin.get_bind_count():
			var bone := skin.get_bind_bone(b)
			if bone < 0:
				bone = skel.find_bone(skin.get_bind_name(b))
			bind_bone.append(bone)
		skeleton.reset_bone_poses()
		var candidates: Array = []
		for s in mi.mesh.get_surface_count():
			var arrays := mi.mesh.surface_get_arrays(s)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
			var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
			var per := bones.size() / maxi(1, verts.size())
			for i in verts.size():
				candidates.append([verts[i], bones.slice(i * per, i * per + per), weights.slice(i * per, i * per + per)])
		for c: Array in candidates:
			if _skin(c).y < 0.06:
				points.append(c)

	func count() -> int:
		return points.size()

	func _skin(c: Array) -> Vector3:
		var v: Vector3 = c[0]
		var out := Vector3.ZERO
		var idx: PackedInt32Array = c[1]
		var w: PackedFloat32Array = c[2]
		for j in idx.size():
			if w[j] <= 0.0:
				continue
			var bone := bind_bone[idx[j]]
			out += (skeleton.get_bone_global_pose(bone) * skin.get_bind_pose(idx[j]) * v) * w[j]
		return skeleton.global_transform * out

	func lowest() -> float:
		var low := INF
		for c: Array in points:
			low = minf(low, _skin(c).y)
		return low
