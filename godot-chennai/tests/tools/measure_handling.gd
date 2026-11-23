extends SceneTree
## Prints the Godot vehicles' handling in the shape of tests/data/threejs_handling.json, for
## tuning and the docs table (--fixed-fps 60 runs it faster than real time):
##   godot --headless --audio-driver Dummy --fixed-fps 60 --path . --script res://tests/tools/measure_handling.gd [-- --kind=car]


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	await process_frame
	var kinds: Array[StringName] = []
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--kind="):
			kinds.append(StringName(arg.trim_prefix("--kind=")))
	if kinds.is_empty():
		kinds = VehicleCatalog.kinds()
	var out: Dictionary = await HandlingMeasure.measure_all(self, root, kinds)
	for kind: StringName in out:
		print("%s %s" % [kind, JSON.stringify(out[kind])])
	quit(0)
