extends TestCase
## The cast in assets/people/ (every GLB listed in people.json), measured on the models as the
## game loads them (decisions G-10 … G-19):
## - manifest: fields, files, unique ids, board figures, men and women per board, children
##   only in safe roles;
## - one shared skeleton: the same 52 bone names (`mixamorig_X`) and parents in every file;
## - budgets: `Body` <= 10,000 triangles, `Body_LOD1` <= 3,500, textures <= 512 px, and the
##   manifest's counts match;
## - the five clips idle, walk, run, sit, talk, all looping;
## - feet on the ground: the lowest sole vertex (skinned on the CPU with the file's weights) stays
##   at 0 through every clip and through 0.22 s gait blends (with assets/people/sole_plant.gd);
## - wrists not bent (the 70° lesson) and fingers relaxed, not clawed;
## - no material uses the vertex-colour channel, and the meshes carry none.
## Game time only: clips are sampled with seek() and blends advanced with advance().

const PeopleGltf := preload("res://tests/people/people_gltf.gd")
const SolePlant := preload("res://assets/people/sole_plant.gd")
const CLIPS: Array[String] = ["idle", "walk", "run", "sit", "talk"]
const LOD0_BUDGET := 10000
const LOD1_BUDGET := 3500
const TEXTURE_MAX := 512
const SOLE_TOLERANCE := 0.02  # metres: lowest sole vs the ground in a clip
const BLEND_SINK := 0.02  # metres: sole vs the ground during a 0.22 s blend, with SolePlant
## Largest angle between the forearm's line and the hand (wrist to middle knuckle) per clip. The
## Mixamo clips themselves flex the wrist up to 8.9° (idle), 33.6° (walk) and 40.8° (run); a
## retarget that misses the hand frames bends every wrist ~70°, which these limits catch.
const WRIST_MAX_DEG := {"idle": 20.0, "walk": 40.0, "run": 46.0, "sit": 35.0, "talk": 40.0}
## Largest bend at any finger joint (knuckle or middle joint). Relaxed hands curl 8-16° per
## joint; the clips' clawed fingers were 60-90°. A runner's loose fist is allowed more.
const FINGER_MAX_DEG := {"idle": 30.0, "walk": 30.0, "run": 50.0, "sit": 30.0, "talk": 30.0}
const FINGERS: Array[String] = ["Index", "Middle", "Ring", "Pinky"]
const SAFE_CHILD_ROLES: Array[String] = ["school", "passenger", "family", "play"]
const SAMPLES := 12


func test_manifest() -> bool:
	var people := PeopleGltf.read_manifest()
	check(people.size() == 70, "70 people in the manifest (%d)" % people.size())
	var ids := {}
	var per_board := {}
	for entry in people:
		var id := String(entry.get("id", ""))
		check(id != "" and not ids.has(id), "unique id %s" % id)
		ids[id] = true
		for key: String in ["file", "sex", "age", "roles", "clothing", "outfit", "board", "figure", "figureLabel", "heightM", "lods", "texture", "animations", "licence", "assets"]:
			check(entry.has(key), "%s has %s" % [id, key])
		check(FileAccess.file_exists(PeopleGltf.glb_path(entry)), "%s file exists" % id)
		check(["male", "female"].has(entry.get("sex")), "%s sex" % id)
		check(["child", "teen", "young", "middle", "elderly"].has(entry.get("age")), "%s age band" % id)
		var child := bool(entry.get("child", false))
		check(child == (entry.get("age") == "child"), "%s child flag matches age" % id)
		if child:
			# Children never where they can be hurt: no street, police, driver or worker roles.
			for role: Variant in entry.get("roles", []) as Array:
				check(SAFE_CHILD_ROLES.has(String(role)), "%s (child) has only safe roles, not %s" % [id, role])
		check((entry.get("animations", []) as Array) == Array(CLIPS), "%s lists the five clips" % id)
		var board := String(entry.get("board", ""))
		if not per_board.has(board):
			per_board[board] = {"male": 0, "female": 0}
		var counts := per_board[board] as Dictionary
		counts[entry.get("sex")] = int(counts[entry.get("sex")]) + 1
	# Phase 1: 10 + 10. Phase 2: 40 new people, of whom 4 board men cast as women (owner's
	# decision, G-17), and the ten added later (all male figures): 30 men, 20 women.
	var expected := {"phase1": [10, 10], "phase2": [30, 20]}
	for board: String in per_board:
		var counts := per_board[board] as Dictionary
		var want: Array = expected["phase1"] if board.contains("phase1") else expected["phase2"]
		check(int(counts["male"]) == int(want[0]) and int(counts["female"]) == int(want[1]),
			"%s: %d men and %d women (expected %d + %d)" % [board, counts["male"], counts["female"], want[0], want[1]])
	return true


