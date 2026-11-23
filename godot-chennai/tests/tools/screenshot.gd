extends SceneTree
## Saves a screenshot of the boot flow at one screen state (needs a display: run under xvfb with
## the Compatibility renderer; the headless renderer draws nothing):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/screenshot.gd -- --state=play --out=/tmp/shots/play.png
##
## States: loading (the first step), title, about, play, failed (a missing world folder).
## Waits in game time for the state, then a few frames so the picture is settled.

const MAIN := preload("res://src/app/main.tscn")


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var want := "play"
	var out := "user://screenshot.png"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--state="):
			want = arg.trim_prefix("--state=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var main: Main = MAIN.instantiate()
	if want == "failed":
		main.source = FileWorldSource.new("res://nowhere")
	root.add_child(main)
	var target := &"title" if want in ["title", "about"] else StringName(want)
	if want == "loading":
		await process_frame
	else:
		for i in 60 * 120:
			if main.state == target or (target == &"play" and main.state == &"title"):
				break
			await physics_frame
		if want == "play":
			main.play()
		elif want == "about":
			main.title.show_about()
	for i in 10:
		await process_frame
	var image := root.get_texture().get_image()
	var err := image.save_png(out)
	print("screenshot %s (%dx%d, state %s): %s" % [out, image.get_width(), image.get_height(), main.state, error_string(err)])
	quit(0 if err == OK else 1)
