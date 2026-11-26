extends TestCase
## Validates the realistic Chennai Male GLB, 52-bone Mixamo skeleton, AnimationTree
## state machine, NavigationAgent3D + CharacterBody3D walking, stopping, and ground contact.


func test_chennai_male_glb_has_skeleton_and_mixamo_animations() -> bool:
	var path := "res://assets/people/chennai_v2/chennai_male.glb"
	assert_true(ResourceLoader.exists(path), "chennai_male.glb exists")
	var packed := ResourceLoader.load(path) as PackedScene
	assert_true(packed != null, "chennai_male.glb loads as PackedScene")
	var inst := packed.instantiate() as Node3D
	root.add_child(inst)

	var skels := inst.find_children("*", "Skeleton3D", true, false)
	assert_eq(skels.size(), 1, "exactly one Skeleton3D")
	var sk := skels[0] as Skeleton3D
	assert_eq(sk.get_bone_count(), 52, "52-bone Mixamo skeleton")

	var ap := inst.find_child("AnimationPlayer", true, false) as AnimationPlayer
	assert_true(ap != null, "AnimationPlayer present")
	for anim_name: String in ["idle", "walk", "run", "jump", "talk", "wave", "sitting", "using_phone"]:
		assert_true(ap.has_animation(anim_name), "has animation '%s'" % anim_name)
	inst.queue_free()
	return true


func test_chennai_npc_walks_navigates_and_stops_at_destination() -> bool:
	var arena := Node3D.new()
	root.add_child(arena)

	var ground := StaticBody3D.new()
	ground.collision_layer = 1
	var gcol := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(40.0, 0.4, 40.0)
	gcol.shape = box
	gcol.position = Vector3(0.0, -0.2, 0.0)
	ground.add_child(gcol)
	arena.add_child(ground)

	var nav_reg := NavigationRegion3D.new()
	var nav_mesh := NavigationMesh.new()
	nav_mesh.add_polygon(PackedInt32Array([0, 1, 2, 3]))
	nav_mesh.vertices = PackedVector3Array([
		Vector3(-18, 0, -18),
		Vector3(18, 0, -18),
		Vector3(18, 0, 18),
		Vector3(-18, 0, 18),
	])
	nav_reg.navigation_mesh = nav_mesh
	arena.add_child(nav_reg)

	var npc_scene := ResourceLoader.load("res://src/player/chennai_npc/chennai_npc.tscn") as PackedScene
	assert_true(npc_scene != null, "chennai_npc.tscn loads")
	var npc := npc_scene.instantiate() as ChennaiNpc
	npc.position = Vector3(0.0, 0.05, 0.0)
	arena.add_child(npc)

	await wait_physics_frames(5)
	assert_true(npc.anim_tree != null, "AnimationTree initialized")
	assert_eq(npc.current_state, &"Idle", "starts in Idle")

	# Walk to (0, 0, -4)
	npc.walk_to(Vector3(0.0, 0.0, -4.0), false)
	await wait_physics_frames(15)
	assert_eq(npc.current_state, &"Walk", "transitions to Walk while moving")

	var reached := await wait_until(func() -> bool:
		return npc.current_state == &"Idle" and npc.global_position.z < -3.0,
		360
	)
	assert_true(reached, "NPC reached destination and returned to Idle")
	assert_true(absf(npc.global_position.y) < 0.08, "NPC feet remain on ground (y=%.3f)" % npc.global_position.y)

	# Test other states
	npc.play_state(&"Talk")
	assert_eq(npc.current_state, &"Talk", "can enter Talk state")
	npc.play_state(&"Wave")
	assert_eq(npc.current_state, &"Wave", "can enter Wave state")
	npc.play_state(&"UsingPhone")
	assert_eq(npc.current_state, &"UsingPhone", "can enter UsingPhone state")

	arena.queue_free()
	return true
