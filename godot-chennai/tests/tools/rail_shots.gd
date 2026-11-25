extends SceneTree
## Railway screenshots and measurements (G-320…G-334). Needs a display for pictures: run under xvfb
## with the Compatibility renderer (the headless renderer draws nothing; headless still measures
## the main thread):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/rail_shots.gd -- --start=play --shot=platform --out=/tmp/shots
##
## Shots: platform (a train standing at Chennai Egmore), cab (driving away from Egmore), ride
## (inside a coach), crossing (the level crossing near Park with a train coming), mrts (an MRTS
## platform on the viaduct), measure (draw calls and main-thread ms at Egmore with the railway on
## and off; `--at=guindy` measures at Guindy instead, where the Metro, the suburban line and the
## MRTS meet). Rail extras (G-460…G-468): metro (a Metro train at Guindy on the viaduct),
## metro_ground (the Blue Line's viaduct from the street at Meenambakkam), far (a train at Ponneri,
## beyond the old map), map (the full map with the rail lines round Guindy), map_low (the same on
## Low), minimap (the HUD at Guindy with the rail lines on the corner map).
## Pictures go to `--out` (a scratch folder, never the repository).

const MAIN := "res://src/app/main.tscn"

var main: Node
var out_dir := "user://rail_shots"
var measure_at := "egmore"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var shot := "platform"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			shot = arg.trim_prefix("--shot=")
		elif arg.begins_with("--at="):
			measure_at = arg.trim_prefix("--at=")
		elif arg.begins_with("--out="):
			out_dir = arg.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(out_dir)
	await process_frame
	main = (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	for i in 60 * 240:
		if main.get("state") == &"play":
			break
		if main.get("state") == &"failed":
			print("[rail_shots] loading failed")
			quit(1)
			return
		await physics_frame
	print("[rail_shots] play after loading")
	match shot:
		"platform":
			await _platform()
		"cab":
			await _cab()
		"ride":
			await _ride()
		"crossing":
			await _crossing()
		"mrts":
			await _mrts()
		"measure":
			await _measure()
		"metro":
			await _metro()
		"metro_ground":
			await _metro_ground()
		"far":
			await _far()
		"map":
			await _map(false)
		"map_low":
			await _map(true)
		"minimap":
			await _minimap()
	quit(0)


func _railway() -> Object:
	return main.get("railway")


func _network() -> Object:
	return _railway().get("network")


func _line(id: String) -> Object:
	return _network().call("line", id)


func _stop_index(line: Object, name: String) -> int:
	var stops: Array = line.get("stops")
	for i in stops.size():
		if (stops[i] as Object).get("name") == name:
			return i
	return -1


## Puts the player at a world point (feet height y) facing yaw; waits in game time for the ground.
func _teleport(p: Vector2, y: float, yaw: float) -> void:
	var rig: Object = main.get("rig")
	var origin: Object = root.get_node("/root/WorldOrigin")
	origin.call("recentre", p.x, p.y)
	var feet: Vector3 = origin.call("to_scene", p, y)
	rig.call("place", feet, yaw)
	var world: Object = main.get("world")
	await world.call("wait_ready_around", p, -1.0, 60 * 60)
	# The platforms build on worker threads too: wait for them, then stand on the deck again.
	var stations: Object = _railway().get("stations_view")
	for i in 60 * 30:
		if int(stations.call("shown")) > 0:
			break
		await physics_frame
	for i in 10:
		await physics_frame
	rig.call("place", origin.call("to_scene", p, y), yaw)
	for i in 30:
		await physics_frame


## Advances the railway clock so a train of `line` stands at stop `index` `extra` seconds after arriving.
func _train_standing(line: Object, index: int, extra: float) -> void:
	var rail := _railway()
	var clock: float = rail.get("clock")
	var wait: float = line.call("next_arrival", index, clock)
	if wait > 0.0:
		rail.call("advance", wait + extra)


func _save(name: String) -> void:
	for i in 12:
		await process_frame
	var image := root.get_texture().get_image()
	var path := out_dir.path_join(name + ".png")
	image.save_png(path)
	print("[rail_shots] %s (%dx%d) draws %d prims %d" % [path, image.get_width(), image.get_height(), RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME), RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)])


func _platform_spot(line: Object, index: int, u: float) -> Array:
	var stops: Array = line.get("stops")
	var stop: Object = stops[index]
	var path: Object = line.get("path")
	var s: float = stop.get("s")
	var side: int = stop.get("side")
	var offset: float = RailRules.PLATFORM_EDGE + float(stop.get("width")) * 0.5
	var p: Vector2 = path.call("beside", s + u, float(side) * offset)
	var pose: Object = path.call("at", s + u)
	var base: float = line.call("height_at", s)
	return [p, base + RailRules.PLATFORM_HEIGHT + 0.05, float(pose.get("yaw"))]


