extends TestCase
## What OpenStreetMap carries beyond the 2.0 files (decisions G-190…G-192): `detail.bin` read like
## the Python reference, building colours, roof variants, building parts, signs by category,
## street objects, barriers, pitches, pools and platforms, and the area palette file.

## A tile in the middle of the city (tools/geo prints the same numbers: decode_detail on 3_5).
const TILE := Vector2i(3, 5)


func _tile() -> DetailTile:
	return CityTestKit.regional().tile_detail(TILE)


## A rectangle footprint, anticlockwise, at the origin.
func _rect(w: float, d: float) -> PackedVector2Array:
	return PackedVector2Array([Vector2(0, 0), Vector2(w, 0), Vector2(w, -d), Vector2(0, -d)])


func _house(id: int, shape: StringName, outline: PackedVector2Array) -> Building:
	var b := Building.new()
	b.id = id
	b.outline = outline
	b.floors = 2
	b.height = 7.1
	b.kind = &"house"
	b.roof_shape = shape
	b.color_hex = 0xe8c9a0
	return b


func _meshes() -> BuildingMeshes:
	var m := BuildingMeshes.new()
	m.table = SignCategories.shared()
	return m


func test_detail_tile_matches_the_python_reader() -> bool:
	var t := _tile()
	assert_true(t != null and t.ok(), "the tile's detail.bin decodes")
	assert_eq(t.tile, TILE, "tile")
	assert_eq(t.minor, 2, "minor")
	# Values printed by tools/geo (chennai_geo.detail.decode_detail) for tile 3_5.
	assert_eq(t.buildings.size(), 498, "buildings with mapped detail")
	assert_eq(t.parts.size(), 19, "building parts")
	assert_eq(t.objects.size(), 1829, "street objects")
	assert_eq(t.lines.size(), 167, "barrier, tree row and platform lines")
	assert_eq(t.zones.size(), 132, "zones")
	assert_eq(t.signs.size(), 2895, "signs")
	assert_eq(t.objects[0].kind, &"gate", "first object")
	assert_vec_near(t.objects[0].position, Vector2(7920.0, 299.95), 0.03, "first object position")
	assert_eq(t.zones[0].kind, &"pitch", "first zone")
	assert_eq(t.zones[0].sport, &"hockey", "first zone's sport")
	var info: DetailTile.BuildingInfo = t.buildings[23885061]
	assert_eq(info.material, &"brick", "mapped wall material")
	assert_eq(info.category, 45, "mapped category (office)")
	assert_eq(t.parts[0].id, 762072808, "first part's game id")
	assert_near(t.parts[0].height, 7.1, 0.01, "first part's height")
	assert_eq(t.signs[0].name_en, "Chetpet", "a public place keeps name:en")
	return true


func test_every_tile_decodes_and_names_stay_off_shop_signs() -> bool:
	var source := CityTestKit.regional()
	var table := SignCategories.shared()
	var signs := 0
	var named_shops := 0
	for tile: Vector2i in source.tiles:
		var t := source.tile_detail(tile)
		assert_true(t != null and t.ok(), "tile %s detail.bin decodes" % tile)
		for s in t.signs:
			signs += 1
			assert_true(s.category >= 1 and s.category <= table.count(), "category in the table")
			if not table.is_public(s.category) and (s.name_ta != "" or s.name_en != ""):
				named_shops += 1
	assert_true(signs > 10000, "signs in the world (%d)" % signs)
	assert_eq(named_shops, 0, "no shop or office name is stored")
	return true


