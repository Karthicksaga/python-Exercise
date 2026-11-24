extends YardTest
## The procedural poses on the real player model (G-260…G-266), measured on the skeleton:
## drivers seated with palms on the grips and ankles on the footrests of each vehicle's own data,
## hands and head following the steering; fare passengers seated in their seat slots; the arm
## swing of the walk and the lean and bent arms of the run; falls through the knockdown API.

## Palms from the grip, metres (a hand is about 9 cm wide; the grip data is the palm's centre).
const PALM_TOLERANCE := 0.05
const ANKLE_TOLERANCE := 0.07
const HIP_TOLERANCE := 0.04
## The drivers measured: car, auto, bike, bus (each its own seat and grips).
const DRIVEN: Array[StringName] = [&"hatchback", &"auto", &"motorbike", &"bus"]


func before_each() -> void:
	await super.before_each()
	await yard.load_player()


func figure() -> HumanFigure:
	return yard.rig.body.figure


## A joint of the figure in the scene.
func joint(i: int) -> Vector3:
	return figure().to_global(figure().poser.at(i))


func palm(side: int) -> Vector3:
	return figure().to_global(figure().poser.palm(side))


func _mirror(v: Vector3, side: int) -> Vector3:
	return v if side == 1 else Vector3(-v.x, v.y, v.z)


func test_drivers_sit_with_hands_on_the_grips_and_feet_on_the_footrests() -> bool:
	if not check(figure().is_ready(), "the player model loads"):
		return true
	var x := -12.0
	for variant in DRIVEN:
		var v := await spawn(variant, Vector3(x, 0, 0))
		x += 8.0
		check(await board(v), "%s: seated" % variant)
		await wait_physics_frames(20)
		var f := figure()
		check(f.visible, "%s: the driver is drawn" % variant)
		check(f.seat != null and is_equal_approx(f.seat_amount, 1.0), "%s: on the seat" % variant)
		var seat := v.rider_transform()
		var pose := v.type.pose
		var hips := (joint(PoseRig.UPLEG[0]) + joint(PoseRig.UPLEG[1])) * 0.5
		check(hips.distance_to(seat.origin) < HIP_TOLERANCE, "%s: hip joints on the seat (%.3f m off)" % [variant, hips.distance_to(seat.origin)])
		var worst_palm := 0.0
		var worst_ankle := 0.0
		for side in 2:
			var grip := seat * _mirror(pose.hand, side)
			worst_palm = maxf(worst_palm, palm(side).distance_to(grip))
			var ankle := seat * _mirror(pose.foot, side)
			worst_ankle = maxf(worst_ankle, joint(PoseRig.FOOT[side]).distance_to(ankle))
			# The model's own grip node, where it has one (the data's hand matches it).
			for grip_name: String in (["grip_l", "grip_steer_l"] if side == 0 else ["grip_r", "grip_steer_r"]):
				var node := v.model.find_child(grip_name, true, false) as Node3D
				if node != null:
					check(palm(side).distance_to(node.global_position) < PALM_TOLERANCE + 0.02, "%s: palm on the model's %s (%.3f m off)" % [variant, grip_name, palm(side).distance_to(node.global_position)])
			# Knees bent like a seated person's, not standing straight.
			var thigh := joint(PoseRig.LEG[side]) - joint(PoseRig.UPLEG[side])
			var shin := joint(PoseRig.FOOT[side]) - joint(PoseRig.LEG[side])
			check(rad_to_deg(thigh.angle_to(shin)) > 25.0, "%s: knee bent (%.0f°)" % [variant, rad_to_deg(thigh.angle_to(shin))])
			check(f.wrist_bend("Left" if side == 0 else "Right") < 45.0, "%s: wrist natural (%.0f°)" % [variant, f.wrist_bend("Left" if side == 0 else "Right")])
		check(worst_palm < PALM_TOLERANCE, "%s: palms on the grips (%.3f m off)" % [variant, worst_palm])
		check(worst_ankle < ANKLE_TOLERANCE, "%s: feet on the footrests (%.3f m off)" % [variant, worst_ankle])
		# Torso upright, leaning as the ride pose says (and no more than reaching needs).
		var up := (joint(PoseRig.NECK) - hips)
		var forward := -seat.basis.z
		var lean := rad_to_deg(atan2(up.dot(forward), up.dot(seat.basis.y)))
		check(lean > rad_to_deg(pose.lean) - 12.0 and lean < rad_to_deg(pose.lean) + 25.0, "%s: torso lean %.0f° (pose %.0f°)" % [variant, lean, rad_to_deg(pose.lean)])
		check(joint(PoseRig.HEAD).y > hips.y + 0.45, "%s: sitting up" % variant)
		print("    %s: palms %.3f m, ankles %.3f m, hips %.3f m from the data; lean %.0f°" % [variant, worst_palm, worst_ankle, hips.distance_to(seat.origin), lean])
		yard.driving.exit()
		await wait_until(func() -> bool: return yard.driving.mode() == &"foot", 60 * 6)
		check(figure().seat == null, "%s: standing again after getting out" % variant)
	return true


