class_name KnockdownPoses
extends RefCounted
## The key poses of a fall and a get-up (decision G-262), authored as the body's orientation and
## height plus the direction each limb points in the figure frame, then stored per rig as local
## rotations (so they blend with the clips bone by bone). Built once per figure, on first use.
##
## Directions are for the right side (+X); the left mirrors x. "On the back" is the body pitched
## +90° about +X: head towards +Z, face up, the ground below the back.

## Key → [pitch (rad), roll (rad), hips height (share of standing hip height, or metres if > 1
## is not needed: always a share), spine curl (rad, forwards negative), neck (rad), head turn
## (rad), arm, forearm, other arm, other forearm, thigh, shin, other thigh, other shin].
## "other" limbs are the left side; their x is already mirrored here.
const KEYS := {
	&"tumble": [0.0, 0.0, 1.0, -0.6, -0.3, 0.0,
		Vector3(0.6, 0.35, -0.72), Vector3(0.3, 0.85, -0.45), Vector3(-0.55, 0.45, -0.7), Vector3(-0.35, 0.8, -0.5),
		Vector3(0.15, -0.3, -0.94), Vector3(0.05, -0.85, 0.5), Vector3(-0.12, -0.45, -0.88), Vector3(-0.05, -0.9, 0.42)],
	&"crumple": [PI / 2.0, 0.3, 0.14, -0.45, -0.2, 0.0,
		Vector3(0.55, 0.45, 0.6), Vector3(-0.35, 0.6, 0.55), Vector3(-0.6, 0.35, 0.55), Vector3(0.3, 0.65, 0.5),
		Vector3(0.18, 0.8, -0.55), Vector3(0.05, -0.55, -0.83), Vector3(-0.15, 0.7, -0.68), Vector3(-0.05, -0.6, -0.8)],
	&"lying": [PI / 2.0, 0.08, 0.12, 0.0, 0.05, 0.35,
		Vector3(0.92, -0.12, 0.38), Vector3(0.75, -0.12, 0.65), Vector3(-0.9, -0.12, 0.1), Vector3(-0.95, -0.12, -0.25),
		Vector3(0.1, 0.0, -1.0), Vector3(0.12, -0.08, -0.99), Vector3(-0.12, 0.62, -0.78), Vector3(-0.05, -0.7, -0.71)],
	&"situp": [0.42, 0.0, 0.14, -0.35, -0.25, 0.0,
		Vector3(0.3, -0.72, 0.62), Vector3(0.22, -0.82, 0.5), Vector3(-0.3, -0.72, 0.62), Vector3(-0.22, -0.82, 0.5),
		Vector3(0.12, 0.55, -0.83), Vector3(0.04, -0.62, -0.78), Vector3(-0.1, 0.25, -0.96), Vector3(-0.05, -0.3, -0.95)],
	&"crouch": [0.0, 0.0, 0.36, -0.7, 0.45, 0.0,
		Vector3(0.22, -0.8, -0.56), Vector3(0.1, -0.86, -0.5), Vector3(-0.22, -0.8, -0.56), Vector3(-0.1, -0.86, -0.5),
		Vector3(0.16, -0.42, -0.89), Vector3(0.0, -0.3, 0.95), Vector3(-0.16, -0.42, -0.89), Vector3(0.0, -0.3, 0.95)],
	&"kneel": [0.0, 0.0, 0.58, -0.45, 0.2, 0.0,
		Vector3(0.22, -0.62, -0.75), Vector3(0.02, -0.55, -0.83), Vector3(-0.22, -0.95, -0.15), Vector3(-0.12, -0.85, -0.5),
		Vector3(0.12, -0.02, -0.99), Vector3(0.0, -1.0, 0.05), Vector3(-0.08, -0.96, 0.25), Vector3(-0.02, -0.12, 0.99)],
}