func test_sign_table_and_the_tamil_font() -> bool:
	var table := SignCategories.shared()
	assert_eq(table.error, "", "table loads")
	var font := load("res://assets/city/noto-sans-tamil-categories.woff2") as Font
	assert_true(font != null, "the Tamil sign font loads")
	var missing := 0
	for c in table.items:
		for ch: String in str(c["tamil"]):
			if ch != " " and not font.has_char(ch.unicode_at(0)):
				missing += 1
	assert_eq(missing, 0, "every Tamil letter of every sign is in the font (no boxes)")
	for want: Array in [["pharmacy", "மருந்தகம்"], ["bakery", "பேக்கரி"], ["tea", "தேநீர் கடை"], ["textiles", "ஜவுளி"], ["grocery", "மளிகை"], ["flowers", "பூக்கடை"], ["bank", "வங்கி"], ["hospital", "மருத்துவமனை"], ["school", "பள்ளி"], ["temple", "கோயில்"], ["bus_stand", "பேருந்து நிலையம்"]]:
		assert_eq(str(table.get_item(table.id_of(want[0]))["tamil"]), want[1], "Tamil word of %s" % want[0])
	# The baked atlas has ink in the Tamil half of a sign: the board colour is not the only colour there.
	var img := Image.load_from_file(ProjectSettings.globalize_path(CityAtlas.DIR + "/kit.png"))
	assert_eq(Vector2i(img.get_width(), img.get_height()), Vector2i(CityAtlas.KIT_PX, CityAtlas.KIT_H), "kit atlas size")
	var r := CityAtlas.sign_rect(table.id_of("pharmacy"))
	var inks := 0
	for x in range(r.position.x + 20, r.end.x - 20, 2):
		for y in range(r.position.y + 12, r.position.y + 46, 2):
			var px := img.get_pixel(x, y)
			if px.g > px.r and px.g > px.b and px.g > 0.35 and px.r < 0.2:
				inks += 1
	assert_true(inks > 150, "the pharmacy sign has Tamil ink in green (%d samples)" % inks)
	return true


func test_shop_signs_say_the_category_of_what_is_mapped() -> bool:
	var table := SignCategories.shared()
	var b := _house(900001, &"flat", _rect(10, 8))
	b.detail_category = table.id_of("bakery")
	b.detail_shop = true
	var none: Array[DetailTile.SignSpot] = []
	assert_eq(ShopSigns.pick(b, 0, 0, Vector2(5, -4), none, table), table.id_of("bakery"), "a building mapped as a bakery says BAKERY")
	var plain := _house(900002, &"flat", _rect(10, 8))
	var near := DetailTile.SignSpot.new()
	near.category = table.id_of("pharmacy")
	near.position = Vector2(6, -3)
	var spots: Array[DetailTile.SignSpot] = [near]
	assert_eq(ShopSigns.pick(plain, 0, 0, Vector2(5, -4), spots, table), table.id_of("pharmacy"), "a mapped shop node close by gives its category")
	near.position = Vector2(80, 80)
	var street := table.street_ids()
	assert_true(street.has(ShopSigns.pick(plain, 0, 0, Vector2(5, -4), spots, table)), "with nothing mapped an everyday street shop is picked (estimated)")
	var public_spot := DetailTile.SignSpot.new()
	public_spot.category = table.id_of("temple")
	public_spot.position = Vector2(5, -4)
	spots = [public_spot]
	assert_false(ShopSigns.pick(plain, 0, 0, Vector2(5, -4), spots, table) == table.id_of("temple"), "a temple is not a shop front")
	return true


func test_a_mapped_shop_building_gets_a_front_even_with_one_storey() -> bool:
	var b := _house(900003, &"flat", _rect(10, 8))
	b.floors = 1
	b.height = 4.0
	b.detail_category = 3
	b.detail_shop = true
	var road := Road.new()
	road.points = PackedVector2Array([Vector2(-20, -4), Vector2(30, -4)])
	road.width = 8.0
	road.kind = &"tertiary"
	var span := CityLayout.RoadSpan.new()
	span.road = road
	span.start = 0
	span.end = 1
	var plan := BuildingMeshes.plan_facade(b, [span])
	assert_false(plan.shop_walls.is_empty(), "shop fronts on the walls facing the road")
	var unmapped := _house(900004, &"flat", _rect(10, 8))
	unmapped.floors = 1
	unmapped.height = 4.0
	assert_true(BuildingMeshes.plan_facade(unmapped, [span]).shop_walls.is_empty(), "a plain single-storey house keeps its door")
	return true


