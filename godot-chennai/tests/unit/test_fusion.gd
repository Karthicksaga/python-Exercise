extends TestCase
## Format 2.3 building fusion (decisions G-220…G-226): `fusion.bin` read like the Python
## reference, added buildings joining their chunk through the normal building path (ids, sources,
## labelled heights, no new draw calls), squares that hold only added buildings streaming, height
## fixes on OSM buildings, and every dataset's credit line on the About page.

## A suburban village square in ring 2 (13.127 N, 80.065 E): no OSM building, 350 added.
const VILLAGE := Vector2i(50, 210)
const VILLAGE_TILE := Vector2i(1, 5)
## A T. Nagar square west of Panagal Park (13.042 N, 80.229 E): 103 OSM buildings, 52 added.
const T_NAGAR := Vector2i(121, 248)
## The mesh layers a chunk may have; added buildings must use the existing ones.
const LAYERS: PackedStringArray = ["ground", "water", "decks", "walls", "roofs", "kit", "far", "objects", "trees", "palms", "collider"]


func test_fusion_tile_matches_the_python_reader() -> bool:
	var source := CityTestKit.regional()
	assert_true(source.minor >= 3, "world.json says format 2.3")
	assert_eq(source.fusion_file, "fusion.bin", "the fusion file name")
	var t := source.tile_fusion(VILLAGE_TILE)
	assert_true(t != null and t.ok(), "tile 1_5's fusion.bin decodes: %s" % (t.error if t != null else "null"))
	# Values printed by tools/geo (chennai_geo.fusion_codec.decode) for tile 1_5.
	assert_eq(t.cells.size(), 1417, "squares with added buildings")
	assert_eq(t.buildings, 107624, "added buildings in the tile")
	assert_eq(t.heights.size(), 0, "no height fixes in this tile")
	var list: Array = t.cells[VILLAGE]
	assert_eq(list.size(), 350, "the village square")
	var b: Building = list[0]
	assert_eq(b.id, 3221671868, "first id of the square")
	assert_eq(b.fusion_source, &"overture", "taken from Overture")
	assert_eq(b.fusion_origin, &"microsoft", "Overture had it from Microsoft")
	assert_eq(b.dataset, 3, "provenance dataset overture:buildings")
	assert_eq(b.source_id, 73412, "row in the Overture extract")
	assert_near(b.confidence, -1.0, 1e-6, "no confidence given")
	assert_near(b.height, 4.0, 1e-4, "one estimated floor")
	assert_eq(b.height_from, &"estimated", "labelled estimated")
	assert_eq(b.kind, &"house", "a house")
	assert_eq(b.color_hex, 0xf7edb5, "wall colour")
	assert_eq(b.outline.size(), 4, "a box")
	var want := PackedVector2Array([Vector2(-15618.29, -4741.48), Vector2(-15626.19, -4740.21), Vector2(-15627.41, -4747.82), Vector2(-15619.51, -4749.09)])
	# The decoder gives the box corners from its centre, sides and angle: the same corners as the
	# Python reader, in an order that may start at another corner.
	for p in want:
		var near := 1e9
		for q in b.outline:
			near = minf(near, p.distance_to(q))
		assert_true(near < 0.03, "corner %s within 3 cm (%.3f)" % [p, near])
	assert_eq((list[1] as Building).source_id, 82218, "the second row, delta-coded")
	var t2 := source.tile_fusion(Vector2i(2, 5))
	assert_eq(t2.heights.size(), 2, "two height fixes in tile 2_5")
	assert_eq(t2.heights[1534023218], Vector3(19.5, 6, 3), "an estimated OSM building gets Overture's height")
	return true


func test_added_buildings_join_the_chunk_through_the_building_path() -> bool:
	var source := CityTestKit.regional()
	var chunk := source.read_chunk(VILLAGE)
	assert_eq(chunk.error, "", "the village square reads")
	var osm := chunk.buildings.size()
	source.apply_fusion(chunk)
	assert_eq(chunk.buildings.size(), osm + 350, "350 buildings added")
	var ids := {}
	for b in chunk.buildings:
		check(not ids.has(b.id), "ids are unique")
		ids[b.id] = true
		if b.fusion_source != &"osm":
			check(b.id >= 0xC0000000, "added ids are in their own range")
			check(b.height_from in [&"estimated", &"overture", &"microsoft"], "added heights are never OSM's")
			check(b.outline.size() >= 3 and b.height >= 2.5, "a real footprint and height")
	return true


