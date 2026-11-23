class_name SoleSet
extends RefCounted
## The vertices of a character's soles, as plain data, for keeping the feet on the ground
## (decision G-62; the Three.js lesson: a sole sank up to 8.5 cm in the 0.22 s gait blends, and
## up to 7 cm running when only a thinned sample of vertices was checked).
##
## A sole vertex is a vertex bound mostly to a foot bone (`Foot`, `ToeBase`, `Toe_End`) in the
## lower 45% of the feet at rest (heel to toe, up to the instep): the lowest point of a foot can
## be there in any pose of a walk or a run. Each influence is stored pre-multiplied by its bind
## pose, so a skinned position is `sum(weight * bone_pose * point)` with model-space bone poses
## (`to_model * skeleton-space pose`, as `RigData.pose_model` gives them).

const FOOT := ["Foot", "ToeBase", "Toe_End"]
const SOLE_SHARE := 0.45

## Per influence (4 per vertex): rig bone index, weight, bind pose * vertex.
var bones: PackedInt32Array = PackedInt32Array()
var weights: PackedFloat32Array = PackedFloat32Array()
var points: PackedVector3Array = PackedVector3Array()


func vertex_count() -> int:
	return bones.size() / 4


## Model-space height of each vertex for model-space bone poses `poses` (rig order).
func heights(poses: Array[Transform3D]) -> PackedFloat32Array:
	var out := PackedFloat32Array()
	var n := vertex_count()
	out.resize(n)
	for v in n:
		out[v] = height_of(v, poses)
	return out


func height_of(v: int, poses: Array[Transform3D]) -> float:
	var at := Vector3.ZERO
	for k in 4:
		var i := v * 4 + k
		var w := weights[i]
		if w > 0.0:
			at += poses[bones[i]] * points[i] * w
	return at.y


## The lowest model-space height over the vertices listed (all when `only` is empty).
func lowest(poses: Array[Transform3D], only: PackedInt32Array = PackedInt32Array()) -> float:
	var low := INF
	if only.is_empty():
		for v in vertex_count():
			low = minf(low, height_of(v, poses))
	else:
		for v in only:
			low = minf(low, height_of(v, poses))
	return low


## The vertices that can be the lowest of their foot part in some orientation: for each foot
## bone, the furthest vertex in each of `steps`² directions round the sphere (support points
## of the rest shape; a foot part turns almost rigidly, so its lowest point is one of them).
func support_points(rest: Array[Transform3D], steps: int = 10) -> PackedInt32Array:
	var groups: Dictionary[int, PackedInt32Array] = {}
	for v in vertex_count():
		var b := bones[v * 4]
		if not groups.has(b):
			groups[b] = PackedInt32Array()
		groups[b].append(v)
	var at := PackedVector3Array()
	at.resize(vertex_count())
	for v in vertex_count():
		var p := Vector3.ZERO
		for k in 4:
			p += rest[bones[v * 4 + k]] * points[v * 4 + k] * weights[v * 4 + k]
		at[v] = p
	var keep := {}
	for b: int in groups:
		for i in steps:
			for j in steps * 2:
				var theta := PI * (float(i) + 0.5) / float(steps)
				var phi := PI * float(j) / float(steps)
				var d := Vector3(sin(theta) * cos(phi), cos(theta), sin(theta) * sin(phi))
				var best := -1
				var far := -INF
				for v in groups[b]:
					var x := at[v].dot(d)
					if x > far:
						far = x
						best = v
				keep[best] = true
	var out := PackedInt32Array()
	for v: int in keep:
		out.append(v)
	out.sort()
	return out


## A copy holding only the vertices listed.
func subset(only: PackedInt32Array) -> SoleSet:
	var out := SoleSet.new()
	for v in only:
		for k in 4:
			out.bones.append(bones[v * 4 + k])
			out.weights.append(weights[v * 4 + k])
			out.points.append(points[v * 4 + k])
	return out


static func _is_foot(plain: String) -> bool:
	for side: String in ["Left", "Right"]:
		for part: String in FOOT:
			if plain == side + part:
				return true
	return false


## Every foot vertex of the skinned meshes under `skeleton` (`all_feet`: the whole foot, not only
## the sole, for measuring); `rig` gives bone indices (built from the same skeleton).
static func from_meshes(meshes: Array[MeshInstance3D], skeleton: Skeleton3D, rig: RigData, all_feet: bool = false) -> SoleSet:
	var out := SoleSet.new()
	var rest := rig.pose_model(_rest_rotations(rig), {})
	var heights := PackedFloat32Array()
	for mesh in meshes:
		var skin := mesh.skin
		if skin == null or mesh.mesh == null:
			continue
		# Skin bind index -> rig bone index.
		var bind_bone := PackedInt32Array()
		for b in skin.get_bind_count():
			var bone := skin.get_bind_bone(b)
			var raw: String = String(skin.get_bind_name(b)) if bone < 0 else skeleton.get_bone_name(bone)
			bind_bone.append(rig.find(BoneNames.plain(raw)))
		for s in mesh.mesh.get_surface_count():
			var arrays := mesh.mesh.surface_get_arrays(s)
			var verts: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
			var vb: Variant = arrays[Mesh.ARRAY_BONES]
			var vw: Variant = arrays[Mesh.ARRAY_WEIGHTS]
			if vb == null or vw == null:
				continue
			var vbones: PackedInt32Array = vb
			var vweights: PackedFloat32Array = vw
			var per := vbones.size() / maxi(1, verts.size())
			for v in verts.size():
				# The strongest influence decides whether this is a foot vertex.
				var best := 0
				for k in per:
					if vweights[v * per + k] > vweights[v * per + best]:
						best = k
				var main_bone := bind_bone[vbones[v * per + best]]
				if main_bone < 0 or not _is_foot(rig.names[main_bone]):
					continue
				# The four strongest influences (Godot imports 4 or 8 per vertex).
				var order: Array[int] = []
				for k in per:
					order.append(k)
				order.sort_custom(func(a: int, b: int) -> bool: return vweights[v * per + a] > vweights[v * per + b])
				var total := 0.0
				for k in mini(4, per):
					total += vweights[v * per + order[k]]
				var at := Vector3.ZERO
				for k in 4:
					if k >= per or total <= 0.0:
						out.bones.append(main_bone)
						out.weights.append(0.0)
						out.points.append(Vector3.ZERO)
						continue
					var bind := vbones[v * per + order[k]]
					var bone := bind_bone[bind]
					var w := vweights[v * per + order[k]] / total
					# Skinning: skeleton-space pose * bind pose * vertex; the model-space pose folds in `to_model`.
					var local := skin.get_bind_pose(bind) * verts[v]
					out.bones.append(maxi(bone, 0))
					out.weights.append(w if bone >= 0 else 0.0)
					out.points.append(local)
					if bone >= 0:
						at += rest[bone] * local * w
				heights.append(at.y)
	if all_feet or heights.is_empty():
		return out
	var floor_y := INF
	var top := -INF
	for h in heights:
		floor_y = minf(floor_y, h)
		top = maxf(top, h)
	var keep := PackedInt32Array()
	for v in heights.size():
		if heights[v] < floor_y + (top - floor_y) * SOLE_SHARE:
			keep.append(v)
	return out.subset(keep)


static func _rest_rotations(rig: RigData) -> Array[Quaternion]:
	var out: Array[Quaternion] = []
	for t in rig.rest_local:
		out.append(t.basis.get_rotation_quaternion())
	return out
