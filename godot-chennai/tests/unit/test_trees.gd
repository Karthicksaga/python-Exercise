extends TestCase
## The tree kit (G-380 to G-389): species and models with three LODs each, the one atlas and its
## size and licence rows, the LOD rule, what stands where (no plant on a carriageway or inside a
## building, species by area), determinism, the draw-call and triangle budgets, and the quality
## caps.

const SPAWN := Vector2i(6, 4)
const DENSE := Vector2i(35, 33)

const WANTED_TREES: Array[StringName] = [&"neem", &"rain", &"banyan", &"tamarind", &"gulmohar", &"coconut", &"palmyra", &"mango", &"peepal", &"casuarina"]
const WANTED_BUSHES: Array[StringName] = [&"oleander", &"bougainvillea", &"croton", &"grass_tuft", &"scrub"]

static var _models: TreeModels
static var _kit: TreeKit


func before_each() -> void:
	TreeQuality.reset()


func _built() -> TreeModels:
	if _models == null:
		_models = TreeKit.build_models()
	return _models


func _tree_kit() -> TreeKit:
	if _kit == null:
		_kit = TreeKit.commit(_built(), TreeKit.make_material())
	return _kit


## A kit over today's files that shares the tree kit made once.
func _city_kit() -> ChunkBuilder.Kit:
	var k := CityTestKit.kit()
	k.trees = _tree_kit()
	return k


func test_species_and_models() -> bool:
	var m := _built()
	assert_eq(m.atlas.error, "", "the atlas layout reads")
	for id: StringName in WANTED_TREES + WANTED_BUSHES:
		assert_true(TreeSpecies.IDS.has(id), "%s is in the kit" % id)
	var dead := 0
	for id in TreeSpecies.IDS:
		if TreeSpecies.kind_of(id) == TreeSpecies.DEAD:
			dead += 1
	assert_true(dead >= 3, "a few dead and bare trees (%d)" % dead)
	assert_true(TreeSpecies.IDS.size() >= 18, "at least eighteen species")
	for id in TreeSpecies.IDS:
		var kind := TreeSpecies.kind_of(id)
		var budget: Array = TreeModels.BUDGET[kind]
		var last := 1_000_000
		for lod in TreeSpecies.LODS:
			var n := m.triangles(id, lod)
			assert_true(n > 0, "%s LOD %d has triangles" % [id, lod])
			assert_true(n <= int(budget[lod]), "%s LOD %d: %d triangles, budget %d" % [id, lod, n, int(budget[lod])])
			assert_true(n < last or n <= 8, "%s: LOD %d is lighter than the one before (%d vs %d)" % [id, lod, n, last])
			last = n
	return true


func test_silhouettes_differ() -> bool:
	# Individual silhouettes: the bounding boxes of the ten tree species are not all alike.
	var m := _built()
	var boxes: Dictionary[StringName, Vector3] = {}
	for id in WANTED_TREES:
		var lo := Vector3(INF, INF, INF)
		var hi := Vector3(-INF, -INF, -INF)
		for p in m.builder(id, 0).positions:
			lo = lo.min(p)
			hi = hi.max(p)
		boxes[id] = hi - lo
	for a in WANTED_TREES:
		for b in WANTED_TREES:
			if String(a) < String(b):
				var d := (boxes[a] - boxes[b]).length()
				assert_true(d > 0.6, "%s and %s have different outlines (%.2f m apart)" % [a, b, d])
	assert_true(boxes[&"rain"].x > boxes[&"neem"].x * 1.6, "the rain tree's crown is wide and flat")
	assert_true(boxes[&"palmyra"].y > 11.0 and boxes[&"palmyra"].x < 9.0, "the palmyra is tall and slim")
	assert_true(boxes[&"banyan"].x > 15.0, "the banyan's crown is big")
	return true


