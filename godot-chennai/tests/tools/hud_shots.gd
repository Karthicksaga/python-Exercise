extends SceneTree
## Screenshots of the whole glass HUD (G-290, G-291): the mission column, PAUSE, the touch or
## driving controls and the map credit over the vehicle yard, the pause menu, and the
## performance overlay when asked. Compatibility renderer under xvfb:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 --fixed-fps 60 \
##       --script res://tests/tools/hud_shots.gd -- --shot=foot --out=/tmp/shots/foot.png
##
## Shots: `foot`, `near` (ACTION reads GET IN), `driving`, `pause` (the menu open). `--overlay`
## turns the performance overlay on. Uses a throwaway save file.

func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var shot := "foot"
	var out := "user://hud.png"
	var overlay := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			shot = arg.trim_prefix("--shot=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg == "--overlay":
			overlay = true
	await process_frame
	var s := ControlSettings.new()
	s.path = "user://hud-shots-controls.json"
	ControlSettings.reset_shared()
	var yard := VehicleYard.new()
	root.add_child(yard)
	await yard.load_player()
	await physics_frame
	yard.rig.controls.settings = s
	yard.controls.settings = s
	var car := yard.spawn(&"hatchback", Vector3(0, 0, 4), 0.0, &"ride")
	var hud_settings := DebugSettings.new()
	hud_settings.path = "user://hud-shots-debug.json"
	hud_settings.perf_overlay = overlay
	# The scene carries the Root node the script needs, as in main.tscn.
	# DebugHud reads the GameLoop autoload, so it is loaded at run time (not a static reference).
	var hud_node: Node = (load("res://src/ui/debug_hud/debug_hud.tscn") as PackedScene).instantiate()
	hud_node.set("settings", hud_settings)
	root.add_child(hud_node)
	hud_node.call("set_world_text", "111,179 roads · 41,188 chunks")
	var missions := MissionHud.new()
	root.add_child(missions)
	missions.set_stats("₹0", 0, 21, 50)
	missions.set_mission({"title": "STAGE 1 · MORNING WALK", "objective": "Walk to the marker", "distance": 51.0, "seconds_left": -1.0}, 0.4)
	var menu := PauseMenu.new()
	root.add_child(menu)
	ControlSettingsRows.add_to(menu, s)
	menu.add_setting(&"PerfOverlay", DebugSettings.label, DebugSettings.toggle)
	menu.show_pause_button(true)
	await _frames(30)
	match shot:
		"foot":
			yard.rider.place(Vector3(14, 0.05, 20), 0.0)
			yard.rig.place(Vector3(14, 0.05, 20), 0.0)
			await _frames(10)
		"near":
			yard.rider.place(car.ground_point(car.type.entry.point + Vector2(float(car.type.entry.side) * 0.6, 0.0)), 0.0)
			yard.rig.camera.yaw = 0.8
			await _frames(10)
		"driving":
			yard.driving.enter(car)
			for i in 600:
				if yard.driving.mode() == &"driving":
					break
				await physics_frame
			yard.driving.gas = true
			yard.controls.gas.press(true)
			await _frames(60)
		"pause":
			yard.rig.controls.visible = false
			menu.open()
			await _frames(6)
	await _frames(4)
	var image := root.get_texture().get_image()
	var err := image.save_png(out)
	print("screenshot %s (%dx%d, %s): %s" % [out, image.get_width(), image.get_height(), shot, error_string(err)])
	quit(0 if err == OK else 1)


func _frames(n: int) -> void:
	for i in n:
		await process_frame
