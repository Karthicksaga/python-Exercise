extends TestCase
## The homes' pure logic (G-230…G-234): the data files, the prices and their one scale factor,
## the furnishing rules ported from the reviewed prototype, the owned-home state and its save
## section (new game, damaged, unknown props, newer version), and the peace-zone rules.

const SAVE := "user://test-homes-save.json"

var data: HomeData


func before_each() -> void:
	data = HomeData.load_all()


func _editor(type_id: String = "flat", extensions: int = 0, items: Array[PlacedProp] = []) -> HomeEditor:
	var arr: Array[PlacedProp] = items
	return HomeEditor.make(HomeRoom.make(data.homes.type_of(type_id), extensions), data.props, data.prices, arr)


# --- The data -----------------------------------------------------------------------------

func test_data_files_load() -> bool:
	assert_eq(data.error(), "", "every data file reads")
	assert_eq(data.homes.types.size(), 4, "four home types")
	assert_eq(data.props.categories.size(), 7, "seven furniture categories")
	assert_true(data.props.props.size() >= 45, "about 45 props (%d)" % data.props.props.size())
	return true


func test_home_types_match_the_prototype() -> bool:
	var expect := {"flat": [6, 5], "cottage": [7, 5], "terrace": [8, 6], "old": [9, 6]}
	for id: String in expect:
		var t := data.homes.type_of(id)
		assert_true(t != null, "%s exists" % id)
		if t == null:
			continue
		assert_eq([t.width, t.depth], expect[id], "%s room size" % id)
		assert_true(t.en != "" and t.ta != "", "%s has both names" % id)
		assert_eq(t.features.size(), 3, "%s has three feature lines" % id)
	assert_eq(data.homes.wall_colours.size(), 7, "seven wall colours")
	return true


func test_every_prop_is_complete_and_both_languages() -> bool:
	for p in data.props.props:
		assert_true(p.en != "", "%s has an English name" % p.id)
		assert_true(_has_tamil(p.ta), "%s has a Tamil name (%s)" % [p.id, p.ta])
		assert_true(p.kind in [PropDef.FLOOR, PropDef.WALL, PropDef.CEILING], "%s kind" % p.id)
		assert_true(not p.parts.is_empty(), "%s has a model" % p.id)
		assert_true(data.props.categories.any(func(c: Dictionary) -> bool: return c["id"] == p.category), "%s is in a known category" % p.id)
		assert_true(data.prices.props.has(p.id), "%s has a price" % p.id)
		assert_true(data.prices.prop(p.id) >= data.prices.minimum, "%s costs at least the minimum" % p.id)
		for part in p.parts:
			assert_true(str(part.get("t")) in ["box", "cyl", "sph", "cone", "tor"], "%s part type" % p.id)
	for c in data.props.categories:
		assert_true(_has_tamil(str(c["ta"])), "category %s has Tamil" % c["id"])
		assert_true(not data.props.in_category(str(c["id"])).is_empty(), "category %s is not empty" % c["id"])
	return true


func test_pooja_has_no_deity_images() -> bool:
	# The pooja shelf is a shelf, a brass lamp and a flame: boxes, a cylinder and a cone, nothing figurative.
	var p := data.props.get_prop("pooja")
	assert_true(p != null, "pooja shelf exists")
	for part in p.parts:
		assert_true(str(part["t"]) in ["box", "cyl", "cone"], "pooja shelf part is plain geometry")
	for def in data.props.props:
		for word: String in ["ganesh", "murugan", "god", "idol", "deity", "statue", "photo of"]:
			assert_false(def.en.to_lower().contains(word), "%s names no deity (%s)" % [def.id, word])
	return true


func test_no_business_names_in_listings_or_props() -> bool:
	var banned := ["ltd", "pvt", "bank", "hotel", "mall", "jewel", "saravana", "reliance", "tata", "amazon", "ikea"]
	for p in data.props.props:
		for word: String in banned:
			assert_false(p.en.to_lower().contains(word), "%s has no business word %s" % [p.id, word])
	return true


func _has_tamil(s: String) -> bool:
	for i in s.length():
		var c := s.unicode_at(i)
		if c >= 0x0B80 and c <= 0x0BFF:
			return true
	return false


# --- Prices --------------------------------------------------------------------------------

