extends TestCase
## The real game (`main.tscn` in the streamed city) with its vehicles, environment and pause menu
## (decisions G-110…G-115), in game time: parked vehicles near the start on loaded ground, getting
## in with ENTER, driving 20 m and getting out beside the car, crash ejection leaving the player on
## foot on the ground, the engine sound while driving, day and night changing the light, rain
## wetting the street, pause stopping game time, and parked vehicles following the chunk ring
## and the floating origin.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180
const SETTINGS := "user://test_game_vehicles_save.json"

var _old_hour: float
var _old_weather: String
var _old_sound: String
var _old_origin: Vector2


func before_each() -> void:
	_old_hour = GameLoop.clock.hour
	_old_weather = Weather.settings_path
	_old_sound = Sound.settings_path
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	# The clock is a shared autoload that other tests advance: a new game starts at golden hour.
	GameLoop.clock.hour = GameClock.GOLDEN_HOUR
	Weather.settings_path = SETTINGS
	Sound.settings_path = SETTINGS
	Weather.set_raining(false, true, false)


func _restore() -> void:
	tree.paused = false
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)
	GameLoop.clock.hour = _old_hour
	Weather.set_raining(false, true, false)
	Weather.settings_path = _old_weather
	Sound.settings_path = _old_sound
	Sound.suspend()


## The game loaded and in play, or null.
func _play() -> Main:
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		return null
	main.play()
	await wait_physics_frames(2)
	return main


## Height of the ground (anything solid of the world) under a scene point, or NAN.
func _ground_y(main: Main, at: Vector3) -> float:
	var q := PhysicsRayQueryParameters3D.create(at + Vector3(0, 3, 0), at + Vector3(0, -20, 0), PhysicsLayers.WORLD)
	var hit := main.world.get_world_3d().direct_space_state.intersect_ray(q)
	return NAN if hit.is_empty() else (hit["position"] as Vector3).y


