extends TestCase
## The city mesh builders (decisions G-51…G-53): parity of the variety hash with the Three.js
## game, deterministic output, triangle budgets, the facade kit, landmarks and the sign rules.

## Today's densest chunk file (13,296 bytes, 467 buildings), the spawn's and a T. Nagar one.
const DENSE := Vector2i(35, 33)
const SPAWN := Vector2i(6, 4)


func test_hash_matches_the_threejs_game() -> bool:
	# Reference values printed by node from `hash.ts` / `props.ts` / `ChunkView.ts treeHash`.
	assert_near(CityHash.unit(242400280, 41), 0.43687573028728366, 1e-12, "hash(id, 41)")
	assert_near(CityHash.unit(1548155931, 302), 0.9650689614936709, 1e-12, "hash of a large id")
	assert_near(CityHash.unit(0, 0), 0.3921251413412392, 1e-12, "hash(0, 0)")
	assert_near(CityHash.unit(-5, 3), 0.5566726389806718, 1e-12, "negative id wraps like ToInt32")
	assert_near(CityHash.prop_unit(242400280, 1), 0.9317077833693475, 1e-12, "props hash")
	assert_near(CityHash.prop_unit(651861526, 10000), 0.28890553466044366, 1e-12, "props hash, big salt")
	assert_near(CityHash.tree_unit(Vector2(402.41, -147.93), 51), 0.6079266665037721, 1e-12, "treeHash")
	assert_near(CityHash.tree_unit(Vector2(-1500.25, 8000.75), 52), 0.377400727244094, 1e-12, "treeHash, negative x")
	return true


func test_builds_are_deterministic() -> bool:
	var kit := CityTestKit.kit()
	for cell: Vector2i in [SPAWN, DENSE]:
		var a := ChunkBuilder.build(kit, cell)
		var b := ChunkBuilder.build(kit, cell)
		assert_eq(a.error, "", "chunk %s builds" % cell)
		assert_eq(a.triangles, b.triangles, "same triangle counts for %s" % cell)
		assert_eq(CityTestKit.digest(a), CityTestKit.digest(b), "same meshes for %s" % cell)
		assert_eq(a.bodies.size(), b.bodies.size(), "same collider pieces for %s" % cell)
		CityTestKit.free_build(a)
		CityTestKit.free_build(b)
	return true


func test_triangle_budgets() -> bool:
	var kit := CityTestKit.kit()
	var dense := ChunkBuilder.build(kit, DENSE)
	assert_eq(dense.chunk.buildings.size(), 467, "the densest chunk")
	# One chunk near the camera must leave room for its neighbours in the 300k frame budget.
	assert_true(dense.total_triangles(true) < 90000, "densest chunk, near look: %d triangles" % dense.total_triangles(true))
	assert_true(dense.total_triangles(false) < 25000, "densest chunk, far look: %d triangles" % dense.total_triangles(false))
	assert_true(dense.triangles["far"] * 4 < dense.triangles["walls"], "the far look is much cheaper than the near walls")
	assert_true(dense.surfaces <= 8, "at most 8 draw calls a chunk (%d)" % dense.surfaces)
	var spawn := ChunkBuilder.build(kit, SPAWN)
	for layer: String in ["ground", "walls", "roofs", "kit", "objects", "trees", "palms"]:
		assert_true(spawn.triangles.get(layer, 0) > 0, "spawn chunk has %s" % layer)
	assert_true(spawn.furniture.poles.size() > 0 and spawn.furniture.kerbs.size() > 0, "poles and kerbs on its main roads")
	CityTestKit.free_build(dense)
	CityTestKit.free_build(spawn)
	return true


