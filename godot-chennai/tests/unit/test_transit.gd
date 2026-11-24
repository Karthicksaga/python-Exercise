extends TestCase
## Transit (G-210…G-218): the network reader, timetable, fares, route buses in the AI, the
## passenger ride, the train interface, station places and the bus job on real stops.

const BOUNDS := Rect2(-5000, -5000, 10000, 10000)


static func road(id: int, pts: Array[Vector2], kind: StringName = &"primary", width: float = 14.0, oneway: bool = false) -> Road:
	var r := Road.new()
	r.id = id
	r.kind = kind
	r.width = width
	r.oneway = oneway
	r.points = PackedVector2Array(pts)
	return r


## An east-west main road at z = 0 from x -1000 to 1000 (points every 50 m) and side streets.
static func city() -> Array[Road]:
	var main: Array[Vector2] = []
	for i in 41:
		main.append(Vector2(-1000 + i * 50, 0))
	var out: Array[Road] = [road(1, main)]
	for x: int in [-1000, -500, 0, 500, 1000]:
		out.append(road(10 + (x + 1000) / 500, [Vector2(x, 0), Vector2(x, -200), Vector2(x, -400)], &"residential", 7.0))
	return out


## routes.bin bytes for routes given as (path, [[stop, segment, along]]), in the file's layout.
static func routes_bin(routes: Array) -> PackedByteArray:
	var b := PackedByteArray()
	b.resize(12)
	b.encode_u32(0, TransitNetwork.MAGIC)
	b.encode_u16(4, 2)
	b.encode_u16(6, 1)
	b.encode_u32(8, routes.size())
	for ri in routes.size():
		var path: PackedVector2Array = routes[ri][0]
		var placed: Array = routes[ri][1]
		var at := b.size()
		b.resize(at + 16 + (path.size() - 1) * 4 + 2 + placed.size() * 12)
		b.encode_u32(at, ri)
		b.encode_u32(at + 4, path.size())
		var x := roundi(path[0].x * 20.0)
		var z := roundi(path[0].y * 20.0)
		b.encode_s32(at + 8, x)
		b.encode_s32(at + 12, z)
		at += 16
		for k in range(1, path.size()):
			var nx := roundi(path[k].x * 20.0)
			var nz := roundi(path[k].y * 20.0)
			b.encode_s16(at, nx - x)
			b.encode_s16(at + 2, nz - z)
			x = nx
			z = nz
			at += 4
		b.encode_u16(at, placed.size())
		at += 2
		for p: Array in placed:
			b.encode_u32(at, int(p[0]))
			b.encode_u32(at + 4, int(p[1]))
			b.encode_float(at + 8, float(p[2]))
			at += 12
	return b


## A network with one route eastbound along the main road from x -900 to 900, stops at x -600,
## -100 and 600 (on the left kerb, z -8), served from 05:00 to 23:00 every 15 minutes.
static func network() -> TransitNetwork:
	var path := PackedVector2Array()
	for i in 37:
		path.append(Vector2(-900 + i * 50, 0))
	var doc := {
		"format": 2, "transit": 1, "dataDate": "2026-11-23T00:28:57Z", "attribution": "© OpenStreetMap contributors",
		"stops": [["n1", -600.0, -8.0, "Saidapet", "சைதாப்பேட்டை", "", 0], ["n2", -100.0, -8.0, "Guindy", "கிண்டி", "", 0], ["n3", 600.0, -8.0, "Kathipara", "", "", 1], ["n4", 0.0, -380.0, "Lane end", "", "", 0]],
		"busStations": [["w9", 900.0, -30.0, "Terminus", "முனையம்"]],
		"stations": [{"key": "n7", "x": -100.0, "z": -150.0, "name": "Guindy", "nameTa": "கிண்டி", "system": "suburban", "lines": ["suburban-1"],
			"platforms": [["1", -100.0, -170.0, 300.0], ["2", -100.0, -140.0, 300.0], ["", -60.0, -150.0, 0.0]], "entrances": [[-180.0, -150.0, "A"]]}],
		"lines": [{"id": "suburban-1", "system": "suburban", "ref": "", "name": "Beach - Tambaram", "stations": [0], "headwayMinutes": 8, "hours": [4.0, 23.5], "offsetMinutes": 2}],
		"routes": [{"osm": 77, "ref": "21G", "name": "21G: Broadway → Tambaram", "from": "Broadway", "to": "Tambaram", "toTa": "தாம்பரம்", "status": "clean", "first": true,
			"headwayMinutes": 15, "hours": [5.0, 23.0], "offsetMinutes": 0, "majors": ["GST Road"]}],
	}
	return TransitNetwork.from_parts(doc, routes_bin([[path, [[0, 6, 0.0], [1, 16, 0.0], [2, 30, 0.0]]]]))