func test_parked_car_board_drive_get_out_and_crash_ejection() -> bool:
	var main := await _play()
	if main == null:
		return true
	var p := main.play_wiring
	var d := p.driving
	var spawn := WorldOrigin.to_scene(main.world.spawn["point"] as Vector2)
	var car := p.parked.at_spot(&"car-start")
	if not assert_true(car != null, "the Three.js start car is parked (spawned %s)" % [p.parked.stats]):
		_restore()
		return true
	var gap := Vector2(car.global_position.x - spawn.x, car.global_position.z - spawn.z).length()
	assert_true(gap < 40.0, "parked %.1f m from the start" % gap)
	assert_eq(car.variant.id, &"hatchback", "a hatchback")
	assert_near(car.ground_point(Vector2.ZERO).y, _ground_y(main, car.global_position), 0.15, "standing on the loaded ground")
	assert_true(car.is_in_group(WorldOrigin.GROUP), "moves with the floating origin")
	for id: StringName in [&"bike-start", &"auto-0", &"saloon-anna-nagar"]:
		assert_true(p.parked.at_spot(id) != null, "%s parked near the start" % id)
	# ENTER (GET IN) appears beside the car, and getting in walks, opens, sits, shuts.
	d.rider.place(car.ground_point(car.type.entry.point + Vector2(float(car.type.entry.side) * 0.6, 0.0)), car.yaw())
	await wait_frames(3)
	assert_eq(main.rig.controls.action_context.label(), "GET IN", "the ACTION button offers GET IN beside the car")
	assert_true(main.rig.controls.press_action(), "ACTION gets in")
	var seated := await wait_until(func() -> bool: return d.mode() == &"driving", 60 * 8)
	assert_true(seated, "boarded and driving")
	assert_true(p.controls.gas.is_visible_in_tree() and not main.rig.controls.visible, "the driving controls replace the walking ones")
	assert_true(main.rig.camera.reach > FollowCamera.DISTANCE, "the chase camera pulls back for the car (%.1f m)" % main.rig.camera.reach)
	# Drive 20 m on the real road.
	var start := car.global_position
	d.gas = true
	var moved := await wait_until(func() -> bool: return car.global_position.distance_to(start) >= 20.0, 60 * 10)
	assert_true(moved, "drove 20 m (%.1f m)" % car.global_position.distance_to(start))
	assert_contains(p.controls.readout.text, "km/h", "HUD speed")
	assert_true(p.controls.readout.text.contains(" D"), "HUD gear: %s" % p.controls.readout.text)
	var engine: Variant = Sound.state()["engine"]
	assert_true(engine != null and String((engine as Dictionary)["kind"]) == "car", "the car's engine sounds: %s" % [engine])
	d.gas = false
	d.brake = true
	assert_true(await wait_until(func() -> bool: return absf(car.forward_speed()) < 0.5, 60 * 8), "braked to a stop")
	d.brake = false
	assert_true(d.exit(), "getting out")
	var out := await wait_until(func() -> bool: return d.mode() == &"foot" and d.boarding == null, 60 * 8)
	assert_true(out, "on foot again")
	var beside := d.rider.position().distance_to(car.global_position)
	assert_true(beside < 2.5, "beside the car (%.2f m)" % beside)
	assert_near(d.rider.position().y, _ground_y(main, d.rider.position()), 0.3, "feet on the ground")
	assert_true(main.rig.controls.visible and not p.controls.gas.is_visible_in_tree(), "walking controls back")
	assert_true(Sound.state()["engine"] == null, "engine off")
	# Crash ejection: the motorbike at 50 km/h into a wall put across the road ahead.
	var bike := p.parked.at_spot(&"bike-start")
	if not assert_true(bike != null, "the motorbike is parked"):
		_restore()
		return true
	d.rider.place(bike.ground_point(bike.type.entry.point + Vector2(float(bike.type.entry.side) * 0.4, 0.0)), bike.yaw())
	await wait_physics_frames(1)
	assert_true(d.enter(bike), "getting on the bike")
	assert_true(await wait_until(func() -> bool: return d.mode() == &"driving", 60 * 8), "riding")
	var ahead := -bike.global_basis.z
	var wall := StaticBody3D.new()
	wall.collision_layer = PhysicsLayers.WORLD
	var shape := CollisionShape3D.new()
	var box := BoxShape3D.new()
	box.size = Vector3(30, 4, 0.3)
	shape.shape = box
	wall.add_child(shape)
	main.world.add_child(wall)
	wall.global_transform = Transform3D(Basis(Vector3.UP, bike.yaw()), bike.global_position + ahead * 7.0 + Vector3(0, 2, 0))
	await wait_physics_frames(2)
	bike.set_speed(50.0 / 3.6)
	var thrown := await wait_until(func() -> bool: return d.mode() == &"thrown", 60 * 4)
	assert_true(thrown, "thrown off at 50 km/h (%s)" % [d.last_crash.type if d.last_crash != null else &"no crash"])
	assert_true(await wait_until(func() -> bool: return d.mode() == &"foot", 60 * 10), "up again on foot")
	var at := d.rider.position()
	assert_near(at.y, _ground_y(main, at), 0.3, "on the ground after the crash")
	assert_true((at - wall.global_position).dot(ahead) < 0.0, "on the near side of the wall")
	assert_true(main.rig.controls.visible, "walking controls after the crash")
	_restore()
	return true


