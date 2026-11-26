extends TestCase
## The minimap, the full map and the marker on the ground (G-281, G-282), through the real layer
## on the flat missions ground, in game time: the minimap is fed at 10 Hz at most with the
## mission's marker and kind; the marker is labelled; the full map opens from the layer, holds the
## game and closes; the layouts fit a phone; the beacon explains itself and never fills a disc.

const SAVE := "user://test-maps.json"

var g: MissionsGround


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	await wait_physics_frames(2)


func _hud() -> MissionHud:
	return g.layer.hud


func test_the_minimap_is_always_on_and_shows_the_missions_marker_with_its_kind() -> bool:
	await wait_frames(12)
	var m := _hud().minimap
	assert_true(m.visible, "the corner map shows without hazards")
	assert_true(m.size.is_equal_approx(Vector2(Minimap.PLATE, Minimap.PLATE)), "a round plate")
	assert_true(m.markers.size() >= 1, "the marker is on it")
	var t := g.layer.target
	assert_vec_near(m.marker_point(), Vector2(float(t["x"]), float(t["z"])), 0.01, "the marker is where the objective is")
	assert_eq(str(m.markers[0]["kind"]), "mission", "stage 1 is a plain mission marker")
	assert_true(bool(m.markers[0]["primary"]), "and is the primary one")
	return true


func test_the_minimap_is_refreshed_ten_times_a_second_at_most() -> bool:
	await wait_frames(12)
	var m := _hud().minimap
	var before := m.updates
	await wait_game_seconds(2.0)
	var count := m.updates - before
	assert_true(count <= 21, "at most 10 Hz: %d updates in 2 s" % count)
	assert_true(count >= 14, "and not starved: %d updates in 2 s" % count)
	return true


func test_a_far_stage_is_pinned_to_the_edge_with_its_distance_in_metres() -> bool:
	var s := g.layer.session
	var done: Array[String] = []
	for first_ten: MissionData.Mission in s.content.missions.slice(0, 10):
		done.append(first_ten.id)
	s.store.set_section(SaveStore.PROGRESS, {"completed": done, "money": 5000})
	s.store.write()
	s.reload()
	await wait_frames(14)
	var m := _hud().minimap
	assert_eq(s.runner.mission().id, "courier-chase", "stage 11")
	var far := m.marker_point().distance_to(m.player)
	assert_true(far > 5000.0, "Royapettah is %.0f m from the start" % far)
	var hit := m.projection.clamp_to_circle(m.marker_point(), Minimap.PLATE / 2.0, Minimap.MARKER_INSET)
	assert_false(bool(hit["inside"]), "so it is an arrow on the rim")
	assert_near((hit["at"] as Vector2).length(), Minimap.PLATE / 2.0 - Minimap.MARKER_INSET, 0.01, "pinned inside the rim")
	assert_true(MapProjection.distance_text(far).ends_with("km"), "read in kilometres")
	return true


func test_the_map_is_a_setting_that_turns_it() -> bool:
	await wait_frames(12)
	var m := _hud().minimap
	var settings := MapSettings.shared()
	settings.set_rotating(false)
	assert_false(m.projection.rotate_with_heading, "north up when asked")
	settings.set_rotating(true)
	assert_true(m.projection.rotate_with_heading, "and turning again")
	return true


func test_the_full_map_opens_holds_the_game_and_closes() -> bool:
	await wait_frames(12)
	var layer := g.layer
	assert_true(layer.full_map == null or not layer.full_map.is_open(), "closed at first")
	_hud().map_pressed.emit()
	await wait_frames(2)
	assert_true(layer.full_map != null and layer.full_map.is_open(), "the tap opened it")
	assert_true(layer.held and layer.get_tree().paused, "the game waits behind the map")
	assert_true(layer.full_map.markers.size() >= 2, "the marker and the places are on it")
	assert_true(layer.close_map(), "Back closes it")
	await wait_frames(2)
	assert_false(layer.held, "the game goes on")
	assert_false(layer.get_tree().paused, "unpaused")
	assert_false(layer.close_map(), "nothing left to close")
	return true


func test_the_full_map_from_the_pause_menu_does_not_unpause_the_game() -> bool:
	await wait_frames(4)
	var layer := g.layer
	layer.get_tree().paused = true
	layer.open_map()
	await wait_frames(2)
	assert_true(layer.full_map.is_open(), "open")
	assert_false(layer.held, "the pause menu owns the pause, not the map")
	layer.close_map()
	await wait_frames(2)
	assert_true(layer.get_tree().paused, "still paused: the pause menu is behind")
	layer.get_tree().paused = false
	return true


