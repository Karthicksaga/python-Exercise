extends SceneTree
## Measures the streamed city round a place for the infrastructure work (decisions G-150…):
## draw calls, primitives and objects after a full fill, then the main-thread streaming cost
## while the focus moves along a line through the place at a steady speed (game frames, not
## wall clock: each frame moves the focus `speed / 60` metres). Run under xvfb with the
## Compatibility renderer for the render numbers:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/infra_measure.gd -- --at=-1018,8707,0 --run=1600 --speed=20
##
## Prints one "infra_measure …" line: render counts, chunk-layer triangles of the chunks round
## the place, and the streamer's max main-thread frame and step times during the run.

const CITY_PATH := "res://src/game_world/city/city_world.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var at := Vector2(-1018.0, 8707.0)
	var heading := 0.0
	var run := 1600.0
	var speed := 20.0
	var view := "9,3.2"
	var out := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--at="):
			var p := arg.trim_prefix("--at=").split(",")
			at = Vector2(float(p[0]), float(p[1]))
			heading = float(p[2]) if p.size() > 2 else 0.0
		elif arg.begins_with("--run="):
			run = float(arg.trim_prefix("--run="))
		elif arg.begins_with("--speed="):
			speed = float(arg.trim_prefix("--speed="))
		elif arg.begins_with("--view="):
			view = arg.trim_prefix("--view=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var source := RegionalWorldSource.new()
	var err := source.open()
	if err != "":
		printerr(err)
		quit(1)
		return
	var city: Node = (load(CITY_PATH) as PackedScene).instantiate()
	root.add_child(city)
	await city.call("setup", source)
	var vp := view.split(",")
	city.call("look_at_world", at, heading, float(vp[0]), float(vp[1]))
	# Untyped access: a typed reference to the streamer would compile it before the autoloads
	# exist in --script mode (as city_shot.gd does).
	var streamer: Node = city.get("streamer")
	streamer.call("fill_now")
	await city.call("wait_ready_around", at)
	for i in 10:
		await process_frame
	var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var objects := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	if out != "":
		root.get_texture().get_image().save_png(out)
	# Layer triangles and surfaces of the chunks within 260 m.
	var layers: Dictionary[String, int] = {}
	var surfaces := 0
	var max_build := 0
	for cell: Vector2i in streamer.call("wanted", at):
		var b: RefCounted = streamer.call("build_of", cell)
		if b == null:
			continue
		surfaces += int(b.get("surfaces"))
		max_build = maxi(max_build, int(b.get("usec")))
		var tris: Dictionary = b.get("triangles")
		for k: String in tris:
			layers[k] = layers.get(k, 0) + int(tris[k])
	# Streaming run: reset the main-thread maxima, then move the focus frame by frame.
	var stats: Dictionary = streamer.get("stats")
	for k: String in ["max_frame_usec", "max_step_usec", "max_view_usec", "max_body_usec", "max_free_usec", "max_overhead_usec"]:
		stats[k] = 0
	var dir := Vector2(-sin(heading), -cos(heading))
	var start := at - dir * (run / 2.0)
	var frames := int(run / (speed / 60.0))
	var over := 0
	for f in frames:
		var p := start + dir * (speed / 60.0) * f
		city.set("focus", p)
		streamer.set("focus", p)
		await process_frame
		if int(stats["last_frame_usec"]) > int(streamer.get("budget_usec")) + 1000:
			over += 1
	await city.call("wait_ready_around", start + dir * run)
	var s := stats
	print("infra_measure at=(%.0f,%.0f) draw_calls=%d primitives=%d objects=%d surfaces=%d layers=%s max_build_ms=%.1f | run=%.0fm frames=%d max_frame_ms=%.2f max_step_ms=%.2f max_view_ms=%.2f max_body_ms=%.2f frames_over_budget+1ms=%d built=%d" % [
		at.x, at.y, draws, prims, objects, surfaces, layers, max_build / 1000.0, run, frames,
		int(s["max_frame_usec"]) / 1000.0, int(s["max_step_usec"]) / 1000.0, int(s.get("max_view_usec", 0)) / 1000.0, int(s.get("max_body_usec", 0)) / 1000.0, over, int(s["built"])])
	quit(0)
