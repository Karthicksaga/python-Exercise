extends SceneTree
## Screenshots of the loading screen (needs a display, Compatibility renderer under xvfb):
##   ... --script res://tests/tools/loading_shots.gd -- --state=mid|failed|slow --out=PATH

func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var state := "mid"
	var out := "user://loading.png"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--state="):
			state = arg.trim_prefix("--state=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var l: LoadingScreen = (load("res://src/ui/loading_screen/loading_screen.tscn") as PackedScene).instantiate()
	root.add_child(l)
	var steps: PackedStringArray = ["Reading the map of Chennai", "Reading the streets", "Building the streets around you", "Parking the vehicles"]
	l.set_steps(steps)
	for i in 2:
		l.begin_step(i)
		l.finish_step(i)
	l.begin_step(2)
	if state == "slow":
		l.show_slow(2, 20)
	elif state == "failed":
		l.fail(2, "The streets round the start did not load.")
	for i in 8:
		await process_frame
	var err := root.get_texture().get_image().save_png(out)
	print("loading shot %s %s: %s" % [state, out, error_string(err)])
	quit(0 if err == OK else 1)
