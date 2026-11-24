extends TestCase
## Road detail by class (G-310 to G-313): paint on arterials, crossings on junction nodes, trees
## clear of the carriageway, deterministic plans, and the chunk cost (draw calls, triangles).

const SPAWN := Vector2i(6, 4)
const DENSE := Vector2i(35, 33)


func _road(kind: StringName, width: float, lanes: int, oneway: bool) -> Road:
	var r := Road.new()
	r.kind = kind
	r.width = width
	r.lanes = lanes
	r.oneway = oneway
	r.id = 4410
	r.points = PackedVector2Array([Vector2.ZERO, Vector2(100, 0)])
	return r


## Cells around the spawn that hold roads.
func _cells() -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	for dx in range(-2, 3):
		for dz in range(-2, 3):
			out.append(SPAWN + Vector2i(dx, dz))
	return out


func _plan(kit: ChunkBuilder.Kit, cell: Vector2i) -> RoadDetail.Plan:
	var layout := kit.layouts.layout_for(cell)
	var chunk := kit.source.read_chunk(cell)
	var size := layout.chunk_size
	var square := Rect2(kit.source.get_grid_origin() + Vector2(cell) * size, Vector2(size, size))
	var furniture := StreetFurniture.for_chunk(layout, chunk, cell)
	return RoadDetail.for_chunk(layout, chunk, cell, square, furniture)


func test_road_classes() -> bool:
	assert_eq(RoadStyle.klass_of(_road(&"primary", 14.0, -1, false)), RoadStyle.ARTERIAL, "primary is an arterial")
	assert_eq(RoadStyle.klass_of(_road(&"tertiary", 7.0, -1, false)), RoadStyle.ARTERIAL, "tertiary is an arterial")
	assert_eq(RoadStyle.klass_of(_road(&"residential", 6.0, -1, false)), RoadStyle.RESIDENTIAL, "a 6 m residential street")
	assert_eq(RoadStyle.klass_of(_road(&"residential", 3.5, -1, false)), RoadStyle.LANE, "a 3.5 m street is a lane")
	assert_eq(RoadStyle.klass_of(_road(&"service", 6.0, -1, false)), RoadStyle.LANE, "service roads are lanes")
	assert_eq(RoadStyle.klass_of(_road(&"footway", 2.0, -1, false)), RoadStyle.PATH, "footways are paths")
	var flyover := _road(&"primary", 14.0, -1, false)
	flyover.heights = PackedFloat32Array([0.0, 6.0, 6.0])
	assert_eq(RoadStyle.klass_of(flyover), RoadStyle.FLYOVER, "a raised road is a flyover")
	var arterial := RoadStyle.of(_road(&"primary", 14.0, -1, false))
	assert_true(arterial.footpath > 2.0 and arterial.pole_pitch == 0.0, "arterials get footpaths and keep their own poles")
	var street := RoadStyle.of(_road(&"residential", 6.0, -1, false))
	assert_true(street.tree_pitch > 0.0 and street.pole_pitch > 0.0 and street.footpath == 0.0, "streets get trees and poles, no footpath")
	var weights := street.species
	assert_eq(RoadStyle.pick_species(weights, 0.0), &"neem", "first species at 0")
	assert_true(RoadStyle.pick_species(weights, 0.999) != &"", "last species at 1")
	return true


func test_markings_on_arterials() -> bool:
	# Edge lines on every two-way arterial of 6.5 m or more; primary keeps its five lines.
	assert_eq(GroundMeshes.lane_lines(_road(&"primary", 14.0, -1, false)).size(), 5, "primary: centre, lanes, edges")
	var sec := GroundMeshes.lane_lines(_road(&"secondary", 7.5, 2, false))
	var edges := 0
	for l in sec:
		if l.y == 0.0 and absf(l.x) > 3.0:
			edges += 1
	assert_eq(edges, 2, "a 7.5 m secondary road has two edge lines")
	assert_eq(GroundMeshes.lane_lines(_road(&"tertiary", 5.0, 2, false)).size(), 1, "a narrow tertiary road has a centre line only")
	assert_eq(GroundMeshes.lane_lines(_road(&"residential", 7.0, -1, false)).size(), 0, "no paint on residential streets")
	# A built chunk uses both fresh and faded paint, and carries stripes.
	var kit := CityTestKit.kit()
	var layout := kit.layouts.layout_for(SPAWN)
	var chunk := kit.source.read_chunk(SPAWN)
	var square := Rect2(kit.source.get_grid_origin() + Vector2(SPAWN) * 250.0, Vector2(250, 250))
	var f := StreetFurniture.for_chunk(layout, chunk, SPAWN)
	var plan := RoadDetail.for_chunk(layout, chunk, SPAWN, square, f)
	var g := GroundMeshes.new()
	g.origin = ChunkBuilder.centre_of(kit.source, SPAWN)
	g.build(layout.spans_in(SPAWN), chunk.areas, square, f.kerbs, [], f.medians, plan)
	assert_true(g.stripes > 10, "stripes painted on the arterials (%d)" % g.stripes)
	var layers := {}
	for i in range(0, g.mesh.indices.size(), 3):
		layers[floori(g.mesh.uvs[g.mesh.indices[i]].x / GroundMeshes.LAYER_U)] = true
	for l: int in [CityAtlas.GROUND_PAINT, CityAtlas.GROUND_PAINT_FADED, CityAtlas.GROUND_LATERITE, CityAtlas.GROUND_SLAB, CityAtlas.GROUND_KERB_BW]:
		assert_true(layers.has(l), "ground has road layer %d" % l)
	return true


