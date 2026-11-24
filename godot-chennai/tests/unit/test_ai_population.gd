extends TestCase
## The streets' population as pure logic (G-120…G-126): flyover heights carried from day one,
## walkers stepping round each other and the player, crowds by place and hour (TD-31, ported
## from `Places.test.ts`/`Crowds.test.ts` on `agent/crowd-density`), the cast rules for children
## (G-18, brief §6), traffic stopping for people crossing, and Chennai's traffic mix with rare
## premium cars. Fixed 1/60 s steps (game time).

const DT := 1.0 / 60.0
const BOUNDS := Rect2(-3000, -3000, 6000, 6000)
const PEOPLE := "res://assets/people/people.json"


static func road(id: int, kind: StringName, points: Array[Vector2], width: float = 8.0, rname: String = "") -> Road:
	var r := Road.new()
	r.id = id
	r.kind = kind
	r.width = width
	r.name = rname
	r.points = PackedVector2Array(points)
	return r


static func poi(at: Vector2, kind: StringName) -> Place:
	var p := Place.new()
	p.position = at
	p.kind = kind
	return p


## A small town: a market street (x from -400 to 0 at z = 0, lined with shops), a quiet lane
## at z = -600, a station on a street at x = 600, and a beach road along the sea to the east
## (the coast at x = 1400, sand from x = 1330 to the water).
static func town() -> AiArea:
	var roads: Array[Road] = [
		road(1, &"tertiary", [Vector2(-400, 0), Vector2(-200, 0), Vector2(0, 0)], 9.0, "Market Street"),
		road(2, &"residential", [Vector2(-400, -600), Vector2(-200, -600), Vector2(0, -600)], 5.0, "Quiet Lane"),
		road(3, &"residential", [Vector2(0, -600), Vector2(0, 0)], 6.0),
		road(4, &"secondary", [Vector2(0, 0), Vector2(600, 0), Vector2(1300, 0)], 12.0),
		road(5, &"residential", [Vector2(600, -300), Vector2(600, 0), Vector2(600, 300)], 7.0, "Station Road"),
		road(6, &"secondary", [Vector2(1300, -500), Vector2(1300, 0), Vector2(1300, 500)], 12.0, "Beach Road"),
	]
	var pois: Array[Place] = []
	for i in 30:
		pois.append(poi(Vector2(-300 + i * 6.0, 12.0 if i % 2 == 0 else -12.0), &"clothes" if i % 3 == 0 else &"jewelry"))
	var sand := WorldArea.new()
	sand.kind = &"beach"
	sand.name = "Town Beach"
	sand.outline = PackedVector2Array([Vector2(1330, -500), Vector2(1400, -500), Vector2(1400, 500), Vector2(1330, 500)])
	var sea := WorldSea.new()
	sea.coast = PackedVector2Array([Vector2(1400, -2000), Vector2(1400, 2000)])
	sea.outline = PackedVector2Array([Vector2(1400, -2000), Vector2(3000, -2000), Vector2(3000, 2000), Vector2(1400, 2000)])
	var areas: Array[WorldArea] = [sand]
	var landmarks: Array[Landmark] = []
	return AiArea.make(roads, Vector2.ZERO, pois, PackedVector2Array(), areas, landmarks, sea, PackedVector2Array([Vector2(620, 0)]))


func test_flyover_decks_and_ramps_have_heights() -> bool:
	var ground := road(1, &"primary", [Vector2(0, 400), Vector2(0, 200)], 12.0)
	var up := road(2, &"primary", [Vector2(0, 200), Vector2(0, 100)], 12.0)
	var deck := road(3, &"primary", [Vector2(0, 100), Vector2(0, -100)], 12.0)
	deck.bridge = true
	deck.layer = 1
	var down := road(4, &"primary", [Vector2(0, -100), Vector2(0, -200)], 12.0)
	var list: Array[Road] = [ground, up, deck, down]
	var flat := RoadGraph.build(list, AiArea.vehicle_road)
	for y in flat.node_y:
		assert_eq(y, 0.0, "without decks everything is on the ground (the world draws flyovers flat today)")
	var g := RoadGraph.build(list, AiArea.vehicle_road, true, true)
	assert_eq(g.node_at(Vector2(0, 0)), -1, "no node in the deck's middle")
	assert_near(g.node_y[g.node_at(Vector2(0, 100))], RoadGraph.DECK_STEP, 0.01, "the deck is a storey up")
	assert_near(g.node_y[g.node_at(Vector2(0, -100))], RoadGraph.DECK_STEP, 0.01, "at both ends")
	assert_near(g.node_y[g.node_at(Vector2(0, 200))], RoadGraph.DECK_STEP - 100.0 / RoadGraph.RAMP_RUN, 0.01, "the ramp falls at 1 in 20")
	assert_near(g.node_y[g.node_at(Vector2(0, 400))], 0.0, 0.01, "and reaches the ground")
	var e := g.edge_between(g.node_at(Vector2(0, 200)), g.node_at(Vector2(0, 100)))
	assert_near(g.height_on(e, 50.0), (1.0 + RoadGraph.DECK_STEP) / 2.0, 0.01, "heights run smoothly along a ramp")
	# A car crossing the flyover carries the height.
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.traffic(1), 3)
	s.populate(Vector2(0, 0))
	var highest := 0.0
	for step in 60 * 40:
		s.update(DT, PackedVector3Array(), Vector2(0, 0))
		var a := s.agents[0]
		if a.active and absf(a.pos.y) < 90.0:
			highest = maxf(highest, a.y)
			if not assert_near(a.y, RoadGraph.DECK_STEP, 0.05, "on the deck at z = %.0f the car is up there (%.2f m)" % [a.pos.y, a.y]):
				return false
	assert_near(highest, RoadGraph.DECK_STEP, 0.05, "the car went over the deck")
	return true


