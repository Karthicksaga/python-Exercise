extends TestCase
## The pure control logic (G-171…G-175): stick dead zone and run hysteresis, look drag with
## sensitivity, invert-Y and glide, buffered jump and coyote time, slide-to-steer with its response
## curve, reverse on hold. Numbers from the approved proposal; time is stepped in 1/60 s of game
## time, there is no clock in any of them.

const DT := 1.0 / 60.0


# ---- MoveState: dead zone 0.12, run above 0.85, walk under 0.70 ----

func test_stick_dead_zone_is_0_12() -> bool:
	var m := MoveState.new()
	assert_eq(m.update(Vector2(0.11, 0.0)), Vector2.ZERO, "0.11 is inside the dead zone")
	assert_eq(m.update(Vector2(0.0, -0.119)), Vector2.ZERO, "0.119 too")
	var just := m.update(Vector2(0.0, 0.13))
	assert_true(just.y > 0.0 and just.y < 0.05, "just over starts gently from zero (%s)" % just.y)
	assert_near(m.update(Vector2(0.0, 0.5)).y, (0.5 - 0.12) / 0.88, 0.001, "rescaled above the dead zone")
	assert_near(m.update(Vector2(0.0, 1.0)).length(), 1.0, 0.001, "full stick is full")
	return true


func test_run_has_hysteresis_85_up_70_down() -> bool:
	var m := MoveState.new()
	m.update(Vector2(0, 0.84))
	assert_false(m.wants_run(), "0.84 walks")
	m.update(Vector2(0, 0.86))
	assert_true(m.wants_run(), "0.86 runs")
	m.update(Vector2(0, 0.75))
	assert_true(m.wants_run(), "back to 0.75 keeps running (between 0.70 and 0.85)")
	m.update(Vector2(0, 0.71))
	assert_true(m.wants_run(), "0.71 still running")
	m.update(Vector2(0, 0.69))
	assert_false(m.wants_run(), "under 0.70 walks")
	m.update(Vector2(0, 0.80))
	assert_false(m.wants_run(), "0.80 on the way up walks again (not running until 0.85)")
	assert_true(m.move.length() <= MoveState.WALK_CAP + 0.0001, "a walking stick asks for at most %s (%s)" % [MoveState.WALK_CAP, m.move.length()])
	m.update(Vector2(0, 0.0))
	assert_false(m.wants_run(), "released: not running")
	return true


func test_run_held_and_toggle_run() -> bool:
	var m := MoveState.new()
	m.update(Vector2(0, 0.5), true)
	assert_true(m.wants_run(true), "Shift runs at half stick")
	m.run_toggle = true
	m.update(Vector2(0, 1.0))
	assert_false(m.wants_run(), "in toggle mode the stick's edge does not run")
	m.press_run()
	assert_true(m.wants_run(), "the RUN press latches running")
	m.update(Vector2(0, 0.3))
	assert_true(m.wants_run(), "stays on while the stick is held")
	m.update(Vector2.ZERO)
	assert_false(m.wants_run(), "lets go with the stick")
	m.press_run()
	assert_false(m.wants_run(), "a press with no stick held does nothing")
	return true


# ---- LookState ----

func test_look_sensitivity_invert_and_glide_conserve_the_drag() -> bool:
	var l := LookState.new()
	l.sensitivity = 2.0
	l.push(Vector2(100, 40))
	var total := Vector2.ZERO
	var first := l.step(DT)
	total += first
	assert_true(first.x > 0.0 and first.x < 200.0, "the glide delivers part of it at first (%s)" % first.x)
	for i in 60:
		total += l.step(DT)
	assert_vec_near(total, Vector2(200, 80), 0.05, "all of it arrives, doubled by 2.0x sensitivity")
	assert_false(l.moving(), "settled after a second")
	l.invert_y = true
	l.sensitivity = 1.0
	l.push(Vector2(10, 10))
	var sum := Vector2.ZERO
	for i in 60:
		sum += l.step(DT)
	assert_vec_near(sum, Vector2(10, -10), 0.05, "invert-Y flips only the vertical")
	return true