## Builds the keys into `rig.keys` (leaves the skeleton's pose as it was).
static func build(rig: PoseRig) -> void:
	if not rig.keys.is_empty():
		return
	var n := rig.index.size()
	var keep: Array[Quaternion] = []
	keep.resize(n)
	var keep_hips := rig.capture(keep)
	for key: StringName in KEYS:
		var k: Array = KEYS[key]
		rig.reset_to_rest()
		var root := Basis(Vector3.BACK, float(k[1])) * Basis(Vector3.RIGHT, float(k[0]))
		rig.set_global_basis(PoseRig.HIPS, Basis(rig.turn * root * rig.turn.inverse()) * Basis(rig.rest_rot[PoseRig.HIPS]))
		rig.place_hips(Vector3(0, rig.hip_height * float(k[2]), 0))
		var lateral := root * Vector3.RIGHT
		var curl := float(k[3])
		rig.bend(PoseRig.SPINE, lateral, curl * 0.4)
		rig.bend(PoseRig.SPINE1, lateral, curl * 0.35)
		rig.bend(PoseRig.SPINE2, lateral, curl * 0.25)
		rig.bend(PoseRig.NECK, lateral, float(k[4]))
		rig.bend(PoseRig.HEAD, root * Vector3.UP, float(k[5]))
		var limbs := [
			[PoseRig.ARM[1], PoseRig.FOREARM[1], 6], [PoseRig.FOREARM[1], PoseRig.HAND[1], 7],
			[PoseRig.ARM[0], PoseRig.FOREARM[0], 8], [PoseRig.FOREARM[0], PoseRig.HAND[0], 9],
			[PoseRig.UPLEG[1], PoseRig.LEG[1], 10], [PoseRig.LEG[1], PoseRig.FOOT[1], 11],
			[PoseRig.UPLEG[0], PoseRig.LEG[0], 12], [PoseRig.LEG[0], PoseRig.FOOT[0], 13],
		]
		for limb: Array in limbs:
			rig.aim(int(limb[0]), int(limb[1]), (k[int(limb[2])] as Vector3).normalized())
		# Feet: soles roughly square to the shins.
		for side in 2:
			var shin := (rig.at(PoseRig.FOOT[side]) - rig.at(PoseRig.LEG[side])).normalized()
			var toe := root * Vector3.FORWARD
			toe = (toe - shin * toe.dot(shin)).normalized()
			if not toe.is_zero_approx():
				rig.aim(PoseRig.FOOT[side], PoseRig.TOE[side], (toe + shin * 0.2).normalized())
		var packed := PackedVector4Array()
		packed.resize(n + 1)
		for b in n:
			var q := rig.skeleton.get_bone_pose_rotation(rig.index[b])
			packed[b] = Vector4(q.x, q.y, q.z, q.w)
		var hips_fig := rig.to_fig * rig.skeleton.get_bone_global_pose(rig.index[PoseRig.HIPS]).origin
		packed[n] = Vector4(hips_fig.x, hips_fig.y, hips_fig.z, 0.0)
		rig.keys[key] = packed
	rig.restore(keep, keep_hips)


## Key `key` turned by `yaw` about the figure's up axis into `out` (local rotations); returns the
## hips' local position (skeleton space).
static func load_key(rig: PoseRig, key: StringName, yaw: float, out: Array[Quaternion]) -> Vector3:
	var packed: PackedVector4Array = rig.keys[key]
	var n := rig.index.size()
	for b in n:
		var v := packed[b]
		out[b] = Quaternion(v.x, v.y, v.z, v.w)
	var turn := Basis(Vector3.UP, yaw)
	var skel_turn := Basis(rig.turn * turn * rig.turn.inverse())
	out[PoseRig.HIPS] = (skel_turn * Basis(out[PoseRig.HIPS])).get_rotation_quaternion()
	var h := packed[n]
	var hips_fig := turn * Vector3(h.x, h.y, h.z)
	# The hips bone is the root: its local position is in skeleton space.
	return rig.to_skel * hips_fig