func test_ground_layers() -> bool:
	var kit := CityTestKit.kit()
	var layout := kit.layouts.layout_for(SPAWN)
	var g := GroundMeshes.new()
	g.origin = ChunkBuilder.centre_of(kit.source, SPAWN)
	var chunk := kit.source.read_chunk(SPAWN)
	var square := Rect2(kit.source.get_grid_origin() + Vector2(SPAWN) * 250.0, Vector2(250, 250))
	var f := StreetFurniture.for_chunk(layout, chunk, SPAWN)
	g.build(layout.spans_in(SPAWN), chunk.areas, square, f.kerbs)
	var layers := {}
	for i in range(0, g.mesh.indices.size(), 3):
		var u := g.mesh.uvs[g.mesh.indices[i]].x
		layers[floori(u / GroundMeshes.LAYER_U)] = true
	for l: int in [CityAtlas.GROUND_EARTH, CityAtlas.GROUND_ASPHALT, CityAtlas.GROUND_PAVING, CityAtlas.GROUND_PAINT, CityAtlas.GROUND_KERB]:
		assert_true(layers.has(l), "ground has layer %d" % l)
	assert_true(g.stripes > 10, "lane markings painted (%d)" % g.stripes)
	var top := 0.0
	for p in g.mesh.positions:
		top = maxf(top, p.y)
	assert_near(top, StreetFurniture.KERB_HEIGHT, 0.001, "kerbs are the highest ground layer")
	assert_eq(GroundMeshes.lane_lines(_road(&"primary", 14.0, -1, false)).size(), 5, "two-way primary: centre, two lane lines, two edges")
	assert_eq(GroundMeshes.lane_lines(_road(&"residential", 7.0, -1, false)).size(), 0, "no paint on residential streets")
	return true


func _road(kind: StringName, width: float, lanes: int, oneway: bool) -> Road:
	var r := Road.new()
	r.kind = kind
	r.width = width
	r.lanes = lanes
	r.oneway = oneway
	return r


func test_facade_kit() -> bool:
	var kit := CityTestKit.kit()
	# The square holding the middle of Sir Thyagaraya Road, T. Nagar's shopping street.
	var street := kit.source.loaded_roads().named("Sir Thyagaraya Road")[0]
	var cell := kit.source.cell_at(street.points[street.points.size() / 2])
	var chunk := kit.source.read_chunk(cell)
	var spans := kit.layouts.layout_for(cell).spans_in(cell)
	var shops := 0
	var tiled := 0
	for b in chunk.buildings:
		var plan := BuildingMeshes.plan_facade(b, spans)
		shops += plan.shop_walls.size()
		if BuildingMeshes.has_tiled_roof(b):
			tiled += 1
		assert_true(plan.shop_walls.is_empty() or b.kind == &"commercial" or b.floors >= 2, "only commercial or two-storey buildings get shops")
	assert_true(shops > 0, "shop fronts on walls facing roads (%d)" % shops)
	assert_true(tiled > 0 and tiled < chunk.buildings.size() / 2, "some low houses get clay-tile roofs (%d)" % tiled)
	var shops_on := BuildingMeshes.shops_on_wall(chunk.buildings[0], 0, 5)
	var bays := 0
	for s in shops_on:
		bays += int(s["bays"])
	assert_eq(bays, 5, "shops fill the wall's bays")
	return true


func test_signs_are_generic_words() -> bool:
	for s: Dictionary in ShopSigns.SIGNS:
		for word in str(s["english"]).replace("&", " ").replace("·", " ").split(" ", false):
			assert_true(ShopSigns.SIGN_WORDS.has(word), "sign word %s is on the generic list" % word)
		assert_true(str(s["tamil"]).length() > 0, "Tamil line first")
	assert_eq(ShopSigns.wide().size(), CityAtlas.WIDE_ROWS, "wide signs fill their atlas rows")
	assert_true(ShopSigns.narrow().size() <= CityAtlas.NARROW_ROWS * 2, "narrow signs fit the atlas")
	return true


func test_prop_models_baked() -> bool:
	var models := CityTestKit.kit().models
	assert_eq(models.error, "", "every prop GLB read")
	for name: StringName in CityModels.PROP_FILES:
		var b: AABB = models.prop_bounds[name]
		assert_near(b.position.y, 0.0, 0.001, "%s stands on y = 0" % name)
		if StreetProps.SIZE.has(name):
			var s: Vector3 = StreetProps.SIZE[name]
			# The collider box comes from the table, so the model must fit inside it.
			assert_true(b.size.y > 0.3 and b.size.y <= s.z + 0.05, "%s (%.2f m) fits its collider height %.2f" % [name, b.size.y, s.z])
	return true
