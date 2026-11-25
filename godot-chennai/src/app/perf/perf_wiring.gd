class_name PerfWiring
extends Node
## Quality presets, the performance overlay, the perf log and the feature switches, wired into
## the game (decisions G-250…G-256). `Main` adds one in `_ready` (`PerfWiring.attach(self)`):
## - applies the preset (`QualitySettings`) live to the engine (`QualityApplier`), the streamer,
##   the environment, the cameras, the traffic and the title's rain, and again whenever a system
##   appears (state changes) or the player picks another preset;
## - keeps the frame times (`FrameStats`), writes a plain-text log to `user://perf.log` every
##   LOG_EVERY seconds (also printed as "[perf]" lines, logcat tag godot) and a one-line summary
##   on the pause menu, which copies the whole log when pressed;
## - shows the overlay (`PerfOverlay`) on a three-finger tap or the Settings row; while hidden it
##   reads no monitors and builds no text.

const LOG_PATH := "user://perf.log"
const LOG_EVERY := 10.0
## Log lines kept in the file (15 minutes).
const LOG_KEEP := 90
const OVERLAY_EVERY := 0.25

var main: Main
var settings: QualitySettings
var stats := FrameStats.new()
var overlay: PerfOverlay
var switches: FeatureSwitches
## Lines of the log after the header, oldest first.
var log_lines := PackedStringArray()
## The one-line summary on the pause menu.
var summary: String = "Perf: measuring…"
var _last_usec: int = 0
var _last_physics: int = 0
var _log_clock: float = 0.0
var _overlay_clock: float = 0.0
var _window_sum: float = 0.0
var _window_n: int = 0
var _window_worst: float = 0.0
## Averages per log window, for the thermal drift line.
var _window_avgs := PackedFloat32Array()
var _started_usec: int = 0
var _world_hooked: CityWorld = null
var _measuring_viewport: bool = false
## Frames slower than HITCH_MS in play since the start (whole frames, edge to edge, from the
## timeline), and what the last one was made of.
const HITCH_MS := 50.0
var hitches: int = 0
var last_hitch: String = ""
## Main-thread script time per frame (process + all physics steps), smoothed, ms.
var scripts_ms: float = 0.0
var _probe_first: _Probe = null
var _probe_last: _Probe = null
## Where each frame's time went (G-340): physics engine, scripts, deferred calls and frees,
## render, the time between frames; and what changed in it (nodes, bodies, uploads, pipelines).
var timeline := FrameTimeline.new()
## Counters at the last frame edge and their change over the last complete frame.
var _counters := PackedInt64Array([0, 0, 0, 0, 0])
var frame_delta := PackedInt64Array([0, 0, 0, 0, 0])
## The last few hitch lines (newest last) and how many hitches each part led.
const HITCH_KEEP := 8
var hitch_lines := PackedStringArray()
var hitch_causes := PackedInt32Array()
## The main thread's time on a core and waiting for one over the last complete frame (µs, from
## the kernel; -1 where it cannot be read), and the hitches that were mostly waiting for a core.
var thread_clock: ThreadClock = null
var frame_core := Vector2i(-1, -1)
var hitches_waiting: int = 0


## Marks the start (first) or end (last) of the frame's script callbacks.
class _Probe:
	extends Node
	var first: bool = true
	var other: _Probe = null
	var timeline: FrameTimeline = null
	var on_close: Callable
	var process_start: int = 0
	var physics_start: int = 0
	var process_usec: int = 0
	var physics_usec: int = 0
	var physics_n: int = 0

	func _process(_d: float) -> void:
		var now := Time.get_ticks_usec()
		if first:
			process_start = now
			if timeline.process_start(now):
				on_close.call()
		elif other != null:
			process_usec = now - other.process_start
			timeline.process_end(now)
			_after_process.call_deferred()

	func _physics_process(_d: float) -> void:
		var now := Time.get_ticks_usec()
		if first:
			physics_start = now
			if timeline.physics_start(now):
				on_close.call()
		elif other != null:
			physics_usec += now - other.physics_start
			physics_n += 1
			timeline.physics_end(now)
			_after_physics.call_deferred()

	func _after_process() -> void:
		timeline.deferred(Time.get_ticks_usec())

	func _after_physics() -> void:
		timeline.physics_deferred(Time.get_ticks_usec())


static func attach(m: Main) -> PerfWiring:
	var w := PerfWiring.new()
	w.name = "PerfWiring"
	w.main = m
	w.process_mode = Node.PROCESS_MODE_ALWAYS
	w.settings = QualitySettings.shared()
	return w


