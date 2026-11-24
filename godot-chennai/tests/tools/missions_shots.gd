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
	var session: Object = layer.get("session")
	var hud: Control = layer.get("hud")
	var tp: Control = hud.get("toast_panel")
	print("TOAST ", tp.size, " min ", tp.get_combined_minimum_size(), " pos ", tp.position, " hud ", hud.size, " vis ", tp.visible)
	await _shot(out + "_stage.png")
	# Money and a stage done: a toast on top of the next brief.
	session.emit_signal("notice", "Stage 1 complete", "+₹50", 4.0)
	await _shot(out + "_toast.png")
	session.call("take_job", "courier", 10.0)
	for i in 30:
		await physics_frame
	await _shot(out + "_job.png")
	layer.call("open_board")
	await _shot(out + "_board.png")
	layer.call("close_dialog")
	session.emit_signal("result", "Job complete", "Delivered. +₹450\nReputation 4", true)
	await _shot(out + "_result.png")
	quit(0)
