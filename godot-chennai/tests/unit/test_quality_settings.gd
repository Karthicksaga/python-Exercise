extends TestCase
## Quality presets, the auto-detect table, saving, feature switches and the frame-time verdict
## (G-250, G-251, G-253, G-254).

const PATH := "user://test-quality-settings.json"


func _clean() -> void:
	for p: String in [PATH, PATH + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)


func test_every_preset_has_every_value_and_low_is_lightest() -> bool:
	var keys := QualitySettings.TABLE[QualitySettings.HIGH].keys()
	for p in 3:
		var v := QualitySettings.values(p)
		assert_eq(v.size(), keys.size(), "%s has every key" % QualitySettings.NAMES[p])
		for k: Variant in keys:
			assert_true(v.has(k), "%s has %s" % [QualitySettings.NAMES[p], k])
	var low := QualitySettings.values(QualitySettings.LOW)
	var mid := QualitySettings.values(QualitySettings.MEDIUM)
	var high := QualitySettings.values(QualitySettings.HIGH)
	assert_true(float(low["scale"]) >= 0.7 and float(low["scale"]) <= 0.8, "Low renders 3D at 75 % (coordinator: 0.75-0.85 for the Adreno 613)")
	assert_eq(float(mid["scale"]), 0.8, "Medium at 80 %")
	assert_eq(float(high["scale"]), 1.0, "High at full resolution")
	assert_eq(int(mid["scale_mode"]), QualitySettings.FSR1, "Medium upscales with FSR 1")
	assert_eq(int(low["msaa"]), 0, "no MSAA on Low")
	assert_true(int(low["shadow_size"]) == 1024 and float(low["shadow_distance"]) <= 20.0, "Low: a small shadow map, short reach")
	assert_eq(float(low["npc_shadow"]), 0.0, "no shadows from walkers on Low")
	assert_eq(float(mid["npc_shadow"]), 0.0, "nor on Medium")
	assert_eq(int(low["aniso"]), 0, "no anisotropic filtering on Low")
	assert_false(bool(low["ground_detail"]) or bool(low["water_detail"]), "light ground and water shaders on Low")
	for k: String in ["load_distance", "near_distance", "fog_far", "camera_far", "traffic", "walkers", "figures", "rain", "title_rain_layers", "workers", "street_lights", "physics_steps", "shadow_distance", "animate_reach", "parked_reach"]:
		assert_true(float(low[k]) <= float(mid[k]) and float(mid[k]) <= float(high[k]), "%s rises Low → Medium → High" % k)
	assert_true(float(low["unload_distance"]) > float(low["load_distance"]), "Low unloads beyond its load distance")
	# High is the game as it was before presets (tests and tools measure it).
	assert_eq(float(high["load_distance"]), 260.0, "High keeps the streamer's load distance")
	assert_eq(float(high["near_distance"]), 120.0, "and its near look")
	assert_eq(int(high["figures"]), CityLife.FIGURE_CAP, "and the figure cap")
	assert_eq(int(high["traffic"]), CityLife.TRAFFIC_POOL, "and the traffic pool")
	assert_eq(float(high["fog_far"]), CityEnvironment.FOG_FAR, "and the haze")
	assert_eq(int(high["physics_steps"]), 5, "and the physics catch-up of project.godot")
	assert_eq(int(high["ai_patience"]), 2, "and the AI wait")
	return true


func test_auto_detect_table() -> bool:
	const GB := 1024 * 1024 * 1024
	var px := 2400 * 1080
	var rows: Array[Array] = [
		# gpu, memory, pixels, expected
		["Adreno (TM) 613", 8 * GB, px, QualitySettings.LOW],
		["Adreno (TM) 610", 12 * GB, px, QualitySettings.LOW],
		["Adreno (TM) 619", 8 * GB, px, QualitySettings.LOW],
		["Adreno (TM) 642L", 8 * GB, px, QualitySettings.MEDIUM],
		["Adreno (TM) 660", 8 * GB, px, QualitySettings.HIGH],
		["Adreno (TM) 710", 8 * GB, px, QualitySettings.MEDIUM],
		["Adreno (TM) 740", 12 * GB, px, QualitySettings.HIGH],
		["Adreno (TM) 740", 6 * GB, px, QualitySettings.LOW],
		["Adreno (TM) 642L", 8 * GB, 3200 * 1440, QualitySettings.LOW],
		["Mali-G57 MC2", 8 * GB, px, QualitySettings.LOW],
		["Mali-G68 MC4", 8 * GB, px, QualitySettings.MEDIUM],
		["Mali-G710 MC10", 8 * GB, px, QualitySettings.HIGH],
		["PowerVR B-Series BXM-8-256", 8 * GB, px, QualitySettings.LOW],
		["", 8 * GB, px, QualitySettings.LOW],
		["llvmpipe (LLVM 15.0.7, 256 bits)", 16 * GB, px, QualitySettings.LOW],
		["SwiftShader Device (Subzero)", 4 * GB, px, QualitySettings.LOW],
		["NVIDIA GeForce RTX 3060", 16 * GB, 1920 * 1080, QualitySettings.HIGH],
		["Some New GPU 9000", 16 * GB, px, QualitySettings.LOW],
	]
	for r in rows:
		var found := QualitySettings.detect(String(r[0]), int(r[1]), int(r[2]))
		assert_eq(int(found[0]), int(r[3]), "%s, %d GiB, %d px → %s (%s)" % [r[0], int(r[1]) / GB, r[2], QualitySettings.NAMES[int(r[3])], found[1]])
	# "8 GB" phones report about 7.3 GiB.
	assert_eq(int(QualitySettings.detect("Adreno (TM) 740", int(7.3 * GB), px)[0]), QualitySettings.HIGH, "an 8 GB phone counts as 8 GB")
	assert_eq(int(QualitySettings.detect("", 0, px, true)[0]), QualitySettings.HIGH, "headless runs measure the full game")
	assert_true(QualitySettings.is_software("llvmpipe (LLVM 15)") and QualitySettings.is_software("SwiftShader Device") and not QualitySettings.is_software("Adreno (TM) 613"), "software renderers are recognised")
	return true


