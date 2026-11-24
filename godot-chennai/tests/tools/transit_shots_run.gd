extends Node
## (Loaded by `transit_shots.gd` once the autoloads are up.) Screenshots and frame-time measurement of buses and stations (G-214…G-219) in the real game
## (`main.tscn`). Run under xvfb with the Compatibility renderer:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/transit_shots.gd -- --out=/tmp/shots --tag=915
##
## Shots: stop_dwell (a route bus at a stop with its doors open, the hint and BOARD), riding
## (inside, the next stop announced), alight_prompt, alighted, flyover (a route bus on a deck),
## station (a railway station's place and hint). Headless with `--fixed-fps 60 --measure` it
## prints "transit_measure" lines instead: main-thread physics + process time per frame (avg,
## p95, max) near a stop with route buses (`--routes=off` for the same place without them), and
## while riding.

const MAIN := preload("res://src/app/main.tscn")

var main: Main
var out_dir := "user://transit_shots"
var tag := ""


func _ready() -> void:
	_run.call_deferred()


func _arg(name: String, fallback: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--%s=" % name):
			return a.trim_prefix("--%s=" % name)
		if a == "--%s" % name:
			return "1"
	return fallback


func _until(cond: Callable, frames: int) -> bool:
	for i in frames:
		if cond.call() == true:
			return true
		await get_tree().physics_frame
	return cond.call() == true


func _frames(n: int) -> void:
	for i in n:
		await get_tree().process_frame


func _shot(name: String) -> void:
	await _frames(3)
	var path := out_dir.path_join("%s_%s.png" % [name, tag] if tag != "" else "%s.png" % name)
	get_tree().root.get_texture().get_image().save_png(path)
	print("transit_shot %s" % path)


func _run() -> void:
	out_dir = _arg("out", out_dir)
	tag = _arg("tag", "")
	DirAccess.make_dir_recursive_absolute(out_dir)
	GameLoop.clock.hour = float(_arg("hour", "10.5"))
	# llvmpipe draws a frame or two a second: let physics catch up so game time keeps pace.
	Engine.max_physics_steps_per_frame = 30
	Weather.set_raining(false, true, false)
	main = MAIN.instantiate()
	get_tree().root.add_child(main)
	if not await _until(func() -> bool: return main.state in [&"title", &"failed"], 60 * 240) or main.state != &"title":
		print("transit_shots: the game did not load (%s)" % main.state)
		get_tree().quit(1)
		return
	main.transit.routes_on = _arg("routes", "on") != "off"
	main.play()
	if main.transit.missions != null and main.transit.missions.session != null:
		main.transit.missions.session.runner.earn(500.0)
	if _arg("measure", "") != "":
		await _measure()
	else:
		await _shots()
	get_tree().quit(0)


func _stop_near(p: Vector2) -> TransitNetwork.Stop:
	var best: TransitNetwork.Stop = null
	var bd := INF
	for s in main.transit.network.stops:
		if not s.routes.is_empty() and s.position.distance_to(p) < bd:
			bd = s.position.distance_to(p)
			best = s
	return best


func _go(p: Vector2, yaw: float) -> void:
	main.rig.place(WorldOrigin.to_scene(p, 0.3), yaw)
	await _until(func() -> bool: return main.world.world_ready_around(p, 80.0), 60 * 30)
	await _frames(10)


func _look_at(target: Vector3) -> void:
	var d := target - main.rig.body.global_position
	main.rig.camera.yaw = atan2(-d.x, -d.z)
	main.rig.camera.snap()


func _wait_bus() -> int:
	var t := main.transit
	await _until(func() -> bool: return t.bus_to_board() >= 0, 60 * 200)
	return t.bus_to_board()


func _shots() -> void:
	var which := _arg("shot", "all")
	if which == "flyover":
		await _flyover()
		return
	if which == "station":
		await _station()
		return
	var t := main.transit
	var stop := _stop_near(main.world.spawn["point"])
	# Stand on the pavement a little before the stop, looking along the road at it.
	await _go(stop.position + Vector2(6, 3), 0.0)
	var id := await _wait_bus()
	if id < 0:
		print("transit_shots: no bus came")
		return
	var v := main.life.views[id]
	_look_at(v.global_position + v.global_basis.x * 2.0)
	await _frames(20)
	await _shot("stop_dwell")
	t.board(id)
	await _until(func() -> bool: return t.hint.tamil_label.text.begins_with(BusRide.NEXT_TA), 60 * 40)
	await _frames(30)
	await _shot("riding")
	t.fast_travel()
	await _until(func() -> bool: return not t._jumping, 60 * 30)
	await _until(func() -> bool: return main.rig.controls.action_context.label() == "ALIGHT", 60 * 120)
	await _frames(10)
	await _shot("alight_prompt")
	t.alight()
	await _frames(40)
	_look_at(v.global_position)
	await _frames(20)
	await _shot("alighted")
	if which == "all":
		await _flyover()
		await _station()


## A route bus on a raised stretch: the first raised segment of a first-set route.
func _flyover() -> void:
	var t := main.transit
	var best_r: TransitNetwork.Route = null
	var best_seg := -1
	var src := main.source
	for r in t.network.routes:
		if not r.first or best_r != null:
			continue
		for k in range(0, r.path.size() - 1, 3):
			var roads := src.roads_near(r.path[k], 30.0)
			for rd in roads:
				if rd.is_raised() and rd.bridge:
					for i in rd.points.size():
						if rd.points[i].distance_to(r.path[k]) < 0.3 and rd.height_at(mini(i, rd.points.size() - 2), 0.0) > 5.0:
							best_r = r
							best_seg = k
				if best_r != null:
					break
			if best_r != null:
				break
	if best_r == null:
		print("transit_shots: no raised route segment found")
		return
	var at := best_r.path[best_seg]
	var dir := (best_r.path[best_seg + 1] - at).normalized()
	var side := Vector2(dir.y, -dir.x)
	print("transit_shots flyover route %s at %s" % [best_r.ref, at])
	await _go(at - side * 30.0 - dir * 25.0, 0.0)
	await _until(func() -> bool: return main.life.population != null and main.life.population.area != null and main.life.population.area.centre.distance_to(at) < 700.0, 60 * 30)
	var placed := [false]
	for attempt in 30:
		t._queue(func(sys: AgentSystem) -> void:
			for a in sys.agents:
				if sys.is_bus(a) and not placed[0]:
					placed[0] = t.buses._put(sys, a, best_r, maxi(0, best_seg - 2), 0.5))
		await _until(func() -> bool: return placed[0], 4)
		if placed[0]:
			break
		await _frames(10)
	await _frames(60)
	for id: int in t._snap:
		if int(t._snap[id]["route"]) == best_r.index:
			_look_at(main.life.views[id].global_position)
	await _frames(20)
	await _shot("flyover")


func _station() -> void:
	var t := main.transit
	var st: TransitNetwork.Station = null
	for s in t.network.stations:
		if s.name == "Chennai Egmore":
			st = s
	if st == null:
		return
	await _go(st.position + Vector2(0, 30), 0.0)
	_look_at(WorldOrigin.to_scene(st.position, 3.0))
	await _until(func() -> bool: return t.hint.kind() == &"station", 120)
	await _frames(20)
	await _shot("station")


func _measure() -> void:
	var t := main.transit
	var stop := _stop_near(main.world.spawn["point"])
	await _go(stop.position + Vector2(6, 3), 0.0)
	await _frames(240)
	main.life.reset_stats()
	t.cost = {"frames": 0, "total": 0, "max": 0}
	var near := await _sample(900)
	print("transit_measure near_stop routes=%s %s life_sync_avg=%.3f life_wait_avg=%.3f ai_step_avg=%.3f transit_avg=%.3f transit_max=%.3f route_buses=%d" % [_arg("routes", "on"), near, _avg(main.life.stats, "sync_total", "frames"), _avg(main.life.stats, "wait_total", "frames"), _avg(main.life.stats, "step_total", "steps"), _avg(t.cost, "total", "frames"), float(t.cost["max"]) / 1000.0, t._snap.size()])
	if _arg("routes", "on") == "off":
		return
	var id := await _wait_bus()
	if id < 0:
		print("transit_measure: no bus came")
		return
	var b0 := Time.get_ticks_usec()
	t.board(id)
	var board_ms := (Time.get_ticks_usec() - b0) / 1000.0
	main.life.reset_stats()
	t.cost = {"frames": 0, "total": 0, "max": 0}
	var riding := await _sample(900)
	print("transit_measure riding %s board_call_ms=%.2f life_sync_avg=%.3f ai_step_avg=%.3f transit_avg=%.3f transit_max=%.3f" % [riding, board_ms, _avg(main.life.stats, "sync_total", "frames"), _avg(main.life.stats, "step_total", "steps"), _avg(t.cost, "total", "frames"), float(t.cost["max"]) / 1000.0])


static func _avg(d: Dictionary, total: String, n: String) -> float:
	return float(d[total]) / maxf(1.0, float(d[n])) / 1000.0


func _sample(frames: int) -> String:
	var ms := PackedFloat32Array()
	for i in frames:
		await get_tree().process_frame
		ms.append((Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS) + Performance.get_monitor(Performance.TIME_PROCESS)) * 1000.0)
	var sorted := ms.duplicate()
	sorted.sort()
	var total := 0.0
	for m in ms:
		total += m
	return "frame_avg=%.2f p95=%.2f max=%.2f" % [total / ms.size(), sorted[int(ms.size() * 0.95)], sorted[ms.size() - 1]]
