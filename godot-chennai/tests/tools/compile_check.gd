extends SceneTree
## Loads every script under res://src and res://tests and quits: 1 if any fails to compile.
##   godot --headless --audio-driver Dummy --path . --script res://tests/tools/compile_check.gd


func _initialize() -> void:
	var broken := 0
	for dir: String in ["res://src", "res://tests"]:
		for path in _files(dir):
			var s := load(path) as Script
			if s == null or not s.can_instantiate():
				broken += 1
				printerr("BROKEN %s" % path)
	print("compile check: %d broken" % broken)
	quit(1 if broken > 0 else 0)


func _files(dir: String) -> PackedStringArray:
	var out := PackedStringArray()
	for file in DirAccess.get_files_at(dir):
		if file.get_extension() == "gd":
			out.append(dir.path_join(file))
	for sub in DirAccess.get_directories_at(dir):
		out.append_array(_files(dir.path_join(sub)))
	return out
