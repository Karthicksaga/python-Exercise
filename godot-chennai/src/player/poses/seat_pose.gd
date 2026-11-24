class_name SeatPose
extends RefCounted
## Sitting on something (decision G-261): where the hip joints, palms and ankles go in the
## figure frame, the torso's lean, and the steering the hands follow. A driver's comes from the
## vehicle's ride pose (the seat, grips and footrests measured on its model, `assets/vehicles/
## <name>.json`); a passenger's from the seat and the person's own legs.
##
## `apply` puts it on a `PoseRig` after the clip: the core bones go to rest, the hips onto the
## seat, the spine leans, then the legs and arms are solved onto the footrests and grips
## (two-bone limbs, knees forwards, elbows down and out), feet laid on the footrest or pedal, the
## head brought level and turned a little with the steering. `amount` below 1 blends from the
## clip's standing pose (sitting down, standing up).

## Palms on grips (a driver), or resting on the thighs (a passenger).
var hands_on_grips: bool = true
## Hip joints' midpoint, figure frame.
var hip: Vector3 = Vector3(0, 0.92, 0)
## Right palm and right ankle relative to `hip` (the left side mirrors them).
var hand: Vector3 = Vector3(0.2, 0.25, -0.4)
var foot: Vector3 = Vector3(0.12, -0.4, -0.5)
## Torso tipped forwards, radians (negative leans back).
var lean: float = 0.0
## Knee splay, 0 straight forwards to 1 about 45° out (astride a bike).
var knees: float = 0.0
## Steering pivot relative to `hip`, the axis it turns about (figure frame), how far the grips
## turn per radian of front-wheel angle (1 handlebar, more for a wheel), and the angle now.
var hub: Vector3 = Vector3(0, 0.25, -0.4)
var steer_axis: Vector3 = Vector3.UP
var steer_ratio: float = 1.0
var steer: float = 0.0
## Feet pointing up onto pedals (cars) instead of flat on a footboard.
var on_pedals: bool = false
## Bumped when anything above changes (cached solves compare it).
var version: int = 0
## How far the last solve left each palm from its grip and each ankle from its rest, metres.
var last_miss: float = 0.0


## A driver's seat: `lean`, `hand` and `foot` as in the vehicle's ride pose (relative to the hip
## joints, right side), hip joints `hip_height` above the figure's origin.
static func driver(hip_height: float, lean_rad: float, right_hand: Vector3, right_foot: Vector3, knee_splay: float) -> SeatPose:
	var s := SeatPose.new()
	s.hip = Vector3(0, hip_height, 0)
	s.lean = lean_rad
	s.hand = right_hand
	s.foot = right_foot
	s.knees = knee_splay
	s.hub = Vector3(0, right_hand.y, right_hand.z)
	# Pedals sit well ahead of the hips in cars and buses; footboards and pegs are close below.
	s.on_pedals = right_foot.z < -0.45
	return s


## A passenger on a seat whose top is `seat_drop` metres below the hip joints' height standing
## (hip joints `hip_height` above the origin), feet on the floor `floor_drop` below the hips.
static func passenger(hip_height: float, floor_drop: float) -> SeatPose:
	var s := SeatPose.new()
	s.hands_on_grips = false
	s.hip = Vector3(0, hip_height, 0)
	s.lean = -0.06
	s.foot = Vector3(0.13, -floor_drop + 0.08, -0.42)
	s.hand = Vector3(0.17, 0.11, -0.3)
	return s


## Where the palm of `side` (0 left, 1 right) goes, figure frame, with the steering turned.
func palm_target(side: int) -> Vector3:
	var h := hand if side == 1 else Vector3(-hand.x, hand.y, hand.z)
	var p := hip + h
	if hands_on_grips and absf(steer) > 0.0001:
		var pivot := hip + hub
		p = pivot + Basis(steer_axis.normalized(), steer * steer_ratio) * (p - pivot)
	return p


func ankle_target(side: int) -> Vector3:
	return hip + (foot if side == 1 else Vector3(-foot.x, foot.y, foot.z))


func set_steer(angle: float) -> void:
	if absf(angle - steer) > 0.0005:
		steer = angle
		version += 1


