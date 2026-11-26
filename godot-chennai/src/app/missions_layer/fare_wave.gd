class_name FareWave
extends RefCounted
## A person at the kerb waving to the player (G-283): the right arm is raised overhead and the
## forearm sways, set on the skeleton after each `HumanFigure.advance` (the same trick as the
## figure's own arm settle, which also works in model space). There is no wave clip in the cast
## (idle, walk, run, sit, talk), so it is procedural; a clip would replace this one call.

## Degrees the raised upper arm stands out from straight down, and the forearm's sway either way.
const RAISE := 150.0
const SWAY := 24.0
## Waves per second.
const RATE := 1.6


## Raise the right arm and sway the forearm at game time `t` (seconds).
static func apply(fig: HumanFigure, t: float) -> void:
	if fig == null or fig.rig == null or fig.skeleton == null:
		return
	var arm := fig.rig.find("RightArm")
	var fore := fig.rig.find("RightForeArm")
	if arm < 0 or fore < 0:
		return
	var by := RAISE - fig.arm_out("Right")
	_turn(fig, arm, -deg_to_rad(by))
	_turn(fig, fore, deg_to_rad(SWAY) * sin(t * TAU * RATE))


## Turn bone `i` about the model's front-back axis by `angle` (radians) in its parent's frame.
static func _turn(fig: HumanFigure, i: int, angle: float) -> void:
	var p := fig.poses()
	var parent := fig.rig.parents[i]
	var parent_basis := (p[parent].basis if parent >= 0 else fig.rig.to_model.basis).orthonormalized()
	var axis := (parent_basis.inverse() * Vector3.BACK).normalized()
	var bone := fig.rig.skeleton_index[i]
	fig.skeleton.set_bone_pose_rotation(bone, (Quaternion(axis, angle) * fig.skeleton.get_bone_pose_rotation(bone)).normalized())


## The height of the right hand over the figure's head, metres (negative: below). For tests.
static func hand_above_head(fig: HumanFigure) -> float:
	var p := fig.poses()
	var hand := fig.rig.find("RightHand")
	var head := fig.rig.find("Head")
	if hand < 0 or head < 0:
		return -INF
	return (p[hand].origin.y - p[head].origin.y) * fig.model_scale
