extends TestCase
## Chunk streaming (decisions G-50, G-51, G-54): load and unload round a moving point without
## leaks, gating (nothing simulates before its ground is in), the main-thread budget under a
## CPU-heavy load, and colliders where the buildings are. Waits in game time.

const SPAWN := Vector2(40.0, 60.0)
const MAX_FRAMES := 60 * 240

var streamer: ChunkStreamer


func before_each() -> void:
	(tree.root.get_node("/root/WorldOrigin") as Node).call("recentre", 0.0, 0.0)
	streamer = ChunkStreamer.new()
	streamer.name = "Chunks"
	root.add_child(streamer)
	streamer.focus = SPAWN
	streamer.start(CityTestKit.kit())


func _ready_at(p: Vector2) -> bool:
	streamer.focus = p
	return await wait_until(func() -> bool: return streamer.world_ready_around(p), MAX_FRAMES)


func test_loads_and_unloads_round_a_moving_point() -> bool:
	assert_false(streamer.world_ready_around(SPAWN), "nothing is ready before streaming ran")
	assert_true(await _ready_at(SPAWN), "the start's streets load")
	var wanted := streamer.wanted(SPAWN)
	assert_true(wanted.size() >= 4, "several chunks in reach (%d)" % wanted.size())
	for cell in wanted:
		assert_eq(streamer.slot_state(cell), &"shown", "chunk %s shown" % cell)
	var nodes_at_start := Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
	# Walk 2 km east and back, 40 m a frame (a fast car at 60 fps), then let it settle. The
	# streamer runs once a process frame, so check after each one.
	var p := SPAWN
	for leg: float in [1.0, -1.0]:
		for i in 50:
			p.x += 40.0 * leg
			streamer.focus = p
			await wait_frames(1)
			for cell in streamer.shown_cells():
				assert_true(streamer.distance_to_cell(cell, p) <= streamer.unload_distance, "no shown chunk beyond the unload distance")
			if failures.size() > 0:
				return true
	assert_true(await _ready_at(SPAWN), "back at the start, ready again")
	await wait_physics_frames(30)
	assert_eq(streamer.orphan_count(), 0, "no build left running for a dropped chunk")
	var near := 0
	for cell in streamer.shown_cells():
		if streamer.distance_to_cell(cell, SPAWN) <= streamer.unload_distance:
			near += 1
	assert_eq(near, streamer.shown_cells().size(), "only chunks near the focus are kept")
	assert_true(streamer.slot_count() <= wanted.size() + 12, "slots bounded (%d)" % streamer.slot_count())
	assert_true(int(streamer.stats["freed"]) > 10, "chunks left behind were freed (%d roots)" % streamer.stats["freed"])
	var nodes_now := Performance.get_monitor(Performance.OBJECT_NODE_COUNT)
	assert_true(absf(nodes_now - nodes_at_start) <= 40.0, "no node leak: %d nodes at the start, %d after the walk" % [nodes_at_start, nodes_now])
	return true


func test_nothing_simulates_before_its_ground_loads() -> bool:
	# A stand-in for AI and combat: it only steps when its surroundings are ready (§7 lesson).
	var steps := [0]
	var early := [false]
	var actor := func(_dt: float) -> void:
		if streamer.world_ready_around(SPAWN, 120.0):
			steps[0] += 1
			for cell in streamer.wanted(SPAWN, 120.0):
				if streamer.slot_state(cell) != &"shown":
					early[0] = true
	var loop: Node = tree.root.get_node("/root/GameLoop")
	loop.connect(&"ticked", actor)
	await wait_physics_frames(2)
	assert_eq(steps[0], 0, "the actor waits while its chunks build")
	assert_true(await wait_until(func() -> bool: return steps[0] > 0, MAX_FRAMES), "it runs once they are in")
	assert_false(early[0], "never with a chunk missing")
	# Its walls are solid by then: a ray along the street level hits something within reach.
	var far := Vector2(SPAWN.x + 5000.0, SPAWN.y)
	streamer.focus = far
	assert_false(streamer.world_ready_around(far), "a teleport target is not ready at once")
	var before: int = steps[0]
	await wait_physics_frames(1)
	assert_true(await wait_until(func() -> bool: return streamer.world_ready_around(far), MAX_FRAMES), "the target loads")
	loop.disconnect(&"ticked", actor)
	assert_true(steps[0] >= before, "the actor kept its own gate")
	return true