func test_files_skeleton_budgets_materials_clips() -> bool:
	var reference_bones := PackedStringArray()
	var reference_parents := PackedInt32Array()
	for entry in PeopleGltf.read_manifest():
		var id := String(entry["id"])
		var scene := PeopleGltf.load_person(entry)
		if not check(scene != null, "%s loads" % id):
			continue
		root.add_child(scene)
		var skeleton := PeopleGltf.find_skeleton(scene)
		var player := PeopleGltf.find_player(scene)
		var lod0 := PeopleGltf.find_mesh(scene, "Body")
		var lod1 := PeopleGltf.find_mesh(scene, "Body_LOD1")
		if not check(skeleton != null and player != null and lod0 != null and lod1 != null, "%s has skeleton, player, Body and Body_LOD1" % id):
			scene.queue_free()
			continue
		# Skeleton
		var names := PackedStringArray()
		var parents := PackedInt32Array()
		for i in skeleton.get_bone_count():
			names.append(skeleton.get_bone_name(i))
			parents.append(skeleton.get_bone_parent(i))
		check(names.size() == 52, "%s has 52 bones (%d)" % [id, names.size()])
		var prefixed := true
		for n in names:
			prefixed = prefixed and n.begins_with("mixamorig_")
		check(prefixed, "%s bones are named mixamorig_<Bone>" % id)
		if reference_bones.is_empty():
			reference_bones = names
			reference_parents = parents
		else:
			check(names == reference_bones and parents == reference_parents, "%s shares the cast's skeleton (names and hierarchy)" % id)
		# Budgets
		var t0 := _triangles(lod0)
		var t1 := _triangles(lod1)
		check(t0 <= LOD0_BUDGET, "%s LOD0 %d <= %d triangles" % [id, t0, LOD0_BUDGET])
		check(t1 <= LOD1_BUDGET, "%s LOD1 %d <= %d triangles" % [id, t1, LOD1_BUDGET])
		check(t1 < t0, "%s LOD1 is lighter than LOD0" % id)
		var lods := entry["lods"] as Array
		var m0 := int((lods[0] as Dictionary)["triangles"])
		var m1 := int((lods[1] as Dictionary)["triangles"])
		# The importer drops the odd zero-area triangle the decimator leaves: allow 3.
		check(absi(m0 - t0) <= 3 and absi(m1 - t1) <= 3, "%s manifest triangle counts match the file (%d/%d vs %d/%d)" % [id, t0, t1, m0, m1])
		for mi: MeshInstance3D in [lod0, lod1]:
			for s in mi.mesh.get_surface_count():
				var mat := mi.mesh.surface_get_material(s) as BaseMaterial3D
				check(mat != null and not mat.vertex_color_use_as_albedo, "%s %s surface %d: vertex colour not used as albedo" % [id, mi.name, s])
				check(mi.mesh.surface_get_arrays(s)[Mesh.ARRAY_COLOR] == null, "%s %s surface %d: no vertex colour channel" % [id, mi.name, s])
				if mat and mat.albedo_texture:
					var size := mat.albedo_texture.get_size()
					check(size.x <= TEXTURE_MAX and size.y <= TEXTURE_MAX, "%s texture %dx%d <= %d px" % [id, size.x, size.y, TEXTURE_MAX])
		# Clips
		for clip in CLIPS:
			if check(player.has_animation(clip), "%s has clip %s" % [id, clip]):
				var anim := player.get_animation(clip)
				check(anim.length > 0.1, "%s %s has a length" % [id, clip])
				check(anim.loop_mode == Animation.LOOP_LINEAR, "%s %s loops (import settings)" % [id, clip])
		scene.queue_free()
	return true