static func bus_kinds() -> Array[AgentPresets.Kind]:
	return [AgentPresets.traffic_kinds()[3]]


func _buses(net: TransitNetwork, count: int = 2) -> AgentSystem:
	var g := RoadGraph.build(city(), AiArea.vehicle_road)
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.traffic(count, bus_kinds()), 5)
	s.settings.spawn_min = 20.0
	s.settings.spawn_max = 400.0
	s.settings.despawn = 2000.0
	s.routes = RouteBuses.make(net)
	return s


func test_network_reads_stops_routes_stations_and_lines() -> bool:
	var net := network()
	assert_true(net.ok(), "reads: %s" % net.error)
	assert_eq(net.stops.size(), 4, "four stops")
	assert_eq(net.routes.size(), 1, "one route")
	var r := net.routes[0]
	assert_near(r.length(), 1800.0, 0.01, "path length")
	assert_near(r.stop_at[1], 800.0, 0.01, "Guindy is 800 m along (segment 16)")
	assert_eq(r.sign_lines(), PackedStringArray(["21G", "Tambaram", "தாம்பரம்"]), "the sign: number, English, Tamil; no operator")
	assert_eq(net.stops[1].routes, PackedInt32Array([0]), "Guindy is served by the route")
	assert_true(net.nearest_stop(Vector2(-95, -10)) == net.stops[1], "nearest stop")
	assert_true(net.nearest_served_stop(Vector2(5, -370), 60.0) == null, "the lane-end stop has no route")
	assert_vec_near(r.point_at(825.0), Vector2(-75, 0), 0.01, "point along")
	assert_eq(net.route_segments_near(Vector2(0, 0), 60.0).size() % 2, 0, "segments come in pairs")
	assert_eq(net.nearest_station(Vector2(-90, -150)).name, "Guindy", "station")
	assert_eq(net.nearest_station(Vector2(890, -30), 100.0, &"bus").name_ta, "முனையம்", "bus station")
	var bad := TransitNetwork.from_parts({"format": 2, "transit": 9}, PackedByteArray())
	assert_false(bad.ok(), "a newer transit version is refused")
	return check(TransitNetwork.from_parts({"format": 2, "transit": 1, "stops": [], "routes": []}, PackedByteArray([1, 2, 3])).error != "", "a broken routes.bin is refused")


func test_timetable_is_deterministic_and_wraps_to_the_next_morning() -> bool:
	var r := network().routes[0]
	# Departures 05:00, 05:15 … 23:00; Guindy is 800 m along at 16 km/h = 3 minutes.
	assert_near(TransitTimetable.minutes_to_next(r, 800.0, 5.0), 3.0, 0.01, "first bus at 05:03")
	assert_near(TransitTimetable.minutes_to_next(r, 800.0, 5.0 + 4.0 / 60.0), 14.0, 0.01, "just missed it: 14 minutes")
	assert_near(TransitTimetable.minutes_to_next(r, 800.0, 12.0), 3.0, 0.01, "noon: on the quarter plus 3")
	assert_near(TransitTimetable.minutes_to_next(r, 800.0, 23.5), 5.5 * 60.0 + 3.0, 0.01, "after the last bus: tomorrow's first")
	var net := network()
	var nb := net.next_bus(net.stops[1], 12.1)
	assert_eq((nb["route"] as TransitNetwork.Route).ref, "21G", "next bus route")
	assert_near(float(nb["minutes"]), 12.0, 0.01, "12:06 -> 12:18")
	assert_true(net.next_bus(net.stops[3], 12.0).is_empty(), "no bus at a stop no route serves")
	assert_true(TransitTimetable.in_service(r, 12.0) and not TransitTimetable.in_service(r, 3.0), "service hours")
	var ln := net.lines[0]
	return assert_near(TransitTimetable.train_minutes(ln, 0, 4.0), 2.0, 0.01, "trains from 04:02")