func test_crossings_stand_on_junction_arms() -> bool:
	var kit := CityTestKit.kit()
	var found := 0
	for cell in _cells():
		var layout := kit.layouts.layout_for(cell)
		var plan := _plan(kit, cell)
		for c in plan.crossings:
			found += 1
			var node: CityLayout.RoadNode = layout.nodes.get(CityLayout.node_key(c.node))
			assert_true(node != null and node.degree >= 3, "crossing at a junction node")
			if node == null:
				continue
			var reach := node.width / 2.0 + RoadDetail.CROSSING_GAP
			var d := c.position.distance_to(c.node)
			assert_true(d <= reach + 0.01 and d >= node.width / 2.0, "crossing %.1f m from its node (arm %.1f)" % [d, reach])
			assert_near(absf(c.dir.length() - 1.0), 0.0, 0.001, "unit direction")
			assert_near(absf(c.travel.dot(c.dir)), 1.0, 0.001, "traffic runs along the road")
			assert_true(c.width >= RoadDetail.MIN_ARTERIAL_WIDTH, "only on roads of %.0f m or more" % RoadDetail.MIN_ARTERIAL_WIDTH)
	assert_true(found >= 3, "crossings found around the spawn (%d)" % found)
	return true


func test_planted_trees_stay_off_the_carriageway() -> bool:
	var kit := CityTestKit.kit()
	var planted := 0
	var poles := 0
	for cell in _cells():
		var layout := kit.layouts.layout_for(cell)
		var chunk := kit.source.read_chunk(cell)
		var plan := _plan(kit, cell)
		var boxes := StreetFurniture.building_boxes(chunk.buildings)
		for t in plan.trees:
			planted += 1
			assert_true(t.species != &"", "planted trees have a species")
			assert_false(StreetFurniture.in_building(chunk.buildings, boxes, t.position, 0.5), "tree not in a building")
			layout.segments_near(t.position, 12.0, func(ri: int, i: int) -> bool:
				var r := layout.roads[ri]
				if r.kind == &"footway":
					return false
				var q := Geometry2D.get_closest_point_to_segment(t.position, r.points[i], r.points[i + 1])
				assert_true(q.distance_to(t.position) > r.width / 2.0 + 1.2, "tree %.1f m from a road's centre (half width %.1f)" % [q.distance_to(t.position), r.width / 2.0])
				return false)
		for p in plan.poles:
			poles += 1
		for f in plan.footpaths:
			assert_true(f.inner.size() >= 2, "footpath runs have points")
	assert_true(planted > 0, "trees are planted along streets that had none (%d)" % planted)
	assert_true(poles > 0, "poles are planted along streets that had none (%d)" % poles)
	return true


func test_plans_are_deterministic() -> bool:
	var kit := CityTestKit.kit()
	var a := _plan(kit, SPAWN)
	var b := _plan(kit, SPAWN)
	assert_eq(a.crossings.size(), b.crossings.size(), "same crossings")
	assert_eq(a.decals.size(), b.decals.size(), "same marks")
	assert_eq(a.trees.size(), b.trees.size(), "same trees")
	for i in a.trees.size():
		assert_eq(a.trees[i].position, b.trees[i].position, "same tree %d" % i)
	return true


