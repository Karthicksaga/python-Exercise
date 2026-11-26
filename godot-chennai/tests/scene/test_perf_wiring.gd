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
	# The shader warm-up ran behind the loading screen and left nothing behind (G-346).
	assert_true(int(main.perf.warmup.get("meshes", 0)) >= 2, "a walker and the traffic kinds were drawn once while loading (%s)" % main.perf.warmup)
	assert_true(main.world.find_child("ShaderWarmup", false, false) == null, "and freed")
	var vp := main.get_viewport()
	assert_eq(vp.scaling_3d_scale, 1.0, "High: full resolution")
	assert_eq(vp.msaa_3d, Viewport.MSAA_2X, "High: MSAA 2x as before")
	assert_eq(vp.screen_space_aa, Viewport.SCREEN_SPACE_AA_FXAA, "High: FXAA smooths thin poles and foliage")
	assert_eq(vp.positional_shadow_atlas_size, 0, "no positional shadow atlas (no light casts one)")
	# Near and Far building views must remain mutually exclusive on every shown chunk (never z-fight).
	for c: Vector2i in main.world.streamer.shown_cells():
		var build := main.world.streamer.build_of(c)
		if build == null or build.view == null:
			continue
		var near_n := build.view.get_node_or_null(^"Near") as Node3D
		var far_n := build.view.get_node_or_null(^"Far") as Node3D
		if near_n != null and far_n != null:
			assert_false(near_n.visible and far_n.visible, "chunk %s never draws Near and Far together" % c)
	var env := main.play_wiring.environment.environment
	s.set_preset(QualitySettings.LOW)
	assert_near(vp.scaling_3d_scale, 0.65, 0.001, "Low: 3D at 65 %")
	assert_true(main.world.materials.flat and main.world.materials.walls.shading_mode == BaseMaterial3D.SHADING_MODE_PER_VERTEX, "Low lights the city per vertex")
	assert_true(main.world.materials.ground.shader != CityMaterials.GROUND_SHADER and main.world.materials.ground.shader.code.contains("vertex_lighting"), "the ground too")
	assert_eq(vp.scaling_3d_mode, Viewport.SCALING_3D_MODE_BILINEAR, "bilinear on Low")
	assert_eq(vp.msaa_3d, Viewport.MSAA_DISABLED, "no MSAA")
	assert_eq(vp.screen_space_aa, Viewport.SCREEN_SPACE_AA_DISABLED, "no FXAA on Low")
	assert_eq(vp.anisotropic_filtering_level, Viewport.ANISOTROPY_DISABLED, "no anisotropic filtering")
	assert_eq(Engine.max_fps, 30, "a 30 fps cap")
	assert_eq(Engine.max_physics_steps_per_frame, 2, "at most two catch-up physics steps")
	assert_true(env.sun.shadow_enabled and env.sun.directional_shadow_max_distance == 18.0, "short sun shadows")
	assert_eq(PersonView.shadow_near, 0.0, "walkers cast no shadow")
	assert_eq(QualityApplier._soft_quality, RenderingServer.SHADOW_QUALITY_HARD, "hard shadows on Low")
	# A state change re-applies the preset; the shadow filter and atlas are set only when they
	# change (each set recompiled the scene's pipelines: a 2 s frame under software Vulkan, G-346).
	var calls_before := QualityApplier._shadow_size
	main.pause()
	main.resume()
	assert_eq(QualityApplier._shadow_size, calls_before, "pause and resume leave the shadow atlas alone")
	assert_eq(PersonView.animate_reach, 25.0, "figures animate only near")
	assert_eq(main.play_wiring.parked.spawn_reach, 100.0, "parked vehicles only near")
	var cell: Vector2i = main.world.streamer.shown_cells()[0]
	var trees := main.world.streamer.build_of(cell).view.get_node_or_null(^"Trees") as GeometryInstance3D
	assert_true(trees == null or trees.cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "trees cast no shadow on Low")
	# The tree kit (G-386): no wind, no tree shadows, fewer plants on Low.
	assert_false(TreeQuality.sway, "no tree sway on Low")
	assert_false(TreeQuality.shadows, "no tree shadows on Low")
	assert_eq(float(main.world.materials.trees.get_shader_parameter(&"sway")), 0.0, "the wind uniform is off")
	assert_true(TreeQuality.density < 1.0 and TreeQuality.understory < TreeQuality.density, "fewer trees, even fewer bushes")
	var batch := main.world.streamer.build_of(cell).tree_batch
	if batch != null:
		for g in batch.groups:
			assert_eq(g.nodes[0].cast_shadow, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "LOD 0 casts no shadow on Low (%s)" % g.species)
	assert_eq(main.world.streamer.load_distance, 200.0, "a shorter view")
	assert_eq(main.world.streamer.in_flight, 1, "one chunk build at a time")
	assert_eq(env.fog_far, 240.0, "the haze pulled in with it")
	assert_eq(env.rain.drawn(), roundi(CityEnvironment.RAIN_DROPS * 0.4), "fewer rain drops")
	assert_eq(env.street_lights.pool, 0, "no real street lights on Low (the lamp heads still glow)")
	assert_eq(main.life.figure_cap, 12, "fewer figures drawn")
	assert_eq(main.life.ai_patience, 6, "the AI step may lag")
	# Road detail by preset (G-317): on the city and on the chunks built from now on.
	assert_eq(main.world.road_extras, QualitySettings.LOW, "Low road detail on the city")
	assert_eq(main.world.streamer.kit.road_extras, QualitySettings.LOW, "and on the chunks built from now on")
	assert_false(bool(main.world.materials.ground.get_shader_parameter(&"detail")), "light ground shader")
	assert_eq(main.rig.camera.camera.far, 330.0, "camera far plane follows the view")
	s.set_preset(QualitySettings.MEDIUM)
	assert_near(vp.scaling_3d_scale, 0.8, 0.001, "Medium: 80 %")
	assert_true(env.sun.shadow_enabled and env.sun.directional_shadow_max_distance == 28.0, "Medium: short shadows")
	s.set_preset(QualitySettings.HIGH)
	assert_true(vp.scaling_3d_scale == 1.0 and vp.msaa_3d == Viewport.MSAA_2X and env.sun.shadow_enabled, "back to High")
	assert_true(not main.world.materials.flat and main.world.materials.ground.shader == CityMaterials.GROUND_SHADER, "lit per pixel again")
	assert_eq(main.world.streamer.load_distance, 260.0, "with the full view")
	assert_eq(PersonView.shadow_near, PersonView.SHADOW_NEAR, "and near walkers' shadows")
	assert_eq(env.rain.drawn(), CityEnvironment.RAIN_DROPS, "and all the rain")
	assert_true(main.pause_menu.setting_button(&"Quality") != null and main.pause_menu.setting_button(&"Quality").text.begins_with("Graphics: High\nfull resolution"), "the pause menu shows the preset")
	assert_true(main.title.has_method(&"add_setting"), "the title's SETTINGS carries it too")
	_restore()
	return true


