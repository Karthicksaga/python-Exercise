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