func test_hands_and_head_follow_the_steering() -> bool:
	if not check(figure().is_ready(), "the player model loads"):
		return true
	for variant: StringName in [&"auto", &"hatchback"]:
		var v := await spawn(variant, Vector3(0, 0, 0 if variant == &"auto" else 14))
		check(await board(v), "%s: seated" % variant)
		await wait_physics_frames(10)
		var palm0 := palm(1)
		# Steer right: the front wheels turn to negative angles (+ is left).
		yard.driving.steer = 1.0
		await wait_game_seconds(0.6)
		var angle := v.steering()
		check(angle < -0.1, "%s: the front wheels turn right (%.2f rad)" % [variant, angle])
		var seat := v.rider_transform()
		var pose := v.type.pose
		var pivot := seat * pose.hub
		var axis := (seat.basis * pose.steer_axis).normalized()
		var grip := pivot + Basis(axis, angle * pose.steer_ratio) * (seat * pose.hand - pivot)
		check(palm(1).distance_to(grip) < PALM_TOLERANCE, "%s: right palm stays on the turning grip (%.3f m off)" % [variant, palm(1).distance_to(grip)])
		check(palm(1).distance_to(palm0) > 0.04, "%s: the hand moved with the steering (%.3f m)" % [variant, palm(1).distance_to(palm0)])
		# The head looks a little into the turn: its forwards (+Z of the glTF head) swings right.
		var r := figure().poser
		var head := (r.to_fig.basis * r.pose(PoseRig.HEAD).basis.z).normalized()
		var turned := rad_to_deg(atan2(head.x, -head.z))
		check(turned > 4.0 and turned < 25.0, "%s: head turns a little into the turn (%.1f°)" % [variant, turned])
		print("    %s: wheels %.2f rad, palm %.3f m from the turned grip, head %.1f° into the turn" % [variant, angle, palm(1).distance_to(grip), turned])
		yard.driving.steer = 0.0
		await wait_game_seconds(0.5)
		check(yard.driving.exit(), "%s: gets out" % variant)
		check(await wait_until(func() -> bool: return yard.driving.mode() == &"foot" and yard.driving.boarding == null, 60 * 8), "%s: on foot" % variant)
	return true


func test_passengers_sit_in_their_seat_slots() -> bool:
	var figures := FareFigures.new()
	yard.add_child(figures)
	var x := -10.0
	for variant: StringName in [&"auto", &"hatchback", &"bus"]:
		var v := await spawn(variant, Vector3(x, 0, -10))
		x += 10.0
		var kerb := v.global_position + Vector3(-3, 0, 0)
		var stop := FareStop.new(MissionData.Fare.make(0, 2, kerb.x, kerb.z), String(v.type.kind))
		var fare := {"stop": stop}
		var shown := func() -> bool:
			figures.show_scene(1.0 / 60.0, fare, {}, v, 0.0)
			for i in 2:
				var f: HumanFigure = figures._figures[i] if i < figures._figures.size() else null
				if f == null or not f.is_ready() or not f.visible:
					return false
			return true
		check(await wait_until(shown, 60 * 20), "%s: two passengers drawn" % variant)
		var riding: Array[String] = ["riding", "riding"]
		check(figures.stages() == riding, "%s: both riding (%s)" % [variant, figures.stages()])
		var slots: Array[Vector3] = []
		for i in 2:
			var f: HumanFigure = figures._figures[i]
			var slot: Vector3 = figures.people[i]["slot"]
			check(not slots.has(slot), "%s: each passenger has their own seat" % variant)
			slots.append(slot)
			var seat := FareFigures.seat_transform(v, slot)
			var hips := f.to_global((f.poser.at(PoseRig.UPLEG[0]) + f.poser.at(PoseRig.UPLEG[1])) * 0.5)
			check(f.seat != null and is_equal_approx(f.seat_amount, 1.0), "%s: passenger %d seated" % [variant, i])
			check(hips.distance_to(seat.origin) < HIP_TOLERANCE, "%s: passenger %d's hips in the seat slot (%.3f m off)" % [variant, i, hips.distance_to(seat.origin)])
			var head := f.to_global(f.poser.at(PoseRig.HEAD))
			check(head.y > hips.y + 0.45, "%s: passenger %d sits upright" % [variant, i])
			var ankle := f.to_global(f.poser.at(PoseRig.FOOT[1]))
			check(ankle.y < hips.y - 0.2, "%s: passenger %d's feet down towards the floor" % [variant, i])
			print("    %s passenger %d: hips %.3f m from the seat slot" % [variant, i, hips.distance_to(seat.origin)])
	return true