func test_one_atlas_and_wind_data() -> bool:
	var m := _built()
	var kit := _tree_kit()
	var mat: Material = kit.mesh_of(&"neem", 0).surface_get_material(0)
	for id in TreeSpecies.IDS:
		for lod in TreeSpecies.LODS:
			assert_true(kit.mesh_of(id, lod).surface_get_material(0) == mat, "%s LOD %d uses the one shared material" % [id, lod])
			assert_eq(kit.mesh_of(id, lod).get_surface_count(), 1, "%s LOD %d is one surface" % [id, lod])
	# Every vertex's u (after taking the wind level off) lies inside one tile of the atlas.
	var inside := true
	for id in TreeSpecies.IDS:
		var b := m.builder(id, 0)
		for uv in b.uvs:
			var level := floorf(uv.x * 0.5)
			var u := uv.x - 2.0 * level
			if level < 0.0 or level > 8.0 or u < 0.0 or u > 1.0 or uv.y < 0.0 or uv.y > 1.0:
				inside = false
	assert_true(inside, "every UV is an atlas point with a wind level 0..8")
	var shader: Shader = (mat as ShaderMaterial).shader
	assert_contains(shader.code, "sway", "the wind is in the shader")
	assert_contains(shader.code, "void vertex()", "in the vertex stage")
	assert_contains(shader.code, "ALPHA_SCISSOR_THRESHOLD", "leaves are alpha-cut (no sorting)")
	return true


func test_atlas_size_and_licence() -> bool:
	var a := _built().atlas
	assert_true(a.vram_bytes() <= TreeAtlas.BUDGET_BYTES, "the atlas in video memory: %d bytes, limit %d" % [a.vram_bytes(), TreeAtlas.BUDGET_BYTES])
	assert_eq(a.size, Vector2(1024, 512), "1024 x 512")
	var img := Image.load_from_file(ProjectSettings.globalize_path(TreeAtlas.PNG))
	assert_true(img != null and Vector2(img.get_size()) == a.size, "the PNG is the layout's size")
	# VRAM compression with mipmaps (import settings), and the compressed files within the limit.
	var imp := FileAccess.get_file_as_string("res://assets/trees/tree_atlas.png.import")
	assert_contains(imp, "compress/mode=2", "VRAM-compressed on import")
	assert_contains(imp, "mipmaps/generate=true", "with mip maps")
	for line in imp.split("\n"):
		if line.begins_with("path.etc2=") or line.begins_with("path.s3tc="):
			var path := line.split("=")[1].trim_prefix("\"").trim_suffix("\"")
			if FileAccess.file_exists(path):
				var f := FileAccess.open(path, FileAccess.READ)
				assert_true(f.get_length() <= TreeAtlas.BUDGET_BYTES, "%s: %d bytes" % [path, f.get_length()])
	# Every tile the models use exists.
	for tile: StringName in [&"leaf_broad", &"leaf_neem", &"leaf_feather", &"flower_red", &"frond", &"fan", &"fan_dry", &"needle", &"grass", &"bougainvillea", &"oleander", &"croton", &"twigs", &"bark"]:
		assert_true(a.has_tile(tile), "atlas tile %s" % tile)
	var lic := FileAccess.get_file_as_string("res://assets/LICENSES.md")
	assert_contains(lic, "assets/trees/tree_atlas.png", "the atlas has a licence row")
	assert_contains(lic, "assets/trees/atlas_layout.json", "and its layout")
	assert_contains(lic, "CC0", "CC0")
	return true


func test_lod_rule() -> bool:
	var h := TreeQuality.HYSTERESIS
	assert_eq(TreeLod.pick(10.0, TreeLod.HIDDEN, 45.0, 140.0, 340.0, h), 0, "near is LOD 0")
	assert_eq(TreeLod.pick(80.0, TreeLod.HIDDEN, 45.0, 140.0, 340.0, h), 1, "mid is LOD 1")
	assert_eq(TreeLod.pick(200.0, TreeLod.HIDDEN, 45.0, 140.0, 340.0, h), 2, "far is LOD 2")
	assert_eq(TreeLod.pick(400.0, TreeLod.HIDDEN, 45.0, 140.0, 340.0, h), TreeLod.HIDDEN, "beyond the far limit: not drawn")
	# Hysteresis: standing on an edge does not flip.
	assert_eq(TreeLod.pick(46.0, 0, 45.0, 140.0, 340.0, h), 0, "LOD 0 holds a little past its edge")
	assert_eq(TreeLod.pick(44.0, 1, 45.0, 140.0, 340.0, h), 1, "LOD 1 holds a little inside the edge")
	assert_eq(TreeLod.pick(49.0, 0, 45.0, 140.0, 340.0, h), 1, "past the margin it swaps")
	assert_eq(TreeLod.pick(41.0, 1, 45.0, 140.0, 340.0, h), 0, "and swaps back inside the margin")
	assert_eq(TreeLod.limit_meshes(PackedInt32Array([3, 4, 5])), PackedInt32Array([3, 9, 0]), "three LODs at once: the far ones take the middle mesh")
	assert_eq(TreeLod.limit_meshes(PackedInt32Array([0, 4, 5])), PackedInt32Array([0, 4, 5]), "two LODs are left alone")
	return true