func test_fares_reuse_the_missions_fare_table() -> bool:
	assert_eq(TransitFare.ticket(0.0), TransitFare.MIN_FARE, "the minimum ticket")
	assert_eq(TransitFare.ticket(10000.0), roundi(ShareShift.share_fare(10000.0) * TransitFare.BUS_SHARE), "half a share auto for 10 km")
	assert_eq(TransitFare.ticket(200000.0), TransitFare.MAX_FARE, "capped")
	var r := network().routes[0]
	return check(TransitFare.ticket_on(r, 0) >= TransitFare.ticket_on(r, 1), "a ticket from further down the route is no dearer")


func test_route_bus_follows_its_route_and_dwells_at_each_stop_with_doors_open() -> bool:
	var net := network()
	var s := _buses(net, 1)
	var rb := s.routes as RouteBuses
	rb.hour = 12.0
	s.populate(Vector2(-500, 0))
	var a := s.agents[0]
	assert_true(rb.follows.has(a.id), "the bus was put on the route")
	var stopped_at: Array[int] = []
	var doors_open_at := PackedFloat32Array()
	var max_lateral := 0.0
	var focus := Vector2(-500, 0)
	for step in 30 * 240:
		s.update(1.0 / 30.0, PackedVector3Array(), focus)
		if not rb.follows.has(a.id):
			break
		focus = a.pos
		max_lateral = maxf(max_lateral, a.pos.y)
		var snap := rb.snapshot()[a.id]
		if stopped_at.has(2) and int(snap["state"]) == RouteBuses.DRIVING:
			break
		if int(snap["state"]) == RouteBuses.DWELLING and float(snap["doors"]) >= 1.0:
			var st := int(snap["stop"])
			if not stopped_at.has(st):
				stopped_at.append(st)
				doors_open_at.append(a.pos.x)
				assert_true(a.speed < 0.05, "standing still with the doors open")
	var ordered := stopped_at.duplicate()
	ordered.sort()
	assert_eq(stopped_at, ordered, "called at its stops in order")
	assert_true(stopped_at.has(2), "called at Kathipara")
	for i in doors_open_at.size():
		var stop_x := net.stops[stopped_at[i]].position.x
		assert_near(doors_open_at[i] + RouteBuses.door_offset(s.kinds[a.kind]), stop_x, 3.0, "front door at stop %d" % stopped_at[i])
	assert_true(max_lateral < 0.5, "kept to the left of the centre line (eastbound: -Z), at most %.1f m right" % max_lateral)
	return check(stopped_at.size() >= 1, "stopped at %s" % [stopped_at])


func test_route_bus_heights_follow_the_flyover_samples() -> bool:
	var roads := city()
	# Raise the middle of the main road like a flyover deck: 0 -> 6.5 m -> 0 over 2 km.
	var main := roads[0]
	var hs := PackedFloat32Array()
	for i in 401:
		var d := i * 5.0
		hs.append(clampf(6.5 - absf(d - 1000.0) * 0.0125, 0.0, 6.5))
	main.set_heights(hs, 5.0)
	var g := RoadGraph.build(roads, AiArea.vehicle_road)
	var e := -1
	for k in g.edge_count():
		if g.node_pos[g.edge_from[k]] == Vector2(-50, 0) and g.node_pos[g.edge_to[k]] == Vector2(0, 0):
			e = k
	assert_true(e >= 0, "found the edge onto the top")
	assert_near(g.height_on(e, 50.0), 6.5, 0.01, "the deck top from the road's own heights")
	assert_near(g.height_on(e, 0.0), main.height_along(950.0), 0.01, "the start of the edge")
	var back := g.edge_between(g.node_at(Vector2(0, 0)), g.node_at(Vector2(-50, 0)))
	assert_near(g.height_on(back, 50.0), main.height_along(950.0), 0.01, "the other way along the same segment")
	var flat := RoadGraph.build(city(), AiArea.vehicle_road)
	return assert_near(flat.height_on(0, 10.0), 0.0, 0.0001, "unraised roads stay on the ground")