func test_look_glide_settles_in_about_a_tenth_of_a_second() -> bool:
	var l := LookState.new()
	l.push(Vector2(100, 0))
	var got := 0.0
	for i in 6:
		got += l.step(DT).x
	assert_true(got > 85.0, "90 %% delivered within 0.1 s (%.1f)" % got)
	var instant := LookState.new()
	instant.glide = 0.0
	instant.push(Vector2(50, 0))
	assert_eq(instant.step(DT).x, 50.0, "no glide delivers at once")
	return true


# ---- JumpState: buffer 100 ms, coyote 80 ms ----

func _frames(seconds: float) -> int:
	return roundi(seconds / DT)


func test_jump_buffer_100ms_before_landing() -> bool:
	var j := JumpState.new()
	# In the air; pressed 5 frames (83 ms) before landing: jumps on landing.
	j.press()
	for i in 4:
		assert_false(j.tick(DT, false), "still in the air")
	assert_true(j.tick(DT, true), "the buffered press jumps on landing (83 ms)")
	assert_false(j.tick(DT, true), "once")
	# Pressed 8 frames (133 ms) early: too early.
	j.press()
	for i in 8:
		j.tick(DT, false)
	assert_false(j.tick(DT, true), "133 ms is too early")
	return true


func test_coyote_time_80ms_after_leaving_the_ground() -> bool:
	var j := JumpState.new()
	j.tick(DT, true)
	for i in 3:
		j.tick(DT, false)
	j.press()
	assert_true(j.tick(DT, false), "a press 4 frames (67 ms) after the edge still jumps")
	assert_false(j.tick(DT, false), "and not twice")
	var k := JumpState.new()
	k.tick(DT, true)
	for i in 6:
		k.tick(DT, false)
	k.press()
	assert_false(k.tick(DT, false), "a press 7 frames (117 ms) after the edge is late")
	return true


func test_a_jump_uses_up_the_ground() -> bool:
	var j := JumpState.new()
	j.tick(DT, true)
	j.press()
	assert_true(j.tick(DT, true), "jumps")
	j.press()
	assert_false(j.tick(DT, false), "no second jump in the air straight after")
	return true


# ---- SteerState: relative drag, auto-centre, response curve ----

func test_steer_full_lock_at_70_units_from_where_the_thumb_landed() -> bool:
	var s := SteerState.new()
	s.begin(412.0)
	s.drag(412.0 + 35.0)
	assert_near(s.raw, 0.5, 0.001, "35 units: half")
	s.drag(412.0 + 70.0)
	assert_near(s.raw, 1.0, 0.001, "70 units: full lock")
	s.drag(412.0 + 300.0)
	assert_near(s.raw, 1.0, 0.001, "never more than full")
	s.drag(412.0 - 70.0)
	assert_near(s.raw, -1.0, 0.001, "left of where it landed: full lock left")
	for i in 40:
		s.step(DT)
	assert_near(s.value, -1.0, 0.01, "the steering follows within 0.7 s")
	return true


func test_steer_centres_itself_on_release_and_ignores_a_resting_thumb() -> bool:
	var s := SteerState.new()
	s.begin(100.0)
	s.drag(170.0)
	for i in 40:
		s.step(DT)
	s.end()
	var first := 0.0
	for i in 5:
		first = s.step(DT)
	assert_true(first > 0.0 and first < 1.0, "easing back, not snapping (%.2f)" % first)
	for i in 120:
		s.step(DT)
	assert_eq(s.value, 0.0, "centred after a second or two")
	s.begin(100.0)
	s.drag(102.0)
	for i in 30:
		s.step(DT)
	assert_eq(s.value, 0.0, "2 units of wobble (0.03) is a resting thumb")
	return true


