extends TestCase
## Buying, entering, furnishing, sleeping in and leaving a real home on the real map (G-233…G-238),
## through the real main scene, headless: the board and the ACTION button, the door, the world
## suspended while inside, the money, the save file, and the way back out.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 120

var main: Main
var layer: HomesLayer
var site: HomeSite


func _start() -> bool:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	main = MAIN.instantiate()
	root.add_child(main)
	if not await wait_until(func() -> bool: return main.state == &"title", LOAD_FRAMES):
		return false
	main.play()
	layer = main.homes
	if not await wait_until(func() -> bool: return layer != null and layer.ready_to_use, 60 * 30):
		return false
	var rig := main.rig
	var hint := layer.data.listings.get_listing("mylapore-1").at
	assert_eq(layer.sites.size(), 0, "nothing is looked up before the player is near")
	rig.place(WorldOrigin.to_scene(hint, 0.05), 0.0)
	main.world.look_at_world(hint, 0.0)
	if not await main.world.wait_ready_around(hint, 60.0):
		return false
	# Coming near starts the lookup by itself (on a worker).
	if not await wait_until(func() -> bool: return layer.sites.has("mylapore-1"), 60 * 20):
		return false
	site = layer.sites["mylapore-1"]
	assert_false(layer.sites.has("anna-nagar-1"), "a home across the city is not looked up")
	rig.place(WorldOrigin.to_scene(site.stand, 0.05), site.yaw_in)
	main.world.look_at_world(site.stand, site.yaw_in)
	return await main.world.wait_ready_around(site.stand, 60.0)


