extends TestCase
## The player's model with the retargeted clips, measured on the real mesh (§7 lessons): soles on
## the ground through idle, walk, run and every blend between them; wrists that bend no more than
## the clips' own; upper arms brought in towards the body but clear of the hips.

## Soles may be this far off the ground at any step (acceptance: 1 cm), metres.
const SOLE_TOLERANCE := 0.01
## Standing, the hands hang almost in line with the forearms: at most this bent, degrees (the
## Three.js bug bent every wrist about 70° in). Walking and running, the clips' own wrists flex
## more (33° and 40°); the player's may bend at most WRIST_OVER_CLIP more than the clip's.
const WRIST_IDLE_MAX := 15.0
const WRIST_OVER_CLIP := 3.0
## Joint directions match the clip rig's at every sampled frame, degrees.
const DIRECTION_TOLERANCE := 2.0

var figure: HumanFigure


func before_each() -> void:
	figure = HumanFigure.new()
	root.add_child(figure)
	var error := await figure.load_model(PeopleManifest.DEFAULT_PLAYER, PlayerController.HEIGHT)
	check(error == "", "player model loads: %s" % error)


## Steps the figure at `speed` for `seconds` of game time; returns min/max sole height, max wrist
## bend and min/max upper-arm angle over the steps.
func _run(speed: float, seconds: float) -> Dictionary:
	var low := INF
	var high := -INF
	var wrist := 0.0
	var arm_low := INF
	var arm_high := -INF
	var steps := roundi(seconds * 60.0)
	for i in steps:
		figure.advance(1.0 / 60.0, speed, true)
		var h := figure.feet_height()
		low = minf(low, h)
		high = maxf(high, h)
		var p := figure.poses()
		for side: String in ["Left", "Right"]:
			wrist = maxf(wrist, figure.wrist_bend(side, p))
			var a := figure.arm_out(side, p)
			arm_low = minf(arm_low, a)
			arm_high = maxf(arm_high, a)
	return {"low": low, "high": high, "wrist": wrist, "arm_low": arm_low, "arm_high": arm_high}


func _report(what: String, r: Dictionary) -> void:
	print("    %s: soles %.4f..%.4f m, wrist <= %.1f°, upper arms %.1f..%.1f° out" % [what, r["low"], r["high"], r["wrist"], r["arm_low"], r["arm_high"]])


func test_soles_stay_on_the_ground_in_every_gait() -> bool:
	if not figure.is_ready():
		return false
	for case: Array in [["idle", 0.0], ["walk", 1.6], ["slow walk", 0.8], ["run", 6.2], ["jog", 3.6]]:
		var r := _run(float(case[1]), 2.5)
		_report(str(case[0]), r)
		assert_true(float(r["low"]) > -SOLE_TOLERANCE, "%s: sole sank %.4f m" % [case[0], r["low"]])
		assert_true(float(r["high"]) < SOLE_TOLERANCE, "%s: soles lifted %.4f m" % [case[0], r["high"]])
	return true


func test_soles_stay_on_the_ground_through_blends() -> bool:
	if not figure.is_ready():
		return false
	# Every change of gait, sampled through its 0.22 s blend (and a little after).
	var worst := 0.0
	for speed: float in [0.0, 1.6, 6.2, 1.6, 0.0, 6.2, 0.0, 2.4, 4.0, 2.4]:
		var r := _run(speed, 0.4)
		worst = maxf(worst, maxf(-float(r["low"]), float(r["high"])))
		assert_true(float(r["low"]) > -SOLE_TOLERANCE and float(r["high"]) < SOLE_TOLERANCE, "blend into %.1f m/s: soles %.4f..%.4f m" % [speed, r["low"], r["high"]])
	print("    blends: soles within %.4f m" % worst)
	return true


func test_wrists_and_arms_are_natural() -> bool:
	if not figure.is_ready():
		return false
	for case: Array in [["idle", 0.0], ["walk", 1.6], ["run", 6.2]]:
		var r := _run(float(case[1]), 2.5)
		_report(str(case[0]), r)
		if case[0] == "idle":
			assert_true(float(r["wrist"]) < WRIST_IDLE_MAX, "idle: a wrist bends %.1f°" % r["wrist"])
		# Upper arms settled in, but the hands clear the hips.
		assert_true(float(r["arm_low"]) >= HumanFigure.ARM_MIN_OUT - 0.5, "%s: an upper arm %.1f° out, into the body" % [case[0], r["arm_low"]])
	return true


