extends SceneTree
## Screenshots and frame-time measurement of the streets' life (G-127): the streamed city at a
## reference place and hour with traffic, walkers and crowds (`CityLife`), or without them
## (`--life=off`) for the before/after numbers. Run under xvfb with the Compatibility renderer:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/traffic_shot.gd -- --place=t_nagar --hour=18.5 --out=/tmp/t.png
##
## Headless with `--fixed-fps 60` (one physics step per frame, no drawing) gives the main
## thread's CPU time alone: `godot --headless --fixed-fps 60 --script … -- --place=…`.
## Options: --place (spawn, t_nagar, marina, anna_salai, central), --hour, --life=off, --pools=T,W
## (traffic and walker pools), --view=back,height, --frames=N (measured after the warm-up).
## Prints "traffic_shot …" lines: main-thread physics and process time per frame (avg, p95,
## max), CityLife's own main-thread sync and wait, the AI step on its worker, draw calls,
## primitives and what was out.

const CITY_PATH := "res://src/game_world/city/city_world.tscn"
const PLACES := {
	"t_nagar": {"road": "Sir Thyagaraya Road", "near": Vector2(2543.0, 5160.0)},
	"marina": {"road": "Kamarajar Salai", "near": Vector2(7991.7, 3422.5)},
	"anna_salai": {"road": "Anna Salai (Mount Road)", "near": Vector2(4940.0, 2915.0)},
	"central": {"road": "Poonamallee High Road", "near": Vector2(6890.0, 6580.0)},
}


static func _probe_script(start: bool) -> GDScript:
	var g := GDScript.new()
	g.source_code = "extends Node\nfunc _physics_process(_d: float) -> void:\n\t%s\n" % ("Engine.get_main_loop().set(&\"_probe_start\", Time.get_ticks_usec())" if start else "var t: int = Engine.get_main_loop().get(&\"_probe_start\")\n\tEngine.get_main_loop().set(&\"_probe_total\", int(Engine.get_main_loop().get(&\"_probe_total\")) + Time.get_ticks_usec() - t)\n\tEngine.get_main_loop().set(&\"_probe_n\", int(Engine.get_main_loop().get(&\"_probe_n\")) + 1)")
	g.reload()
	return g


var _probe_start: int = 0
var _probe_total: int = 0
var _probe_n: int = 0


func _initialize() -> void:
	_run.call_deferred()


