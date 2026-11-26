extends TestCase
## Port of `packages/game-world/src/clock.test.ts`.


func test_starts_at_golden_hour_advances_and_wraps() -> bool:
	var clock := GameClock.new()
	assert_near(clock.hour, 17.75, 0.000001, "golden hour")
	assert_eq(clock.label(), "Evening", "label")
	clock.hour = 23.9
	clock.advance(60.0 * 0.2)  # 12 real seconds at one hour per minute
	assert_near(clock.hour, 0.1, 0.00001, "wrapped past midnight")
	assert_eq(clock.text(), "00:06", "text")
	return true


func test_cycles_through_the_named_times() -> bool:
	var clock := GameClock.new(21.5)
	clock.next()
	assert_eq(clock.label(), "Morning", "after Night")
	assert_near(GameClock.new(NAN).hour, 17.75, 0.000001, "NaN start")
	return true