func test_day_night_rain_and_pause() -> bool:
	var main := await _play()
	if main == null:
		return true
	var env := main.play_wiring.environment
	assert_true(main.world.get_node_or_null(^"Sun") == null and main.world.get_node_or_null(^"Environment") == null, "the stand-in sun and sky are replaced")
	assert_near(Lighting.wrap_hour(GameLoop.clock.hour), GameClock.GOLDEN_HOUR, 0.25, "starts at golden hour")
	assert_true(env.lamp_count() > 0, "the city's poles carry lamps (%d)" % env.lamp_count())
	GameLoop.clock.hour = 12.5
	await wait_frames(3)
	var noon_sun := env.environment.sun.light_energy
	var noon_glow := main.world.materials.walls.emission_energy_multiplier
	GameLoop.clock.hour = 21.5
	await wait_frames(3)
	await wait_game_seconds(0.5)
	assert_true(env.environment.sun.light_energy < noon_sun * 0.6, "night is darker (sun %.2f, noon %.2f)" % [env.environment.sun.light_energy, noon_sun])
	assert_true(main.world.materials.walls.emission_energy_multiplier > noon_glow + 0.5, "windows glow at night")
	assert_true(env.environment.street_lights.lit_lights() > 0, "street lights lit at night")
	Weather.set_raining(true, true, false)
	await wait_frames(3)
	assert_near(float(main.world.materials.ground.get_shader_parameter("wet")), 1.0, 0.01, "the street is wet in the rain")
	assert_true(env.environment.rain.visible, "rain streaks")
	Weather.set_raining(false, true, false)
	# Pause: game time, physics and the clock stop; the menu shows real settings and fits.
	var car := main.play_wiring.parked.at_spot(&"car-start")
	car.linear_velocity = Vector3(0, 0, -5)
	main.go_back()
	assert_eq(main.state, &"paused", "Back in play pauses")
	assert_true(main.pause_menu.is_open() and tree.paused, "the pause menu is open and the tree paused")
	var seconds := GameLoop.game_seconds
	var hour := GameLoop.clock.hour
	var where := car.global_position
	await wait_frames(30)
	assert_eq(GameLoop.game_seconds, seconds, "game time stopped")
	assert_eq(GameLoop.clock.hour, hour, "the clock stopped")
	assert_true(car.global_position.distance_to(where) < 0.001, "the world stopped")
	var weather := main.pause_menu.setting_button(&"Weather")
	assert_eq(weather.text, "Weather: Clear", "weather setting shows its value")
	weather.pressed.emit()
	assert_true(Weather.raining and weather.text == "Weather: Rain", "WEATHER switches the rain on")
	var time := main.pause_menu.setting_button(&"Time")
	time.pressed.emit()
	assert_eq(GameLoop.clock.label(), "Morning", "TIME moves Night to Morning")
	assert_contains(time.text, "Morning", "TIME shows the new time")
	(main.pause_menu.find_child("Resume", true, false) as Button).pressed.emit()
	assert_eq(main.state, &"play", "RESUME")
	await wait_physics_frames(10)
	assert_true(GameLoop.game_seconds > seconds, "game time runs again")
	main.go_back()
	main.go_back()
	assert_eq(main.state, &"title", "Back from the pause menu goes to the title")
	assert_false(tree.paused, "not paused at the title")
	_restore()
	return true