func _arg(name: String, fallback: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--%s=" % name):
			return a.trim_prefix("--%s=" % name)
	return fallback


func _run() -> void:
	var place := _arg("place", "spawn")
	var out := _arg("out", "user://traffic.png")
	var hour := float(_arg("hour", "18.5"))
	var with_life := _arg("life", "on") != "off"
	var pools := _arg("pools", "34,34").split(",")
	var view := _arg("view", "11,3.6").split(",")
	var frames := int(_arg("frames", "600"))
	await process_frame
	var today := FileWorldSource.new()
	today.open()
	var source: WorldSource = today
	if RegionalWorldSource.available() and _arg("world", "v2") != "v1":
		source = RegionalWorldSource.new()
		source.open()
	# Classes that use autoloads are reached through `call`: this script compiles before the
	# autoloads exist.
	var city: Node3D = (load(CITY_PATH) as PackedScene).instantiate()
	root.add_child(city)
	await city.call("setup", source)
	var spawn: Dictionary = city.get("spawn")
	var point: Vector2 = spawn["point"]
	var heading: float = spawn["heading"]
	if PLACES.has(place):
		var spec: Dictionary = PLACES[place]
		var best := INF
		for road in today.loaded_roads().named(spec["road"]):
			for q in road.points:
				if q.distance_to(spec["near"]) < best:
					best = q.distance_to(spec["near"])
					point = q
		heading = float((city.call("nearest_road_point", point) as Dictionary).get("heading", 0.0))
	city.call("look_at_world", point, heading, float(view[0]), float(view[1]))
	(city.get("streamer") as Node).call("fill_now")
	await city.call("wait_ready_around", point)
	print("traffic_shot: city ready at %s" % point)
	var life: Node3D = null
	if with_life:
		var marker := Node3D.new()
		marker.visible = false
		city.add_child(marker)
		marker.global_position = root.get_node("/root/WorldOrigin").call("to_scene", point, 0.0)
		life = (load("res://src/app/city_life/city_life.gd") as GDScript).call("make", city, marker)
		life.set("traffic_pool", int(pools[0]))
		life.set("walker_pool", int(pools[1]))
		life.set("hour_override", hour)
		city.add_child(life)
		var err: String = await life.call("prepare", point)
		if err != "":
			printerr(err)
			quit(1)
			return
	print("traffic_shot: life ready")
	# Time from the first to the last physics callback of each frame (scripts only; the rest of
	# TIME_PHYSICS_PROCESS is the physics engine's step).
	var first := Node.new()
	first.process_physics_priority = -100000
	first.set_script(_probe_script(true))
	var last := Node.new()
	last.process_physics_priority = 100000
	last.set_script(_probe_script(false))
	root.add_child(first)
	root.add_child(last)
	# Warm-up: 12 s of game time (traffic drives in from the spawn ring, crowds fill in).
	for i in 60 * 12:
		await physics_frame
	print("traffic_shot: warmed up")
	if life != null:
		life.call("reset_stats")
	var physics := PackedFloat64Array()
	var process := PackedFloat64Array()
	var draws := 0
	var prims := 0
	_probe_total = 0
	_probe_n = 0
	for i in frames:
		await process_frame
		physics.append(Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) * 1000.0)
		process.append(Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0)
		draws = maxi(draws, RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME))
		prims = maxi(prims, RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME))
	if life != null and _arg("debug", "") != "":
		var cam := root.get_viewport().get_camera_3d()
		print("camera ", cam.global_position, " looking ", -cam.global_basis.z)
		var pop: RefCounted = life.get("population")
		var traffic: RefCounted = pop.get("traffic")
		for a: RefCounted in traffic.get("agents"):
			if a.get("active"):
				var v: Node3D = (life.get("views") as Array)[int(a.get("id"))]
				print("  vehicle at %s (%.0f m) speed %.1f y %.2f view %s %s %s" % [a.get("pos"), (a.get("pos") as Vector2).distance_to(point), a.get("speed"), a.get("y"), v.visible, v.global_position, v.name])
	if DisplayServer.get_name() != "headless":
		root.get_texture().get_image().save_png(out)
	var line := "traffic_shot %s hour=%.1f life=%s physics_ms avg=%.2f p95=%.2f max=%.2f process_ms avg=%.2f p95=%.2f max=%.2f draw_calls_max=%d primitives_max=%d" % [place, hour, with_life, _avg(physics), _pct(physics, 0.95), _pct(physics, 1.0), _avg(process), _pct(process, 0.95), _pct(process, 1.0), draws, prims]
	if life != null:
		var st: Dictionary = life.get("stats")
		var n := maxi(1, int(st["frames"]))
		line += " life_sync_us avg=%d max=%d life_wait_us avg=%d ai_step_us per_step=%d (traffic %d, walkers %d, crowd %d; worker, every 2nd physics frame) counts=%s" % [int(st["sync_total"]) / n, int(st["sync_max"]), int(st["wait_total"]) / n, int(st["step_total"]) / maxi(1, int(st["steps"])), int(st["traffic_total"]) / maxi(1, int(st["steps"])), int(st["walkers_total"]) / maxi(1, int(st["steps"])), int(st["crowd_total"]) / maxi(1, int(st["steps"])), life.call("counts")]
		line += " sync_parts_us(vehicles,walkers,crowd,rest)=%s" % [life.call("sync_parts")]
	line += " physics_callbacks_ms avg=%.2f" % (float(_probe_total) / maxi(1, _probe_n) / 1000.0)
	print(line + " " + out)
	quit(0)


static func _avg(a: PackedFloat64Array) -> float:
	var s := 0.0
	for v in a:
		s += v
	return s / maxf(1.0, a.size())


static func _pct(a: PackedFloat64Array, q: float) -> float:
	var b := a.duplicate()
	b.sort()
	return b[clampi(ceili(q * b.size()) - 1, 0, b.size() - 1)] if not b.is_empty() else 0.0