func test_buses_out_follow_the_crowd_rules_and_a_request_sends_one() -> bool:
	var net := network()
	var s := _buses(net, 4)
	var rb := s.routes as RouteBuses
	rb.hour = 12.0
	s.set_active_count(0, true)
	s.populate(Vector2(-200, 0))
	s.update(1.0 / 30.0, PackedVector3Array(), Vector2(-200, 0))
	assert_true(s.active_count() >= 1, "at least one route bus out where a route passes, even when the pool wants none")
	s.set_active_count(4, true)
	s.update(1.0 / 30.0, PackedVector3Array(), Vector2(-200, 0))
	s.update(1.0 / 30.0, PackedVector3Array(), Vector2(-200, 0))
	assert_eq(s.active_count(), 4, "all out at the busiest")
	s.set_active_count(0, true)
	s.update(1.0 / 30.0, PackedVector3Array(), Vector2(3000, -3000))
	s.update(1.0 / 30.0, PackedVector3Array(), Vector2(3000, -3000))
	assert_eq(s.active_count(), 0, "none far from any route")
	# A request for the route at Kathipara (stop 2) with the player there.
	s.set_active_count(0, true)
	rb.request(net.routes[0], 2)
	var focus := Vector2(600, -8)
	s.update(1.0 / 30.0, PackedVector3Array(), focus)
	var sent := rb.sent_agent()
	assert_true(sent >= 0, "a bus was sent")
	var arrived := false
	for step in 30 * 120:
		s.update(1.0 / 30.0, PackedVector3Array(), focus)
		var snap: Dictionary = rb.snapshot().get(sent, {})
		if not snap.is_empty() and int(snap["stop"]) == 2:
			arrived = true
			break
	return check(arrived, "the sent bus reached the player's stop and stood there")


func test_held_doors_wait_for_the_player_and_jump_to_stop() -> bool:
	var net := network()
	var s := _buses(net, 1)
	var rb := s.routes as RouteBuses
	rb.hour = 12.0
	s.populate(Vector2(-500, 0))
	var a := s.agents[0]
	var dwelled := false
	for step in 30 * 120:
		s.update(1.0 / 30.0, PackedVector3Array(), a.pos)
		var snap: Dictionary = rb.snapshot().get(a.id, {})
		if not snap.is_empty() and int(snap["state"]) == RouteBuses.DWELLING:
			dwelled = true
			break
	assert_true(dwelled, "reached a stop")
	rb.hold_doors(a.id, true)
	for step in 30 * 25:
		s.update(1.0 / 30.0, PackedVector3Array(), a.pos)
	assert_eq(int(rb.snapshot()[a.id]["state"]), RouteBuses.DWELLING, "still standing while held (25 s)")
	assert_true(rb.keeps(a), "kept while held")
	rb.hold_doors(a.id, false)
	rb.set_carrying(a.id, true)
	var at := int(rb.snapshot()[a.id]["next"])
	assert_true(rb.jump_to_stop(s, a, at + 1), "jumped to the next stop")
	var snap2 := rb.snapshot()[a.id]
	assert_eq(int(snap2["stop"]), net.routes[0].stops[at + 1], "standing at the next stop")
	assert_true(bool(snap2["carrying"]), "still carrying the player")
	return assert_near(a.pos.x + RouteBuses.door_offset(s.kinds[a.kind]), net.stops[net.routes[0].stops[at + 1]].position.x, 1.0, "door at the stop")


func test_no_route_buses_on_ground_that_has_not_loaded() -> bool:
	var net := network()
	var s := _buses(net, 2)
	var rb := s.routes as RouteBuses
	rb.hour = 12.0
	s.ground_ready = func(p: Vector2) -> bool: return p.x < -700.0
	s.populate(Vector2(-500, 0))
	for a in s.agents:
		if a.active:
			assert_true(a.pos.x < -650.0, "placed only on loaded ground (x %.0f)" % a.pos.x)
	return check(true, "gated")