func test_one_scale_factor_sets_every_price() -> bool:
	var p := data.prices
	assert_near(p.scale, 0.05, 1e-9, "the scale is 0.05")
	assert_eq(p.home("flat"), 3000, "flat")
	assert_eq(p.home("cottage"), 4500, "cottage")
	assert_eq(p.home("terrace"), 6000, "terrace")
	assert_eq(p.home("old"), 9000, "old house")
	assert_eq(p.extension(0), 1000, "first room")
	assert_eq(p.extension(1), 2000, "second room")
	assert_eq(p.prop("sofa"), 225, "sofa")
	assert_eq(p.prop("calendar"), 10, "calendar rounds to the step")
	var cheap := HomePrices.new()
	cheap.scale = 0.025
	assert_eq(cheap.scaled(60000), 1500, "halving the scale halves a home")
	assert_eq(cheap.scaled(1), cheap.minimum, "never under the minimum")
	return true


func test_prices_fit_the_game_economy() -> bool:
	# Stages and jobs pay 50..1,200 each and the whole content about 58,000 rupees; a home must be
	# reachable (a few stages) and the dearest piece a small purchase.
	var p := data.prices
	for t in data.homes.types:
		assert_true(p.home(t.id) <= 12000, "%s is within reach (%d)" % [t.id, p.home(t.id)])
		assert_true(p.home(t.id) >= 1000, "%s is not free (%d)" % [t.id, p.home(t.id)])
	var all := 0
	for def in data.props.props:
		all += p.prop(def.id)
	assert_true(all < 10000, "the whole catalogue is under 10,000 (%d)" % all)
	return true


# --- Listings ------------------------------------------------------------------------------

func test_listings_are_two_or_three_per_area_in_the_four_areas() -> bool:
	var per: Dictionary = {}
	var osm: Dictionary = {}
	for l in data.listings.listings:
		per[l.area_id] = int(per.get(l.area_id, 0)) + 1
		assert_false(osm.has(l.osm), "%s: each building is listed once" % l.id)
		osm[l.osm] = true
		assert_true(data.homes.type_of(l.type_id) != null, "%s has a known type" % l.id)
		assert_true(_has_tamil(l.area_ta), "%s has the area in Tamil" % l.id)
	for area: String in ["anna-nagar", "besant-nagar-elliots-beach", "velachery", "mylapore"]:
		var n := int(per.get(area, 0))
		assert_true(n >= 2 and n <= 3, "%s has 2 to 3 homes (%d)" % [area, n])
	assert_eq(per.size(), 4, "exactly the four areas")
	return true


func test_listings_lie_in_the_areas_of_the_atlas() -> bool:
	# data/areas/areas.json (G-200): the same area ids and Tamil names, and every home inside its
	# area's boundary (a circle, or a corridor round a spine).
	var atlas := HomeJson.read("res://data/areas/areas.json")
	var by_id: Dictionary = {}
	for a: Variant in HomeJson.array_of(atlas, "areas"):
		if a is Dictionary:
			by_id[str((a as Dictionary).get("id"))] = a
	for l in data.listings.listings:
		assert_true(by_id.has(l.area_id), "%s: area %s is in the atlas" % [l.id, l.area_id])
		if not by_id.has(l.area_id):
			continue
		var area: Dictionary = by_id[l.area_id]
		var names := HomeJson.dict_of(area, "names")
		var ta := HomeJson.dict_of(names, "ta")
		assert_eq(l.area_ta, HomeJson.text_of(ta, "value"), "%s: the area's Tamil name is the atlas's" % l.id)
		var b := HomeJson.dict_of(area, "boundary")
		var inside := false
		if HomeJson.text_of(b, "type") == "circle":
			var c := HomeJson.array_of(b, "centre_xz")
			inside = l.at.distance_to(Vector2(float(c[0]), float(c[1]))) <= HomeJson.float_of(b, "radius_m")
		else:
			var spine := HomeJson.array_of(b, "spine_xz")
			var best := INF
			for i in range(spine.size() - 1):
				var p0 := Vector2(float((spine[i] as Array)[0]), float((spine[i] as Array)[1]))
				var p1 := Vector2(float((spine[i + 1] as Array)[0]), float((spine[i + 1] as Array)[1]))
				best = minf(best, Geometry2D.get_closest_point_to_segment(l.at, p0, p1).distance_to(l.at))
			inside = best <= HomeJson.float_of(b, "half_width_m")
		assert_true(inside, "%s lies inside the %s boundary" % [l.id, l.area_id])
	return true