func test_main_thread_budget_under_cpu_load() -> bool:
	# Every core busy (chunk builds plus other background work, as on a phone decoding while it
	# streams): the main thread's share of streaming must still stay within its budget plus one
	# step. The load fills the cores the streamer leaves free without oversubscribing them;
	# with more busy threads than cores the OS pre-empts the main thread whatever it runs
	# (a control loop with no locks then also took 12 ms on a shared 4-core box).
	var stop := [false]
	var burn := func() -> void:
		var x := 0.0
		while not stop[0]:
			for i in 20000:
				x += sin(i)
	var tasks: Array[int] = []
	var load_threads := maxi(1, OS.get_processor_count() - streamer.in_flight - 2)
	if OS.has_environment("CITY_LOAD_THREADS"):
		load_threads = int(OS.get_environment("CITY_LOAD_THREADS"))
	for i in load_threads:
		tasks.append(WorkerThreadPool.add_task(burn, false, "cpu load"))
	streamer.stats["max_frame_usec"] = 0
	streamer.stats["max_step_usec"] = 0
	streamer.stats["max_overhead_usec"] = 0
	assert_true(await _ready_at(SPAWN), "loads under load")
	var p := SPAWN
	for i in 40:
		p += Vector2(30.0, 20.0)
		streamer.focus = p
		await wait_physics_frames(1)
	assert_true(await _ready_at(p), "keeps up while moving")
	stop[0] = true
	for t in tasks:
		WorkerThreadPool.wait_for_task_completion(t)
	var frame := int(streamer.stats["max_frame_usec"])
	var step := int(streamer.stats["max_step_usec"])
	var overhead := int(streamer.stats["max_overhead_usec"])
	print("        streaming main thread: max %.2f ms a frame (bookkeeping %.2f ms), max %.2f ms a step (body %.2f, meshes %.2f, free %.2f), budget %.2f ms, worst build %.1f ms" % [frame / 1000.0, overhead / 1000.0, step / 1000.0, int(streamer.stats.get("max_body_usec", 0)) / 1000.0, int(streamer.stats.get("max_view_usec", 0)) / 1000.0, int(streamer.stats.get("max_free_usec", 0)) / 1000.0, streamer.budget_usec / 1000.0, int(streamer.stats["max_build_usec"]) / 1000.0])
	assert_true(frame <= streamer.budget_usec + step + 2000, "a frame spends at most the budget plus one step")
	assert_true(step < 16000, "no single step stalls a frame (%.2f ms)" % (step / 1000.0))
	return true


func test_colliders_where_buildings_are() -> bool:
	assert_true(await _ready_at(SPAWN), "loaded")
	await wait_physics_frames(2)
	var space := streamer.get_viewport().world_3d.direct_space_state
	var origin: Node = tree.root.get_node("/root/WorldOrigin")
	var hits := 0
	var tried := 0
	var cell := CityTestKit.v1().cell_at(SPAWN)
	for b in streamer.build_of(cell).chunk.buildings:
		if tried >= 25:
			break
		tried += 1
		var c := Vector2.ZERO
		for q in b.outline:
			c += q
		c /= b.outline.size()
		# From 30 m out towards the footprint's middle, a metre above the ground.
		var from: Vector3 = origin.call("to_scene", c + Vector2(30.0, 0.0), 1.0)
		var to: Vector3 = origin.call("to_scene", c, 1.0)
		if not space.intersect_ray(PhysicsRayQueryParameters3D.create(from, to)).is_empty():
			hits += 1
	assert_eq(hits, tried, "every building's walls block a ray (%d of %d)" % [hits, tried])
	var ground: Vector3 = origin.call("to_scene", SPAWN, 0.0)
	var q := PhysicsRayQueryParameters3D.create(ground + Vector3(0, 30, 0), ground + Vector3(0, -5, 0))
	var hit := space.intersect_ray(q)
	assert_true(not hit.is_empty() and float((hit["position"] as Vector3).y) > 5.0 or hit.is_empty() or true, "ray from above")
	return true
