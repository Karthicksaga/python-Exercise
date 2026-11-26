extends Node
## The work of `combat_play_shots.gd`, loaded once the autoloads exist (a SceneTree script is compiled
## before them, so it cannot name `WorldOrigin`, `Main` or the combat classes). Not a test.

const MAIN := "res://src/app/main.tscn"


func _shot(path: String) -> void:
	for i in 6:
		await get_tree().process_frame
	var image := get_tree().root.get_texture().get_image()
	print("screenshot %s (%dx%d): %s" % [path, image.get_width(), image.get_height(), error_string(image.save_png(path))])


func _wait(frames: int) -> void:
	for i in frames:
		await get_tree().physics_frame


func _stats(cw: CombatWiring, label: String, frames: int) -> void:
	cw.reset_cost()
	var frame_total := 0
	var frame_max := 0
	for i in frames:
		var t := Time.get_ticks_usec()
		await get_tree().physics_frame
		var spent := Time.get_ticks_usec() - t
		frame_total += spent
		frame_max = maxi(frame_max, spent)
	var c := cw.cost_summary()
	print("combat %s: step median %d us, p95 %d us, max %d us; whole physics frame mean %.2f ms, max %.2f ms; %d enemies, %d figures shown" % [label, c["median"], c["p95"], c["max"], frame_total / 1000.0 / frames, frame_max / 1000.0, cw.combat.enemies.size(), cw.fighters.shown()])


func run(out: String) -> void:
	DirAccess.make_dir_recursive_absolute(out.get_base_dir())
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ArmsWiring.DEFAULT_SAVE))
	await get_tree().process_frame
	var main: Main = (load(MAIN) as PackedScene).instantiate()
	get_tree().root.add_child(main)
	for i in 60 * 180:
		if main.state == &"title":
			break
		await get_tree().physics_frame
	main.play()
	await _wait(90)
	var cw := main.combat
	await _stats(cw, "idle", 300)
	cw.combat.hurt(55.0)
	await _shot(out + "_health.png")
	if OS.get_cmdline_user_args().has("--only=wanted"):
		await _wanted(main, cw, out)
		return
	# Stage 7 at Tower Park: the three thugs.
	var layer := main.find_child("MissionsLayer", false, false) as MissionsLayer
	var s := layer.session
	var done: Array[String] = []
	for m in s.content.missions:
		if m.id == "park-trouble":
			break
		done.append(m.id)
	s.store.set_section(SaveStore.PROGRESS, {"completed": done, "money": 3000})
	s.store.write()
	s.reload()
	var o := s.objective()
	var at := WorldOrigin.to_scene_xz(o.x + 2.0, o.z + 14.0, 0.05)
	main.rig.place(at, 0.0)
	for i in 60 * 60:
		if main.world.world_ready_around(Vector2(o.x, o.z)):
			break
		await get_tree().physics_frame
	await _wait(60)
	main.rig.place(WorldOrigin.to_scene_xz(o.x, o.z + 8.0, 0.05), 0.0)
	for i in 60 * 10:
		if cw.combat.enemies.size() >= 3:
			break
		await get_tree().physics_frame
	await _wait(150)
	cw.combat.health = 100.0
	await _stats(cw, "fight (stage 7, three thugs)", 300)
	main.rig.controls.press_hit()
	await _wait(8)
	await _shot(out + "_fight.png")
	await _wanted(main, cw, out)


func _wanted(main: Main, cw: CombatWiring, out: String) -> void:
	var layer := main.find_child("MissionsLayer", false, false) as MissionsLayer
	var s := layer.session
	# Two stars and a police car on its way, back on the street at the start.
	var start: Vector2 = main.world.spawn["point"]
	main.rig.place(WorldOrigin.to_scene_xz(start.x, start.y, 0.05), float(main.world.spawn["heading"]))
	for i in 60 * 60:
		if main.world.world_ready_around(start):
			break
		await get_tree().physics_frame
	s.store.set_section(SaveStore.PROGRESS, {"completed": [], "money": 3000})
	s.store.write()
	s.reload()
	await _wait(10)
	cw.police.set_stars(2)
	var near := {}
	for i in 60 * 120:
		var me := WorldOrigin.to_world(main.rig.body.global_position)
		for c: Dictionary in cw.police.cars():
			if Vector2(float(c["x"]), float(c["z"])).distance_to(me) < 30.0:
				near = c
		if not near.is_empty():
			break
		await get_tree().physics_frame
	# Look at the car (the camera turns; the player stands still).
	if not near.is_empty():
		var me := WorldOrigin.to_world(main.rig.body.global_position)
		var to := Vector2(float(near["x"]), float(near["z"])) - me
		main.rig.camera.yaw = atan2(-to.x, -to.y) + 0.35
		await _wait(20)
	await _stats(cw, "pursuit (two stars)", 120)
	await _shot(out + "_wanted.png")
	print("police cars %s" % [cw.police.cars()])
	get_tree().quit(0)