func _ready() -> void:
	_started_usec = Time.get_ticks_usec()
	_last_usec = _started_usec
	overlay = PerfOverlay.new()
	add_child(overlay)
	switches = FeatureSwitches.make(main, settings)
	switches.frame_ms = func() -> float: return stats.average()
	add_child(switches)
	overlay.toggle_requested.connect(DebugSettings.toggle)
	overlay.switch_pressed.connect(func(id: String) -> void:
		switches.toggle(id)
		_refresh_switches())
	overlay.safe_mode_pressed.connect(func() -> void:
		switches.safe_mode()
		_refresh_switches())
	overlay.all_on_pressed.connect(func() -> void:
		switches.all_on()
		_refresh_switches())
	settings.changed.connect(_on_settings)
	# The one on/off switch of the overlay is `DebugSettings` (G-291): pause row, five corner taps.
	DebugSettings.shared().changed.connect(_on_settings)
	# The city reads its road detail level when it is set up, before any state change: set it the
	# moment the city node joins Main.
	main.child_entered_tree.connect(func(n: Node) -> void:
		if n is CityWorld:
			set_road_extras(n as CityWorld, settings.preset))
	main.state_changed.connect(func(_s: StringName) -> void:
		apply()
		_show_overlay(DebugSettings.shared().perf_overlay))
	_add_rows()
	_set_viewport_measure(true)
	_add_probes()
	apply()
	_show_overlay(DebugSettings.shared().perf_overlay)
	if settings.auto:
		settings.refresh_auto()
	print("[perf] %s" % _device_line())
	print("[perf] quality %s (%s)" % [settings.preset_name(), settings.reason if settings.auto else "chosen in Settings"])


func _add_rows() -> void:
	for host: Object in [main.pause_menu, main.title]:
		if host == null:
			continue
		host.call(&"add_setting", &"Quality", func() -> String: return "%s\n%s" % [settings.row_label(), settings.explain()], func() -> void: settings.next_preset())
		host.call(&"add_setting", &"PerfOverlay", DebugSettings.label, DebugSettings.toggle)
	if main.pause_menu != null:
		main.pause_menu.add_setting(&"PerfSummary", func() -> String: return summary + " (tap: copy log)", copy_log)


func _on_settings() -> void:
	apply()
	_show_overlay(DebugSettings.shared().perf_overlay)
	if main.pause_menu != null:
		main.pause_menu.refresh()
	if main.title != null:
		main.title.refresh_settings()


## The shader warm-up at the end of loading (G-346): its result, for tests and the log.
var warmup: Dictionary = {}


func warm_up() -> void:
	# CHENNAI_NO_WARMUP=1 skips it, to measure what it saves.
	if main.world == null or OS.get_environment("CHENNAI_NO_WARMUP") == "1":
		return
	# Play's HUD, controls and mission HUD draw for those frames too (under the loading screen):
	# their canvas pipelines were the rest of the compiles at the first play frame.
	var hud_was := main.hud.visible
	var ui_was := main.play_wiring != null and main.play_wiring.ui.visible
	var ml := main.find_child("MissionsLayer", false, false) as MissionsLayer
	var ml_hud_was := ml != null and ml.hud != null and ml.hud.visible
	main.hud.visible = true
	if main.play_wiring != null:
		main.play_wiring.ui.visible = true
	if ml != null and ml.hud != null:
		ml.hud.visible = true
	warmup = await ShaderWarmup.run(main.world, main.life)
	main.hud.visible = hud_was
	if main.play_wiring != null:
		main.play_wiring.ui.visible = ui_was
	if ml != null and ml.hud != null:
		ml.hud.visible = ml_hud_was
	print("[perf] shader warm-up: %d meshes, %d pipelines compiled, %.0f ms" % [int(warmup["meshes"]), int(warmup["pipelines"]), int(warmup["usec"]) / 1000.0])


## Whether the title may tour a live faraway spot (the feature switch; read by Main at start).
static func title_tour_allowed() -> bool:
	return QualitySettings.shared().is_on("title_life")