func test_ride_boards_pays_announces_and_alights() -> bool:
	var net := network()
	var r := net.routes[0]
	var ride := BusRide.make(net)
	assert_contains(BusRide.board_block(true, 1, false, 500.0, 10), "police", "no boarding while wanted")
	assert_contains(BusRide.board_block(true, 0, true, 500.0, 10), "hurt", "no boarding on a crash")
	assert_contains(BusRide.board_block(true, 0, false, 3.0, 10), "₹10", "no boarding without the fare")
	var refused := ride.board(r, 0, 3, 500.0, 2)
	assert_false(bool(refused["ok"]), "refused while wanted")
	assert_false(ride.riding(), "not riding")
	var out := ride.board(r, 0, 3, 500.0)
	assert_true(bool(out["ok"]), "boarded")
	assert_eq(int(out["fare"]), TransitFare.ticket_on(r, 0), "the ticket price")
	assert_contains(String(out["title"]), "₹", "a ticket toast")
	var ev := ride.update({"state": RouteBuses.DRIVING, "next": 1, "doors": 0.0})
	assert_eq(ev.size(), 1, "one announcement")
	assert_eq(String(ev[0]["en"]), "Next stop: Guindy", "English")
	assert_eq(String(ev[0]["ta"]), "அடுத்த நிறுத்தம்: கிண்டி", "Tamil")
	assert_eq(ride.update({"state": RouteBuses.DRIVING, "next": 1, "doors": 0.0}).size(), 0, "announced once")
	assert_false(ride.can_alight({"state": RouteBuses.DRIVING, "next": 1, "doors": 0.0}), "not while moving")
	var at := ride.update({"state": RouteBuses.DWELLING, "next": 1, "doors": 1.0})
	assert_eq(String(at[0]["type"]), "at_stop", "at a stop")
	assert_true(ride.can_alight({"state": RouteBuses.DWELLING, "next": 1, "doors": 1.0}), "may alight with the doors open")
	var last := ride.update({"state": RouteBuses.DRIVING, "next": 2, "doors": 0.0})
	assert_contains(String(last[0]["en"]), "Last stop", "the last stop is announced as such")
	var term := ride.update({"state": RouteBuses.DWELLING, "next": 2, "doors": 1.0})
	assert_eq(String(term[term.size() - 1]["type"]), "terminus", "everyone off at the terminus")
	var stop := ride.alight({"state": RouteBuses.DWELLING, "next": 2, "doors": 1.0})
	assert_eq(stop.name, "Kathipara", "off at Kathipara")
	assert_false(ride.riding(), "on foot again")
	return assert_eq(String(ride.board(r, 0, 3, 500.0)["title"]).left(7), "Ticket ", "can board again")


func test_train_service_stub_and_station_place() -> bool:
	var net := network()
	var trains := TrainService.stub(net)
	assert_false(trains.has_trains(), "no trains yet (phase 6)")
	var st := net.stations[0]
	var dep := trains.departures(st, 12.0)
	assert_eq(dep.size(), 1, "one line calls at Guindy")
	assert_true(float(dep[0]["minutes"]) <= 8.0, "within one headway")
	assert_true(trains.train_at(st, net.lines[0]) == null, "no train standing")
	assert_false(bool(trains.board(st, net.lines[0], st, 100.0)["ok"]), "boarding a train is refused until trains exist")
	assert_true(TrainService.fare(&"metro", 6) > TrainService.fare(&"suburban", 6), "the Metro is dearer")
	var places := StationPlace.all_from(net)
	var sp := places[0]
	assert_true(sp.inside(Vector2(-100, -150)), "at the station point")
	assert_true(sp.inside(Vector2(-185, -152)), "at a mapped entrance")
	assert_true(sp.inside(Vector2(-100, -300)), "on platform 1 (300 m long)")
	assert_false(sp.inside(Vector2(400, -150)), "not far away")
	assert_eq(sp.platform_list(), PackedStringArray(["1", "2", "1 unnamed"]), "platforms; unnamed ones are counted, not invented")
	assert_eq(sp.platform_at(Vector2(-100, -168)).ref, "1", "platform 1")
	return check(StationPlace.find(places, Vector2(-100, -150)) == sp, "found by position")


