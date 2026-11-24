extends TestCase
## Format 2.1 infrastructure (decisions G-150…G-153): `infra.bin` read like the Python reference,
## road heights on decks and ramps, stacked surfaces at Kathipara, seamless decks across chunk
## edges, deck meshes and colliders, and the speed-breaker query.

## Kathipara interchange (centre of its named roads) and its tile.
const KATHIPARA := Vector2(-700.0, 8620.0)
const KATHIPARA_TILE := Vector2i(2, 6)


func test_infra_tile_matches_the_python_reader() -> bool:
	var source := CityTestKit.regional()
	assert_eq(source.minor, 1, "world.json says format 2.1")
	var t := source.tile_infra(KATHIPARA_TILE)
	assert_true(t != null and t.ok(), "the tile's infra.bin decodes")
	# Values printed by tools/geo (chennai_geo.infra.decode_infra) for tile 2_6.
	assert_eq(t.tile, KATHIPARA_TILE, "tile")
	assert_eq(t.decks.size(), 646, "raised road pieces")
	assert_eq(t.waterways.size(), 135, "waterways")
	assert_eq(t.spots.size(), 1389, "street spots")
	assert_eq(t.decks[4].size(), 54, "samples of piece 4")
	assert_near(t.decks[4][1], 4.75, 1e-4, "second sample of piece 4")
	assert_eq(t.waterways[0].kind, &"river", "first waterway kind")
	assert_eq(t.waterways[0].name, "Adyar River", "first waterway name")
	assert_eq(t.waterways[0].points.size(), 18, "first waterway points")
	var sp := t.spots[0]
	assert_eq(sp.kind, &"hump", "first spot")
	assert_vec_near(sp.position, Vector2(503.7, 9545.8), 0.03, "first spot position")
	assert_eq(sp.road_id, 265286850, "first spot's road")
	return true


func test_road_heights_follow_the_samples() -> bool:
	var net := CityTestKit.regional().tile_roads(KATHIPARA_TILE)
	var road := net.roads[4]
	assert_true(road.is_raised(), "piece 4 is raised")
	assert_near(road.height_along(0.0), 5.0, 1e-4, "first sample")
	assert_near(road.height_along(2.5), 4.875, 1e-3, "halfway between samples")
	var total := road.along[road.along.size() - 1]
	assert_near(road.height_along(total), road.heights[road.heights.size() - 1], 1e-4, "last sample at the piece's end")
	assert_near(road.height_at(0, 0.0), road.height_along(0.0), 1e-5, "segment form agrees")
	return true


func test_kathipara_has_stacked_decks() -> bool:
	var kit := CityTestKit.regional_kit()
	var heights := RoadHeights.create(kit.layouts)
	var layout := kit.layouts.layout_for(kit.source.cell_at(KATHIPARA))
	var top := 0.0
	var stacked := 0
	var checked := 0
	for road in layout.roads:
		if not road.is_raised() or road.points[0].distance_to(KATHIPARA) > 500.0:
			continue
		for i in road.points.size() - 1:
			if road.height_at(i, 0.5) < 12.5:
				continue
			var p := road.points[i].lerp(road.points[i + 1], 0.5)
			var s := heights.surfaces_at(p)
			checked += 1
			top = maxf(top, s[s.size() - 1])
			# Where a ramp leaves the deck their carriageways overlap at slightly different
			# heights, so the top surface is at least this road's.
			assert_true(heights.top_at(p) >= road.height_at(i, 0.5) - 0.05, "the top surface is the upper deck at %s" % p)
			var middle := -1.0
			for h in s:
				if h > 4.0 and h < 9.0:
					middle = h
			if middle > 0.0:
				stacked += 1
				assert_true(heights.height_at(p, middle) < 9.5, "a car on the middle deck at %s stays on it (%.2f)" % [p, heights.height_at(p, middle)])
				assert_true(heights.height_at(p, 0.0) < 1.0, "a car on the ground at %s stays on the ground" % p)
	assert_true(checked > 5, "points on the upper deck (%d)" % checked)
	assert_near(top, 13.0, 0.1, "upper deck about 13 m (two layers of 6.5 m)")
	assert_true(stacked > 0, "somewhere three surfaces stack: ground, lower deck, upper deck")
	return true


func test_decks_are_seamless_across_chunk_edges() -> bool:
	var kit := CityTestKit.regional_kit()
	var layout := kit.layouts.layout_for(kit.source.cell_at(KATHIPARA))
	var seams := 0
	var centre := kit.source.cell_at(KATHIPARA)
	var ends: Dictionary[String, Array] = {}
	for dx in range(-2, 3):
		for dz in range(-2, 3):
			for span: CityLayout.RoadSpan in layout.spans_in(centre + Vector2i(dx, dz)):
				if not span.road.is_raised():
					continue
				var prof := DeckMeshes.profile(span)
				var key := "%d:%d" % [span.road.id, span.road.piece]
				if not ends.has(key):
					ends[key] = []
				ends[key].append([span.start, span.end, prof.points[0], prof.heights[0], prof.points[prof.points.size() - 1], prof.heights[prof.heights.size() - 1]])
	for key: String in ends:
		var list: Array = ends[key]
		for a: Array in list:
			for b: Array in list:
				if int(a[1]) == int(b[0]):
					seams += 1
					assert_vec_near(a[4], b[2], 1e-4, "%s: the next chunk's span starts where this one ends" % key)
					assert_near(float(a[5]), float(b[3]), 1e-4, "%s: at the same height" % key)
	assert_true(seams > 3, "raised roads cross chunk edges here (%d seams)" % seams)
	return true