func test_roof_kinds_follow_the_mapped_shape_and_fall_back_to_flat() -> bool:
	var stats: Dictionary[String, int] = {}
	var cases := {&"gabled": BuildingMeshes.ROOF_GABLED, &"hipped": BuildingMeshes.ROOF_HIPPED, &"pyramidal": BuildingMeshes.ROOF_PYRAMIDAL, &"skillion": BuildingMeshes.ROOF_SKILLION, &"dome": BuildingMeshes.ROOF_DOME, &"flat": BuildingMeshes.ROOF_FLAT}
	var id := 910000
	for shape: StringName in cases:
		id += 1
		var b := _house(id, shape, _rect(12, 8))
		BuildingMeshes.assign_roof(b, null, stats)
		assert_eq(b.roof_kind, cases[shape], "roof:shape=%s" % shape)
	# A footprint that cannot carry it stays flat: a gable needs four corners.
	var l_shape := PackedVector2Array([Vector2(0, 0), Vector2(12, 0), Vector2(12, -4), Vector2(4, -4), Vector2(4, -8), Vector2(0, -8)])
	var b2 := _house(910100, &"gabled", l_shape)
	BuildingMeshes.assign_roof(b2, null, stats)
	assert_eq(b2.roof_kind, BuildingMeshes.ROOF_FLAT, "a gable on an L-shaped footprint falls back to flat")
	assert_eq(stats.get("roof_mapped", 0), 7, "mapped roofs are counted")
	# With no roof:shape and the default palette today's rule decides (legacy, estimated).
	var plain := _house(242400280, &"unknown", _rect(12, 8))
	BuildingMeshes.assign_roof(plain, null, stats)
	assert_eq(plain.roof_kind, BuildingMeshes.ROOF_HIPPED if BuildingMeshes.legacy_tiled_roof(plain) else BuildingMeshes.ROOF_FLAT, "estimated roofs keep today's rule")
	assert_true(stats.get("roof_estimated", 0) >= 1, "estimated roofs are counted")
	return true


func test_each_roof_kind_builds_its_shape() -> bool:
	var tris := {}
	var tops := {}
	var id := 920000
	for shape: StringName in [&"flat", &"gabled", &"hipped", &"pyramidal", &"skillion", &"dome"]:
		id += 1
		var m := _meshes()
		var b := _house(id, shape, _rect(12, 8))
		m.add(b, BuildingMeshes.Plan.new())
		tris[shape] = m.roofs.triangle_count()
		var top := 0.0
		for v in m.roofs.positions:
			top = maxf(top, v.y)
		tops[shape] = top
	var upper_top := 7.1 - BuildingMeshes.PARAPET
	for shape: StringName in [&"gabled", &"hipped", &"pyramidal", &"skillion"]:
		assert_true(float(tops[shape]) > upper_top + 0.5, "%s roof rises above the walls (%.2f)" % [shape, tops[shape]])
	assert_true(int(tris[&"dome"]) > 60, "the dome is a real dome (%d triangles)" % tris[&"dome"])
	assert_true(float(tops[&"dome"]) > 7.1, "the dome stands on the flat roof")
	assert_true(int(tris[&"gabled"]) <= 12 and int(tris[&"skillion"]) <= 12, "gable and skillion stay cheap")
	assert_true(float(tops[&"flat"]) <= 7.1 + BuildingMeshes.TANK_HEIGHT + 0.01, "a flat roof has at most its water tank above the parapet")
	return true


