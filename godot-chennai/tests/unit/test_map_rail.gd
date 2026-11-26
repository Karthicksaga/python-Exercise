extends TestCase
## The railway as the maps draw it (G-465): `MapRailFeed` turns the rail network into coloured kinds
## of line and named station dots; `MapRail.nearby` gives the minimap the part round the player
## from its cell index, the same segments a full scan finds.

var _rail: MapRail = null
var _net: RailNetwork = null


func _map() -> MapRail:
	if _rail == null:
		_net = RailNetwork.load_file()
		_rail = MapRailFeed.build(_net)
	return _rail


func test_the_kinds_are_the_lines_own_tracks_with_their_colours() -> bool:
	var rail := _map()
	var keys: Array[StringName] = []
	for k in rail.kinds:
		keys.append(k.key)
		assert_true(k.label != "", "%s has a legend name" % k.key)
	# Every kind, in the legend's order. The expresses mostly run on the suburban lines' tracks
	# (drawn once), but the Coromandel's own track out of Central to the north line is theirs alone.
	assert_eq(keys, [&"suburban", &"mrts", &"express", &"metro_blue", &"metro_green"] as Array[StringName], "the kinds in the legend's order")
	var express_km := 0.0
	var ex := rail.kind(&"express").lines
	var e := 0
	while e + 1 < ex.size():
		express_km += ex[e].distance_to(ex[e + 1]) / 1000.0
		e += 2
	assert_true(express_km < 80.0, "the expresses' track drawn once, not once per service (%.0f km)" % express_km)
	assert_eq(rail.kind(&"metro_blue").label, RailText.LINE_METRO_BLUE, "Metro Blue named")
	assert_true(rail.kind(&"metro_blue").colour.b > rail.kind(&"metro_blue").colour.g, "blue is blue")
	assert_true(rail.kind(&"metro_green").colour.g > rail.kind(&"metro_green").colour.r, "green is green")
	assert_false(rail.kind(&"metro_blue").under.is_empty(), "the Blue Line's tunnels drawn apart")
	assert_true(rail.kind(&"suburban").under.is_empty(), "no tunnels on the suburban lines")
	# One stroke per pair of directions: about the length of one direction of each line.
	var blue_km := 0.0
	var pairs := rail.kind(&"metro_blue").lines + rail.kind(&"metro_blue").under
	var i := 0
	while i + 1 < pairs.size():
		blue_km += pairs[i].distance_to(pairs[i + 1]) / 1000.0
		i += 2
	assert_true(blue_km > 28.0 and blue_km < 36.0, "the Blue Line once (%.1f km)" % blue_km)
	return true


func test_every_called_station_is_a_named_dot_on_its_line() -> bool:
	var rail := _map()
	assert_eq(rail.station_points.size(), rail.station_names.size(), "a name per dot")
	assert_eq(rail.station_points.size(), rail.station_colours.size(), "a colour per dot")
	for want: String in ["Chennai Egmore", "Guindy Metro", "Anna Nagar Tower", "Chengalpattu Junction", "Ponneri", "Thousand Lights"]:
		assert_true(rail.station_names.has(want), "%s on the map" % want)
	var ids: Dictionary[String, bool] = {}
	for line in _net.lines:
		for stop in line.stops:
			ids[stop.id] = true
	assert_eq(rail.station_points.size(), ids.size(), "one dot per station")
	return true


func test_nearby_from_the_index_is_what_a_full_scan_finds() -> bool:
	var rail := _map()
	for at: Vector2 in [Vector2(402, -148), Vector2(5537, 708), Vector2(-14000, 30000), Vector2(30000, 30000)]:
		var got := rail.nearby(at, 600.0)
		assert_true(got.covers(at, 260.0), "covers the plate round %s" % at)
		for ki in rail.kinds.size():
			var want := MapRail._within(rail.kinds[ki].lines, at, 600.0 * 600.0)
			assert_eq(_sorted(got.kinds[ki].lines), _sorted(want), "%s lines near %s" % [rail.kinds[ki].key, at])
			var want_under := MapRail._within(rail.kinds[ki].under, at, 600.0 * 600.0)
			assert_eq(_sorted(got.kinds[ki].under), _sorted(want_under), "%s tunnels near %s" % [rail.kinds[ki].key, at])
		for p in got.station_points:
			assert_true(p.distance_to(at) <= 600.0, "stations within reach")
	assert_true(rail.nearby(Vector2(30000, 30000), 600.0).is_empty(), "nothing out at sea")
	return true


static func _sorted(pairs: PackedVector2Array) -> Array[String]:
	var out: Array[String] = []
	var i := 0
	while i + 1 < pairs.size():
		out.append("%.2f,%.2f-%.2f,%.2f" % [pairs[i].x, pairs[i].y, pairs[i + 1].x, pairs[i + 1].y])
		i += 2
	out.sort()
	return out


func test_the_rail_option_is_saved() -> bool:
	var path := "user://test-map-settings.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var s := MapSettings.new(path)
	assert_true(s.rail_shown, "on by default")
	var told := [0]
	s.changed.connect(func() -> void: told[0] += 1)
	s.set_rail_shown(false)
	assert_eq(told[0], 1, "the maps are told")
	assert_false(MapSettings.new(path).rail_shown, "kept for the next game")
	s.set_rail_shown(true)
	assert_true(MapSettings.new(path).rail_shown, "and back")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	return true
