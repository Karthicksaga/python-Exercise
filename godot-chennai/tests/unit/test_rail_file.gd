extends TestCase
## The committed railway file against the map (translated from `apps/game/src/rail.test.ts`), and
## the lines the Godot file adds (G-320, G-321). Since G-460/G-461 the file comes from the regional
## extract and runs the lines past the old Three.js box; the tests marked CHANGED say how.

var _network: RailNetwork = null


func _net() -> RailNetwork:
	if _network == null:
		_network = RailNetwork.load_file()
	return _network


## The old (Three.js) map box.
func _bounds() -> Rect2:
	var index: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://assets/world/index.json"))
	var b: Dictionary = index["bounds"]
	return Rect2(float(b["minX"]), float(b["minZ"]), float(b["maxX"]) - float(b["minX"]), float(b["maxZ"]) - float(b["minZ"]))


## The Godot world's box (`world/world.json`).
func _world() -> Rect2:
	var w: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://world/world.json"))
	var b: Dictionary = w["bounds"]
	return Rect2(float(b["minX"]), float(b["minZ"]), float(b["maxX"]) - float(b["minX"]), float(b["maxZ"]) - float(b["minZ"]))


func _names(line: RailLine) -> Array[String]:
	var out: Array[String] = []
	for s in line.stops:
		out.append(s.name)
	return out


func test_the_file_is_small_and_credits_osm() -> bool:
	# CHANGED (G-461): 22 lines over the whole world, 1,300 tracks: was < 120 KB for the old box.
	var size := FileAccess.get_file_as_bytes(RailNetwork.PATH).size()
	assert_true(size > 0 and size < 640_000, "small (%d bytes)" % size)
	assert_eq(_net().error, "", "reads")
	assert_contains(_net().attribution, "OpenStreetMap", "attribution")
	return true


# CHANGED (G-461): Beach - Tambaram runs between its two termini in the world (it ran off the old
# box at both ends). The nine stops of the old box are kept, in order, between them.
func test_has_beach_tambaram_both_ways_between_its_termini() -> bool:
	var down := _net().line("beach-tambaram")
	var up := _net().line("tambaram-beach")
	assert_true(down.from.name == "Chennai Beach" and not down.from.beyond, "from Beach, in the world")
	assert_true(down.to.name == "Tambaram" and not down.to.beyond, "to Tambaram, in the world")
	assert_eq(up.to.name, "Chennai Beach", "up to Beach")
	var names := _names(down)
	assert_eq(names[0], "Chennai Beach", "starts at Beach")
	assert_eq(names[names.size() - 1], "Tambaram", "ends at Tambaram")
	var old: Array[String] = ["Park", "Chennai Egmore", "Chetpet", "Nungambakkam", "Kodambakkam", "Mambalam", "Saidapet", "Guindy", "St. Thomas Mount"]
	var kept: Array[String] = []
	for n in names:
		if old.has(n):
			kept.append(n)
	assert_eq(kept, old, "the old stops in order")
	var back := _names(up)
	names.reverse()
	assert_eq(back, names, "the other way")
	# Both ends are termini: trains start and finish standing at the platform.
	assert_true(down.profile.state(1.0).stopped_at == 0, "starts standing at Beach")
	assert_true(down.profile.state(down.profile.duration - 1.0).stopped_at == down.stops.size() - 1, "ends standing at Tambaram")
	return true


# CHANGED (G-461): the Three.js lines are no longer the same points (they run on past the old box),
# but inside the box they retrace them (within 2.5 m), call at the same stations in order with the
# same spacing (within 2 m) and keep their headways and offsets; every old track is still drawn.
func test_is_the_threejs_file_for_its_lines_inside_the_old_box() -> bool:
	var old := RailNetwork.load_file("res://assets/world/rail.json")
	var box := _bounds()
	for line in old.lines:
		var now := _net().line(line.id)
		assert_true(now != null, "%s kept" % line.id)
		var worst := 0.0
		for p in line.path.points:
			if box.has_point(p):
				worst = maxf(worst, now.path.project_near(p, 30.0).distance)
		assert_true(worst < 2.5, "%s retraces the old line (%.2f m)" % [line.id, worst])
		var kept: Array[RailLine.Stop] = []
		for st in now.stops:
			for o in line.stops:
				if o.name == st.name:
					kept.append(st)
		assert_eq(kept.size(), line.stops.size(), "%s same stops" % line.id)
		for i in range(1, mini(kept.size(), line.stops.size())):
			assert_eq(kept[i].name, line.stops[i].name, "%s stop %d" % [line.id, i])
			assert_true(absf((kept[i].s - kept[i - 1].s) - (line.stops[i].s - line.stops[i - 1].s)) < 2.0, "%s spacing %d" % [line.id, i])
		assert_eq(now.headway, line.headway, "%s same headway" % line.id)
		assert_eq(now.offset, line.offset, "%s same offset" % line.id)
	var tracks: Array[RailPath] = []
	for t in _net().tracks:
		tracks.append(RailPath.new(t.points))
	var off := 0
	for t in old.tracks:
		for p in t.points:
			var best := INF
			for path in tracks:
				best = minf(best, path.project_near(p, 4.0).distance)
				if best < 2.0:
					break
			if best >= 2.0:
				off += 1
	assert_eq(off, 0, "every old track point is on a drawn track")
	return true