func test_colours_are_the_mapped_ones_else_estimated() -> bool:
	var m := _meshes()
	var b := _house(930001, &"flat", _rect(10, 8))
	b.wall_mapped = true
	b.color_hex = 0xcc8844
	assert_eq(m.wall_colour(b).to_html(false), BuildingMeshes.lin(0xcc8844).to_html(false), "building:colour is used exactly")
	var brick := _house(930002, &"flat", _rect(10, 8))
	brick.detail_material = &"brick"
	assert_eq(m.wall_colour(brick).to_html(false), BuildingMeshes.lin(0xB4573E).to_html(false), "building:material=brick gives brick red (estimated)")
	var roofed := _house(930003, &"gabled", _rect(10, 8))
	roofed.detail_roof = 0x336699
	assert_eq(m.roof_colour(roofed).to_html(false), BuildingMeshes.lin(0x336699).to_html(false), "roof:colour is used exactly")
	assert_true(m.stats.get("wall_mapped", 0) == 1 and m.stats.get("wall_estimated", 0) == 1, "mapped and estimated colours are counted")
	return true


func test_a_part_floats_from_its_min_height() -> bool:
	var m := _meshes()
	var b := _house(940001, &"flat", _rect(10, 8))
	b.min_height = 4.0
	b.height = 13.0
	b.floors = 3
	b.is_part = true
	m.add(b, BuildingMeshes.Plan.new())
	var lowest := INF
	for v in m.walls.positions:
		lowest = minf(lowest, v.y)
	assert_near(lowest, 4.0, 0.001, "walls start at min_height")
	assert_true(m.kit.is_empty(), "no shop front under a floating part")
	return true


func test_parts_replace_their_host_in_a_chunk() -> bool:
	var source := CityTestKit.regional()
	var t := _tile()
	var cell := Vector2i.ZERO
	var found := false
	for part in t.parts:
		var mean := Vector2.ZERO
		for p in part.outline:
			mean += p
		cell = t.cell_of(mean / part.outline.size())
		if source.cells.has(cell):
			found = true
			break
	assert_true(found, "a part lies in a chunk of the world")
	var chunk := source.read_chunk(cell)
	var before := chunk.buildings.size()
	var hosts := 0
	for b in chunk.buildings:
		var info: DetailTile.BuildingInfo = t.buildings.get(b.id)
		if info != null and info.is_parts_host():
			hosts += 1
	ChunkBuilder.apply_detail(chunk, cell, t, null, SignCategories.shared())
	var parts := 0
	for b in chunk.buildings:
		assert_false(t.buildings.has(b.id) and (t.buildings[b.id] as DetailTile.BuildingInfo).is_parts_host(), "no host that is only the outline of its parts")
		parts += 1 if b.is_part else 0
	assert_true(parts >= 1, "the parts are drawn (%d)" % parts)
	assert_eq(chunk.buildings.size(), before - hosts + t.parts_in(cell).size(), "hosts out, parts in")
	return true


func test_street_objects_barriers_and_zones_are_built_near_the_player() -> bool:
	var source := CityTestKit.regional()
	var kit := CityTestKit.regional_kit()
	var t := _tile()
	var wanted := {&"bench": false, &"toilets": false, &"drinking_water": false, &"power_pole": false}
	var cells := {}
	for o in t.objects:
		if wanted.has(o.kind) and not wanted[o.kind]:
			var c := t.cell_of(o.position)
			if source.cells.has(c):
				wanted[o.kind] = true
				cells[c] = true
	for li in t.lines:
		if li.kind == &"wall" or li.kind == &"fence" or li.kind == &"hedge":
			var c := t.cell_of(li.points[0])
			if source.cells.has(c) and cells.size() < 12:
				cells[c] = true
	for z in t.zones:
		if z.kind == &"pitch" or z.kind == &"swimming_pool" or z.kind == &"platform":
			var c := t.cell_of(z.centre)
			if source.cells.has(c) and cells.size() < 20:
				cells[c] = true
	var seen := {}
	var solids := 0
	for c: Vector2i in cells:
		var b := ChunkBuilder.build(kit, c)
		assert_eq(b.error, "", "chunk %s builds" % c)
		for k in b.detail:
			seen[k] = int(seen.get(k, 0)) + int(b.detail[k])
		for body in b.bodies:
			if body.name.begins_with("DetailSolids") or body.name.begins_with("Platforms"):
				solids += 1
		CityTestKit.free_build(b)
	var keys := ""
	for k: String in seen:
		keys += k + " "
	for want: String in ["object:bench", "object:toilets", "object:drinking_water", "object:power_pole"]:
		assert_true(int(seen.get(want, 0)) > 0, "%s drawn (%s)" % [want, keys])
	var lines := 0
	for k: String in seen:
		if k.begins_with("line:"):
			lines += int(seen[k])
	assert_true(lines > 0, "barriers drawn (%d)" % lines)
	assert_true(int(seen.get("zone:pitch", 0)) > 0, "pitches drawn")
	assert_true(solids > 0, "barriers, toilets and platforms block walking")
	return true


