extends TestCase
## Traffic, walkers and crowds in the streamed city (G-120…G-128), on today's world (format 1):
## nothing before the ground is in, vehicles and people where the AI puts them, on shown chunks,
## drivers in their seats, signal heads drawn, and carjacking (TD-30) end to end: stand in front
## of a car, it stops, get in, the driver is pulled out, the crime is signalled, the car is the
## player's; walking away instead undoes the swap. Waits in game time.

const CITY := "res://src/game_world/city/city_world.tscn"
const MAX_FRAMES := 60 * 240

var world: CityWorld
var body: PlayerController
var life: CityLife
var driving: Driving


func before_each() -> void:
	(tree.root.get_node("/root/WorldOrigin") as Node).call("recentre", 0.0, 0.0)
	world = (load(CITY) as PackedScene).instantiate() as CityWorld
	root.add_child(world)


func _start() -> bool:
	if not check(await world.setup(CityTestKit.v1()) == "", "the city sets up"):
		return false
	var spawn: Vector2 = world.spawn["point"]
	body = PlayerController.new()
	body.input = PlayerInput.new()
	world.add_child(body)
	body.global_position = WorldOrigin.to_scene(spawn, 0.1)
	world.focus_node = body
	if not check(await world.wait_ready_around(spawn, -1.0, MAX_FRAMES), "the start's streets load"):
		return false
	life = CityLife.make(world, body)
	life.hour_override = 18.0
	world.add_child(life)
	if not check(await life.prepare(spawn) == "", "traffic and people are made during loading"):
		return false
	driving = Driving.new()
	driving.rider = PlayerRiderLink.make(body)
	world.add_child(driving)
	return true


func test_traffic_walkers_and_crowds_appear_on_loaded_ground() -> bool:
	if not await _start():
		return false
	await wait_physics_frames(60 * 8)
	var c := life.counts()
	assert_true(int(c["vehicles"]) >= 6, "traffic on the streets at 18:00 (%s)" % [c])
	assert_true(int(c["walkers"]) >= 4, "people walking (%s)" % [c])
	assert_true(int(c["figures"]) >= int(c["walkers"]), "everyone near is drawn (%s)" % [c])
	var shown: Dictionary[Vector2i, bool] = {}
	for cell in world.streamer.shown_cells():
		shown[cell] = true
	var traffic := life.population.traffic
	var drivers := 0
	for a in traffic.agents:
		if not a.active:
			continue
		assert_true(shown.has(world.source.cell_at(a.pos)), "vehicle %d is on a shown chunk" % a.id)
		var v := life.views[a.id]
		assert_true(v.visible, "vehicle %d is drawn" % a.id)
		# The view is a frame behind the agent at most (it shows the last finished step).
		var at := WorldOrigin.to_world(v.global_position)
		assert_true(at.distance_to(a.pos) < a.speed / 30.0 + 0.2, "vehicle %d's view is where it is (%.2f m)" % [a.id, at.distance_to(a.pos)])
		var road := world.nearest_road_point(a.pos)
		assert_true(float(road.get("distance", 99.0)) < 12.0, "vehicle %d is on a road (%.1f m from one)" % [a.id, float(road.get("distance", 99.0))])
	# Wait for a vehicle near the camera: its driver sits at the wheel.
	var cam := tree.root.get_viewport().get_camera_3d()
	var near := func() -> TrafficVehicleView:
		for v in life.views:
			if v.visible and v.global_position.distance_to(cam.global_position) < CityLife.DRIVER_REACH - 5.0:
				return v
		return null
	assert_true(await wait_until(func() -> bool: return near.call() != null, 60 * 40), "traffic comes near the player")
	await wait_physics_frames(2)
	var close: TrafficVehicleView = near.call()
	if close != null:
		var seat := close.driver_transform().origin
		for child in life.pool.get_children():
			var p := child as PersonView
			if p != null and p.visible and p.clip == &"sit" and p.global_position.distance_to(seat) < 1.5:
				drivers += 1
	assert_true(drivers == 1, "a driver sits in the vehicle near the player (%d)" % drivers)
	assert_true(int(life.stats["frames"]) > 400, "the AI stepped every physics frame (%d)" % int(life.stats["frames"]))
	return true


