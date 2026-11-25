class_name BenchmarkRunner
extends Node
## The benchmark mode (decisions G-400…G-404): drives the fixed route (`BenchmarkRoute`) at the
## level the player had, then at the other levels (Low, Medium, High order), with the same camera
## path, and records per segment the numbers of `BenchmarkStats`. At the end it writes
## user://benchmark.json and user://benchmark.txt and shows the results card.
##
## Made only when the owner presses "Run benchmark" or the game starts with `--benchmark` (after
## `--`); nothing of it exists or runs otherwise (`started` counts the runs, for the tests).
##
## Game time: every segment advances by physics steps (60 a game second), the camera and the focus
## are placed from the step count, never from the clock; frames are measured as they come. While
## it runs the player's rig is switched off (its body is moved along the path so streaming,
## traffic and crowds follow it), the touch controls are hidden, the weather is dry, the time of day
## is set and stopped per segment, and the level is held without saving (`QualitySettings
## .hold_preset`). Pausing pauses it; going to the title cancels it. All of that is put back after.

signal finished(result: Dictionary)
signal _step_reached

## Runs started since the game started (tests: none unless started).
static var started: int = 0
## The runner of the run in progress, if any.
static var current: BenchmarkRunner = null

## Physics steps held at the start of a segment before measuring: the chunks round it are in, the
## AI has taken the new streets, the figures are placed (G-400).
const SETTLE_STEPS := 150
## The settle actually used (tests shorten it).
var settle_steps: int = SETTLE_STEPS
## Longest wait for a segment's streets, in physics steps (game time).
const READY_STEPS := 60 * 60

var main: Main
## Game seconds of each segment times this (CI and tests run shorter; 1 for the owner).
var scale: float = 1.0
## The levels to run, in order; empty: the level the player had, then the others Low → High.
var levels: Array[int] = []
## Quit the game when done (CI).
var quit_after: bool = false
## The last result (also in the files).
var result: Dictionary = {}
var running: bool = false
var cancelled: bool = false
## Where the run is, for the banner and tests: level index, segment index.
var at := Vector2i(-1, -1)
var camera: Camera3D
var banner: BenchmarkBanner
var card: BenchmarkCard

var _settings: QualitySettings
var _segment: BenchmarkRoute.Segment = null
var _mode: StringName = &"idle"
var _steps: int = 0
var _target: int = 0
var _stats: BenchmarkStats = null
var _level_stats: BenchmarkStats = null
var _level_build_usec: int = 0
var _last_usec: int = 0
var _skip_frame: bool = true
var _saved: Dictionary = {}
var _rig_mode: Node.ProcessMode = Node.PROCESS_MODE_INHERIT


## Starts a run on `m` (from the Settings row or the launch flag).
static func start(m: Main, run_scale: float = 1.0, run_levels: Array[int] = [], quit_when_done: bool = false) -> BenchmarkRunner:
	if current != null and current.running:
		return current
	var r := BenchmarkRunner.new()
	r.name = "BenchmarkRunner"
	r.main = m
	r.scale = run_scale
	r.levels = run_levels
	r.quit_after = quit_when_done
	started += 1
	m.add_child(r)
	r.run.call_deferred()
	return r


## The level order: the player's level first, then the others from Low up (G-402).
static func order(first: int, wanted: Array[int]) -> Array[int]:
	if not wanted.is_empty():
		return wanted
	var out: Array[int] = [first]
	for p: int in [QualitySettings.LOW, QualitySettings.MEDIUM, QualitySettings.HIGH]:
		if p != first:
			out.append(p)
	return out


func _init() -> void:
	# Pausing the game pauses the run (Main itself always processes).
	process_mode = Node.PROCESS_MODE_PAUSABLE
	# Before the player, the streamer and the traffic read the focus.
	process_physics_priority = -500