## Applies the preset and the switches to every system that exists now.
func apply() -> void:
	var v := settings.current()
	QualityApplier.apply_viewport(get_viewport(), v)
	QualityApplier.apply_engine(v)
	TreeQuality.apply(v)
	if main.world != null and main.world.streamer != null and main.world.streamer.kit != null:
		# Chunks built from now on (draw-call caps are chosen when a chunk is planned).
		main.world.streamer.kit.tree_species = int(v["tree_species"])
		main.world.streamer.kit.under_species = int(v["under_species"])
	var world := main.world
	if world != null:
		set_road_extras(world, settings.preset)
		QualityApplier.apply_streamer(world.streamer, v)
		if world.materials != null:
			world.materials.ground.set_shader_parameter(&"detail", bool(v["ground_detail"]) and settings.is_on("ground_detail"))
			world.materials.water.set_shader_parameter(&"animated", bool(v["water_detail"]) and settings.is_on("water_detail"))
			QualityApplier.apply_materials(world.materials, v)
			world.materials.trees.set_shader_parameter(&"sway", 1.0 if TreeQuality.sway else 0.0)
		_scale_landmarks(world, float(v["landmark_range"]))
		if _world_hooked != world and world.streamer != null:
			_world_hooked = world
			world.streamer.chunk_shown.connect(switches.on_chunk_shown)
			world.streamer.chunk_shown.connect(_on_chunk_shown)
		for cell in world.streamer.shown_cells():
			_on_chunk_shown(cell)
	PersonView.animate_reach = float(v["animate_reach"])
	PersonView.shadow_near = float(v["npc_shadow"])
	var pw := main.play_wiring
	if pw != null and pw.parked != null:
		pw.parked.spawn_reach = float(v["parked_reach"])
		pw.parked.free_reach = float(v["parked_reach"]) * 1.55
	if pw != null and pw.environment != null:
		var env := pw.environment.environment
		QualityApplier.apply_environment(env, v)
		QualityApplier.apply_sun(env.sun, v, settings.is_on("shadows"))
	if main.rig != null and main.rig.camera != null:
		QualityApplier.apply_camera(main.rig.camera.camera, v)
	var life := main.life
	if life != null:
		life.figure_cap = int(v["figures"])
		life.driver_reach = float(v["driver_reach"])
		life.rider_reach = float(v["rider_reach"])
		life.traffic_cap = int(v["traffic"])
		life.walker_cap = int(v["walkers"])
		life.ai_patience = int(v["ai_patience"])
		life.refresh_caps()
	var tw := main.title_wiring
	if tw != null:
		for i in tw.rain_layers.size():
			tw.rain_layers[i].density = 1.0 if i < int(v["title_rain_layers"]) else 0.0
		if tw.camera != null:
			tw.camera.far = minf(900.0, float(v["camera_far"]) * 1.5)
	switches.apply_all()


## Optional road detail follows the preset (G-317 on agent/godot-roads: 0 Low, 1 Medium, 2 High,
## the same numbers as the presets): on the city before it sets up, and on the streamer's chunk kit
## for chunks built from now on (chunks already built keep theirs). Set by name so this branch
## builds before and after that one is merged; does nothing where the property does not exist.
static func set_road_extras(world: CityWorld, level: int) -> void:
	if &"road_extras" in world:
		world.set(&"road_extras", level)
	if world.streamer != null and world.streamer.kit != null and &"road_extras" in world.streamer.kit:
		world.streamer.kit.set(&"road_extras", level)


## Street objects cast shadows only on High (G-258): each is one mesh per chunk, so any of it
## inside the shadow's reach drew the whole chunk's worth into the shadow map. Trees are not here:
## only the LOD 0 trees near the player cast, and only on High (`TreeQuality`, G-385).
const PROP_LAYERS: PackedStringArray = ["Objects"]


func _on_chunk_shown(cell: Vector2i) -> void:
	var b := main.world.streamer.build_of(cell)
	if b == null or b.view == null:
		return
	var on := bool(settings.current()["prop_shadows"])
	var mode := GeometryInstance3D.SHADOW_CASTING_SETTING_ON if on else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	for holder: Node in [b.view, b.view.get_node_or_null(^"Near")]:
		if holder == null:
			continue
		for n in PROP_LAYERS:
			var g := holder.get_node_or_null(NodePath(n)) as GeometryInstance3D
			if g != null:
				g.cast_shadow = mode


## Landmark LOD ranges scaled from their built values (kept in metadata the first time).
static func _scale_landmarks(world: CityWorld, k: float) -> void:
	var holder := world.get_node_or_null(^"Landmarks")
	if holder == null:
		return
	for n in holder.find_children("*", "GeometryInstance3D", true, false):
		var g := n as GeometryInstance3D
		if not g.has_meta(&"range_end"):
			g.set_meta(&"range_end", g.visibility_range_end)
			g.set_meta(&"range_begin", g.visibility_range_begin)
		var end: float = g.get_meta(&"range_end")
		var begin: float = g.get_meta(&"range_begin")
		g.visibility_range_end = end * k if end > 0.0 else 0.0
		g.visibility_range_begin = begin * k


var _overlay_wanted: bool = false