## Two walkers on the same pavement line, coming towards each other.
func test_walkers_coming_towards_each_other_step_aside_and_pass() -> bool:
	var g := RoadGraph.build([road(1, &"residential", [Vector2(0, 300), Vector2(0, -300)], 6.0)], AiArea.walking_road, false)
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.pedestrians(2), 4)
	var a := s.agents[0]
	var b := s.agents[1]
	# Left of their way for one, right for the other: the same verge line, 30 m apart, facing
	# each other.
	a.variation = 0.2
	b.variation = 0.7
	s.place_at(a, Vector2(0, 15), 0.0)
	var lane_b := s.lane_offset(b, g.edge_between(g.node_at(Vector2(0, -300)), g.node_at(Vector2(0, 300))))
	s.place_at(b, Vector2(0, -15), PI)
	s.move_agent(a, g.point_on(a.edge, (Vector2(0, 15) - g.node_pos[g.edge_from[a.edge]]).dot(g.edge_dir[a.edge]), s.lane_offset(a, a.edge)), a.heading)
	s.move_agent(b, g.point_on(b.edge, (Vector2(0, -15) - g.node_pos[g.edge_from[b.edge]]).dot(g.edge_dir[b.edge]), s.lane_offset(b, b.edge)), b.heading)
	assert_true(absf(a.pos.x - b.pos.x) < 0.3, "they start on the same line (%.2f, %.2f; lane %.2f)" % [a.pos.x, b.pos.x, lane_b])
	var closest := INF
	var stopped := 0
	for step in 60 * 25:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
		closest = minf(closest, a.pos.distance_to(b.pos))
		if a.speed < 0.3 or b.speed < 0.3:
			stopped += 1
	assert_true(closest > 0.6, "they never walk into each other (closest %.2f m between centres)" % closest)
	assert_true(a.pos.y < -10.0 and b.pos.y > 10.0, "they passed each other (a at z = %.0f, b at z = %.0f)" % [a.pos.y, b.pos.y])
	assert_true(stopped < 60, "without standing still to do it (%d steps)" % stopped)
	assert_true(absf(a.dodge) < 0.2 and absf(b.dodge) < 0.2, "and went back to their line afterwards")
	return true


func test_a_walker_steps_round_the_player_standing_in_the_way() -> bool:
	var g := RoadGraph.build([road(1, &"residential", [Vector2(0, 300), Vector2(0, -300)], 6.0)], AiArea.walking_road, false)
	var s := AgentSystem.new(g, BOUNDS, AgentPresets.pedestrians(1), 4)
	var a := s.agents[0]
	a.variation = 0.2
	s.place_at(a, Vector2(0, 20), 0.0)
	s.move_agent(a, g.point_on(a.edge, (Vector2(0, 20) - g.node_pos[g.edge_from[a.edge]]).dot(g.edge_dir[a.edge]), s.lane_offset(a, a.edge)), a.heading)
	var player := Vector2(a.pos.x, 0.0)
	var obstacles := PackedVector3Array([Vector3(player.x, player.y, 0.4)])
	var closest := INF
	for step in 60 * 30:
		s.update(DT, obstacles, player)
		closest = minf(closest, a.pos.distance_to(player))
	assert_true(closest > 0.4 + 0.35, "never through the player (closest %.2f m)" % closest)
	assert_true(a.pos.y < -10.0, "walked on past them (z = %.0f)" % a.pos.y)
	return true


