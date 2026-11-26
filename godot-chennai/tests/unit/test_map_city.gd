extends TestCase
## The full map's whole city (G-466): `MapCityFeed` reads every tile's main roads and every name the
## world's indexes hold, so the map covers the loaded city and labels its areas, roads, hospitals,
## police, bus stands and stops, each from its zoom on; `MapCity.place` writes them without overlaps.

static var _city: MapCity = null
static var _ms := 0


func _city_now() -> MapCity:
	if _city == null:
		var src := RegionalWorldSource.new()
		src.open_index()
		var t0 := Time.get_ticks_msec()
		_city = MapCityFeed.build(src)
		_ms = Time.get_ticks_msec() - t0
		print("        map city: %d road segments, %d labels, %d ms (this machine, one thread)" % [_city.road_segment_count(), _city.label_count(), _ms])
	return _city


func _names_of(kind: int) -> PackedStringArray:
	var out := PackedStringArray()
	var c := _city_now()
	for i in c.label_count():
		if c.label_kinds[i] == kind:
			out.append(c.label_names[i])
	return out


func test_the_owners_areas_are_named() -> bool:
	var all := PackedStringArray()
	for k: int in [MapCity.Kind.SUBURB, MapCity.Kind.NEIGHBOURHOOD]:
		all.append_array(_names_of(k))
	for want: String in ["Ayanavaram", "Choolai", "Kilpauk", "Koyambedu", "Saligramam", "Vadapalani", "Teynampet", "Mylapore", "Adyar"]:
		assert_true(all.has(want), "%s is named" % want)
	assert_true(_names_of(MapCity.Kind.SUBURB).size() > 150, "suburbs (%d)" % _names_of(MapCity.Kind.SUBURB).size())
	return true


func test_roads_hospitals_police_and_bus_stops_are_labelled() -> bool:
	var roads := _names_of(MapCity.Kind.ROAD_MAJOR)
	roads.append_array(_names_of(MapCity.Kind.ROAD))
	assert_true(roads.size() > 200, "main road names (%d)" % roads.size())
	var hospitals := _names_of(MapCity.Kind.HOSPITAL)
	assert_true(hospitals.size() > 50, "hospitals (%d)" % hospitals.size())
	for h in hospitals:
		assert_eq(h, RailText.MAP_HOSPITAL, "a hospital is labelled by what it is, not a business's name")
	assert_true(_names_of(MapCity.Kind.POLICE).size() > 20, "police stations")
	assert_true(_names_of(MapCity.Kind.BUS_STOP).size() > 300, "bus stops (%d)" % _names_of(MapCity.Kind.BUS_STOP).size())
	return true


func test_the_roads_cover_the_whole_loaded_city() -> bool:
	var c := _city_now()
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for cell: Vector2i in c.road_cells.keys():
		lo = Vector2(minf(lo.x, cell.x), minf(lo.y, cell.y))
		hi = Vector2(maxf(hi.x, cell.x), maxf(hi.y, cell.y))
	var span := (hi - lo + Vector2.ONE) * MapCity.ROAD_CELL
	assert_true(span.x > 35000.0 and span.y > 80000.0, "main roads from Chengalpattu to Pulicat (%.0f x %.0f km)" % [span.x / 1000.0, span.y / 1000.0])
	assert_true(c.boundary.size() > 10 and not c.land_triangles.is_empty(), "the world's edge and its land")
	# A view anywhere in the city has roads to draw (no blank box round the player).
	for at: Vector2 in [Vector2(0, 0), Vector2(6000, 6000), Vector2(-14000, 30000), Vector2(-5000, -30000)]:
		assert_false(c.roads_in(Rect2(at - Vector2(2000, 1000), Vector2(4000, 2000))).is_empty(), "roads round %s" % at)
	return true


func test_labels_come_in_by_zoom() -> bool:
	var c := _city_now()
	var view := Rect2(Vector2(-3000, -3000), Vector2(16000, 14000))
	var wide := c.labels_in(view, 26000.0)
	var close := c.labels_in(view, 450.0)
	for i in wide:
		assert_eq(c.label_kinds[i], MapCity.Kind.SUBURB, "only suburbs when the whole city shows")
	assert_true(wide.size() > 10, "suburbs at the widest (%d)" % wide.size())
	var kinds: Dictionary[int, bool] = {}
	for i in close:
		kinds[c.label_kinds[i]] = true
	for k: int in [MapCity.Kind.SUBURB, MapCity.Kind.NEIGHBOURHOOD, MapCity.Kind.HOSPITAL, MapCity.Kind.BUS_STOP, MapCity.Kind.ROAD_MAJOR]:
		assert_true(kinds.has(k), "kind %d close in" % k)
	return true


func test_placing_writes_by_priority_without_overlaps() -> bool:
	var cands: Array[Dictionary] = []
	cands.append({"rank": MapCity.Kind.BUS_STOP, "order": 0, "box": Rect2(0, 0, 50, 12)})
	cands.append({"rank": MapCity.Kind.SUBURB, "order": 1, "box": Rect2(10, 2, 60, 14)})
	cands.append({"rank": MapCity.Kind.ROAD, "order": 2, "box": Rect2(200, 0, 50, 12)})
	cands.append({"rank": MapCity.Kind.HOSPITAL, "order": 3, "box": Rect2(400, 0, 50, 12)})
	var blocked: Array[Rect2] = [Rect2(390, -5, 100, 40)]
	var placed := MapCity.place(cands, blocked)
	var orders: Array[int] = []
	for p in placed:
		orders.append(int(p["order"]))
	assert_eq(orders, [1, 2] as Array[int], "the suburb beats the stop under it; nothing under a button")
	return true