func test_full_map_zoom_steps_scale_the_view_and_the_legend_names_the_kinds() -> bool:
	await wait_frames(4)
	var layer := g.layer
	layer.open_map()
	var map := layer.full_map
	var near := map.view_metres()
	map.set_zoom(map.zoom + 1)
	assert_true(map.view_metres() > near, "zooming out shows more")
	map.set_zoom(99)
	assert_eq(map.zoom, FullMap.ZOOMS.size() - 1, "clamped at the widest")
	assert_true(map.zoom_out_button.disabled and not map.zoom_in_button.disabled, "the buttons say so")
	map.set_zoom(-4)
	assert_eq(map.zoom, 0, "and at the closest")
	assert_true(map.credit.contains("OpenStreetMap"), "the map carries the OSM credit")
	layer.close_map()
	return true


func test_the_full_map_controls_fit_a_phone_and_do_not_overlap() -> bool:
	for size: Vector2i in [Vector2i(915, 412), Vector2i(640, 320), Vector2i(1830, 824)]:
		var vp := SubViewport.new()
		vp.size = size
		root.add_child(vp)
		var map := FullMap.new()
		vp.add_child(map)
		map.open(Vector2(100, 100), 0.0, MapRoads.new(), MapRoads.new(), [] as Array[Dictionary])
		await wait_frames(3)
		var screen := Rect2(Vector2.ZERO, Vector2(size))
		var rects: Array[Rect2] = []
		for b: Button in [map.zoom_in_button, map.zoom_out_button, map.recentre_button, map.close_button]:
			var r := b.get_global_rect()
			assert_true(screen.encloses(r), "%s inside %s" % [b.name, size])
			assert_true(r.size.x >= 48.0 and r.size.y >= 48.0, "%s is a touch target at %s" % [b.name, size])
			for other in rects:
				assert_false(r.intersects(other), "%s overlaps another at %s" % [b.name, size])
			rects.append(r)
		vp.queue_free()
		await wait_frames(1)
	return true


func test_the_corner_map_keeps_clear_of_the_buttons_at_every_phone_size() -> bool:
	for size: Vector2i in [Vector2i(915, 412), Vector2i(640, 320), Vector2i(1830, 824)]:
		for left_handed: bool in [false, true]:
			var vp := SubViewport.new()
			var scale := 2.0 if size.x > 1000 else 1.0
			vp.size = size
			vp.size_2d_override = Vector2i(Vector2(size) / scale)
			vp.size_2d_override_stretch = true
			root.add_child(vp)
			var settings := ControlSettings.shared()
			var was := settings.left_handed
			settings.set_left_handed(left_handed)
			var hud := MissionHud.new()
			vp.add_child(hud)
			var menu := PauseMenu.new()
			vp.add_child(menu)
			menu.show_pause_button(true)
			await wait_frames(3)
			var area := Vector2(vp.size_2d_override)
			var where := "%s%s" % [size, " left-handed" if left_handed else ""]
			var map_rect := hud.minimap.get_global_rect()
			if size.x > 640:
				assert_true(hud.minimap.visible, "the minimap shows at %s" % where)
				assert_true(map_rect.size.x >= Minimap.PLATE * 0.7, "big enough to read at %s: %.0f px" % [where, map_rect.size.x])
			if not hud.minimap.visible:
				map_rect = Rect2(-100, -100, 1, 1)
			assert_true(Rect2(Vector2.ZERO, area).encloses(map_rect) or not hud.minimap.visible, "the minimap is on screen at %s: %s" % [where, map_rect])
			assert_false(hud.jobs_button.get_global_rect().intersects(menu.pause_button.get_global_rect()), "JOBS is not under PAUSE at %s" % where)
			assert_false(map_rect.intersects(hud.jobs_button.get_global_rect()), "the map is not under JOBS at %s" % where)
			assert_false(map_rect.intersects(menu.pause_button.get_global_rect()), "nor under PAUSE at %s" % where)
			for layout: Dictionary in [ControlsLayout.foot(area, settings), ControlsLayout.driving(area, settings)]:
				for key: Variant in ControlsLayout.buttons_of(layout):
					assert_false(map_rect.intersects(layout[key] as Rect2), "the map is clear of %s at %s" % [key, where])
			settings.set_left_handed(was)
			vp.queue_free()
			await wait_frames(1)
	return true


# --- The marker on the ground ------------------------------------------------------------------

func _beacon() -> MissionBeacon:
	var b := MissionBeacon.new()
	root.add_child(b)
	var cam := Camera3D.new()
	root.add_child(cam)
	cam.current = true
	cam.global_position = Vector3(0, 1.7, 0)
	return b


