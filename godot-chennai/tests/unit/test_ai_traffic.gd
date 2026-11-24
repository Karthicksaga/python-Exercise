extends TestCase
## The AI's pure logic on hand-made streets (ports of `Agents.test.ts`, `Signals.test.ts`,
## `Density.test.ts` and the behaviours of `traffic.spec.ts`): the road graph, signals at main
## junctions with alternating phases, traffic that keeps moving, stops at red and goes again,
## brakes for the player, keeps its lane, gives way at junctions; walkers step round each other;
## nothing is put on ground that has not loaded. All in fixed 1/60 s steps (game time).

const DT := 1.0 / 60.0
const BOUNDS := Rect2(-2000, -2000, 4000, 4000)


static func road(id: int, kind: StringName, points: Array[Vector2], width: float = 9.0, lanes: int = -1, oneway: bool = false) -> Road:
	var r := Road.new()
	r.id = id
	r.kind = kind
	r.width = width
	r.lanes = lanes
	r.oneway = oneway
	r.points = PackedVector2Array(points)
	return r


## A grid of streets 200 m apart, `n` by `n` blocks, main roads through the middle.
static func grid(n: int = 3, spacing: float = 200.0) -> Array[Road]:
	var out: Array[Road] = []
	var id := 1
	var half := n * spacing / 2.0
	for i in n + 1:
		var c := -half + i * spacing
		var kind: StringName = &"primary" if i == n / 2 else &"residential"
		var w := 14.0 if kind == &"primary" else 7.0
		var pts_x: Array[Vector2] = []
		var pts_z: Array[Vector2] = []
		for k in n + 1:
			pts_x.append(Vector2(-half + k * spacing, c))
			pts_z.append(Vector2(c, -half + k * spacing))
		out.append(road(id, kind, pts_x, w))
		out.append(road(id + 1, kind, pts_z, w))
		id += 2
	return out


func _traffic(roads: Array[Road], count: int, with_signals: bool = true) -> AgentSystem:
	var g := RoadGraph.build(roads, AiArea.vehicle_road)
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.traffic(count), 7)
	if with_signals:
		s.use_signals(TrafficSignals.build(g))
	s.populate(Vector2.ZERO)
	return s


func test_graph_joins_roads_at_shared_points_and_respects_one_ways() -> bool:
	var roads: Array[Road] = [
		road(1, &"primary", [Vector2(-100, 0), Vector2(0, 0), Vector2(100, 0)]),
		road(2, &"residential", [Vector2(0, -100), Vector2(0, 0)], 6.0, -1, true),
		road(3, &"footway", [Vector2(0, 0), Vector2(0, 100)], 2.0),
	]
	var g := RoadGraph.build(roads, AiArea.vehicle_road)
	assert_eq(g.node_count(), 4, "four nodes: the junction is shared")
	assert_eq(g.edge_count(), 5, "two ways on the main road, one way down the one-way, no footway")
	var j := g.node_at(Vector2.ZERO)
	assert_eq(g.node_out[j].size(), 2, "from the junction only along the main road (the one-way comes in)")
	var walk := RoadGraph.build(roads, AiArea.walking_road, false)
	assert_eq(walk.edge_count(), 8, "people walk both ways on every street, footway included")
	var lanes := RoadGraph.build([road(9, &"primary", [Vector2(0, 0), Vector2(0, -100)], 14.0, 4)], AiArea.vehicle_road)
	assert_eq(lanes.edge_lanes[0], 2, "four lanes in all are two each way")
	var one := RoadGraph.build([road(9, &"secondary", [Vector2(0, 0), Vector2(0, -100)], 10.0, 3, true)], AiArea.vehicle_road)
	assert_eq(one.edge_lanes[0], 3, "a one-way keeps every lane in its direction")
	return true


