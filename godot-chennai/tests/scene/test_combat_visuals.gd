extends TestCase
## The fight and carry poses on the real player model and on a street person (G-430..G-433),
## measured on the skeleton in game time: the fist is out at the hit frame, the bat comes round in
## an arc, the box is in both hands, a weapon sits in the right hand, and everything returns to the
## clip afterwards.

const DT := 1.0 / 60.0
## How far a wrist may be from where the pose sent it, metres.
const WRIST_TOLERANCE := 0.04
const PALM_TOLERANCE := 0.05

var figure: HumanFigure
var hits: Array[Array] = []


func before_each() -> void:
	figure = HumanFigure.new()
	root.add_child(figure)
	var error := await figure.load_model(PeopleManifest.DEFAULT_PLAYER, PlayerController.HEIGHT)
	check(error == "", "player model loads: %s" % error)
	hits.clear()
	figure.strike_hit.connect(func(kind: StringName, side: int) -> void: hits.append([kind, side, figure.strike_time()]))
	_steps(figure, 20, 0.0)


func _steps(f: CombatFigure, n: int, speed: float) -> void:
	for i in n:
		if f is HumanFigure:
			(f as HumanFigure).advance(DT, speed, true)
		else:
			(f as PersonView).advance(DT, 1.0)


## Steps until the blow's hit frame has fired (or the time is out); true if it did.
func _to_hit(f: CombatFigure, max_steps: int = 60) -> bool:
	var before := hits.size()
	for i in max_steps:
		_steps(f, 1, 0.0)
		if hits.size() > before:
			return true
	return false


func _wrist(f: HumanFigure, side: int) -> Vector3:
	return f.to_global(f.poser.at(PoseRig.HAND[side]))


func test_a_jab_reaches_the_strike_point_at_the_hit_frame_and_signals_once() -> bool:
	if not check(figure.is_ready(), "figure ready"):
		return true
	var arm := figure.poser.arm_length
	var rest_hand := figure.poser.at(PoseRig.HAND[0])
	figure.play_strike(&"jab", 0)
	check(figure.is_striking(), "striking after play_strike")
	check(hits.is_empty(), "no hit before the wind-up is over")
	check(_to_hit(figure), "the hit frame arrives")
	check(hits.size() == 1 and hits[0][0] == &"jab" and hits[0][1] == 0, "signal carries kind and side")
	var at := float(hits[0][2])
	check(at >= 0.12 and at < 0.12 + DT + 0.001, "at the 0.12 s wind-up (%.3f s)" % at)
	var wrist := figure.poser.at(PoseRig.HAND[0])
	var shoulder := figure.poser.at(PoseRig.ARM[0])
	var miss := wrist.distance_to(figure.to_local(figure.strike_wrist_target()))
	check(miss < WRIST_TOLERANCE, "wrist on its target (%.3f m off)" % miss)
	var out := shoulder.z - wrist.z
	check(out > arm * 0.85, "arm out in front (%.2f m of %.2f m)" % [out, arm])
	check(absf(wrist.y - shoulder.y) < 0.12, "at shoulder height (%.2f m off)" % (wrist.y - shoulder.y))
	var point := figure.to_local(figure.strike_point())
	check(point.z < shoulder.z - arm * 0.9, "the fist is where the blow lands (%.2f m ahead)" % (shoulder.z - point.z))
	check(figure.poser.at(PoseRig.HAND[0]).distance_to(rest_hand) > 0.3, "the hand moved from where it hung")
	# The guard hand is up near the face.
	var guard := figure.poser.at(PoseRig.HAND[1])
	check(guard.y > figure.poser.at(PoseRig.ARM[1]).y - 0.35, "the other fist guards (%.2f m below the shoulder)" % (figure.poser.at(PoseRig.ARM[1]).y - guard.y))
	var bend := figure.wrist_bend("Left")
	check(bend < 60.0, "wrist natural at the blow (%.0f°)" % bend)
	check(figure.is_striking(), "still recovering")
	_steps(figure, 30, 0.0)
	check(not figure.is_striking(), "over after the recovery")
	check(hits.size() == 1, "and only one signal")
	return true