# --- Furnishing rules ----------------------------------------------------------------------

func test_floor_placement_snaps_and_charges() -> bool:
	var e := _editor()
	var r := e.place("sofa", Vector2i(2, 2), 1000)
	assert_true(r.ok, "a sofa is placed")
	assert_eq(r.delta, -225, "it costs 225")
	assert_eq([r.item.x, r.item.z], [1, 2], "a 2 x 1 piece is centred on the tapped cell")
	assert_eq(e.items.size(), 1, "it is in the list")
	var corner := e.place("cot", Vector2i(0, 0), 1000)
	assert_true(corner.ok, "a 2 x 2 cot in the corner")
	assert_eq([corner.item.x, corner.item.z], [0, 0], "clamped into the room")
	return true


func test_overlap_and_bounds_are_refused() -> bool:
	var e := _editor()
	assert_true(e.place("sofa", Vector2i(2, 2), 1000).ok, "first sofa")
	var again := e.place("sofa", Vector2i(2, 2), 1000)
	assert_false(again.ok, "a second sofa on the same cells")
	assert_eq(again.code, &"taken", "taken")
	assert_eq(e.items.size(), 1, "nothing was added")
	var wide := PlacedProp.make("sofa", 5, 0)
	assert_eq(e.fit_problem(wide), &"outside", "past the right edge")
	var low := PlacedProp.make("sofa", 0, 5)
	assert_eq(e.fit_problem(low), &"outside", "past the front edge")
	var neg := PlacedProp.make("sofa", -1, 0)
	assert_eq(e.fit_problem(neg), &"outside", "before the left edge")
	return true


func test_the_doorway_stays_clear() -> bool:
	var e := _editor()
	var door := e.room.door_cells()
	var r := e.place("chair", door[0], 1000)
	assert_false(r.ok, "no chair in the doorway")
	assert_eq(r.code, &"doorway", "doorway")
	# A wall piece or a ceiling light does not block it.
	assert_true(e.place("fan", door[0], 1000).ok, "a fan above the doorway is fine")
	return true


func test_poor_player_cannot_buy() -> bool:
	var e := _editor()
	var r := e.place("fridge", Vector2i(2, 2), 100)
	assert_false(r.ok, "a fridge for 100")
	assert_eq(r.code, &"poor", "poor")
	assert_eq(e.items.size(), 0, "nothing placed")
	assert_contains(r.reason, "₹450", "the toast names the price")
	assert_true(r.reason_ta != "", "and has a Tamil line")
	return true


func test_rotation_swaps_the_footprint_and_needs_room() -> bool:
	var e := _editor()
	var r := e.place("sofa", Vector2i(2, 2), 1000)
	var sofa := r.item
	assert_eq(e.keys_of(sofa).size(), 2, "two cells")
	assert_true(e.rotate(sofa).ok, "it turns")
	assert_eq(sofa.r, 1, "a quarter turn")
	var cells := e.keys_of(sofa)
	assert_true(cells.has("f 1,2") and cells.has("f 1,3"), "now two deep (%s)" % ", ".join(cells))
	# Block the turn: a piece just below.
	var e2 := _editor()
	var s2 := e2.place("sofa", Vector2i(2, 4), 1000).item
	var block := e2.place("chair", Vector2i(1, 3), 1000)
	assert_true(block.ok, "chair placed above")
	var turn := e2.rotate(s2)
	assert_false(turn.ok, "no room to turn")
	assert_eq(s2.r, 0, "it did not turn")
	assert_false(e2.rotate(e2.place("tube", Vector2i(0, 3), 1000).item).ok, "a wall piece does not turn")
	return true


