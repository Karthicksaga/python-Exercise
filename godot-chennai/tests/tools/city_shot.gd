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
	"t_nagar": {"road": "Sir Thyagaraya Road", "near": Vector2(2543.0, 5160.0)},
	"marina": {"road": "Kamarajar Salai", "near": Vector2(7991.7, 3422.5), "heading": -PI / 2.0, "side": 14.0},
	"anna_salai": {"road": "Anna Salai (Mount Road)", "near": Vector2(4940.0, 2915.0)},
}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var place := "spawn"
	var out := "user://city.png"
	var at := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--place="):
			place = arg.trim_prefix("--place=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--at="):
			at = arg.trim_prefix("--at=")
	await process_frame
	var source := FileWorldSource.new()
	var err := source.open()
	if err != "":
		printerr(err)
		quit(1)
		return
	var city: Node = (load(CITY_PATH) as PackedScene).instantiate()
	root.add_child(city)
	print("setup…")
	err = await city.call("setup", source)
	print("setup done %s textures %s" % [err, (city.get("materials") as RefCounted).get("loaded")])
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
		for road in source.loaded_roads().named(spec["road"]):
			for q in road.points:
				var d := q.distance_to(spec["near"])
				if d < best:
					best = d
					point = q
		var hit: Dictionary = city.call("nearest_road_point", point)
		heading = spec.get("heading", hit.get("heading", 0.0))
		if spec.has("side"):
			point += Vector2(-sin(heading), -cos(heading)) * -float(spec["side"])
	city.call("look_at_world", point, heading)
	var streamer: Node = city.get("streamer")
	var t0 := Time.get_ticks_msec()
	streamer.call("fill_now")
	print("filled in %d ms" % (Time.get_ticks_msec() - t0))
	var ok: bool = await city.call("wait_ready_around", point)
	for i in 20:
		await process_frame
	print("debug children ", streamer.get_child_count(), " env ", OS.get_environment("CITY_DEBUG"))
	if OS.get_environment("CITY_DEBUG") != "":
		for v: Node in streamer.get_children():
			print(v.name, " ", v.get_children().map(func(c: Node) -> String: return c.name))
			var g := v.get_node_or_null("Ground") as MeshInstance3D
			if g != null:
				var a := g.mesh.surface_get_arrays(0)
				var uv: PackedVector2Array = a[Mesh.ARRAY_TEX_UV]
				var vx: PackedVector3Array = a[Mesh.ARRAY_VERTEX]
				print("ground ", v.name, " verts ", vx.size(), " uv ", uv.slice(0, 4), " fmt ", (g.mesh as ArrayMesh).surface_get_format(0))
				break
	var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var objects := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_OBJECTS_IN_FRAME)
	var image := root.get_texture().get_image()
	image.save_png(out)
	print("city_shot %s ready=%s at=(%.0f, %.0f) draw_calls=%d primitives=%d objects=%d chunks=%d max_main_ms=%.2f max_build_ms=%.1f %s" % [place, ok, point.x, point.y, draws, prims, objects, (streamer.call("shown_cells") as Array).size(), float(streamer.get("stats")["max_frame_usec"]) / 1000.0, float(streamer.get("stats")["max_build_usec"]) / 1000.0, out])
	quit(0)
