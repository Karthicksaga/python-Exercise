extends TestCase
## The restyled loading screen (G-166): the real steps in order with a state each, a bar that moves
## only when a real step finishes, a tip that changes only between steps, Tamil only where translated,
## the slow-load line, the failure with TRY AGAIN and CLOSE, and nothing that runs on its own.

const LOADING := preload("res://src/ui/loading_screen/loading_screen.tscn")


func _make() -> LoadingScreen:
	var vp := SubViewport.new()
	vp.size = Vector2i(915, 412)
	root.add_child(vp)
	var l: LoadingScreen = LOADING.instantiate()
	vp.add_child(l)
	l.set_steps(Main.STEPS)
	return l


func test_steps_have_a_state_and_the_bar_moves_only_on_real_completion() -> bool:
	var l := _make()
	await wait_frames(2)
	for i in Main.STEPS.size():
		assert_eq(l.state_of(i), &"waiting", "step %d waits" % i)
	assert_eq(l.bar_fraction(), 0.0, "an empty bar at the start")
	l.begin_step(0)
	assert_eq(l.state_of(0), &"current", "the first step is current")
	assert_eq(l.bar_fraction(), 0.0, "starting a step does not move the bar")
	await wait_frames(30)
	assert_eq(l.bar_fraction(), 0.0, "and neither does time")
	l.finish_step(0)
	assert_eq(l.state_of(0), &"done", "finished")
	assert_near(l.bar_fraction(), 1.0 / Main.STEPS.size(), 0.0001, "one step, one share of the bar")
	# Every other step (Main has five since the railway's "Running the trains", G-333).
	for i in range(1, Main.STEPS.size()):
		l.begin_step(i)
		l.finish_step(i)
	assert_eq(l.bar_fraction(), 1.0, "all steps: a full bar")
	assert_eq(l.lit_segments(), Main.STEPS.size(), "every step counted")
	return true


func test_tip_changes_only_between_steps() -> bool:
	var l := _make()
	l.begin_step(0)
	var first := l.tip_text()
	await wait_frames(60)
	assert_eq(l.tip_text(), first, "no change while the step runs")
	l.finish_step(0)
	assert_eq(l.tip_text(), first, "none on finishing either")
	l.begin_step(1)
	assert_true(l.tip_text() != first and l.tip_text() != "", "a new step, a new tip")
	assert_false(l.is_processing() or l.is_physics_processing(), "nothing runs on its own: no timer, no animation")
	return true


func test_tamil_only_where_translated() -> bool:
	var l := _make()
	for i in Main.STEPS.size():
		assert_eq(l.tamil_text(i), Tr.raw(String(LoadingScreen.STEP_KEYS[Main.STEPS[i]]), "ta"), "step %d" % i)
		assert_true(l.tamil_text(i) != "", "step %d has Tamil" % i)
	l.set_steps(PackedStringArray(["Some step without Tamil"]))
	assert_eq(l.tamil_text(0), "", "no key: English alone")
	var font := TitleFonts.tamil()
	for key: String in LoadingScreen.STEP_KEYS.values():
		for c in Tr.raw(key, "ta"):
			assert_true(c == " " or font.has_char(c.unicode_at(0)), "Tamil glyph U+%04X is in the font" % c.unicode_at(0))
	return true


func test_slow_line_and_failure() -> bool:
	var l := _make()
	l.begin_step(2)
	assert_eq(l.slow_text(), "", "nothing slow at first")
	l.show_slow(2, 15)
	assert_contains(l.slow_text(), "Building the streets around you", "the slow line names the step")
	assert_contains(l.slow_text(), "15 s", "and how long")
	l.fail(2, "The ground's collider did not appear.")
	assert_eq(l.state_of(2), &"failed", "the failed row is marked")
	assert_eq(l.slow_text(), "", "the slow line gives way to the failure")
	assert_contains(l.step_text(), "Could not finish: Building the streets around you", "what failed")
	await wait_frames(2)
	assert_true(l.get_viewport().gui_get_focus_owner() == l.find_child("Retry", true, false), "TRY AGAIN has the focus")
	assert_eq(l.lit_segments(), 0, "a failed step is not counted as done")
	return true