func test_remove_and_clear_pay_half_back() -> bool:
	var e := _editor()
	var a := e.place("sofa", Vector2i(2, 2), 5000).item
	e.place("cot", Vector2i(4, 0), 5000)
	var r := e.remove(a)
	assert_true(r.ok, "removed")
	assert_eq(r.delta, 112, "half of 225, rounded down")
	assert_eq(e.items.size(), 1, "one left")
	assert_true(e.place("sofa", Vector2i(2, 2), 5000).ok, "its cells are free again")
	var all := e.clear()
	assert_eq(all.delta, 112 + 125, "half of the sofa and half of the 250 cot")
	assert_eq(e.items.size(), 0, "empty")
	assert_false(e.remove(PlacedProp.make("sofa", 0, 0)).ok, "removing a piece that is not there")
	return true


func test_wall_pieces_hang_on_the_nearest_wall() -> bool:
	var e := _editor("terrace")
	var back := e.place("clock", Vector2i(4, 1), 1000).item
	assert_eq(back.wall, "b", "near the back wall")
	assert_eq([back.x, back.z], [4, 0], "slot 4 of the back wall")
	var left := e.place("clock", Vector2i(1, 4), 1000).item
	assert_eq(left.wall, "l", "nearer the left wall")
	assert_eq([left.x, left.z], [0, 4], "slot 4 of the left wall")
	var tube := e.place("tube", Vector2i(2, 0), 1000)
	assert_true(tube.ok, "a 2-wide tube light")
	assert_eq(e.keys_of(tube.item).size(), 2, "takes two slots")
	assert_false(e.place("calendar", Vector2i(2, 0), 1000).ok, "its slots are taken")
	assert_true(e.place("calendar", Vector2i(6, 0), 1000).ok, "free slot")
	# A wall piece and a floor piece may share the same spot of the room.
	assert_true(e.place("sofa", Vector2i(3, 0), 1000).ok, "a sofa below the wall pieces")
	return true


func test_ceiling_pieces_take_one_cell() -> bool:
	var e := _editor()
	assert_true(e.place("fan", Vector2i(3, 2), 1000).ok, "a fan")
	assert_false(e.place("pend", Vector2i(3, 2), 1000).ok, "not a bulb in the same cell")
	assert_true(e.place("pend", Vector2i(4, 2), 1000).ok, "next cell")
	assert_true(e.place("sofa", Vector2i(3, 2), 1000).ok, "a floor piece below a ceiling piece")
	return true


func test_selection_by_cell() -> bool:
	var e := _editor()
	var sofa := e.place("sofa", Vector2i(2, 2), 1000).item
	var fan := e.place("fan", Vector2i(4, 3), 1000).item
	var tube := e.place("tube", Vector2i(2, 0), 1000).item
	assert_true(e.item_at(Vector2i(1, 2)) == sofa and e.item_at(Vector2i(2, 2)) == sofa, "both sofa cells")
	assert_true(e.item_at(Vector2i(4, 3)) == fan, "the ceiling piece over a cell")
	assert_true(e.item_at(Vector2i(2, 0)) == tube, "the wall piece on the wall cell")
	assert_true(e.item_at(Vector2i(5, 4)) == null, "an empty cell")
	return true


func test_walking_goes_round_furniture() -> bool:
	var e := _editor()
	e.place("cot", Vector2i(3, 2), 1000)
	var route := e.path(Vector2(5.5, 4.5), Vector2(0.5, 0.5))
	assert_true(route.size() >= 2, "a route exists")
	for p in route:
		assert_true(e.walkable(e.room.cell_at(p)), "every waypoint is on free floor")
	assert_true(e.path(Vector2(0.5, 0.5), Vector2(3.5, 2.5)).is_empty(), "the cot's cells cannot be walked to")
	# A mat can be walked over.
	e.place("mat", Vector2i(1, 4), 1000)
	assert_false(e.path(Vector2(0.5, 4.5), Vector2(2.5, 4.5)).is_empty(), "over a mat")
	# Walled in: no way through.
	var f := _editor("flat")
	for z in 5:
		f.items.append(PlacedProp.make("chair", 3, z))
	f.rebuild()
	assert_true(f.path(Vector2(0.5, 0.5), Vector2(5.5, 0.5)).is_empty(), "a full row of chairs blocks the way")
	return true