func test_overlay_switches_and_log() -> bool:
	DebugSettings.reset_shared()
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
	assert_true(perf.overlay.visible and DebugSettings.shared().perf_overlay, "a three-finger tap shows it (the one switch, DebugSettings)")
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
	main.pause()
	assert_false(perf.overlay.visible, "paused: the overlay steps aside for the menu")
	assert_true(perf.overlay.layer < main.pause_menu.layer and perf.overlay.layer < main.title.layer, "and sits under both menus")
	main.resume()
	assert_true(perf.overlay.visible, "back in play it shows again")
	DebugSettings.shared().set_perf_overlay(false)
	assert_false(perf.overlay.visible, "the Settings row hides it again")
	# Auto: a warm-up, then ten seconds under 24 fps drop one level, with a toast.
	assert_true(perf.settings.auto and perf.settings.preset == QualitySettings.HIGH, "auto at High headless")
	for i in 100:
		perf._watch_auto(0.05, 50.0)
	assert_eq(perf.settings.preset, QualitySettings.HIGH, "not during the warm-up")
	for i in 220:
		perf._watch_auto(0.05, 50.0)
	assert_eq(perf.settings.preset, QualitySettings.MEDIUM, "20 fps for 10 s drops to Medium")
	assert_near(main.get_viewport().scaling_3d_scale, 0.8, 0.001, "applied at once")
	var missions := main.find_child("MissionsLayer", false, false) as MissionsLayer
	assert_true(missions.hud.toast_showing(), "a toast says so")
	for i in 400:
		perf._watch_auto(0.016, 16.0)
	assert_eq(perf.settings.preset, QualitySettings.MEDIUM, "a fast game stays")
	DebugSettings.reset_shared()
	_restore()
	return true