func _digest(spots: Array[TreeSpot]) -> String:
	var parts := PackedStringArray()
	for s in spots:
		parts.append("%s@%.2f,%.2f:%.3f:%.3f:%.3f" % [s.species, s.position.x, s.position.y, s.scale, s.yaw, s.rank])
	return "\n".join(parts).sha256_text()


func _context(kit: ChunkBuilder.Kit, cell: Vector2i) -> TreePlan.Context:
	var chunk := kit.source.read_chunk(cell)
	var layout := kit.layouts.layout_for(cell)
	var size := layout.chunk_size
	var ctx := TreePlan.Context.new()
	ctx.layout = layout
	ctx.buildings = chunk.buildings
	ctx.boxes = StreetFurniture.building_boxes(chunk.buildings)
	ctx.areas = chunk.areas
	ctx.palettes = kit.palettes
	ctx.square = Rect2(kit.source.get_grid_origin() + Vector2(cell) * size, Vector2(size, size))
	ctx.rural = chunk.buildings.size() < RoadDetail.RURAL_BUILDINGS
	return ctx


func test_plants_stand_clear_and_deterministic() -> bool:
	var kit := _city_kit()
	var total := 0
	for cell: Vector2i in [SPAWN, DENSE, SPAWN + Vector2i(1, 1), DENSE + Vector2i(-1, 0)]:
		var ctx := _context(kit, cell)
		var chunk := kit.source.read_chunk(cell)
		var spots := TreePlan.for_chunk(ctx, chunk.trees)
		total += spots.size()
		for s in spots:
			assert_false(StreetFurniture.in_building(ctx.buildings, ctx.boxes, s.position, 0.0), "%s at %s is not inside a building (%s)" % [s.species, s.position, cell])
			var hit := ctx.layout.nearest_road_point(s.position, false)
			if not hit.is_empty():
				var road: Road = ctx.layout.roads[int(hit["road_index"])]
				assert_true(float(hit["distance"]) >= road.width / 2.0, "%s at %s is off the carriageway (%.1f m from the centre, road half width %.1f)" % [s.species, s.position, float(hit["distance"]), road.width / 2.0])
			assert_true(ctx.square.grow(0.5).has_point(s.position), "%s stays in its chunk square" % s.species)
		assert_eq(_digest(spots), _digest(TreePlan.for_chunk(ctx, chunk.trees)), "the same plan twice for %s" % cell)
		var species := {}
		var under := {}
		for s in spots:
			if TreeSpecies.is_understory(s.species):
				under[s.species] = true
			else:
				species[s.species] = true
		assert_true(species.size() <= TreePlan.MAX_TREE_SPECIES, "at most %d tree species a chunk (%d)" % [TreePlan.MAX_TREE_SPECIES, species.size()])
		assert_true(under.size() <= TreePlan.MAX_UNDER_SPECIES, "at most %d understory species a chunk (%d)" % [TreePlan.MAX_UNDER_SPECIES, under.size()])
	assert_true(total > 150, "the chunks have plants (%d)" % total)
	return true


