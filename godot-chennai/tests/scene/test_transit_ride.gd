extends TestCase
## Travel by bus in the real game (decisions G-214…G-219), in game time: the transit layer loads
## with the city, route buses join the traffic, the HUD hint shows a real stop near the start and
## its next bus, a route bus comes and stands at the stop with its doors open, ACTION offers
## BOARD, boarding takes the ticket from the purse and puts the player inside with the interior
## camera, the next stop is announced in Tamil and English, FAST TRAVEL skips to it, ALIGHT puts
## the player back on the pavement on loaded ground; no boarding while wanted.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180
const SETTINGS := "user://test_transit_ride_save.json"

var _old_hour: float
var _old_origin: Vector2


func before_each() -> void:
	_old_hour = GameLoop.clock.hour
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	GameLoop.clock.hour = 11.0
	Weather.set_raining(false, true, false)


func _restore(main: Main) -> void:
	tree.paused = false
	if main != null:
		main.queue_free()
	await wait_frames(2)
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)
	GameLoop.clock.hour = _old_hour
	Sound.suspend()


func _play() -> Main:
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		return null
	main.play()
	await wait_physics_frames(2)
	return main


func _ground_y(main: Main, at: Vector3) -> float:
	var q := PhysicsRayQueryParameters3D.create(at + Vector3(0, 3, 0), at + Vector3(0, -20, 0), PhysicsLayers.WORLD)
	var hit := main.world.get_world_3d().direct_space_state.intersect_ray(q)
	return NAN if hit.is_empty() else (hit["position"] as Vector3).y


