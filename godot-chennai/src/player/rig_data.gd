class_name RigData
extends RefCounted
## A skeleton as plain data (decision G-61): bone names, parents and rest transforms, read once
## on the main thread from a Skeleton3D (a character) or from a hierarchy of Node3D joints (the
## Mixamo clip rig in `locomotion.glb`, which has no skin), so retargeting can run on a worker
## thread without touching nodes.
##
## Bones are in parent-before-child order. "Model space" is the space of the imported scene's
## root: the skeleton's (or armature's) own transform is folded in as `to_model`.

## Plain bone names (`Hips`, `LeftArm`...), whatever prefix the rig used (`bone_names.gd`).
var names: PackedStringArray = PackedStringArray()
## The rig's own names (`mixamorig_Hips`), for animation track paths.
var raw_names: PackedStringArray = PackedStringArray()
var parents: PackedInt32Array = PackedInt32Array()
var rest_local: Array[Transform3D] = []
## For a rig read from a Skeleton3D: each bone's index in that skeleton.
var skeleton_index: PackedInt32Array = PackedInt32Array()
## Skeleton (or armature) space to model space.
var to_model: Transform3D = Transform3D.IDENTITY
var _index: Dictionary[String, int] = {}


func find(plain: String) -> int:
	return _index.get(plain, -1)


func count() -> int:
	return names.size()


## Rest pose in model space, one transform per bone.
func rest_model() -> Array[Transform3D]:
	var locals: Array[Quaternion] = []
	for t in rest_local:
		locals.append(t.basis.get_rotation_quaternion())
	return pose_model(locals, {})


## Model-space transforms for local rotations `locals` (one per bone) on the rest positions,
## with optional position overrides {bone index: local position}.
func pose_model(locals: Array[Quaternion], positions: Dictionary) -> Array[Transform3D]:
	var out: Array[Transform3D] = []
	out.resize(names.size())
	for i in names.size():
		var rest := rest_local[i]
		var origin: Vector3 = positions.get(i, rest.origin)
		var local := Transform3D(Basis(locals[i]).scaled(rest.basis.get_scale()), origin)
		var p := parents[i]
		out[i] = (to_model if p < 0 else out[p]) * local
	return out


## Appends a bone (its parent must already be in the rig, or -1).
func add_bone(raw: String, parent: int, rest: Transform3D) -> void:
	_index[BoneNames.plain(raw)] = names.size()
	names.append(BoneNames.plain(raw))
	raw_names.append(raw)
	parents.append(parent)
	rest_local.append(rest)


## From a character's skeleton; `to_model` is the skeleton's transform relative to `model_root`.
static func from_skeleton(skeleton: Skeleton3D, model_root: Node3D) -> RigData:
	var rig := RigData.new()
	rig.to_model = _relative(skeleton, model_root)
	# Skeleton3D keeps parents before children for imported rigs; check rather than assume.
	var order := _parent_first(skeleton)
	var remap: Dictionary[int, int] = {}
	for bone in order:
		var p := skeleton.get_bone_parent(bone)
		remap[bone] = rig.names.size()
		rig.skeleton_index.append(bone)
		rig.add_bone(skeleton.get_bone_name(bone), remap.get(p, -1) if p >= 0 else -1, skeleton.get_bone_rest(bone))
	return rig


## From a hierarchy of Node3D joints under `armature` whose names start with `prefix`.
static func from_joints(armature: Node3D, model_root: Node3D, prefix: String = "mixamorig") -> RigData:
	var rig := RigData.new()
	rig.to_model = _relative(armature, model_root)
	_walk(rig, armature, -1, prefix)
	return rig


static func _walk(rig: RigData, node: Node, parent: int, prefix: String) -> void:
	for child in node.get_children():
		var joint := child as Node3D
		if joint == null:
			continue
		if joint.name.begins_with(prefix):
			rig.add_bone(joint.name, parent, joint.transform)
			_walk(rig, joint, rig.names.size() - 1, prefix)


static func _relative(node: Node3D, root: Node3D) -> Transform3D:
	var t := Transform3D.IDENTITY
	var n: Node = node
	while n != null and n != root:
		var n3 := n as Node3D
		if n3 != null:
			t = n3.transform * t
		n = n.get_parent()
	return t


static func _parent_first(skeleton: Skeleton3D) -> PackedInt32Array:
	var out := PackedInt32Array()
	var stack: Array[int] = []
	for root in skeleton.get_parentless_bones():
		stack.append(root)
	stack.reverse()
	while not stack.is_empty():
		var bone: int = stack.pop_back()
		out.append(bone)
		var children := skeleton.get_bone_children(bone)
		for k in range(children.size() - 1, -1, -1):
			stack.append(children[k])
	return out