func test_every_station_on_the_map_on_its_line_with_a_tamil_name() -> bool:
	# CHANGED (G-461): "the map" is the Godot world now (it was the old box).
	var bounds := _world()
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


# CHANGED (G-461): the suburban runs are whole lines now (30 to 67 km, was the old box's 15 km):
# instead of "about half an hour", a run averages 25 to 65 km/h including its stops: below the
# EMU's 80 km/h top speed by the time its stops take (OSM maps 19 stations on the 67 km Sullurpeta
# line, which averages 58 km/h; Beach - Tambaram, a station every 1.7 km, about 39), and the line
# has as many trains as its run and headway give (never more), at least two.
func test_a_few_trains_at_a_time_and_suburban_runs_at_a_suburban_pace() -> bool:
	for line in _net().lines:
		var trains := line.trains(5 * 3600)
		if line.system == "suburban" and line.stops.size() > 3:
			var kmh := line.path.length() / line.profile.duration * 3.6
			assert_true(kmh > 25.0 and kmh < 65.0, "%s averages %.0f km/h" % [line.id, kmh])
			var most := ceili(line.profile.duration / line.headway) + 1
			assert_true(trains.size() > 1 and trains.size() <= most, "%s trains %d (at most %d)" % [line.id, trains.size(), most])
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
	# CHANGED (G-461): the 13 MRTS stops of the old box are on the viaduct as before; the line now
	# also reaches Chennai Beach and Fort, which OSM maps at grade (the Python test checks every
	# new stop against its way's tags), so most, not all, of its stops are up.
	var old_box: Array[String] = ["Park Town", "Chintadaripet", "Chepauk", "Thiruvallikeni", "Light House", "Mundakakanni Amman Koil", "Thirumayilai", "Mandaveli", "Greenways Road", "Kotturpuram", "Kasturiba Nagar", "Indira Nagar", "Tiruvanmiyur"]
	var up := 0
	for stop in mrts.stops:
		if old_box.has(stop.name):
			assert_true(mrts.height_at(stop.s) > 8.0, "%s is up on the viaduct" % stop.name)
		if mrts.height_at(stop.s) > 8.0:
			up += 1
	assert_true(up >= mrts.stops.size() * 3 / 4, "most stops up (%d of %d)" % [up, mrts.stops.size()])
	var out := _net().line("coromandel-out")
	var st := out.profile.state(1.0)
	assert_true(st.stopped_at == 0 and st.speed == 0.0, "an express leaving Central starts standing at its platform")
	assert_eq(out.stops[0].name, "Chennai Central", "at Chennai Central")
	return true


func test_no_two_trains_meet_on_shared_track() -> bool:
	# The builder chose offsets so trains of different lines never come within 130 m on shared
	# track (G-322); checked here again on the game's own timetable over a whole cycle.
	# CHANGED (G-461): "shared track" as the builder now says it: within 2 m of the other line,
	# running along it and at its height; regional lines cross each other at flyovers and junctions
	# (a Metro viaduct over a suburban line is not the same track).
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
				var pa := a.line.path.at(a.state.s)
				var pb := b.line.path.at(b.state.s)
				if pa.point().distance_to(pb.point()) < 130.0 and (_shared(pa, a.line.height_at(a.state.s), b.line) or _shared(pb, b.line.height_at(b.state.s), a.line)):
					conflicts += 1
		clock += 10.0
	assert_eq(conflicts, 0, "no meetings")
	return true


func _shared(at: RailPath.Pose, height: float, other: RailLine) -> bool:
	var hit := other.path.project_near(at.point(), 4.0)
	if hit.distance >= 2.0:
		return false
	if absf(cos(other.path.at(hit.s).yaw - at.yaw)) < 0.9:
		return false
	return absf(other.height_at(hit.s) - height) < 3.0