func _platform() -> void:
	var line := _line("beach-tambaram")
	var i := _stop_index(line, "Chennai Egmore")
	var spot := _platform_spot(line, i, 34.0)
	await _teleport(spot[0], spot[1], float(spot[2]) + PI)
	_train_standing(line, i, 6.0)
	for k in 90:
		await physics_frame
	var rig: Object = main.get("rig")
	var cam: Object = rig.get("camera")
	cam.set("yaw", float(spot[2]) + PI - 0.35)
	cam.set("pitch", 0.12)
	await _save("platform_egmore")
	print("[rail_shots] snapshot %s" % str(_railway().call("snapshot")))


func _cab() -> void:
	var line := _line("beach-tambaram")
	var i := _stop_index(line, "Chennai Egmore")
	var front: float = 45.0
	var spot := _platform_spot(line, i, front - 4.0)
	await _teleport(spot[0], spot[1], float(spot[2]))
	_train_standing(line, i, 4.0)
	for k in 30:
		await physics_frame
	var ok: bool = _railway().call("take_cab")
	print("[rail_shots] take_cab %s" % ok)
	var cab: Object = _railway().get("cab")
	for k in 60 * 10:
		await physics_frame
	cab.call("set_notch", 7)
	for k in 60 * 12:
		await physics_frame
	await _save("cab_driving")
	print("[rail_shots] cab v %.1f m/s s %.0f score %s" % [float(cab.get("v")), float(cab.get("s")), cab.get("score")])


func _ride() -> void:
	var line := _line("beach-tambaram")
	var i := _stop_index(line, "Chennai Egmore")
	var spot := _platform_spot(line, i, 0.0)
	await _teleport(spot[0], spot[1], float(spot[2]))
	_train_standing(line, i, 4.0)
	for k in 30:
		await physics_frame
	var ok: bool = _railway().call("board")
	print("[rail_shots] board %s %s" % [ok, _railway().get("last_message")])
	for k in 60 * 6:
		await physics_frame
	_railway().call("advance", 24.0)
	for k in 60 * 8:
		await physics_frame
	await _save("ride_inside")
	_railway().call("toggle_view")
	await _save("ride_outside")


func _crossing() -> void:
	var net := _network()
	var crossings: Array = net.get("crossings")
	var c: Object = null
	for x: Object in crossings:
		if not (x.get("lines") as Dictionary).is_empty():
			c = x
	var yaw: float = c.get("yaw")
	var p := Vector2(float(c.get("x")), float(c.get("z")))
	# Stand on the road 14 m from the track, looking at the crossing.
	var road := Vector2(cos(yaw), -sin(yaw))
	await _teleport(p + road * 16.0, 0.05, atan2(road.x, road.y))
	var lines: Dictionary = c.get("lines")
	var id: String = lines.keys()[0]
	var line := _line(id)
	var at: float = lines[id]
	# Advance so the next train's front is ~150 m from the road.
	var rail := _railway()
	for k in 2000:
		var trains: Array = line.call("trains", float(rail.get("clock")))
		var close := false
		for t: Object in trains:
			var s: float = (t.get("state") as Object).get("s")
			if s < at - 120.0 and s > at - 260.0:
				close = true
		if close:
			break
		rail.call("advance", 2.0)
	for k in 60 * 6:
		await physics_frame
	var rig: Object = main.get("rig")
	var cam: Object = rig.get("camera")
	cam.set("yaw", atan2(road.x, road.y) + 0.35)
	cam.set("pitch", 0.15)
	await _save("level_crossing")
	print("[rail_shots] crossing amounts %s" % str(rail.get("crossing_amounts")))


func _mrts() -> void:
	var line := _line("mrts-beach-mount")
	var i := _stop_index(line, "Light House")
	var spot := _platform_spot(line, i, 30.0)
	await _teleport(spot[0], spot[1], float(spot[2]) + PI)
	_train_standing(line, i, 6.0)
	for k in 90:
		await physics_frame
	await _save("mrts_platform")