func test_a_cross_is_thrown_with_the_right_hand_and_a_hook_swings_across() -> bool:
	var arm := figure.poser.arm_length
	figure.play_strike(&"cross", 1)
	check(_to_hit(figure), "cross lands")
	var out := figure.poser.at(PoseRig.ARM[1]).z - figure.poser.at(PoseRig.HAND[1]).z
	check(out > arm * 0.85, "right arm out (%.2f m)" % out)
	check(hits[0][0] == &"cross" and hits[0][1] == 1, "right hand's signal")
	_steps(figure, 30, 0.0)
	figure.play_strike(&"hook", 0)
	check(_to_hit(figure), "hook lands")
	var h := figure.poser.at(PoseRig.HAND[0])
	var s := figure.poser.at(PoseRig.ARM[0])
	check(s.z - h.z > arm * 0.55, "hook reaches forwards (%.2f m)" % (s.z - h.z))
	check(h.x > s.x - 0.05, "and across the body (hand %.2f m from the shoulder's side)" % (h.x - s.x))
	return true


func test_the_arms_go_back_to_the_clip_after_a_blow() -> bool:
	var before: Array[Vector3] = []
	for b: int in [PoseRig.HAND[0], PoseRig.HAND[1], PoseRig.FOREARM[0], PoseRig.FOREARM[1], PoseRig.HEAD]:
		before.append(figure.poser.at(b))
	figure.play_strike(&"jab", 0)
	_steps(figure, 40, 0.0)
	var k := 0
	for b: int in [PoseRig.HAND[0], PoseRig.HAND[1], PoseRig.FOREARM[0], PoseRig.FOREARM[1], PoseRig.HEAD]:
		var d := figure.poser.at(b).distance_to(before[k])
		check(d < 0.02, "bone %d back where it was (%.3f m)" % [b, d])
		k += 1
	# And so do the fingers (closed for the blow).
	var f := figure.poser.fingers[0]
	check(f.size() > 0, "the hand has fingers")
	var curled := 0.0
	for j in f.size():
		var rest := figure.skeleton.get_bone_rest(f[j]).basis.get_rotation_quaternion()
		curled = maxf(curled, rest.angle_to(figure.skeleton.get_bone_pose_rotation(f[j])))
	check(curled < 0.9, "fingers open again (%.2f rad from rest)" % curled)
	return true


func test_a_blow_started_again_restarts_and_a_fall_cancels_it() -> bool:
	figure.play_strike(&"jab", 0)
	_steps(figure, 5, 0.0)
	figure.play_strike(&"cross", 1)
	check(figure.strike_time() < DT * 2.0, "restarted")
	figure.play_fall(Vector3(0, 2, 3))
	_steps(figure, 2, 0.0)
	check(not figure.is_striking(), "knocked down: no blow")
	figure.play_strike(&"jab", 0)
	check(figure.is_striking(), "a new blow can be asked for")
	figure.play_strike(&"nonsense", 0)
	check(figure.strike_kind() == &"jab", "an unknown kind changes nothing")
	return true


func test_the_bat_comes_round_in_an_arc_and_lands_in_front_at_the_hit_frame() -> bool:
	figure.play_strike(&"bat", 1)
	var yaws: Array[float] = []
	var heights: Array[float] = []
	var hit_yaw := 0.0
	var hit_height := 0.0
	var steps := 0
	while figure.is_striking() and steps < 90:
		_steps(figure, 1, 0.0)
		steps += 1
		var centre := (figure.poser.at(PoseRig.ARM[0]) + figure.poser.at(PoseRig.ARM[1])) * 0.5
		var p := figure.to_local(figure.strike_point()) - centre
		var yaw := atan2(p.x, -p.z)
		yaws.append(yaw)
		heights.append(p.y)
		if not hits.is_empty() and hit_height == 0.0:
			hit_yaw = yaw
			hit_height = p.y
			check(hits[0][0] == &"bat", "bat signal")
	check(not hits.is_empty(), "the swing lands")
	var at := float(hits[0][2])
	check(at >= 0.22 and at < 0.22 + DT + 0.001, "at the 0.22 s wind-up (%.3f s)" % at)
	# Back over the right shoulder first, across the front at the blow, then on to the left.
	var first_max := -10.0
	for y in yaws:
		first_max = maxf(first_max, y)
	check(first_max > deg_to_rad(60.0), "drawn back round to the right (%.0f°)" % rad_to_deg(first_max))
	check(absf(hit_yaw) < deg_to_rad(55.0), "across the front at the blow (%.0f°)" % rad_to_deg(hit_yaw))
	var lowest := 10.0
	for y in yaws:
		lowest = minf(lowest, y)
	check(lowest < -deg_to_rad(40.0), "follows through to the left (%.0f°)" % rad_to_deg(lowest))
	# The arc is one sweep from right to left: yaw never turns back much until the recovery.
	var back_steps := 0
	var peak_i := yaws.find(first_max)
	for i in range(peak_i + 1, yaws.size() - 1):
		if yaws[i + 1] > yaws[i] + deg_to_rad(4.0) and yaws[i] > lowest + 0.1:
			back_steps += 1
	check(back_steps <= 12, "one sweep, not a wobble (%d reversing steps)" % back_steps)
	check(hit_height > -0.6 and hit_height < 0.1, "the blade crosses at waist to chest height (%.2f m below the shoulders)" % -hit_height)
	return true