func test_feet_wrists_fingers_in_every_clip() -> bool:
	var worst_sole := 0.0
	var worst_wrist := 0.0
	var worst_finger := 0.0
	for entry in PeopleGltf.read_manifest():
		var id := String(entry["id"])
		var scene := PeopleGltf.load_person(entry)
		if not check(scene != null, "%s loads" % id):
			continue
		root.add_child(scene)
		var skeleton := PeopleGltf.find_skeleton(scene)
		var player := PeopleGltf.find_player(scene)
		var sole := SoleProbe.new(skeleton, PeopleGltf.find_mesh(scene, "Body"))
		check(sole.count() > 20, "%s has sole vertices (%d)" % [id, sole.count()])
		for clip in CLIPS:
			if not player.has_animation(clip):
				continue
			var anim := player.get_animation(clip)
			player.play(clip)
			var low := INF
			var high := -INF
			var wrist := 0.0
			var finger := 0.0
			for k in SAMPLES:
				player.seek(anim.length * k / SAMPLES, true)
				var h := sole.lowest()
				low = minf(low, h)
				high = maxf(high, h)
				wrist = maxf(wrist, _wrist_angle(skeleton))
				finger = maxf(finger, _finger_angle(skeleton))
			player.stop()
			worst_sole = maxf(worst_sole, maxf(absf(low), absf(high)))
			worst_wrist = maxf(worst_wrist, wrist)
			worst_finger = maxf(worst_finger, finger)
			check(absf(low) <= SOLE_TOLERANCE and absf(high) <= SOLE_TOLERANCE,
				"%s %s: lowest sole stays on the ground (%.3f .. %.3f m)" % [id, clip, low, high])
			check(wrist <= float(WRIST_MAX_DEG[clip]), "%s %s: wrists straight enough (%.1f <= %.0f deg)" % [id, clip, wrist, WRIST_MAX_DEG[clip]])
			check(finger <= float(FINGER_MAX_DEG[clip]), "%s %s: fingers relaxed, not clawed (%.1f <= %.0f deg)" % [id, clip, finger, FINGER_MAX_DEG[clip]])
		scene.queue_free()
	print("    people: worst sole %.3f m, wrist %.1f deg, finger joint %.1f deg" % [worst_sole, worst_wrist, worst_finger])
	return true


func test_soles_through_gait_blends() -> bool:
	var worst := 0.0
	var worst_raw := 0.0
	for entry in PeopleGltf.read_manifest():
		var id := String(entry["id"])
		var scene := PeopleGltf.load_person(entry)
		if not check(scene != null, "%s loads" % id):
			continue
		root.add_child(scene)
		var skeleton := PeopleGltf.find_skeleton(scene)
		var player := PeopleGltf.find_player(scene)
		var body := PeopleGltf.find_mesh(scene, "Body")
		var sole := SoleProbe.new(skeleton, body)
		skeleton.reset_bone_poses()
		var plant := SolePlant.new(skeleton, body)
		var dip := 0.0
		var raw_dip := 0.0
		for pair: Array in [["idle", "walk"], ["walk", "run"], ["run", "walk"], ["walk", "idle"], ["run", "idle"], ["idle", "talk"], ["talk", "walk"]]:
			player.play(String(pair[0]))
			player.seek(0.0, true)
			player.advance(0.37)
			player.play(String(pair[1]), 0.22)
			for k in 12:
				player.advance(0.022)
				skeleton.position.y = plant.base_y
				raw_dip = maxf(raw_dip, -sole.lowest())
				plant.apply()
				dip = maxf(dip, absf(sole.lowest()))
			player.stop()
		skeleton.position.y = plant.base_y
		worst = maxf(worst, dip)
		worst_raw = maxf(worst_raw, raw_dip)
		check(dip <= BLEND_SINK, "%s: soles within %.3f m of the ground in gait blends (%.3f; %.3f without planting)" % [id, BLEND_SINK, dip, raw_dip])
		scene.queue_free()
	print("    people: worst blend %.3f m with planting, %.3f m without" % [worst, worst_raw])
	return true


