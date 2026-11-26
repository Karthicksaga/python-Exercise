extends TestCase
## Boarding sequences (G-77): the Three.js Boarding.test.ts behaviours, the carjacking pull phase
## (TD-30) and the approach path that never crosses the body.


func _entry(kind: StringName) -> VehicleType.Entry:
	return VehicleCatalog.type(kind).entry


func _phases(b: Boarding, dt: float = 1.0 / 60.0) -> Array[StringName]:
	var seen: Array[StringName] = []
	for i in 2000:
		if b.done():
			break
		if seen.is_empty() or seen[seen.size() - 1] != b.phase():
			seen.append(b.phase())
		b.step(dt)
	return seen


func test_car_in_walk_open_sit_close() -> bool:
	var b := Boarding.new("in", _entry(&"car"), 2.8)
	assert_eq(_phases(b), [&"approach", &"open", &"sit", &"close"] as Array[StringName], "phases in order")
	var c := Boarding.new("in", _entry(&"car"), 1.4)
	assert_near(c.duration(), 1.0 + 0.5 + 0.7 + 0.4, 0.001, "1 s walk + door + sit + close")
	assert_near(Boarding.new("in", _entry(&"car"), 50.0).duration_of(&"approach"), Boarding.APPROACH_LIMIT, 0.001, "a long walk is hurried")
	return true


func test_car_out_frees_the_player_before_the_door_shuts() -> bool:
	var b := Boarding.new("out", _entry(&"car"))
	var events: Array[StringName] = []
	var free_while_closing := false
	for i in 200:
		events.append_array(b.step(1.0 / 60.0))
		if b.phase() == &"close" and b.is_free():
			free_while_closing = true
	assert_true(events.has(&"door_opening") and events.has(&"free") and events.has(&"shut") and events.has(&"done"), "events %s" % [events])
	assert_true(events.find(&"free") < events.find(&"shut"), "free before the slam")
	assert_true(free_while_closing, "control back while the door closes")
	return true


func test_door_amount_eases_open_and_shut() -> bool:
	var b := Boarding.new("in", _entry(&"car"), 0.0)
	assert_eq(b.door(), 0.0, "shut at the start")
	b.step(0.25)
	assert_near(b.door(), 0.5, 0.01, "half open half way")
	b.step(0.3)
	assert_eq(b.door(), 1.0, "open while sitting")
	b.step(0.65 + 0.2)
	assert_near(b.door(), 0.5, 0.01, "half shut half way through closing")
	return true


func test_no_door_vehicles_skip_door_steps() -> bool:
	for kind: StringName in [&"auto", &"bike"]:
		var b := Boarding.new("in", _entry(kind), 1.4)
		var phases := _phases(b)
		assert_false(phases.has(&"open") or phases.has(&"close"), "%s: no door steps" % kind)
		var d := Boarding.new("in", _entry(kind), 0.0)
		for i in 100:
			d.step(1.0 / 60.0)
			check(d.door() == 0.0, "%s: door stays 0" % kind)
	assert_near(Boarding.new("in", _entry(&"bike")).duration_of(&"sit"), Boarding.SWING_TIME, 0.001, "a leg over the bike is slower")
	return true


func test_bus_climbs_the_aisle() -> bool:
	var b := Boarding.new("in", _entry(&"bus"), 1.0, 1.6)
	var phases := _phases(b)
	assert_eq(phases, [&"approach", &"open", &"climb", &"sit", &"close"] as Array[StringName], "bus phases")
	var c := Boarding.new("in", _entry(&"bus"), 0.0, 1.6)
	c.step(0.5 + 0.3)
	assert_true(c.aisle() > 0.0 and c.aisle() < 1.0, "part way along the aisle")
	return true


func test_carjacking_pull_phase() -> bool:
	var b := Boarding.new("in", _entry(&"car"), 1.0, 0.0, true)
	var events: Array[StringName] = []
	var phases: Array[StringName] = []
	for i in 400:
		if not phases.has(b.phase()):
			phases.append(b.phase())
		events.append_array(b.step(1.0 / 60.0))
	assert_true(phases.find(&"pull") > phases.find(&"open") and phases.find(&"pull") < phases.find(&"sit"), "pull between open and sit: %s" % [phases])
	assert_true(events.has(&"pulled"), "pulled event")
	return true


func test_approach_path_goes_round_never_through() -> bool:
	var e := _entry(&"car")
	var half := Vector2(0.82, 1.95)
	# From the far (left) side, beside the car: round an end to the right-hand door.
	var path := Boarding.approach_path(Vector2(-2.0, 0.0), e, half)
	assert_true(path.size() >= 3, "goes round a corner")
	for i in range(1, path.size()):
		for s in 11:
			var p := path[i - 1].lerp(path[i], s / 10.0)
			check(absf(p.x) > half.x or absf(p.y) > half.y, "path point %s outside the body" % p)
	assert_vec_near(path[path.size() - 1], e.point, 0.001, "ends at the door")
	var direct := Boarding.approach_path(Vector2(3.0, 0.5), e, half)
	assert_eq(direct.size(), 2, "already on the door side: straight there")
	var mid := Boarding.along_path(direct, 0.5)
	assert_vec_near(Vector2(mid.x, mid.y), direct[0].lerp(direct[1], 0.5), 0.001, "half way")
	return true
