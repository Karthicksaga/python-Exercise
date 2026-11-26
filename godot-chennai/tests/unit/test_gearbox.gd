extends TestCase
## Gearbox (G-74): P/R/D, shifting only when stopped, the HUD gear rule. Ported behaviours of
## the Three.js `Gearbox.test.ts`, `specs.test.ts` (gearFor, shiftedUp) and driving.spec.ts.


func _car() -> VehicleType:
	return VehicleCatalog.type(&"car")


func test_starts_in_drive_and_gas_drives_forwards() -> bool:
	var g := Gearbox.new()
	assert_eq(g.gear, "D", "starts in D")
	var c := g.controls(true, false, 0.3, 0.0)
	assert_eq(c.throttle, 1.0, "GAS in D drives forwards")
	assert_eq(c.brake, 0.0, "no brake")
	assert_eq(c.steer, 0.3, "steering passes through")
	c = g.controls(false, true, 0.0, 5.0)
	assert_eq(c.throttle, 0.0, "BRAKE: no throttle")
	assert_eq(c.brake, 1.0, "BRAKE brakes")
	return true


func test_reverse_when_stopped_and_gas_goes_backwards() -> bool:
	var g := Gearbox.new()
	g.select("R", 0.2)
	assert_eq(g.gear, "R", "engaged at once when stopped")
	assert_eq(g.controls(true, false, 0.0, 0.0).throttle, -1.0, "GAS in R reverses")
	assert_eq(g.label(_car(), -2.0), "R", "HUD shows R")
	return true


func test_shift_while_moving_brakes_first_then_engages() -> bool:
	var g := Gearbox.new()
	g.select("R", 12.0)
	assert_eq(g.gear, "D", "not engaged while moving")
	assert_eq(g.pending, "R", "pending")
	assert_eq(g.label(_car(), 12.0), "N", "HUD shows N while waiting")
	assert_contains(g.consume_hint(), "Stopping to shift to R", "hint")
	assert_eq(g.consume_hint(), "", "hint only once")
	var c := g.controls(true, false, 0.0, 12.0)
	assert_eq(c.throttle, 0.0, "no throttle while waiting")
	assert_eq(c.brake, 1.0, "brakes while waiting")
	c = g.controls(false, false, 0.0, 0.5)
	assert_eq(g.gear, "R", "engages once stopped")
	assert_eq(g.pending, "", "nothing pending")
	return true


func test_asking_for_the_engaged_gear_cancels_a_pending_shift() -> bool:
	var g := Gearbox.new()
	g.select("R", 10.0)
	g.select("D", 10.0)
	assert_eq(g.pending, "", "cancelled")
	assert_eq(g.controls(true, false, 0.0, 10.0).throttle, 1.0, "drives again")
	return true


func test_park_holds_and_ignores_gas() -> bool:
	var g := Gearbox.new()
	g.select("P", 0.0)
	var c := g.controls(true, false, 0.0, 0.0)
	assert_eq(c.throttle, 0.0, "no throttle in P")
	assert_eq(c.brake, 1.0, "held")
	assert_contains(g.consume_hint(), "In P", "hint to select D or R")
	assert_eq(g.label(_car(), 0.0), "P", "HUD shows P")
	return true


func test_hud_gear_climbs_with_speed() -> bool:
	var g := Gearbox.new()
	var t := _car()
	assert_eq(g.label(t, 0.0), "D", "stopped in drive: D")
	g.controls(true, false, 0.0, 0.0)
	assert_eq(g.label(t, 2.0), "D1", "slow: D1")
	assert_eq(g.label(t, t.spec.max_speed * 0.3), "D2", "30 %: D2")
	assert_eq(g.label(t, t.spec.max_speed), "D5", "top speed: top gear")
	assert_eq(g.label(t, t.spec.max_speed * 2.0), "D5", "never above the top gear")
	return true


func test_gear_for_and_shifted_up() -> bool:
	var t := _car()
	assert_eq(Gearbox.gear_for(t, -1.0, 0.0), "R", "rolling back: R")
	assert_eq(Gearbox.gear_for(t, 0.0, -1.0), "R", "reverse throttle at rest: R")
	assert_eq(Gearbox.gear_for(t, 0.1, 0.0), "N", "stopped, no throttle: N")
	assert_eq(Gearbox.gear_for(t, 0.1, 1.0), "1", "pulling away: 1")
	assert_true(Gearbox.shifted_up("D2", "D3"), "D2 to D3 is up")
	assert_true(Gearbox.shifted_up("2", "3"), "2 to 3 is up")
	assert_false(Gearbox.shifted_up("D3", "D2"), "down is not up")
	assert_false(Gearbox.shifted_up("N", "D1"), "from N is not a shift")
	assert_false(Gearbox.shifted_up("", "D1"), "from nothing is not a shift")
	return true