func test_species_mix_by_area() -> bool:
	# Hash many positions through the style tables: coast, country and leafy districts differ.
	var shares: Dictionary[StringName, Dictionary] = {}
	for profile: StringName in [TreeStyle.URBAN, TreeStyle.COASTAL, TreeStyle.RURAL, TreeStyle.LEAFY]:
		var w := TreeStyle.weights_for(profile, &"", false, false)
		var counts: Dictionary[StringName, int] = {}
		for i in 3000:
			var sp := RoadStyle.pick_species(w, CityHash.tree_unit(Vector2(float(i) * 3.7, float(i % 91) * 5.3), 401))
			counts[sp] = int(counts.get(sp, 0)) + 1
		var share: Dictionary[StringName, float] = {}
		for k in counts:
			share[k] = float(counts[k]) / 3000.0
		shares[profile] = share
	assert_true(float(shares[TreeStyle.COASTAL].get(&"casuarina", 0.0)) > 0.3, "casuarina dominates the coast")
	assert_true(float(shares[TreeStyle.URBAN].get(&"casuarina", 0.0)) < 0.05, "and is rare in the city")
	assert_true(float(shares[TreeStyle.RURAL].get(&"palmyra", 0.0)) > float(shares[TreeStyle.URBAN].get(&"palmyra", 0.0)) * 3.0, "palmyras are the country tree")
	assert_true(float(shares[TreeStyle.RURAL].get(&"dead_bare", 0.0)) + float(shares[TreeStyle.RURAL].get(&"dead_snag", 0.0)) > float(shares[TreeStyle.LEAFY].get(&"dead_bare", 0.0)) + float(shares[TreeStyle.LEAFY].get(&"dead_snag", 0.0)), "dead trees are commoner in dry country")
	assert_true(float(shares[TreeStyle.LEAFY].get(&"banyan", 0.0)) > float(shares[TreeStyle.URBAN].get(&"banyan", 0.0)), "banyans in the leafy districts")
	var avenue := TreeStyle.weights_for(TreeStyle.URBAN, &"", true, false)
	assert_true(avenue[&"rain"] > avenue[&"neem"], "rain trees line the avenues")
	var park := TreeStyle.weights_for(TreeStyle.URBAN, &"park", false, false)
	assert_true(park[&"gulmohar"] > 0.1, "gulmohar in parks")
	var mapped := TreeStyle.weights_for(TreeStyle.URBAN, &"", false, true)
	var plain := TreeStyle.weights_for(TreeStyle.URBAN, &"", false, false)
	assert_true(mapped[&"banyan"] > plain[&"banyan"], "a mapped natural=tree favours the old big species")
	# Districts of the palette file map to a profile; the coast ones are coastal.
	assert_eq(TreeStyle.district_profile("besant-nagar-elliots-beach"), TreeStyle.COASTAL, "Besant Nagar is the coast")
	assert_eq(TreeStyle.district_profile("tambaram"), TreeStyle.RURAL, "Tambaram side is country")
	# A real chunk by the coast against one in T. Nagar.
	var kit := CityTestKit.regional_kit()
	kit.trees = _tree_kit()
	var coast := _real_mix(kit, Vector2(6295.5, 9486.0))
	var city := _real_mix(kit, Vector2(2543.0, 5160.0))
	assert_true(int(coast.get(&"casuarina", 0)) > int(city.get(&"casuarina", 0)), "more casuarinas at Besant Nagar (%s) than in T. Nagar (%s)" % [coast.get(&"casuarina", 0), city.get(&"casuarina", 0)])
	return true


## Species counts over the 3 x 3 chunks round a point.
func _real_mix(kit: ChunkBuilder.Kit, point: Vector2) -> Dictionary:
	var c := kit.source.cell_at(point)
	var out := {}
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			var cell := c + Vector2i(dx, dz)
			var ctx := _context(kit, cell)
			for s in TreePlan.for_chunk(ctx, kit.source.read_chunk(cell).trees):
				out[s.species] = int(out.get(s.species, 0)) + 1
	return out