func test_walk_swings_the_arms_and_the_run_leans_with_bent_arms() -> bool:
	var f := figure()
	if not check(f.is_ready(), "the player model loads"):
		return true
	for case: Array in [["walk", 1.6], ["run", 6.2]]:
		var speed: float = case[1]
		for i in 90:
			f.advance(1.0 / 60.0, speed, true)
		var lo := [INF, INF]
		var hi := [-INF, -INF]
		var corr := 0.0
		var lean := 0.0
		var elbow := 0.0
		for i in 120:
			f.advance(1.0 / 60.0, speed, true)
			var r := f.poser
			var hips := r.at(PoseRig.HIPS)
			for side in 2:
				var z := r.at(PoseRig.HAND[side]).z - hips.z
				lo[side] = minf(float(lo[side]), z)
				hi[side] = maxf(float(hi[side]), z)
			# Contralateral: the left hand is back (+z) while the left foot is forwards (-z).
			corr += signf(r.at(PoseRig.HAND[0]).z - hips.z) * -signf(r.at(PoseRig.FOOT[0]).z - hips.z)
			var neck := r.at(PoseRig.NECK)
			lean += rad_to_deg(atan2(-(neck.z - hips.z), neck.y - hips.y)) / 120.0
			var a := r.at(PoseRig.ARM[1])
			var e := r.at(PoseRig.FOREARM[1])
			elbow += rad_to_deg((e - a).angle_to(r.at(PoseRig.HAND[1]) - e)) / 120.0
		var swing := minf(float(hi[0]) - float(lo[0]), float(hi[1]) - float(lo[1]))
		print("    %s: hands swing %.2f m fore and aft, in step with the opposite leg %.0f %%, lean %.1f°, elbows %.0f°" % [case[0], swing, 50.0 + corr / 2.4, lean, elbow])
		check(corr / 120.0 > 0.5, "%s: arms swing with the opposite leg (%.2f)" % [case[0], corr / 120.0])
		if case[0] == "walk":
			check(swing > 0.3, "walk: hands swing %.2f m (a stroll swings 0.3–0.5 m)" % swing)
			check(lean > -3.0 and lean < 6.0, "walk: upright (%.1f°)" % lean)
		else:
			check(swing > 0.45, "run: arms drive %.2f m" % swing)
			check(lean > 10.0 and lean < 20.0, "run: leaning into it (%.1f°)" % lean)
			check(elbow > 70.0, "run: elbows bent (%.0f°)" % elbow)
	# The run's cadence: strides per second at full running speed.
	check(HumanFigure.RUN_CLIP_SPEED < 4.6, "the run steps quicker than before")
	return true


func test_walk_blends_into_run_by_speed() -> bool:
	var f := figure()
	if not check(f.is_ready(), "the player model loads"):
		return true
	var shares: Array[float] = []
	for speed: float in [2.0, 3.0, 3.6, 4.5]:
		for i in 60:
			f.advance(1.0 / 60.0, speed, true)
		shares.append(f.weights["run"])
	check(shares[0] < 0.01 and shares[3] > 0.99, "walk below 2.6 m/s, run above 4 m/s (%s)" % [shares])
	check(shares[1] > 0.05 and shares[1] < shares[2] and shares[2] < 0.95, "between, a blend that grows with speed (%s)" % [shares])
	# Both clips are at the same point of the stride: a half-and-half blend still has one leg
	# clearly ahead of the other at the stride's ends.
	var widest := 0.0
	for i in 120:
		f.advance(1.0 / 60.0, 3.3, true)
		widest = maxf(widest, absf(f.last_split))
	check(widest > 0.3, "the legs still stride in a walk-run blend (split %.2f rad)" % widest)
	return true
