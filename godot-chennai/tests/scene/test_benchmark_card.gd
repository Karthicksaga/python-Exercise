extends TestCase
## The benchmark's results card (G-405) is one screenshot at the phone sizes: laid out in the UI
## units the project's stretch gives each window (915x412 small phone, 1830x824 at 2x, the owner's
## 2460x1080, 640x320 the worst case), every table, line and button is inside the screen, none of
## them overlap, the buttons are 48 tall, and no text is smaller than 12.

const WINDOWS: Array[Vector2i] = [Vector2i(915, 412), Vector2i(1830, 824), Vector2i(2460, 1080), Vector2i(640, 320)]


static func _result() -> Dictionary:
	var levels: Array[Dictionary] = []
	for p: int in [QualitySettings.LOW, QualitySettings.MEDIUM, QualitySettings.HIGH]:
		var rows: Array[Dictionary] = []
		for s in BenchmarkRoute.segments():
			# Wide numbers: three digits and a decimal in every column.
			rows.append({"short": s.short, "avg_ms": 158.4, "p95_ms": 215.1, "p99_ms": 408.6, "hitches": 173, "gpu_ms": 99.9, "cpu_ms": 108.0, "verdict": "both CPU and GPU", "fps": 6.3})
		var all := {"short": "All", "avg_ms": 123.6, "p95_ms": 215.1, "p99_ms": 408.6, "hitches": 1173, "gpu_ms": 99.9, "cpu_ms": 108.0, "verdict": "GPU-bound", "fps": 8.1, "draws": 1234, "primitives": 312000, "video_mb": 1480.0, "chunks_built": 14, "chunk_build_ms_max": 412.0}
		levels.append({"level": QualitySettings.NAMES[p], "preset": p, "first": p == QualitySettings.LOW, "segments": rows, "overall": all, "judge": {"smooth": false, "why": "8 fps"}})
	return {
		"device": {"model": "23090RA98I", "os": "Android 14", "cpu": "Qualcomm Snapdragon 4 Gen 2 x8", "memory_gib": 5.6, "screen": "2460x1080", "godot": "4.7.2-stable (official)", "version": "", "commit": "abcdef123456", "renderer": "Compatibility (OpenGL)"},
		"renderer": {"gpu": "Adreno (TM) 613", "vendor": "Qualcomm", "api": "OpenGL ES 3.2 V@0762.10"},
		"started_at": "Low (auto)", "thermal_text": "thermal moderate, headroom 0.83, battery 41.2 °C → moderate, headroom 0.91, battery 43.0 °C",
		"levels": levels,
		"recommendation": {"preset": 0, "level": "Low", "text": "Use Low", "detail": "Even Low is not smooth: 8 fps on average, 1 frame in 20 over 215 ms, 6 fps in Platform (both CPU and GPU)."},
	}


func test_card_fits_one_screen_at_phone_sizes() -> bool:
	for window in WINDOWS:
		var units := BenchmarkCard.ui_size(window)
		var vp := SubViewport.new()
		vp.size = window
		vp.size_2d_override = Vector2i(roundi(units.x), roundi(units.y))
		vp.size_2d_override_stretch = true
		root.add_child(vp)
		var card := BenchmarkCard.new()
		vp.add_child(card)
		card.show_result(_result())
		await wait_frames(3)
		var screen := Rect2(Vector2.ZERO, units)
		assert_true(units.x >= 914.0 and units.y >= 411.0, "%s lays out in at least 915x412 units (%s)" % [window, units])
		var parts: Array[Control] = [card.recommendation.get_parent() as Control, card.detail, card.info, card.hint, card.again, card.close]
		for t in card.tables:
			parts.append(t.get_parent().get_parent() as Control)
		for c in parts:
			check(screen.encloses(c.get_global_rect().grow(-0.5)), "%s: %s inside the screen (%s in %s)" % [window, c.name, c.get_global_rect(), screen])
		for i in parts.size():
			for j in range(i + 1, parts.size()):
				check(not parts[i].get_global_rect().grow(-0.5).intersects(parts[j].get_global_rect().grow(-0.5)), "%s: %s and %s do not overlap" % [window, parts[i].name, parts[j].name])
		assert_eq(card.tables.size(), 3, "a table per level")
		for t in card.tables:
			assert_eq(t.get_child_count(), BenchmarkCard.COLUMNS.size() * (BenchmarkRoute.segments().size() + 2), "%s: header, seven segments and the whole route" % window)
			# Each table's cells stay inside its panel (none cut at the right).
			var panel := t.get_parent().get_parent() as Control
			check(panel.get_global_rect().grow(0.5).encloses(t.get_global_rect()), "%s: %s's table fits its panel (%s in %s)" % [window, panel.name, t.get_global_rect(), panel.get_global_rect()])
		for b: Button in [card.again, card.close]:
			check(b.get_global_rect().size.y >= UiTheme.MIN_TARGET, "%s: %s is a 48 target" % [window, b.name])
		for n in card.find_children("*", "Label", true, false):
			var l := n as Label
			check(l.get_theme_font_size(&"font_size") >= 12, "%s: %s text at least 12" % [window, l.name])
		assert_contains(card.info.text, "Compatibility (OpenGL)", "the renderer that ran is printed")
		assert_contains(card.hint.text, "Compare renderers", "with the hint to run the other APK")
		assert_contains(card.info.text, "abcdef123456", "and the build")
		vp.queue_free()
		await wait_frames(1)
	return true
