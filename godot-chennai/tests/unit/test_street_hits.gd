extends TestCase
## Street hits (G-362): the bands by speed, the swept touch test, the launch, riders falling off by
## their kind's `fall_from`, and that a child can never be hit.


func test_bands_by_speed() -> bool:
	assert_eq(StreetHits.band(0.5), &"none", "creeping: people make way")
	assert_eq(StreetHits.band(StreetHits.STAGGER_FROM), &"stagger", "from STAGGER_FROM a stagger")
	assert_eq(StreetHits.band(3.0), &"stagger", "11 km/h: a stagger")
	assert_eq(StreetHits.band(StreetHits.FALL_FROM), &"fall", "from FALL_FROM a fall")
	assert_eq(StreetHits.band(15.0), &"fall", "54 km/h: a fall")
	return true


func test_touch_is_the_box_plus_the_radius() -> bool:
	var half := Vector2(0.8, 1.8)
	var fwd := Vector2(0, -1)
	assert_true(StreetHits.touches(Vector2.ZERO, fwd, half, Vector2(0, -2.0), 0.3), "just ahead of the bumper")
	assert_false(StreetHits.touches(Vector2.ZERO, fwd, half, Vector2(0, -2.2), 0.3), "a step ahead")
	assert_true(StreetHits.touches(Vector2.ZERO, fwd, half, Vector2(1.05, 0.0), 0.3), "at the side")
	assert_false(StreetHits.touches(Vector2.ZERO, fwd, half, Vector2(1.2, 0.0), 0.3), "beside it")
	# Turned 90°: the long side lies along x.
	assert_true(StreetHits.touches(Vector2.ZERO, Vector2(1, 0), half, Vector2(2.0, 0.0), 0.3), "turned: ahead")
	assert_false(StreetHits.touches(Vector2.ZERO, Vector2(1, 0), half, Vector2(0.0, -1.5), 0.3), "turned: clear at the side")
	return true


func test_the_sweep_catches_a_person_passed_between_steps() -> bool:
	var half := Vector2(0.8, 1.8)
	var fwd := Vector2(0, -1)
	# 20 m/s at 30 Hz: 0.67 m a step. The person stood just behind where the front is now.
	var vel := Vector2(0, -20)
	var p := Vector2(0, 0.0)
	assert_true(StreetHits.swept(Vector2(0, -2.5), fwd, half, vel, 1.0 / 30.0, p, 0.3), "inside the swept box")
	assert_false(StreetHits.swept(Vector2(0, -2.5), fwd, half, vel, 1.0 / 30.0, Vector2(3, 0), 0.3), "far to the side")
	return true


func test_launch_goes_along_and_away_and_up() -> bool:
	var l := StreetHits.launch(Vector2(0, -10), Vector2(0.5, -2.0))
	assert_true(l.z < -5.0, "along the travel (%s)" % l)
	assert_true(l.x > 0.0, "away from the vehicle's line, to the side they stood (%s)" % l)
	assert_near(l.y, clampf(StreetHits.UP_PER_SPEED * 10.0, StreetHits.UP_MIN, StreetHits.UP_MAX), 0.001, "upwards")
	var slow := StreetHits.launch(Vector2(4.0, 0), Vector2(1.0, 0.0))
	assert_near(slow.y, StreetHits.UP_MIN, 0.001, "a slow hit still lifts the feet")
	return true


func test_riders_fall_off_open_seats_only() -> bool:
	var bike := VehicleCatalog.type(&"bike").crash
	var car := VehicleCatalog.type(&"car").crash
	assert_true(StreetHits.rider_falls(bike.fall_from, bike.fall_from + 1.0), "a bike rider at fall_from falls")
	assert_false(StreetHits.rider_falls(bike.fall_from, bike.fall_from - 5.0), "below it stays on")
	assert_false(StreetHits.rider_falls(car.fall_from, 200.0), "a car driver never falls out")
	return true


func test_a_child_can_never_be_hit() -> bool:
	assert_false(StreetHits.can_be_hit(true, false), "a child")
	assert_false(StreetHits.can_be_hit(false, true), "a crowd spot at play (the cricket boy)")
	assert_false(StreetHits.can_be_hit(true, true), "both")
	assert_true(StreetHits.can_be_hit(false, false), "an adult")
	# Walkers (the only agents that can be struck) are adults and never teens, by the cast.
	var people := PeopleManifest.open(PeoplePool.MANIFEST)
	var entries: Array[Dictionary] = []
	entries.assign(people.entries)
	var cast := CastPicker.create(entries)
	var minors := 0
	for e in entries:
		if CastPicker.is_minor(e):
			minors += 1
			assert_false(cast.walkers.has(str(e["id"])), "%s never walks the streets" % e["id"])
			assert_false(cast.crowd.has(str(e["id"])), "%s is never an ordinary crowd adult" % e["id"])
	assert_true(minors > 0, "the cast has children to keep safe (%d)" % minors)
	return true