## The overlay is a debug tool (owner, G-341): it stays out from under a menu or the Jobs list (G-350). The pause
## and title menus also draw above it (CanvasLayer 8 over 7); the Jobs dialog is on a lower layer.
func _modal_open() -> bool:
	if main.state == &"paused":
		return true
	if main.pause_menu != null and main.pause_menu.is_open():
		return true
	var ml := main.find_child("MissionsLayer", false, false) as MissionsLayer
	return ml != null and ml.hud != null and ml.hud.dialog_open()


func _show_overlay(on: bool) -> void:
	_overlay_wanted = on
	overlay.visible = on and not _modal_open()
	if on:
		_refresh_switches()
		_overlay_clock = OVERLAY_EVERY


## Two nodes that run first and last in every frame's process and physics callbacks: the time
## between them is the game's script work on the main thread (a few µs a frame to keep).
func _add_probes() -> void:
	if _probe_first == null:
		hitch_causes.resize(FrameTimeline.PARTS)
		thread_clock = ThreadClock.new()
		_probe_first = _Probe.new()
		_probe_first.name = "PerfProbeFirst"
		_probe_first.process_priority = -1000000
		_probe_first.process_physics_priority = -1000000
		_probe_last = _Probe.new()
		_probe_last.name = "PerfProbeLast"
		_probe_last.first = false
		_probe_last.other = _probe_first
		_probe_last.process_priority = 1000000
		_probe_last.process_physics_priority = 1000000
		_probe_first.process_mode = Node.PROCESS_MODE_ALWAYS
		_probe_last.process_mode = Node.PROCESS_MODE_ALWAYS
		for p: _Probe in [_probe_first, _probe_last]:
			p.timeline = timeline
			p.on_close = _frame_closed
		add_child(_probe_first)
		add_child(_probe_last)
		RenderingServer.frame_pre_draw.connect(_pre_draw)
		RenderingServer.frame_post_draw.connect(_post_draw)
		_frame_closed()


func _pre_draw() -> void:
	timeline.pre_draw(Time.get_ticks_usec())


func _post_draw() -> void:
	timeline.post_draw(Time.get_ticks_usec())


## Counters read at every frame edge (a few µs): nodes, objects, pipeline compilations (Vulkan
## only; the Compatibility renderer compiles shaders without counting), mesh and texture memory.
enum Counter { NODES, OBJECTS, PIPELINES, BUFFERS, TEXTURES }


func _frame_closed() -> void:
	var now := PackedInt64Array([
		int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)),
		int(Performance.get_monitor(Performance.OBJECT_COUNT)),
		int(Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_CANVAS) + Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_MESH)
			+ Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SURFACE) + Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_DRAW)
			+ Performance.get_monitor(Performance.PIPELINE_COMPILATIONS_SPECIALIZATION)),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_BUFFER_MEM_USED),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TEXTURE_MEM_USED),
	])
	for i in now.size():
		frame_delta[i] = now[i] - _counters[i]
	_counters = now
	if thread_clock != null:
		frame_core = thread_clock.since_last()
	if timeline.frames > 0 and timeline.last_total > int(HITCH_MS * 1000.0) and main != null and main.state == &"play":
		_note_hitch()


func _set_viewport_measure(on: bool) -> void:
	_measuring_viewport = on
	RenderingServer.viewport_set_measure_render_time(get_viewport().get_viewport_rid(), on)


func _process(_delta: float) -> void:
	var now := Time.get_ticks_usec()
	var ms := (now - _last_usec) / 1000.0
	var dt := ms / 1000.0
	_last_usec = now
	var physics := Engine.get_physics_frames()
	var steps := physics - _last_physics
	_last_physics = physics
	stats.add(ms, steps)
	if _probe_last != null:
		var frame_scripts := (_probe_last.process_usec + _probe_last.physics_usec) / 1000.0
		_probe_last.physics_usec = 0
		_probe_last.physics_n = 0
		scripts_ms = lerpf(scripts_ms, frame_scripts, 0.05)
	_window_sum += ms
	_window_n += 1
	_window_worst = maxf(_window_worst, ms)
	_watch_auto(dt, ms)
	if switches.measuring():
		switches.sample(dt, ms)
		if overlay.visible and not switches.measuring():
			_refresh_switches()
	_log_clock += dt
	if _log_clock >= LOG_EVERY:
		_log_clock = 0.0
		write_log()
	if _overlay_wanted:
		overlay.visible = not _modal_open()
	if overlay.visible:
		_overlay_clock += dt
		if _overlay_clock >= OVERLAY_EVERY:
			_overlay_clock = 0.0
			overlay.set_text(overlay_text())
			if switches.last_line != "" and overlay.is_panel_open():
				_refresh_switches()


