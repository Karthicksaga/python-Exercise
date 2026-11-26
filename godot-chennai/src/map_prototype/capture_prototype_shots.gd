extends SceneTree
## Captures screenshots of each state of the standalone MapPrototype (`--demo=...`) into `--out=...`.

const SCENE := "res://src/map_prototype/map_prototype.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var out := "/tmp/proto_shot.png"
	for arg: String in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var packed := load(SCENE) as PackedScene
	var proto := packed.instantiate()
	root.add_child(proto)
	for i in 12:
		await process_frame
	var img := root.get_texture().get_image()
	var err := img.save_png(out)
	print("proto screenshot %s (%dx%d): %s" % [out, img.get_width(), img.get_height(), error_string(err)])
	quit(0 if err == OK else 1)
