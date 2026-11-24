class_name PoseRig
extends RefCounted
## A person's skeleton seen as a body (decision G-260): the bones the procedural poses move, by
## plain name, and the few operations they are built from (set a bone's orientation, bend it
## about an axis of the body, aim it, solve a two-bone limb). Shared by the player's
## `HumanFigure` and the streets' `PersonView`, so a seated driver, a passenger, a fall and the
## arm swing look the same on everyone of the cast.
##
## Two spaces: the **figure frame** is the node that owns the person (origin at the feet, +X
## right, +Y up, -Z forwards, metres); **skeleton space** is the Skeleton3D's own (the glTF model
## faces +Z and may be scaled). Targets come in the figure frame and are converted here.
##
## Everything a pose writes goes to the skeleton's local bone poses, like the clips do, so the
## next clip update replaces it; the poses are applied after the clip, every update.

## The bones the poses use, in parent-before-child order (Hips first).
const BONES: PackedStringArray = [
	"Hips", "Spine", "Spine1", "Spine2", "Neck", "Head",
	"LeftShoulder", "LeftArm", "LeftForeArm", "LeftHand",
	"RightShoulder", "RightArm", "RightForeArm", "RightHand",
	"LeftUpLeg", "LeftLeg", "LeftFoot", "LeftToeBase",
	"RightUpLeg", "RightLeg", "RightFoot", "RightToeBase",
]
const HIPS := 0
const SPINE := 1
const SPINE1 := 2
const SPINE2 := 3
const NECK := 4
const HEAD := 5
## Per side (0 left, 1 right): shoulder, upper arm, forearm, hand; thigh, shin, foot, toes.
const SHOULDER: PackedInt32Array = [6, 10]
const ARM: PackedInt32Array = [7, 11]
const FOREARM: PackedInt32Array = [8, 12]
const HAND: PackedInt32Array = [9, 13]
const UPLEG: PackedInt32Array = [14, 18]
const LEG: PackedInt32Array = [15, 19]
const FOOT: PackedInt32Array = [16, 20]
const TOE: PackedInt32Array = [17, 21]

var skeleton: Skeleton3D
## Skeleton bone index of each of BONES (-1 when the rig lacks it).
var index: PackedInt32Array = PackedInt32Array()
## The middle finger's first joint per side (the palm's far end), -1 when missing.
var knuckle: PackedInt32Array = PackedInt32Array([-1, -1])
## Figure frame to skeleton space and back.
var to_skel: Transform3D = Transform3D.IDENTITY
var to_fig: Transform3D = Transform3D.IDENTITY
## The rotation part of `to_skel` (axes and orientations).
var turn: Basis = Basis.IDENTITY
## Rest local rotations and the hips' rest position (skeleton space).
var rest_rot: Array[Quaternion] = []
var rest_hips: Vector3 = Vector3.ZERO
## The chest's (Spine2's) rest orientation in skeleton space, inverted (to read how the chest is
## turned now).
var chest_rest_inv: Quaternion = Quaternion.IDENTITY
## Lengths in the figure frame, metres: upper arm + forearm, thigh + shin.
var arm_length: float = 0.0
var leg_length: float = 0.0
## Height of the hip joints above the soles standing at rest, metres (figure frame).
var hip_height: float = 0.0
## Half the distance between the hip joints, metres.
var hip_half_width: float = 0.0
## Key poses for falls and getting up, built on first use (`Knockdown`).
var keys: Dictionary[StringName, PackedVector4Array] = {}


## A rig over `sk` whose skeleton space is `skel_in_fig` in the figure frame (the model's
## transform times the skeleton's place in the model). Null when a core bone is missing.
static func make(sk: Skeleton3D, skel_in_fig: Transform3D) -> PoseRig:
	var r := PoseRig.new()
	r.skeleton = sk
	var by_name: Dictionary[String, int] = {}
	for b in sk.get_bone_count():
		by_name[BoneNames.plain(sk.get_bone_name(b))] = b
	for n in BONES:
		var b: int = by_name.get(n, -1)
		if b < 0:
			return null
		r.index.append(b)
		r.rest_rot.append(sk.get_bone_rest(b).basis.get_rotation_quaternion())
	r.knuckle = PackedInt32Array([by_name.get("LeftHandMiddle1", -1), by_name.get("RightHandMiddle1", -1)])
	r.rest_hips = sk.get_bone_rest(r.index[HIPS]).origin
	r.chest_rest_inv = sk.get_bone_global_rest(r.index[SPINE2]).basis.get_rotation_quaternion().inverse()
	r.to_fig = skel_in_fig
	r.to_skel = skel_in_fig.affine_inverse()
	r.turn = r.to_skel.basis.orthonormalized()
	var arm0 := r._rest_at(ARM[1])
	var fore0 := r._rest_at(FOREARM[1])
	r.arm_length = arm0.distance_to(fore0) + fore0.distance_to(r._rest_at(HAND[1]))
	var knee0 := r._rest_at(LEG[1])
	r.leg_length = r._rest_at(UPLEG[1]).distance_to(knee0) + knee0.distance_to(r._rest_at(FOOT[1]))
	var hl := r._rest_at(UPLEG[0])
	var hr := r._rest_at(UPLEG[1])
	r.hip_height = (hl.y + hr.y) * 0.5
	r.hip_half_width = hl.distance_to(hr) * 0.5
	return r