func test_bus_job_moves_to_real_stops_and_a_route_job_is_made() -> bool:
	var net := network()
	var stops: Array = [JobData.Stop.make("Bus stop 1 of 2", -590.0, 4.0, 8.0, 4.0, 60.0), JobData.Stop.make("Bus stop 2 of 2", -110.0, 2.0, 8.0, 4.0, 120.0), JobData.Stop.make("Nowhere", 3000.0, 3000.0, 8.0)]
	var fare := MissionData.Fare.new()
	fare.kerb_x = -591.0
	fare.kerb_z = 8.0
	(stops[0] as JobData.Stop).fare = fare
	var job := JobData.Job.make("bus-test", "bus", "bus", stops, 300.0, 1000, 100)
	var rep := BusJobRoutes.adapt(job, net)
	var moved: Array = rep["moved"]
	assert_near(float(moved[0]), Vector2(-600, -8).distance_to(Vector2(-590, 4)), 0.01, "stop 1 moved to Saidapet")
	assert_eq(float(moved[2]), -1.0, "a stop with no mapped stop near stays")
	assert_near(job.stops[0].x, -600.0, 0.01, "on the mapped stop")
	assert_near(job.stops[0].fare.kerb_x, -601.0, 0.01, "the kerb moved with it")
	assert_eq(String(rep["route"]), "21G", "route 21G serves them in order")
	assert_true(BusJobRoutes.adapt(JobData.Job.make("cab", "cab", "car", [], 1.0, 1, 1), net).is_empty(), "other jobs untouched")
	var made := BusJobRoutes.from_route(net, net.routes[0], 0, 3)
	assert_eq(made.stops.size(), 3, "three stops")
	assert_eq(made.kind, "bus", "a bus job")
	assert_contains(made.stops[1].label, "Guindy", "named after the real stop")
	assert_true(made.stops[2].due > made.stops[1].due and made.time_limit > made.stops[2].due, "timetable rises")
	assert_near(made.stops[1].fare.kerb_x, -100.0, 0.01, "kerb at the stop pole")
	return check(BusJobRoutes.from_route(net, net.routes[0], 2, 3) == null, "too few stops left")


# --- The real data ------------------------------------------------------------------------------


func test_real_network_loads_and_its_paths_are_graph_edges() -> bool:
	if not TransitNetwork.available():
		return check(true, "no transit build (skipped)")
	var net := TransitNetwork.load_dir()
	assert_true(net.ok(), "loads: %s" % net.error)
	var c := net.counts()
	assert_true(int(c["stops"]) > 1000, "stops %d" % c["stops"])
	assert_true(int(c["routes"]) >= 40, "usable routes %d" % c["routes"])
	assert_true(int(c["first"]) >= 30, "first set %d" % c["first"])
	assert_true(int(c["stations"]) > 100, "stations %d" % c["stations"])
	var egmore: TransitNetwork.Station = null
	for st in net.stations:
		if st.name == "Chennai Egmore":
			egmore = st
	assert_true(egmore != null and egmore.name_ta != "", "Egmore with its Tamil name")
	# A first-set route's path is drivable on the AI's graph built from the same world.
	var source := RegionalWorldSource.new()
	if not source.open_index().is_empty() or not source.open_roads().is_empty():
		return check(false, "world opens")
	var r: TransitNetwork.Route = null
	for x in net.routes:
		if x.first and x.status == &"clean":
			r = x
			break
	assert_true(r != null, "a clean first-set route")
	var mid := r.point_at(r.length() * 0.5)
	var g := RoadGraph.build(source.roads_near(mid, 900.0), AiArea.vehicle_road)
	var inside := 0
	var found := 0
	for k in r.path.size() - 1:
		if r.path[k].distance_to(mid) < 700.0 and r.path[k + 1].distance_to(mid) < 700.0:
			inside += 1
			if RouteBuses.edge_for(g, r, k) >= 0:
				found += 1
	assert_true(inside > 10, "%d segments near the middle" % inside)
	return check(found == inside, "route %s: %d of %d path segments are edges of the drive graph" % [r.ref, found, inside])