func test_lanes_keep_left_and_a_one_way_uses_the_whole_carriageway() -> bool:
	var s := AgentPresets.traffic(1)
	var g := RoadGraph.build([road(1, &"primary", [Vector2(0, 0), Vector2(0, -100)], 14.0, 4)], AiArea.vehicle_road)
	var offsets: Dictionary[float, bool] = {}
	for i in 20:
		var off := s.lane(g, 0, i / 20.0)
		assert_true(off > 0.0 and off < 7.0, "a two-way road is driven on its left half (%.2f m)" % off)
		offsets[snappedf(off, 0.01)] = true
	assert_eq(offsets.size(), 2, "two lanes each way are both used")
	var one := RoadGraph.build([road(2, &"secondary", [Vector2(0, 0), Vector2(0, -100)], 10.5, 3, true)], AiArea.vehicle_road)
	var right_half := false
	for i in 20:
		var off := s.lane(one, 0, i / 20.0)
		assert_true(absf(off) < 5.25, "inside the one-way's carriageway (%.2f m)" % off)
		right_half = right_half or off < 0.0
	assert_true(right_half, "a one-way street's traffic also uses its right-hand lanes")
	var walker := AgentPresets.pedestrians(1)
	assert_near(absf(walker.lane(g, 0, 0.2)), 7.0 + 1.4, 0.01, "people walk on the verge beside the carriageway")
	return true


func test_main_junctions_get_signals_whose_groups_take_turns() -> bool:
	var g := RoadGraph.build(grid(), AiArea.vehicle_road)
	var signals := TrafficSignals.build(g)
	# The main roads cross every street: their junctions are signalled, the others not.
	assert_true(signals.junctions.size() >= 7, "junctions on the main roads have signals (%d)" % signals.junctions.size())
	var mapped := TrafficSignals.build(RoadGraph.build(grid(), AiArea.vehicle_road), PackedVector2Array([Vector2(100, 300)]))
	assert_eq(mapped.junctions.size(), signals.junctions.size() + 1, "a mapped OSM signal signals a quiet junction too")
	var j := signals.junctions[0]
	assert_true(j.approaches.size() >= 3, "every arm coming in has a stop line")
	var seen_green := [false, false]
	var both_green := false
	for step in roundi(signals.cycle / DT) + 2:
		signals.update(DT, PackedVector2Array())
		var a := signals.light(j.id, 0)
		var b := signals.light(j.id, 1)
		seen_green[0] = seen_green[0] or a == TrafficSignals.GREEN
		seen_green[1] = seen_green[1] or b == TrafficSignals.GREEN
		both_green = both_green or (a != TrafficSignals.RED and b != TrafficSignals.RED)
	assert_true(seen_green[0] and seen_green[1], "each group gets its green in one cycle")
	assert_false(both_green, "the two groups never show green or amber together")
	for a in j.approaches:
		assert_true(a.stop_back > TrafficSignals.ZEBRA_DEPTH, "the stop line is before the zebra")
	# Someone on the zebra stops the traffic whatever the light.
	var ap := j.approaches[0]
	signals.update(DT, PackedVector2Array([ap.crossing]))
	assert_true(signals.crossing_busy(ap), "a person on the crossing is seen")
	assert_true(signals.must_stop(ap, 5.0, 20.0, 9.0), "traffic stops for them")
	return true


func test_traffic_keeps_moving_stops_at_red_and_goes_again() -> bool:
	var s := _traffic(grid(), 24)
	var moved := 0.0
	var waited := 0
	var ran_red := 0
	var went_again := false
	var waiting_ids: Dictionary[int, bool] = {}
	var start: Array[Vector2] = []
	for a in s.agents:
		start.append(a.pos)
	for step in 60 * 90:
		s.signals.update(DT, PackedVector2Array())
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
		for a in s.agents:
			if not a.active:
				continue
			if a.at_signal:
				waited += 1
				waiting_ids[a.id] = true
			elif waiting_ids.has(a.id) and a.speed > 2.0:
				went_again = true
			# Nobody is inside a stop line's last metres on red at speed (ran the light).
			var ap := s.signals.approach_on(a.edge)
			if ap != null and s.signals.light_for(ap) == TrafficSignals.RED and a.speed > 6.0:
				var to_line := (ap.point - a.pos).dot(ap.dir) - s.kinds[a.kind].half_length
				if to_line > 0.0 and to_line < 1.0:
					ran_red += 1
	for i in s.agents.size():
		moved += s.agents[i].pos.distance_to(start[i])
	assert_true(waited > 0, "someone waited at a red light")
	assert_true(went_again, "and moved on again when it changed")
	assert_eq(ran_red, 0, "nobody ran a red light at speed")
	var moving := 0
	for a in s.agents:
		if a.active and a.speed > 2.0:
			moving += 1
	assert_true(moving >= 6, "traffic keeps moving after 90 s (%d of %d moving)" % [moving, s.agents.size()])
	assert_true(moved / s.agents.size() > 150.0, "vehicles travelled (%.0f m each on average)" % (moved / s.agents.size()))
	var kinds: Dictionary[StringName, bool] = {}
	for a in s.agents:
		kinds[s.kinds[a.kind].name] = true
	assert_true(kinds.size() >= 3, "a mix of vehicle kinds (%s)" % [kinds.keys()])
	return true


