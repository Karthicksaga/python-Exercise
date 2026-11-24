extends TestCase
## The game flow (loading screen → title menu → play) through the real main scene, headless.

const MAIN := preload("res://src/app/main.tscn")
## Game-time bound for loading on a slow runner (the work is threaded; frames keep coming).
const LOAD_FRAMES := 60 * 120


func _start() -> Main:
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	return main


func test_loads_then_title_then_play() -> bool:
	var main := _start()
	assert_eq(main.state, &"loading", "starts loading")
	assert_true(main.loading.visible, "loading screen shown")
	var reached := await wait_until(func() -> bool: return main.state != &"loading", LOAD_FRAMES)
	assert_true(reached, "loading finished")
	assert_eq(main.state, &"title", "title menu after loading (no --start=play)")
	assert_eq(main.loading.lit_segments(), Main.STEPS.size(), "every step's segment lit")
	assert_false(main.loading.visible, "loading screen removed")
	assert_true(main.world != null and main.world.ground_ready(), "test world with its ground collider")
	assert_true(main.title.visible and not main.hud.visible, "title shown, HUD hidden")
	assert_eq(main.get_viewport().gui_get_focus_owner(), main.title.find_child("Play", true, false), "PLAY has the focus")
	main.title.show_about()
	assert_contains((main.title.find_child("AboutPage", true, false) as Control).get_child(1).get("text"), main.source.get_data_date().left(10), "ABOUT shows the extract date")
	main.go_back()
	assert_eq(main.get_viewport().gui_get_focus_owner(), main.title.find_child("Play", true, false), "Back from ABOUT returns to the menu")
	(main.title.find_child("Play", true, false) as Button).pressed.emit()
	assert_eq(main.state, &"play", "PLAY starts play")
	assert_true(main.hud.visible and not main.title.visible, "HUD shown")
	await wait_frames(2)
	assert_contains(main.hud.text(), "FPS", "HUD shows FPS")
	# The game reads the regional world (format 2, G-56) when it is installed: 41,188 squares,
	# and the road pieces of the tiles read so far.
	assert_contains(main.hud.text(), "%s chunks" % Main._thousands(main.source.chunk_count()), "HUD shows what the reader loaded")
	assert_true(main.source is RegionalWorldSource and main.source.chunk_count() == 41188, "streams the regional world")
	assert_true(main.rig != null and main.rig.controls.visible and main.world.focus_node == main.rig.body, "the player is in the city and streaming follows them")
	var missions := main.find_child("MissionsLayer", false, false) as MissionsLayer
	assert_true(missions != null and missions.active and missions.hud.visible, "the missions run in play (G-130)")
	assert_contains(missions.hud.objective_label.text, "Walk to the marker", "stage 1 is asked of the player")
	# Back goes one level up (chennai-game-design §3): play → pause menu → title.
	main.go_back()
	assert_eq(main.state, &"paused", "Back during play pauses")
	main.go_back()
	assert_eq(main.state, &"title", "Back from the pause menu returns to the title")
	assert_false(missions.active or missions.hud.visible, "the mission HUD is hidden on the title")
	return true


func test_failed_step_offers_try_again() -> bool:
	var main: Main = MAIN.instantiate()
	main.source = FileWorldSource.new("res://nowhere")
	root.add_child(main)
	var reached := await wait_until(func() -> bool: return main.state == &"failed", LOAD_FRAMES)
	assert_true(reached, "fails")
	assert_contains(main.loading.step_text(), "Reading the map of Chennai", "names the failed step")
	assert_eq(main.get_viewport().gui_get_focus_owner(), main.loading.find_child("Retry", true, false), "TRY AGAIN has the focus")
	main.source = FileWorldSource.new()
	(main.loading.find_child("Retry", true, false) as Button).pressed.emit()
	reached = await wait_until(func() -> bool: return main.state == &"title", LOAD_FRAMES)
	assert_true(reached, "TRY AGAIN with the files present reaches the title")
	return true