func test_wrists_bend_like_the_clips() -> bool:
	if not figure.is_ready():
		return false
	# The source clips' own wrist bends (the clip rig of locomotion.glb): the retargeted hands bend about as much.
	var source := LocomotionClips.source()
	var clips := LocomotionClips.clips()
	var arm := {}
	for side: String in ["Left", "Right"]:
		arm[side] = [source.find(side + "ForeArm"), source.find(side + "Hand"), source.find(side + "HandMiddle1")]
	for n: String in ["idle", "walk", "run"]:
		var clip := clips[n]
		var source_max := 0.0
		for k in 30:
			var p := Retarget.sample_source(source, clip, clip.length * k / 30.0)
			for side: String in ["Left", "Right"]:
				var b: Array = arm[side]
				var fore := p[int(b[1])].origin - p[int(b[0])].origin
				var hand := p[int(b[2])].origin - p[int(b[1])].origin
				source_max = maxf(source_max, rad_to_deg(fore.angle_to(hand)))
		var r := _run({"idle": 0.0, "walk": 1.6, "run": 6.2}[n] as float, clip.length * 2.0 + 0.3)
		print("    %s: clip wrists <= %.1f°, player's <= %.1f°" % [n, source_max, r["wrist"]])
		assert_true(float(r["wrist"]) < source_max + WRIST_OVER_CLIP, "%s: wrists bend %.1f°, the clip only %.1f°" % [n, r["wrist"], source_max])
	return true


func test_hands_and_fingers_point_as_in_the_clips() -> bool:
	if not figure.is_ready():
		return false
	# Pose the player's rig from the baked clips and the clip rig from the source clips at the
	# same moments: arms, hands (along the fingers and across the knuckles) and finger joints
	# point the same way. This is what keeps A-pose wrists from bending in (§7).
	var source := LocomotionClips.source()
	var rig := figure.rig
	var pairs: Array[PackedStringArray] = []
	for side: String in ["Left", "Right"]:
		pairs.append(PackedStringArray([side + "Arm", side + "ForeArm"]))
		pairs.append(PackedStringArray([side + "ForeArm", side + "Hand"]))
		pairs.append(PackedStringArray([side + "Hand", side + "HandMiddle1"]))
		pairs.append(PackedStringArray([side + "HandIndex1", side + "HandPinky1"]))
		pairs.append(PackedStringArray([side + "HandMiddle1", side + "HandMiddle2"]))
		pairs.append(PackedStringArray([side + "HandIndex1", side + "HandIndex2"]))
		pairs.append(PackedStringArray([side + "UpLeg", side + "Leg"]))
		pairs.append(PackedStringArray([side + "Leg", side + "Foot"]))
	var worst := 0.0
	for n: String in ["idle", "walk", "run"]:
		var clip: Animation = LocomotionClips.clips()[n]
		var baked: Animation = figure.baked.clips[n]
		for k in 12:
			var t := clip.length * k / 12.0
			var src := Retarget.sample_source(source, clip, t)
			var mine := _pose_baked(rig, baked, t)
			for pair in pairs:
				var a := (mine[rig.find(pair[1])].origin - mine[rig.find(pair[0])].origin).normalized()
				var b := (src[source.find(pair[1])].origin - src[source.find(pair[0])].origin).normalized()
				if pair[0].ends_with("Index1"):
					# Across the knuckles: the rigs' knuckle lines slant differently against the
					# middle finger, so compare the part square to it (the palm's facing).
					var hand := pair[0].trim_suffix("Index1")
					var along_a := (mine[rig.find(hand + "Middle1")].origin - mine[rig.find(hand)].origin).normalized()
					var along_b := (src[source.find(hand + "Middle1")].origin - src[source.find(hand)].origin).normalized()
					a = (a - along_a * a.dot(along_a)).normalized()
					b = (b - along_b * b.dot(along_b)).normalized()
				var angle := rad_to_deg(a.angle_to(b))
				worst = maxf(worst, angle)
				if angle > DIRECTION_TOLERANCE:
					check(false, "%s at %.2f s: %s to %s off by %.1f°" % [n, t, pair[0], pair[1], angle])
	print("    joint directions within %.2f° of the clips" % worst)
	return true


## The rig's model-space pose at `time` of a baked clip (rotation and hip position tracks).
func _pose_baked(rig: RigData, clip: Animation, time: float) -> Array[Transform3D]:
	var locals: Array[Quaternion] = []
	for t in rig.rest_local:
		locals.append(t.basis.get_rotation_quaternion())
	var positions := {}
	for tr in clip.get_track_count():
		var bone := rig.find(BoneNames.plain(clip.track_get_path(tr).get_concatenated_subnames()))
		if bone < 0:
			continue
		if clip.track_get_type(tr) == Animation.TYPE_ROTATION_3D:
			locals[bone] = clip.rotation_track_interpolate(tr, time)
		elif clip.track_get_type(tr) == Animation.TYPE_POSITION_3D:
			positions[bone] = clip.position_track_interpolate(tr, time)
	return rig.pose_model(locals, positions)
