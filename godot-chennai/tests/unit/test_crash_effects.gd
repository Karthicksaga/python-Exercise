extends TestCase
## Crash effects (G-272…G-274): pooled sparks, glass and smoke that live and die in game time,
## the burst plan per kind and band, the camera's trauma shake and its reduced-motion switch.

const STEP := 1.0 / 60.0


func _effects() -> CrashEffects:
	var e := CrashEffects.new()
	root.add_child(e)
	e.set_process(false)
	# Past the two warm-up frames.
	e.step(STEP)
	e.step(STEP)
	return e


func test_burst_lives_and_dies_in_game_time() -> bool:
	var e := _effects()
	assert_eq(e.alive(CrashEffects.Pool.SPARK) + e.alive(CrashEffects.Pool.SHARD), 0, "nothing before a crash")
	e.burst(Vector3(1, 0.5, 2), Vector3(0, 0, 1), 1.0, 20, 30)
	e.step(STEP)
	assert_eq(e.alive(CrashEffects.Pool.SPARK), 20, "20 sparks")
	assert_eq(e.alive(CrashEffects.Pool.SHARD), 30, "30 shards")
	for i in ceili(CrashEffects.SPARK_LIFE * 1.3 * 60.0) + 1:
		e.step(STEP)
	assert_eq(e.alive(CrashEffects.Pool.SPARK), 0, "sparks gone within 0.6 s (cooled)")
	for i in 120:
		e.step(STEP)
	assert_eq(e.alive(CrashEffects.Pool.SHARD), 0, "shards gone within 2.5 s")
	assert_false((e.get_child(0) as Node3D).visible or (e.get_child(1) as Node3D).visible, "idle pools are hidden (no draw calls)")
	e.free()
	return true


func test_pools_never_grow() -> bool:
	var e := _effects()
	for k in 10:
		e.burst(Vector3.ZERO, Vector3.UP, 1.0, 40, 40)
	e.step(STEP)
	assert_eq(e.alive(CrashEffects.Pool.SPARK), CrashEffects.SPARKS, "sparks capped at the pool")
	assert_eq(e.alive(CrashEffects.Pool.SHARD), CrashEffects.SHARDS, "shards capped at the pool")
	assert_eq((e.get_child(0) as MultiMeshInstance3D).multimesh.instance_count, CrashEffects.SPARKS, "instance count fixed")
	e.free()
	return true


func test_smoke_follows_a_wrecked_vehicle_until_it_is_gone() -> bool:
	var e := _effects()
	var car := Node3D.new()
	root.add_child(car)
	car.global_position = Vector3(5, 0, 5)
	e.smoke(car, Vector3(0, 0.5, -1))
	for i in 60:
		e.step(STEP)
	assert_eq(e.smoking(), 1, "one smoker")
	assert_true(e.alive(CrashEffects.Pool.PUFF) >= 2, "puffs rise (%d)" % e.alive(CrashEffects.Pool.PUFF))
	car.free()
	for i in 200:
		e.step(STEP)
	assert_eq(e.smoking(), 0, "a freed vehicle stops smoking")
	assert_eq(e.alive(CrashEffects.Pool.PUFF), 0, "its puffs fade")
	e.free()
	return true


func test_burst_plan_by_kind_and_band() -> bool:
	var bump := DrivingWiring.burst_plan(&"bike", &"bike", &"bump", 10.0)
	assert_eq(int(bump.y), 0, "a bump breaks no glass")
	assert_true(bump.x >= 3.0 and bump.x < 8.0, "a few sparks (%d)" % int(bump.x))
	var car := DrivingWiring.burst_plan(&"car", &"", &"thrown", 80.0)
	var bike := DrivingWiring.burst_plan(&"bike", &"", &"thrown", 80.0)
	assert_true(car.y > bike.y * 2.0, "a car sheds far more glass than a bike (%d vs %d)" % [int(car.y), int(bike.y)])
	assert_true(DrivingWiring.burst_plan(&"bike", &"car", &"shaken", 30.0).y > DrivingWiring.burst_plan(&"bike", &"", &"shaken", 30.0).y, "hitting a car adds its glass")
	assert_true(car.x > bump.x, "harder hits throw more sparks")
	return true


func test_camera_trauma_decays_and_respects_reduced_motion() -> bool:
	var cam := FollowCamera.new()
	var target := Node3D.new()
	root.add_child(target)
	root.add_child(cam)
	cam.set_physics_process(false)
	cam.follow(target)
	cam.update(STEP)
	cam.add_trauma(0.9)
	var biggest := 0.0
	for i in 20:
		cam.update(STEP)
		biggest = maxf(biggest, cam.shake_offset().length())
	assert_true(biggest > 0.05, "a crash shakes the lens (%.3f m)" % biggest)
	for i in int(60.0 / FollowCamera.SHAKE_DECAY) + 2:
		cam.update(STEP)
	assert_eq(cam.trauma, 0.0, "trauma gone within 1/decay s")
	assert_true(cam.shake_offset().length() < 1e-4, "the lens is back at rest")
	cam.shake_strength = 0.0
	cam.add_trauma(1.0)
	var moved := 0.0
	for i in 20:
		cam.update(STEP)
		moved = maxf(moved, cam.shake_offset().length())
	assert_eq(moved, 0.0, "reduced motion: no shake")
	cam.free()
	target.free()
	return true
