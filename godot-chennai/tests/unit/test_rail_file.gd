extends TestCase
## The committed railway file against the map (translated from `apps/game/src/rail.test.ts`), and
## the lines the Godot file adds from the same extract (G-320, G-321).

var _network: RailNetwork = null


func _net() -> RailNetwork:
	if _network == null:
		_network = RailNetwork.load_file()
	return _network


func _bounds() -> Rect2:
	var index: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/world/index.json"))
	var b: Dictionary = index["bounds"]
	return Rect2(float(b["minX"]), float(b["minZ"]), float(b["maxX"]) - float(b["minX"]), float(b["maxZ"]) - float(b["minZ"]))


func test_the_file_is_small_and_credits_osm() -> bool:
	var size := FileAccess.get_file_as_bytes(RailNetwork.PATH).size()
	assert_true(size > 0 and size < 120_000, "small (%d bytes)" % size)
	assert_eq(_net().error, "", "reads")
	assert_contains(_net().attribution, "OpenStreetMap", "attribution")
	return true


func test_has_beach_tambaram_both_ways_running_off_the_map() -> bool:
	var down := _net().line("beach-tambaram")
	var up := _net().line("tambaram-beach")
	assert_true(down.from.name == "Chennai Beach" and down.from.beyond, "from Beach, beyond the map")
	assert_true(down.to.name == "Tambaram" and down.to.beyond, "to Tambaram, beyond the map")
	assert_eq(up.to.name, "Chennai Beach", "up to Beach")
	var names: Array[String] = []
	for s in down.stops:
		names.append(s.name)
	assert_eq(names, ["Park", "Chennai Egmore", "Chetpet", "Nungambakkam", "Kodambakkam", "Mambalam", "Saidapet", "Guindy", "St. Thomas Mount"] as Array[String], "stops")
	var back: Array[String] = []
	for s in up.stops:
		back.append(s.name)
	names.reverse()
	assert_eq(back, names, "the other way")
	return true


func test_is_the_threejs_file_for_its_lines() -> bool:
	var old := RailNetwork.load_file("res://assets/world/rail.json")
	for line in old.lines:
		var now := _net().line(line.id)
		assert_true(now != null, "%s kept" % line.id)
		assert_eq(now.path.points, line.path.points, "%s same points" % line.id)
		assert_eq(now.stops.size(), line.stops.size(), "%s same stops" % line.id)
		assert_eq(now.headway, line.headway, "%s same headway" % line.id)
		assert_eq(now.offset, line.offset, "%s same offset" % line.id)
	assert_eq(_net().tracks.size(), old.tracks.size(), "same tracks")
	return true


func test_every_station_on_the_map_on_its_line_with_a_tamil_name() -> bool:
	var bounds := _bounds()
	var off := 0
	for line in _net().lines:
		for stop in line.stops:
			var p := RailRules.platform_of(line, stop)
			if not bounds.has_point(p.point()):
				off += 1
			var station := _net().station(stop.id)
			assert_true(station != null, "%s has a station" % stop.name)
			assert_true(line.path.project(Vector2(station.x, station.z)).distance < 400.0, "%s near its line" % stop.name)
			assert_true(stop.name_ta.length() > 0, "%s has a Tamil name" % stop.name)
	assert_eq(off, 0, "every platform on the map")
	return true


func test_a_few_trains_at_a_time_and_the_suburban_line_takes_about_half_an_hour() -> bool:
	for line in _net().lines:
		var trains := line.trains(5 * 3600)
		if line.system == "suburban" and line.stops.size() > 3:
			assert_true(line.profile.duration / 60.0 > 20.0 and line.profile.duration / 60.0 < 45.0, "%s run %.0f min" % [line.id, line.profile.duration / 60.0])
			assert_true(trains.size() > 1 and trains.size() <= 6, "%s trains %d" % [line.id, trains.size()])
		for p in line.profile.phases:
			if p.stop >= 0 and p.stop > 0 and p.stop < line.stops.size() - 1:
				assert_eq(p.duration, line.profile.spec.dwell, "%s full dwell" % line.id)
	return true


func test_godot_lines_from_the_same_extract() -> bool:
	var ids: Array[String] = []
	for line in _net().lines:
		ids.append(line.id)
	for want: String in ["mrts-beach-mount", "mrts-mount-beach", "central-arakkonam", "central-sullurpeta", "coromandel-out"]:
		assert_true(ids.has(want), "%s is in" % want)
	var mrts := _net().line("mrts-beach-mount")
	assert_true(mrts.elevated() and mrts.system == "mrts", "the MRTS is on its viaduct")
	for stop in mrts.stops:
		assert_true(mrts.height_at(stop.s) > 8.0, "%s is up on the viaduct" % stop.name)
	var out := _net().line("coromandel-out")
	var st := out.profile.state(1.0)
	assert_true(st.stopped_at == 0 and st.speed == 0.0, "an express leaving Central starts standing at its platform")
	assert_eq(out.stops[0].name, "Chennai Central", "at Chennai Central")
	return true


func test_no_two_trains_meet_on_shared_track() -> bool:
	# The builder chose offsets so trains of different lines never come within 130 m on shared
	# track (G-322); checked here again on the game's own timetable over a whole cycle.
	var net := _net()
	var conflicts := 0
	var clock := 6.0 * 3600.0
	var stop_at := clock + 7200.0
	while clock < stop_at:
		var trains := net.trains(clock)
		for i in trains.size():
			for j in range(i + 1, trains.size()):
				var a := trains[i]
				var b := trains[j]
				if a.line == b.line:
					continue
				var pa := a.line.path.at(a.state.s).point()
				var pb := b.line.path.at(b.state.s).point()
				if pa.distance_to(pb) < 130.0 and (b.line.path.project_near(pa, 4.0).distance < 2.0 or a.line.path.project_near(pb, 4.0).distance < 2.0):
					conflicts += 1
		clock += 10.0
	assert_eq(conflicts, 0, "no meetings")
	return true
