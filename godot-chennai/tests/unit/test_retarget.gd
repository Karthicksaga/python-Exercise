extends TestCase
## Retargeting on small hand-built rigs (port of the Three.js `retarget.test.ts`).


func test_bone_names_lose_every_form_of_the_mixamo_prefix() -> bool:
	assert_eq(BoneNames.plain("mixamorig:Hips"), "Hips", "colon")
	assert_eq(BoneNames.plain("mixamorigLeftArm"), "LeftArm", "no separator")
	assert_eq(BoneNames.plain("mixamorig_RightUpLeg"), "RightUpLeg", "underscore (Godot's import)")
	assert_eq(BoneNames.plain("Spine2"), "Spine2", "plain stays")
	assert_eq(BoneNames.plain("mixamorigs"), "mixamorigs", "only a prefix before a bone name")
	return true


## Hips -> Spine -> Head and a left leg, named by `prefix`.
func _skeleton(prefix: String, scale: float = 1.0) -> RigData:
	var rig := RigData.new()
	rig.to_model = Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * scale), Vector3.ZERO)
	rig.add_bone(prefix + "Hips", -1, Transform3D(Basis.IDENTITY, Vector3(0, 1, 0)))
	rig.add_bone(prefix + "Spine", 0, Transform3D(Basis.IDENTITY, Vector3(0, 0.2, 0)))
	rig.add_bone(prefix + "Head", 1, Transform3D(Basis.IDENTITY, Vector3(0, 0.5, 0)))
	rig.add_bone(prefix + "LeftUpLeg", 0, Transform3D(Basis.IDENTITY, Vector3(0.1, -0.05, 0)))
	rig.add_bone(prefix + "LeftLeg", 3, Transform3D(Basis.IDENTITY, Vector3(0, -0.45, 0)))
	rig.add_bone(prefix + "LeftFoot", 4, Transform3D(Basis.IDENTITY, Vector3(0, -0.45, 0)))
	return rig


func _rot_track(clip: Animation, path: String, keys: Array) -> void:
	var t := clip.add_track(Animation.TYPE_ROTATION_3D)
	clip.track_set_path(t, NodePath(path))
	for k: Array in keys:
		clip.rotation_track_insert_key(t, float(k[0]), k[1] as Quaternion)


func test_drives_an_mpfb_style_rig_from_mixamo_named_clips() -> bool:
	var source := _skeleton("mixamorig_")
	var target := _skeleton("mixamorig_")
	var turned := Quaternion(Vector3.UP, 0.6)
	var clip := Animation.new()
	clip.length = 1.0
	_rot_track(clip, "Armature/mixamorig_Spine", [[0.0, Quaternion.IDENTITY], [1.0, turned]])
	var result := Retarget.run(source, {"walk": clip}, target, "Skeleton3D", null)
	var out := result.clips["walk"]
	var spine := out.find_track(NodePath("Skeleton3D:mixamorig_Spine"), Animation.TYPE_ROTATION_3D)
	assert_true(spine >= 0, "a Spine track on the target's skeleton")
	assert_true(out.rotation_track_interpolate(spine, 1.0).angle_to(turned) < 0.01, "same rest pose: the source's rotation")
	assert_eq(out.find_track(NodePath("Skeleton3D:mixamorig_Hips"), Animation.TYPE_POSITION_3D), -1, "no soles given: no hip track")
	return true


func test_lines_up_an_a_pose_hand_and_fingers_with_t_pose_clips() -> bool:
	var source := _arm(Vector3(1, 0, 0))
	var target := _arm(Vector3(1, -1, 0).normalized())
	var clip := Animation.new()
	clip.length = 1.0
	var q := func(axis: Vector3, angle: float) -> Quaternion: return Quaternion(axis.normalized(), angle)
	_rot_track(clip, "A/LeftArm", [[0.0, q.call(Vector3.BACK, -1.4)], [1.0, q.call(Vector3.BACK, -1.4)]])
	_rot_track(clip, "A/LeftHand", [[0.0, q.call(Vector3.BACK, 0.3)], [1.0, q.call(Vector3.BACK, 0.3)]])
	_rot_track(clip, "A/LeftHandMiddle1", [[0.0, q.call(Vector3.BACK, -0.6)], [1.0, q.call(Vector3.BACK, -0.6)]])
	var out := Retarget.run(source, {"idle": clip}, target, "Skeleton3D", null).clips["idle"]
	var src := Retarget.sample_source(source, clip, 0.5)
	var locals: Array[Quaternion] = []
	for t in target.rest_local:
		locals.append(t.basis.get_rotation_quaternion())
	for tr in out.get_track_count():
		locals[target.find(out.track_get_path(tr).get_concatenated_subnames())] = out.rotation_track_interpolate(tr, 0.5)
	var mine := target.pose_model(locals, {})
	for pair: Array in [["LeftArm", "LeftForeArm"], ["LeftHand", "LeftHandMiddle1"], ["LeftHandMiddle1", "LeftHandMiddle2"], ["LeftHandIndex1", "LeftHandPinky1"]]:
		var a := (mine[target.find(pair[1])].origin - mine[target.find(pair[0])].origin).normalized()
		var b := (src[source.find(pair[1])].origin - src[source.find(pair[0])].origin).normalized()
		assert_true(a.angle_to(b) < 0.01, "%s to %s: %.4f rad apart" % [pair[0], pair[1], a.angle_to(b)])
	return true


## A left arm pointing along `d` (straight out: T-pose; 45° down: A-pose) with a hand and fingers.
func _arm(d: Vector3) -> RigData:
	var rig := RigData.new()
	var side := Vector3(0, 0, 0.03)
	rig.add_bone("Hips", -1, Transform3D(Basis.IDENTITY, Vector3(0, 1, 0)))
	rig.add_bone("LeftArm", 0, Transform3D(Basis.IDENTITY, Vector3(0.2, 0.4, 0)))
	rig.add_bone("LeftForeArm", 1, Transform3D(Basis.IDENTITY, d * 0.3))
	rig.add_bone("LeftHand", 2, Transform3D(Basis.IDENTITY, d * 0.25))
	rig.add_bone("LeftHandIndex1", 3, Transform3D(Basis.IDENTITY, d * 0.08 + side))
	rig.add_bone("LeftHandMiddle1", 3, Transform3D(Basis.IDENTITY, d * 0.08))
	rig.add_bone("LeftHandMiddle2", 5, Transform3D(Basis.IDENTITY, d * 0.04))
	rig.add_bone("LeftHandPinky1", 3, Transform3D(Basis.IDENTITY, d * 0.08 - side))
	return rig


func test_people_manifest_resolves_legacy_paths() -> bool:
	var m := PeopleManifest.open(PeopleManifest.LEGACY)
	assert_true(m.ids().size() >= 30, "the legacy cast is listed (%d)" % m.ids().size())
	assert_eq(m.model_path("man-shirt-young"), "res://assets/people/legacy/man_shirt_young.glb", "people/x.glb resolves beside the manifest")
	assert_eq(m.model_path("nobody"), "", "unknown id")
	assert_true(m.height("man-shirt-young") > 1.7, "manifest height")
	return true