func test_chunk_cost_budget() -> bool:
	var kit := CityTestKit.kit()
	for cell: Vector2i in [SPAWN, DENSE]:
		kit.road_detail = false
		var before := ChunkBuilder.build(kit, cell)
		kit.road_detail = true
		var t0 := Time.get_ticks_usec()
		var after := ChunkBuilder.build(kit, cell)
		var ms := float(Time.get_ticks_usec() - t0) / 1000.0
		assert_true(after.surfaces <= 8, "%s: at most 8 draw calls (%d)" % [cell, after.surfaces])
		assert_true(after.surfaces <= before.surfaces + 2, "%s: road detail adds at most the two tree draws (%d to %d)" % [cell, before.surfaces, after.surfaces])
		var tb := before.total_triangles(true)
		var ta := after.total_triangles(true)
		assert_true(float(ta) <= float(tb) * 1.3 + 3000.0, "%s: triangles %d to %d" % [cell, tb, ta])
		assert_true(ms < 4000.0, "%s: builds on the worker in %.0f ms" % [cell, ms])
		assert_true(after.detail.get("crossings", 0) >= 0 and after.roads != null, "%s: road detail counted" % cell)
		CityTestKit.free_build(before)
		CityTestKit.free_build(after)
	kit.road_detail = true
	return true


func test_road_conditions_by_class() -> bool:
	var counts := {}
	var lane_counts := {}
	for id in range(1, 400):
		var arterial := _road(&"primary", 14.0, -1, false)
		arterial.id = id * 10
		var lane := _road(&"service", 4.0, -1, false)
		lane.id = id * 10
		var c := RoadStyle.condition(arterial)
		counts[c] = counts.get(c, 0) + 1
		var l := RoadStyle.condition(lane)
		lane_counts[l] = lane_counts.get(l, 0) + 1
		assert_eq(RoadStyle.condition(arterial), c, "a way keeps its condition")
	assert_false(counts.has(RoadStyle.UNPAVED), "arterials are never unpaved")
	assert_true(counts.get(RoadStyle.GOOD, 0) > counts.get(RoadStyle.DAMAGED, 0), "most arterials are good: %s" % counts)
	assert_true(lane_counts.get(RoadStyle.UNPAVED, 0) > 40, "a fifth or more of the lanes are unpaved: %s" % lane_counts)
	assert_true(lane_counts.get(RoadStyle.DAMAGED, 0) > 40, "many lanes are damaged: %s" % lane_counts)
	var mud := _road(&"service", 4.0, -1, false)
	for id in range(1, 400):
		mud.id = id * 10
		if RoadStyle.condition(mud) == RoadStyle.UNPAVED:
			assert_eq(RoadStyle.surface(mud), CityAtlas.GROUND_MUD, "unpaved roads are mud")
			break
	var flyover := _road(&"primary", 14.0, -1, false)
	flyover.heights = PackedFloat32Array([0.0, 6.0, 6.0])
	assert_eq(RoadStyle.condition(flyover), RoadStyle.GOOD, "flyovers are kept")
	# What the vehicles may read: worse surfaces are slower, bumpier and slipperier.
	var prev := 1.0
	for c: StringName in [RoadStyle.WORN, RoadStyle.DAMAGED, RoadStyle.UNPAVED]:
		var f := RoadStyle.feel(c)
		assert_true(float(f["top_speed"]) < prev and float(f["bump"]) > 0.0 and float(f["grip"]) < 1.0, "%s costs speed, bumps and grip" % c)
		prev = float(f["top_speed"])
	assert_eq(float(RoadStyle.feel(RoadStyle.GOOD)["top_speed"]), 1.0, "good roads cost nothing")
	return true


func test_damaged_and_unpaved_roads_get_their_marks() -> bool:
	var kit := CityTestKit.kit()
	var kinds := {}
	var ruts := 0
	var lips := 0
	for dx in range(-8, 9):
		for dz in range(-8, 9):
			var cell := SPAWN + Vector2i(dx, dz)
			if not kit.source.read_chunk(cell).ok():
				continue
			var plan := _plan(kit, cell)
			for m in plan.decals:
				kinds[m.kind] = true
				assert_true(m.length > 0.0 and m.width > 0.0, "marks have a size")
			ruts += plan.ruts.size()
			lips += plan.lips.size()
	for k: StringName in [&"manhole", &"pothole", &"stripped", &"rubble", &"puddle"]:
		assert_true(kinds.has(k), "marks include %s (%s)" % [k, kinds.keys()])
	assert_true(ruts > 0 and lips > 0, "ruts and soil lips on damaged roads (%d, %d)" % [ruts, lips])
	return true