## Auto (G-251): after a short warm-up in play, if the frame rate stays under
## `QualitySettings.AUTO_MIN_FPS` for `AUTO_WINDOW` seconds, one level down, with a toast. The
## first window after the warm-up is shorter (`AUTO_FIRST_WINDOW`): a quick frame-time check that
## a level the GPU table guessed wrong is left within seconds of play starting (G-341).
const AUTO_WARMUP := 5.0
const AUTO_FIRST_WINDOW := 4.0
var _auto_first: bool = true
var _auto_clock: float = 0.0
var _auto_sum: float = 0.0
var _auto_n: int = 0
var _auto_play: float = 0.0


func _watch_auto(dt: float, ms: float) -> void:
	if not settings.auto or main.state != &"play" or settings.preset <= QualitySettings.LOW:
		_auto_play = 0.0
		_auto_clock = 0.0
		_auto_sum = 0.0
		_auto_n = 0
		_auto_first = true
		return
	_auto_play += dt
	if _auto_play < AUTO_WARMUP:
		return
	_auto_clock += dt
	_auto_sum += ms
	_auto_n += 1
	if _auto_clock < (AUTO_FIRST_WINDOW if _auto_first else QualitySettings.AUTO_WINDOW):
		return
	_auto_first = false
	var fps := 1000.0 * _auto_n / maxf(_auto_sum, 0.001)
	_auto_clock = 0.0
	_auto_sum = 0.0
	_auto_n = 0
	if fps < QualitySettings.AUTO_MIN_FPS and settings.drop_auto():
		_auto_play = 0.0
		_auto_first = true
		_toast("Graphics lowered to %s" % settings.preset_name(), "It ran at %d fps. Change it in Settings → Graphics." % roundi(fps))


func _toast(title: String, detail: String) -> void:
	print("[perf] %s: %s" % [title, detail])
	var layer := main.find_child("MissionsLayer", false, false) as MissionsLayer
	if layer != null and layer.hud != null:
		layer.hud.toast(title, detail, 4.0)


## A frame over HITCH_MS just closed: count it, tally its largest part, keep its line.
func _note_hitch() -> void:
	hitches += 1
	hitch_causes[timeline.largest()] += 1
	if frame_core.y * 2 > timeline.last_total:
		hitches_waiting += 1
	last_hitch = _hitch_line()
	hitch_lines.append(last_hitch)
	if hitch_lines.size() > HITCH_KEEP:
		hitch_lines.remove_at(0)


## What a slow frame was made of (G-340): the timeline's parts, largest first, the streamer's and
## the traffic's share of the scripts, what changed in the frame (nodes and objects made or
## freed, pipelines compiled, mesh and texture memory uploaded), the bodies in the physics
## space and the renderer's own CPU and GPU time.
func _hitch_line() -> String:
	var ms := timeline.last_total / 1000.0
	var scripts := timeline.ms(FrameTimeline.Part.PHYSICS_SCRIPTS) + timeline.ms(FrameTimeline.Part.SCRIPTS)
	var r := render_times()
	var stream := ""
	if main.world != null and main.world.streamer != null:
		var st := main.world.streamer.stats
		stream = "streaming %.1f (frees %d %.1f ms, bodies %d %.1f ms, views %d %.1f ms)" % [
			int(st.get("last_frame_usec", 0)) / 1000.0, int(st.get("last_free_n", 0)), int(st.get("last_free_usec", 0)) / 1000.0,
			int(st.get("last_body_n", 0)), int(st.get("last_body_usec", 0)) / 1000.0, int(st.get("last_view_n", 0)), int(st.get("last_view_usec", 0)) / 1000.0]
	var life := Vector2.ZERO
	if main.life != null:
		life = Vector2(int(main.life.stats.get("sync", 0)), int(main.life.stats.get("wait", 0))) / 1000.0
	var parts_line := timeline.breakdown()
	var core := "main thread: core time not readable"
	if frame_core.x >= 0:
		core = "main thread: on a core %.1f, waiting for a core %.1f, blocked or asleep %.1f" % [frame_core.x / 1000.0, frame_core.y / 1000.0, maxf(0.0, (timeline.last_total - frame_core.x - frame_core.y) / 1000.0)]
	return "hitch %.0f ms at t=%ds: %s | %s | scripts %.1f: %s, traffic %.1f (waiting for the AI step %.1f) | nodes %+d, objects %+d, pipelines %+d, meshes %+.1f MB, textures %+.1f MB | physics %d active bodies, %d pairs, steps %d | render cpu %.1f, gpu %.1f" % [
		ms, roundi((Time.get_ticks_usec() - _started_usec) / 1e6), parts_line, core, scripts, stream, life.x + life.y, life.y,
		frame_delta[Counter.NODES], frame_delta[Counter.OBJECTS], frame_delta[Counter.PIPELINES],
		frame_delta[Counter.BUFFERS] / 1048576.0, frame_delta[Counter.TEXTURES] / 1048576.0,
		int(Performance.get_monitor(Performance.PHYSICS_3D_ACTIVE_OBJECTS)), int(Performance.get_monitor(Performance.PHYSICS_3D_COLLISION_PAIRS)),
		timeline.last_steps, r.x, r.y]


