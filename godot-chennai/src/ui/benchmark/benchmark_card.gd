class_name BenchmarkCard
extends CanvasLayer
## The benchmark's results card (decision G-405): one full screen the owner can send as a single
## screenshot, at 915x412 UI units (every phone in landscape, the POCO M6 Pro's 2460x1080 included,
## lays out in at least that). The plain recommendation top right, the device, renderer and build
## lines, then one table per quality level side by side (a row per segment and one for the whole
## route: average, p95 and p99 frame time, frames over 50 ms, GPU and CPU ms, the bound side in
## amber), a line of counts under each, and how to compare the two renderers. Glass style
## (`UiTheme`), body text 12 at the base size, RUN AGAIN and CLOSE at 48.
##
## Gets the result dictionary of `BenchmarkReport` (data only; no game code here).

signal close_requested
signal again_requested

## Card text sizes at the base resolution (chennai-game-design §3: 12 the smallest).
const TABLE_SIZE := 12
const HEAD_SIZE := 18
const COLUMNS: Array[String] = ["", "avg", "p95", "p99", ">50", "GPU", "CPU"]

var root: Control
var recommendation: Label
var detail: Label
var info: Label
var levels_row: HBoxContainer
var hint: Label
var again: Button
var close: Button
## The tables, one per level (tests read their rects).
var tables: Array[GridContainer] = []


func _init() -> void:
	name = "BenchmarkCard"
	layer = 9  # above the pause and title menus (8) and the overlay (7)
	process_mode = Node.PROCESS_MODE_ALWAYS
	root = Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.theme = UiTheme.get_theme()
	add_child(root)
	var back := ColorRect.new()
	back.name = "Back"
	back.color = Color(UiTheme.BACKDROP, 0.94)
	back.set_anchors_preset(Control.PRESET_FULL_RECT)
	back.mouse_filter = Control.MOUSE_FILTER_STOP
	root.add_child(back)
	var margin := SafeAreaMargin.new()
	margin.name = "Safe"
	margin.gutter = 12
	root.add_child(margin)
	var column := VBoxContainer.new()
	column.name = "Column"
	column.add_theme_constant_override("separation", 6)
	margin.add_child(column)

	var head := HBoxContainer.new()
	head.add_theme_constant_override("separation", 12)
	column.add_child(head)
	var title := UiTheme.label("Benchmark results", HEAD_SIZE, UiTheme.AMBER)
	title.name = "Title"
	head.add_child(title)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	head.add_child(spacer)
	recommendation = UiTheme.label("", HEAD_SIZE, UiTheme.TEXT)
	recommendation.name = "Recommendation"
	var pill := PanelContainer.new()
	pill.name = "RecommendationPill"
	var pill_box := UiTheme.glass_box(Color(UiTheme.AMBER, 0.22), Color(UiTheme.AMBER, 0.95), 14)
	pill_box.content_margin_left = 14
	pill_box.content_margin_right = 14
	pill_box.content_margin_top = 2
	pill_box.content_margin_bottom = 2
	pill.add_theme_stylebox_override("panel", pill_box)
	pill.add_child(recommendation)
	head.add_child(pill)

	detail = _small("", UiTheme.TEXT)
	detail.name = "Detail"
	column.add_child(detail)
	info = _small("", UiTheme.TEXT_DIM)
	info.name = "Info"
	info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	column.add_child(info)

	levels_row = HBoxContainer.new()
	levels_row.name = "Levels"
	levels_row.add_theme_constant_override("separation", 8)
	levels_row.size_flags_vertical = Control.SIZE_EXPAND_FILL
	column.add_child(levels_row)

	var foot := HBoxContainer.new()
	foot.name = "Foot"
	foot.add_theme_constant_override("separation", 8)
	column.add_child(foot)
	hint = _small("", UiTheme.TEXT_DIM)
	hint.name = "Hint"
	hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	hint.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	hint.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	foot.add_child(hint)
	again = _button("RUN AGAIN", "Again")
	again.pressed.connect(func() -> void: again_requested.emit())
	foot.add_child(again)
	close = _button("CLOSE", "Close")
	close.pressed.connect(func() -> void: close_requested.emit())
	foot.add_child(close)
	visible = false


static func _small(text: String, colour: Color) -> Label:
	return UiTheme.label(text, TABLE_SIZE, colour)


static func _button(text: String, node_name: String) -> Button:
	var b := UiTheme.button(text)
	b.name = node_name
	b.custom_minimum_size = Vector2(120, UiTheme.MIN_TARGET)
	UiTheme.style_glass(b, node_name == "Close")
	return b


static func _num(v: Variant) -> String:
	var f := float(v)
	return "n/a" if f <= 0.0 else ("%.0f" % f if f >= 100.0 else "%.1f" % f)