func test_a_home_can_be_bought_entered_furnished_slept_in_and_left() -> bool:
	assert_true(await _start(), "the game started and the homes are ready")
	assert_true(layer.sites.has("mylapore-1"), "the home by the player was found on the map")
	var rig := main.rig
	var session := (main.find_child("MissionsLayer", false, false) as MissionsLayer).session
	var ctx := rig.controls.action_context
	await wait_physics_frames(30)
	# At the door the ACTION button offers BUY with the price, dimmed while the player is too poor.
	assert_eq(ctx.label(), "BUY · ₹9,000", "BUY with the old house's price")
	assert_false(ctx.best_enabled(), "dimmed: ₹0 in the pocket")
	ctx.trigger()
	assert_false(layer.state.owns(site.id()), "pressing it too poor buys nothing")
	session.runner.earn(15000)
	assert_true(ctx.best_enabled(), "enabled with enough money")
	assert_true(ctx.trigger(), "BUY")
	assert_true(layer.state.owns(site.id()), "bought")
	assert_eq(session.runner.balance(), 6000, "9,000 paid")
	assert_eq(ctx.label(), "ENTER", "ENTER is offered now")
	# The board turns into MY HOME (made once the street is in and the player is near).
	assert_true(await wait_until(func() -> bool: return layer.views.has(site.id()), 120), "the site's board is up")
	# Saved at once, in its own section.
	var saved := SaveStore.new().read().section(HomeState.SAVE_KEY) as Dictionary
	assert_true(saved != null and (saved["owned"] as Dictionary).has(site.id()), "the purchase is in the save file")
	# Too far away: nothing is offered.
	rig.place(WorldOrigin.to_scene(site.stand + site.normal * 30.0, 0.05), site.yaw_in)
	await wait_physics_frames(10)
	assert_eq(ctx.label(), "", "away from the door the button has nothing for this home")
	rig.place(WorldOrigin.to_scene(site.stand, 0.05), site.yaw_in)
	await wait_physics_frames(10)
	# ENTER: the door opens, the player walks to it, the world is put away, the room is made.
	GameLoop.clock.hour = 10.0
	ctx.trigger()
	assert_eq(layer.phase, &"entering", "walking to the door")
	assert_true(await wait_until(func() -> bool: return layer.interior != null and not layer._busy, 60 * 20), "inside")
	assert_eq(main.state, &"home", "the game is in the home state")
	assert_false(main.world.visible, "the street is not drawn")
	assert_eq(main.world.process_mode, Node.PROCESS_MODE_DISABLED, "and not simulated: no traffic, no AI, no streaming")
	assert_true(layer.interior.camera.current, "the interior's camera is the view")
	assert_true(layer.interior.figure != null and layer.interior.figure.get_parent() == layer.interior.actor, "the player's own cast model is in the room")
	assert_false(main.hud.visible, "the street's HUD is hidden")
	assert_false(get_tree_paused(), "the tree itself is not paused: the clock and sound go on")
	var before := GameLoop.clock.hour
	await wait_physics_frames(60)
	assert_true(GameLoop.clock.hour != before, "game time runs inside")
	assert_true(await wait_until(func() -> bool: return layer.interior.walker.arrived(), 60 * 10), "the person walked in")
	var labels: PackedStringArray = []
	for c in layer.hud.context.candidates():
		labels.append(c.label)
	assert_true(labels.has("FURNISH") and labels.has("SLEEP"), "FURNISH and SLEEP are offered inside (%s)" % ", ".join(labels))
	assert_true(HomeRules.PEACE_ZONE, "a peace zone")
	# Furnish: buy a sofa by the editor's own buttons.
	layer.set_editing(true)
	assert_true(layer.hud.editing, "editor open")
	layer.hud.show_category("Living")
	(layer.hud.find_child("Item_sofa", true, false) as Button).pressed.emit()
	var money := session.runner.balance()
	layer._on_floor_tapped(Vector2(2.5, 2.5))
	assert_eq(session.runner.balance(), money - 225, "the sofa cost 225")
	assert_eq(layer.state.get_home(site.id()).items.size(), 1, "and stands in the home")
	assert_true(layer.selected != null, "it is selected")
	layer.rotate_selected()
	assert_eq(layer.state.get_home(site.id()).items[0].r, 1, "turned")
	layer.remove_selected()
	assert_eq(session.runner.balance(), money - 225 + 112, "half comes back")
	layer.hud.disarm()
	layer.extend_room()
	assert_eq(layer.state.get_home(site.id()).extensions, 1, "a room was built")
	assert_eq(session.runner.balance(), money - 225 + 112 - 1000, "for 1,000")
	layer.set_editing(false)
	# Sleep until morning; it saves.
	layer.sleep()
	assert_true(await wait_until(func() -> bool: return not layer._busy, 60 * 15), "slept")
	assert_near(GameLoop.clock.hour, 7.0, 0.5, "it is morning")
	# Out again: the street, the player at the door's spot, the world back.
	layer.leave()
	assert_true(await wait_until(func() -> bool: return layer.phase == &"street" and not layer._busy, 60 * 30), "back outside")
	assert_eq(main.state, &"play", "play again")
	assert_true(main.world.visible and main.world.process_mode != Node.PROCESS_MODE_DISABLED, "the street is back")
	assert_true(WorldOrigin.to_world(rig.body.global_position).distance_to(site.stand) < 1.0, "the player stands at the door's spot")
	assert_true(rig.body.figure.get_parent() == rig.body, "the model is the player's again")
	assert_true(rig.camera.camera.current, "the street camera is the view")
	assert_true(rig.reads_devices, "the controls work")
	# Reading the save file again gives the same home.
	var back := HomeState.from_save(SaveStore.new().read().section(HomeState.SAVE_KEY), layer.data)
	assert_eq(back.get_home(site.id()).extensions, 1, "the extension survived the save")
	assert_eq(back.current, site.id(), "and it is the current home")
	main.queue_free()
	return true


func get_tree_paused() -> bool:
	return tree.paused


func test_the_police_keep_you_out_and_back_leaves() -> bool:
	assert_true(await _start(), "started")
	var session := (main.find_child("MissionsLayer", false, false) as MissionsLayer).session
	session.runner.earn(20000)
	layer.state.buy(site.listing, 20000, layer.data)
	layer.wanted_stars = func() -> float: return 2.0
	layer.enter(site)
	assert_eq(layer.phase, &"street", "with the police about, the door stays shut")
	layer.wanted_stars = func() -> float: return 0.0
	layer.enter(site)
	assert_eq(layer.phase, &"entering", "without them it opens")
	assert_true(await wait_until(func() -> bool: return layer.interior != null and not layer._busy, 60 * 20), "inside")
	layer.set_editing(true)
	main.go_back()
	assert_false(layer.editing, "Back closes the editor first")
	assert_eq(main.state, &"home", "and stays inside")
	main.go_back()
	assert_true(await wait_until(func() -> bool: return layer.phase == &"street" and not layer._busy, 60 * 30), "the second Back leaves")
	assert_eq(main.state, &"play", "play")
	main.queue_free()
	return true