func test_both_menus_carry_the_graphics_and_overlay_rows() -> bool:
	DebugSettings.reset_shared()
	var main := await _boot()
	for host: Object in [main.pause_menu, main.title]:
		var q: Button = host.call(&"setting_button", &"Quality")
		var o: Button = host.call(&"setting_button", &"PerfOverlay")
		assert_true(q != null and q.text.begins_with("Graphics: "), "%s has the graphics row" % host)
		assert_true(o != null and o.text == "Performance overlay: Off", "%s has the overlay row, off by default" % host)
	main.pause_menu.setting_button(&"PerfOverlay").pressed.emit()
	assert_true(main.perf.overlay.visible and DebugSettings.shared().perf_overlay, "the row turns the one switch on")
	assert_eq(main.title.setting_button(&"PerfOverlay").text, "Performance overlay: On", "and the title row follows")
	DebugSettings.shared().set_perf_overlay(false)
	DebugSettings.reset_shared()
	_restore()
	return true


## The owner's phone (G-341): an Adreno 613 starts the real game at Low, and the overlay says it
## in its own format ("Low (auto) · 3D …").
func test_an_adreno_613_boots_at_low() -> bool:
	_clean()
	var s := QualitySettings.new()
	s.path = PATH
	s.gpu_name = "Adreno (TM) 613"
	s.headless_is_high = false
	s.load_saved()
	QualitySettings.use_shared(s)
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	await wait_until(func() -> bool: return main.state != &"loading", LOAD_FRAMES)
	main.play()
	await wait_frames(3)
	assert_true(main.perf.settings.auto and main.perf.settings.preset == QualitySettings.LOW, "Auto at Low (%s)" % main.perf.settings.reason)
	assert_near(main.get_viewport().scaling_3d_scale, 0.65, 0.001, "at 65 % resolution")
	assert_eq(main.get_viewport().msaa_3d, Viewport.MSAA_DISABLED, "without MSAA")
	var text := main.perf.overlay_text()
	assert_true(RegEx.create_from_string("\\nLow \\(auto\\) · 3D \\d+x\\d+ \\(65% bilinear\\) · MSAA off · shadows 18 m · max fps 30\\n").search(text) != null, "the overlay's level line: %s" % text)
	assert_eq(main.pause_menu.setting_button(&"Quality").text.get_slice("\n", 0), "Graphics: Auto (Low)", "and the Settings row")
	# The city was built at Low from the first chunk (G-317): no tree guards, median shrubs,
	# overhead wires or rubble; the lamps and the crossings stay.
	assert_eq(main.world.road_extras, QualitySettings.LOW, "the city built its roads at Low")
	var cells: Array[Vector2i] = main.world.streamer.shown_cells()
	assert_true(not cells.is_empty(), "chunks are shown")
	var lamps := 0
	var crossings := 0
	for cell in cells:
		var b := main.world.streamer.build_of(cell)
		if b == null:
			continue
		for k: String in ["wires", "median_shrubs", "tree_guards"]:
			assert_eq(int(b.detail.get(k, 0)), 0, "no %s in chunk %s on Low" % [k, cell])
		if b.roads != null:
			for m in b.roads.decals:
				assert_true(m.kind != &"rubble", "no rubble in chunk %s on Low" % cell)
		lamps += b.lamp_points.size()
		crossings += int(b.detail.get("crossings", 0))
	assert_true(lamps > 0, "the lamps stay (%d heads)" % lamps)
	assert_true(crossings > 0, "and the crossings (%d)" % crossings)
	_restore()
	return true