func test_crowds_follow_the_place_and_the_hour() -> bool:
	var area := town()
	var places := area.places
	assert_eq(places.kind_at(area.roads[0], Vector2(-200, 0)), &"market", "a street lined with shops is a market")
	assert_eq(places.kind_at(area.roads[1], Vector2(-200, -600)), &"lane", "a residential street without shops is a quiet lane")
	assert_eq(places.kind_at(area.roads[4], Vector2(600, 100)), &"station", "the street at the station")
	assert_eq(places.kind_at(area.roads[5], Vector2(1300, 0)), &"promenade", "the road beside the sand is a promenade")
	assert_true(places.on_sand(Vector2(1370, 0)), "the beach is sand")
	assert_false(places.on_sand(Vector2(1300, 0)), "the road is not")
	var market_noon := float(places.area_levels(Vector2(-200, 0), 13.0)["people"])
	var lane_noon := float(places.area_levels(Vector2(-200, -600), 13.0)["people"])
	var market_night := float(places.area_levels(Vector2(-200, 0), 3.0)["people"])
	assert_true(market_noon > lane_noon * 4.0, "a market at noon is far busier than a lane (%.1f vs %.1f per 100 m)" % [market_noon, lane_noon])
	assert_true(market_night < market_noon * 0.1, "and empty in the small hours (%.2f)" % market_night)
	assert_true(PlaceMap.people(&"beach", 18.5) > PlaceMap.people(&"beach", 13.0) * 5.0, "the beach fills in the evening")
	assert_true(PlaceMap.people(&"station", 8.5) > PlaceMap.people(&"station", 12.0) * 2.0, "stations at the morning rush")
	var field := CrowdField.new(places)
	var at_beach_evening := _settle(field, Vector2(1360, 0), 18.5)
	var at_beach_noon := _settle(field, Vector2(1360, 0), 13.0)
	var in_lane := _settle(field, Vector2(-200, -600), 18.5)
	var in_market := _settle(field, Vector2(-200, 0), 18.5)
	assert_true(at_beach_evening > at_beach_noon * 2, "more people on the sand at sunset (%d) than at noon (%d)" % [at_beach_evening, at_beach_noon])
	assert_true(in_market > in_lane * 3, "the market (%d) is busier than the lane (%d)" % [in_market, in_lane])
	assert_true(at_beach_evening <= field.cap and in_market <= field.cap, "never more than the draw budget's cap (%d)" % field.cap)
	assert_true(in_market >= 12, "a busy market looks busy (%d)" % in_market)
	return true


## Crowd count round a point once every square near it has its spots (8 new squares per call).
func _settle(field: CrowdField, at: Vector2, hour: float) -> int:
	var n := 0
	for i in 12:
		n = field.people_near(at, hour, 0.0).size()
	return n


func test_children_only_beside_an_adult_where_nothing_can_hurt_them() -> bool:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(PEOPLE))
	var people: Array[Dictionary] = []
	for e: Dictionary in data["people"]:
		people.append(e)
	var cast := CastPicker.create(people)
	assert_true(cast.walkers.size() >= 30, "plenty of walkers from the cast (%d)" % cast.walkers.size())
	assert_true(cast.crowd.size() >= 30, "and crowd people (%d)" % cast.crowd.size())
	for id in cast.walkers:
		assert_false(CastPicker.is_minor(cast.entry(id)), "%s walks among traffic: an adult" % id)
	for id in cast.crowd:
		assert_false(CastPicker.is_minor(cast.entry(id)), "%s stands in crowds anywhere: an adult" % id)
	for kind: StringName in [&"car", &"auto", &"bike", &"bus"]:
		for i in 12:
			var d := cast.driver(kind, i)
			assert_true(d != "" and not CastPicker.is_minor(cast.entry(d)), "%s drivers are adults (%s)" % [kind, d])
	assert_true(cast.children.size() >= 5, "children and teens for family spots (%d)" % cast.children.size())
	assert_true(CastPicker.is_child(cast.entry(cast.crowd_person(3, false, true))), "the cricket boy at play")
	# In the crowds: every child stands beside an adult, only at the station or on the sand.
	var area := town()
	var field := CrowdField.new(area.places)
	var children := 0
	for at: Vector2 in [Vector2(600, 0), Vector2(600, 150), Vector2(1360, 0), Vector2(1360, 200), Vector2(-200, 0), Vector2(-200, -600)]:
		for c in 12:
			field.people_near(at, 8.5, 0.0)
		for key: Vector2i in field._cells:
			var spots: Array = field._cells[key]
			for s: CrowdField.Spot in spots:
				if not s.child:
					continue
				children += 1
				if not assert_true(s.kind == &"station" or s.kind == &"beach", "a child only at the station or on the sand (%s)" % s.kind):
					return false
				var adult := false
				for t: CrowdField.Spot in spots:
					adult = adult or (not t.child and t.pos.distance_to(s.pos) < 2.0)
				assert_true(adult, "a child at %s has an adult beside them" % s.pos)
				for r in area.roads:
					for i in r.points.size() - 1:
						var q := Geometry2D.get_closest_point_to_segment(s.pos, r.points[i], r.points[i + 1])
						assert_true(q.distance_to(s.pos) > r.width / 2.0 + 0.5, "a child at %s stands off the carriageway" % s.pos)
	assert_true(children > 0, "families do appear (%d children)" % children)
	return true


