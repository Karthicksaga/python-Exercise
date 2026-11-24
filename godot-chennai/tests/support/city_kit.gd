class_name CityTestKit
extends RefCounted
## Shared set-up for the city tests: today's world (format 1, read once and cached), a chunk
## build kit, and the regional source. Not a test file (the runner only runs `test_*.gd`).

static var _v1: FileWorldSource
static var _kit: ChunkBuilder.Kit


static func v1() -> FileWorldSource:
	if _v1 == null:
		_v1 = FileWorldSource.new()
		_v1.open()
	return _v1


## A build kit over today's files; materials on the calling (main) thread.
static func kit() -> ChunkBuilder.Kit:
	if _kit != null:
		return _kit
	var k := ChunkBuilder.Kit.new()
	k.source = v1()
	k.layouts = CityLayouts.create(k.source)
	k.models = CityModels.create()
	k.materials = CityMaterials.create()
	k.tree_mesh = k.models.tree.commit(k.materials.foliage)
	k.palm_mesh = k.models.palm.commit(k.materials.foliage)
	k.tree_triangles = k.models.tree.triangle_count()
	k.palm_triangles = k.models.palm.triangle_count()
	_kit = k
	return k


## Frees a build that never entered the tree.
static func free_build(b: ChunkBuilder.Build) -> void:
	for body in b.bodies:
		if not body.is_inside_tree():
			body.free()
	if b.view != null and not b.view.is_inside_tree():
		b.view.free()


## A hash of every surface array of a build's meshes (determinism checks).
static func digest(b: ChunkBuilder.Build) -> int:
	var h := 0
	for child in b.view.get_children():
		var mi := child as MeshInstance3D
		if mi == null:
			var mm := child as MultiMeshInstance3D
			if mm != null:
				h = hash([h, mm.multimesh.instance_count, mm.multimesh.get_instance_transform(0), mm.multimesh.get_instance_transform(mm.multimesh.instance_count - 1)])
			continue
		var arrays := mi.mesh.surface_get_arrays(0)
		h = hash([h, child.name, arrays[Mesh.ARRAY_VERTEX], arrays[Mesh.ARRAY_INDEX], arrays[Mesh.ARRAY_TEX_UV], arrays[Mesh.ARRAY_COLOR]])
	return h
