extends TestCase
## Integration tests for the main-game Chennai navigation system:
## ChennaiGeoIndex, ChennaiRouter, StreetNameService, MissionHud banners/guidance,
## FullMap offline search/routing, and Minimap route overlay.


func test_geo_index_street_service_and_router_integration() -> bool:
	var geo := ChennaiGeoIndex.new()
	var err := geo.open()
	assert_eq(err, "", "ChennaiGeoIndex opens read-only OSM world cleanly")
	assert_true(geo.loaded and geo.all_pois.size() > 1000, "POIs indexed")
	assert_true(geo.metro_tracks.size() > 100 and geo.metro_stations.size() > 20, "Chennai Metro tracks & stations loaded from OSM")
	assert_true(geo.road_tags.size() > 500, "Tamil/alt road tags loaded from OSM (%d roads)" % geo.road_tags.size())

	var hits := geo.search("Egmore", Vector2(40.0, 60.0), 5)
	assert_true(not hits.is_empty(), "Egmore found offline")

	var gps_hits := geo.search("13.0850, 80.2101", Vector2.ZERO, 3)
	assert_true(not gps_hits.is_empty() and str(gps_hits[0]["category"]) == "GPS Coordinate", "GPS coordinate search works")

	var svc := StreetNameService.new()
	svc.geo = geo
	var streets: Array[String] = []
	var locs: Array[String] = []
	svc.on_street_entered.connect(func(s: String, _l: String, _ta: String) -> void: streets.append(s))
	svc.on_locality_entered.connect(func(l: String, _ta: String) -> void: locs.append(l))

	svc.update_player(0.3, Vector2(40.0, 60.0), false)
	assert_true(not locs.is_empty() and locs[0] == "Anna Nagar", "locality entered signal emitted")
	assert_true(not streets.is_empty(), "street entered signal emitted: %s" % (streets[0] if not streets.is_empty() else ""))

	var stops: Array[Dictionary] = [
		{"role": "start", "name": "Anna Nagar", "pos": Vector2(40.0, 60.0)},
		{"role": "dest", "name": "Egmore", "pos": Vector2(5279.0, 782.0)},
	]
	var route := ChennaiRouter.compute_route(geo, stops, "fastest")
	assert_true(bool(route.get("ok", false)), "ChennaiRouter A* succeeded")
	assert_true((route["polyline"] as PackedVector2Array).size() > 10, "route polyline populated")
	return true


func test_full_map_hud_and_minimap_navigation_wiring() -> bool:
	var geo := ChennaiGeoIndex.new()
	assert_eq(geo.open(), "", "geo index ready")
	var svc := StreetNameService.new()
	svc.geo = geo

	var hud := MissionHud.new()
	root.add_child(hud)
	await wait_frames(2)

	hud.show_street_banner("ENTERING STREET", "ANNA NAGAR 2ND AVENUE", "Anna Nagar, Chennai", 2.0)
	assert_true(hud.street_banner.visible, "MissionHud street banner shown")

	hud.set_nav_guidance(true, "IN 250 M", "TURN LEFT", "Poonamallee High Road", "Remaining: 2.1 km · EST. 4 min")
	assert_true(hud.nav_card.visible, "MissionHud nav guidance card shown")

	var map := FullMap.new()
	map.geo_index = geo
	map.street_service = svc
	root.add_child(map)
	map.open(Vector2(40.0, 60.0), 0.0, MapRoads.new(), MapRoads.new(), [] as Array[Dictionary])
	await wait_frames(2)

	var emitted := []
	map.route_requested.connect(func(r: Dictionary) -> void: emitted.append(r))
	map._dest_stop = {"role": "dest", "name": "Egmore Station", "pos": Vector2(5279.0, 782.0)}
	map._recompute_route()
	assert_true(not emitted.is_empty() and bool((emitted[0] as Dictionary).get("ok", false)), "FullMap emits computed route")

	hud.minimap.route_polyline = (emitted[0] as Dictionary)["polyline"]
	hud.minimap.queue_redraw()
	await wait_frames(1)
	assert_true(hud.minimap.route_polyline.size() > 10, "Minimap receives active route polyline")

	map.queue_free()
	hud.queue_free()
	await wait_frames(1)
	return true
