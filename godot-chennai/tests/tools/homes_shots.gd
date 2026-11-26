extends SceneTree
## Screenshots and render numbers of the homes in the real city (G-233…G-238): a home for sale
## with its board, the BUY prompt, MY HOME, walking through the open door, the interior by day
## and at night, the furnish editor, a furnished room, an extension. Needs a display (xvfb,
## Compatibility):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/homes_shots.gd -- --out=/tmp/shots/h915 [--home=velachery-2]
##
## Everything goes through the layers' public API, in game time, on a throwaway save file. Prints
## "homes_shot <name> draw_calls=… primitives=…" for each picture (the report's numbers).

const MAIN := "res://src/app/main.tscn"

var main: Node
var layer: Node
var out := "user://homes"


func _initialize() -> void:
	_run.call_deferred()


func _frames(n: int) -> void:
	for i in n:
		await physics_frame


func _shot(name: String, settle: int = 10) -> void:
	for i in settle:
		await process_frame
	var image := root.get_texture().get_image()
	var draws := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_DRAW_CALLS_IN_FRAME)
	var prims := RenderingServer.get_rendering_info(RenderingServer.RENDERING_INFO_TOTAL_PRIMITIVES_IN_FRAME)
	var path := "%s_%s.png" % [out, name]
	print("homes_shot %s draw_calls=%d primitives=%d (%dx%d) %s" % [name, draws, prims, image.get_width(), image.get_height(), error_string(image.save_png(path))])


func _wait_for(cond: Callable, max_frames: int) -> bool:
	for i in max_frames:
		if cond.call():
			return true
		await physics_frame
	return false


