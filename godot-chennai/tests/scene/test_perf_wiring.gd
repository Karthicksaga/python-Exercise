extends TestCase
## Quality presets applied live, the performance overlay, the feature switches and the perf log
## in the real game (G-252…G-256).

const MAIN := preload("res://src/app/main.tscn")
const PATH := "user://test-perf-quality.json"
const LOAD_FRAMES := 60 * 120


func _clean() -> void:
	for p: String in [PATH, PATH + ".tmp", PerfWiring.LOG_PATH]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)


func _boot() -> Main:
	_clean()
	var s := QualitySettings.new()
	s.path = PATH
	s.load_saved()
	QualitySettings.use_shared(s)
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	await wait_until(func() -> bool: return main.state != &"loading", LOAD_FRAMES)
	main.play()
	await wait_frames(3)
	return main


func _restore() -> void:
	QualitySettings.reset_shared()
	RainView.enabled = true
	Engine.max_fps = 0
	Engine.max_physics_steps_per_frame = 5
	_clean()


func test_presets_apply_live() -> bool:
	var main := await _boot()
	var s := main.perf.settings
	assert_eq(s.preset, QualitySettings.HIGH, "headless starts at High")
	var vp := main.get_viewport()
	assert_eq(vp.scaling_3d_scale, 1.0, "High: full resolution")
	assert_eq(vp.msaa_3d, Viewport.MSAA_2X, "High: MSAA 2x as before")
	assert_eq(vp.positional_shadow_atlas_size, 0, "no positional shadow atlas (no light casts one)")
	var env := main.play_wiring.environment.environment
	s.set_preset(QualitySettings.LOW)
	assert_near(vp.scaling_3d_scale, 0.75, 0.001, "Low: 3D at 75 %")
	assert_eq(vp.scaling_3d_mode, Viewport.SCALING_3D_MODE_BILINEAR, "bilinear on Low")
	assert_eq(vp.msaa_3d, Viewport.MSAA_DISABLED, "no MSAA")
	assert_eq(vp.anisotropic_filtering_level, Viewport.ANISOTROPY_DISABLED, "no anisotropic filtering")
	assert_eq(Engine.max_fps, 30, "a 30 fps cap")
	assert_eq(Engine.max_physics_steps_per_frame, 2, "at most two catch-up physics steps")
	assert_true(env.sun.shadow_enabled and env.sun.directional_shadow_max_distance == 20.0, "short sun shadows")
	assert_eq(PersonView.shadow_near, 0.0, "walkers cast no shadow")
	assert_eq(PersonView.animate_reach, 25.0, "figures animate only near")
	assert_eq(main.play_wiring.parked.spawn_reach, 100.0, "parked vehicles only near")
	var cell: Vector2i = main.world.streamer.shown_cells()[0]
	var trees := main.world.streamer.build_of(cell).view.get_node_or_null(^"Trees") as GeometryInstance3D
	assert_true(trees == null or trees.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "trees cast no shadow on Low")
	assert_eq(main.world.streamer.load_distance, 200.0, "a shorter view")
	assert_eq(main.world.streamer.in_flight, 1, "one chunk build at a time")
	assert_eq(env.fog_far, 240.0, "the haze pulled in with it")
	assert_eq(env.rain.drawn(), roundi(CityEnvironment.RAIN_DROPS * 0.4), "fewer rain drops")
	assert_eq(env.street_lights.pool, 0, "no real street lights on Low (the lamp heads still glow)")
	assert_eq(main.life.figure_cap, 12, "fewer figures drawn")
	assert_eq(main.life.ai_patience, 6, "the AI step may lag")
	assert_false(bool(main.world.materials.ground.get_shader_parameter(&"detail")), "light ground shader")
	assert_eq(main.rig.camera.camera.far, 330.0, "camera far plane follows the view")
	s.set_preset(QualitySettings.MEDIUM)
	assert_near(vp.scaling_3d_scale, 0.8, 0.001, "Medium: 80 %")
	assert_true(env.sun.shadow_enabled and env.sun.directional_shadow_max_distance == 28.0, "Medium: short shadows")
	s.set_preset(QualitySettings.HIGH)
	assert_true(vp.scaling_3d_scale == 1.0 and vp.msaa_3d == Viewport.MSAA_2X and env.sun.shadow_enabled, "back to High")
	assert_eq(main.world.streamer.load_distance, 260.0, "with the full view")
	assert_eq(PersonView.shadow_near, PersonView.SHADOW_NEAR, "and near walkers' shadows")
	assert_eq(env.rain.drawn(), CityEnvironment.RAIN_DROPS, "and all the rain")
	assert_true(main.pause_menu.setting_button(&"Quality") != null and main.pause_menu.setting_button(&"Quality").text.begins_with("Graphics: High"), "the pause menu shows the preset")
	assert_true(main.title.has_method(&"add_setting"), "the title's SETTINGS carries it too")
	_restore()
	return true