func test_steer_curve_is_progressive_and_less_at_speed() -> bool:
	assert_near(SteerState.shape(1.0, 0.0), 1.0, 0.0001, "full lock at a standstill is exactly full (handling parity)")
	assert_near(SteerState.shape(-1.0, 0.0), -1.0, 0.0001, "and mirrored")
	assert_near(SteerState.shape(0.0, 0.5), 0.0, 0.0001, "centre is centre")
	var half := SteerState.shape(0.5, 0.0)
	assert_true(half < 0.5 and half > 0.25, "progressive: half a slide gives under half lock (%.3f)" % half)
	var prev := 0.0
	for i in range(1, 11):
		var v := SteerState.shape(i / 10.0, 0.0)
		assert_true(v > prev, "monotonic at %d/10" % i)
		prev = v
	var fast := SteerState.shape(1.0, 1.0)
	assert_near(fast, SteerState.TOP_SPEED_STEER, 0.0001, "at top speed full slide steers %.0f %% of the lock" % (SteerState.TOP_SPEED_STEER * 100.0))
	assert_true(SteerState.shape(0.8, 0.6) < SteerState.shape(0.8, 0.2), "less steering the faster you go")
	# Within 10 % of the old slider below a third of top speed, for a firm (>= 0.9) slide.
	assert_true(SteerState.shape(0.9, 0.0) >= 0.9 * 0.85 and SteerState.shape(1.0, 0.33) >= 0.9, "a firm slide at town speeds keeps within 10 %% of the old lock (%.3f)" % SteerState.shape(1.0, 0.33))
	return true


# ---- ReverseHold: hold BRAKE 0.4 s when |speed| < 0.3 ----

func test_reverse_after_holding_brake_0_4s_when_stopped() -> bool:
	var r := ReverseHold.new()
	var frames := 0
	while not r.step(DT, true, false, 0.0) and frames < 100:
		frames += 1
	assert_true(frames >= 22 and frames <= 25, "reversing after about 0.4 s (%d frames = %.2f s)" % [frames + 1, (frames + 1) * DT])
	assert_true(r.step(DT, true, false, -1.5), "keeps reversing while held and moving back")
	assert_false(r.step(DT, false, false, -2.0), "releasing BRAKE stops reversing")
	assert_false(r.reversing, "state cleared")
	return true


func test_braking_from_speed_never_reverses_until_stopped_and_held() -> bool:
	var r := ReverseHold.new()
	for i in 120:
		assert_false(r.step(DT, true, false, 5.0 - i * 0.04), "braking at %.1f m/s does not reverse" % (5.0 - i * 0.04) if i % 40 == 0 else "braking from speed")
	# The car has stopped by now (speed < 0.3 for the tail): it needed the full 0.4 s *after* stopping.
	var r2 := ReverseHold.new()
	for i in 20:
		r2.step(DT, true, false, 0.2)
	assert_false(r2.reversing, "0.33 s stopped is not enough")
	for i in 6:
		r2.step(DT, true, false, 0.2)
	assert_true(r2.reversing, "0.43 s stopped reverses")
	var r3 := ReverseHold.new()
	for i in 20:
		r3.step(DT, true, false, 0.2)
	r3.step(DT, true, false, 1.0)
	assert_near(r3.progress(), 0.0, 0.001, "rolling forward again restarts the hold")
	return true


func test_gas_or_releasing_ends_reverse_and_resets_the_hold() -> bool:
	var r := ReverseHold.new()
	for i in 30:
		r.step(DT, true, false, 0.0)
	assert_true(r.reversing, "reversing")
	assert_false(r.step(DT, true, true, -1.0), "GAS while holding BRAKE means forwards: ends reverse")
	for i in 10:
		r.step(DT, true, false, 0.0)
	assert_false(r.reversing, "the hold counts again from zero after gas")
	r.step(DT, false, false, 0.0)
	assert_eq(r.progress(), 0.0, "released: progress cleared")
	return true
