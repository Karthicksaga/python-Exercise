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


## --- Taking over MOVING traffic with the ACTION button (G-300) -----------------------------

## The nearest active traffic agent of a group going faster than `min_speed`, or null.
func _moving(group: StringName, min_speed: float) -> AgentSystem.Agent:
	var traffic := life.population.traffic
	var best: AgentSystem.Agent = null
	var best_d := INF
	var focus := life.focus_world()
	for a in traffic.agents:
		if not a.active or traffic.kinds[a.kind].group != group or a.speed < min_speed:
			continue
		var d := a.pos.distance_to(focus)
		if d < best_d:
			best_d = d
			best = a
	return best


## Keep the player standing beside the vehicle of agent `id`, on its right, until `done`.
func _walk_with(id: int, done: Callable, frames: int) -> bool:
	var traffic := life.population.traffic
	var follow := func() -> bool:
		var a := traffic.agents[id]
		var k := traffic.kinds[a.kind]
		var right := Vector2(cos(a.heading), -sin(a.heading))
		var p := a.pos + right * (k.half_width + 0.9)
		body.global_position = WorldOrigin.to_scene(p, a.y + 0.1)
		return bool(done.call())
	return await wait_until(follow, frames)


## Take over a moving vehicle of `group` end to end through an ActionContext, the way the touch
## button does. Returns the taken Vehicle or null (a failed check).
func _take_over_moving(group: StringName, jack: Carjacking) -> Vehicle:
	var ctx := ActionContext.new()
	ctx.add_source(jack.offer)
	var found := await wait_until(func() -> bool: return _moving(group, 3.0) != null, 60 * 40)
	if not check(found, "a moving %s is on the streets" % group):
		return null
	var agent := _moving(group, 3.0)
	var id := agent.id
	var speed_at_offer := [0.0]
	var offered := await _walk_with(id, func() -> bool:
		speed_at_offer[0] = life.population.traffic.agents[id].speed
		return ctx.label() == "TAKE OVER", 60 * 6)
	if not check(offered, "TAKE OVER is offered beside the moving %s" % group):
		return null
	assert_true(float(speed_at_offer[0]) >= Carjack.MAX_SPEED, "it was moving (%.1f m/s)" % float(speed_at_offer[0]))
	assert_true(jack.vehicle == null, "nothing is swapped before the press")
	assert_true(ctx.trigger(), "the button runs it")
	if not check(await _walk_with(id, func() -> bool: return jack.vehicle != null, 60 * 2), "the vehicle is swapped in at the next step"):
		return null
	assert_eq(jack.agent_id, id, "the one that was offered")
	assert_eq(driving.mode(), &"boarding", "the boarding with the pull starts")
	assert_true(driving.boarding.phase() != &"done", "walking to the door")
	return jack.vehicle


func _ride_off(jack: Carjacking, taken: Vehicle, crimes: Array[StringName]) -> void:
	var id := jack.agent_id
	var ok := await wait_until(func() -> bool: return driving.mode() == &"driving", 60 * 15)
	assert_true(ok, "the player ends up at the wheel")
	await wait_physics_frames(6)  # the next AI step hands the vehicle over
	var crash := "" if driving.last_crash == null else "%s %.0f km/h" % [driving.last_crash.type, driving.last_crash.impact_kmh]
	assert_true(driving.last_crash == null, "no crash on the way in (%s)" % crash)
	assert_eq(crimes.size(), 1, "pulling the driver out is a crime, once")
	assert_eq(jack.fleeing_count(), 1, "the driver is out of the vehicle and running off")
	assert_true(driving.vehicle == taken, "the player drives the taken vehicle")
	assert_true(taken.is_driven(), "driven")
	assert_eq(int(jack.stats["taken"]), 1, "taken")
	assert_false(life.taken.has(id), "its agent is back in the pool")
	assert_true(taken.is_in_group(Vehicle.GROUP), "an ordinary vehicle of the game")
	# Every change to the agents came between the AI's steps (G-364: the pull's scare did not).
	assert_eq(int(life.stats.get("off_step_changes", 0)), 0, "no agent changed while the AI step may run")


func test_take_over_a_moving_car_from_the_action_button() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var crimes: Array[StringName] = []
	jack.carjacked.connect(func(look: StringName, _at: Vector2) -> void: crimes.append(look))
	var taken := await _take_over_moving(&"car", jack)
	if taken == null:
		return false
	await _ride_off(jack, taken, crimes)
	# Bookkeeping: the traffic pool never reclaims the player's vehicle.
	await wait_physics_frames(60 * 20)
	assert_true(is_instance_valid(taken) and taken.is_inside_tree(), "still there after twenty seconds of traffic")
	assert_true(jack.stolen.has(taken), "listed as stolen")
	assert_false(life.taken.has(jack.agent_id), "not held by the swap any more")
	assert_true(driving.vehicle == taken, "still the player's")
	assert_true(jack.offer() == null, "no TAKE OVER while driving")
	return true


func test_take_over_a_moving_bike_from_the_action_button() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var crimes: Array[StringName] = []
	jack.carjacked.connect(func(look: StringName, _at: Vector2) -> void: crimes.append(look))
	var taken := await _take_over_moving(&"bike", jack)
	if taken == null:
		return false
	assert_true(taken.type.entry.door == "none", "a bike has no door to open")
	await _ride_off(jack, taken, crimes)
	return true


