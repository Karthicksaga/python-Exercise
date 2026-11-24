extends TestCase
## People react to being hit (G-342, G-343; the owner's report on afed12f: "why is the NPC
## standing after hitting the bike?"), in the streamed city with live traffic and walkers: a
## walker struck fast falls, lies, gets up and walks on; struck slowly they stagger back; a traffic
## bike rider hit hard falls off and the bike lies over until they are back; bystanders turn and the
## crowd looks; no child is ever knocked down. Waits in game time.

const CITY := "res://src/game_world/city/city_world.tscn"
const MAX_FRAMES := 60 * 240

var world: CityWorld
var body: PlayerController
var life: CityLife
var driving: Driving
var reactions: StreetReactions
var events: Array[Array] = []


func before_each() -> void:
	(tree.root.get_node("/root/WorldOrigin") as Node).call("recentre", 0.0, 0.0)
	world = (load(CITY) as PackedScene).instantiate() as CityWorld
	root.add_child(world)
	events.clear()


## The city, life, driving and the reactions; `injector` runs between steps before the reactions.
func _start(injector: Callable = Callable()) -> bool:
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
	if not check(await life.prepare(spawn) == "", "traffic and people are made"):
		return false
	driving = Driving.new()
	driving.rider = PlayerRiderLink.make(body)
	world.add_child(driving)
	if injector.is_valid():
		life.between_steps.connect(injector)
	reactions = StreetReactions.make(life, driving)
	world.add_child(reactions)
	reactions.reacted.connect(func(band: StringName, who: StringName, at: Vector2) -> void: events.append([band, who, at]))
	return true


## A drivable vehicle of `variant` with the player at the controls, parked at the start.
func _ride(variant: StringName) -> Vehicle:
	var v := Vehicle.create(variant)
	world.add_child(v)
	var spawn := WorldOrigin.to_scene(world.spawn["point"] as Vector2, 0.0)
	v.place(spawn + Vector3(0, 0, 6), 0.0)
	await wait_physics_frames(20)
	driving.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), v.yaw())
	await wait_physics_frames(1)
	check(driving.enter(v), "getting on the %s" % variant)
	check(await wait_until(func() -> bool: return driving.mode() == &"driving", 60 * 10), "driving the %s" % variant)
	return v


## The nearest active walker that is not held, or null.
func _walker() -> AgentSystem.Agent:
	var w := life.population.walkers
	var best: AgentSystem.Agent = null
	var best_d := INF
	for a in w.agents:
		if a.active and not w.is_held(a) and not life.downed.has(a.id):
			var d := a.pos.distance_to(life.focus_world())
			if d < best_d:
				best = a
				best_d = d
	return best


## Drive `v` at `speed` m/s straight at walker `a` from 3 m away (re-aimed every frame, as a
## driver who did not brake), until a reaction or `frames` pass.
func _run_at(v: Vehicle, a: AgentSystem.Agent, speed: float, frames: int) -> bool:
	var h := v.type.spec.half_extents.z
	var at := WorldOrigin.to_scene(a.pos, a.y)
	var dir := Vector3(-sin(a.heading + PI / 2.0), 0, -cos(a.heading + PI / 2.0))
	var start := at - dir * (h + 3.0)
	v.place(Vector3(start.x, at.y, start.z), atan2(-dir.x, -dir.z))
	await wait_physics_frames(2)
	v.set_speed(speed)
	return await wait_until(func() -> bool:
		if events.is_empty():
			v.set_speed(speed)
		return not events.is_empty(), frames)


func test_a_walker_struck_fast_falls_lies_gets_up_and_walks_on() -> bool:
	if not await _start():
		return false
	var v := await _ride(&"hatchback")
	assert_true(await wait_until(func() -> bool: return _walker() != null, 60 * 20), "a walker is out")
	var a := _walker()
	var reacted := await _run_at(v, a, 9.0, 60 * 3)
	if not assert_true(reacted, "the walker reacted to the car"):
		return true
	assert_eq(events[0][0], &"fall", "struck at 32 km/h: a fall")
	assert_eq(events[0][1], &"walker", "a walker")
	var id := a.id
	v.set_speed(0.0)
	driving.brake = true
	await wait_physics_frames(2)
	assert_true(life.downed.has(id), "drawn by the reactions while down")
	assert_true(life.population.walkers.is_held(life.population.walkers.agents[id]), "the AI holds them")
	assert_eq(reactions.downed_count(), 1, "one person down")
	for person in reactions.downed_people():
		assert_false(reactions.is_minor(person), "%s is an adult" % person)
	var seen: Dictionary[StringName, bool] = {}
	var fig: PersonView = null
	for d in reactions._downs:
		fig = d.fig
	var up := await wait_until(func() -> bool:
		if fig != null and is_instance_valid(fig):
			seen[fig.knockdown_state()] = true
		return not life.downed.has(id), 60 * 10)
	assert_true(up, "up again and handed back to the AI")
	assert_true(seen.has(&"falling") and seen.has(&"down") and seen.has(&"rising"), "fell, lay and got up (%s)" % [seen.keys()])
	await wait_physics_frames(4)
	assert_false(life.population.walkers.is_held(life.population.walkers.agents[id]), "walking on")
	assert_eq(reactions.downed_count(), 0, "nobody down")
	assert_true(int(reactions.stats["fall"]) == 1, "counted (%s)" % [reactions.stats])
	print("    touch test: %d runs, %.1f us when nobody is touched, max %d us (with a knockdown)" % [int(reactions.stats["tests"]), reactions.quiet_test_usec(), int(reactions.stats["test_usec_max"])])
	return true


