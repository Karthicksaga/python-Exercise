extends SceneTree
func _initialize() -> void:
	var scene := load("res://assets/people/auto_driver.glb") as PackedScene
	var inst := scene.instantiate()
	root.add_child(inst)
	var mi: MeshInstance3D = inst.find_child("Body_LOD1", true, false)
	var ap: AnimationPlayer = inst.find_child("AnimationPlayer", true, false)
	print(ap.get_animation_list())
	ap.play("walk"); ap.seek(0.3, true)
	var t := Time.get_ticks_usec()
	var baked := mi.bake_mesh_from_current_skeleton_pose()
	print("bake us ", Time.get_ticks_usec() - t, " surfaces ", baked.get_surface_count(), " tris ", baked.surface_get_array_len(0))
	var im := ImporterMesh.new()
	for s in baked.get_surface_count():
		im.add_surface(Mesh.PRIMITIVE_TRIANGLES, baked.surface_get_arrays(s), [], {}, baked.surface_get_material(s))
	t = Time.get_ticks_usec()
	im.generate_lods(25, 60, [])
	print("lods us ", Time.get_ticks_usec() - t)
	for s in im.get_surface_count():
		print("surf ", s, " idx ", (im.get_surface_arrays(s)[Mesh.ARRAY_INDEX] as PackedInt32Array).size(), " lods ", im.get_surface_lod_count(s))
		for l in im.get_surface_lod_count(s):
			print("  lod ", im.get_surface_lod_size(s,l), " ", im.get_surface_lod_indices(s,l).size())
	var y := INF
	for s in baked.get_surface_count():
		for v: Vector3 in (baked.surface_get_arrays(s)[Mesh.ARRAY_VERTEX] as PackedVector3Array):
			y = minf(y, v.y)
	print("min y ", y, " inst children ", inst.get_children())
	quit()