# G-461: trains run past the old map's edge: to Chengalpattu, beyond Avadi towards Arakkonam and
# beyond Gummidipoondi towards Sullurpeta, with return services; no line ends mid-world at speed.
func test_lines_run_past_the_old_edge() -> bool:
	var box := _bounds()
	var world := _world().grow(160.0)
	for want: String in ["tambaram-chengalpattu", "chengalpattu-tambaram", "arakkonam-central", "sullurpeta-central"]:
		assert_true(_net().line(want) != null, "%s is in" % want)
	assert_eq(_net().line("tambaram-chengalpattu").stops[-1].name, "Chengalpattu Junction", "to Chengalpattu")
	assert_true(_names(_net().line("central-arakkonam")).has("Avadi"), "through Avadi")
	assert_true(_names(_net().line("central-sullurpeta")).has("Ponneri"), "through Ponneri")
	var beyond_box := 0
	for line in _net().lines:
		for p in line.path.points:
			assert_true(world.has_point(p), "%s in the world" % line.id)
		for stop in line.stops:
			if not box.has_point(line.path.at(stop.s).point()):
				beyond_box += 1
		if not line.from.beyond:
			assert_true(line.profile.state(0.5).stopped_at == 0, "%s starts standing at its first station" % line.id)
		if not line.to.beyond:
			assert_true(line.profile.state(line.profile.duration - 0.5).stopped_at == line.stops.size() - 1, "%s ends standing at its last" % line.id)
	assert_true(beyond_box > 100, "stops beyond the old box (%d)" % beyond_box)
	# Trains run there: some are on the line beyond the old box at any time.
	var far := 0
	for t in _net().trains(8 * 3600):
		if not box.grow(2000.0).has_point(t.line.path.at(t.state.s).point()):
			far += 1
	assert_true(far >= 5, "trains beyond the old edge now (%d)" % far)
	return true


# G-462: the Metro's Blue and Green lines both ways, with viaducts and tunnels, Metro trains,
# stations in the tunnels kept off the platforms list, the fare and the lines' colours.
func test_metro_blue_and_green_lines() -> bool:
	var ids: Array[String] = ["metro-blue-north", "metro-blue-south", "metro-green-north", "metro-green-south"]
	for id in ids:
		var line := _net().line(id)
		assert_true(line != null and line.is_metro(), "%s is a Metro line" % id)
		assert_eq(line.train_type, "metro", "%s runs Metro trains" % id)
		assert_eq(line.metro_line, "green" if id.contains("green") else "blue", "%s colour" % id)
		assert_true(line.tunnels.size() >= 1, "%s has a tunnel" % id)
		assert_true(line.stops.size() >= 17, "%s stops" % id)
		assert_eq(line.profile.spec.dwell, 20.0, "%s stands 20 s" % id)
		assert_eq(RailRules.fare_for(line), RailRules.METRO_FARE, "%s fare" % id)
		var up := 0
		var under := 0
		for stop in line.stops:
			if line.height_at(stop.s) > 10.0:
				up += 1
			if line.underground_at(stop.s):
				under += 1
		assert_true(up >= 7 and under >= 8, "%s: %d stops up, %d underground" % [id, up, under])
	var platforms := StationLayout.platforms(_net())
	var metro := 0
	for p in platforms:
		assert_false(p.line.underground_at(p.stop.s), "%s has no platform drawn in a tunnel" % p.station.name)
		if p.line.is_metro():
			metro += 1
	assert_true(metro >= 20, "Metro platforms on the viaducts (%d)" % metro)
	assert_eq(RailRules.fare_for(_net().line("beach-tambaram")), RailRules.FARE, "suburban fare unchanged")
	return true


# G-461: asking for the lines near a place gives every line that comes that close (the cells are a
# superset), and the crossings near a place are exactly those within the distance.
func test_lines_and_crossings_near_a_place() -> bool:
	var net := _net()
	for p: Vector2 in [Vector2(5537, 708), Vector2(-20000, -9000), Vector2(0, 0), Vector2(-14000, 30000), Vector2(9000, -30000)]:
		var near := net.lines_near(p, 900.0)
		for line in net.lines:
			if line.path.project(p).distance <= 900.0:
				assert_true(near.has(line), "%s near %s" % [line.id, p])
		var got := net.crossings_near(p, 900.0)
		var want := PackedInt32Array()
		for i in net.crossings.size():
			if Vector2(net.crossings[i].x, net.crossings[i].z).distance_to(p) <= 900.0:
				want.append(i)
		assert_eq(got, want, "crossings near %s" % p)
	assert_true(net.lines_near(Vector2(5537, 708), 900.0).size() < net.lines.size(), "not every line is near Egmore")
	return true