func test_barriers_never_cut_across_a_carriageway() -> bool:
	var source := CityTestKit.regional()
	var kit := CityTestKit.regional_kit()
	var t := _tile()
	var checked := 0
	for li in t.lines:
		if li.kind != &"wall" and li.kind != &"fence":
			continue
		var cell := t.cell_of(li.points[0])
		if not source.cells.has(cell) or checked >= 6:
			continue
		var layout := kit.layouts.layout_for(cell)
		var square := Rect2(source.get_grid_origin() + Vector2(cell) * 250.0, Vector2(250, 250))
		var dm := DetailMeshes.new()
		dm.origin = square.get_center()
		dm.square = square
		dm.layout = layout
		dm.models = kit.models
		dm.objects = MeshBuilder.new()
		var none: Array[PackedVector2Array] = []
		var one: Array[DetailTile.LineFeature] = [li]
		dm.add_lines(one, none)
		checked += 1
		# Every drawn collider box stands clear of the carriageway it is near.
		for i in range(0, dm.solids.size() - 35, 36):
			var centre := Vector3.ZERO
			for k in 36:
				centre += dm.solids[i + k]
			centre /= 36.0
			var at := Vector2(centre.x + dm.origin.x, centre.z + dm.origin.y)
			var hit := layout.nearest_road_point(at, false)
			if not hit.is_empty():
				var road: Road = layout.roads[int(hit["road_index"])]
				assert_true(float(hit["distance"]) > road.width / 2.0 - 1.5, "a barrier box is not in the carriageway")
	assert_true(checked > 0, "walls and fences were checked")
	return true


func test_mapped_lamps_replace_nearby_generated_poles() -> bool:
	var furniture := StreetFurniture.Result.new()
	var generated := StreetFurniture.Pole.new()
	generated.position = Vector2(1000, 1000)
	var far_pole := StreetFurniture.Pole.new()
	far_pole.position = Vector2(1100, 1000)
	furniture.poles = [generated, far_pole]
	var lamp := DetailTile.ObjectSpot.new()
	lamp.kind = &"street_lamp"
	lamp.position = Vector2(1006, 1002)
	var layout := CityTestKit.regional_kit().layouts.layout_for(Vector2i(130, 230))
	var objects: Array[DetailTile.ObjectSpot] = [lamp]
	ChunkBuilder.use_mapped_lamps(furniture, objects, layout, Rect2(Vector2(900, 900), Vector2(300, 300)))
	assert_false(furniture.poles.has(generated), "the generated pole within 14 m of a mapped lamp is dropped")
	assert_true(furniture.poles.has(far_pole), "a pole farther away stays")
	return true


func test_area_palette_file_and_defaults() -> bool:
	var p := AreaPalettes.load_file()
	assert_true(p.areas.size() >= 20, "the real file has its areas (%d)" % p.areas.size())
	assert_eq(p.at(Vector2(-20000, -20000)).id, "default", "a point far from every area gets the default")
	# T. Nagar (the file's centre 2543, 5160) gets T. Nagar's palette, with its walls from the file.
	var tn := p.at(Vector2(2543.0, 5160.0))
	assert_eq(tn.id, "t-nagar", "a point in T. Nagar gets T. Nagar's palette")
	assert_true(tn.walls.size() >= 6 and tn.has_storeys(), "T. Nagar has walls and storey bins")
	assert_eq(p.at(Vector2(2543.0, 5160.0)).id, tn.id, "the lookup is deterministic")
	return true


