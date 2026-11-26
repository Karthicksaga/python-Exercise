extends TestCase
## Where a frame's time went (G-340): the timeline cuts a frame at its edges and names the parts.


func test_a_frame_is_cut_into_its_parts() -> bool:
	var t := FrameTimeline.new()
	# Frame 1 (µs): two physics steps, process, deferred calls, frees, draw, the gap after.
	assert_false(t.physics_start(0), "the first mark closes nothing")
	t.physics_end(1000)
	t.physics_deferred(1500)
	assert_false(t.physics_start(61500), "a second step in the same frame")
	t.physics_end(62000)
	t.physics_deferred(62000)
	assert_false(t.process_start(64000), "process in the same frame")
	t.process_end(67000)
	t.deferred(67500)
	t.pre_draw(69500)
	t.post_draw(79500)
	assert_true(t.physics_start(80000), "the next frame's first step closes it")
	assert_eq(t.last_total, 80000, "the whole frame, edge to edge")
	assert_eq(t.last[FrameTimeline.Part.PHYSICS_SCRIPTS], 1500, "both steps' scripts")
	assert_eq(t.last[FrameTimeline.Part.PHYSICS_DEFERRED], 500, "their deferred calls")
	assert_eq(t.last[FrameTimeline.Part.PHYSICS_ENGINE], 62000, "the engine between and after the steps")
	assert_eq(t.last_steps, 2, "two steps")
	assert_eq(t.last_worst_step, 60000, "the slow one")
	assert_eq(t.last[FrameTimeline.Part.SCRIPTS], 3000, "process scripts")
	assert_eq(t.last[FrameTimeline.Part.DEFERRED], 500, "deferred calls")
	assert_eq(t.last[FrameTimeline.Part.FREES], 2000, "timers, tweens and frees")
	assert_eq(t.last[FrameTimeline.Part.RENDER], 10000, "drawing")
	assert_eq(t.last[FrameTimeline.Part.BETWEEN], 500, "the gap to the next frame")
	assert_eq(t.largest(), FrameTimeline.Part.PHYSICS_ENGINE, "the physics engine led")
	assert_true(t.breakdown().begins_with("physics engine 62.0 (2 steps, worst 60.0) · render 10.0"), t.breakdown())
	return true


func test_a_headless_frame_without_drawing_or_physics() -> bool:
	var t := FrameTimeline.new()
	t.process_start(0)
	t.process_end(2000)
	t.deferred(2100)
	assert_true(t.process_start(9000), "no physics step: the next process start closes it")
	assert_eq(t.last_total, 9000, "edge to edge")
	assert_eq(t.last[FrameTimeline.Part.FREES], 6900, "with no draw, the rest counts after the deferred calls")
	assert_eq(t.last_steps, 0, "no steps")
	return true


## The main thread's time on a core, from the kernel (Linux and Android): 25 ms of busy work reads
## as about 25 ms (a stale read once returned zeros, G-340).
func test_the_thread_clock_sees_busy_work() -> bool:
	var c := ThreadClock.new()
	if OS.get_name() != "Linux":
		print("    not Linux: the thread clock is not checked")
		return true
	assert_true(c.ok, "schedstat is readable here")
	c.since_last()
	var t := Time.get_ticks_usec()
	var acc := 0
	while Time.get_ticks_usec() - t < 25000:
		acc += 1
	var spent := c.since_last()
	assert_true(spent.x + spent.y >= 20000, "busy work shows as time on or waiting for a core (%s µs)" % spent)
	assert_true(spent.x <= 200000, "and nothing absurd (%s)" % spent)
	return true