func _run() -> void:
	var home_id := "velachery-2"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--home="):
			home_id = arg.trim_prefix("--home=")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	await process_frame
	main = (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	if not await _wait_for(func() -> bool: return main.get("state") == &"title", 60 * 180):
		printerr("no title")
		quit(1)
		return
	main.call("play")
	await _frames(60)
	layer = main.get("homes")
	if not await _wait_for(func() -> bool: return layer.get("ready_to_use") == true, 60 * 30):
		printerr("homes not ready")
		quit(1)
		return
	var rig0: Node = main.get("rig")
	var world0: Node = main.get("world")
	var origin0 := root.get_node("/root/WorldOrigin")
	var data0: HomeData = layer.get("data")
	var hint := data0.listings.get_listing(home_id).at
	rig0.call("place", origin0.call("to_scene", hint, 0.05), 0.0)
	world0.call("look_at_world", hint, 0.0)
	await world0.call("wait_ready_around", hint, 60.0)
	var site: Object = await layer.call("resolve_now", home_id)
	var stand: Vector2 = site.get("stand")
	var normal: Vector2 = site.get("normal")
	var yaw_in: float = site.get("yaw_in")
	var rig: Node = main.get("rig")
	var world: Node = main.get("world")
	var session: MissionSession = layer.get("session")
	session.runner.earn(30000)
	var origin := root.get_node("/root/WorldOrigin")
	var clock: GameClock = root.get_node("/root/GameLoop").get("clock")
	clock.hour = 10.0
	# 1. The board from the street, six metres out.
	var back := stand + normal * 5.5 - Vector2(-normal.y, normal.x) * 1.5
	rig.call("place", origin.call("to_scene", back, 0.05), yaw_in)
	world.call("look_at_world", back, yaw_in)
	await world.call("wait_ready_around", stand, 60.0)
	await _frames(90)
	await _shot("1_for_sale")
	# 2. At the door: BUY with its price.
	rig.call("place", origin.call("to_scene", stand, 0.05), yaw_in)
	await _frames(60)
	await _shot("2_buy_prompt")
	var controls: Object = rig.get("controls")
	var ctx: ActionContext = controls.get("action_context")
	print("homes_shot action=%s enabled=%s" % [ctx.label(), ctx.best_enabled()])
	# 3. Bought: the board reads MY HOME and ENTER is offered.
	controls.call("press_action")
	await _frames(30)
	print("homes_shot action=%s" % ctx.label())
	await _shot("3_my_home")
	# 4. ENTER: the door opens and the player walks to it.
	controls.call("press_action")
	await _frames(54)
	await _shot("4_through_the_door", 1)
	if not await _wait_for(func() -> bool: return layer.get("interior") != null and layer.get("_busy") == false, 60 * 20):
		printerr("never got inside")
		quit(1)
		return
	await _wait_for(func() -> bool: return ((layer.get("interior") as Object).get("walker") as HomeWalker).arrived(), 60 * 10)
	# 5. Inside by day, empty; the same at night.
	await _shot("5_inside_day")
	clock.hour = 21.5
	await _frames(40)
	await _shot("6_inside_night")
	clock.hour = 10.0
	await _frames(40)
	# 6. The editor with its tabs.
	layer.call("set_editing", true)
	await _frames(30)
	await _shot("7_editor_tabs")
	# 7. Furnish: pieces from several categories through the editor's own rules.
	var hud: CanvasLayer = layer.get("hud")
	var plan: Array = [["Living", "sofa", Vector2(2.5, 2.5)], ["Living", "ctable", Vector2(2.5, 3.5)], ["Living", "tvunit", Vector2(2.5, 0.5)], ["Bedroom", "cot", Vector2(6.5, 1.5)],
		["Bedroom", "pero", Vector2(7.5, 3.5)], ["Kitchen", "fridge", Vector2(0.5, 3.5)], ["Kitchen", "counter", Vector2(0.5, 4.5)], ["Dining", "dtable", Vector2(4.5, 4.5)],
		["Lighting", "fan", Vector2(3.5, 2.5)], ["Lighting", "pend", Vector2(6.5, 4.5)], ["Lighting", "tube", Vector2(5.5, 0.5)], ["Lighting", "brass", Vector2(1.5, 1.5)],
		["Pooja and decor", "pooja", Vector2(0.5, 0.5)], ["Pooja and decor", "tanjore", Vector2(4.5, 0.5)], ["Pooja and decor", "toran", Vector2(1.5, 0.5)], ["Pooja and decor", "plant", Vector2(7.5, 0.5)],
		["Utility and outdoor", "washer", Vector2(7.5, 5.5)]]
	for step: Array in plan:
		hud.call("show_category", step[0])
		hud.call("_on_item", step[1])
		layer.call("_on_floor_tapped", step[2])
	hud.call("disarm")
	layer.call("_on_armed", "")
	await _frames(30)
	await _shot("8_furnished_day")
	hud.visible = false
	await _shot("8b_furnished_3d_only")
	hud.visible = true
	layer.call("toggle_kolam")
	layer.call("set_wall", "#c9e0e6")
	hud.call("show_category", "Pooja and decor")
	await _frames(20)
	await _shot("9_furnished_wall_kolam")
	clock.hour = 21.5
	await _frames(40)
	await _shot("10_furnished_night")
	clock.hour = 10.0
	# 8. The extension.
	layer.call("extend_room")
	await _frames(30)
	await _shot("11_extension")
	layer.call("set_editing", false)
	await _frames(30)
	await _shot("12_extended_room_view")
	var interior: Object = layer.get("interior")
	print("homes_shot room_triangles=%d" % int(interior.get("triangles")))
	# 9. Sleep, then out.
	layer.call("sleep")
	await _wait_for(func() -> bool: return layer.get("_busy") == false, 60 * 10)
	print("homes_shot slept hour=%.1f money=%d" % [clock.hour, session.runner.balance()])
	layer.call("leave")
	if not await _wait_for(func() -> bool: return layer.get("phase") == &"street" and layer.get("_busy") == false, 60 * 30):
		printerr("never got out")
		quit(1)
		return
	await _frames(60)
	await _shot("13_back_on_the_street")
	quit(0)