func test_bends_get_the_outer_side() -> bool:
	var road := _road(&"primary", 7.0, -1, false)
	var pts := PackedVector2Array()
	for i in 13:
		var a := float(i) / 12.0 * PI / 2.0
		pts.append(Vector2(sin(a), 1.0 - cos(a)) * 60.0)
	road.points = pts
	var span := CityLayout.RoadSpan.new()
	span.road = road
	span.start = 0
	span.end = pts.size() - 1
	var bends := RoadDetail.bends_on(road, span)
	assert_eq(bends.size(), 1, "one bend")
	assert_true(float(bends[0]["angle"]) > RoadDetail.BEND_SHARP and float(bends[0]["angle"]) < 1.7, "a quarter turn: %.2f rad" % float(bends[0]["angle"]))
	# The road heads east then curves towards +Z (right-hand side when facing east is +Z), so the
	# outer side is the left one (-Z), i.e. +1 in the left-normal sense used by offset_runs.
	var d := pts[1] - pts[0]
	var left := Vector2(d.y, -d.x)
	assert_true(left.y < 0.0, "left normal of an eastward road points to -Z")
	assert_eq(float(bends[0]["side"]), 1.0, "outer side of a right-hand bend")
	var straight := _road(&"primary", 7.0, -1, false)
	straight.points = PackedVector2Array([Vector2.ZERO, Vector2(50, 0), Vector2(100, 0)])
	var s2 := CityLayout.RoadSpan.new()
	s2.road = straight
	s2.start = 0
	s2.end = 2
	assert_eq(RoadDetail.bends_on(straight, s2).size(), 0, "no bend on a straight road")
	return true


func test_lamp_kinds_by_road() -> bool:
	var kinds := {}
	var warm := 0
	# The v1 world around the spawn, and the regional world's divided road (cell 124, 251) for medians.
	var runs: Array = [[CityTestKit.kit(), SPAWN, 6], [CityTestKit.regional_kit(), Vector2i(124, 251), 3]]
	for run: Array in runs:
		var kit: ChunkBuilder.Kit = run[0]
		var centre: Vector2i = run[1]
		var reach: int = run[2]
		for dx in range(-reach, reach + 1):
			for dz in range(-reach, reach + 1):
				var cell := centre + Vector2i(dx, dz)
				if not kit.source.read_chunk(cell).ok():
					continue
				var built := ChunkBuilder.build(kit, cell)
				if built.roads == null:
					CityTestKit.free_build(built)
					continue
				var poles: Array[StreetFurniture.Pole] = []
				poles.append_array(built.furniture.poles)
				poles.append_array(built.roads.poles)
				for p in poles:
					kinds[p.kind] = true
					warm += 1 if p.warm else 0
					var heads := RoadLamps.heads(p)
					assert_eq(heads.size(), 2 if p.kind == &"twin" else 1, "%s carries %d lamp heads" % [p.kind, heads.size()])
					for h in heads:
						assert_true(h.y > 5.0 and h.y < 26.0, "head height %.1f" % h.y)
					if p.kind == &"mast":
						assert_near(heads[0].y, RoadLamps.MAST, 0.01, "a high mast carries its head 24.6 m up")
				assert_eq(built.lamp_points.size(), built.lamp_tints.size(), "a tint per lamp point")
				var expected := 0
				for p in poles:
					expected += RoadLamps.heads(p).size()
				assert_eq(built.lamp_points.size(), expected, "every pole's heads are lamp points")
				CityTestKit.free_build(built)
	for k: StringName in [&"arm", &"twin", &"mast", &"rural"]:
		assert_true(kinds.has(k), "lamp kind %s is placed (%s)" % [k, kinds.keys()])
	assert_true(warm > 0, "residential poles are warmer (%d)" % warm)
	assert_true(RoadLamps.WARM.r > RoadLamps.COOL.r and RoadLamps.WARM.b < RoadLamps.COOL.b, "warm is warmer than cool")
	return true


func test_optional_detail_follows_the_quality_preset() -> bool:
	var kit := CityTestKit.regional_kit()
	var cell := Vector2i(124, 251)
	var counts := {}
	for level: int in [0, 1, 2]:
		kit.road_extras = level
		var b := ChunkBuilder.build(kit, cell)
		counts[level] = {"wires": b.detail.get("wires", 0), "shrubs": b.detail.get("median_shrubs", 0), "guards": b.detail.get("tree_guards", 0), "surfaces": b.surfaces, "tris": b.total_triangles(true)}
		CityTestKit.free_build(b)
	kit.road_extras = 2
	assert_eq(counts[0]["wires"], 0, "Low draws no wires")
	assert_eq(counts[0]["shrubs"], 0, "Low draws no median shrubs")
	assert_eq(counts[0]["guards"], 0, "Low draws no tree guards")
	assert_true(counts[1]["wires"] > 0 and counts[1]["shrubs"] == 0 and counts[1]["guards"] == 0, "Medium keeps wires only: %s" % counts[1])
	assert_true(counts[2]["wires"] > 0 and counts[2]["shrubs"] > 0, "High keeps everything: %s" % counts[2])
	assert_true(int(counts[0]["tris"]) < int(counts[1]["tris"]) and int(counts[1]["tris"]) < int(counts[2]["tris"]), "each level is cheaper: %s" % counts)
	assert_eq(counts[0]["surfaces"], counts[2]["surfaces"], "the draw calls do not change")
	return true