func _rest_at(i: int) -> Vector3:
	return to_fig * skeleton.get_bone_global_rest(index[i]).origin


func bone(i: int) -> int:
	return index[i]


## A bone's model pose in skeleton space (updates the skeleton's cache if it is stale).
func pose(i: int) -> Transform3D:
	return skeleton.get_bone_global_pose(index[i])


## A bone's joint in the figure frame.
func at(i: int) -> Vector3:
	return to_fig * skeleton.get_bone_global_pose(index[i]).origin


## The palm's middle (between the wrist and the middle knuckle) in the figure frame.
func palm(side: int) -> Vector3:
	var w := at(HAND[side])
	if knuckle[side] < 0:
		return w
	var k := to_fig * skeleton.get_bone_global_pose(knuckle[side]).origin
	return w.lerp(k, 0.6)


## A direction or axis from the figure frame into skeleton space.
func axis(fig_dir: Vector3) -> Vector3:
	return (turn * fig_dir).normalized()


## Sets bone `i`'s orientation in skeleton space (its children follow).
func set_global_basis(i: int, b: Basis) -> void:
	var sb := index[i]
	var parent := skeleton.get_bone_parent(sb)
	var pb := skeleton.get_bone_global_pose(parent).basis.orthonormalized() if parent >= 0 else Basis.IDENTITY
	skeleton.set_bone_pose_rotation(sb, (pb.inverse() * b.orthonormalized()).get_rotation_quaternion())


## Turns bone `i` by `angle` radians about `fig_axis` (figure frame), children following.
func bend(i: int, fig_axis: Vector3, angle: float) -> void:
	if absf(angle) < 0.00001:
		return
	set_global_basis(i, Basis(axis(fig_axis), angle) * pose(i).basis.orthonormalized())


## Turns bone `i` the shortest way so the line from its joint to bone `child`'s joint points
## along `fig_dir` (figure frame).
func aim(i: int, child: int, fig_dir: Vector3) -> void:
	var from := (pose(child).origin - pose(i).origin).normalized()
	var to := axis(fig_dir)
	if from.is_zero_approx() or from.dot(to) > 0.99999:
		return
	set_global_basis(i, Basis(_arc(from, to)) * pose(i).basis.orthonormalized())


## Puts the core bones back to their rest rotations (fingers and anything else keep theirs).
func reset_to_rest() -> void:
	for k in index.size():
		skeleton.set_bone_pose_rotation(index[k], rest_rot[k])
	skeleton.set_bone_pose_position(index[HIPS], rest_hips)


## Moves the hips so the midpoint of the hip joints is at `fig_point`.
func place_hips(fig_point: Vector3) -> void:
	var mid := (pose(UPLEG[0]).origin + pose(UPLEG[1]).origin) * 0.5
	var delta := to_skel * fig_point - mid
	var hb := index[HIPS]
	var parent := skeleton.get_bone_parent(hb)
	var pb := skeleton.get_bone_global_pose(parent).basis.orthonormalized() if parent >= 0 else Basis.IDENTITY
	skeleton.set_bone_pose_position(hb, skeleton.get_bone_pose_position(hb) + pb.inverse() * delta)


