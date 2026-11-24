extends SceneTree
## Screenshots of the mission HUD in the real city (G-130): the stage-1 objective, a job on the
## move, the job board, a result screen. Needs a display (xvfb, Compatibility):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/missions_shots.gd -- --out=/tmp/shots/m915
##
## Writes <out>_stage.png, <out>_job.png, <out>_board.png, <out>_result.png. Everything is read
## through the layer's public API, in game time; uses a throwaway save file.

const MAIN := "res://src/app/main.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _shot(path: String) -> void:
	for i in 8:
		await process_frame
	var image := root.get_texture().get_image()
	print("screenshot %s (%dx%d): %s" % [path, image.get_width(), image.get_height(), error_string(image.save_png(path))])


func _run() -> void:
	var out := "user://missions"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	await process_frame
	var main: Node = (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	for i in 60 * 120:
		if main.get("state") == &"title":
			break
		await physics_frame
	main.call("play")
	for i in 90:
		await physics_frame
	var layer: Node = main.find_child("MissionsLayer", false, false)
	var session: MissionSession = layer.get("session")
	var hud: Control = layer.get("hud")
	var tp: Control = hud.get("toast_panel")
	print("TOAST ", tp.size, " min ", tp.get_combined_minimum_size(), " pos ", tp.position, " hud ", hud.size, " vis ", tp.visible)
	await _shot(out + "_stage.png")
	# Money and a stage done: a toast on top of the next brief.
	session.notice.emit("Stage 1 complete", "+₹50", 4.0)
	await _shot(out + "_toast.png")
	session.take_job("courier", 10.0)
	for i in 30:
		await physics_frame
	await _shot(out + "_job.png")
	layer.call("open_board")
	await _shot(out + "_board.png")
	layer.call("close_dialog")
	session.result.emit("Job complete", "Delivered. +₹450\nReputation 4", true)
	await _shot(out + "_result.png")
	layer.call("close_dialog")
	session.quit_job()
	layer.call("close_dialog")
	await _new_systems(layer, session, hud, out)
	quit(0)


## The G-140..G-147 screens. The layer's own stepping is off (`active = false`, the HUD stays
## shown) so each state is exactly what the rules say; the minimap is given zones round the player
## because the real ones are kilometres away and not streamed in. (`layer` and `hud` stay untyped:
## this script compiles before the autoloads they use.)
func _new_systems(layer: Node, session: MissionSession, hud: Control, out: String) -> void:
	layer.set("active", false)
	hud.visible = true
	var rig: Node3D = (layer.get("rig") as Object).get("body")
	var here := Vector2(rig.global_position.x, rig.global_position.z)
	var runner := session.runner
	var status := func(x: float, z: float, mode: String, speed: float, crash: float = 0.0) -> MissionData.PlayerStatus:
		var p := MissionData.PlayerStatus.make(x, z, mode, speed)
		p.crash = crash
		return p
	# Fragile cargo: Sambar for Sixty after a crash.
	session.play_stage("sambar-sixty")
	var kitchen := runner.mission().objectives[1]
	session.step(0.2, status.call(0.0, 0.0, "auto", 0.0))
	for i in 60:
		session.step(0.1, status.call(kitchen.x, kitchen.z, "auto", 0.0))
	session.step(0.1, status.call(kitchen.x + 300.0, kitchen.z, "auto", 10.0, 0.5))
	session.step(0.1, status.call(kitchen.x + 300.0, kitchen.z, "auto", 10.0, 0.4))
	hud.call("set_mission", session.view("auto", 640.0), 0.5)
	hud.call("set_stats", "1,200", 21, 21, 62)
	await _shot(out + "_fragile.png")
	# Tail: the runner's suspicion rising, the minimap with him on it.
	session.leave_stage()
	session.play_stage("wrong-number")
	var start := runner.mission().objectives[1]
	session.step(0.2, status.call(0.0, 0.0, "bike", 0.0))
	session.step(0.2, status.call(start.x, start.z, "bike", 3.0))
	for i in 140:
		var q: Dictionary = runner.tail_target()
		session.step(0.1, status.call(float(q["x"]) + 16.0, float(q["z"]), "bike", 8.0))
	hud.call("set_mission", session.view("bike", 16.0), 0.0)
	var minimap: Control = hud.get("minimap")
	minimap.call("set_view", here, rig.global_rotation.y, [] as Array[Dictionary], MapRoads.new(), [] as Array[Dictionary], here + Vector2(70, -90))
	await _shot(out + "_tail.png")
	# Flood: deep water ahead and a shut road, on the minimap.
	var zones: Array[Dictionary] = [
		{"x": here.x + 90.0, "z": here.y - 60.0, "radius": 55.0, "kind": "flood", "depth": 0.8, "label": "Underpass"},
		{"x": here.x - 110.0, "z": here.y + 70.0, "radius": 40.0, "kind": "flood", "depth": 0.25, "label": "Low junction"},
		{"x": here.x + 40.0, "z": here.y + 140.0, "radius": 45.0, "kind": "strike", "depth": 0.0, "label": "Bandh"}]
	var roads := MapRoads.new()
	for k in range(-6, 7):
		roads.minor.append(here + Vector2(k * 50.0, -300.0))
		roads.minor.append(here + Vector2(k * 50.0, 300.0))
		roads.minor.append(here + Vector2(-300.0, k * 50.0))
		roads.minor.append(here + Vector2(300.0, k * 50.0))
	session.leave_stage()
	hud.call("set_mission", {"title": "Mission · Monsoon Night", "objective": "Take the patient to the hospital, TTK Road", "distance": 2100.0, "seconds_left": 312.0, "stability": 78.0, "stability_label": "Patient", "suspicion": -1.0}, 0.9)
	var points: Array[Dictionary] = [{"x": here.x + 250.0, "z": here.y - 250.0, "radius": 8.0, "kind": &"dropoff", "label": "Drop off"}]
	minimap.call("set_view", here, rig.global_rotation.y, zones, roads, points, Vector2.INF)
	await _shot(out + "_flood.png")
	# The dialogs, through the session's signals as in the game.
	var wrong := session.content.any_mission("wrong-number")
	var options: Array = wrong.objectives[3].options
	session.choice_asked.emit("He has dropped the envelope. What now?", options)
	await _shot(out + "_choice.png")
	layer.call("close_dialog")
	session.retry_offered.emit("You were spotted", "spotted", 2)
	await _shot(out + "_retry.png")
	layer.call("close_dialog")
	var goals: Array = [{"label": "Never more than 40% suspicion", "met": true}, {"label": "No crashes", "met": true}, {"label": "Finish in 10 minutes", "met": false}]
	session.stage_result.emit("Wrong Number", "silver", goals, 1500, false)
	await _shot(out + "_medals.png")
	layer.call("close_dialog")
	layer.set("active", true)
	layer.set("_board_tab", "stages")
	layer.call("open_board")
	await _shot(out + "_stages.png")
	layer.call("close_dialog")