func test_extensions_grow_the_room_and_cost_more() -> bool:
	var s := HomeState.new()
	var l := data.listings.get_listing("anna-nagar-1")
	assert_true(s.buy(l, 10000, data).ok, "bought")
	assert_eq(s.room_of(l.id, data).width, 6, "6 wide")
	var first := s.extend(l.id, 10000, data)
	assert_true(first.ok, "first room")
	assert_eq(first.delta, -1000, "1,000")
	assert_eq(s.room_of(l.id, data).width, 9, "3 wider")
	var poor := s.extend(l.id, 1500, data)
	assert_false(poor.ok, "the second needs 2,000")
	assert_eq(poor.code, &"poor", "poor")
	var second := s.extend(l.id, 10000, data)
	assert_eq(second.delta, -2000, "2,000")
	assert_eq(s.room_of(l.id, data).width, 12, "12 wide")
	var third := s.extend(l.id, 99999, data)
	assert_false(third.ok, "never more than two")
	assert_eq(third.code, &"limit", "limit")
	assert_eq(s.extension_cost(l.id, data), -1, "no cost left")
	return true


# --- Owned homes and the save --------------------------------------------------------------

func test_buying_a_home() -> bool:
	var s := HomeState.new()
	var l := data.listings.get_listing("mylapore-1")
	var poor := s.buy(l, 8999, data)
	assert_false(poor.ok, "9,000 needed")
	assert_eq(poor.code, &"poor", "poor")
	assert_false(s.owns(l.id), "not owned")
	var ok := s.buy(l, 9000, data)
	assert_true(ok.ok, "bought")
	assert_eq(ok.delta, -9000, "paid the old house's price")
	assert_true(s.owns(l.id), "owned")
	assert_eq(s.current, l.id, "and now the current home")
	assert_eq(s.buy(l, 99999, data).code, &"owned", "not twice")
	assert_eq(s.get_home(l.id).wall, "#e8c8a0", "starts with the type's wall colour")
	return true


func test_state_round_trips_through_the_save_store() -> bool:
	DirAccess.remove_absolute(SAVE)
	var store := SaveStore.new(SAVE)
	store.set_section(SaveStore.WEATHER, "rain")
	var s := HomeState.new()
	var l := data.listings.get_listing("velachery-2")
	s.buy(l, 99999, data)
	s.extend(l.id, 99999, data)
	s.set_wall(l.id, "#f3c9d0")
	s.set_kolam(l.id, true)
	var e := s.editor(l.id, data)
	e.place("sofa", Vector2i(2, 2), 9999)
	e.place("tube", Vector2i(3, 0), 9999)
	e.place("fan", Vector2i(5, 3), 9999)
	e.rotate(e.items[0])
	store.set_section(HomeState.SAVE_KEY, s.to_save())
	assert_eq(store.write(), OK, "written")
	var back := HomeState.from_save(SaveStore.new(SAVE).read().section(HomeState.SAVE_KEY), data)
	assert_eq(back.dropped, 0, "nothing dropped")
	assert_eq(back.current, l.id, "current")
	var h := back.get_home(l.id)
	assert_true(h != null, "the home is back")
	assert_eq([h.extensions, h.wall, h.kolam, h.items.size()], [1, "#f3c9d0", true, 3], "extension, wall, kolam, pieces")
	assert_eq([h.items[0].k, h.items[0].r], ["sofa", 1], "a piece keeps its turn")
	assert_eq(h.items[1].wall, "b", "and its wall")
	assert_eq(SaveStore.new(SAVE).read().section(SaveStore.WEATHER), "rain", "other save keys are untouched")
	DirAccess.remove_absolute(SAVE)
	return true


func test_missing_or_damaged_sections_are_a_new_game() -> bool:
	for bad: Variant in [null, 5, "x", [], {"owned": 3}, {"owned": {"a": 7}}, {"version": "z", "owned": {"b": {"type": "nope"}}}]:
		var s := HomeState.from_save(bad, data)
		assert_eq(s.owned.size(), 0, "no homes from %s" % var_to_str(bad))
		assert_eq(s.current, "", "no current")
	return true


