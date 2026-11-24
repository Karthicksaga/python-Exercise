class_name Retarget
extends RefCounted
## Retargets clips recorded on one skeleton (the clip rig of `locomotion.glb`; any rest pose) onto
## another with the same bone names but different rest orientations (the A-pose MPFB rig of
## every MakeHuman character). Port of the Three.js `retarget.ts` + `plantSoles` (decision G-61).
##
## For every frame, each bone's rotation away from rest is measured in model space on the
## source and applied to the target's rest orientation, then turned back into the target's
## local space. Only rotations carry over, so the target keeps its own proportions.
##
## The rest poses differ, so each limb bone's target rest is first turned to point the way the
## source's does. Hands are lined up by their whole frame (fingers' direction and the line across
## the knuckles), each finger joint after the joint above it: without that every A-pose wrist
## took the T-pose clips' turn on top of its own and bent about 70° in towards the body.
##
## The hips are then raised or lowered per frame so the lowest sole vertex stays at its rest
## height (the clips carry no hip movement; a bent stance knee would lift the figure, a pointed
## toe would sink it). The vertices that come near the lowest in any frame are returned as the
## candidates the figure checks at run time, during blends (`HumanFigure`).
##
## Works on plain data (`RigData`, `SoleSet`, `Animation`), so it can run on a worker thread.

const SAMPLE_RATE := 30.0
## The lowest few sole vertices of every sampled frame are run-time candidates, with the
## support points of each foot part (`SoleSet.support_points`).
const CANDIDATES_PER_FRAME := 4

## Limb bones and the child that gives the direction each one points in.
const LIMB_CHILD := {
	"LeftShoulder": "LeftArm", "LeftArm": "LeftForeArm", "LeftForeArm": "LeftHand",
	"RightShoulder": "RightArm", "RightArm": "RightForeArm", "RightForeArm": "RightHand",
	"LeftUpLeg": "LeftLeg", "LeftLeg": "LeftFoot", "RightUpLeg": "RightLeg", "RightLeg": "RightFoot",
}

## The result: clips by name, and the sole vertices worth checking at run time.
class Result:
	extends RefCounted
	var clips: Dictionary[String, Animation] = {}
	var candidates: PackedInt32Array = PackedInt32Array()
	## Largest hip correction applied in any frame, metres (diagnostics).
	var largest_lift: float = 0.0


static func _finger(plain: String) -> PackedStringArray:
	# ["Left", "Index", "1"] for LeftHandIndex1, empty otherwise.
	for side: String in ["Left", "Right"]:
		for finger: String in ["Thumb", "Index", "Middle", "Ring", "Pinky"]:
			var stem := side + "Hand" + finger
			if plain.begins_with(stem) and plain.length() == stem.length() + 1 and plain.right(1).is_valid_int():
				return PackedStringArray([side, finger, plain.right(1)])
	return PackedStringArray()


static func _between(rig: RigData, rest: Array[Transform3D], from: String, to: String) -> Vector3:
	var a := rig.find(from)
	var b := rig.find(to)
	if a < 0 or b < 0:
		return Vector3.ZERO
	var d := rest[b].origin - rest[a].origin
	return Vector3.ZERO if d.length_squared() < 1e-12 else d.normalized()


## The turn that lines a target hand up with the source's (fingers' direction and knuckle line).
static func _hand_turn(target: RigData, target_rest: Array[Transform3D], source: RigData, source_rest: Array[Transform3D], hand: String) -> Variant:
	var a: Variant = _hand_frame(target, target_rest, hand)
	var b: Variant = _hand_frame(source, source_rest, hand)
	if a == null or b == null:
		return null
	var ba: Basis = a
	var bb: Basis = b
	return (bb * ba.transposed()).orthonormalized().get_rotation_quaternion()


