extends SceneTree
## A picture of the benchmark's results card (G-405) from a benchmark.json, at the window size given
## with --resolution (the card is meant to be one screenshot at 915x412 and 2460x1080). Pictures go
## to a scratch folder, never the repository:
##
##     xvfb-run -a -s "-screen 0 2460x1080x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 2460x1080 \
##       --script res://tests/tools/benchmark_shot.gd -- --in=/path/benchmark.json --out=/tmp/card.png


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var src := "user://benchmark.json"
	var out := "user://benchmark_card.png"
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--in="):
			src = a.trim_prefix("--in=")
		elif a.begins_with("--out="):
			out = a.trim_prefix("--out=")
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(src))
	if not (parsed is Dictionary):
		printerr("benchmark_shot: cannot read %s" % src)
		quit(1)
		return
	var card := BenchmarkCard.new()
	root.add_child(card)
	card.show_result(parsed as Dictionary)
	for i in 8:
		await process_frame
	var image := root.get_texture().get_image()
	image.save_png(out)
	print("benchmark_shot: %s (%dx%d)" % [out, image.get_width(), image.get_height()])
	quit(0)
