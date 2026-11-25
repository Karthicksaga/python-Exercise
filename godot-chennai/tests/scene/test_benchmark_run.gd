extends TestCase
## The benchmark mode in the real game (G-400…G-405), short (scale 0.02: every segment a few
## dozen physics steps): nothing of it runs until started; started from the Settings row it runs
## every level and segment in game time with the camera on the route's poses, writes
## benchmark.json and benchmark.txt in their shape, shows the card, and gives back the player, the
## camera, the time of day, the weather and the saved level.

const MAIN := preload("res://src/app/main.tscn")
const PATH := "user://test-benchmark-run-quality.json"
const LOAD_FRAMES := 60 * 120
const SCALE := 0.02


func _clean() -> void:
	for p: String in [PATH, PATH + ".tmp", BenchmarkReport.JSON_PATH, BenchmarkReport.TEXT_PATH, PerfWiring.LOG_PATH]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)


func test_benchmark_runs_only_when_started_and_gives_everything_back() -> bool:
	_clean()
	var s := QualitySettings.new()
	s.path = PATH
	s.load_saved()
	QualitySettings.use_shared(s)
	var runs_before := BenchmarkRunner.started
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	await wait_until(func() -> bool: return main.state != &"loading", LOAD_FRAMES)
	main.play()
	await wait_physics_frames(30)
	# Nothing of the benchmark runs unless started: no runner, no files, only the two rows.
	assert_eq(BenchmarkRunner.started, runs_before, "no benchmark started by itself")
	assert_true(main.find_child("BenchmarkRunner", true, false) == null, "no runner in the tree")
	assert_false(FileAccess.file_exists(BenchmarkReport.JSON_PATH), "no results file")
	assert_true(main.pause_menu.setting_button(BenchmarkWiring.ROW) != null, "the pause menu has Run benchmark")
	assert_true(main.title.setting_button(BenchmarkWiring.ROW) != null, "the title's SETTINGS too")
	assert_contains(main.pause_menu.setting_button(BenchmarkWiring.ROW).text, "Run benchmark", "labelled")

	var feet := main.rig.body.global_position
	var world_feet := WorldOrigin.to_world(feet)
	var hour := GameLoop.clock.hour
	var rate := GameLoop.clock.hours_per_second
	var player_camera := main.rig.camera.camera
	var saved_level := s.preset
	main.pause()
	var runner := BenchmarkRunner.start(main, SCALE)
	runner.settle_steps = 30
	main.resume()
	assert_true(runner != null and BenchmarkRunner.started == runs_before + 1, "started")
	assert_true(await wait_until(func() -> bool: return runner.running and runner.camera != null, 600), "it takes the camera")
	assert_true(runner.camera.is_current(), "and draws from it")
	assert_eq(main.rig.process_mode, Node.PROCESS_MODE_DISABLED, "the player's rig is off while it runs")
	assert_false(main.rig.controls.visible, "and the touch controls hidden")
	assert_true(s.is_held(), "the level is held, not saved")
	# The camera is where the route says at this step (game time, not the clock).
	assert_true(await wait_until(func() -> bool: return runner._mode == &"run", 60 * 120), "a segment measures")
	await wait_physics_frames(3)
	var seg := runner._segment
	var expect := BenchmarkRoute.pose(seg, (runner._steps - 1) / 60.0, SCALE)
	var eye := WorldOrigin.to_world(runner.camera.global_position)
	assert_vec_near(eye, expect.eye, 0.05, "%s: the camera at its pose for step %d" % [seg.id, runner._steps - 1])
	assert_vec_near(WorldOrigin.to_world(main.rig.body.global_position), expect.focus, 0.05, "and the body (the streaming focus) on the path")
	assert_near(GameLoop.clock.hour, seg.hour, 0.001, "at the segment's hour, held")

	assert_true(await wait_until(func() -> bool: return not runner.running, 60 * 60 * 15), "it finishes")
	var result := runner.result
	assert_false(runner.cancelled, "not cancelled")
	var levels: Array = result.get("levels", [])
	assert_eq(levels.size(), 3, "three levels")
	var names: Array[String] = []
	for l: Variant in levels:
		names.append(str((l as Dictionary)["level"]))
	assert_eq(names, ["High", "Low", "Medium"] as Array[String], "the level it had (High, headless), then the others from Low")
	for l: Variant in levels:
		var level := l as Dictionary
		var segs: Array = level["segments"]
		assert_eq(segs.size(), BenchmarkRoute.segments().size(), "%s: every segment" % level["level"])
		for i in segs.size():
			var row := segs[i] as Dictionary
			var want := BenchmarkRoute.steps(BenchmarkRoute.segments()[i], SCALE)
			check(int(row["steps"]) == want, "%s %s: ran its %d physics steps (%d)" % [level["level"], row["id"], want, int(row["steps"])])
			check(int(row["frames"]) > 0 and float(row["avg_ms"]) > 0.0, "%s %s: measured frames" % [level["level"], row["id"]])
			for k in BenchmarkReport.SEGMENT_KEYS:
				check(row.has(k), "%s %s: has %s" % [level["level"], row["id"], k])
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(BenchmarkReport.JSON_PATH))
	assert_true(parsed is Dictionary and str((parsed as Dictionary).get("format", "")) == BenchmarkReport.FORMAT, "benchmark.json written")
	assert_eq(((parsed as Dictionary).get("levels", []) as Array).size(), 3, "with the three levels")
	var text := FileAccess.get_file_as_string(BenchmarkReport.TEXT_PATH)
	assert_contains(text, "Recommendation:", "benchmark.txt written")
	assert_contains(text, BenchmarkDevice.renderer_label(), "naming the renderer")
	assert_true(runner.card != null and runner.card.visible, "the card is shown")
	assert_eq(runner.card.tables.size(), 3, "with a table per level")

	# Everything given back.
	assert_false(s.is_held(), "the level released")
	assert_eq(s.preset, saved_level, "the player's level back")
	assert_true(s.auto, "still Auto")
	assert_eq(main.rig.process_mode, Node.PROCESS_MODE_INHERIT, "the rig on again")
	assert_true(player_camera.is_current(), "the player's camera back")
	assert_vec_near(WorldOrigin.to_world(main.rig.body.global_position), world_feet, 0.5, "the player where they stood")
	assert_near(GameLoop.clock.hours_per_second, rate, 0.0001, "the clock runs again")
	assert_near(GameLoop.clock.hour, hour, 0.01, "at the hour it was")
	assert_true(main.rig.controls.visible, "the controls back")
	runner.card.close.pressed.emit()
	assert_false(runner.card.visible, "CLOSE hides the card")
	main.queue_free()
	await wait_frames(2)
	QualitySettings.reset_shared()
	Engine.max_fps = 0
	Engine.max_physics_steps_per_frame = 5
	_clean()
	return true
