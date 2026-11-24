extends TestCase
## The homes for sale on the real map (G-233): every listed OSM building is in the world data,
## its door sits on the footprint's edge facing the nearest road, the spot to stand is on the
## street side and not on a carriageway, and nothing is on a flyover.

var source: RegionalWorldSource
var layouts: CityLayouts
var data: HomeData


func before_each() -> void:
	source = RegionalWorldSource.new()
	source.open_index()
	source.open_roads()
	layouts = CityLayouts.create(source)
	data = HomeData.load_all()


func test_every_listed_building_resolves_to_a_door() -> bool:
	var found := 0
	for l in data.listings.listings:
		var s := HomeSite.resolve(l, source, layouts)
		assert_true(s != null, "%s (OSM %d) is in the world data" % [l.id, l.osm])
		if s == null:
			continue
		found += 1
		# The door is on the footprint's outline (0.1 m off the wall) and faces away from the building.
		var nearest := INF
		for i in s.outline.size():
			var q := Geometry2D.get_closest_point_to_segment(s.door, s.outline[i], s.outline[(i + 1) % s.outline.size()])
			nearest = minf(nearest, q.distance_to(s.door))
		assert_true(nearest < 0.25, "%s: the door is on the wall (%.2f m)" % [l.id, nearest])
		assert_true(s.normal.dot(s.door - s.centre) > 0.0, "%s: the door faces out of the building" % l.id)
		assert_near(s.normal.length(), 1.0, 0.001, "%s: unit normal" % l.id)
		var layout := layouts.layout_for(source.cell_at(s.centre))
		var hit := layout.nearest_road_point(s.door)
		assert_true(float(hit["distance"]) < 45.0, "%s: a road is near the door (%.0f m)" % [l.id, float(hit["distance"])])
		assert_false(layout.on_other_road(s.stand, -1, 0.3), "%s: the standing spot is not on a carriageway" % l.id)
		assert_true(s.stand.distance_to(s.door) < 8.0, "%s: the spot is by the door (%.1f m)" % [l.id, s.stand.distance_to(s.door)])
		assert_true(s.ground_y < 0.3, "%s: on the ground" % l.id)
		assert_true(s.in_reach(s.stand) and not s.in_reach(s.stand + Vector2(20, 0)), "%s: reach" % l.id)
	assert_eq(found, data.listings.listings.size(), "every listing found")
	return true


func test_a_missing_building_is_skipped() -> bool:
	var ghost := HomeListing.new()
	ghost.id = "ghost"
	ghost.osm = 99999999
	ghost.at = Vector2(6391.1, 9506.9)
	assert_true(HomeSite.resolve(ghost, source, layouts) == null, "no such building: no site, no crash")
	return true


func test_the_board_says_for_sale_then_my_home() -> bool:
	var l := data.listings.get_listing("mylapore-1")
	var s := HomeSite.resolve(l, source, layouts)
	var view := HomeSiteView.make(s)
	root.add_child(view)
	var type := data.homes.type_of(l.type_id)
	view.show_state(false, data.prices.home(type.id), type)
	var texts := PackedStringArray()
	for n in view.find_children("*", "Label3D", true, false):
		texts.append((n as Label3D).text)
	var joined := " | ".join(texts)
	assert_contains(joined, "FOR SALE", "English")
	assert_contains(joined, "விற்பனைக்கு", "Tamil")
	assert_contains(joined, "₹9,000", "the price")
	assert_contains(joined, "Old house with a thinnai", "the kind of home")
	for word: String in ["ltd", "bank", "jewel", "mall"]:
		assert_false(joined.to_lower().contains(word), "category words only, no business name (%s)" % word)
	view.show_state(true, data.prices.home(type.id), type)
	texts.clear()
	for n in view.find_children("*", "Label3D", true, false):
		texts.append((n as Label3D).text)
	joined = " | ".join(texts)
	assert_contains(joined, "MY HOME", "bought")
	assert_contains(joined, "என் வீடு", "in Tamil too")
	assert_false(joined.contains("FOR SALE"), "no longer for sale")
	# The door leaf swings open in game time and shuts again.
	view.open_door(true)
	for i in 60:
		view._process(1.0 / 60.0)
	assert_near(view.door_open_amount(), 1.0, 0.01, "open after a second")
	view.open_door(false)
	for i in 60:
		view._process(1.0 / 60.0)
	assert_near(view.door_open_amount(), 0.0, 0.01, "shut again")
	# The board is placed on the door, facing out of the building.
	var out := Vector3(s.normal.x, 0.0, s.normal.y)
	assert_true((-view.global_transform.basis.z).dot(out) < -0.99 or view.global_transform.basis.z.dot(out) > 0.99, "its front faces out of the wall")
	view.queue_free()
	return true