func test_a_walker_struck_slowly_staggers_back() -> bool:
	if not await _start():
		return false
	var v := await _ride(&"hatchback")
	assert_true(await wait_until(func() -> bool: return _walker() != null, 60 * 20), "a walker is out")
	var a := _walker()
	var reacted := await _run_at(v, a, 2.5, 60 * 4)
	if not assert_true(reacted, "the walker reacted"):
		return true
	assert_eq(events[0][0], &"stagger", "struck at 9 km/h: a stagger")
	assert_true(life.stagger.has(a.id), "leaning back")
	assert_false(life.downed.has(a.id), "not knocked down")
	assert_true(life.population.walkers.is_scared(a), "stepping back or hurrying off")
	return true


func test_a_traffic_rider_hit_hard_falls_off_and_the_bike_waits() -> bool:
	# The bike is caught standing (held between steps), then hit side on at 45 km/h by a car.
	var state := {"id": -1, "want": false}
	var hold := func(_dt: float) -> void:
		if not bool(state["want"]) or int(state["id"]) >= 0:
			return
		var t := life.population.traffic
		for a in t.agents:
			if a.active and t.kinds[a.kind].group == &"bike" and not life.taken.has(a.id) and life.views[a.id].visible and a.pos.distance_to(life.focus_world()) < 60.0:
				t.hold(a)
				state["id"] = a.id
				return
	if not await _start(hold):
		return false
	var car := await _ride(&"hatchback")
	state["want"] = true
	if not assert_true(await wait_until(func() -> bool: return int(state["id"]) >= 0, 60 * 40), "a traffic bike comes near"):
		return true
	await wait_physics_frames(4)
	var id := int(state["id"])
	var view := life.views[id]
	var side := view.global_basis.x
	var start := view.global_position + side * (car.type.spec.half_extents.z + view.variant.type.spec.half_extents.x + 4.0)
	car.place(Vector3(start.x, view.global_position.y - view.ride_height(), start.z), atan2(side.x, side.z))
	await wait_physics_frames(2)
	car.set_speed(45.0 / 3.6)
	var fell := await wait_until(func() -> bool: return events.any(func(e: Array) -> bool: return e[1] == &"rider"), 60 * 3)
	assert_true(fell, "the rider fell off (last hit: %s)" % [driving.last_hit.impact_kmh if driving.last_hit != null else -1.0])
	if not fell:
		return true
	await wait_physics_frames(10)
	assert_true(life.taken.has(id), "the bike is stopped where it is")
	assert_true(absf(view.model.rotation.z) > 1.0, "the bike lies on its side (%.2f rad)" % view.model.rotation.z)
	for person in reactions.downed_people():
		assert_false(reactions.is_minor(person), "%s is an adult" % person)
	var back := await wait_until(func() -> bool: return not life.taken.has(id), 60 * 14)
	assert_true(back, "the rider got up, walked back and rides on")
	assert_near(view.model.rotation.z, 0.0, 0.01, "the bike is upright again")
	return true


func test_no_child_is_ever_knocked_down() -> bool:
	# A child and an adult stand in the car's path (crowd spots, as at a station); the car goes
	# through at 30 km/h. The adult falls; the child is passed and never reacts.
	var path := {"on": false, "a": Vector2.ZERO, "b": Vector2.ZERO}
	var inject := func(_dt: float) -> void:
		if not bool(path["on"]):
			return
		for spot: Array in [[true, path["a"], 900001], [false, path["b"], 900002]]:
			var p := CrowdField.Person.new()
			p.child = spot[0]
			p.pos = spot[1]
			p.key = spot[2]
			p.look = 1
			life.population.people.append(p)
	if not await _start(inject):
		return false
	var car := await _ride(&"hatchback")
	var f3 := -car.global_basis.z
	var ahead := Vector2(f3.x, f3.z).normalized()
	var at := WorldOrigin.to_world(car.global_position)
	path["a"] = at + ahead * 6.0
	path["b"] = at + ahead * 9.0 + Vector2(ahead.y, -ahead.x) * 0.4
	path["on"] = true
	await wait_physics_frames(4)
	var fell := await wait_until(func() -> bool:
		car.set_speed(30.0 / 3.6)
		return events.any(func(e: Array) -> bool: return e[1] == &"crowd" and e[0] == &"fall"), 60 * 3)
	assert_true(fell, "the adult in the path was knocked down")
	assert_true(int(reactions.stats["children_passed"]) > 0, "the car passed the child (%s)" % [reactions.stats])
	assert_false(life.downed_crowd.has(900001), "the child is never down")
	for e in events:
		assert_true((e[2] as Vector2).distance_to(path["a"] as Vector2) > 0.5 or e[1] != &"crowd", "no reaction at the child's spot")
	for person in reactions.downed_people():
		assert_false(reactions.is_minor(person), "%s is an adult" % person)
	path["on"] = false
	return true