func test_saved_with_switches_and_additive() -> bool:
	_clean()
	var store := SaveStore.new(PATH).read()
	store.set_section(SaveStore.HOUR, 9.5)
	store.write()
	var s := QualitySettings.new()
	s.path = PATH
	var fired := [0]
	s.changed.connect(func() -> void: fired[0] += 1)
	s.set_preset(QualitySettings.MEDIUM)
	assert_false(s.auto, "a chosen preset is no longer automatic")
	s.set_overlay(true)
	s.set_switch("traffic", false)
	s.set_switch("shadows", false)
	s.set_switch("shadows", true)
	assert_true(fired[0] >= 5, "every change emits changed")
	var back := QualitySettings.new()
	back.path = PATH
	back.load_saved()
	assert_eq(back.preset, QualitySettings.MEDIUM, "preset saved")
	assert_false(back.auto, "and not re-detected")
	assert_true(back.overlay, "overlay saved")
	assert_false(back.is_on("traffic"), "a switched-off feature stays off")
	assert_true(back.is_on("shadows") and back.is_on("never-heard-of"), "others are on")
	assert_eq(SaveStore.new(PATH).read().section(SaveStore.HOUR), 9.5, "other sections kept")
	back.next_preset()
	assert_eq(back.preset, QualitySettings.HIGH, "next: Medium → High")
	back.next_preset()
	assert_true(back.auto, "after High comes Auto")
	assert_contains(back.row_label(), "Auto (", "the row says Auto and the level it picked")
	back.next_preset()
	assert_true(back.preset == QualitySettings.LOW and not back.auto, "and then Low")
	assert_eq(back.row_label(), "Graphics: Low", "a manual level reads plainly")
	for p in 3:
		assert_true(QualitySettings.EXPLAIN[p].length() <= 48, "one short line explains %s" % QualitySettings.NAMES[p])
	back.set_all_switches(FeatureSwitches.ids(), false)
	assert_false(back.is_on("rain") or back.is_on("landmarks"), "safe mode turns everything off")
	back.set_all_switches(FeatureSwitches.ids(), true)
	assert_true(back.switches.is_empty(), "and all on clears the list")
	var junk := QualitySettings.new()
	junk.from_dict({"preset": "x", "auto": 3, "overlay": "yes", "off": "traffic"})
	assert_true(junk.preset == QualitySettings.LOW and junk.auto and not junk.overlay and junk.switches.is_empty(), "wrong-typed fields keep their defaults")
	_clean()
	return true


func test_auto_drops_one_level_and_remembers() -> bool:
	_clean()
	var s := QualitySettings.new()
	s.path = PATH
	s.auto = true
	s.preset = QualitySettings.HIGH
	assert_true(s.drop_auto(), "Auto drops a level")
	assert_eq(s.preset, QualitySettings.MEDIUM, "High → Medium")
	assert_true(s.auto, "and stays automatic")
	var back := QualitySettings.new()
	back.path = PATH
	back.load_saved()
	assert_eq(back.auto_cap, QualitySettings.MEDIUM, "the cap is saved")
	assert_true(back.preset <= QualitySettings.MEDIUM, "the next start begins at or under it")
	s.set_preset(QualitySettings.HIGH)
	assert_false(s.drop_auto(), "a level the player chose is never dropped")
	s.preset = QualitySettings.LOW
	s.auto = true
	assert_false(s.drop_auto(), "nothing below Low")
	_clean()
	return true


func test_frame_stats_and_verdict() -> bool:
	var f := FrameStats.new()
	assert_eq(f.average(), 0.0, "nothing yet")
	for i in 200:
		f.add(20.0 if i % 10 else 50.0, 1 if i % 2 else 2)
	assert_eq(f.count(), FrameStats.WINDOW, "keeps the last 120")
	assert_near(f.average(), 23.0, 0.01, "average of the window")
	assert_eq(f.worst(), 50.0, "worst of the window")
	assert_near(f.fps(), 1000.0 / 23.0, 0.01, "fps from the average")
	assert_eq(f.max_physics_steps, 2, "physics catch-up steps seen")
	assert_eq(FrameStats.verdict(200.0, 20.0, 180.0), "GPU-bound", "GPU fills the frame")
	assert_eq(FrameStats.verdict(200.0, 190.0, 30.0), "CPU-bound", "CPU fills the frame")
	assert_eq(FrameStats.verdict(200.0, 180.0, 170.0), "both CPU and GPU", "both")
	assert_eq(FrameStats.verdict(16.7, 5.0, 6.0), "fine", "a fast frame is fine")
	assert_contains(FrameStats.verdict(200.0, 20.0, 0.0), "not measured", "no GPU timer says so")
	assert_contains(FrameStats.verdict(200.0, 20.0, 30.0), "waiting", "neither side busy")
	return true