func show_result(result: Dictionary) -> void:
	var rec: Dictionary = result.get("recommendation", {})
	var d: Dictionary = result.get("device", {})
	var r: Dictionary = result.get("renderer", {})
	recommendation.text = str(rec.get("text", "?"))
	detail.text = str(rec.get("detail", ""))
	info.text = "Renderer %s · GPU %s (%s, API %s) · %s · %s · CPU %s · %.1f GiB · screen %s · Godot %s · build %s%s · started at %s · %s" % [
		d.get("renderer", "?"), r.get("gpu", "?"), r.get("vendor", "?"), r.get("api", "?"), d.get("model", "?"), d.get("os", "?"), d.get("cpu", "?"),
		float(d.get("memory_gib", 0.0)), d.get("screen", "?"), str(d.get("godot", "?")).trim_suffix(".official"), d.get("commit", "?"),
		(" v" + str(d["version"])) if str(d.get("version", "")) != "" else "", result.get("started_at", "?"),
		result.get("thermal_text", "thermal n/a")]
	hint.text = "Saved as benchmark.txt and benchmark.json. Compare renderers: this ran %s; run it on the other APK too (\"(GL)\" is Compatibility) and send both." % d.get("renderer", "?")
	for c in levels_row.get_children():
		c.queue_free()
		levels_row.remove_child(c)
	tables.clear()
	for l: Variant in result.get("levels", []):
		levels_row.add_child(_level_panel(l as Dictionary, int(rec.get("preset", -1))))
	visible = true
	close.grab_focus.call_deferred()


func _level_panel(level: Dictionary, recommended: int) -> PanelContainer:
	var panel := PanelContainer.new()
	panel.name = "Level%s" % str(level.get("level", "?"))
	panel.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var picked := int(level.get("preset", -2)) == recommended
	var box := UiTheme.glass_plate(0.55, 10)
	if picked:
		box.border_color = Color(UiTheme.AMBER, 0.95)
		box.set_border_width_all(2)
	box.content_margin_left = 8
	box.content_margin_right = 8
	box.content_margin_top = 4
	box.content_margin_bottom = 4
	panel.add_theme_stylebox_override("panel", box)
	var v := VBoxContainer.new()
	v.add_theme_constant_override("separation", 2)
	panel.add_child(v)
	var all: Dictionary = level.get("overall", {})
	var judged: Dictionary = level.get("judge", {})
	var head := "%s%s · %.0f fps · %s" % [level.get("level", "?"), " (yours)" if bool(level.get("first", false)) else "", float(all.get("fps", 0.0)), "smooth" if bool(judged.get("smooth", false)) else str(all.get("verdict", ""))]
	var title := UiTheme.label(head, TABLE_SIZE + 1, UiTheme.AMBER if picked else UiTheme.TEXT)
	title.name = "Head"
	title.clip_text = true
	title.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	v.add_child(title)
	var grid := GridContainer.new()
	grid.name = "Table"
	grid.columns = COLUMNS.size()
	grid.add_theme_constant_override("h_separation", 6)
	grid.add_theme_constant_override("v_separation", 0)
	v.add_child(grid)
	tables.append(grid)
	for c in COLUMNS:
		var h := _small(c, UiTheme.TEXT_DIM)
		h.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(h)
	var rows: Array = (level.get("segments", []) as Array).duplicate()
	rows.append(all)
	for s: Variant in rows:
		var row := s as Dictionary
		var verdict := str(row.get("verdict", ""))
		var gpu_bound := verdict.begins_with("GPU") or verdict.begins_with("both")
		var cpu_bound := verdict.begins_with("CPU") or verdict.begins_with("both")
		var cells: Array[String] = [str(row.get("short", "?")), _num(row.get("avg_ms", 0)), _num(row.get("p95_ms", 0)), _num(row.get("p99_ms", 0)), str(int(row.get("hitches", 0))), _num(row.get("gpu_ms", 0)), _num(row.get("cpu_ms", 0))]
		for i in cells.size():
			var colour := UiTheme.TEXT
			if (i == 5 and gpu_bound) or (i == 6 and cpu_bound):
				colour = UiTheme.AMBER
			elif i == 4 and int(row.get("hitches", 0)) > 0:
				colour = UiTheme.DANGER
			var cell := _small(cells[i], colour)
			if i > 0:
				cell.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
			grid.add_child(cell)
	var counts := _small("draws %d · %dk prims · %.0f MB video · chunks %d, slowest %s ms" % [int(all.get("draws", 0)), int(all.get("primitives", 0)) / 1000, float(all.get("video_mb", 0.0)), int(all.get("chunks_built", 0)), _num(all.get("chunk_build_ms_max", 0))], UiTheme.TEXT_DIM)
	counts.name = "Counts"
	counts.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	v.add_child(counts)
	return panel


## The UI size the project's stretch (canvas_items, expand, base 915x412) gives a window.
static func ui_size(window: Vector2i) -> Vector2:
	var base := Vector2(915, 412)
	var k := minf(window.x / base.x, window.y / base.y)
	return Vector2(window) / k