## Puts the seated pose on `r` (call after the clip). Returns the worst miss, metres.
func apply(r: PoseRig) -> float:
	r.reset_to_rest()
	r.place_hips(hip)
	# Lean: a driver who cannot reach the grips leans further. Riders lean from the hips (the
	# pelvis tips forwards with the torso); someone sitting upright rolls the pelvis back a touch.
	var extra := 0.0
	if hands_on_grips:
		extra = _reach_lean(r)
	var l := lean + extra
	var upright := 1.0 - clampf(l / 0.2, 0.0, 1.0)
	r.bend(PoseRig.HIPS, Vector3.RIGHT, -l * 0.4 + 0.08 * upright)
	r.place_hips(hip)
	r.bend(PoseRig.SPINE, Vector3.RIGHT, -l * 0.3)
	r.bend(PoseRig.SPINE1, Vector3.RIGHT, -l * 0.2)
	r.bend(PoseRig.SPINE2, Vector3.RIGHT, -l * 0.1)
	# Eyes on the road: the neck takes back most of the lean, the head turns with the steering.
	r.bend(PoseRig.NECK, Vector3.RIGHT, l * 0.45)
	r.bend(PoseRig.HEAD, Vector3.RIGHT, l * 0.35)
	if hands_on_grips:
		r.bend(PoseRig.HEAD, Vector3.UP, clampf(steer * 0.55, -0.35, 0.35))
	var miss := 0.0
	for side in 2:
		miss = maxf(miss, _leg(r, side))
	for side in 2:
		miss = maxf(miss, _arm(r, side))
	last_miss = miss
	return miss


## Extra forward lean (radians) so the shoulders come within reach of the grips.
func _reach_lean(r: PoseRig) -> float:
	var shoulder_up := (r.at(PoseRig.ARM[1]) - r.at(PoseRig.UPLEG[1])).y + 0.05
	var grip := palm_target(1) - hip
	var shoulder := Vector3(hand.x * 0.5, shoulder_up * cos(lean), -shoulder_up * sin(lean))
	var need := grip.distance_to(shoulder)
	var can := r.arm_length * 0.97
	if need <= can:
		return 0.0
	# Tip forwards until the distance fits (a few steps of a cheap search).
	var extra := 0.0
	for k in 12:
		extra += 0.04
		var a := lean + extra
		shoulder = Vector3(hand.x * 0.5, shoulder_up * cos(a), -shoulder_up * sin(a))
		if grip.distance_to(shoulder) <= can:
			break
	return extra


func _leg(r: PoseRig, side: int) -> float:
	var out := 1.0 if side == 1 else -1.0
	var thigh := r.at(PoseRig.UPLEG[side])
	var ankle := ankle_target(side)
	# Knees forwards and up, splayed out on a bike.
	var splay := knees * 0.75
	var pole := thigh + Vector3(out * (0.08 + sin(splay) * 0.6), 0.35, -0.6 * cos(splay))
	var miss := r.reach(PoseRig.UPLEG[side], PoseRig.LEG[side], PoseRig.FOOT[side], ankle, pole)
	# The sole on the footrest: toes forwards, flat, or tipped up onto a pedal.
	var toe_dir := Vector3(out * 0.12, 0.45 if on_pedals else -0.12, -1.0)
	r.aim(PoseRig.FOOT[side], PoseRig.TOE[side], toe_dir.normalized())
	return miss


func _arm(r: PoseRig, side: int) -> float:
	var out := 1.0 if side == 1 else -1.0
	var shoulder := r.at(PoseRig.ARM[side])
	var target := palm_target(side) if hands_on_grips else hip + Vector3(out * hand.x, hand.y, hand.z)
	# Elbows down, a little out and back.
	var pole := shoulder + Vector3(out * 0.45, -0.6, 0.35)
	# The palm sits ahead of the wrist along the hand: aim the wrist short of the grip, then
	# lay the hand along the forearm, its fingers dipped over the grip.
	var palm_off := 0.0
	if r.knuckle[side] >= 0:
		palm_off = r.at(PoseRig.HAND[side]).distance_to(r.to_fig * r.skeleton.get_bone_global_pose(r.knuckle[side]).origin) * 0.6
	var wrist := target
	for pass_i in 2:
		r.reach(PoseRig.ARM[side], PoseRig.FOREARM[side], PoseRig.HAND[side], wrist, pole)
		var fore := (r.at(PoseRig.HAND[side]) - r.at(PoseRig.FOREARM[side])).normalized()
		var hand_dir := (fore + Vector3(0, -0.25 if hands_on_grips else -0.5, 0)).normalized()
		wrist = target - hand_dir * palm_off
		if pass_i == 1:
			if r.knuckle[side] >= 0:
				var kn := r.knuckle[side]
				var from := (r.skeleton.get_bone_global_pose(kn).origin - r.pose(PoseRig.HAND[side]).origin).normalized()
				var to := r.axis(hand_dir)
				if from.dot(to) < 0.99999:
					r.set_global_basis(PoseRig.HAND[side], Basis(PoseRig._arc(from, to)) * r.pose(PoseRig.HAND[side]).basis.orthonormalized())
	return r.palm(side).distance_to(target)