func test_the_ai_waits_for_the_ground() -> bool:
	if not check(await world.setup(CityTestKit.v1()) == "", "the city sets up"):
		return false
	var spawn: Vector2 = world.spawn["point"]
	var focus := Node3D.new()
	world.add_child(focus)
	focus.global_position = WorldOrigin.to_scene(spawn)
	world.focus_node = focus
	life = CityLife.make(world, focus)
	world.add_child(life)
	assert_true(await life.prepare(spawn) == "", "prepared")
	# Prepared before anything was shown: no one may be out yet.
	var out := 0
	var shown: Dictionary[Vector2i, bool] = {}
	for cell in world.streamer.shown_cells():
		shown[cell] = true
	for a in life.population.traffic.agents:
		if a.active and not shown.has(world.source.cell_at(a.pos)):
			out += 1
	assert_eq(out, 0, "nobody stands on ground that has not loaded")
	assert_true(await world.wait_ready_around(spawn, -1.0, MAX_FRAMES), "then the streets load")
	await wait_physics_frames(60 * 4)
	assert_true(life.population.traffic.active_count() > 0, "and the traffic comes out (%d)" % life.population.traffic.active_count())
	return true


## A car on the player's street, driving towards a point ahead of it in its lane.
func _car_ahead() -> AgentSystem.Agent:
	var traffic := life.population.traffic
	var best: AgentSystem.Agent = null
	var best_d := INF
	var focus := life.focus_world()
	for a in traffic.agents:
		var k := traffic.kinds[a.kind]
		if not a.active or k.group != &"car" or a.speed < 2.0:
			continue
		var d := a.pos.distance_to(focus)
		if d < best_d:
			best_d = d
			best = a
	return best


func test_carjacking_stop_a_car_pull_the_driver_out_and_drive_off() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var crimes: Array[StringName] = []
	jack.carjacked.connect(func(look: StringName, _at: Vector2) -> void: crimes.append(look))
	await wait_physics_frames(60 * 4)
	var car := _car_ahead()
	if not check(car != null, "a car is driving near the player"):
		return false
	# Step into its lane 14 m ahead of it.
	var f := Vector2(-sin(car.heading), -cos(car.heading))
	var stand := car.pos + f * 14.0
	body.global_position = WorldOrigin.to_scene(stand, 0.1)
	if not check(await wait_until(func() -> bool: return car.speed < 0.3, 60 * 12), "the car stops in front of the player (%.1f m/s)" % car.speed):
		return false
	# Walk up to its bonnet.
	var nose := car.pos + Vector2(-sin(car.heading), -cos(car.heading)) * (life.population.traffic.kinds[car.kind].half_length + 1.0)
	body.global_position = WorldOrigin.to_scene(nose, 0.1)
	var ok := await wait_until(func() -> bool: return jack.vehicle != null, 60 * 3)
	if not check(ok, "beside it, it can be taken"):
		return false
	var taken := jack.vehicle
	var paint := life.views[jack.agent_id].paint
	var id := jack.agent_id
	assert_true(driving.nearest_vehicle() == taken, "it is the vehicle the Get-in button offers")
	assert_true(driving.enter(driving.nearest_vehicle()), "getting in starts")
	assert_true(driving.boarding.phase() == &"approach" or driving.boarding.phase() == &"open", "walking to the door")
	ok = await wait_until(func() -> bool: return driving.mode() == &"driving", 60 * 15)
	assert_true(ok, "the player ends up at the wheel")
	assert_eq(crimes.size(), 1, "pulling the driver out is a crime, once")
	assert_eq(int(jack.stats["taken"]), 1, "the car is taken")
	assert_true(driving.vehicle == taken, "the player drives the taken car")
	assert_true(taken.variant.paint.is_equal_approx(paint), "in the traffic car's paint")
	assert_false(life.taken.has(id), "its agent is back in the pool")
	await wait_physics_frames(30)
	var a := life.population.traffic.agents[id]
	if a.active:
		assert_true(a.pos.distance_to(WorldOrigin.to_world(taken.global_position)) > 20.0, "somewhere else, out of sight")
	return true


func test_walking_away_from_a_stopped_car_lets_it_drive_on() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	await wait_physics_frames(60 * 4)
	var car := _car_ahead()
	if not check(car != null, "a car is driving near the player"):
		return false
	var f := Vector2(-sin(car.heading), -cos(car.heading))
	body.global_position = WorldOrigin.to_scene(car.pos + f * 14.0, 0.1)
	if not check(await wait_until(func() -> bool: return car.speed < 0.3, 60 * 12), "the car stops"):
		return false
	body.global_position = WorldOrigin.to_scene(car.pos + f * (life.population.traffic.kinds[car.kind].half_length + 1.0), 0.1)
	if not check(await wait_until(func() -> bool: return jack.vehicle != null, 60 * 3), "swapped while stopped"):
		return false
	var id := jack.agent_id
	# Off the road, 20 m to the side.
	body.global_position += Vector3(f.y, 0, -f.x) * 20.0
	assert_true(await wait_until(func() -> bool: return jack.vehicle == null, 60 * 3), "the swap is undone")
	assert_false(life.taken.has(id), "the traffic car is the AI's again")
	await wait_physics_frames(60 * 4)
	assert_true(life.views[id].visible, "and drawn again")
	assert_eq(int(jack.stats["undone"]), 1, "undone once")
	return true