## Two-bone limb (`upper`, `lower`, `end` of BONES): bends it so `end`'s joint reaches
## `fig_target`, the middle joint (elbow, knee) on the side of `fig_pole`. The hinge stays the
## hinge (the bend plane is turned onto the wanted one), so knees and elbows bend the way they
## can. Returns how far the end still is from the target (out of reach), metres.
func reach(upper: int, lower: int, end: int, fig_target: Vector3, fig_pole: Vector3) -> float:
	var a := pose(upper).origin
	var b := pose(lower).origin
	var c := pose(end).origin
	var target := to_skel * fig_target
	var pole := to_skel * fig_pole
	var l1 := a.distance_to(b)
	var l2 := b.distance_to(c)
	var to_t := target - a
	var d := clampf(to_t.length(), absf(l1 - l2) + 0.0005, l1 + l2 - 0.0005)
	var u := to_t.normalized()
	var v := pole - a
	v = v - u * v.dot(u)
	if v.length_squared() < 0.000001:
		v = u.cross(Vector3.RIGHT if absf(u.x) < 0.9 else Vector3.UP)
	v = v.normalized()
	var cos_a := clampf((l1 * l1 + d * d - l2 * l2) / (2.0 * l1 * d), -1.0, 1.0)
	var mid := a + (u * cos_a + v * sqrt(maxf(0.0, 1.0 - cos_a * cos_a))) * l1
	var end_at := a + u * d
	# Upper bone: its line onto a→mid, and the current bend plane onto the wanted one.
	var n_now := (b - a).cross(c - b)
	var n_want := (mid - a).cross(end_at - mid)
	var turn_upper: Basis
	if n_now.length_squared() > 0.00001 * l1 * l1 * l2 * l2 and n_want.length_squared() > 0.000001:
		turn_upper = _frame(b - a, n_now, mid - a, n_want)
	else:
		turn_upper = Basis(_arc((b - a).normalized(), (mid - a).normalized()))
	set_global_basis(upper, turn_upper * pose(upper).basis.orthonormalized())
	# Lower bone: its line onto mid→end.
	var b2 := pose(lower).origin
	var c2 := pose(end).origin
	var from := (c2 - b2).normalized()
	var to := (end_at - b2).normalized()
	if from.dot(to) < 0.99999:
		set_global_basis(lower, Basis(_arc(from, to)) * pose(lower).basis.orthonormalized())
	return (to_fig * pose(end).origin).distance_to(fig_target)


## Local rotations of BONES into `out` (resized once by the caller) and the hips position.
func capture(out: Array[Quaternion]) -> Vector3:
	for k in index.size():
		out[k] = skeleton.get_bone_pose_rotation(index[k])
	return skeleton.get_bone_pose_position(index[HIPS])


## Writes local rotations (and the hips position) captured earlier.
func restore(rots: Array[Quaternion], hips: Vector3) -> void:
	for k in index.size():
		skeleton.set_bone_pose_rotation(index[k], rots[k])
	skeleton.set_bone_pose_position(index[HIPS], hips)


## Writes `from` blended towards `to` by `t` (0..1), bone by bone.
func blend(from: Array[Quaternion], from_hips: Vector3, to: Array[Quaternion], to_hips: Vector3, t: float) -> void:
	for k in index.size():
		skeleton.set_bone_pose_rotation(index[k], from[k].slerp(to[k], t))
	skeleton.set_bone_pose_position(index[HIPS], from_hips.lerp(to_hips, t))


## The lowest of the main joints (head, hands, knees, feet, toes, hips) above the figure's
## ground, metres.
func lowest_joint() -> float:
	var low := INF
	for i: int in [HIPS, HEAD, HAND[0], HAND[1], LEG[0], LEG[1], FOOT[0], FOOT[1], TOE[0], TOE[1], FOREARM[0], FOREARM[1]]:
		low = minf(low, at(i).y)
	return low


## The rotation taking unit vector `from` onto unit vector `to` the shortest way.
static func _arc(from: Vector3, to: Vector3) -> Quaternion:
	var d := clampf(from.dot(to), -1.0, 1.0)
	if d < -0.99999:
		var side := from.cross(Vector3.RIGHT if absf(from.x) < 0.9 else Vector3.UP).normalized()
		return Quaternion(side, PI)
	var c := from.cross(to)
	return Quaternion(c.x, c.y, c.z, 1.0 + d).normalized()


## The rotation taking the frame of (`d0`, `n0`) onto the frame of (`d1`, `n1`): line onto line,
## and the plane normal onto the plane normal.
static func _frame(d0: Vector3, n0: Vector3, d1: Vector3, n1: Vector3) -> Basis:
	var x0 := d0.normalized()
	var y0 := (n0 - x0 * n0.dot(x0)).normalized()
	var x1 := d1.normalized()
	var y1 := (n1 - x1 * n1.dot(x1)).normalized()
	var f0 := Basis(x0, y0, x0.cross(y0))
	var f1 := Basis(x1, y1, x1.cross(y1))
	return f1 * f0.transposed()
