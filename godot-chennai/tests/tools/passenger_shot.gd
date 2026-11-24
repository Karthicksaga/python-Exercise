extends SceneTree
## Screenshot of a passenger waiting at a pick-up and waving (G-283), in the real city at the
## start (the stage's pick-up is moved next to the player so no new ground has to stream in).
## Needs a display (xvfb, Compatibility):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/passenger_shot.gd -- --out=/tmp/shots/passenger.png
##
## `layer` stays untyped: this script compiles before the autoloads it uses.

const MAIN := "res://src/app/main.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var out := "user://passenger.png"
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
	var ids: Array[String] = []
	for m: MissionData.Mission in session.content.missions.slice(0, 2):
		ids.append(m.id)
	session.store.set_section(SaveStore.PROGRESS, {"completed": ids, "money": 100})
	session.store.write()
	# The pick-up of stage 3 is on the street ahead of the player (the real one is in Perambur).
	var pick: MissionData.Objective = session.content.any_mission("auto-shift").objectives[1]
	pick.x = 12.0
	pick.z = 30.0
	pick.fare.kerb_x = 8.0
	pick.fare.kerb_z = 30.0
	session.reload()
	for i in 240:
		await physics_frame
	var image := root.get_texture().get_image()
	print("screenshot %s (%dx%d): %s" % [out, image.get_width(), image.get_height(), error_string(image.save_png(out))])
	quit(0)