## Draw calls and main-thread time near Egmore with a train standing, railway on and then off.
func _metro() -> void:
	var line := _line("metro-blue-north")
	var i := _stop_index(line, "Guindy Metro")
	var spot := _platform_spot(line, i, 30.0)
	await _teleport(spot[0], spot[1], float(spot[2]) + PI)
	_train_standing(line, i, 4.0)
	for k in 90:
		await physics_frame
	var cam: Object = (main.get("rig") as Object).get("camera")
	cam.set("yaw", float(spot[2]) + PI - 0.4)
	cam.set("pitch", 0.1)
	await _save("metro_guindy_platform")
	print("[rail_shots] snapshot %s" % str(_railway().call("snapshot")))


func _metro_ground() -> void:
	var line := _line("metro-blue-north")
	var i := _stop_index(line, "Meenambakkam")
	var path: Object = line.get("path")
	var stops: Array = line.get("stops")
	var s: float = float((stops[i] as Object).get("s")) + 160.0
	var pose: Object = path.call("at", s)
	var p: Vector2 = path.call("beside", s, 28.0)
	await _teleport(p, 0.05, float(pose.get("yaw")) - PI / 2.0)
	_train_standing(line, i, 26.0)
	for k in 120:
		await physics_frame
	var cam: Object = (main.get("rig") as Object).get("camera")
	cam.set("yaw", float(pose.get("yaw")) - PI / 2.0 - 0.6)
	cam.set("pitch", 0.32)
	await _save("metro_viaduct_street")


func _far() -> void:
	var line := _line("central-sullurpeta")
	var i := _stop_index(line, "Ponneri")
	var spot := _platform_spot(line, i, 34.0)
	await _teleport(spot[0], spot[1], float(spot[2]) + PI)
	_train_standing(line, i, 6.0)
	for k in 90:
		await physics_frame
	var cam: Object = (main.get("rig") as Object).get("camera")
	cam.set("yaw", float(spot[2]) + PI - 0.35)
	cam.set("pitch", 0.12)
	await _save("far_ponneri_platform")


func _guindy() -> void:
	var line := _line("beach-tambaram")
	var i := _stop_index(line, "Guindy")
	var spot := _platform_spot(line, i, 0.0)
	await _teleport(spot[0], spot[1], float(spot[2]))


func _map(low: bool) -> void:
	if low:
		QualitySettings.shared().set_preset(QualitySettings.LOW)
	await _guindy()
	var layer: Node = main.find_child("MissionsLayer", false, false)
	layer.call("open_map")
	var map: Object = layer.get("full_map")
	map.call("set_zoom", 2)
	for k in 30:
		await process_frame
	await _save("full_map_rail_low" if low else "full_map_rail")
	map.call("set_zoom", 1)
	await _save("full_map_rail_zoom1_low" if low else "full_map_rail_zoom1")
	layer.call("close_map")


func _minimap() -> void:
	await _guindy()
	for k in 60:
		await physics_frame
	await _save("minimap_rail_guindy")


func _measure() -> void:
	var line := _line("beach-tambaram")
	var i := _stop_index(line, "Guindy" if measure_at == "guindy" else "Chennai Egmore")
	var spot := _platform_spot(line, i, 34.0)
	await _teleport(spot[0], spot[1], float(spot[2]) + PI)
	_train_standing(line, i, 2.0)
	for k in 120:
		await physics_frame
	var rail := _railway()
	for pass_name: String in ["on", "off"]:
		if pass_name == "off":
			(rail as Node).process_mode = Node.PROCESS_MODE_DISABLED
			(rail as Node3D).visible = false
			for k in 30:
				await process_frame
		rail.call("reset_timing")
		var draws := 0
		var prims := 0
		var frames := 0
		var t0 := Time.get_ticks_usec()
		for k in 240:
			await process_frame
			draws += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
			prims += RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
			frames += 1
		var wall := (Time.get_ticks_usec() - t0) / 1000.0 / frames
		var timing: Dictionary = rail.get("timing")
		var steps := maxi(1, int(timing["steps"]))
		var fr := maxi(1, int(timing["frames"]))
		print("[rail_shots] measure %s: draws %.0f prims %.0f frame %.2f ms | railway physics %.3f ms/step (max %.3f) frame %.3f ms (max %.3f)" % [pass_name, float(draws) / frames, float(prims) / frames, wall, float(timing["physics_total"]) / steps / 1000.0, float(timing["physics_max"]) / 1000.0, float(timing["process_total"]) / fr / 1000.0, float(timing["process_max"]) / 1000.0])
		print("[rail_shots] parts (listen, crowds, crossings) µs per step: %s" % str(Vector3(rail.get("parts")) / steps))
	print("[rail_shots] snapshot %s parts %s" % [str(rail.call("snapshot")), str(rail.get("parts"))])