func test_traffic_stops_for_someone_crossing_the_street() -> bool:
	var g := RoadGraph.build([road(1, &"secondary", [Vector2(0, 400), Vector2(0, -400)], 10.0)], AiArea.vehicle_road)
	var settings := AgentPresets.traffic(1)
	var s := AgentSystem.new(g, BOUNDS, settings, 3)
	s.populate(Vector2.ZERO)
	var car := s.agents[0]
	for step in 60 * 4:
		s.update(DT, PackedVector3Array(), Vector2.ZERO)
	var f := Vector2(-sin(car.heading), -cos(car.heading))
	var walker := car.pos + f * 30.0
	var closest := INF
	for step in 60 * 6:
		s.update(DT, PackedVector3Array([Vector3(walker.x, walker.y, AiPopulation.WALKER_RADIUS)]), Vector2.ZERO)
		closest = minf(closest, car.pos.distance_to(walker))
	assert_true(car.speed < 0.2, "it waits for the person crossing")
	assert_true(closest > s.kinds[car.kind].half_length + AiPopulation.WALKER_RADIUS, "without touching them (%.2f m)" % closest)
	return true


func test_population_fills_busy_places_and_empties_at_night() -> bool:
	var area := town()
	var day := AiPopulation.new(BOUNDS, 20, 30, AgentPresets.chennai_mix(), 5)
	day.adopt(area, Vector2(-200, 0))
	for step in 60 * 3:
		day.step(DT, Vector2(-200, 0), 13.0, PackedVector3Array())
	var night := AiPopulation.new(BOUNDS, 20, 30, AgentPresets.chennai_mix(), 5)
	night.adopt(town(), Vector2(-200, 0))
	for step in 60 * 3:
		night.step(DT, Vector2(-200, 0), 3.0, PackedVector3Array())
	assert_true(day.walkers.wanted_count() > night.walkers.wanted_count() * 3, "walkers by day (%d) and by night (%d)" % [day.walkers.wanted_count(), night.walkers.wanted_count()])
	assert_true(day.traffic.wanted_count() > night.traffic.wanted_count(), "traffic too (%d, %d)" % [day.traffic.wanted_count(), night.traffic.wanted_count()])
	assert_true(day.people.size() > night.people.size() * 3, "and crowds (%d, %d)" % [day.people.size(), night.people.size()])
	assert_eq(day.levels["place"], &"market", "it knows it is at the market")
	# Moving on keeps everyone where they were.
	var before: Array[Vector2] = []
	for a in day.traffic.agents:
		before.append(a.pos)
	day.adopt(town(), Vector2(-200, 0))
	for i in day.traffic.agents.size():
		if day.traffic.agents[i].active:
			assert_vec_near(day.traffic.agents[i].pos, before[i], 0.001, "a new area does not move vehicle %d" % i)
	day.step(DT, Vector2(-200, 0), 13.0, PackedVector3Array())
	assert_true(day.people.size() > 0, "and the crowd's spots carry over")
	return true


func test_chennai_traffic_mix_is_the_tamil_nadu_vehicles_with_rare_premium_cars() -> bool:
	var mix := AgentPresets.chennai_mix()
	var total := 0.0
	var premium := 0.0
	var groups: Dictionary[StringName, float] = {}
	for k in mix:
		total += k.share
		groups[k.group] = groups.get(k.group, 0.0) + k.share
		if k.name in [&"saloon", &"suv", &"coupe"]:
			premium += k.share
		var v := VehicleCatalog.variant(k.name)
		assert_true(v != null, "%s is a vehicle the game can build (and the player can take)" % k.name)
	assert_near(total, 1.0, 0.001, "shares add up")
	assert_true(premium > 0.0 and premium <= 0.04, "premium cars are rare (%.1f %%)" % (premium * 100.0))
	assert_true(groups[&"bike"] > groups[&"bus"] * 3.0, "two-wheelers outnumber buses")
	assert_true(groups[&"auto"] >= 0.15, "plenty of autos (%.0f %%)" % (groups[&"auto"] * 100.0))
	return true