func test_a_taken_vehicle_left_far_behind_is_freed() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var crimes: Array[StringName] = []
	jack.carjacked.connect(func(look: StringName, _at: Vector2) -> void: crimes.append(look))
	var taken := await _take_over_moving(&"car", jack)
	if taken == null:
		return false
	await _ride_off(jack, taken, crimes)
	assert_true(driving.exit(), "stopped, so the player gets out")
	assert_true(await wait_until(func() -> bool: return driving.mode() == &"foot", 60 * 10), "back on foot")
	await wait_physics_frames(60)
	assert_true(is_instance_valid(taken), "parked beside the player, kept")
	# The streets centre on a point far away (the world itself keeps streaming round the player).
	var far := Node3D.new()
	world.add_child(far)
	far.global_position = taken.global_position + Vector3(Carjacking.FORGET + 60.0, 0, 0)
	life.focus_node = far
	assert_true(await wait_until(func() -> bool: return not is_instance_valid(taken), 60 * 5), "left far behind, it is freed")
	assert_eq(jack.stolen.size(), 0, "and forgotten")
	return true


func test_no_take_over_for_a_bus_or_a_vehicle_in_use() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var found := await wait_until(func() -> bool: return _moving(&"bus", 0.0) != null, 60 * 40)
	if not check(found, "a bus is on the streets"):
		return false
	var bus := _moving(&"bus", 0.0)
	var id := bus.id
	# Standing right beside a bus, even a stopped one: never offered, never swapped.
	await _walk_with(id, func() -> bool: return false, 60 * 5)
	assert_true(jack.offer() == null, "no TAKE OVER beside a bus")
	assert_true(jack.vehicle == null, "no swap for a bus")
	assert_false(life.taken.has(id), "the bus stays the AI's")
	return true


func test_take_over_is_refused_while_boarding_or_driving() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var taken := await _take_over_moving(&"car", jack)
	if taken == null:
		return false
	assert_true(jack.offer() == null or driving.mode() != &"foot", "no offer while boarding")
	assert_eq(driving.mode(), &"boarding", "boarding")
	jack.request(0)
	await wait_physics_frames(4)
	assert_eq(int(jack.stats["swapped"]), 1, "a second request during boarding swaps nothing")
	return true


func test_traffic_drivers_are_never_children() -> bool:
	if not await _start():
		return false
	var minors: Dictionary[String, bool] = {}
	for e: Dictionary in PeopleManifest.open(PeoplePool.MANIFEST).entries:
		minors[str(e["id"])] = CastPicker.is_minor(e)
	for kind: StringName in [&"car", &"auto", &"bike", &"bus"]:
		for id in range(life.traffic_pool):
			var who := life.cast.driver(kind, id)
			if who != "":
				assert_false(minors.get(who, true), "the %s driver %s is an adult" % [kind, who])
	return true


## A new AI area (the player moved 500 m or jumped) is adopted on the AI thread with the next step,
## not on the main thread (G-344): the frame that picks it up does almost no work, traffic keeps
## stepping and the signal heads follow the new area.
func test_a_new_area_is_adopted_off_the_main_thread() -> bool:
	if not await _start():
		return false
	await wait_physics_frames(60 * 2)
	var old_area := life.population.area
	var start: Vector2 = world.spawn["point"]
	var far := start + Vector2(AiArea.REBUILD + 150.0, 0.0)
	body.global_position = WorldOrigin.to_scene(far, 0.1)
	if not check(await world.wait_ready_around(far, -1.0, MAX_FRAMES), "the new streets load"):
		return false
	var worst_sync := 0
	var saw_adopting := [false]
	var adopted := func() -> bool:
		worst_sync = maxi(worst_sync, int(life.stats["sync"]))
		if life._adopting != null:
			saw_adopting[0] = true
		return life.population.area != old_area and life._adopting == null
	assert_true(await wait_until(adopted, 60 * 60), "the area round the new place is adopted")
	assert_true(saw_adopting[0], "by a step on the AI thread")
	assert_true(life.population.area.centre.distance_to(far) < AiArea.REBUILD, "centred near the player")
	assert_true(worst_sync < 30000, "no main-thread frame paid for it (worst sync %d µs)" % worst_sync)
	var steps := int(life.stats["steps"])
	await wait_physics_frames(30)
	assert_true(int(life.stats["steps"]) > steps, "the AI keeps stepping")
	return true


func test_pressing_take_over_on_something_out_of_reach_says_so() -> bool:
	if not await _start():
		return false
	var jack := Carjacking.make(life, driving)
	world.add_child(jack)
	var toasts: Array[String] = []
	driving.toast.connect(func(text: String) -> void: toasts.append(text))
	var found := await wait_until(func() -> bool: return _moving(&"bike", 3.0) != null, 60 * 40)
	if not check(found, "a moving bike is on the streets"):
		return false
	var id := _moving(&"bike", 3.0).id
	body.global_position = WorldOrigin.to_scene(life.population.traffic.agents[id].pos + Vector2(60, 0), 0.1)
	jack.request(id)
	await wait_physics_frames(6)
	assert_true(toasts.has("Too far to take over"), "told it is out of reach (%s)" % [toasts])
	assert_true(jack.vehicle == null, "nothing swapped in")
	return true