func _triangles(mi: MeshInstance3D) -> int:
	var total := 0
	for s in mi.mesh.get_surface_count():
		var arrays := mi.mesh.surface_get_arrays(s)
		var idx: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		total += idx.size() / 3 if idx.size() > 0 else verts.size() / 3
	return total


func _wrist_angle(skeleton: Skeleton3D) -> float:
	var worst_deg := 0.0
	for side: String in ["Left", "Right"]:
		var elbow := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sForeArm" % side)).origin
		var wrist := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sHand" % side)).origin
		var knuckle := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sHandMiddle1" % side)).origin
		worst_deg = maxf(worst_deg, rad_to_deg((wrist - elbow).angle_to(knuckle - wrist)))
	return worst_deg


## The largest bend at the knuckle or middle joint of the four fingers (both hands).
func _finger_angle(skeleton: Skeleton3D) -> float:
	var worst_deg := 0.0
	for side: String in ["Left", "Right"]:
		var wrist := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sHand" % side)).origin
		for finger in FINGERS:
			var p1 := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sHand%s1" % [side, finger])).origin
			var p2 := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sHand%s2" % [side, finger])).origin
			var p3 := skeleton.get_bone_global_pose(skeleton.find_bone("mixamorig_%sHand%s3" % [side, finger])).origin
			worst_deg = maxf(worst_deg, rad_to_deg((p1 - wrist).angle_to(p2 - p1)))
			worst_deg = maxf(worst_deg, rad_to_deg((p2 - p1).angle_to(p3 - p2)))
	return worst_deg


## The lowest vertices of the feet (soles, shoes), skinned on the CPU with the mesh's own
## weights, in world space.
class SoleProbe:
	var skeleton: Skeleton3D
	var skin: Skin
	var bind_bone := PackedInt32Array()
	var points: Array[Array] = []  # [Vector3 rest position, PackedInt32Array binds, PackedFloat32Array weights]

	func _init(skel: Skeleton3D, mi: MeshInstance3D) -> void:
		skeleton = skel
		skin = mi.skin
		for b in skin.get_bind_count():
			var bone := skin.get_bind_bone(b)
			if bone < 0:
				bone = skel.find_bone(skin.get_bind_name(b))
			bind_bone.append(bone)
		skeleton.reset_bone_poses()
		for s in mi.mesh.get_surface_count():
			var arrays := mi.mesh.surface_get_arrays(s)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var bones: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
			var weights: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
			var per := bones.size() / maxi(1, verts.size())
			for i in verts.size():
				var c: Array = [verts[i], bones.slice(i * per, i * per + per), weights.slice(i * per, i * per + per)]
				if _skin(c).y < 0.06:
					points.append(c)

	func count() -> int:
		return points.size()

	func _skin(c: Array) -> Vector3:
		var v: Vector3 = c[0]
		var idx: PackedInt32Array = c[1]
		var w: PackedFloat32Array = c[2]
		var out := Vector3.ZERO
		for j in idx.size():
			if w[j] <= 0.0:
				continue
			out += (skeleton.get_bone_global_pose(bind_bone[idx[j]]) * skin.get_bind_pose(idx[j]) * v) * w[j]
		return skeleton.global_transform * out

	func lowest() -> float:
		var low := INF
		for c in points:
			low = minf(low, _skin(c).y)
		return low
