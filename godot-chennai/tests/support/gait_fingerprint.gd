## A clip's motion reduced to a few joint-angle curves over one loop, so a clip can be recognised
## after it was retargeted, eased and re-baked onto another skeleton (decision G-101). Used by
## `tests/unit/test_asset_licences.gd` to fail if any idle, walk or run still moves like the
## Mixamo clips the cast used before G-100.
##
## Features, each sampled at SAMPLES evenly spaced phases of the loop, in degrees and measured on
## joint positions only (so rest rolls, bone names and A- or T-pose rests do not matter):
## knee flexion (thigh line to shin line) and thigh pitch (forward of straight down, in the
## body's side plane) per leg, elbow flexion per arm.
extends RefCounted

const SAMPLES := 24
const LEGS: Array[String] = ["Left", "Right"]


## {clip name: PackedFloat32Array of SAMPLES * 6 values} for the clips of `names` found on the
## first AnimationPlayer of `scene` (a GLB scene with a Skeleton3D, or a skin-less joint
## hierarchy under a node named "Armature"). Empty when the scene has no such rig.
static func of_scene(scene: Node3D, names: PackedStringArray) -> Dictionary[String, PackedFloat32Array]:
	var out: Dictionary[String, PackedFloat32Array] = {}
	var rig := rig_of(scene)
	if rig == null or rig.find("LeftUpLeg") < 0 or rig.find("LeftForeArm") < 0:
		return out
	var players := scene.find_children("*", "AnimationPlayer", true, false)
	if players.is_empty():
		return out
	var player := players[0] as AnimationPlayer
	for n in names:
		if player.has_animation(n):
			out[n] = of_clip(rig, player.get_animation(n))
	return out


static func rig_of(scene: Node3D) -> RigData:
	var skeletons := scene.find_children("*", "Skeleton3D", true, false)
	if not skeletons.is_empty():
		return RigData.from_skeleton(skeletons[0] as Skeleton3D, scene)
	var armature := scene.find_child("Armature", true, false) as Node3D
	if armature != null:
		return RigData.from_joints(armature, scene)
	return null


static func of_clip(rig: RigData, clip: Animation) -> PackedFloat32Array:
	var values := PackedFloat32Array()
	for k in SAMPLES:
		var p := Retarget.sample_source(rig, clip, clip.length * k / SAMPLES)
		var hips := p[rig.find("Hips")].basis.orthonormalized()
		var forward := (hips * Vector3.BACK)  # glTF figures face +Z
		forward.y = 0.0
		forward = forward.normalized() if forward.length() > 1e-4 else Vector3.BACK
		for side in LEGS:
			var hip := p[rig.find(side + "UpLeg")].origin
			var knee := p[rig.find(side + "Leg")].origin
			var ankle := p[rig.find(side + "Foot")].origin
			var thigh := knee - hip
			values.append(rad_to_deg(thigh.angle_to(ankle - knee)))
			values.append(rad_to_deg(atan2(thigh.dot(forward), -thigh.y)))
		for side in LEGS:
			var shoulder := p[rig.find(side + "Arm")].origin
			var elbow := p[rig.find(side + "ForeArm")].origin
			var wrist := p[rig.find(side + "Hand")].origin
			values.append(rad_to_deg((elbow - shoulder).angle_to(wrist - elbow)))
	return values


## Root-mean-square difference in degrees between two fingerprints, at the best circular phase
## shift (loops can start anywhere) and with the legs either way round (a clip can start on the
## other foot).
static func distance(a: PackedFloat32Array, b: PackedFloat32Array) -> float:
	var per := a.size() / SAMPLES
	var best := INF
	for mirrored: bool in [false, true]:
		for shift in SAMPLES:
			var sum := 0.0
			for k in SAMPLES:
				var kb := (k + shift) % SAMPLES
				for f in per:
					var fb := f
					if mirrored:
						# Features: [L knee, L pitch, R knee, R pitch, L elbow, R elbow].
						fb = [2, 3, 0, 1, 5, 4][f] as int
					var d := a[k * per + f] - b[kb * per + fb]
					sum += d * d
			best = minf(best, sqrt(sum / (SAMPLES * per)))
	return best