func test_traffic_brakes_for_the_player_and_can_then_be_taken() -> bool:
	var long: Array[Road] = [road(1, &"secondary", [Vector2(0, 400), Vector2(0, -400)], 10.0)]
	var g := RoadGraph.build(long, AiArea.vehicle_road)
	var settings := AgentPresets.traffic(1)
	settings.kinds = [AgentPresets.Kind.make(&"car", 1.0, 1.0, 16.0, 1.0, 0.82, 1.95, 1.8)]
	var s := AgentSystem.new(g, BOUNDS, settings, 3)
	s.populate(Vector2(0, 0))
	var car := s.agents[0]
	# Up to cruising speed, heading north (or south) along the road.
	for step in 60 * 4:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
	assert_true(car.speed > 5.0, "the car cruises (%.1f m/s)" % car.speed)
	# The player steps into its lane 25 m ahead.
	var f := Vector2(-sin(car.heading), -cos(car.heading))
	var player := car.pos + f * 25.0
	var obstacles := PackedVector3Array([Vector3(player.x, player.y, 0.5)])
	var closest := INF
	for step in 60 * 6:
		s.update(DT, obstacles, player)
		closest = minf(closest, car.pos.distance_to(player))
	assert_true(car.speed < 0.2, "it stopped for the player (%.2f m/s)" % car.speed)
	assert_true(car.blocked_by_obstacle, "because of the player")
	assert_true(closest > 0.5 + 1.95, "without touching them (%.2f m centre to centre)" % closest)
	var jack := Carjack.pick(player.x, player.y, [{"id": car.id, "kind": "car", "x": car.pos.x, "z": car.pos.y, "heading": car.heading, "speed": car.speed, "half_width": 0.82, "half_length": 1.95}])
	assert_eq(int(jack.get("id", -1)), car.id, "stopped in front of the player, it can be taken (TD-30)")
	# The player steps aside: it drives on.
	for step in 60 * 3:
		s.update(DT, PackedVector3Array(), player)
	assert_true(car.speed > 3.0, "and drives on once the way is clear")
	return true


func test_vehicles_take_turns_through_a_junction() -> bool:
	# Two quiet streets crossing (no signals): vehicles from crossing arms never share it.
	var roads: Array[Road] = [road(1, &"residential", [Vector2(-300, 0), Vector2(0, 0), Vector2(300, 0)], 7.0), road(2, &"residential", [Vector2(0, -300), Vector2(0, 0), Vector2(0, 300)], 7.0)]
	var s := _traffic(roads, 10, false)
	var radius := TrafficSignals.junction_radii(s.graph)[s.graph.node_at(Vector2.ZERO)]
	assert_true(radius > 0.0, "the crossing is a junction")
	var clash := 0
	var gave_way := 0
	for step in 60 * 60:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
		var inside: Array[Vector2] = []
		for a in s.agents:
			if a.active and a.pos.length() < radius - 1.0 and a.speed > 0.5:
				inside.append(Vector2(-sin(a.heading), -cos(a.heading)))
			if a.giving_way:
				gave_way += 1
		for i in inside.size():
			for k in range(i + 1, inside.size()):
				if absf(inside[i].dot(inside[k])) < 0.5:
					clash += 1
	assert_true(gave_way > 0, "someone waited for the junction")
	assert_eq(clash, 0, "crossing paths never moved through the junction together")
	return true


