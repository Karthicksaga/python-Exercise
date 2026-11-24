extends TestCase
## The map maths and the marker words (G-281, G-282): north-up and heading-up projections, the
## edge clamp for the waypoint arrow, the distance text, the marker kinds of the real stages, and
## the one saved option. Pure logic, no screen.


func test_north_up_puts_north_above_and_east_to_the_right() -> bool:
	var p := MapProjection.new()
	p.rotate_with_heading = false
	p.pixels_per_metre = 0.5
	p.centre = Vector2(1000, 2000)
	assert_vec_near(p.offset_of(Vector2(1000, 1900)), Vector2(0, -50), 0.001, "100 m north is 50 px up")
	assert_vec_near(p.offset_of(Vector2(1200, 2000)), Vector2(100, 0), 0.001, "200 m east is 100 px right")
	assert_vec_near(p.world_at(p.offset_of(Vector2(1234, 2345))), Vector2(1234, 2345), 0.001, "the inverse")
	return true


func test_heading_up_puts_what_is_ahead_above() -> bool:
	var p := MapProjection.new()
	p.pixels_per_metre = 1.0
	p.centre = Vector2(500, 500)
	# Facing north: unchanged. Facing west (heading +90 degrees, left): west is up.
	p.heading = 0.0
	assert_vec_near(p.offset_of(Vector2(500, 400)), Vector2(0, -100), 0.001, "facing north")
	p.heading = PI / 2.0
	assert_vec_near(p.offset_of(Vector2(400, 500)), Vector2(0, -100), 0.001, "facing west: west is up")
	assert_vec_near(p.offset_of(Vector2(500, 400)), Vector2(100, 0), 0.001, "facing west: north is to the right")
	# Facing east (heading -90): east is up.
	p.heading = -PI / 2.0
	assert_vec_near(p.offset_of(Vector2(600, 500)), Vector2(0, -100), 0.001, "facing east: east is up")
	# Whatever the heading, the point ahead is straight up.
	for h: float in [0.3, 1.1, 2.5, -2.0, 3.0]:
		p.heading = h
		var ahead := p.centre + Vector2(-sin(h), -cos(h)) * 80.0
		assert_vec_near(p.offset_of(ahead), Vector2(0, -80), 0.001, "heading %.1f: ahead is up" % h)
	return true


func test_a_marker_beyond_the_plate_is_pinned_to_its_edge_with_its_direction() -> bool:
	var p := MapProjection.new()
	p.rotate_with_heading = false
	p.pixels_per_metre = 0.25
	var inside := p.clamp_to_circle(Vector2(100, 0), 68.0, 10.0)
	assert_true(bool(inside["inside"]), "100 m is 25 px: on the plate")
	assert_vec_near(inside["at"], Vector2(25, 0), 0.001, "where it is drawn")
	var far := p.clamp_to_circle(Vector2(3000, 4000), 68.0, 10.0)
	assert_false(bool(far["inside"]), "5 km away is off the plate")
	assert_near((far["at"] as Vector2).length(), 58.0, 0.001, "pinned 10 px inside the rim")
	assert_vec_near(far["direction"], Vector2(0.6, 0.8), 0.001, "the way it lies")
	var rect := p.clamp_to_rect(Vector2(100000, 0), Vector2(400, 200), 20.0)
	assert_false(bool(rect["inside"]), "off the full map")
	assert_vec_near(rect["at"], Vector2(380, 0), 0.01, "pinned to the rectangle's edge")
	return true


func test_distance_text_reads_in_metres_then_kilometres() -> bool:
	assert_eq(MapProjection.distance_text(7.0), "7 m", "")
	assert_eq(MapProjection.distance_text(84.0), "84 m", "")
	assert_eq(MapProjection.distance_text(423.0), "420 m", "to ten metres from 100 m")
	assert_eq(MapProjection.distance_text(999.0), "1000 m", "")
	assert_eq(MapProjection.distance_text(1234.0), "1.2 km", "")
	assert_eq(MapProjection.distance_text(7800.0), "7.8 km", "")
	assert_eq(MapProjection.distance_text(12500.0), "13 km", "")
	return true


func test_a_road_set_covers_a_view_only_while_the_view_is_inside_it() -> bool:
	var r := MapRoads.new()
	assert_false(r.covers(Vector2.ZERO, 100.0), "an empty set covers nothing")
	r.centre = Vector2(1000, 1000)
	r.radius = 400.0
	assert_true(r.covers(Vector2(1000, 1000), 260.0), "at the centre")
	assert_true(r.covers(Vector2(1100, 1000), 260.0), "100 m off: still covered")
	assert_false(r.covers(Vector2(1200, 1000), 260.0), "200 m off: the plate would show the edge of the data")
	return true


func test_every_marker_kind_has_words_a_colour_and_they_differ() -> bool:
	var seen := {}
	for k in MarkerKind.ALL:
		assert_true(MarkerKind.label_of(k) != "", "%s has words" % k)
		var c := MarkerKind.colour_of(k)
		assert_false(seen.has(c), "%s has its own colour" % k)
		seen[c] = true
	assert_eq(MarkerKind.label_of(MarkerKind.PICKUP), "Pick up", "")
	assert_eq(MarkerKind.label_of(MarkerKind.DROPOFF), "Drop off", "")
	return true


func test_the_real_stages_say_what_their_markers_are() -> bool:
	var c := GameContent.load_file()
	var auto := c.any_mission("auto-shift")
	assert_eq(MarkerKind.of_objective(auto.objectives[0]), MarkerKind.VEHICLE, "get in the auto")
	assert_eq(MarkerKind.of_objective(auto.objectives[1]), MarkerKind.PICKUP, "pick up the passenger")
	assert_eq(MarkerKind.of_objective(auto.objectives[2]), MarkerKind.DROPOFF, "drop them")
	var brawl := c.any_mission("beach-road-brawl")
	assert_eq(MarkerKind.of_objective(brawl.objectives[0]), MarkerKind.MISSION, "go to the beach road")
	assert_eq(MarkerKind.of_objective(brawl.objectives[1]), MarkerKind.FIGHT, "beat the gang")
	var parcels := c.any_mission("parcel-run")
	assert_eq(MarkerKind.of_objective(parcels.objectives[1]), MarkerKind.DROPOFF, "deliver a parcel")
	var courier := c.any_mission("bike-courier")
	assert_eq(MarkerKind.of_objective(courier.objectives[1]), MarkerKind.PICKUP, "collect the lunch boxes")
	assert_eq(MarkerKind.of_objective(courier.objectives[2]), MarkerKind.DROPOFF, "first drop")
	for j in c.jobs:
		for s in j.stops:
			if s.fare != null and s.fare.board > 0 and s.fare.alight == 0:
				assert_eq(MarkerKind.of_stop(s), MarkerKind.PICKUP, "%s: %s" % [j.id, s.label])
	return true


func test_the_map_option_is_saved_and_announced() -> bool:
	var path := "user://map_settings_test.cfg"
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	var a := MapSettings.new(path)
	assert_true(a.rotating, "turns with the player by default")
	var seen := [0]
	a.changed.connect(func() -> void: seen[0] += 1)
	a.set_rotating(false)
	a.set_rotating(false)
	assert_eq(seen[0], 1, "announced once")
	assert_eq(a.label(), "Minimap: north up", "")
	var b := MapSettings.new(path)
	assert_false(b.rotating, "kept across a restart")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(path))
	return true