func test_deck_meshes_and_colliders_at_kathipara() -> bool:
	var kit := CityTestKit.regional_kit()
	var cell := kit.source.cell_at(KATHIPARA)
	var a := ChunkBuilder.build(kit, cell)
	var b := ChunkBuilder.build(kit, cell)
	assert_eq(a.error, "", "chunk builds")
	assert_true(int(a.triangles.get("decks", 0)) > 1000, "deck structure drawn (%d triangles)" % a.triangles.get("decks", 0))
	assert_eq(CityTestKit.digest(a), CityTestKit.digest(b), "deterministic")
	var deck_bodies := 0
	var deck_faces := 0
	for body in a.bodies:
		if body.name.begins_with("Decks"):
			deck_bodies += 1
			var shape := (body.get_child(0) as CollisionShape3D).shape as ConcavePolygonShape3D
			deck_faces += shape.get_faces().size() / 3
			assert_true(shape.get_faces().size() / 3 <= DeckMeshes.PIECE_FACES + 12, "collider piece small enough to add in one step")
	assert_true(deck_bodies >= 1 and deck_faces > 200, "deck colliders (%d bodies, %d faces)" % [deck_bodies, deck_faces])
	assert_true(a.surfaces <= 9, "at most one more draw call for decks (%d)" % a.surfaces)
	var decks := DeckMeshes.new()
	decks.origin = a.centre
	decks.layout = kit.layouts.layout_for(cell)
	for span: CityLayout.RoadSpan in decks.layout.spans_in(cell):
		decks.add_span(span)
	assert_true(decks.piers > 4, "piers under the flyovers (%d)" % decks.piers)
	assert_true(decks.parapet_gaps > 0, "parapets open where ramps join (%d gaps)" % decks.parapet_gaps)
	CityTestKit.free_build(a)
	CityTestKit.free_build(b)
	return true


func test_no_kerbs_or_poles_on_raised_stretches() -> bool:
	var kit := CityTestKit.regional_kit()
	var cell := kit.source.cell_at(KATHIPARA)
	var layout := kit.layouts.layout_for(cell)
	var heights := RoadHeights.create(kit.layouts)
	var build := ChunkBuilder.build(kit, cell)
	for pole in build.furniture.poles:
		var under := heights.top_at(pole.position)
		var hit := layout.nearest_road_point(pole.position)
		var road: Road = layout.roads[int(hit["road_index"])]
		assert_false(road.is_raised() and road.height_along(0.0) > 1.0 and float(hit["distance"]) < road.width / 2.0 + 1.0 and under > 1.0, "pole at %s is not on a deck" % pole.position)
	CityTestKit.free_build(build)
	return true


func test_speed_breaker_profile_and_crossing() -> bool:
	var sp := WorldSpot.new()
	sp.kind = &"hump"
	sp.position = Vector2(10.0, 20.0)
	sp.yaw = 0.0  # road runs along +Z
	sp.width = 7.0
	var b := RoadBumps.from_spot(sp)
	assert_near(b.length, 3.7, 1e-6, "a hump is 3.7 m long")
	assert_near(b.surface_at(Vector2(10.0, 20.0)), 0.10, 1e-6, "crest 10 cm")
	assert_near(b.surface_at(Vector2(10.0, 20.0 + 1.85)), 0.0, 1e-6, "flush at its edge")
	assert_near(b.surface_at(Vector2(13.4, 20.0)), 0.10, 1e-6, "full height across the carriageway")
	assert_near(b.surface_at(Vector2(13.6, 20.0)), 0.0, 1e-6, "nothing past the carriageway")
	var kit := CityTestKit.regional_kit()
	var bumps := RoadBumps.create(kit.layouts)
	var tile := CityTestKit.regional().tile_infra(KATHIPARA_TILE)
	var mapped: WorldSpot = null
	for s in tile.spots:
		if s.is_bump() and s.mapped:
			mapped = s
			break
	assert_true(mapped != null, "a mapped speed breaker in the tile")
	var dir := mapped.direction()
	var hit := bumps.crossed(mapped.position - dir * 2.0, mapped.position + dir * 2.0)
	assert_true(hit != null and hit.position.distance_to(mapped.position) < 0.01, "a car driving over it crosses it")
	var side := Vector2(-dir.y, dir.x) * (mapped.width / 2.0 + 3.0)
	assert_true(bumps.crossed(mapped.position + side - dir * 2.0, mapped.position + side + dir * 2.0) == null, "beside the road it is not crossed")
	assert_true(bumps.surface_at(mapped.position) > 0.01, "its surface rises at the spot")
	assert_true(bumps.near(mapped.position, 5.0).size() >= 1, "found near the spot")
	return true
