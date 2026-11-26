extends TestCase
## Rail lines on the minimap and the full map (G-465), through the real missions layer on the flat
## missions ground, in game time: the minimap gets the railway round the player with the station
## names, the full map draws it all with a legend whose RAIL toggle hides it on both maps (saved),
## the Low preset draws it cheaply, and the toggle fits a phone without covering a control.

const SAVE := "user://test-rail-maps.json"

var g: MissionsGround
var _quality_before: int = -1


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	# Each test starts with the railway shown and the quality the run had (a test that changes
	# them puts them back at its end too).
	MapSettings.shared().set_rail_shown(true)
	if _quality_before >= 0:
		QualitySettings.shared().set_preset(_quality_before)
	_quality_before = QualitySettings.shared().preset
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	g.layer.rail_map = MapRailFeed.build(RailNetwork.load_file())
	await wait_physics_frames(2)


## Puts the player at a world point on the flat ground (no origin shift there) and waits for a
## few minimap refreshes.
func _at(p: Vector2) -> void:
	g.put_player(p.x, p.y)
	await wait_game_seconds(0.35)


func test_the_minimap_draws_the_railway_round_the_player_with_station_names() -> bool:
	await _at(Vector2(-120, 20))  # by Anna Nagar Tower, the Green Line underground
	var m := g.layer.hud.minimap
	assert_true(m.rail != null and m.rail_drawn(), "the railway is on the plate")
	assert_true(m.rail.segment_count() > 0 and m.rail.segment_count() < 400, "only the part round the player (%d segments)" % m.rail.segment_count())
	assert_false(m.rail.kind(&"metro_green").under.is_empty(), "the Green Line's tunnel")
	assert_true(m.rail.kind(&"suburban").lines.is_empty(), "no suburban line in Anna Nagar")
	assert_true(m.rail_labels().has("Anna Nagar Tower"), "the station's name is on the plate: %s" % str(m.rail_labels()))
	assert_true(m.rail_labels().size() <= Minimap.RAIL_NAMES, "a few names at most")
	await _at(Vector2(-700, 1300))  # towards CMBT: the Green Line comes up onto its viaduct
	assert_false(m.rail.kind(&"metro_green").lines.is_empty(), "the Green Line above the ground")
	return true


func test_the_full_map_legend_toggles_the_railway_on_both_maps() -> bool:
	await _at(Vector2(-120, 20))
	var layer := g.layer
	layer.open_map()
	var map := layer.full_map
	await wait_frames(2)
	assert_true(map.rail_drawn(), "the full map draws the railway")
	assert_true(map.rail_button.visible and map.rail_button.text == RailText.MAP_RAIL_ON, "the legend's toggle reads RAIL ON")
	map.rail_button.button_pressed = false
	await wait_frames(1)
	assert_false(MapSettings.shared().rail_shown, "saved off")
	assert_false(map.rail_drawn(), "gone from the full map")
	assert_eq(map.rail_button.text, RailText.MAP_RAIL_OFF, "the toggle says so")
	layer.close_map()
	await wait_game_seconds(0.25)
	assert_false(layer.hud.minimap.rail_drawn(), "and from the minimap")
	assert_true(layer.hud.minimap.rail_labels().is_empty(), "no names either")
	MapSettings.shared().set_rail_shown(true)
	await wait_frames(1)
	assert_true(layer.hud.minimap.rail_drawn(), "back on the minimap")
	assert_true(map.rail_button.button_pressed and map.rail_button.text == RailText.MAP_RAIL_ON, "the toggle follows the option")
	return true


func test_low_quality_draws_the_railway_cheaply() -> bool:
	QualitySettings.shared().set_preset(QualitySettings.LOW)
	await _at(Vector2(-120, 20))
	var m := g.layer.hud.minimap
	assert_true(m.cheap, "the minimap knows the preset")
	assert_true(m.rail_drawn(), "the lines are still drawn")
	assert_true(m.rail_labels().is_empty(), "but no names on Low")
	g.layer.open_map()
	assert_true(g.layer.full_map.cheap, "the full map too")
	g.layer.close_map()
	QualitySettings.shared().set_preset(_quality_before)
	return true


func test_the_rail_toggle_fits_a_phone_and_covers_no_control() -> bool:
	var rail := MapRailFeed.build(RailNetwork.load_file())
	for size: Vector2i in [Vector2i(915, 412), Vector2i(640, 320), Vector2i(1830, 824)]:
		var vp := SubViewport.new()
		vp.size = size
		root.add_child(vp)
		var map := FullMap.new()
		vp.add_child(map)
		map.set_rail(rail, false)
		map.open(Vector2(5537, 708), 0.0, MapRoads.new(), MapRoads.new(), [] as Array[Dictionary])
		await wait_frames(3)
		var screen := Rect2(Vector2.ZERO, Vector2(size))
		var r := map.rail_button.get_global_rect()
		assert_true(screen.encloses(r), "RAIL inside %s" % size)
		assert_true(r.size.x >= 48.0 and r.size.y >= 48.0, "RAIL is a touch target at %s" % size)
		for b: Button in [map.zoom_in_button, map.zoom_out_button, map.recentre_button, map.close_button]:
			assert_false(r.intersects(b.get_global_rect()), "RAIL clear of %s at %s" % [b.name, size])
		# The legend's rows stand above the toggle: they need this much room under the top bar.
		var legend_top := r.position.y - 12.0 - 18.0 * rail.kinds.size()
		assert_true(legend_top > map.close_button.get_global_rect().end.y, "the legend clears the top bar at %s" % size)
		vp.queue_free()
		await wait_frames(1)
	return true
