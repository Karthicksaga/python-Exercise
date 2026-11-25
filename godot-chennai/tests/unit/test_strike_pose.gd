extends TestCase
## Port of `packages/player/src/strikePose.test.ts` (G-430): how a punch, a bat swing, a fist
## and a flinch look over time. Pure timing; the poses on a skeleton are in
## `tests/scene/test_combat_visuals.gd`.

const W := 0.12
const R := 0.26


func _f(move: StringName, t: float, w: float, r: float) -> StrikePose.Frame:
	return StrikePose.frame(move, t, w, r)


func _is(f: StrikePose.Frame, from_key: StringName, to_key: StringName) -> bool:
	return f.active and f.from_key == from_key and f.to_key == to_key


func test_a_punch_is_drawn_back_then_fully_out_exactly_when_the_blow_lands_then_back_to_the_clip() -> bool:
	var f := _f(&"punch", 0.0, W, R)
	check(_is(f, &"clip", &"chamber") and f.amount == 0.0, "starts from the clip towards the chamber")
	check(_is(_f(&"punch", W * 0.5 + 1e-6, W, R), &"chamber", &"jab"), "then the chamber to the jab")
	# Just before the strike the arm is almost out; at the strike it is fully out.
	check(_f(&"punch", W - 0.005, W, R).amount > 0.8, "almost out just before the blow")
	check(_is(_f(&"punch", W, W, R), &"jab", &"jab"), "fully out at the blow")
	check(_f(&"punch", W + R - 0.01, W, R).to_key == &"clip", "back to the clip")
	check(not _f(&"punch", W + R, W, R).active, "over")
	return true


func test_the_bat_goes_back_over_the_shoulder_comes_across_at_the_blow_and_follows_through() -> bool:
	var w := 0.22
	var r := 0.38
	check(_is(_f(&"bat", w * 0.3, w, r), &"clip", &"batBack"), "back over the shoulder")
	check(_is(_f(&"bat", w * 0.8, w, r), &"batBack", &"batHit"), "coming across")
	var f := _f(&"bat", w, w, r)
	check(_is(f, &"batHit", &"batFollow") and f.amount == 0.0, "across the front at the blow")
	check(not _f(&"bat", w + r, w, r).active, "over")
	return true


func test_the_hook_swings_out_and_across_with_the_same_timing() -> bool:
	check(_is(_f(&"hook", 0.0, W, R), &"clip", &"hookWind"), "hook starts from the clip")
	check(_is(_f(&"hook", W, W, R), &"hook", &"hook"), "hook fully across at the blow")
	check(not _f(&"hook", W + R, W, R).active, "over")
	return true


func test_the_blow_speeds_up_into_the_strike_other_stretches_are_eased() -> bool:
	# The stretch to the hit is x squared (accelerating), the others smoothstep.
	var half := _f(&"punch", W * 0.5 + (W * 0.5) * 0.5, W, R)
	check(is_equal_approx(half.amount, 0.25), "x squared into the strike (%.3f)" % half.amount)
	var ease_mid := _f(&"punch", W + R * 0.3 + (R * 0.7) * 0.5, W, R)
	check(is_equal_approx(ease_mid.amount, 0.5), "smoothstep on the recovery (%.3f)" % ease_mid.amount)
	return true


func test_the_fist_is_closed_by_the_blow_and_open_again_afterwards() -> bool:
	assert_eq(StrikePose.fist_amount(0.0, W, R), 0.0, "open at the start")
	assert_eq(StrikePose.fist_amount(W, W, R), 1.0, "a fist at the blow")
	assert_eq(StrikePose.fist_amount(W + R * 0.5, W, R), 1.0, "still closed in the follow-through")
	check(StrikePose.fist_amount(W + R - 0.001, W, R) < 0.05, "open at the end")
	assert_eq(StrikePose.fist_amount(W + R, W, R), 0.0, "open after")
	return true


func test_a_flinch_snaps_back_fast_and_is_over_in_well_under_half_a_second() -> bool:
	assert_eq(StrikePose.flinch_amount(0.0), 0.0, "none at first")
	assert_eq(StrikePose.flinch_amount(0.06), 1.0, "full at 0.06 s")
	var mid := StrikePose.flinch_amount(0.2)
	check(mid > 0.0 and mid < 1.0, "recovering at 0.2 s")
	assert_eq(StrikePose.flinch_amount(StrikePose.FLINCH_TIME), 0.0, "over")
	check(StrikePose.FLINCH_TIME < 0.5, "under half a second")
	return true


func test_the_timings_are_the_three_js_strikes() -> bool:
	var punch := StrikePose.new()
	punch.start(&"jab", 0)
	assert_near(punch.windup, 0.12, 0.00001, "punch wind-up")
	assert_near(punch.recover, 0.26, 0.00001, "punch recovery")
	var bat := StrikePose.new()
	bat.start(&"bat", 1)
	assert_near(bat.windup, 0.22, 0.00001, "bat wind-up")
	assert_near(bat.recover, 0.38, 0.00001, "bat recovery")
	return true


func test_the_hit_frame_fires_once_on_the_step_that_reaches_it_even_unseen() -> bool:
	var s := StrikePose.new()
	s.start(&"cross", 1)
	var fired := 0
	var at := -1.0
	var t := 0.0
	while s.active and t < 2.0:
		if s.step(null, 1.0 / 60.0, false):
			fired += 1
			at = s.t
		t += 1.0 / 60.0
	assert_eq(fired, 1, "one hit frame")
	check(at >= 0.12 and at < 0.12 + 1.0 / 60.0 + 1e-6, "on the step reaching the wind-up (%.4f s)" % at)
	check(not s.active, "and the blow ends")
	# A long step (a skipped frame) still lands it once.
	s.start(&"bat", 1)
	check(s.step(null, 0.3, false), "a 0.3 s step passes the 0.22 s hit")
	check(not s.step(null, 0.05, false), "and not again")
	return true
