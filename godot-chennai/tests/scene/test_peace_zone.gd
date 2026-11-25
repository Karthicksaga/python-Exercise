extends YardTest
## A peace zone keeps its rules in the systems that ask (G-471), in the vehicle yard: nobody gets
## into a vehicle inside the forecourt (told to leave it outside), the horn is quiet, a hit
## throws no sparks or camera shake, nobody is pulled out of a vehicle, no crime is reported.
## The same things happen normally outside the zone. Waits in game time.

var _old_origin: Vector2


func before_each() -> void:
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	WorldOrigin.recentre(0.0, 0.0)
	await super.before_each()


func _restore() -> void:
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)


## A zone round the yard's middle (the car and the player stand inside it) or far away.
func _zone(near: bool) -> PeaceZones:
	var data := CultureData.parse("""{"peace_zones": [{"id": "t", "centre": [%d, 0], "radius": 100, "walk_radius": 50,
		"rules": {"violence": false, "wanted": false, "crash_effects": false, "horn": false, "boarding": false, "take_over": false, "run": false, "swim": false}}]}""" % (0 if near else 5000))
	return PeaceZones.from_data(data)


func test_nobody_gets_into_a_vehicle_inside_the_forecourt() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	yard.rider.place(car.ground_point(Vector2(2.0, 0.0)), 0.0)
	await wait_physics_frames(1)
	var toasts: Array[String] = []
	yard.driving.toast.connect(func(t: String) -> void: toasts.append(t))
	yard.driving.peace = _zone(true)
	yard.wiring.peace = yard.driving.peace
	assert_false(yard.driving.enter(car), "getting in is refused inside the forecourt")
	assert_eq(yard.driving.mode(), &"foot", "still on foot")
	assert_true(toasts.has("Please leave your vehicle outside the temple."), "and told so: %s" % str(toasts))
	assert_true(yard.wiring._get_in() == null, "the ACTION button offers no GET IN there")
	# The same car outside any zone.
	yard.driving.peace = _zone(false)
	yard.wiring.peace = yard.driving.peace
	assert_true(yard.wiring._get_in() != null, "GET IN is offered outside the zone")
	assert_true(await board(car), "and getting in works")
	return true


func test_the_horn_and_the_crash_show_stay_quiet_inside() -> bool:
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	assert_true(await board(car), "driving")
	var horns := [0]
	yard.driving.horn.connect(func(_v: Vehicle) -> void: horns[0] += 1)
	yard.driving.press_horn()
	assert_eq(horns[0], 1, "the horn sounds in the city")
	var outcome := CrashRules.Outcome.new()
	outcome.type = &"fall"
	var camera := yard.rig.camera
	camera.trauma = 0.0
	yard.wiring.feedback(car, outcome)
	assert_true(camera.trauma > 0.3, "a hit shakes the camera in the city (%.2f)" % camera.trauma)
	# Inside a peace zone: no horn, no shake.
	yard.driving.peace = _zone(true)
	yard.wiring.peace = yard.driving.peace
	yard.driving.press_horn()
	assert_eq(horns[0], 1, "no horn in the peace zone")
	camera.trauma = 0.0
	yard.wiring.feedback(car, outcome)
	assert_eq(camera.trauma, 0.0, "no crash show in the peace zone")
	return true


func test_no_crime_is_reported_and_nobody_is_pulled_out_inside() -> bool:
	var carjacking := Carjacking.new()
	carjacking.driving = yard.driving
	# A traffic car right beside the player (as the AI step would have offered it).
	var at := WorldOrigin.to_world(yard.rider.position())
	carjacking._offered = {"id": 7, "kind": "car", "x": at.x + 2.0, "z": at.y, "heading": 0.0, "speed": 3.0, "half_width": 1.0, "half_length": 2.0}
	assert_true(carjacking.offer() != null, "TAKE OVER is offered in the city")
	carjacking.peace = _zone(true)
	assert_true(carjacking.offer() == null, "and not inside a peace zone")
	carjacking.peace = _zone(false)
	assert_true(carjacking.offer() != null, "again outside it")
	# The two crime reporters ask `peace.allows("wanted", ...)` before they report.
	assert_false(_zone(true).allows("wanted", at), "no crime is reported in the zone")
	assert_true(_zone(false).allows("wanted", at), "but is in the city")
	carjacking.free()
	return true
