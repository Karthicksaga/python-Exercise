extends TestCase
## The benchmark's pure parts (G-400…G-403): the route is fixed and deterministic and lies on its
## roads, the segment numbers are right, the recommendation follows its rule, the files have their
## shape, and a held level is never saved.

const PATH := "user://test-benchmark-quality.json"


func test_route_is_fixed_and_deterministic() -> bool:
	var segs := BenchmarkRoute.segments()
	var ids: Array[StringName] = []
	for s in segs:
		ids.append(s.id)
	assert_eq(ids, [&"morning", &"dusk", &"night", &"platform", &"market", &"flyover", &"drive"] as Array[StringName], "the seven segments, in order")
	var total := BenchmarkRoute.total_seconds()
	assert_true(total >= 85.0 and total <= 95.0, "about 90 s of game time (%.0f)" % total)
	assert_near(BenchmarkRoute.total_seconds(0.25), total * 0.25, 0.001, "a scale shortens it")
	assert_near(segs[1].hour, 18.0 + 40.0 / 60.0, 0.001, "the evening segment is at 18:40")
	assert_true(segs[0].hour < 10.0 and segs[2].hour >= 21.0, "morning and night")
	for s in segs:
		assert_true(s.length() + 0.5 >= s.speed * s.seconds, "%s: its path (%.0f m) covers %.0f s at %.1f m/s" % [s.id, s.length(), s.seconds, s.speed])
		assert_eq(BenchmarkRoute.steps(s), roundi(s.seconds * 60.0), "%s: steps are game seconds at 60 a second" % s.id)
		for t: float in [0.0, 3.3, s.seconds * 0.5, s.seconds]:
			var a := BenchmarkRoute.pose(s, t)
			var b := BenchmarkRoute.pose(s, t)
			check(a.eye == b.eye and a.eye_height == b.eye_height and a.target == b.target and a.focus == b.focus and a.yaw == b.yaw, "%s at %.1f s: the same pose every call" % [s.id, t])
			check(a.eye.distance_to(a.focus) > s.back - 0.01 and a.eye_height > a.focus_height, "%s: the camera behind and above the focus" % s.id)
		# A shorter run covers the same road: at scale 0.25, t/4 is where scale 1 is at t.
		var full := BenchmarkRoute.pose(s, s.seconds * 0.8)
		var quick := BenchmarkRoute.pose(s, s.seconds * 0.8 * 0.25, 0.25)
		assert_vec_near(quick.focus, full.focus, 0.001, "%s: a scaled run follows the same path" % s.id)
	var drive := segs[6]
	var moved := BenchmarkRoute.pose(drive, 0.0).focus.distance_to(BenchmarkRoute.pose(drive, drive.seconds).focus)
	assert_true(moved > 300.0, "the drive goes far enough to load new chunks (%.0f m)" % moved)
	var deck := 0.0
	for p in segs[5].path:
		deck = maxf(deck, p.y)
	assert_true(deck > 6.0, "the flyover segment climbs onto the deck (%.1f m)" % deck)
	return true


func test_route_lies_on_its_roads() -> bool:
	var kit := CityTestKit.regional_kit()
	for s in BenchmarkRoute.segments():
		if s.id == &"platform":
			continue
		var roads: Array[Road] = []
		var cell := kit.source.cell_at(Vector2(s.path[0].x, s.path[0].z))
		for r in kit.layouts.layout_for(cell).roads:
			if r.name == s.place:
				roads.append(r)
		assert_true(not roads.is_empty(), "%s: %s is in the data" % [s.id, s.place])
		var worst := 0.0
		for p in s.path:
			var q := Vector2(p.x, p.z)
			var best := INF
			for r in roads:
				for i in r.points.size() - 1:
					best = minf(best, Geometry2D.get_closest_point_to_segment(q, r.points[i], r.points[i + 1]).distance_to(q))
			worst = maxf(worst, best)
		assert_true(worst < 2.0, "%s: every point on %s (worst %.2f m off)" % [s.id, s.place, worst])
	var net := RailNetwork.load_file()
	var line := net.line("beach-tambaram")
	var egmore := Vector2.INF
	for stop in line.stops:
		if stop.name == "Chennai Egmore":
			egmore = line.path.beside(stop.s, 0.0)
	var start := BenchmarkRoute.segments()[3].path[0]
	assert_true(egmore != Vector2.INF and Vector2(start.x, start.z).distance_to(egmore) < 60.0, "the platform segment is at Chennai Egmore (%s, station %s)" % [start, egmore])
	return true


