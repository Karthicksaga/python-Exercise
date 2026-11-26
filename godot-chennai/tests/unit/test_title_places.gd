extends TestCase
## The title's spots and the chip's place name (G-164): a seed always draws the same spot, the
## camera sweep stays inside its range, and every name comes from the world's own index.

var source: RegionalWorldSource


func before_each() -> void:
	source = RegionalWorldSource.new()
	source.open_index()


func test_seed_picks_the_same_spot() -> bool:
	var ids := {}
	for s in 60:
		var a := TitleSpots.pick(s)
		assert_eq(a.id, TitleSpots.pick(s).id, "seed %d gives the same spot twice" % s)
		ids[a.id] = true
	assert_eq(ids.size(), 3, "across seeds all three spots come up")
	for id: StringName in [&"marina", &"t_nagar", &"central"]:
		assert_true(ids.has(id), "%s comes up" % id)
	return true


func test_camera_drift_is_slow_and_bounded() -> bool:
	for spot in TitleSpots.all():
		var last := Vector2.ZERO
		var fastest := 0.0
		for i in 600:
			var t := float(i) * 0.1
			var pose := TitleSpots.pose(spot, t)
			var ground: Vector2 = pose["ground"]
			assert_true(ground.distance_to(spot.target) <= spot.distance * 1.06 + 0.01, "%s stays near its radius" % spot.id)
			assert_true(absf(float(pose["height"]) - spot.height) <= 1.5 + 0.01, "%s height sweep" % spot.id)
			if i > 0:
				fastest = maxf(fastest, ground.distance_to(last) / 0.1)
			last = ground
		assert_true(fastest < 3.0, "%s drifts below 3 m/s (%.2f)" % [spot.id, fastest])
		var quarter: Vector2 = TitleSpots.pose(spot, spot.period * 0.25)["ground"]
		var start: Vector2 = TitleSpots.pose(spot, 0.0)["ground"]
		assert_true(quarter.distance_to(start) > 1.0, "%s really moves" % spot.id)
	return true


func test_place_names_come_from_the_index() -> bool:
	assert_eq(TitlePlace.name_at(source, TitleSpots.by_id(&"marina").target), "Marina Beach", "Marina")
	assert_eq(TitlePlace.name_at(source, TitleSpots.by_id(&"t_nagar").target), "T. Nagar", "T. Nagar")
	var names := {}
	for l in source.get_landmarks():
		names[l.name] = true
	for tile: WorldIndex in source.tiles.values():
		for p in tile.districts:
			names[p.name] = true
	for spot in TitleSpots.all():
		var found := TitlePlace.name_at(source, spot.target)
		assert_true(found != "" and names.has(found), "%s: '%s' is a name in the data" % [spot.id, found])
	assert_eq(TitlePlace.name_at(source, Vector2(-900000.0, -900000.0)), "", "far from everything: no invented name")
	return true