func test_walkers_pass_each_other_and_step_round_the_player() -> bool:
	var roads: Array[Road] = [road(1, &"residential", [Vector2(0, 200), Vector2(0, -200)], 6.0)]
	var g := RoadGraph.build(roads, AiArea.walking_road, false)
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.pedestrians(12), 11)
	s.populate(Vector2.ZERO)
	var start: Array[Vector2] = []
	for a in s.agents:
		start.append(a.pos)
	var focus := Vector2(4.4, 0)
	for step in 60 * 30:
		s.update(DT, PackedVector3Array([Vector3(focus.x, focus.y, 0.5)]), focus)
	var travelled := 0
	for i in s.agents.size():
		if s.agents[i].pos.distance_to(start[i]) > 10.0 or s.agents[i].generation > 1:
			travelled += 1
	assert_true(travelled >= 9, "people meeting on the pavement pass each other (%d of 12 walked on)" % travelled)
	return true


func test_nothing_appears_on_ground_that_has_not_loaded() -> bool:
	var g := RoadGraph.build(grid(), AiArea.vehicle_road)
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.traffic(12), 5)
	# Only the half of the map west of x = 0 has loaded.
	s.ground_ready = func(p: Vector2) -> bool: return p.x < 0.0
	s.populate(Vector2.ZERO)
	for step in 60 * 30:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
		for a in s.agents:
			if a.active and a.pos.x > 8.0:
				return assert_true(false, "agent %d is at x = %.1f, on unloaded ground" % [a.id, a.pos.x])
	assert_true(s.active_count() > 0, "the loaded half has traffic (%d)" % s.active_count())
	s.ground_ready = func(_p: Vector2) -> bool: return false
	for a in s.agents:
		s.let_go(a, true, Vector2.ZERO)
	assert_eq(s.active_count(), 0, "with nothing loaded nobody is placed")
	return true


func test_less_traffic_and_fewer_people_late_at_night() -> bool:
	assert_true(TrafficDensity.traffic(3.0) < TrafficDensity.traffic(18.0), "traffic at 03:00 below the evening rush")
	assert_true(TrafficDensity.pedestrians(3.0) < TrafficDensity.pedestrians(18.0), "people too")
	assert_near(TrafficDensity.traffic(24.0 + 18.0), TrafficDensity.traffic(18.0), 0.0001, "the curves wrap round midnight")
	var s := _traffic(grid(), 20)
	s.set_active_count(roundi(20 * TrafficDensity.traffic(3.0)), true)
	s.update(DT, PackedVector3Array(), Vector2.ZERO)
	assert_eq(s.active_count(), 5, "put away at once on loading")
	s.set_active_count(20)
	for step in 3:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
	assert_eq(s.active_count(), 20, "and brought out again in the morning")
	var g := RoadGraph.build(grid(), AiArea.vehicle_road)
	var w := TrafficDensity.edge_busyness(g, PackedVector2Array([Vector2(-300, 10), Vector2(-290, 10), Vector2(-280, 10)]))
	var main := 0.0
	var lane := 0.0
	for e in g.edge_count():
		if g.kind(e) == &"primary":
			main = maxf(main, w[e])
		else:
			lane = maxf(lane, w[e]) if g.middle(e).distance_to(Vector2(-290, 10)) > 300.0 else lane
	assert_true(main > lane * 2.0, "main roads draw more traffic than quiet streets")
	return true


func test_a_jammed_vehicle_far_away_is_recycled_but_not_one_at_the_lights() -> bool:
	var s := _traffic(grid(), 8)
	var a := s.agents[0]
	var gen := a.generation
	s.hold(a)
	for step in 60:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
	assert_eq(a.generation, gen, "a held vehicle (being taken) stays where it is")
	s.let_go(a, true, Vector2.ZERO)
	assert_true(a.generation > gen, "let go with a respawn, it moves elsewhere out of sight")
	assert_true(a.pos.length() >= s.settings.spawn_min - 1.0, "out of sight (%.0f m)" % a.pos.length())
	return true
