extends TestCase
## The live city behind the title (G-164, G-165): the camera drifts over the player (headless) or
## tours a faraway spot (`title_tour`), the chip shows the real place, time and weather, rain
## comes in layers (one draw call each, none when dry), lightning only in a storm and never with
## reduced motion, and CONTINUE hands the city back to the player in game time.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 120

var _hour: float


func before_each() -> void:
	_hour = GameLoop.clock.hour
	Weather.set_raining(false, true, false)


func _restore() -> void:
	GameLoop.clock.hour = _hour
	Weather.set_raining(false, true, false)


func _boot(tour: bool, spot: StringName = &"") -> Main:
	var main: Main = MAIN.instantiate()
	main.title_tour = tour
	main.title_seed = 3
	main.title_spot = spot
	root.add_child(main)
	await wait_until(func() -> bool: return main.state == &"title" or main.state == &"failed", LOAD_FRAMES)
	return main


func test_camera_drifts_over_the_player_and_holds_still_with_reduced_motion() -> bool:
	var main := await _boot(false)
	assert_eq(main.state, &"title", "the title shows")
	var w := main.title_wiring
	assert_true(w != null and w.active and not w.away, "the camera drifts over the player (no tour in headless runs)")
	assert_true(w.camera.current and not main.rig.camera.camera.current, "the title camera is the one that shows")
	w.reduced_motion = false
	w.step(0.0)
	var start := w.camera.global_position
	for i in 200:
		w.step(0.1)
	var moved := w.camera.global_position.distance_to(start)
	assert_true(moved > 1.0 and moved < 30.0, "it drifted slowly (%.1f m in 20 s)" % moved)
	w.reduced_motion = true
	var held := w.camera.global_position
	for i in 50:
		w.step(0.1)
	assert_eq(w.camera.global_position, held, "reduced motion: the camera holds still")
	assert_true(main.title.chip_text().contains(" | "), "the chip has a place and a status (%s)" % main.title.chip_text())
	assert_true(w.stats["max_usec"] < 5000, "the title's own frame work is small (%d us)" % w.stats["max_usec"])
	_restore()
	return true


func test_chip_follows_the_clock_and_the_weather() -> bool:
	var main := await _boot(false)
	var w := main.title_wiring
	GameLoop.clock.hour = 8.5
	Weather.set_raining(false, true, false)
	assert_eq(w.status_text(), "Morning · 08:30 · Clear", "morning, clear")
	GameLoop.clock.hour = 21.5
	Weather.set_raining(true, true, false)
	w.storm = false
	assert_eq(w.status_text(), "Night · 21:30 · Rain", "night, rain")
	w.storm = true
	w.reduced_motion = false
	assert_eq(w.status_text(), "Night · 21:30 · Storm", "a stormy title says so")
	w.reduced_motion = true
	assert_eq(w.status_text(), "Night · 21:30 · Rain", "and says Rain when the flashes are off")
	_restore()
	return true


func test_rain_layers_one_draw_call_each_and_none_when_dry() -> bool:
	var main := await _boot(false)
	var w := main.title_wiring
	w.reduced_motion = false
	assert_eq(w.rain_layers.size(), 2, "two layers beyond the camera's own rain")
	Weather.set_raining(false, true, false)
	w.step(0.016)
	for layer in w.rain_layers:
		assert_false(layer.visible, "dry: no rain, no draw call")
	Weather.set_raining(true, true, false)
	w.step(0.016)
	for layer in w.rain_layers:
		assert_true(layer.visible, "raining: the layer is drawn")
		assert_eq(layer.mesh.get_surface_count(), 1, "one surface: one draw call")
		assert_true(layer.drops <= 1200, "a few drops, not a storm of quads (%d)" % layer.drops)
	_restore()
	return true


func test_lightning_only_in_a_storm_and_never_with_reduced_motion() -> bool:
	var main := await _boot(false)
	var w := main.title_wiring
	w.reduced_motion = false
	Weather.set_raining(true, true, false)
	w.storm = false
	var seen := 0.0
	for i in 400:
		w.step(0.1)
		seen = maxf(seen, w.flash_level())
	assert_eq(seen, 0.0, "no storm, no lightning in 40 s")
	w.storm = true
	for i in 400:
		w.step(0.1)
		seen = maxf(seen, w.flash_level())
	assert_true(seen >= 0.5, "a storm flashes within 40 s (%.2f)" % seen)
	w.bolt()
	assert_true(w.flash_level() >= 0.5, "a bolt starts bright")
	for i in 20:
		w.step(0.1)
	assert_true(w.flash_level() < 0.05, "and fades in about a second (%.2f)" % w.flash_level())
	w.reduced_motion = true
	w.bolt()
	for i in 100:
		w.step(0.1)
	assert_true(w.flash_level() < 0.05, "reduced motion: nothing flashes")
	Weather.set_raining(false, true, false)
	w.reduced_motion = false
	w.storm = true
	seen = 0.0
	for i in 400:
		w.step(0.1)
		seen = maxf(seen, w.flash_level())
	assert_true(seen < 0.05, "dry: no lightning even with a storm drawn")
	_restore()
	return true


func test_tour_streams_the_spot_and_continue_hands_the_city_back() -> bool:
	var main := await _boot(true, &"t_nagar")
	assert_eq(main.state, &"title", "the title shows after the spot has loaded")
	var w := main.title_wiring
	assert_true(w.away and w.spot.id == &"t_nagar", "the camera tours T. Nagar")
	assert_true(main.world.focus_node != main.rig.body, "streaming follows the spot, not the player")
	assert_true(main.life.focus_node == main.world.focus_node, "the traffic and people follow the spot too")
	assert_eq(main.rig.body.process_mode, Node.PROCESS_MODE_DISABLED, "the player stays put while their ground is not loaded")
	assert_true(main.world.world_ready_around(w.spot.target, 100.0), "the streets under the camera are in")
	assert_eq(main.title.chip_text().split(" | ")[0], "T. NAGAR", "the chip names the real place")
	assert_true(w.camera.current, "the title camera shows")
	main.title.primary_row().pressed.emit()
	assert_eq(main.state, &"play", "play starts at once")
	assert_true(w.is_waiting() and main.loading.visible, "the loading screen shows while the player's ground loads")
	assert_true(main.world.focus_node == main.rig.body, "streaming is back on the player")
	var done := await wait_until(func() -> bool: return not w.is_waiting(), LOAD_FRAMES)
	assert_true(done, "the ground under the player loaded (game time)")
	assert_eq(main.rig.body.process_mode, Node.PROCESS_MODE_INHERIT, "the player is let go")
	assert_false(main.loading.visible, "the loading screen goes")
	assert_true(main.rig.camera.camera.current, "the player's camera is back")
	assert_true(main.world.world_ready_around(WorldOrigin.to_world(main.rig.body.global_position), TitleWiring.HANDOFF_RADIUS), "standing on loaded ground")
	_restore()
	return true