func test_area_palette_boundaries_bins_and_weights() -> bool:
	var custom := AreaPalettes.load_file("res://tests/fixtures/area_palettes_test.json")
	assert_eq(custom.areas.size(), 3, "three areas in the fixture")
	assert_eq(custom.at(Vector2(60, 100)).id, "test-pete", "inside a circle")
	assert_eq(custom.at(Vector2(60, 100)).walls, [0x112233, 0x445566], "area walls")
	assert_eq(custom.at(Vector2(400, 100)).id, "default", "outside the circle: default")
	assert_eq(custom.at(Vector2(150, 100)).id, "test-inner", "of two circles the smaller distance over radius wins")
	assert_eq(custom.at(Vector2(1030, 500)).id, "test-road", "inside a corridor")
	assert_eq(custom.at(Vector2(1051, 500)).id, "default", "outside the corridor's half width")
	assert_eq(custom.at(Vector2(1000, 1030)).id, "test-road", "near the end of the spine")
	assert_eq(custom.at(Vector2(1000, 1100)).id, "default", "past the end of the spine")
	var area := custom.at(Vector2(60, 100))
	assert_eq(area.pick_roof(0.01), &"dome", "weighted roof pick")
	assert_eq(area.pick_roof(0.99), &"flat", "weighted roof pick, the other end")
	assert_eq(area.pick_storeys(0.2), 1, "bin 1")
	for u: float in [0.5, 0.6, 0.75, 0.99]:
		var n := area.pick_storeys(u)
		assert_true(n >= 4 and n <= 5, "bin 4-5 gives 4 or 5 storeys (%d at %.2f)" % [n, u])
	assert_eq(area.pick_storeys(0.61), area.pick_storeys(0.61), "storey pick is deterministic")
	assert_eq(AreaPalettes._bin("10+"), Vector2i(10, 12), "10+ bin")
	assert_eq(AreaPalettes._bin("6-9"), Vector2i(6, 9), "6-9 bin")
	# An area palette changes estimated roofs, but never a mapped roof shape.
	var stats: Dictionary[String, int] = {}
	var mapped := _house(950001, &"gabled", _rect(12, 8))
	BuildingMeshes.assign_roof(mapped, area, stats)
	assert_eq(mapped.roof_kind, BuildingMeshes.ROOF_GABLED, "OSM roof:shape wins over the palette")
	# The default palette changes nothing: estimated houses keep their storeys and walls.
	var house := _house(950002, &"unknown", _rect(12, 8))
	house.height_from = &"estimated"
	house.outline = PackedVector2Array([Vector2(5000, 5000), Vector2(5012, 5000), Vector2(5012, 4992), Vector2(5000, 4992)])
	var chunk := ChunkData.new()
	chunk.buildings = [house]
	ChunkBuilder.apply_detail(chunk, Vector2i.ZERO, null, custom, SignCategories.shared())
	assert_eq(house.floors, 2, "a house outside every area keeps its storeys")
	house.outline = PackedVector2Array([Vector2(60, 100), Vector2(70, 100), Vector2(70, 92), Vector2(60, 92)])
	chunk.buildings = [house]
	ChunkBuilder.apply_detail(chunk, Vector2i.ZERO, null, custom, SignCategories.shared())
	assert_true(house.floors == 1 or house.floors == 4 or house.floors == 5, "a house in an area takes its storey bins (%d)" % house.floors)
	var mapped_height := _house(950003, &"unknown", house.outline)
	mapped_height.height_from = &"height"
	mapped_height.floors = 7
	chunk.buildings = [mapped_height]
	ChunkBuilder.apply_detail(chunk, Vector2i.ZERO, null, custom, SignCategories.shared())
	assert_eq(mapped_height.floors, 7, "a mapped height wins over the area's storeys")
	return true
