extends TestCase
## The performance overlay showed on the owner's phone (G-491): an earlier build had saved it on,
## and the pause row that turns it off could not be tapped (G-490). A release build (the APK) now
## starts with it off whatever the save says, ignores the three-finger tap, and shows it only after
## five taps on the top-left corner (or the menu row). Booted here like the APK:
## `DebugSettings.release_build` on, a save that says "on", the real game. Its long lines wrap and
## the block stays on the screen (G-493).

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180

var _old_release: bool
var _old_size: Vector2i


func before_each() -> void:
	_old_release = DebugSettings.release_build
	_old_size = tree.root.size


func _restore() -> void:
	DebugSettings.release_build = _old_release
	DebugSettings.shared().set_perf_overlay(false)
	DebugSettings.reset_shared()
	tree.root.size = _old_size
	tree.paused = false
	Sound.suspend()


func _send(e: InputEvent) -> void:
	Input.parse_input_event(e)
	Input.flush_buffered_events()


func _finger(index: int, ui: Vector2, down: bool) -> void:
	var t := InputEventScreenTouch.new()
	t.index = index
	t.position = tree.root.get_final_transform() * ui
	t.pressed = down
	_send(t)


func test_a_release_build_boots_with_the_overlay_off_and_five_corner_taps_show_it() -> bool:
	# What an earlier session left in the save: the overlay on.
	var earlier := DebugSettings.new()
	earlier.perf_overlay = true
	earlier.save()
	DebugSettings.release_build = true
	DebugSettings.reset_shared()
	tree.root.size = Vector2i(2460, 1080)
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		_restore()
		return true
	check(not DebugSettings.shared().perf_overlay, "release: the saved 'on' is not restored")
	check(not main.perf.overlay.visible and not main.hud.overlay_visible(), "release: no overlay on the title")
	main.play()
	await wait_physics_frames(10)
	check(not main.perf.overlay.visible and not main.hud.overlay_visible(), "release: no overlay in play")
	# Three fingers at once (a thumb on the stick, one on a button, one on the view) do nothing.
	var spots: Array[Vector2] = [Vector2(120, 300), Vector2(500, 200), Vector2(800, 330)]
	for i in 3:
		_finger(i, spots[i], true)
	await wait_frames(1)
	for i in 3:
		_finger(i, spots[i], false)
	await wait_frames(3)
	check(not main.perf.overlay.visible and not DebugSettings.shared().perf_overlay, "release: a three-finger tap does not show it")
	# Five taps on the top-left corner do.
	for i in CornerTaps.COUNT:
		_finger(0, Vector2(20, 20), true)
		await wait_frames(1)
		_finger(0, Vector2(20, 20), false)
		await wait_frames(2)
	await wait_frames(3)
	check(DebugSettings.shared().perf_overlay and main.perf.overlay.visible and main.hud.overlay_visible(), "five corner taps show it")
	# The longest text it can get stays inside the screen, at the phone's UI and at the base size.
	var long_line := "hitch 212 ms: bookkeeping 120.4, chunk views 40.2, bodies 22.0, render 18.3, traffic 9.1 (AI wait 3.2), nodes +412, objects +3020, pipelines 4, mesh 12 MB, textures 3 MB, main thread on a core 160.2 ms, waiting 40.1 ms"
	var lines := PackedStringArray()
	for i in 30:
		lines.append(long_line)
	for size: Vector2i in [Vector2i(2460, 1080), Vector2i(915, 412)]:
		tree.root.size = size
		await wait_frames(3)
		main.perf.overlay.set_text("\n".join(lines))
		await wait_frames(3)
		var screen := Rect2(Vector2.ZERO, tree.root.get_visible_rect().size)
		var numbers := main.perf.overlay.find_child("Numbers", true, false) as Control
		var plate := numbers.get_parent() as Control
		check(screen.encloses(plate.get_global_rect()), "%s: the overlay's numbers stay on the screen %s in %s" % [size, plate.get_global_rect(), screen.size])
		var real := main.perf.overlay_text()
		main.perf.overlay.set_text(real)
		await wait_frames(3)
		check(screen.encloses(plate.get_global_rect()), "%s: so does its real text %s" % [size, plate.get_global_rect()])
		var fps := main.hud.find_child("Overlay", true, false) as Control
		check(screen.encloses(fps.get_global_rect()), "%s: and the FPS line %s" % [size, fps.get_global_rect()])
	# Five more taps hide it again.
	for i in CornerTaps.COUNT:
		_finger(0, Vector2(20, 20), true)
		await wait_frames(1)
		_finger(0, Vector2(20, 20), false)
		await wait_frames(2)
	await wait_frames(3)
	check(not DebugSettings.shared().perf_overlay and not main.perf.overlay.visible, "five more hide it")
	_restore()
	return true


func test_a_debug_build_still_remembers_it() -> bool:
	var path := "user://test_overlay_release.json"
	var earlier := DebugSettings.new()
	earlier.path = path
	earlier.set_perf_overlay(true)
	DebugSettings.release_build = false
	var again := DebugSettings.new()
	again.path = path
	again.load_saved()
	check(again.perf_overlay, "debug: the saved 'on' comes back")
	DebugSettings.release_build = true
	var apk := DebugSettings.new()
	apk.path = path
	apk.load_saved()
	check(not apk.perf_overlay, "release: it does not")
	DebugSettings.release_build = _old_release
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	return true