func test_parked_vehicles_follow_the_chunk_ring_and_origin() -> bool:
	var main := await _play()
	if main == null:
		return true
	var parked := main.play_wiring.parked
	var car := parked.at_spot(&"car-start")
	if not assert_true(car != null, "the start car is parked"):
		_restore()
		return true
	var world_at := WorldOrigin.to_world(car.global_position)
	WorldOrigin.recentre(WorldOrigin.origin_x + 500.0, WorldOrigin.origin_z - 300.0)
	await wait_physics_frames(2)
	assert_true(WorldOrigin.to_world(car.global_position).distance_to(world_at) < 0.05, "same world place after an origin shift")
	# Off to T. Nagar: the start's vehicles go with their chunks, T. Nagar's appear on its ground.
	var spot := parked.spot(&"car-tnagar")
	main.rig.place(WorldOrigin.to_scene(spot.near, 0.5), 0.0)
	var freed := await wait_until(func() -> bool: return parked.at_spot(&"car-start") == null, 60 * 30)
	assert_true(freed, "the start car is freed far away")
	assert_true(await wait_until(func() -> bool: return spot.state == &"ready", 60 * 60), "T. Nagar's spot found its kerb")
	# Step 25 m along the street from the spot, so the player does not stand on it.
	main.rig.place(WorldOrigin.to_scene(spot.point + Vector2(-sin(spot.yaw), -cos(spot.yaw)) * 25.0, 0.5), spot.yaw)
	var arrived := await wait_until(func() -> bool: return parked.at_spot(&"car-tnagar") != null, 60 * 120)
	assert_true(arrived, "T. Nagar's car is parked once its streets load (%s)" % [parked.stats])
	# The taxi's spot is further along (outside the spawn reach from here): walk there.
	var taxi_spot := parked.spot(&"taxi-t-nagar")
	assert_true(await wait_until(func() -> bool: return taxi_spot.state == &"ready", 60 * 60), "the taxi's spot found its kerb")
	main.rig.place(WorldOrigin.to_scene(taxi_spot.point + Vector2(-sin(taxi_spot.yaw), -cos(taxi_spot.yaw)) * 25.0, 0.5), taxi_spot.yaw)
	assert_true(await wait_until(func() -> bool: return parked.at_spot(&"taxi-t-nagar") != null, 60 * 120), "the taxi is parked when the player arrives (%s)" % [parked.stats])
	for id: StringName in parked.vehicles:
		var v := parked.at_spot(id)
		if v == null:
			continue
		var w := WorldOrigin.to_world(v.global_position)
		assert_true(main.world.world_ready_around(w, ParkedVehicles.READY_RADIUS), "%s stands on loaded ground" % id)
		assert_true(w.distance_to(main.world.streamer.focus) <= parked.free_reach, "%s within the ring" % id)
	_restore()
	return true


## TAKE OVER in the real game (G-300): `Main` wires `Carjacking` to the ACTION button, and
## pressing it beside a moving traffic car pulls the driver out and the player drives it.
func test_main_wires_take_over_for_moving_traffic() -> bool:
	var main := await _play()
	if main == null:
		return true
	assert_true(main.carjacking != null, "main made the carjacking")
	assert_true(main.carjacking.life == main.life and main.carjacking.driving == main.play_wiring.driving, "on the game's life layer and driving")
	var ctx := main.rig.controls.action_context
	var d := main.play_wiring.driving
	var traffic := main.life.population.traffic
	var pick := func() -> AgentSystem.Agent:
		var best: AgentSystem.Agent = null
		var best_d := INF
		for a in traffic.agents:
			var k := traffic.kinds[a.kind]
			if a.active and (k.group == &"car" or k.group == &"bike") and a.speed > 3.0 and a.pos.distance_to(main.life.focus_world()) < best_d:
				best = a
				best_d = a.pos.distance_to(main.life.focus_world())
		return best
	var found := await wait_until(func() -> bool: return pick.call() != null, 60 * 60)
	if not assert_true(found, "a moving car or bike is near"):
		_restore()
		return true
	var id: int = (pick.call() as AgentSystem.Agent).id
	var follow := func(stop: Callable) -> bool:
		var a := traffic.agents[id]
		var k := traffic.kinds[a.kind]
		main.rig.body.global_position = WorldOrigin.to_scene(a.pos + Vector2(cos(a.heading), -sin(a.heading)) * (k.half_width + 0.9), a.y + 0.1)
		return bool(stop.call())
	var offered := await wait_until(func() -> bool: return follow.call(func() -> bool: return ctx.label() == "TAKE OVER"), 60 * 8)
	assert_true(offered, "the ACTION button reads TAKE OVER beside it")
	if offered:
		assert_true(ctx.trigger(), "pressed")
		await wait_until(func() -> bool: return follow.call(func() -> bool: return main.carjacking.vehicle != null), 60 * 2)
		assert_true(main.carjacking.vehicle != null, "the vehicle is swapped in")
		assert_true(await wait_until(func() -> bool: return d.mode() == &"driving", 60 * 15), "and the player is driving it")
	_restore()
	return true
