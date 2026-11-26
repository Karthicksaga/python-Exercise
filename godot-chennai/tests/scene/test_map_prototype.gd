extends TestCase
## Verifies the standalone Phase 2 Map Prototype (`res://src/map_prototype/map_prototype.tscn`):
## read-only OSM data loading, offline search (English & Tamil), street/locality detection,
## real multi-waypoint A* routing, layer toggles, and UI layout.

const SCENE := "res://src/map_prototype/map_prototype.tscn"


func test_prototype_loads_real_osm_data_and_searches_offline() -> bool:
	var proto := (load(SCENE) as PackedScene).instantiate() as MapPrototype
	root.add_child(proto)
	await wait_frames(2)

	assert_true(proto.data.loaded, "read-only OSM world loaded")
	assert_true(proto.data.all_pois.size() > 1000, "real POIs indexed: %d" % proto.data.all_pois.size())
	assert_true(proto.data.all_districts.size() > 100, "real districts indexed: %d" % proto.data.all_districts.size())
	assert_true(proto.data.rail_stations.size() >= 20, "real rail stations indexed: %d" % proto.data.rail_stations.size())

	var marina := proto.data.search("Marina Beach", proto.canvas.player_pos, 5)
	assert_true(not marina.is_empty(), "Marina Beach found offline")
	assert_eq(str(marina[0]["name"]), "Marina Beach", "Marina Beach ranked first")

	var tamil := proto.data.search("அண்ணா நகர்", proto.canvas.player_pos, 5)
	assert_true(not tamil.is_empty(), "Tamil locality search matches Anna Nagar")

	var street := proto.data.identify_street(Vector2(40.0, 60.0))
	assert_true(str(street.get("name", "")) != "", "street identified at spawn: %s" % str(street.get("name", "")))
	var loc := proto.data.identify_locality(Vector2(40.0, 60.0))
	assert_eq(str(loc.get("name", "")), "Anna Nagar", "locality identified at spawn")

	proto.queue_free()
	await wait_frames(1)
	return true


func test_prototype_computes_real_multi_waypoint_astar_route_and_navigation() -> bool:
	var proto := (load(SCENE) as PackedScene).instantiate() as MapPrototype
	root.add_child(proto)
	await wait_frames(2)

	var stops: Array[Dictionary] = [
		{"role": "start", "name": "Anna Nagar 2nd Ave", "pos": Vector2(40.0, 60.0)},
		{"role": "waypoint", "name": "Egmore Station", "pos": Vector2(5279.0, 782.0)},
		{"role": "dest", "name": "Marina Beach", "pos": Vector2(7991.7, 3422.5)},
	]
	var res := PrototypeRouter.compute_route(proto.data, stops)
	assert_true(bool(res.get("ok", false)), "multi-waypoint A* succeeded: %s" % str(res.get("reason", "")))
	var poly: PackedVector2Array = res["polyline"]
	assert_true(poly.size() > 20, "route follows real OSM road nodes (%d pts)" % poly.size())
	var dist := float(res["total_distance"])
	assert_true(dist > 8000.0 and dist < 22000.0, "realistic Chennai route distance %.0f m" % dist)
	var steps: Array = res["steps"]
	assert_true(steps.size() >= 4, "turn-by-turn steps generated: %d" % steps.size())

	# Test navigation & layer toggles
	proto.route_panel.visible = true
	proto.layers_panel.visible = true
	proto.layer_checks[&"buildings"].button_pressed = false
	assert_false(proto.canvas.layers[&"buildings"], "layer toggle updates canvas")

	# Test Shortest route mode & GPS coordinate search
	var shortest := PrototypeRouter.compute_route(proto.data, stops, "shortest")
	assert_true(bool(shortest.get("ok", false)), "shortest A* mode succeeded")
	assert_eq(str(shortest.get("mode", "")), "shortest", "route mode recorded")

	var gps_hits := proto.data.search("13.0850, 80.2101", proto.canvas.player_pos, 3)
	assert_true(not gps_hits.is_empty(), "GPS coordinate search returns result")
	assert_eq(str(gps_hits[0]["category"]), "GPS Coordinate", "GPS coordinate ranked first")

	var nearby := proto.data.find_nearby_pois(Vector2(40.0, 60.0), 600.0, 4)
	assert_true(not nearby.is_empty(), "nearby POIs found within 600m")

	var br := PrototypeWorldData.compass_bearing(Vector2.ZERO, Vector2(100.0, -100.0))
	assert_eq(str(br["cardinal"]), "NE", "compass bearing NE verified")

	# Test bookmarks & 2-point ruler
	assert_true(proto.bookmarks.size() >= 4, "preset Chennai bookmarks loaded")
	proto.measure_toggle_btn.pressed.emit()
	assert_eq(proto.pick_mode, "measure", "ruler mode activated")

	proto.queue_free()
	await wait_frames(1)
	return true
