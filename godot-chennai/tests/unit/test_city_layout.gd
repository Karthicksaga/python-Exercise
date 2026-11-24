extends TestCase
## The street layout (decision G-56): nearest road, bus shelters at mapped stops, spans.


func test_nearest_road_and_shelters() -> bool:
	var kit := CityTestKit.kit()
	var layout := kit.layouts.layout_for(kit.source.cell_at(Vector2(40, 60)))
	var hit := layout.nearest_road_point(Vector2(40, 60))
	assert_false(hit.is_empty(), "a road near the start")
	if hit.is_empty():
		return true
	var road: Road = layout.roads[int(hit["road_index"])]
	assert_true(road.kind != &"footway", "drivable")
	assert_true(float(hit["distance"]) < 40.0, "within 40 m (%.1f)" % float(hit["distance"]))
	# The tower: the TS game's nearestRoadPoint finds 6th Main Road 88.55 m away.
	var tower := layout.nearest_road_point(Vector2(402.41, -147.93))
	assert_eq(int((layout.roads[int(tower["road_index"])] as Road).id), 242400280, "6th Main Road nearest the tower")
	assert_near(float(tower["distance"]), 88.55, 0.02, "its distance")
	var shelters := 0
	for list: Array in layout.shelters.values():
		shelters += list.size()
	assert_true(shelters > 300, "shelters at the mapped bus stops (%d of 533)" % shelters)
	return true