func test_unknown_props_are_dropped_and_unknown_types_kept() -> bool:
	var raw := {"version": 1, "current": "anna-nagar-1", "owned": {
		"anna-nagar-1": {"type": "flat", "extensions": 9, "wall": "notacolour", "items": [
			{"k": "sofa", "x": 1, "z": 1, "r": 0}, {"k": "hoverboard", "x": 0, "z": 0}, {"k": "cot", "x": 40, "z": 0},
			{"k": "chair", "x": 1, "z": 1}, "junk"]},
		"future-1": {"type": "castle", "items": []}}}
	var s := HomeState.from_save(raw, data)
	var h := s.get_home("anna-nagar-1")
	assert_eq(h.items.size(), 1, "only the sofa survives: unknown, outside, overlapping and junk are dropped")
	assert_eq(s.dropped, 4, "four dropped")
	assert_eq(h.extensions, 2, "extensions are capped at two")
	assert_eq(h.wall, "#e9dcc4", "a bad colour falls back to the type's")
	assert_false(s.owns("future-1"), "a home of an unknown type is not playable")
	var kept: Dictionary = s.to_save()["owned"]
	assert_true(kept.has("future-1"), "but it is written back as it was")
	return true


func test_a_newer_save_is_left_alone() -> bool:
	var raw := {"version": 7, "owned": {"anna-nagar-1": {"type": "flat", "items": []}}, "extra": 1}
	var s := HomeState.from_save(raw, data)
	assert_true(s.too_new, "flagged")
	assert_eq(s.owned.size(), 0, "nothing loaded")
	assert_eq(s.to_save(), raw, "written back untouched")
	return true


func test_new_game_forgets_everything() -> bool:
	var s := HomeState.new()
	s.buy(data.listings.get_listing("anna-nagar-1"), 9999, data)
	s.reset()
	assert_eq(s.owned.size(), 0, "no homes")
	var saved: Dictionary = s.to_save()["owned"]
	assert_eq(saved.size(), 0, "none saved")
	return true


# --- The rules -----------------------------------------------------------------------------

func test_peace_zone_and_entry_rules() -> bool:
	assert_true(HomeRules.PEACE_ZONE, "a home is a peace zone")
	assert_false(HomeRules.COMBAT_ALLOWED, "no combat inside")
	assert_false(HomeRules.WEAPONS_ALLOWED, "no weapons inside")
	assert_false(HomeRules.WANTED_ACTIVE, "no wanted level inside")
	assert_true(HomeRules.SAFE_SAVE_POINT, "a safe save point")
	assert_eq(HomeRules.entry_problem(0.0, true), "", "an ordinary visit")
	assert_true(HomeRules.entry_problem(2.0, true) != "", "not with the police on your tail")
	assert_true(HomeRules.entry_problem(0.0, false) != "", "not on a vehicle")
	assert_true(HomeRules.entry_problem_ta(2.0, true) != "", "with a Tamil line")
	return true


# --- Models --------------------------------------------------------------------------------

func test_every_prop_builds_a_small_model() -> bool:
	var worst := 0
	var total := 0
	for def in data.props.props:
		var parts := PropMesh.build(def)
		var solid: MeshBuilder = parts["solid"]
		var glow: MeshBuilder = parts["glow"]
		var tris := solid.triangle_count() + glow.triangle_count()
		assert_true(tris > 0, "%s has triangles" % def.id)
		assert_true(tris < 700, "%s stays small (%d triangles)" % [def.id, tris])
		worst = maxi(worst, tris)
		total += tris
		for v in solid.positions:
			assert_true(v.is_finite() and absf(v.x) < 3.0 and v.y > -1.0 and v.y < 3.2, "%s vertex in range" % def.id)
	print("homes: %d props, %d triangles in all, the largest prop %d" % [data.props.props.size(), total, worst])
	var glowing := 0
	for id: String in ["tube", "pend", "brass", "table_l", "diya", "string", "pooja"]:
		var g: MeshBuilder = PropMesh.build(data.props.get_prop(id))["glow"]
		if not g.is_empty():
			glowing += 1
	assert_eq(glowing, 7, "the lighting props and the pooja lamp glow")
	return true