func test_board_ride_fast_travel_and_alight() -> bool:
	var main := await _play()
	if main == null:
		return true
	var t := main.transit
	if not assert_true(t != null and t.network != null, "the transit layer loaded the network"):
		await _restore(main)
		return true
	assert_true(await wait_until(func() -> bool: return main.life.population.traffic.routes == t.buses, 120), "route buses joined the traffic")
	# The served stop nearest the start (147C's "Anna Nagar Tower Station" on 23 Nov data).
	var start: Vector2 = main.world.spawn["point"]
	var stop: TransitNetwork.Stop = null
	var best := INF
	for s in t.network.stops:
		if not s.routes.is_empty() and s.position.distance_to(start) < best:
			best = s.position.distance_to(start)
			stop = s
	assert_true(best < 400.0, "a served stop %.0f m from the start" % best)
	var feet := WorldOrigin.to_scene(stop.position, 0.0)
	main.rig.place(feet + Vector3(0, 0.3, 0), 0.0)
	assert_true(await wait_until(func() -> bool: return main.world.world_ready_around(stop.position, 60.0), 60 * 20), "the stop's streets loaded")
	assert_true(await wait_until(func() -> bool: return t.hint.kind() == &"stop", 120), "the hint shows the stop")
	assert_contains(t.hint.english_label.text, stop.label(), "the stop's name on the hint")
	assert_true(t.hint.detail_label.text.contains("min") or t.hint.detail_label.text.contains("coming") or t.hint.detail_label.text.contains("at the stop"), "the next bus on the hint: %s" % t.hint.detail_label.text)
	# A bus of a route through the stop comes and stands there with its doors open.
	var came := await wait_until(func() -> bool: return t.bus_to_board() >= 0, 60 * 150)
	if not assert_true(came, "a route bus stood at the stop with its doors open (sent: %d, buses %s)" % [t.buses.sent_agent(), t.buses.snapshot().keys()]):
		await _restore(main)
		return true
	var id := t.bus_to_board()
	var view := main.life.views[id]
	assert_true(view.doors_open() > 0.5, "the doors are open")
	assert_true(view.route_sign != null and view.route_sign.visible and view.route_sign.ref_text() != "", "the destination sign shows the route")
	# Not while wanted.
	t.wanted_level = func() -> int: return 2
	assert_false(t.board(id), "no boarding while wanted")
	t.wanted_level = func() -> int: return 0
	assert_eq(main.rig.controls.action_context.label(), "BOARD", "ACTION offers BOARD")
	# A new game starts with no money: earn some first (the fare is paid from the missions' purse).
	if t.missions != null and t.missions.session != null:
		t.missions.session.runner.earn(200.0)
	var money := t._balance()
	assert_true(main.rig.controls.action_context.trigger(), "pressed ACTION")
	assert_true(t.ride.riding(), "riding")
	assert_near(t._balance(), money - t.ride.fare, 0.01, "the ticket (₹%d) was paid" % t.ride.fare)
	assert_true(t.ride.fare >= TransitFare.MIN_FARE, "a fare")
	assert_false(main.rig.body.is_on_foot(), "the player is in the bus")
	# Getting on (G-220, owner's request): walk to the front door, up the step, past the
	# conductor (the ticket), to a free seat; the interior camera once inside.
	assert_true(t.boarding(), "walking on")
	var door := view.global_transform * Vector3(view.variant.type.entry.point.x, view.model.position.y, view.variant.type.entry.point.y)
	var closest := [INF]
	var on := await wait_until(func() -> bool:
		closest[0] = minf(closest[0], Vector2(main.rig.body.global_position.x - door.x, main.rig.body.global_position.z - door.z).length())
		return not t.boarding(), 60 * 30)
	assert_true(on, "got on and sat down")
	assert_true(closest[0] < 0.4, "through the front door (passed %.2f m from its point)" % closest[0])
	assert_true(main.get_viewport().get_camera_3d() == t._eye, "the interior camera")
	assert_true(main.rig.body.figure.seat_amount > 0.99, "seated (11:00 is not the rush)")
	assert_eq(t._passengers.size(), TransitLayer.SEATED_PASSENGERS + 1, "the conductor and the seated passengers")
	if t.missions != null:
		assert_contains(t.missions.hud.toast_text(), "Ticket", "the ticket from the conductor")
	# The bus drives on; the next stop is announced.
	var at0 := main.rig.body.global_position
	assert_true(await wait_until(func() -> bool: return main.rig.body.global_position.distance_to(at0) > 20.0, 60 * 60), "the bus carries the player along its route")
	assert_true(await wait_until(func() -> bool: return t.hint.tamil_label.text.begins_with(BusRide.NEXT_TA) or t.hint.tamil_label.text.begins_with(BusRide.LAST_TA), 60 * 10), "the next stop in Tamil: %s" % t.hint.tamil_label.text)
	assert_true(t.hint.english_label.text.begins_with("Next stop") or t.hint.english_label.text.begins_with("Last stop"), "and in English: %s" % t.hint.english_label.text)
	assert_true(t.hint.fast_button.visible and t.hint.fast_button.custom_minimum_size.y >= UiTheme.MIN_TARGET, "FAST TRAVEL offered, at least 48 px tall")
	# Fast travel to the next stop.
	var next_k := int((t.buses.snapshot().get(id, {"next": 0}) as Dictionary)["next"])
	t.fast_travel()
	assert_true(await wait_until(func() -> bool: return not t._jumping, 60 * 15), "fast travel finished")
	var snap: Dictionary = t.buses.snapshot().get(id, {})
	assert_true(not snap.is_empty() and int(snap["next"]) >= next_k, "the bus is at or past the next stop")
	# Off at a stop.
	assert_true(await wait_until(func() -> bool: return main.rig.controls.action_context.label() == "ALIGHT" or not t.ride.riding(), 60 * 90), "ALIGHT offered at a stop")
	if t.ride.riding():
		assert_true(main.rig.controls.action_context.trigger(), "pressed ALIGHT")
	assert_true(await wait_until(func() -> bool: return not t.ride.riding(), 60 * 30), "walked off the bus")
	assert_false(t.ride.riding(), "off the bus")
	assert_true(main.rig.body.is_on_foot(), "on foot")
	assert_true(main.get_viewport().get_camera_3d() == main.rig.camera.camera, "the follow camera again")
	await wait_physics_frames(20)
	var p := main.rig.body.global_position
	var g := _ground_y(main, p)
	assert_true(not is_nan(g) and absf(p.y - g) < 0.6, "standing on loaded ground (feet %.2f, ground %.2f)" % [p.y, g])
	await _restore(main)
	return true