func test_chunk_budgets_and_lods() -> bool:
	var kit := _city_kit()
	var b := ChunkBuilder.build(kit, DENSE)
	assert_true(b.tree_batch != null, "the chunk has a TreeBatch")
	var batch := b.tree_batch
	assert_true(batch.groups.size() <= TreePlan.MAX_TREE_SPECIES + TreePlan.MAX_UNDER_SPECIES, "species in the chunk: %d" % batch.groups.size())
	# Camera in the middle of the chunk: near plants LOD 0, the rest 1 and 2; never more than two
	# meshes drawn for one species.
	batch.refresh(Vector3(0.0, 2.0, 0.0))
	assert_true(batch.max_draws_per_species() <= 2, "at most two draw calls a species (%d)" % batch.max_draws_per_species())
	assert_true(batch.draw_calls() <= batch.groups.size() * 2, "draw calls %d for %d species" % [batch.draw_calls(), batch.groups.size()])
	var near := 0
	var mid := 0
	for g in batch.groups:
		near += g.shown[0]
		mid += g.shown[1]
	assert_true(near > 0 and near < batch.instance_count(), "some plants are close enough for LOD 0 (%d of %d)" % [near, batch.instance_count()])
	assert_true(batch.triangles_now() < 40000, "a chunk with the camera inside: %d triangles" % batch.triangles_now())
	# Far away: only LOD 2 (or nothing).
	batch.refresh(Vector3(0.0, 2.0, 300.0))
	for g in batch.groups:
		assert_eq(g.shown[0], 0, "no LOD 0 plants 300 m away (%s)" % g.species)
	assert_true(batch.draw_calls() <= batch.groups.size(), "one mesh per species when far (%d)" % batch.draw_calls())
	var far_tris := batch.triangles_now()
	batch.refresh(Vector3(0.0, 2.0, 0.0))
	assert_true(far_tris < batch.triangles_now(), "far is cheaper than near (%d vs %d)" % [far_tris, batch.triangles_now()])
	# Every instance in every camera position has exactly one LOD or none: counts add up.
	var shown := 0
	for g in batch.groups:
		for lod in 3:
			shown += g.shown[lod]
	assert_true(shown <= batch.instance_count(), "no instance drawn twice")
	# Chunk statistics: the LOD 0 triangles of trees and palms are reported.
	assert_true(b.triangles.get("trees", 0) > 0, "tree triangles reported")
	CityTestKit.free_build(b)
	return true


func test_quality_caps() -> bool:
	var kit := _city_kit()
	var b := ChunkBuilder.build(kit, DENSE)
	var batch := b.tree_batch
	var spot := Vector3(0.0, 2.0, 0.0)
	TreeQuality.apply(QualitySettings.values(QualitySettings.HIGH))
	batch.refresh(spot)
	var high_instances := 0
	var high_tris := batch.triangles_now()
	for g in batch.groups:
		for lod in 3:
			high_instances += g.shown[lod]
	var casters := 0
	for g in batch.groups:
		if g.nodes[0].cast_shadow == GeometryInstance3D.SHADOW_CASTING_SETTING_ON:
			casters += 1
		assert_eq(g.nodes[1].cast_shadow, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "LOD 1 never casts (%s)" % g.species)
		assert_eq(g.nodes[2].cast_shadow, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "LOD 2 never casts (%s)" % g.species)
	assert_true(casters > 0, "LOD 0 casts shadows on High")
	TreeQuality.apply(QualitySettings.values(QualitySettings.LOW))
	assert_false(TreeQuality.sway, "no sway on Low")
	batch.refresh(spot)
	var low_instances := 0
	for g in batch.groups:
		for lod in 3:
			low_instances += g.shown[lod]
		assert_eq(g.nodes[0].cast_shadow, GeometryInstance3D.SHADOW_CASTING_SETTING_OFF, "no tree shadows on Low (%s)" % g.species)
	assert_true(low_instances < high_instances, "Low draws fewer plants (%d against %d)" % [low_instances, high_instances])
	assert_true(batch.triangles_now() < high_tris, "and fewer triangles (%d against %d)" % [batch.triangles_now(), high_tris])
	TreeQuality.apply(QualitySettings.values(QualitySettings.MEDIUM))
	batch.refresh(spot)
	var mid_instances := 0
	for g in batch.groups:
		for lod in 3:
			mid_instances += g.shown[lod]
	assert_true(mid_instances >= low_instances and mid_instances <= high_instances, "Medium sits between (%d)" % mid_instances)
	# Draw-call caps follow the preset (the plan is made when a chunk is built): Low keeps fewer species.
	var low_kit := ChunkBuilder.Kit.new()
	low_kit.source = kit.source
	low_kit.layouts = kit.layouts
	low_kit.models = kit.models
	low_kit.materials = kit.materials
	low_kit.trees = kit.trees
	low_kit.tree_species = int(QualitySettings.values(QualitySettings.LOW)["tree_species"])
	low_kit.under_species = int(QualitySettings.values(QualitySettings.LOW)["under_species"])
	var lb := ChunkBuilder.build(low_kit, DENSE)
	var trees_n := 0
	var under_n := 0
	for g in lb.tree_batch.groups:
		if TreeSpecies.is_understory(g.species):
			under_n += 1
		else:
			trees_n += 1
	assert_true(trees_n <= low_kit.tree_species and under_n <= low_kit.under_species, "Low: %d tree species, %d understory (caps %d, %d)" % [trees_n, under_n, low_kit.tree_species, low_kit.under_species])
	assert_true(lb.tree_batch.groups.size() <= b.tree_batch.groups.size(), "and no more species than High (%d vs %d)" % [lb.tree_batch.groups.size(), b.tree_batch.groups.size()])
	CityTestKit.free_build(lb)
	for key: String in ["tree_density", "scrub_density", "tree_lod0", "tree_lod1", "tree_far", "tree_species", "under_species"]:
		var lo := float(QualitySettings.values(QualitySettings.LOW)[key])
		var mi := float(QualitySettings.values(QualitySettings.MEDIUM)[key])
		var hi := float(QualitySettings.values(QualitySettings.HIGH)[key])
		assert_true(lo <= mi and mi <= hi, "%s rises Low -> Medium -> High" % key)
	assert_true(bool(QualitySettings.values(QualitySettings.HIGH)["tree_sway"]) and bool(QualitySettings.values(QualitySettings.HIGH)["tree_shadows"]), "High has wind and tree shadows")
	assert_false(bool(QualitySettings.values(QualitySettings.MEDIUM)["tree_shadows"]), "Medium has no tree shadows")
	CityTestKit.free_build(b)
	return true