func run() -> void:
	current = self
	running = true
	_settings = main.perf.settings if main.perf != null else QualitySettings.shared()
	var wall_start := Time.get_ticks_msec()
	print("[bench] start: %s, scale %.2f" % [BenchmarkDevice.renderer_label(), scale])
	for i in READY_STEPS * 4:
		if main.state == &"play" and not main.loading.visible:
			break
		await GameLoop.wait_physics_frames(1)
	if main.state != &"play" or main.world == null or main.rig == null:
		_fail("the game is not in play")
		return
	var started_label := _settings.overlay_label()
	_take_over()
	var thermal_start := BenchmarkDevice.thermal()
	var runs: Array[Dictionary] = []
	var plan := order(_settings.preset, levels)
	for li in plan.size():
		var p := plan[li]
		_settings.hold_preset(p)
		var rows: Array[Dictionary] = []
		_level_stats = BenchmarkStats.new()
		_level_build_usec = 0
		var segs := BenchmarkRoute.segments()
		for si in segs.size():
			at = Vector2i(li, si)
			await _run_segment(segs[si], li, plan.size())
			if cancelled:
				_give_back()
				return
			rows.append(_stats.result(segs[si]))
			_level_stats.build_max_usec = maxi(_level_stats.build_max_usec, _stats.build_max_usec)
			_level_build_usec += _stats.build_usec_end - _stats.build_usec_start
			_level_stats.steps += _stats.steps
		# The whole route's chunk numbers are the segments' own (builds during the waits between
		# segments are not part of any measured stretch).
		_level_stats.built_start = 0
		_level_stats.build_usec_start = 0
		for row in rows:
			_level_stats.built_end += int(row["chunks_built"])
		_level_stats.build_usec_end = _level_build_usec
		_level_stats.counts = main.life.counts() if main.life != null else {}
		var level := {"level": QualitySettings.NAMES[p], "preset": p, "first": li == 0, "segments": rows, "overall": _level_stats.result()}
		runs.append(level)
		print("[bench] %s: %.1f fps, avg %.1f ms, p95 %.1f, p99 %.1f, hitches %d, gpu %.1f, cpu %.1f" % [level["level"], float(level["overall"]["fps"]), float(level["overall"]["avg_ms"]), float(level["overall"]["p95_ms"]), float(level["overall"]["p99_ms"]), int(level["overall"]["hitches"]), float(level["overall"]["gpu_ms"]), float(level["overall"]["cpu_ms"])])
	_give_back()
	result = BenchmarkReport.make(BenchmarkDevice.info(), BenchmarkDevice.renderer(), started_label, runs, scale, (Time.get_ticks_msec() - wall_start) / 1000.0, thermal_start, BenchmarkDevice.thermal())
	var error := BenchmarkReport.write(result)
	if error != "":
		push_warning("[bench] %s" % error)
	print("[bench] done: %s → %s, %s" % [str(result["recommendation"]["text"]), ProjectSettings.globalize_path(BenchmarkReport.JSON_PATH), ProjectSettings.globalize_path(BenchmarkReport.TEXT_PATH)])
	print(BenchmarkReport.to_text(result))
	running = false
	_show_card()
	finished.emit(result)
	if quit_after:
		main.get_tree().quit(0)


func _fail(why: String) -> void:
	printerr("[bench] stopped: %s" % why)
	running = false
	cancelled = true
	if quit_after:
		main.get_tree().quit(1)


## Takes the camera, the player and the settings the route sets; remembers them for `_give_back`.
func _take_over() -> void:
	var body := main.rig.body
	_saved = {
		"feet": WorldOrigin.to_world(body.global_position), "height": body.global_position.y, "yaw": main.rig.camera.yaw,
		"hour": GameLoop.clock.hour, "rate": GameLoop.clock.hours_per_second, "rain": Weather.raining,
		"build_max": int(main.world.streamer.stats.get("max_build_usec", 0)),
	}
	Weather.set_raining(false, true, false)
	GameLoop.clock.hours_per_second = 0.0
	main.call(&"_set_controls", false)
	_rig_mode = main.rig.process_mode
	main.rig.process_mode = Node.PROCESS_MODE_DISABLED
	camera = Camera3D.new()
	camera.name = "BenchmarkCamera"
	main.world.add_child(camera)
	camera.make_current()
	banner = BenchmarkBanner.new()
	add_child(banner)
	main.state_changed.connect(_on_state)


## Puts back everything `_take_over` took, the player where they stood.
func _give_back() -> void:
	_mode = &"idle"
	if main.state_changed.is_connected(_on_state):
		main.state_changed.disconnect(_on_state)
	_settings.release_hold()
	if _saved.is_empty():
		return
	GameLoop.clock.hour = float(_saved["hour"])
	GameLoop.clock.hours_per_second = float(_saved["rate"])
	Weather.set_raining(bool(_saved["rain"]), true, false)
	var stats := main.world.streamer.stats
	stats["max_build_usec"] = maxi(int(stats.get("max_build_usec", 0)), int(_saved["build_max"]))
	var feet: Vector2 = _saved["feet"]
	WorldOrigin.recentre(feet.x, feet.y)
	main.rig.process_mode = _rig_mode
	main.rig.place(WorldOrigin.to_scene(feet, float(_saved["height"])), float(_saved["yaw"]))
	main.rig.camera.camera.make_current()
	if camera != null:
		camera.queue_free()
		camera = null
	if banner != null:
		banner.queue_free()
		banner = null
	if main.state == &"play":
		main.call(&"_set_controls", true)
	_saved = {}
	running = false


func _on_state(s: StringName) -> void:
	if s == &"title" or s == &"loading" or s == &"failed":
		cancelled = true
		print("[bench] cancelled (left play)")
		_step_reached.emit()