static func _hand_frame(rig: RigData, rest: Array[Transform3D], hand: String) -> Variant:
	var along := _between(rig, rest, hand, hand + "Middle1")
	var across := _between(rig, rest, hand + "Index1", hand + "Pinky1")
	if along == Vector3.ZERO or across == Vector3.ZERO:
		return null
	var side := across - along * across.dot(along)
	if side.length_squared() < 1e-8:
		return null
	side = side.normalized()
	return Basis(along, side, along.cross(side))


static func _track_bone(rig: RigData, path: NodePath) -> int:
	# "Armature/mixamorig_Hips" (joint nodes) or "Armature/Skeleton3D:mixamorig_Hips" (skeleton).
	var raw: String = path.get_concatenated_subnames() if path.get_subname_count() > 0 else String(path.get_name(path.get_name_count() - 1))
	return rig.find(BoneNames.plain(raw))


## Retargets `clips` (recorded on `source`) onto `target`. `skeleton_path` is the target
## skeleton's path from the AnimationMixer's root node, for the new tracks. `soles` are the
## target's sole vertices (`SoleSet.from_meshes`); with none, no hip track is made.
static func run(source: RigData, clips: Dictionary[String, Animation], target: RigData, skeleton_path: String, soles: SoleSet) -> Result:
	var result := Result.new()
	var source_rest := source.rest_model()
	var target_rest := target.rest_model()
	var n := target.count()
	var src_of := PackedInt32Array()
	var rest_world: Array[Quaternion] = []
	var source_rest_inverse: Array[Quaternion] = []
	var rest_local_rot: Array[Quaternion] = []
	var turns: Dictionary[String, Quaternion] = {}
	for i in n:
		var name := target.names[i]
		var s := source.find(name)
		src_of.append(s)
		rest_local_rot.append(target.rest_local[i].basis.get_rotation_quaternion())
		var rw := target_rest[i].basis.get_rotation_quaternion()
		if LIMB_CHILD.has(name):
			var child: String = LIMB_CHILD[name]
			var mine := _between(target, target_rest, name, child)
			var theirs := _between(source, source_rest, name, child)
			if mine != Vector3.ZERO and theirs != Vector3.ZERO:
				rw = Quaternion(mine, theirs) * rw
		var turn: Variant = null
		var finger := _finger(name)
		if name == "LeftHand" or name == "RightHand":
			turn = _hand_turn(target, target_rest, source, source_rest, name)
		elif not finger.is_empty():
			var p := target.parents[i]
			var parent_name := target.names[p] if p >= 0 else ""
			if turns.has(parent_name):
				turn = turns[parent_name]
		if turn != null:
			var t: Quaternion = turn
			if not finger.is_empty():
				var next := "%sHand%s%d" % [finger[0], finger[1], int(finger[2]) + 1]
				if target.find(next) >= 0 and source.find(next) >= 0:
					var along := t * _between(target, target_rest, name, next)
					var wanted := _between(source, source_rest, name, next)
					if along != Vector3.ZERO and wanted != Vector3.ZERO:
						t = Quaternion(along.normalized(), wanted) * t
			turns[name] = t
			rw = t * rw
		rest_world.append(rw)
		source_rest_inverse.append(source_rest[s].basis.get_rotation_quaternion().inverse() if s >= 0 else Quaternion.IDENTITY)

	var hips := target.find("Hips")
	var hips_rest := target.rest_local[hips].origin if hips >= 0 else Vector3.ZERO
	var plant := hips >= 0 and soles != null and soles.vertex_count() > 0
	var rest_low := soles.lowest(target_rest) if plant else 0.0
	var source_root := source.to_model.basis.get_rotation_quaternion()
	var target_root := target.to_model.basis.get_rotation_quaternion()
	var candidate := {}

	for clip_name: String in clips:
		var clip: Animation = clips[clip_name]
		var track_of := PackedInt32Array()
		track_of.resize(source.count())
		track_of.fill(-1)
		for t in clip.get_track_count():
			if clip.track_get_type(t) != Animation.TYPE_ROTATION_3D:
				continue
			var b := _track_bone(source, clip.track_get_path(t))
			if b >= 0:
				track_of[b] = t
		var out := Animation.new()
		out.length = clip.length
		out.loop_mode = Animation.LOOP_LINEAR
		var tracks := PackedInt32Array()
		for i in n:
			if src_of[i] >= 0:
				var tr := out.add_track(Animation.TYPE_ROTATION_3D)
				out.track_set_path(tr, NodePath("%s:%s" % [skeleton_path, target.raw_names[i]]))
				tracks.append(tr)
			else:
				tracks.append(-1)
		var hips_track := -1
		if plant:
			hips_track = out.add_track(Animation.TYPE_POSITION_3D)
			out.track_set_path(hips_track, NodePath("%s:%s" % [skeleton_path, target.raw_names[hips]]))
		var frames := maxi(2, roundi(clip.length * SAMPLE_RATE) + 1)
		var src_world: Array[Quaternion] = []
		src_world.resize(source.count())
		var world: Array[Quaternion] = []
		world.resize(n)
		var locals: Array[Quaternion] = []
		locals.resize(n)
		for f in frames:
			var time := float(f) / float(frames - 1) * clip.length
			var at := minf(time, clip.length - 1e-4)
			for j in source.count():
				var local := source.rest_local[j].basis.get_rotation_quaternion()
				if track_of[j] >= 0:
					local = clip.rotation_track_interpolate(track_of[j], at)
				var sp := source.parents[j]
				src_world[j] = (source_root if sp < 0 else src_world[sp]) * local
			for i in n:
				var p := target.parents[i]
				var parent_world := target_root if p < 0 else world[p]
				if src_of[i] >= 0:
					world[i] = src_world[src_of[i]] * source_rest_inverse[i] * rest_world[i]
				else:
					world[i] = parent_world * rest_local_rot[i]
				locals[i] = (parent_world.inverse() * world[i]).normalized()
				if tracks[i] >= 0:
					out.rotation_track_insert_key(tracks[i], time, locals[i])
			if plant:
				var poses := target.pose_model(locals, {hips: hips_rest})
				var heights := soles.heights(poses)
				var low := INF
				for h in heights:
					low = minf(low, h)
				# The few lowest of this frame join the run-time candidates.
				var lowest_few := _lowest_indices(heights, CANDIDATES_PER_FRAME)
				for v in lowest_few:
					candidate[v] = true
				var dy := rest_low - low
				result.largest_lift = maxf(result.largest_lift, absf(dy))
				var hp := target.parents[hips]
				var parent_basis := target.to_model.basis if hp < 0 else poses[hp].basis
				out.position_track_insert_key(hips_track, time, hips_rest + parent_basis.inverse() * Vector3(0.0, dy, 0.0))
		result.clips[clip_name] = out
	if plant:
		for v in soles.support_points(target_rest):
			candidate[v] = true
	for v: int in candidate:
		result.candidates.append(v)
	result.candidates.sort()
	return result


static func _lowest_indices(values: PackedFloat32Array, count: int) -> PackedInt32Array:
	var out := PackedInt32Array()
	var taken := {}
	for k in mini(count, values.size()):
		var best := -1
		for v in values.size():
			if not taken.has(v) and (best < 0 or values[v] < values[best]):
				best = v
		taken[best] = true
		out.append(best)
	return out


## Model-space poses of the source rig at `time` in `clip` (for tests comparing the two rigs).
static func sample_source(source: RigData, clip: Animation, time: float) -> Array[Transform3D]:
	var locals: Array[Quaternion] = []
	for j in source.count():
		locals.append(source.rest_local[j].basis.get_rotation_quaternion())
	for t in clip.get_track_count():
		if clip.track_get_type(t) == Animation.TYPE_ROTATION_3D:
			var b := _track_bone(source, clip.track_get_path(t))
			if b >= 0:
				locals[b] = clip.rotation_track_interpolate(t, minf(time, clip.length - 1e-4))
	return source.pose_model(locals, {})