func test_chunk_build_is_deterministic() -> bool:
	var kit := _city_kit()
	var a := ChunkBuilder.build(kit, SPAWN)
	var b := ChunkBuilder.build(kit, SPAWN)
	assert_eq(a.tree_batch.species_counts(), b.tree_batch.species_counts(), "same species counts")
	for i in a.tree_batch.groups.size():
		var ga := a.tree_batch.groups[i]
		var gb := b.tree_batch.groups[i]
		assert_eq(ga.rows, gb.rows, "same instance rows for %s" % ga.species)
	CityTestKit.free_build(a)
	CityTestKit.free_build(b)
	return true


func test_prune_removes_plants_near_a_line() -> bool:
	var kit := _tree_kit()
	var spots: Array[TreeSpot] = []
	for i in 10:
		var s := TreeSpot.new()
		s.position = Vector2(float(i) * 10.0, 0.0)
		s.species = TreeSpecies.NEEM
		s.rank = 0.1
		spots.append(s)
	var batch := TreeBatch.build(kit, spots, Vector2.ZERO)
	batch.refresh(Vector3(0, 2, 0))
	var removed := batch.prune(func(p: Vector3) -> bool: return p.x >= 30.0 and p.x <= 50.0)
	assert_eq(removed, 3, "three trees were within reach of the line")
	assert_eq(batch.instance_count(), 7, "seven remain")
	batch.refresh(Vector3(0, 2, 0))
	assert_eq(batch.groups[0].shown[0] + batch.groups[0].shown[1] + batch.groups[0].shown[2], 7, "and all seven are drawn")
	batch.free()
	return true


func test_leaning_and_colliders() -> bool:
	# Rain trees beside a road lean over it; only trees and palms get a collider box.
	assert_true(TreeSpecies.solid(&"neem") and TreeSpecies.solid(&"coconut"), "trees are solid")
	assert_false(TreeSpecies.solid(&"oleander") or TreeSpecies.solid(&"grass_tuft"), "bushes and grass are not")
	var kit := _city_kit()
	var leaning := 0
	var examined := 0
	for cell: Vector2i in [SPAWN, DENSE]:
		var ctx := _context(kit, cell)
		for s in TreePlan.for_chunk(ctx, kit.source.read_chunk(cell).trees):
			if s.species == TreeSpecies.RAIN or TreeSpecies.kind_of(s.species) == TreeSpecies.PALM:
				examined += 1
				if s.lean > 0.03:
					leaning += 1
	assert_true(examined == 0 or leaning > 0, "some rain trees and palms lean (%d of %d)" % [leaning, examined])
	return true