func test_a_furnished_room_is_two_meshes() -> bool:
	var items: Array[PlacedProp] = []
	var e := _editor("terrace", 0, items)
	for spec: Array in [["sofa", 2, 2], ["cot", 6, 1], ["tube", 3, 0], ["fan", 4, 3], ["fridge", 0, 4], ["pend", 6, 4], ["diya", 2, 4]]:
		assert_true(e.place(str(spec[0]), Vector2i(int(spec[1]), int(spec[2])), 99999).ok, "placed %s" % spec[0])
	var f := FurnitureMesh.new()
	f.build(e.items, data.props)
	var m := f.meshes(StandardMaterial3D.new(), StandardMaterial3D.new())
	assert_true(m[0] != null and m[1] != null, "a solid and a glow mesh")
	assert_eq(m[0].get_surface_count(), 1, "one surface each")
	assert_true(f.triangles < 3000, "a furnished room is light (%d triangles)" % f.triangles)
	var empty := FurnitureMesh.new()
	empty.build([] as Array[PlacedProp], data.props)
	assert_true(empty.meshes(null, null)[0] == null, "an empty room has no mesh")
	var sofa := data.props.get_prop("sofa")
	var at := FurnitureMesh.transform_of(sofa, PlacedProp.make("sofa", 1, 2)).origin
	assert_vec_near(Vector2(at.x, at.z), Vector2(2.0, 2.5), 0.001, "sofa centre")
	assert_near(FurnitureMesh.transform_of(data.props.get_prop("fan"), PlacedProp.make("fan", 1, 1)).origin.y, 2.8, 0.001, "fan height")
	assert_near(FurnitureMesh.transform_of(data.props.get_prop("clock"), PlacedProp.make("clock", 2, 0, 0, "b")).origin.z, 0.08, 0.001, "clock on the back wall")
	return true


# --- Walking, the kolam and the ACTION button ----------------------------------------------

func test_the_walker_follows_a_route_at_a_steady_pace() -> bool:
	var w := HomeWalker.new()
	w.place(Vector2(0, 0), 0.0)
	assert_true(w.arrived(), "no route: nothing to do")
	w.go(PackedVector2Array([Vector2(0, 0), Vector2(3, 0), Vector2(3, 3)]))
	assert_false(w.arrived(), "walking")
	var t := 0.0
	var fastest := 0.0
	while not w.arrived() and t < 20.0:
		var before := w.position
		w.step(1.0 / 60.0)
		fastest = maxf(fastest, before.distance_to(w.position) * 60.0)
		t += 1.0 / 60.0
	assert_vec_near(w.position, Vector2(3, 3), 0.001, "at the end")
	assert_near(t, 6.0 / HomeWalker.PACE, 0.1, "six metres at the pace")
	assert_true(fastest <= HomeWalker.PACE + 0.01, "never faster than the pace (%.2f)" % fastest)
	assert_near(w.speed, 0.0, 0.001, "stopped")
	# Walking east (+x) faces east: yaw -PI/2 in the player's convention (0 faces -z).
	w.place(Vector2(0, 0), 0.0)
	w.go(PackedVector2Array([Vector2(0, 0), Vector2(5, 0)]))
	for i in 120:
		w.step(1.0 / 60.0)
	assert_near(w.yaw, -PI * 0.5, 0.1, "turns to face the way it goes")
	return true


func test_the_kolam_is_a_drawn_pattern() -> bool:
	var img := HomeKolam.make()
	assert_eq([img.get_width(), img.get_height()], [256, 256], "256 square")
	var lit := 0
	for y in 256:
		for x in 256:
			if img.get_pixel(x, y).a > 0.5:
				lit += 1
	assert_true(lit > 1500 and lit < 20000, "a pattern, not blank or filled (%d pixels)" % lit)
	assert_true(img.get_pixel(0, 0).a == 0.0, "transparent at the corners")
	assert_true(img.get_pixel(128, 128).a > 0.5, "a dot at the centre")
	return true


func test_buy_is_dimmed_when_too_poor_and_the_button_still_explains() -> bool:
	var ctx := ActionContext.new()
	var poor: Array[bool] = [true]
	ctx.add_source(func() -> Variant:
		var c := ActionCandidate.make("BUY · ₹3,000", ActionContext.P_ENTER, 1.0, func() -> void: pass)
		c.enabled = not poor[0]
		return c)
	assert_eq(ctx.label(), "BUY · ₹3,000", "the label shows the price")
	assert_false(ctx.best_enabled(), "dimmed while poor")
	assert_true(ctx.trigger(), "it can still be pressed (to say why)")
	poor[0] = false
	assert_true(ctx.best_enabled(), "enabled once there is money")
	assert_true(ActionContext.new().best_enabled(), "no candidate: nothing is disabled")
	return true