func test_overlay_switches_and_log() -> bool:
	var main := await _boot()
	var perf := main.perf
	assert_false(perf.overlay.visible, "overlay off by default")
	# A three-finger tap.
	for i in 3:
		var t := InputEventScreenTouch.new()
		t.index = i
		t.pressed = true
		t.position = Vector2(300 + i * 60, 200)
		perf.overlay._input(t)
	for i in 3:
		var t := InputEventScreenTouch.new()
		t.index = i
		t.pressed = false
		t.position = Vector2(300 + i * 60, 200)
		perf.overlay._input(t)
	assert_true(perf.overlay.visible and perf.settings.overlay, "a three-finger tap shows it")
	await wait_frames(30)
	var sw_button := perf.overlay.get_node(^"Root/Safe").find_child("Switches", true, false) as Button
	var sw_rect := sw_button.get_global_rect()
	assert_true(sw_rect.end.y <= 120.0, "SWITCHES sits in the top strip, away from the stick and buttons (%s)" % sw_rect)
	assert_false(sw_rect.intersects(main.pause_menu.pause_button.get_global_rect()), "and clear of PAUSE")
	var text := perf.overlay_text()
	for part: String in ["FPS", "verdict", "draws", "AI step", "chunks", "High"]:
		assert_contains(text, part, "overlay shows %s" % part)
	# Two fingers do nothing.
	for p: bool in [true, false]:
		for i in 2:
			var t := InputEventScreenTouch.new()
			t.index = i
			t.pressed = p
			perf.overlay._input(t)
	assert_true(perf.overlay.visible, "two fingers leave it")
	var sw := perf.switches
	sw.toggle("traffic")
	assert_false(main.life.traffic_on, "traffic switched off")
	var shown := 0
	for v in main.life.views:
		if v.visible:
			shown += 1
	assert_eq(shown, 0, "no traffic vehicle drawn")
	assert_eq(main.life.pool.shown(), 0, "no walker or driver drawn")
	sw.toggle("trees")
	var cells := main.world.streamer.shown_cells()
	assert_true(not cells.is_empty(), "chunks are shown")
	var trees_seen := 0
	for c in cells:
		var b := main.world.streamer.build_of(c)
		for n: String in ["Trees", "Palms"]:
			var node := b.view.get_node_or_null(NodePath(n)) as Node3D
			if node != null:
				trees_seen += 1
				assert_false(node.visible, "trees hidden in %s" % c)
	assert_true(trees_seen > 0, "the chunks have trees to hide")
	sw.toggle("shadows")
	assert_false(main.play_wiring.environment.environment.sun.shadow_enabled, "shadows switched off")
	sw.safe_mode()
	assert_false(sw.is_on("landmarks") or sw.is_on("rain") or sw.is_on("decks"), "safe mode turns all off")
	assert_false((main.world.get_node(^"Landmarks") as Node3D).visible, "landmarks hidden")
	assert_false(RainView.enabled, "rain off")
	sw.all_on()
	assert_true(main.life.traffic_on and RainView.enabled and main.play_wiring.environment.environment.sun.shadow_enabled, "all on restores")
	assert_true((main.world.get_node(^"Landmarks") as Node3D).visible, "landmarks back")
	# The measured change of the last press (real time; fed directly here).
	sw.toggle("crowds")
	for i in 300:
		sw.sample(0.02, 30.0)
	assert_false(sw.measuring(), "measurement finished")
	assert_contains(sw.last_line, "changed the frame by", "the ranked line says what the press did")
	assert_true(sw.costs.has("crowds"), "and it is ranked")
	sw.toggle("crowds")
	perf.write_log()
	assert_true(FileAccess.file_exists(PerfWiring.LOG_PATH), "the perf log is written")
	var log := FileAccess.get_file_as_string(PerfWiring.LOG_PATH)
	for part: String in ["Chennai perf log", "GPU", "quality High", "t=", "drift"]:
		assert_contains(log, part, "the log has %s" % part)
	assert_true(main.pause_menu.setting_button(&"PerfSummary") != null, "the pause menu has the summary row")
	assert_contains(perf.summary, "fps", "the summary reads the frame rate")
	perf.settings.set_overlay(false)
	assert_false(perf.overlay.visible, "the Settings row hides it again")
	_restore()
	return true