func test_segment_numbers() -> bool:
	var s := BenchmarkStats.new()
	for i in 100:
		# 1..100 ms: avg 50.5, p95 95, p99 99; 50 frames over 50 ms.
		s.add(float(i + 1), 10.0, 20.0, 25.0, 100, 200000, 300 * 1048576, 1000 if i == 3 else 0)
	s.steps = 120
	s.built_start = 4
	s.built_end = 6
	s.build_usec_start = 1000
	s.build_usec_end = 81000
	s.build_max_usec = 50000
	var row := s.result(BenchmarkRoute.segments()[0])
	assert_near(float(row["avg_ms"]), 50.5, 0.001, "average")
	assert_near(float(row["p95_ms"]), 95.0, 0.001, "p95 by nearest rank")
	assert_near(float(row["p99_ms"]), 99.0, 0.001, "p99")
	assert_eq(int(row["hitches"]), 50, "frames over 50 ms")
	assert_near(float(row["fps"]), 19.8, 0.05, "fps from the average")
	assert_eq(int(row["draws"]), 100, "draws a frame")
	assert_near(float(row["video_mb"]), 300.0, 0.01, "most video memory")
	assert_eq(int(row["chunks_built"]), 2, "chunks built in the segment")
	assert_near(float(row["chunk_build_ms_avg"]), 40.0, 0.01, "their average build")
	assert_near(float(row["chunk_build_ms_max"]), 50.0, 0.01, "the slowest")
	assert_near(float(row["game_seconds"]), 2.0, 0.001, "120 steps are 2 game seconds")
	assert_near(float(row["stream_main_ms_max"]), 1.0, 0.001, "streaming's worst main-thread frame")
	var keys: Array[String] = []
	for k: Variant in row.keys():
		keys.append(str(k))
	keys.sort()
	var want := BenchmarkReport.SEGMENT_KEYS.duplicate()
	want.sort()
	assert_eq(keys, want, "every key of a segment row")
	assert_eq(str(s.result()["id"]), "all", "the whole-route row")
	assert_eq(BenchmarkStats.quantile(PackedFloat32Array(), 0.95), 0.0, "no frames: 0")
	return true


static func _level(preset: int, avg: float, p95: float, first: bool = false, verdict: String = "GPU-bound") -> Dictionary:
	var rows: Array[Dictionary] = []
	for s in BenchmarkRoute.segments():
		rows.append({"short": s.short, "fps": 1000.0 / avg, "avg_ms": avg, "p95_ms": p95, "verdict": verdict, "hitches": 0, "game_seconds": s.seconds})
	return {"level": QualitySettings.NAMES[preset], "preset": preset, "first": first, "segments": rows,
		"overall": {"fps": 1000.0 / avg, "avg_ms": avg, "p95_ms": p95, "hitches": 1, "game_seconds": 90.0, "verdict": verdict}}


func test_recommendation() -> bool:
	# The owner's phone on High: 55-58 ms, GPU-bound.
	var phone: Array[Dictionary] = [_level(QualitySettings.LOW, 33.4, 40.0, true), _level(QualitySettings.MEDIUM, 45.0, 60.0), _level(QualitySettings.HIGH, 56.0, 70.0)]
	var rec := BenchmarkReport.recommend(phone)
	assert_eq(str(rec["text"]), "Use Low", "only Low holds")
	assert_contains(str(rec["detail"]), "Medium", "and says what Medium missed")
	var mid: Array[Dictionary] = [_level(QualitySettings.HIGH, 40.0, 60.0, true), _level(QualitySettings.LOW, 33.3, 36.0), _level(QualitySettings.MEDIUM, 30.0, 40.0)]
	assert_eq(str(BenchmarkReport.recommend(mid)["text"]), "Medium is fine", "Medium holds, High does not")
	var fast: Array[Dictionary] = [_level(QualitySettings.HIGH, 16.7, 20.0, true)]
	assert_eq(str(BenchmarkReport.recommend(fast)["text"]), "High is fine", "High holds")
	var slow: Array[Dictionary] = [_level(QualitySettings.LOW, 70.0, 90.0, true)]
	var r2 := BenchmarkReport.recommend(slow)
	assert_eq(str(r2["text"]), "Use Low", "even a slow phone is told Low")
	assert_contains(str(r2["detail"]), "Even Low", "and that Low is not smooth either")
	var one_slow := _level(QualitySettings.HIGH, 20.0, 30.0, true)
	(one_slow["segments"] as Array)[1] = {"short": "18:40", "fps": 15.0, "avg_ms": 66.0, "verdict": "GPU-bound"}
	var j := BenchmarkReport.judge(one_slow)
	assert_false(bool(j["smooth"]), "one slow segment fails the level")
	assert_contains(str(j["why"]), "18:40", "and is named")
	return true


