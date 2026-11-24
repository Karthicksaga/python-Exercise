class_name GaitSwing
extends RefCounted
## Natural arms and torso on top of the walk and run clips (decision G-263). The CC0 walk holds
## its arms nearly still and the jog runs upright; people swing each arm with the opposite leg,
## turn the shoulders against the hips, nod a little at each footfall, lean into a run and run
## with bent elbows.
##
## The swing is read from the legs themselves (the thighs' angle in the hips' frame), so it is in
## step with whatever the clip, its playback rate or a blend of two clips does, with no phase to
## keep. It only reads and writes local bone rotations (no skeleton-wide pose update) and uses
## value types only: no allocation per frame, cheap enough for every walker on a phone.

## Upper-arm swing per radian of leg split (half the angle between the thighs), walk and run.
const ARM_GAIN_WALK := 0.8
const ARM_GAIN_RUN := 0.0
## Shoulders turned against the hips per radian of leg split.
const TORSO_GAIN_WALK := 0.3
const TORSO_GAIN_RUN := 0.0
## Elbows: bent this much at rest in the stride, radians, plus more as the arm swings forward.
const ELBOW_WALK := 0.3
const ELBOW_WALK_FORWARD := 0.45
const ELBOW_RUN := 1.5
## Forward lean of the spine, radians.
const LEAN_WALK := 0.03
const LEAN_RUN := 0.12
## Head nod at a footfall, radians.
const NOD_WALK := 0.045
const NOD_RUN := 0.06
## Leg split at a full walking stride, radians (normalises the nod).
const FULL_SPLIT := 0.38


## Applies the swing to `r` after the clip: `walk` and `run` are the weights of the two gaits
## (0..1 each; idle is neither). Returns the leg split it used (radians, + left leg forwards).
static func apply(r: PoseRig, walk: float, run: float) -> float:
	var w := walk + run
	if w < 0.01:
		return 0.0
	var sk := r.skeleton
	var idx := r.index
	var up := r.axis(Vector3.UP)
	var fwd := r.axis(Vector3.FORWARD)
	var lat := r.axis(Vector3.RIGHT)
	var q_hips := sk.get_bone_pose_rotation(idx[PoseRig.HIPS])
	# The split: each thigh's angle forwards of straight down, in the hips' frame.
	var inv_hips := q_hips.inverse()
	var f_h := inv_hips * fwd
	var u_h := inv_hips * up
	var dl := sk.get_bone_pose_rotation(idx[PoseRig.UPLEG[0]]) * Vector3.UP
	var dr := sk.get_bone_pose_rotation(idx[PoseRig.UPLEG[1]]) * Vector3.UP
	var split := (atan2(dl.dot(f_h), -dl.dot(u_h)) - atan2(dr.dot(f_h), -dr.dot(u_h))) * 0.5
	var share_run := run / w
	# Lean into the stride (low in the spine), shoulders turned against the hips.
	var lean := (LEAN_WALK * walk + LEAN_RUN * run)
	var q_spine := sk.get_bone_pose_rotation(idx[PoseRig.SPINE])
	q_spine = Quaternion(inv_hips * lat, -lean) * q_spine
	sk.set_bone_pose_rotation(idx[PoseRig.SPINE], q_spine)
	var g_spine := q_hips * q_spine
	var g_spine1 := g_spine * sk.get_bone_pose_rotation(idx[PoseRig.SPINE1])
	var twist := split * lerpf(TORSO_GAIN_WALK, TORSO_GAIN_RUN, share_run) * w
	var q_spine2 := Quaternion(g_spine1.inverse() * up, twist) * sk.get_bone_pose_rotation(idx[PoseRig.SPINE2])
	sk.set_bone_pose_rotation(idx[PoseRig.SPINE2], q_spine2)
	var g_spine2 := g_spine1 * q_spine2
	# Head: steady gaze (undo the twist and most of the lean), a small nod at each footfall.
	var q_neck := Quaternion(g_spine2.inverse() * up, -twist * 0.85) * sk.get_bone_pose_rotation(idx[PoseRig.NECK])
	q_neck = Quaternion(g_spine2.inverse() * lat, lean * 0.6) * q_neck
	sk.set_bone_pose_rotation(idx[PoseRig.NECK], q_neck)
	var g_neck := g_spine2 * q_neck
	var beat := clampf(split * split / (FULL_SPLIT * FULL_SPLIT), 0.0, 1.0)
	var nod := lerpf(NOD_WALK, NOD_RUN, share_run) * beat * w
	sk.set_bone_pose_rotation(idx[PoseRig.HEAD], Quaternion(g_neck.inverse() * lat, -nod) * sk.get_bone_pose_rotation(idx[PoseRig.HEAD]))
	# Arms: each with the opposite leg, in the chest's own fore-and-aft plane (the chest leans and
	# turns); elbows bend more forwards and much more in a run.
	var chest_lat := (g_spine2 * r.chest_rest_inv) * lat
	var gain := lerpf(ARM_GAIN_WALK, ARM_GAIN_RUN, share_run) * w
	for side in 2:
		var side_sign := 1.0 if side == 1 else -1.0
		var swing := split * gain * side_sign
		var q_sh := sk.get_bone_pose_rotation(idx[PoseRig.SHOULDER[side]])
		var g_sh := g_spine2 * q_sh
		var q_arm := Quaternion(g_sh.inverse() * chest_lat, swing) * sk.get_bone_pose_rotation(idx[PoseRig.ARM[side]])
		sk.set_bone_pose_rotation(idx[PoseRig.ARM[side]], q_arm)
		var g_arm := g_sh * q_arm
		var q_fore := sk.get_bone_pose_rotation(idx[PoseRig.FOREARM[side]])
		var bent := (g_arm * Vector3.UP).angle_to(g_arm * q_fore * Vector3.UP)
		var forward_share := clampf(swing / 0.35, 0.0, 1.0)
		var want := lerpf(ELBOW_WALK + ELBOW_WALK_FORWARD * forward_share, ELBOW_RUN, share_run)
		var add := maxf(0.0, want - bent) * w
		if add > 0.001:
			sk.set_bone_pose_rotation(idx[PoseRig.FOREARM[side]], Quaternion(g_arm.inverse() * chest_lat, add) * q_fore)
	return split
