extends SceneTree
## Screenshots of the title screen in one chosen state (needs a display: run under xvfb with the
## Compatibility renderer). Options after `--`:
##   --spot=marina|t_nagar|central   the spot (default: the seed's)
##   --custom=x,z,heading,distance,height   a trial spot instead
##   --hour=8.5                      game hour (default: golden hour)
##   --rain=1                        raining (default dry)    --storm=1  lightning bolt now
##   --save=1                        write a save with two stages done first
##   --page=settings|controls|about  open a page
##   --wait=3.0                      real seconds to let the entrance and the drift run
##   --out=PATH
## Run with HOME set to a scratch folder so the save file is not the real one:
##   HOME=/tmp/x xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##     --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##     --script res://tests/tools/title_shots.gd -- --spot=marina --out=/tmp/shots/marina.png
## Prints the draw calls and the main-thread milliseconds per frame it measured.

const MAIN := "res://src/app/main.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var o := {"spot": "", "hour": "17.75", "rain": "0", "storm": "0", "save": "0", "page": "", "wait": "3.0", "out": "user://title.png", "seed": "7"}
	for arg in OS.get_cmdline_user_args():
		var kv := arg.trim_prefix("--").split("=", true, 1)
		if kv.size() == 2:
			o[kv[0]] = kv[1]
	if o["save"] == "1":
		var store := SaveStore.new()
		var content := GameContent.load_file()
		var ids: Array = []
		for i in 2:
			ids.append(content.missions[i].id)
		store.set_section(SaveStore.PROGRESS, {"completed": ids, "money": 2400})
		store.write()
	if o.has("custom"):
		var v: PackedStringArray = str(o["custom"]).split(",")
		TitleSpots.forced = TitleSpots.Spot.new(&"custom", Vector2(float(v[0]), float(v[1])), float(v[2]), float(v[3]), float(v[4]))
		o["spot"] = "custom"
	await process_frame
	var main: Node = (load(MAIN) as PackedScene).instantiate()
	main.set("title_tour", true)
	main.set("title_seed", int(o["seed"]))
	main.set("title_spot", StringName(o["spot"]))
	root.add_child(main)
	for i in 60 * 240:
		if main.get("state") == &"title":
			break
		await physics_frame
	(root.get_node("/root/GameLoop").get("clock") as GameClock).hour = float(o["hour"])
	var rain: bool = o["rain"] == "1"
	root.get_node("/root/Weather").call("set_raining", rain, true, false)
	var wiring: Node = main.get("title_wiring")
	if o["storm"] == "1":
		wiring.set("storm", true)
	if o["page"] == "settings":
		(main.get("title") as Node).call("show_settings")
	elif o["page"] == "controls":
		(main.get("title") as Node).call("show_controls")
	elif o["page"] == "about":
		(main.get("title") as Node).call("show_about")
	wiring.call("refresh_chip")
	var start := Time.get_ticks_msec()
	var frames := 0
	var process_ms := 0.0
	var calls_sum := 0.0
	var prims_sum := 0.0
	var bolted := false
	if o.has("layers") and o["layers"] == "0":
		for view: Node in wiring.get("rain_layers"):
			view.queue_free()
		(wiring.get("rain_layers") as Array).clear()
	while Time.get_ticks_msec() - start < int(float(o["wait"]) * 1000.0):
		await process_frame
		frames += 1
		process_ms += Performance.get_monitor(Performance.TIME_PROCESS) * 1000.0
		calls_sum += Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)
		prims_sum += Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME)
	if o["storm"] == "1":
		wiring.call("bolt")
		bolted = true
	wiring.call("refresh_chip")
	for i in 3 if bolted else 6:
		await process_frame
	var image := root.get_texture().get_image()
	var err := image.save_png(o["out"])
	var calls := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	print("title shot %s (%dx%d) spot=%s place='%s' draw_calls=%d frames=%d: %s" % [o["out"], image.get_width(), image.get_height(), (wiring.get("spot") as RefCounted).get("id"), wiring.get("place"), calls, frames, error_string(err)])
	var st: Dictionary = wiring.get("stats")
	print("title script cost: %.0f us per frame on average, %d us at most, over %d frames" % [float(st["total_usec"]) / maxf(float(st["steps"]), 1.0), st["max_usec"], st["steps"]])
	print("title cost: avg draw calls %.1f, avg primitives %.0f, avg process time %.2f ms over %d frames (software GL under xvfb)" % [calls_sum / maxf(frames, 1), prims_sum / maxf(frames, 1), process_ms / maxf(frames, 1), frames])
	quit(0 if err == OK else 1)