func test_fusion_only_squares_stream() -> bool:
	var source := CityTestKit.regional()
	var json := JSON.new()
	json.parse(FileAccess.get_file_as_string("res://world/world.json"))
	var only: Array = ((json.data as Dictionary)["fusion"] as Dictionary)["cells"]
	assert_true(only.size() > 1000, "the world lists squares with only added buildings (%d)" % only.size())
	var c: Array = only[only.size() / 2]
	var cell := Vector2i(int(c[0]), int(c[1]))
	var centre := WorldCodec.chunk_centre(Rect2(source.grid_origin, Vector2.ONE), source.chunk_size, cell.x, cell.y)
	assert_true(source.chunks_near(centre, 10.0).has(cell), "the streamer finds it")
	var chunk := source.read_chunk(cell)
	assert_eq(chunk.error, "", "it reads as an empty square")
	source.apply_fusion(chunk)
	assert_true(chunk.buildings.size() > 0, "and gets its added buildings")
	return true


func test_village_and_city_build_with_no_new_draw_calls() -> bool:
	var kit := CityTestKit.regional_kit()
	var source := kit.source as RegionalWorldSource
	for cell: Vector2i in [VILLAGE, T_NAGAR]:
		# The same square without and with fusion (the source's fusion file switched off and on).
		var file := source.fusion_file
		source.fusion_file = ""
		var before := ChunkBuilder.build(kit, cell)
		source.fusion_file = file
		var after := ChunkBuilder.build(kit, cell)
		assert_eq(after.error, "", "%s builds" % cell)
		# Added buildings go into the chunk's existing building meshes: a square that had buildings
		# keeps its draw calls; one that had none gets the building layers any OSM chunk has.
		for layer: String in after.triangles:
			check(LAYERS.has(layer), "%s: known layer %s" % [cell, layer])
		if not before.chunk.buildings.is_empty():
			assert_eq(after.surfaces, before.surfaces, "%s: no new draw calls" % cell)
		assert_true(after.surfaces <= 9, "%s: draw calls within an OSM chunk's (%d)" % [cell, after.surfaces])
		assert_true(after.total_triangles(true) < 90000, "%s: near look within the chunk budget (%d)" % [cell, after.total_triangles(true)])
		var added := after.chunk.buildings.size() - before.chunk.buildings.size()
		print("fusion %s: buildings %d -> %d, triangles near %d -> %d, far %d -> %d, draw calls %d -> %d, build %.1f -> %.1f ms" % [
			cell, before.chunk.buildings.size(), after.chunk.buildings.size(), before.total_triangles(true), after.total_triangles(true),
			before.total_triangles(false), after.total_triangles(false), before.surfaces, after.surfaces, before.usec / 1000.0, after.usec / 1000.0])
		if cell == VILLAGE:
			assert_eq(added, 350, "the village's added buildings are drawn")
			assert_true(after.triangles.get("walls", 0) > before.triangles.get("walls", 0), "more walls")
		CityTestKit.free_build(before)
		CityTestKit.free_build(after)
	return true


func test_every_dataset_has_its_credit_on_the_about_page() -> bool:
	var source := CityTestKit.regional()
	var credits := source.get_data_credits()
	assert_true(credits.size() >= 2, "credits from world.json (%d)" % credits.size())
	var json := JSON.new()
	json.parse(FileAccess.get_file_as_string("res://world/world.json"))
	var fusion: Dictionary = (json.data as Dictionary)["fusion"]
	var lines: Dictionary = {
		"osm": "© OpenStreetMap contributors (ODbL)",
		"overture": "Overture Maps Foundation (ODbL for buildings)",
		"google": "Contains data from Google Open Buildings (ODbL)",
		"microsoft": "Microsoft Global ML Building Footprints (CDLA Permissive 2.0)",
	}
	var title: TitleMenu = (load("res://src/ui/title_menu/title_menu.tscn") as PackedScene).instantiate()
	title.reduced_motion = true
	root.add_child(title)
	title.set_credits(source.get_attribution(), source.get_data_date(), credits)
	var about := title.about_text()
	for s: Variant in fusion["present"]:
		assert_true(credits.has(lines[str(s)]), "%s credited in world.json" % s)
		if str(s) != "osm":
			assert_true(about.contains(lines[str(s)]), "%s credited on the About page" % s)
	assert_true(about.contains("OpenStreetMap"), "OSM credited")
	title.queue_free()
	return true