func test_files_have_their_shape() -> bool:
	var levels: Array[Dictionary] = [_level(QualitySettings.LOW, 33.4, 40.0, true), _level(QualitySettings.HIGH, 56.0, 70.0)]
	var device := {"model": "Test phone", "os": "Android 14", "cpu": "x8", "memory_gib": 5.6, "screen": "2460x1080", "godot": "4.7.2", "version": "", "commit": "abc1234", "renderer": "Mobile (Vulkan)"}
	var renderer := {"method": "mobile", "driver": "vulkan", "gpu": "Adreno (TM) 613", "vendor": "Qualcomm", "api": "1.3", "type": "integrated"}
	var result := BenchmarkReport.make(device, renderer, "Low (auto)", levels, 1.0, 400.0, {}, {})
	var parsed: Variant = JSON.parse_string(BenchmarkReport.to_json(result))
	assert_true(parsed is Dictionary, "the JSON parses")
	var d := parsed as Dictionary
	for k: String in ["format", "device", "renderer", "started_at", "scale", "route_seconds", "wall_seconds", "thermal_start", "thermal_end", "thermal_text", "levels", "recommendation"]:
		assert_true(d.has(k), "benchmark.json has %s" % k)
	assert_eq(str(d["format"]), BenchmarkReport.FORMAT, "its format")
	assert_eq((d["levels"] as Array).size(), 2, "a block per level")
	assert_true(((d["levels"] as Array)[0] as Dictionary).has("judge"), "each judged")
	var text := BenchmarkReport.to_text(result)
	for part: String in ["Recommendation: Use Low", "Mobile (Vulkan)", "Adreno (TM) 613", "abc1234", "== Low (the level you had)", "== High", "Morning", "18:40", "Compare renderers"]:
		assert_contains(text, part, "benchmark.txt shows %s" % part)
	return true


func test_a_held_level_is_never_saved() -> bool:
	for p: String in [PATH, PATH + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)
	var s := QualitySettings.new()
	s.path = PATH
	s.headless_is_high = false
	s.gpu_name = "Adreno (TM) 613"
	s.load_saved()
	assert_true(s.auto and s.preset == QualitySettings.LOW, "an Adreno 613 starts at Auto (Low)")
	var applied: Array[int] = []
	s.changed.connect(func() -> void: applied.append(s.preset))
	s.hold_preset(QualitySettings.HIGH)
	assert_true(s.is_held() and s.preset == QualitySettings.HIGH and not s.auto, "held at High, Auto's drop off")
	assert_eq(s.overlay_label(), "High (benchmark)", "the overlay says why")
	s.set_overlay(true)  # something else is saved meanwhile
	var saved: Variant = SaveStore.new(PATH).read().section(QualitySettings.SECTION)
	assert_true(saved is Dictionary and bool((saved as Dictionary)["auto"]) and int((saved as Dictionary)["preset"]) == QualitySettings.LOW, "the file keeps the player's level (%s)" % saved)
	assert_true(bool((saved as Dictionary)["overlay"]), "and the other change")
	s.hold_preset(QualitySettings.MEDIUM)
	s.release_hold()
	assert_true(not s.is_held() and s.auto and s.preset == QualitySettings.LOW, "released: Auto (Low) again")
	assert_true(s.overlay, "keeping what changed meanwhile")
	assert_eq(applied, [QualitySettings.HIGH, QualitySettings.HIGH, QualitySettings.MEDIUM, QualitySettings.LOW] as Array[int], "each change applied live")
	for p: String in [PATH, PATH + ".tmp"]:
		if FileAccess.file_exists(p):
			DirAccess.remove_absolute(p)
	return true