func test_a_street_person_strikes_too_even_when_unseen() -> bool:
	var pool := PeoplePool.new()
	root.add_child(pool)
	var id := "it-professional-m"
	check(await pool.prepare(PackedStringArray([id])) == "", "street person loads")
	var v := pool.make_view(id)
	root.add_child(v)
	v.play(&"idle")
	v.advance(DT, 3.0)
	var got: Array[Array] = []
	v.strike_hit.connect(func(kind: StringName, side: int) -> void: got.append([kind, side]))
	v.play_strike(&"jab", 1)
	check(v.is_striking(), "striking")
	var arm := v.poser.arm_length
	var n := 0
	while got.is_empty() and n < 60:
		v.advance(DT, 3.0)
		n += 1
	check(got.size() == 1, "hit frame signalled")
	var out := v.poser.at(PoseRig.ARM[1]).z - v.poser.at(PoseRig.HAND[1]).z
	check(out > arm * 0.8, "fist out on a street person (%.2f of %.2f m)" % [out, arm])
	for i in 30:
		v.advance(DT, 3.0)
	check(not v.is_striking(), "over")
	# Out of view: no pose, but the blow still lands on time.
	got.clear()
	v.play_strike(&"bat", 1)
	n = 0
	while got.is_empty() and n < 60:
		v.advance(DT, 500.0, false)
		n += 1
	check(got.size() == 1 and got[0][0] == &"bat", "an unseen blow signals")
	check(n >= 13 and n <= 15, "in game time, 0.22 s (%d steps)" % n)
	return true


func test_a_box_is_carried_in_both_hands_on_the_anchors_while_walking() -> bool:
	figure.carry(true, &"box")
	check(figure.carrying() == &"box", "carrying a box")
	_steps(figure, 40, 1.6)
	var prop := figure.carry_prop()
	if not check(prop != null and prop.visible, "the box is drawn"):
		return true
	var worst := 0.0
	var lo := INF
	var hi := -INF
	for i in 90:
		_steps(figure, 1, 1.6)
		for s in 2:
			worst = maxf(worst, figure.to_global(figure.poser.palm(s)).distance_to(figure.carry_anchor(s)))
		var z := figure.poser.at(PoseRig.HAND[1]).z - figure.poser.at(PoseRig.HIPS).z
		lo = minf(lo, z)
		hi = maxf(hi, z)
	check(worst < PALM_TOLERANCE, "both palms on the box's sides while walking (worst %.3f m)" % worst)
	check(hi - lo < 0.08, "the walking arm swing is damped to nothing (hand moves %.3f m, 0.47 m free)" % (hi - lo))
	var mid := (figure.carry_anchor(0) + figure.carry_anchor(1)) * 0.5
	check(prop.global_position.distance_to(mid) < 0.06, "the box sits between the hands (%.3f m)" % prop.global_position.distance_to(mid))
	check(prop.global_position.y > figure.global_position.y + 0.8 and prop.global_position.y < figure.global_position.y + 1.3, "at waist to chest height")
	check(figure.wrist_bend("Left") < 70.0 and figure.wrist_bend("Right") < 70.0, "wrists natural")
	figure.carry(false)
	_steps(figure, 30, 1.6)
	check(figure.carrying() == &"" and not prop.visible, "put down")
	return true


func test_a_small_box_on_the_shoulder_is_steadied_by_the_right_hand() -> bool:
	figure.carry(true, &"shoulder")
	_steps(figure, 40, 0.0)
	var prop := figure.carry_prop()
	if not check(prop != null and prop.visible, "the small box is drawn"):
		return true
	var miss := figure.to_global(figure.poser.palm(1)).distance_to(figure.carry_anchor(1))
	check(miss < PALM_TOLERANCE, "right palm on the box (%.3f m)" % miss)
	var shoulder := figure.to_global(figure.poser.at(PoseRig.ARM[1]))
	check(prop.global_position.y > shoulder.y + 0.05 and prop.global_position.y < shoulder.y + 0.3, "box on the shoulder (%.2f m above)" % (prop.global_position.y - shoulder.y))
	var left_hand := figure.poser.at(PoseRig.HAND[0])
	check(left_hand.y < figure.poser.at(PoseRig.ARM[0]).y - 0.3, "the left arm hangs free")
	var small := ((prop as MeshInstance3D).mesh as ArrayMesh).get_aabb().size
	check(small.x < CarryPose.BOX_SIZE.x, "smaller than the two-handed box")
	return true


