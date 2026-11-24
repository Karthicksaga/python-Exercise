extends SceneTree
## Screenshots and render statistics of the streamed city at the reference places (decision
## G-58). Needs a display: run under xvfb with the Compatibility renderer:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/city_shot.gd -- --place=t_nagar --out=/tmp/shots/t_nagar.png
##
## Places: spawn, t_nagar, marina, anna_salai (or --at=x,z,heading). Prints one line
## "city_shot <place> draw_calls=… primitives=… objects=… chunks=…" for the report.

const CITY_PATH := "res://src/game_world/city/city_world.tscn"

## Road name and a point near which to stand on it; facing along the road (or `heading`).
const PLACES := {
	"t_nagar": {"road": "Sir Thyagaraya Road", "near": Vector2(2543.0, 5160.0), "mid": true},
	"marina": {"road": "Kamarajar Salai", "near": Vector2(7991.7, 3422.5), "heading": -PI / 2.0, "side": 330.0},
	"anna_salai": {"road": "Anna Salai (Mount Road)", "near": Vector2(4940.0, 2915.0)},
}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var place := "spawn"
	var out := "user://city.png"
	var at := ""
	## "back,height" of the camera behind the point (default: street level).
	var view := "9,3.2"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--place="):
			place = arg.trim_prefix("--place=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--view="):
			view = arg.trim_prefix("--view=")
		elif arg.begins_with("--at="):
			at = arg.trim_prefix("--at=")
	await process_frame
	# Places are found on today's roads (always all in memory); the city streams the regional
	# world unless --world=v1.
	var today := FileWorldSource.new()
	var err := today.open()
	var source: WorldSource = today
	if RegionalWorldSource.available() and not OS.get_cmdline_user_args().has("--world=v1"):
		source = RegionalWorldSource.new()
		err = source.open()
	if err != "":
		printerr(err)
		quit(1)
		return
	var city: Node = (load(CITY_PATH) as PackedScene).instantiate()
	if OS.get_cmdline_user_args().has("--no-landmarks"):
		city.set("show_landmarks", false)
	root.add_child(city)
	err = await city.call("setup", source)
	var spawn: Dictionary = city.get("spawn")
	var point: Vector2 = spawn["point"]
	var heading: float = spawn["heading"]
	if at != "":
		var p := at.split(",")
		point = Vector2(float(p[0]), float(p[1]))
		heading = float(p[2]) if p.size() > 2 else 0.0
	elif PLACES.has(place):
		var spec: Dictionary = PLACES[place]
		var best := INF
		for road in today.loaded_roads().named(spec["road"]):
			for q in road.points:
				var d := q.distance_to(spec["near"])
				if d < best:
					best = d
					point = q
		if spec.get("mid", false):
			var roads := today.loaded_roads().named(spec["road"])
			var longest: Road = roads[0]
			for r in roads:
				if r.length() > longest.length():
					longest = r
			point = longest.points[longest.points.size() / 2]
		var hit: Dictionary = city.call("nearest_road_point", point)
		heading = spec.get("heading", hit.get("heading", 0.0))
		if spec.has("side"):
			point += Vector2(-sin(heading), -cos(heading)) * float(spec["side"])
	var vp := view.split(",")
	city.call("look_at_world", point, heading, float(vp[0]), float(vp[1]))
	var streamer: Node = city.get("streamer")
	var t0 := Time.get_ticks_msec()
	streamer.call("fill_now")
	var fill_ms := Time.get_ticks_msec() - t0
	var ok: bool = await city.call("wait_ready_around", point)
	for i in 20:
		await process_frame
	if OS.has_environment("CITY_DEBUG"):
		var cam := root.get_viewport().get_camera_3d()
		for v: Node in streamer.get_children():
			var w := v.get_node_or_null("Walls") as MeshInstance3D
			if w != null:
				print("%s walls d=%.0f aabb=%s visible=%s range=%s..%s" % [v.name, cam.global_position.distance_to(w.global_position), w.get_aabb(), w.is_visible_in_tree(), w.visibility_range_begin, w.visibility_range_end])
	# --frames=N: average and worst frame time over N rendered frames (landmark cost, G-188).
	var frame_note := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--frames="):
			var n := int(arg.trim_prefix("--frames="))
			var times := PackedFloat64Array()
			var last := Time.get_ticks_usec()
			for i in n:
				await process_frame
				var now := Time.get_ticks_usec()
				times.append(float(now - last) / 1000.0)
				last = now
			var total := 0.0
			var worst := 0.0
			for t in times:
				total += t
				worst = maxf(worst, t)
			frame_note = "frame_avg_ms=%.2f frame_max_ms=%.2f frames=%d " % [total / maxf(1.0, n), worst, n]
	var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var objects := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	var image := root.get_texture().get_image()
	image.save_png(out)
	print(frame_note + "city_shot %s ready=%s at=(%.0f, %.0f) draw_calls=%d primitives=%d objects=%d chunks=%d max_main_ms=%.2f max_build_ms=%.1f fill_ms=%d %s" % [place, ok, point.x, point.y, draws, prims, objects, (streamer.call("shown_cells") as Array).size(), float(streamer.get("stats")["max_frame_usec"]) / 1000.0, float(streamer.get("stats")["max_build_usec"]) / 1000.0, fill_ms, out])
	quit(0)