func test_the_beacon_says_what_it_is_in_words_shape_and_colour() -> bool:
	var b := _beacon()
	await wait_frames(1)
	var kinds := {}
	for k in MarkerKind.ALL:
		b.place_at(Vector3(0, 0, -120), 6.0, k, MarkerKind.colour_of(k), MarkerKind.label_of(k), 120.0)
		assert_eq(b.label_text, "%s - 120 m" % MarkerKind.label_of(k), "%s: the words and the distance" % k)
		assert_true(b.icon.get_child_count() >= 1, "%s has an icon" % k)
		assert_true(b.label.visible and b.icon.visible and b.beam.visible, "%s: label, icon and beam" % k)
		var shape := ""
		for ch in b.icon.get_children():
			shape += ch.get_class() + ((ch as MeshInstance3D).mesh.get_class() if ch is MeshInstance3D else "")
		kinds[shape] = true
	assert_true(kinds.size() >= 5, "kinds differ by shape, not only by colour: %d shapes" % kinds.size())
	b.place_at(Vector3(0, 0, -420), 6.0, &"pickup", MarkerKind.colour_of(&"pickup"), "Pick up", 420.0)
	assert_eq(b.label_text, "Pick up - 420 m", "the example from the brief")
	b.free()
	return true


func test_the_ring_shows_only_when_near_and_is_a_thin_ring_not_a_disc() -> bool:
	var b := _beacon()
	await wait_frames(1)
	b.place_at(Vector3(0, 0, -300), 8.0, &"mission", MarkerKind.colour_of(&"mission"), "Mission", 300.0)
	assert_false(b.ring.visible, "no ring from 300 m")
	b.place_at(Vector3(0, 0, -30), 8.0, &"mission", MarkerKind.colour_of(&"mission"), "Mission", 30.0)
	assert_true(b.ring.visible, "a ring at 30 m")
	var torus := b.ring.mesh as TorusMesh
	assert_true(torus != null and torus.inner_radius > 0.9, "a thin ring: the middle is open")
	assert_near(b.ring.scale.x, 8.0, 0.001, "the real size of the target")
	b.place_at(Vector3(0, 0, -90), 8.0, &"mission", MarkerKind.colour_of(&"mission"), "Mission", 90.0)
	assert_false(b.ring.visible, "gone by 90 m")
	b.clear()
	assert_false(b.shown() or b.beam.visible or b.label.visible, "cleared")
	b.free()
	return true


func test_a_far_target_still_has_a_beam_pointing_the_right_way() -> bool:
	var b := _beacon()
	await wait_frames(1)
	b.place_at(Vector3(3000, 0, 0), 6.0, &"dropoff", MarkerKind.colour_of(&"dropoff"), "Drop off", 3000.0)
	var d := Vector2(b.beam.global_position.x, b.beam.global_position.z).length()
	assert_near(d, MissionBeacon.SHOW_LIMIT, 1.0, "drawn at the edge of the camera's range")
	assert_true(b.beam.global_position.x > 900.0 and absf(b.beam.global_position.z) < 1.0, "in the direction of the target")
	assert_eq(b.label_text, "Drop off - 3.0 km", "with the true distance")
	assert_false(b.ring.visible, "no ring at a clamped spot")
	assert_true(b.beam.scale.x >= 3.0, "wide enough to read at 1 km: %.1f m" % b.beam.scale.x)
	b.free()
	return true


func test_places_you_can_enter_are_labelled_and_none_is_a_filled_disc() -> bool:
	var b := _beacon()
	await wait_frames(1)
	var places: Array[Dictionary] = [{"position": Vector3(10, 0, 10), "radius": 3.0, "name": "Sugam Hospital"}]
	b.set_entrances(places)
	var entrance := b.get_node("Entrance0") as Node3D
	assert_true(entrance.visible, "shown")
	assert_eq((entrance.get_node("Label") as Label3D).text, "Sugam Hospital", "named")
	var ring := entrance.get_node("Ring") as MeshInstance3D
	assert_true((ring.mesh as TorusMesh).inner_radius > 0.9, "a ring, not a disc")
	assert_true(ring.scale.x <= 3.0, "small")
	b.set_entrances([] as Array[Dictionary])
	assert_false(entrance.visible, "hidden when none is near")
	b.free()
	return true


func test_the_layer_draws_places_only_within_a_short_walk() -> bool:
	await wait_frames(6)
	g.put_player(2000.0, 2000.0)
	await wait_frames(4)
	var hidden := true
	for ch in g.layer.beacon.get_children():
		if ch.name.begins_with("Entrance") and (ch as Node3D).visible:
			hidden = false
	assert_true(hidden, "no place rings from afar")
	var home := g.layer.session.content.places[0]
	g.put_player(float(home["x"]) + 5.0, float(home["z"]))
	await wait_frames(6)
	var shown := 0
	for ch in g.layer.beacon.get_children():
		if ch.name.begins_with("Entrance") and (ch as Node3D).visible:
			shown += 1
	assert_true(shown >= 1, "the place next to you is labelled")
	return true