## "physics engine 3, render 1" over every hitch so far (the part that took most of each).
func hitch_causes_line() -> String:
	var out := PackedStringArray()
	for i in FrameTimeline.PARTS:
		if hitch_causes[i] > 0:
			out.append("%s %d" % [FrameTimeline.LABELS[i], hitch_causes[i]])
	var waiting := " (%d mostly waiting for a core: other threads or apps)" % hitches_waiting if hitches_waiting > 0 else ""
	return "hitches led by: " + (", ".join(out) if not out.is_empty() else "none yet") + waiting


func _refresh_switches() -> void:
	overlay.set_switches(switches.rows(), "%s\n%s" % [switches.last_line, switches.ranked()])


## The renderer's own CPU and GPU time for the frame (ms; GPU 0 when it cannot measure).
func render_times() -> Vector2:
	var rid := get_viewport().get_viewport_rid()
	return Vector2(RenderingServer.viewport_get_measured_render_time_cpu(rid), RenderingServer.viewport_get_measured_render_time_gpu(rid))


## The verdict's inputs (ms): the scripts' main-thread time per frame (process and every physics
## step), the renderer's CPU and the GPU time; plus the engine's own worst process and physics
## step of the last second (`Performance`: maxima, not averages).
func parts() -> Dictionary:
	var r := render_times()
	return {
		"scripts": scripts_ms, "render_cpu": r.x, "gpu": r.y, "steps": stats.physics_steps,
		"process_max": Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0,
		"physics_max": Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0,
		"cpu": scripts_ms + r.x,
	}


func verdict() -> String:
	var p := parts()
	return FrameStats.verdict(stats.average(), float(p["cpu"]), float(p["gpu"]))


func _device_line() -> String:
	var mem: Variant = OS.get_memory_info().get("physical", 0)
	var size := DisplayServer.screen_get_size()
	var vp := get_viewport().get_visible_rect().size
	return "GPU %s (%s, %s) · %s %s · API %s · CPU %s x%d · memory %.1f GiB · screen %dx%d" % [
		RenderingServer.get_video_adapter_name(), RenderingServer.get_video_adapter_vendor(),
		_adapter_type(), RenderingServer.get_current_rendering_method(),
		RenderingServer.get_current_rendering_driver_name(), RenderingServer.get_video_adapter_api_version(),
		OS.get_processor_name(), OS.get_processor_count(), float(mem) / 1073741824.0 if (mem is int or mem is float) else 0.0,
		maxi(size.x, int(vp.x)), maxi(size.y, int(vp.y))]


static func _adapter_type() -> String:
	match RenderingServer.get_video_adapter_type():
		RenderingDevice.DEVICE_TYPE_INTEGRATED_GPU:
			return "integrated"
		RenderingDevice.DEVICE_TYPE_DISCRETE_GPU:
			return "discrete"
		RenderingDevice.DEVICE_TYPE_VIRTUAL_GPU:
			return "virtual"
		RenderingDevice.DEVICE_TYPE_CPU:
			return "CPU (software)"
	return "other"


## Warnings worth shouting: software rendering, or the OpenGL fallback after Vulkan failed.
static func warnings() -> PackedStringArray:
	var out := PackedStringArray()
	var gpu := RenderingServer.get_video_adapter_name()
	if QualitySettings.is_software(gpu) or RenderingServer.get_video_adapter_type() == RenderingDevice.DEVICE_TYPE_CPU:
		out.append("WARNING: software renderer (%s): the GPU is not used" % gpu)
	var wanted := str(ProjectSettings.get_setting("rendering/renderer/rendering_method.mobile", "mobile"))
	var forced := " ".join(OS.get_cmdline_args()).contains("gl_compatibility")
	if RenderingServer.get_current_rendering_method() == "gl_compatibility" and wanted != "gl_compatibility" and not forced and OS.has_feature("mobile"):
		out.append("WARNING: Vulkan failed, OpenGL fallback in use")
	return out


