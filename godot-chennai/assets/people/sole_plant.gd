## Keeps a person's lowest sole on the ground while clips blend (the gait-blend lesson of the
## Three.js version: each clip is planted when baked, but a 0.22 s cross-fade between two
## planted clips still dips a sole by up to ~6.5 cm). Measures up to MAX_POINTS sole vertices
## of the mesh, skinned with their own weights, once per frame.
##
## Usage (`const SolePlant := preload("res://assets/people/sole_plant.gd")`):
##   var plant := SolePlant.new(skeleton, body_mesh)   # once, skeleton in its rest pose
##   plant.apply()   # every frame after the AnimationPlayer/AnimationTree posed the skeleton
## `apply()` moves the Skeleton3D node up or down so the lowest sole point is at height 0.
## Use it on near (LOD0) people only; far people can skip it.
extends RefCounted

const MAX_POINTS := 96
## Directions for the support points: straight down and rings this far (degrees) from it, in
## the rest pose's frame (a foot part turns almost rigidly, so its lowest point is one of them).
const RINGS: Array[float] = [22.0, 45.0, 68.0]
const RING_STEPS := 8

var skeleton: Skeleton3D
var base_y := 0.0
## Per point: bones (skeleton indices), weights, and the point in each bone's rest frame.
var point_bones: Array[PackedInt32Array] = []
var point_weights: Array[PackedFloat32Array] = []
var point_local: Array[PackedVector3Array] = []


func _init(skel: Skeleton3D, body: MeshInstance3D) -> void:
	skeleton = skel
	base_y = skel.position.y
	var skin := body.skin
	var feet := {}
	for side: String in ["Left", "Right"]:
		for part: String in ["Foot", "ToeBase"]:
			var b := skel.find_bone("mixamorig_%s%s" % [side, part])
			if b >= 0:
				feet[b] = true
	var bind_bone := PackedInt32Array()
	for i in skin.get_bind_count():
		var bone := skin.get_bind_bone(i)
		bind_bone.append(bone if bone >= 0 else skel.find_bone(skin.get_bind_name(i)))
	var found: Array = []
	for s in body.mesh.get_surface_count():
		var arrays := body.mesh.surface_get_arrays(s)
		var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
		var ids: PackedInt32Array = arrays[Mesh.ARRAY_BONES]
		var ws: PackedFloat32Array = arrays[Mesh.ARRAY_WEIGHTS]
		var per := ids.size() / maxi(1, verts.size())
		for i in verts.size():
			var bones := PackedInt32Array()
			var weights := PackedFloat32Array()
			var locals := PackedVector3Array()
			var rest_pos := Vector3.ZERO
			# Moved mostly by the foot and toe bones together (the ball of the foot is shared
			# between them and is the lowest point at toe-off).
			var foot_weight := 0.0
			var part := -1
			var part_weight := 0.0
			for j in per:
				var w := ws[i * per + j]
				if w <= 0.0:
					continue
				var bind := ids[i * per + j]
				var bone := bind_bone[bind]
				var rest := skel.get_bone_global_rest(bone)
				var p := rest * skin.get_bind_pose(bind) * verts[i]
				rest_pos += p * w
				if feet.has(bone):
					foot_weight += w
					if w > part_weight:
						part = bone
						part_weight = w
				bones.append(bone)
				weights.append(w)
				locals.append(rest.affine_inverse() * p)
			if foot_weight >= 0.5 and rest_pos.y < 0.06:
				found.append([rest_pos.y, bones, weights, locals, part, rest_pos])
	var chosen := {}
	for d in _directions():
		var best_per_part := {}
		for k in found.size():
			var part: int = found[k][4]
			var reach := (found[k][5] as Vector3).dot(d)
			if not best_per_part.has(part) or reach > float((best_per_part[part] as Array)[1]):
				best_per_part[part] = [k, reach]
		for part: int in best_per_part:
			chosen[int((best_per_part[part] as Array)[0])] = true
	var lowest: Array[int] = []
	for k in found.size():
		if float(found[k][0]) < 0.03 and not chosen.has(k):
			lowest.append(k)
	lowest.sort_custom(func(a: int, b: int) -> bool: return float(found[a][0]) < float(found[b][0]))
	var picks: Array[int] = []
	for k: int in chosen:
		picks.append(k)
	var room := maxi(0, MAX_POINTS - picks.size())
	if room > 0 and not lowest.is_empty():
		var step := maxi(1, ceili(float(lowest.size()) / room))
		for i in range(0, lowest.size(), step):
			if picks.size() < MAX_POINTS:
				picks.append(lowest[i])
	for k: int in picks.slice(0, MAX_POINTS):
		point_bones.append(found[k][1])
		point_weights.append(found[k][2])
		point_local.append(found[k][3])


## Straight down, then RING_STEPS directions on each ring round it.
static func _directions() -> Array[Vector3]:
	var out: Array[Vector3] = [Vector3.DOWN]
	for ring in RINGS:
		var r := deg_to_rad(ring)
		for i in RING_STEPS:
			var a := TAU * i / RING_STEPS
			out.append(Vector3(sin(r) * cos(a), -cos(r), sin(r) * sin(a)))
	return out


## The height of the lowest sole point above the rest ground, before any correction.
func sole_height() -> float:
	var low := INF
	for i in point_bones.size():
		var p := Vector3.ZERO
		var bones := point_bones[i]
		for j in bones.size():
			p += (skeleton.get_bone_global_pose(bones[j]) * point_local[i][j]) * point_weights[i][j]
		low = minf(low, p.y)
	return low


## Shifts the skeleton so the lowest sole point is at height 0. Returns the shift in metres.
func apply() -> float:
	var h := sole_height()
	if is_inf(h):
		return 0.0
	skeleton.position.y = base_y - h
	return -h
