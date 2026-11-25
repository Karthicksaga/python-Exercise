class_name HandReach
extends RefCounted
## Placing a hand (decision G-430): the palm on a point with the fingers along a direction (a
## box held at its sides), or a held thing's axis along a direction (a bat), solved on a
## `PoseRig` with the two-bone arm solver. Shared by the strike and carry poses and by the
## weapon models, which need the same idea of "the way a hand holds something".
##
## The hand's three axes, in the hand bone's own rest frame (`axes`): the fingers' direction,
## across the knuckles towards the thumb, and the palm's normal (where the fingertips curl to).


## [finger direction, thumb side, palm normal] of `side`'s hand, unit vectors in the hand bone's
## local rest frame, plus the palm's centre as a fourth entry (a position in that frame).
static func axes(r: PoseRig, side: int) -> PackedVector3Array:
	var sk := r.skeleton
	var hand := r.index[PoseRig.HAND[side]]
	var rest := sk.get_bone_global_rest(hand)
	var inv := rest.basis.orthonormalized().inverse()
	var out := PackedVector3Array([Vector3.UP, Vector3.RIGHT, Vector3.BACK, Vector3.ZERO])
	var mid := r.knuckle[side]
	if mid < 0:
		return out
	var finger := inv * (sk.get_bone_global_rest(mid).origin - rest.origin)
	out[3] = finger * 0.6
	out[0] = finger.normalized()
	var f := r.fingers[side]
	if f.size() == 12:
		var index_1 := sk.get_bone_global_rest(f[0]).origin
		var pinky_1 := sk.get_bone_global_rest(f[9]).origin
		var thumb_side := (index_1 - pinky_1).normalized()
		var m1 := sk.get_bone_global_rest(f[3]).origin
		var m2 := sk.get_bone_global_rest(f[4]).origin
		var m3 := sk.get_bone_global_rest(f[5]).origin
		var bend := (m2 - m1).cross(m3 - m2)
		var axis := thumb_side
		if bend.dot(axis) < 0.0:
			axis = -axis
		# A positive turn about `axis` takes the fingers towards the palm.
		var palm := (inv * axis).cross(out[0]).normalized()
		var thumb_local := inv * thumb_side
		# Thumb side made square to the fingers.
		thumb_local = (thumb_local - out[0] * thumb_local.dot(out[0])).normalized()
		out[1] = thumb_local
		out[2] = palm
	return out


## Distance from the wrist joint to the palm's centre now, metres (figure frame).
static func palm_offset(r: PoseRig, side: int) -> float:
	return r.at(PoseRig.HAND[side]).distance_to(r.palm(side))


## Palm on `palm_target` (figure frame) with the fingers pointing along `finger_dir`, the elbow
## towards `pole`. Returns how far the palm ends from the target, metres.
static func place_palm(r: PoseRig, side: int, palm_target: Vector3, pole: Vector3, finger_dir: Vector3) -> float:
	var off := palm_offset(r, side)
	var dir := finger_dir.normalized()
	r.reach(PoseRig.ARM[side], PoseRig.FOREARM[side], PoseRig.HAND[side], palm_target - dir * off, pole)
	aim_fingers(r, side, dir)
	return r.palm(side).distance_to(palm_target)


## Turns the hand about the wrist so the line wrist to middle knuckle points along `fig_dir`.
static func aim_fingers(r: PoseRig, side: int, fig_dir: Vector3) -> void:
	var kn := r.knuckle[side]
	if kn < 0:
		return
	var hb := PoseRig.HAND[side]
	var from := (r.skeleton.get_bone_global_pose(kn).origin - r.pose(hb).origin).normalized()
	var to := r.axis(fig_dir)
	if from.dot(to) < 0.99999:
		r.set_global_basis(hb, Basis(PoseRig._arc(from, to)) * r.pose(hb).basis.orthonormalized())


## Palm on `palm_target` with the hand's own direction `local_axis` (a vector in the hand
## bone's frame, e.g. its thumb side) along `fig_dir`: what a hand holding a bat or a bottle
## does. A few passes, since the palm moves as the hand turns.
static func place_axis(r: PoseRig, side: int, palm_target: Vector3, pole: Vector3, local_axis: Vector3, fig_dir: Vector3) -> float:
	var hb := PoseRig.HAND[side]
	var to := r.axis(fig_dir)
	for pass_i in 3:
		var off := r.palm(side) - r.at(hb)
		r.reach(PoseRig.ARM[side], PoseRig.FOREARM[side], hb, palm_target - off, pole)
		var basis := r.pose(hb).basis.orthonormalized()
		var from := (basis * local_axis).normalized()
		if from.dot(to) < 0.99999:
			r.set_global_basis(hb, Basis(PoseRig._arc(from, to)) * basis)
	return r.palm(side).distance_to(palm_target)


## Rolls the hand about its own fingers so its palm faces `fig_palm_dir` (figure frame), as far
## as it can square to the fingers. `axes` is what `axes(r, side)` returned.
static func roll_palm(r: PoseRig, side: int, ax: PackedVector3Array, fig_palm_dir: Vector3) -> void:
	var hb := PoseRig.HAND[side]
	var basis := r.pose(hb).basis.orthonormalized()
	var fingers := (basis * ax[0]).normalized()
	var now := basis * ax[2]
	var want := r.axis(fig_palm_dir)
	now = (now - fingers * now.dot(fingers)).normalized()
	want = (want - fingers * want.dot(fingers))
	if want.length_squared() < 0.0001:
		return
	want = want.normalized()
	var angle := now.signed_angle_to(want, fingers)
	if absf(angle) > 0.0001:
		r.set_global_basis(hb, Basis(fingers, angle) * basis)