func _scaled_size() -> Vector2i:
	var vp := get_viewport()
	var size := vp.get_visible_rect().size
	if vp is Window:
		size = Vector2((vp as Window).size)
	return Vector2i(roundi(size.x * vp.scaling_3d_scale), roundi(size.y * vp.scaling_3d_scale))


func _counts() -> Dictionary:
	var out := {}
	if main.life != null:
		out = main.life.counts()
		var ls := main.life.stats
		out["ai_ms"] = int(ls.get("step", 0)) / 1000.0
		out["ai_wait_ms"] = int(ls.get("wait", 0)) / 1000.0
		out["ai_late"] = int(ls.get("late", 0))
	if main.world != null and main.world.streamer != null:
		var s := main.world.streamer
		var q := s.queue_counts()
		out["chunks_building"] = q.x
		out["chunks_adding"] = q.y
		out["worker_jobs"] = q.z
		out["chunk_main_ms"] = int(s.stats.get("last_frame_usec", 0)) / 1000.0
		out["chunk_build_ms"] = int(s.stats.get("max_build_usec", 0)) / 1000.0
		out["chunks_built"] = int(s.stats.get("built", 0))
	return out


## The overlay's text (also the log's detail).
func overlay_text() -> String:
	var p := parts()
	var c := _counts()
	var v := settings.current()
	var lines := PackedStringArray()
	for w in warnings():
		lines.append(w)
	lines.append("FPS %.0f · frame avg %.1f ms · worst %.1f ms (last %d) · hitches >50 ms: %d" % [stats.fps(), stats.average(), stats.worst(), stats.count(), hitches])
	if last_hitch != "":
		lines.append(last_hitch)
		lines.append(hitch_causes_line())
	lines.append("CPU: scripts %.1f ms/frame · render %.1f · physics steps %d (max %d) · worst in 1 s: process %.1f, physics step %.1f" % [p["scripts"], p["render_cpu"], p["steps"], stats.max_physics_steps, p["process_max"], p["physics_max"]])
	lines.append("GPU: %s ms · verdict: %s" % [("%.1f" % p["gpu"]) if float(p["gpu"]) > 0.0 else "n/a", FrameStats.verdict(stats.average(), float(p["cpu"]), float(p["gpu"]))])
	lines.append("draws %d · primitives %dk · objects %d · video memory %d MB · textures %d MB" % [
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME) / 1000,
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_VIDEO_MEM_USED) / 1048576,
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TEXTURE_MEM_USED) / 1048576])
	lines.append("AI step %.1f ms (wait %.1f, late %d) · traffic %s · walkers %s · crowd %s · figures %s" % [c.get("ai_ms", 0.0), c.get("ai_wait_ms", 0.0), c.get("ai_late", 0), c.get("vehicles", "-"), c.get("walkers", "-"), c.get("crowd", "-"), c.get("figures", "-")])
	lines.append("chunks: building %s · to add %s · jobs %s · main %.1f ms · slowest build %.0f ms · built %s · tasks %d" % [c.get("chunks_building", "-"), c.get("chunks_adding", "-"), c.get("worker_jobs", "-"), c.get("chunk_main_ms", 0.0), c.get("chunk_build_ms", 0.0), c.get("chunks_built", "-"), BackgroundTask.running])
	var sz := _scaled_size()
	lines.append("%s · 3D %dx%d (%.0f%% %s) · MSAA %s · shadows %s · max fps %s" % [settings.overlay_label(), sz.x, sz.y, float(v["scale"]) * 100.0, "FSR" if get_viewport().scaling_3d_mode == Viewport.SCALING_3D_MODE_FSR else "bilinear", "2x" if int(v["msaa"]) > 0 else "off", "%d m" % int(v["shadow_distance"]) if bool(v["shadows"]) and settings.is_on("shadows") else "off", str(v["max_fps"]) if int(v["max_fps"]) > 0 else "vsync"])
	lines.append("%s %s · %s" % [RenderingServer.get_current_rendering_method(), RenderingServer.get_current_rendering_driver_name(), RenderingServer.get_video_adapter_name()])
	var off := PackedStringArray()
	for id in FeatureSwitches.ids():
		if not settings.is_on(id):
			off.append(id)
	if not off.is_empty():
		lines.append("switched off: " + ", ".join(off))
	if switches.last_line != "":
		lines.append(switches.last_line)
	return "\n".join(lines)


