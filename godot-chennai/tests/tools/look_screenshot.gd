extends SceneTree
## Screenshots of the day/night and weather look (G-86…G-88) in the play state, and the draw calls
## the weather costs, measured by the real renderer. Needs a display (xvfb, Compatibility):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/look_screenshot.gd -- --hour=17.75 --rain=0 --out=/tmp/golden.png
##
## Prints "draw calls: dry N, rain M" (the rain toggled on the same frame setup).

const MAIN := preload("res://src/app/main.tscn")


func _initialize() -> void:
	_run.call_deferred()


func _draw_calls() -> int:
	return RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)


func _run() -> void:
	var hour := 17.75
	var rain := false
	var out := "user://look.png"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--hour="):
			hour = float(arg.trim_prefix("--hour="))
		elif arg.begins_with("--rain="):
			rain = arg.trim_prefix("--rain=") == "1"
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var weather: WeatherService = root.get_node("/root/Weather")
	weather.settings_path = "user://look_screenshot_save.json"
	weather.set_raining(false, true, false)
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	for i in 60 * 120:
		if main.state == &"title":
			break
		await physics_frame
	main.play()
	var loop: Node = root.get_node("/root/GameLoop")
	var clock: GameClock = loop.get("clock")
	clock.hours_per_second = 0.0
	clock.hour = hour
	for i in 20:
		await process_frame
	var dry := _draw_calls()
	weather.set_raining(true, true, false)
	for i in 10:
		await process_frame
	var wet := _draw_calls()
	weather.set_raining(rain, true, false)
	for i in 20:
		await process_frame
	print("draw calls: dry %d, rain %d (hour %.2f)" % [dry, wet, hour])
	var image := root.get_texture().get_image()
	var err := image.save_png(out)
	print("screenshot %s (%dx%d): %s" % [out, image.get_width(), image.get_height(), error_string(err)])
	quit(0 if err == OK else 1)
