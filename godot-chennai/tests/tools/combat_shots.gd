extends SceneTree
## Screenshots of the fight in the real city (G-410…G-429) for the `chennai-game-design` §7
## review, and the fight's main-thread cost (Compatibility renderer under xvfb; write them to a
## scratch folder, never the repository):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/combat_shots.gd -- --out=/tmp/combat/c915
##
## Writes <out>_health.png (hurt: the bar and the edge flash), <out>_fight.png (stage 7's thugs
## at Tower Park), <out>_wanted.png (two stars, a police car pulling up), and prints the combat
## step's cost (µs) idle and in the fight. Uses a throwaway save; everything waits in game time.

const MAIN := "res://src/app/main.tscn"


func _initialize() -> void:
	_run.call_deferred()


func _shot(path: String) -> void:
	for i in 6:
		await process_frame
	var image := root.get_texture().get_image()
	print("screenshot %s (%dx%d): %s" % [path, image.get_width(), image.get_height(), error_string(image.save_png(path))])


func _wait(frames: int) -> void:
	for i in frames:
		await physics_frame


func _stats(cw: CombatWiring, label: String, frames: int) -> void:
	cw.stats["usec_max"] = 0
	cw.stats["usec_total"] = 0
	cw.stats["steps"] = 0
	var frame_total := 0
	var frame_max := 0
	for i in frames:
		var t := Time.get_ticks_usec()
		await physics_frame
		var spent := Time.get_ticks_usec() - t
		frame_total += spent
		frame_max = maxi(frame_max, spent)
	var steps := maxi(1, int(cw.stats["steps"]))
	print("combat %s: step mean %.0f us, max %d us over %d steps; %d enemies, %d figures shown" % [label, float(cw.stats["usec_total"]) / steps, int(cw.stats["usec_max"]), steps, cw.combat.enemies.size(), cw.fighters.shown()])


func _run() -> void:
	var out := "user://combat"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(out.get_base_dir())
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(ArmsWiring.DEFAULT_SAVE))
	await process_frame
	var main: Main = (load(MAIN) as PackedScene).instantiate()
	root.add_child(main)
	for i in 60 * 180:
		if main.state == &"title":
			break
		await physics_frame
	main.play()
	await _wait(90)
	var cw := main.combat
	await _stats(cw, "idle", 300)
	cw.combat.hurt(55.0)
	await _shot(out + "_health.png")
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
		await physics_frame
	await _wait(60)
	main.rig.place(WorldOrigin.to_scene_xz(o.x, o.z + 8.0, 0.05), 0.0)
	for i in 60 * 10:
		if cw.combat.enemies.size() >= 3:
			break
		await physics_frame
	await _wait(150)
	cw.combat.health = 100.0
	await _stats(cw, "fight (stage 7, three thugs)", 300)
	main.rig.controls.press_hit()
	await _wait(8)
	await _shot(out + "_fight.png")
	# Two stars and a police car on its way.
	s.store.set_section(SaveStore.PROGRESS, {"completed": [], "money": 3000})
	s.store.write()
	s.reload()
	await _wait(10)
	cw.police.set_stars(2)
	for i in 60 * 40:
		var cars := cw.police.cars()
		if not cars.is_empty():
			var c: Dictionary = cars[0]
			var me := WorldOrigin.to_world(main.rig.body.global_position)
			if Vector2(float(c["x"]), float(c["z"])).distance_to(me) < 30.0:
				break
		await physics_frame
	await _stats(cw, "pursuit (two stars)", 120)
	await _shot(out + "_wanted.png")
	print("police cars %s" % [cw.police.cars()])
	quit(0)