func _log_header() -> String:
	var lines := PackedStringArray()
	lines.append("Chennai perf log (copy all of this back)")
	lines.append("version %s · %s" % [ProjectSettings.get_setting("application/config/version", "?"), Engine.get_version_info().string])
	lines.append(_device_line())
	for w in warnings():
		lines.append(w)
	var v := settings.current()
	var sz := _scaled_size()
	lines.append("quality %s (%s) · 3D %dx%d · scale %.2f %s · MSAA %s · shadows %s · max fps %s · physics steps %d · workers %d" % [settings.preset_name(), settings.reason if settings.auto else "chosen in Settings", sz.x, sz.y, float(v["scale"]), "FSR" if get_viewport().scaling_3d_mode == Viewport.SCALING_3D_MODE_FSR else "bilinear", "2x" if int(v["msaa"]) > 0 else "off", "%d m" % int(v["shadow_distance"]) if bool(v["shadows"]) else "off", v["max_fps"], v["physics_steps"], v["workers"]])
	var off := PackedStringArray()
	for id in FeatureSwitches.ids():
		if not settings.is_on(id):
			off.append(id)
	lines.append("switched off: %s" % (", ".join(off) if not off.is_empty() else "none"))
	if not switches.costs.is_empty():
		lines.append(switches.ranked())
	lines.append("time state | fps avg-ms worst-ms | cpu: scripts render-cpu steps | gpu | verdict | draws prims | ai-ms traffic walkers | chunks building/adding/jobs")
	return "\n".join(lines)


func _log_line() -> String:
	var p := parts()
	var c := _counts()
	var avg := _window_sum / maxf(1.0, float(_window_n))
	return "t=%ds %s | %.1f %.1f %.1f | %.1f %.1f x%d | %s | %s | %d %dk | %.1f %s %s | b%s a%s j%s" % [
		roundi((Time.get_ticks_usec() - _started_usec) / 1e6), main.state, 1000.0 / maxf(avg, 0.001), avg, _window_worst,
		p["scripts"], p["render_cpu"], p["steps"], ("%.1f" % p["gpu"]) if float(p["gpu"]) > 0.0 else "n/a",
		FrameStats.verdict(avg, float(p["cpu"]), float(p["gpu"])),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME),
		RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME) / 1000,
		c.get("ai_ms", 0.0), c.get("vehicles", "-"), c.get("walkers", "-"),
		c.get("chunks_building", "-"), c.get("chunks_adding", "-"), c.get("worker_jobs", "-")]


## Frame-time drift over the run (the platform exposes no thermal state to the game): the first
## minute against the last; a phone that throttles gets slower at the same place.
func drift_line() -> String:
	var n := _window_avgs.size()
	if n < 12:
		return "drift: under 2 minutes logged"
	var first := 0.0
	var last := 0.0
	for i in 6:
		first += _window_avgs[i] / 6.0
		last += _window_avgs[n - 1 - i] / 6.0
	var change := (last - first) / maxf(first, 0.001) * 100.0
	return "drift: first minute %.1f ms, last minute %.1f ms (%+.0f%%)%s" % [first, last, change, ": possibly thermal throttling" if change > 25.0 else ""]


func write_log() -> void:
	var avg := _window_sum / maxf(1.0, float(_window_n))
	_window_avgs.append(avg)
	var line := _log_line()
	log_lines.append(line)
	if log_lines.size() > LOG_KEEP:
		log_lines.remove_at(0)
	summary = "Perf: %.0f fps · worst %.0f ms · %s · %s" % [1000.0 / maxf(avg, 0.001), _window_worst, FrameStats.verdict(avg, float(parts()["cpu"]), float(parts()["gpu"])).split(" (")[0], settings.preset_name()]
	_window_sum = 0.0
	_window_n = 0
	_window_worst = 0.0
	print("[perf] " + line)
	var f := FileAccess.open(LOG_PATH, FileAccess.WRITE)
	if f != null:
		f.store_string(log_text())
		f.close()


func log_text() -> String:
	return "%s\n%s\n%s\nhitches over 50 ms in play: %d · %s\n%s\n" % [_log_header(), "\n".join(log_lines), drift_line(), hitches, hitch_causes_line(), "\n".join(hitch_lines)]


## The pause menu's summary row: the whole log to the clipboard (and to logcat).
func copy_log() -> void:
	var text := log_text()
	DisplayServer.clipboard_set(text)
	print("[perf] log copied:\n" + text)
	summary = "Perf log copied"


func _exit_tree() -> void:
	if _measuring_viewport and is_inside_tree():
		_set_viewport_measure(false)
	if RenderingServer.frame_pre_draw.is_connected(_pre_draw):
		RenderingServer.frame_pre_draw.disconnect(_pre_draw)
		RenderingServer.frame_post_draw.disconnect(_post_draw)