func test_the_overlay_steps_aside_for_the_pause_menu() -> bool:
	DebugSettings.reset_shared()
	var main := await _boot()
	DebugSettings.shared().set_perf_overlay(true)
	await wait_frames(3)
	assert_true(main.perf.overlay.visible, "the overlay shows in play")
	main.pause_menu.open()
	await wait_frames(3)
	assert_false(main.perf.overlay.visible, "it is hidden while the pause menu is open (G-350)")
	assert_true(main.pause_menu.layer > main.perf.overlay.layer, "and the menu draws above it anyway")
	main.pause_menu.close()
	await wait_frames(3)
	assert_true(main.perf.overlay.visible, "it comes back when the menu closes")
	DebugSettings.shared().set_perf_overlay(false)
	DebugSettings.reset_shared()
	_restore()
	return true


## Motion blur (G-451): off by default, so Main holds no blur node and no layer; on only where the
## preset is High and the row was pressed; the row is hidden on Low and Medium.
func test_motion_blur_row_and_node() -> bool:
	DebugSettings.reset_shared()
	var main := await _boot()
	var s := main.perf.settings
	var layers_before := _blur_layers(main)
	assert_true(main.perf.blur == null and main.find_child("MotionBlur", false, false) == null, "default: no blur node in Main")
	assert_eq(layers_before, 0, "and no blur layer anywhere")
	for host: Object in [main.pause_menu, main.title]:
		var row: Button = host.call(&"setting_button", &"MotionBlur")
		assert_true(row != null and row.text == "Motion blur: Off" and row.visible, "%s: the row shows on High, Off" % host)
	main.pause_menu.setting_button(&"MotionBlur").pressed.emit()
	assert_true(s.motion_blur and main.perf.blur != null and main.perf.blur.is_on(), "pressing it on High adds the node")
	assert_eq(main.title.setting_button(&"MotionBlur").text, "Motion blur: On", "and the title row follows")
	assert_eq(_blur_layers(main), 1, "its one layer exists")
	s.set_preset(QualitySettings.MEDIUM)
	assert_true(main.perf.blur == null and _blur_layers(main) == 0, "Medium: the node and layer are gone although chosen")
	assert_false(main.pause_menu.setting_button(&"MotionBlur").visible or main.title.setting_button(&"MotionBlur").visible, "and the rows are hidden")
	s.set_preset(QualitySettings.LOW)
	assert_true(main.perf.blur == null, "Low: none")
	s.set_preset(QualitySettings.HIGH)
	assert_true(main.perf.blur != null and main.pause_menu.setting_button(&"MotionBlur").visible, "back on High: it returns, as chosen")
	main.pause_menu.setting_button(&"MotionBlur").pressed.emit()
	await wait_frames(2)
	assert_true(main.perf.blur == null and _blur_layers(main) == 0, "pressed off: node freed, no layer")
	DebugSettings.reset_shared()
	_restore()
	return true


func _blur_layers(main: Main) -> int:
	var n := 0
	for c in main.find_children("MotionBlurLayer", "CanvasLayer", true, false):
		if not c.is_queued_for_deletion():
			n += 1
	return n


## The map credit (G-455): the HUD's steps aside while the pause menu is open, the menu's own
## line stays, and both come back as they were.
func test_the_map_credit_steps_aside_for_the_pause_menu() -> bool:
	DebugSettings.reset_shared()
	var main := await _boot()
	var plate := main.hud.find_child("Credit", true, false).get_parent() as Control
	assert_true(plate.is_visible_in_tree(), "the credit shows in play")
	main.pause()
	await wait_frames(3)
	assert_false(plate.is_visible_in_tree(), "hidden while paused")
	var own := main.pause_menu.find_child("Credit", true, false) as Label
	assert_true(own.is_visible_in_tree() and own.text.contains("OpenStreetMap"), "the menu's own credit line shows: %s" % own.text)
	main.resume()
	await wait_frames(3)
	assert_true(plate.is_visible_in_tree(), "back after resuming")
	DebugSettings.reset_shared()
	_restore()
	return true
