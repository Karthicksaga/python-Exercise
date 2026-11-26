extends TestCase
## The police car's driver (`Pursuer`, G-419): routes over the road graph round a block, follows
## the roads to a goal across a grid, stops short of it, and drives straight when it is near.

const STEP := 1.0 / 30.0


## A 5 x 5 grid of streets 100 m apart (both ways), from (0, 0) to (400, 400).
static func grid() -> RoadGraph:
	var roads: Array[Road] = []
	for i in 5:
		var a := Road.new()
		a.id = i * 2
		a.kind = &"residential"
		a.width = 9.0
		a.points = PackedVector2Array([Vector2(0, i * 100), Vector2(100, i * 100), Vector2(200, i * 100), Vector2(300, i * 100), Vector2(400, i * 100)])
		roads.append(a)
		var b := Road.new()
		b.id = i * 2 + 1
		b.kind = &"residential"
		b.width = 9.0
		b.points = PackedVector2Array([Vector2(i * 100, 0), Vector2(i * 100, 100), Vector2(i * 100, 200), Vector2(i * 100, 300), Vector2(i * 100, 400)])
		roads.append(b)
	return RoadGraph.build(roads, AiArea.vehicle_road)


func test_the_route_follows_the_streets() -> bool:
	var g := grid()
	var a := Pursuer.nearest_node(g, Vector2(2, 3))
	var b := Pursuer.nearest_node(g, Vector2(398, 401))
	assert_vec_near(g.node_pos[a], Vector2(0, 0), 0.01, "start node")
	var route := Pursuer.find_route(g, a, b)
	assert_true(route.size() >= 9, "a route of street corners (%d nodes)" % route.size())
	assert_near(Pursuer.route_length(g, route), 800.0, 0.5, "the shortest way round the blocks")
	for i in range(1, route.size()):
		assert_true(g.edge_between(route[i - 1], route[i]) >= 0, "every hop is a street")
	assert_eq(Pursuer.find_route(g, a, a), PackedInt32Array([a]), "already there")
	return true


func test_a_car_drives_the_grid_to_the_goal_and_stops_short() -> bool:
	var g := grid()
	var car := Pursuer.new(0.0, 0.0, PI)
	var goal := Vector2(300, 400)
	# Nothing is clear (buildings everywhere): it must keep to the roads.
	var walled := func(_a: Vector2, _b: Vector2) -> bool: return false
	var off_road := 0.0
	for i in 30 * 120:
		car.update(STEP, g, goal, 15.0, 9.0, walled)
		# On a street: x or z near a multiple of 100.
		var p := car.position()
		var gap := minf(absf(p.x - roundf(p.x / 100.0) * 100.0), absf(p.y - roundf(p.y / 100.0) * 100.0))
		off_road = maxf(off_road, gap)
		if p.distance_to(goal) < 12.0 and car.speed < 0.5:
			break
	var d := car.position().distance_to(goal)
	assert_true(d < 12.0 and d > 3.0, "stopped short of the goal (%.1f m)" % d)
	assert_true(car.speed < 0.5, "and stopped (%.1f m/s)" % car.speed)
	assert_true(off_road < 8.0, "kept to the streets (at most %.1f m off the centre line)" % off_road)
	return true


func test_near_and_in_sight_it_drives_straight_at_the_goal() -> bool:
	var g := grid()
	var car := Pursuer.new(150.0, 100.0, PI / 2.0)
	var clear := func(_a: Vector2, _b: Vector2) -> bool: return true
	car.update(STEP, g, Vector2(150, 120), 15.0, -1.0, clear)
	assert_eq(car.mode, &"direct", "straight at a goal 20 m off in the open")
	car.update(STEP, null, Vector2(800, 800), 15.0, -1.0, clear)
	assert_eq(car.mode, &"direct", "no graph: straight")
	return true
