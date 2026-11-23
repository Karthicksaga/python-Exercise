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
	for side in ["Left", "Right"]:
		for part in ["Foot", "ToeBase"]:
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
			var on_foot := false
			for j in per:
				var w := ws[i * per + j]
				if w <= 0.0:
					continue
				var bind := ids[i * per + j]
				var bone := bind_bone[bind]
				var rest := skel.get_bone_global_rest(bone)
				var p := rest * skin.get_bind_pose(bind) * verts[i]
				rest_pos += p * w
				on_foot = on_foot or (feet.has(bone) and w >= 0.5)
				bones.append(bone)
				weights.append(w)
				locals.append(rest.affine_inverse() * p)
			if on_foot and rest_pos.y < 0.03:
				found.append([rest_pos.y, bones, weights, locals])
	found.sort_custom(func(a: Array, b: Array) -> bool: return a[0] < b[0])
	var step := maxi(1, found.size() / MAX_POINTS)
	for k in range(0, found.size(), step):
		point_bones.append(found[k][1])
		point_weights.append(found[k][2])
		point_local.append(found[k][3])


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