func test_a_weapon_sits_on_the_right_hand_bone_and_leaves_with_detach() -> bool:
	var r := figure.poser
	var hand_bone := r.skeleton.get_bone_name(r.index[PoseRig.HAND[1]])
	for id in WeaponModels.IDS:
		WeaponModels.attach(figure, id)
		check(WeaponModels.held(figure) == id, "%s held" % id)
		var att := r.skeleton.get_node_or_null(WeaponModels.NODE_NAME) as BoneAttachment3D
		if not check(att != null, "%s: an attachment under the skeleton" % id):
			continue
		check(att.bone_name == hand_bone, "%s: on the right hand bone (%s)" % [id, att.bone_name])
		_steps(figure, 3, 0.0)
		var grip := att.get_node(^"Grip") as Node3D
		var d := grip.global_position.distance_to(figure.to_global(r.palm(1)))
		check(d < 0.04, "%s: grip in the palm (%.3f m)" % [id, d])
		check(r.skeleton.get_child_count() >= 1 and att.get_child_count() == 1, "%s: one grip node" % id)
		var near := grip.get_node(^"Near") as MeshInstance3D
		var far := grip.get_node(^"Far") as MeshInstance3D
		check(near.visibility_range_end == WeaponModels.LOD_DISTANCE and far.visibility_range_begin == WeaponModels.LOD_DISTANCE, "%s: a far silhouette takes over" % id)
		check(near.mesh == WeaponModels.mesh(id), "%s: the shared mesh" % id)
		# Its length lies the right way: a club away from the palm along the thumb side; a gun forwards.
		var tip := grip.to_global(Vector3(0, 0, 0.3 if id == &"bat" else 0.1))
		var away := tip.distance_to(figure.to_global(r.palm(1)))
		check(away > 0.05, "%s: reaches out of the hand" % id)
	WeaponModels.attach(figure, &"bat")
	WeaponModels.attach(figure, &"bottle")
	check(WeaponModels.held(figure) == &"bottle" and r.skeleton.find_children("HeldWeapon*", "BoneAttachment3D", false, false).size() <= 2, "attach replaces what was held")
	_steps(figure, 2, 0.0)
	WeaponModels.detach(figure)
	_steps(figure, 2, 0.0)
	check(WeaponModels.held(figure) == &"", "nothing held after detach")
	var left := 0
	for c in r.skeleton.get_children():
		if c is BoneAttachment3D and is_instance_valid(c) and not c.is_queued_for_deletion():
			left += 1
	check(left == 0, "no attachment left behind (%d)" % left)
	WeaponModels.attach(figure, &"fists")
	check(WeaponModels.held(figure) == &"", "fists hold nothing")
	return true


func test_a_bat_in_the_hand_swings_with_the_blow_and_points_where_the_arc_goes() -> bool:
	WeaponModels.attach(figure, &"bat")
	_steps(figure, 3, 0.0)
	var att := figure.poser.skeleton.get_node(WeaponModels.NODE_NAME) as BoneAttachment3D
	var grip := att.get_node(^"Grip") as Node3D
	# At the hit frame the blade points out in front of the body (it crosses in front).
	figure.play_strike(&"bat", 1)
	check(_to_hit(figure), "swing lands")
	var blade := figure.to_local(grip.to_global(Vector3(0, 0, 0.55))) - figure.to_local(grip.global_position)
	check(blade.length() > 0.45 and blade.length() < 0.65, "blade length %.2f m" % blade.length())
	check(blade.z < -0.15, "the blade points forwards across the front (%.2f)" % blade.z)
	var tip := figure.to_local(grip.to_global(Vector3(0, 0, 0.8)))
	check(tip.z < -0.3 and tip.y > 0.5 and tip.y < 1.5, "bat tip in front at belt-to-chest height (z %.2f, y %.2f)" % [tip.z, tip.y])
	# At the back of the swing it is raised.
	figure.cancel_strike()
	_steps(figure, 10, 0.0)
	figure.play_strike(&"bat", 1)
	_steps(figure, 8, 0.0)
	var up := figure.to_local(grip.to_global(Vector3(0, 0, 0.8))).y - figure.to_local(grip.global_position).y
	check(up > 0.2, "raised behind at the wind-up (%.2f m above the hand)" % up)
	return true