## One segment: go there, wait for its streets, settle, then measure for its game seconds.
func _run_segment(seg: BenchmarkRoute.Segment, level_index: int, level_count: int) -> void:
	_segment = seg
	banner.set_text("Benchmark · %s · %d of %d levels · %s (%d of %d)" % [_settings.preset_name(), level_index + 1, level_count, seg.title, at.y + 1, BenchmarkRoute.segments().size()])
	GameLoop.clock.hour = seg.hour
	var start := BenchmarkRoute.pose(seg, 0.0, scale)
	WorldOrigin.recentre(start.focus.x, start.focus.y)
	_place(start)
	await main.world.wait_ready_around(start.focus, -1.0, READY_STEPS)
	if seg.id == &"platform" and main.railway != null:
		await _platform_ready()
	_steps = 0
	_target = settle_steps
	_mode = &"settle"
	await _step_reached
	if cancelled:
		return
	_stats = BenchmarkStats.new()
	_stats.thermal_start = BenchmarkDevice.thermal()
	_stats.built_start = _built()
	_stats.build_usec_start = _build_usec()
	main.world.streamer.stats["max_build_usec"] = 0
	_steps = 0
	_target = BenchmarkRoute.steps(seg, scale)
	_skip_frame = true
	_mode = &"run"
	await _step_reached
	if cancelled:
		return
	_stats.steps = _steps
	_stats.built_end = _built()
	_stats.build_usec_end = _build_usec()
	_stats.build_max_usec = int(main.world.streamer.stats.get("max_build_usec", 0))
	_stats.counts = main.life.counts() if main.life != null else {}
	_stats.thermal_end = BenchmarkDevice.thermal()


## The platforms build on worker threads after the ground; and a train stands at Egmore (the
## railway clock is moved to its next arrival there, the same every run).
func _platform_ready() -> void:
	var rail := main.railway
	for i in READY_STEPS:
		if rail.stations_view == null or rail.stations_view.shown() > 0:
			break
		await GameLoop.wait_physics_frames(1)
	var line := rail.network.line("beach-tambaram") if rail.network != null else null
	if line == null:
		return
	for i in line.stops.size():
		if line.stops[i].name == _segment.place:
			var wait := line.next_arrival(i, rail.clock)
			if wait > 0.0:
				rail.advance(wait + 4.0)
			return


func _built() -> int:
	return int(main.world.streamer.stats.get("built", 0))


func _build_usec() -> int:
	return int(main.world.streamer.stats.get("total_build_usec", 0))


## The player's body on the path (streaming, traffic and crowds follow it) and the camera.
func _place(p: BenchmarkRoute.Pose) -> void:
	var body := main.rig.body
	body.respawn(WorldOrigin.to_scene(p.focus, p.focus_height + 0.05), p.yaw)
	if camera != null:
		var source := main.rig.camera.camera
		camera.far = source.far
		camera.near = source.near
		camera.fov = source.fov
		var eye := WorldOrigin.to_scene(p.eye, p.eye_height)
		camera.global_position = eye
		camera.look_at(WorldOrigin.to_scene(p.target, p.target_height), Vector3.UP)


func _physics_process(_delta: float) -> void:
	if _mode == &"idle" or _segment == null:
		return
	_place(BenchmarkRoute.pose(_segment, _steps / float(BenchmarkRoute.STEPS_A_SECOND) if _mode == &"run" else 0.0, scale))
	_steps += 1
	if _steps >= _target:
		_mode = &"idle"
		_step_reached.emit()


func _process(_delta: float) -> void:
	var now := Time.get_ticks_usec()
	var ms := (now - _last_usec) / 1000.0
	_last_usec = now
	if _mode != &"run" or _stats == null:
		return
	if _skip_frame:
		# The first frame of a segment, and the first after a pause, began before it.
		_skip_frame = false
		return
	var perf := main.perf
	var r := perf.render_times()
	var tl := perf.timeline
	var scripts := tl.ms(FrameTimeline.Part.PHYSICS_SCRIPTS) + tl.ms(FrameTimeline.Part.SCRIPTS)
	var busy := (tl.last_total - tl.last[FrameTimeline.Part.BETWEEN]) / 1000.0
	var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var video := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED)
	var stream := int(main.world.streamer.stats.get("last_frame_usec", 0))
	for s: BenchmarkStats in [_stats, _level_stats]:
		s.add(ms, r.y, scripts + r.x, busy, draws, prims, video, stream)


func _notification(what: int) -> void:
	if what == NOTIFICATION_UNPAUSED:
		_skip_frame = true


func _show_card() -> void:
	if card == null:
		card = BenchmarkCard.new()
		add_child(card)
		card.close_requested.connect(func() -> void: card.visible = false)
		card.again_requested.connect(func() -> void:
			card.visible = false
			if not running:
				cancelled = false
				started += 1
				run.call_deferred())
	card.show_result(result)


func _exit_tree() -> void:
	if current == self:
		current = null
	if running:
		_give_back()
