class_name TestCase
extends RefCounted
## Base class for tests run by `tests/test_runner.gd` (decision G-8).
##
## A test file extends TestCase and defines `func test_<name>() -> bool:` methods that end with
## `return true`: a test that dies on a runtime error returns null instead and is counted as
## failed ("did not finish"). Tests may `await`. Wait in game time (`wait_physics_frames`,
## `wait_game_seconds`, `wait_until`), never on the wall clock. Nodes a test adds go under
## `root` and are freed after the test.

## Set by the runner before each test.
var tree: SceneTree
## A fresh node under the tree's root for this test's nodes; freed afterwards.
var root: Node
var assertions: int = 0
var failures: PackedStringArray = PackedStringArray()


## Called before every test (after `tree` and `root` are set). May await.
func before_each() -> void:
	pass


func check(ok: bool, label: String) -> bool:
	assertions += 1
	if not ok:
		failures.append(label)
	return ok


func assert_true(value: bool, label: String) -> bool:
	return check(value, label)


func assert_false(value: bool, label: String) -> bool:
	return check(not value, label)


func assert_eq(actual: Variant, expected: Variant, label: String) -> bool:
	var same: bool = typeof(actual) == typeof(expected) and actual == expected
	# Ints and floats compare by value (JSON numbers are floats).
	if not same and (typeof(actual) in [TYPE_INT, TYPE_FLOAT]) and (typeof(expected) in [TYPE_INT, TYPE_FLOAT]):
		same = float(actual) == float(expected)
	return check(same, "%s: expected %s, got %s" % [label, var_to_str(expected), var_to_str(actual)])


func assert_near(actual: float, expected: float, tolerance: float, label: String) -> bool:
	return check(absf(actual - expected) <= tolerance, "%s: expected %s ± %s, got %s" % [label, expected, tolerance, actual])


func assert_vec_near(actual: Vector2, expected: Vector2, tolerance: float, label: String) -> bool:
	return check(actual.distance_to(expected) <= tolerance, "%s: expected %s ± %s, got %s" % [label, expected, tolerance, actual])


func assert_contains(text: String, part: String, label: String) -> bool:
	return check(text.contains(part), "%s: %s does not contain %s" % [label, var_to_str(text), var_to_str(part)])


## Resumes after `count` physics frames (game time).
func wait_physics_frames(count: int) -> void:
	for i in count:
		await tree.physics_frame


## Resumes after `count` process (render) frames.
func wait_frames(count: int) -> void:
	for i in count:
		await tree.process_frame


## Resumes after `seconds` of game time (whole physics steps).
func wait_game_seconds(seconds: float) -> void:
	await tree.root.get_node("/root/GameLoop").call("wait_game_seconds", seconds)


## Waits physics frame by physics frame until `condition` returns true, at most `max_frames`
## frames of game time. Returns whether it became true.
func wait_until(condition: Callable, max_frames: int) -> bool:
	for i in max_frames:
		if condition.call() == true:
			return true
		await tree.physics_frame
	return condition.call() == true
