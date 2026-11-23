## Headless runner for the rules tests (`tests/rules/test_*.gd`). Each test file extends
## `rules_test.gd`; every method named `test_*` is one ported TypeScript `it(...)` case (or a new
## Godot case, marked in its comment). Exits 1 on any failure, so CI can gate on it.
##   godot --headless --audio-driver Dummy --path godot-chennai --script res://tests/rules/run_rules_tests.gd
## Optional: `-- --only=test_wanted` runs one file.
extends SceneTree

const DIR := "res://tests/rules/"


func _initialize() -> void:
	var only := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--only="):
			only = arg.substr(7)
	var files: Array[String] = []
	for f in DirAccess.get_files_at(DIR):
		if f.begins_with("test_") and f.ends_with(".gd") and (only == "" or f.begins_with(only)):
			files.append(f)
	files.sort()
	var cases := 0
	var died := 0
	var passed := 0
	var failed := 0
	var lines: Array[String] = []
	for f in files:
		var script: GDScript = load(DIR + f)
		if script == null:
			lines.append("BROKEN %s (did not load)" % f)
			died += 1
			continue
		var suite: RefCounted = script.new()
		var n := 0
		for m: Dictionary in script.get_script_method_list():
			var method: String = m["name"]
			if not method.begins_with("test_"):
				continue
			n += 1
			suite.set("current", "%s:%s" % [f, method])
			var result: Variant = suite.call(method)
			if result != true:
				died += 1
				lines.append("DIED %s:%s (did not finish: runtime error?)" % [f, method])
		cases += n
		passed += int(suite.get("passed"))
		failed += int(suite.get("failed"))
		for line: String in suite.get("failures"):
			lines.append("FAIL " + line)
		print("%-34s %3d cases, %4d checks passed, %d failed" % [f, n, int(suite.get("passed")), int(suite.get("failed"))])
	for line in lines:
		printerr(line)
	print("Rules tests: %d cases in %d files; %d checks passed, %d failed; %d cases died" % [cases, files.size(), passed, failed, died])
	quit(1 if failed > 0 or died > 0 or files.is_empty() else 0)
