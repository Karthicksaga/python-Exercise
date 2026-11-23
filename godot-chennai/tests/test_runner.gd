extends SceneTree
## Headless test runner (decision G-8): `./run_tests.sh`, or
##     godot --headless --audio-driver Dummy --path . --script res://tests/test_runner.gd [-- --filter=<text>]
##
## 1. Loads every script under res://src and res://tests (a parse error anywhere fails the run).
## 2. Runs every `test_*` method of every `tests/**/test_*.gd` (a TestCase), in file order.
## 3. Exits 1 if anything failed or nothing ran, else 0. Godot's own exit code never reflects
##    script errors, so the runner counts failures itself (godot-gdscript-headless-testing).

const SCRIPT_DIRS: PackedStringArray = ["res://src", "res://tests"]
const TEST_DIRS: PackedStringArray = ["res://tests/unit", "res://tests/scene"]

var _tests := 0
var _failed := 0
var _assertions := 0


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	await process_frame  # root joins the tree on the first frame
	var filter := ""
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--filter="):
			filter = arg.trim_prefix("--filter=")
	var broken := 0
	var scripts := 0
	for dir in SCRIPT_DIRS:
		for path in _files(dir, "gd"):
			scripts += 1
			var s := load(path) as Script
			if s == null or not s.can_instantiate():
				broken += 1
				printerr("BROKEN %s" % path)
	print("scripts compiled: %d, broken: %d" % [scripts, broken])
	var started := Time.get_ticks_msec()
	for dir in TEST_DIRS:
		for path in _files(dir, "gd"):
			if not path.get_file().begins_with("test_"):
				continue
			await _run_file(path, filter)
	var seconds := (Time.get_ticks_msec() - started) / 1000.0
	print("Results: %d tests, %d assertions, %d failed, %d broken scripts (%.1f s)" % [_tests, _assertions, _failed, broken, seconds])
	var ok := _failed == 0 and broken == 0 and _tests > 0
	if _tests == 0:
		printerr("No tests ran (filter %s)." % var_to_str(filter))
	print("TESTS PASSED" if ok else "TESTS FAILED")
	quit(0 if ok else 1)


func _run_file(path: String, filter: String) -> void:
	var script := load(path) as GDScript
	if script == null:
		return
	var names: PackedStringArray = []
	for m: Dictionary in script.get_script_method_list():
		var n: String = m["name"]
		if n.begins_with("test_") and not names.has(n):
			names.append(n)
	for n in names:
		var full := "%s::%s" % [path.trim_prefix("res://tests/"), n]
		if filter != "" and not full.contains(filter):
			continue
		var case: TestCase = script.new()
		var holder := Node.new()
		holder.name = "Test"
		root.add_child(holder)
		case.tree = self
		case.root = holder
		await case.before_each()
		var finished: Variant = await case.call(n)
		_tests += 1
		_assertions += case.assertions
		if finished != true:
			case.failures.append("did not finish (runtime error, or the test does not return true)")
		if case.failures.is_empty():
			print("  ok    %s (%d)" % [full, case.assertions])
		else:
			_failed += 1
			print("  FAIL  %s" % full)
			for f: String in case.failures:
				printerr("        %s: %s" % [full, f])
		holder.queue_free()
		await process_frame


func _files(dir: String, ext: String) -> PackedStringArray:
	var out := PackedStringArray()
	for file in DirAccess.get_files_at(dir):
		if file.get_extension() == ext:
			out.append(dir.path_join(file))
	for sub in DirAccess.get_directories_at(dir):
		if not sub.begins_with("."):
			out.append_array(_files(dir.path_join(sub), ext))
	return out
