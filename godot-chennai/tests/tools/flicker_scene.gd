extends Node
## The body of `flicker_shots.gd` (G-500), loaded at run time so it compiles after the autoloads.
## See that file for what it records and how to run it.

const CITY := "res://src/game_world/city/city_world.tscn"
const PLACES: Dictionary[String, Vector2] = {
	"t_nagar": Vector2(2543.0, 5160.0),
	"anna_salai": Vector2(4940.0, 2915.0),
	"marina": Vector2(7991.7, 3422.5),
	"mylapore": Vector2(6900.0, 5600.0),
}


func _ready() -> void:
	_run.call_deferred()


func _arg(name: String, fallback: String) -> String:
	for a in OS.get_cmdline_user_args():
		if a.begins_with("--%s=" % name):
			return a.trim_prefix("--%s=" % name)
	return fallback


func _run() -> void:
	var out := _arg("out", "user://flicker")
	DirAccess.make_dir_recursive_absolute(out)
	var preset := ["low", "medium", "high"].find(_arg("preset", "low"))
	var frames := int(_arg("frames", "16"))
	var hour := float(_arg("hour", "10.5"))
	var eye := _arg("eye", "7,3").split(",")
	await get_tree().process_frame
	var weather: Node = get_node("/root/Weather")
	weather.set("settings_path", "user://flicker_shots_weather.json")
	weather.call("set_raining", false, true, false)
	var clock: GameClock = (get_node("/root/GameLoop") as Object).get("clock")
	clock.hours_per_second = 0.0
	clock.hour = hour
	var v := QualitySettings.values(preset)
	TreeQuality.apply(v)
	var source := RegionalWorldSource.new()
	var err := source.open()
	if err != "":
		printerr(err)
		get_tree().quit(1)
		return
	var world := (load(CITY) as PackedScene).instantiate() as CityWorld
	world.road_extras = preset
	get_tree().root.add_child(world)
	err = await world.setup(source)
	if err != "":
		printerr(err)
	world.streamer.kit.tree_species = int(v["tree_species"])
	world.streamer.kit.under_species = int(v["under_species"])
	var wiring := EnvironmentWiring.wire(world)
	world.add_child(wiring)
	var env := wiring.environment
	QualityApplier.apply_viewport(get_tree().root, v)
	QualityApplier.apply_engine(v)
	QualityApplier.apply_materials(world.materials, v)
	world.materials.ground.set_shader_parameter(&"detail", bool(v["ground_detail"]))
	world.materials.trees.set_shader_parameter(&"sway", 0.0)
	QualityApplier.apply_streamer(world.streamer, v)
	QualityApplier.apply_environment(env, v)
	env.rain.density = 0.0
	QualityApplier.apply_sun(env.sun, v, _arg("shadows", "1") != "0")
	# A/B overrides of the viewport: --mipbias=x (texture_mipmap_bias), --fxaa=0|1.
	if _arg("mipbias", "") != "":
		get_tree().root.texture_mipmap_bias = float(_arg("mipbias", "0"))
	if _arg("fxaa", "") != "":
		get_tree().root.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if _arg("fxaa", "") == "1" else Viewport.SCREEN_SPACE_AA_DISABLED
	if _arg("vertex", "") != "":
		world.materials.set_flat(_arg("vertex", "") == "1")
	var place := _arg("place", "spawn")
	var point: Vector2 = world.spawn["point"]
	if PLACES.has(place):
		point = PLACES[place]
	elif place.contains(","):
		point = Vector2(float(place.split(",")[0]), float(place.split(",")[1]))
	var hit := world.nearest_road_point(point)
	point = hit.get("point", point)
	var heading := float(hit.get("heading", 0.0))
	if _arg("heading", "") != "":
		heading += deg_to_rad(float(_arg("heading", "0")))
	world.look_at_world(point, heading)
	var origin: Node = get_node("/root/WorldOrigin")
	var cam: Camera3D = world.camera
	cam.fov = 60.0
	# The game's own near plane (the follow camera's), unless --near overrides it for an A/B.
	var probe := FollowCamera.new()
	cam.near = float(_arg("near", str(probe.camera.near)))
	probe.free()
	QualityApplier.apply_camera(cam, v)
	cam.make_current()
	env.camera = cam
	var forward := Vector3(-sin(heading), 0.0, -cos(heading))
	var focus: Vector3 = origin.call("to_scene", point, 0.0)
	var eye0 := focus - forward * float(eye[0]) + Vector3.UP * float(eye[1])
	var target0 := focus + forward * 30.0 + Vector3.UP * 1.5
	cam.look_at_from_position(eye0, target0, Vector3.UP)
	world.streamer.call("fill_now")
	await world.wait_ready_around(point)
	for i in 30:
		await get_tree().process_frame
	var settings_shadows := env.sun.shadow_enabled
	var vp := get_tree().root
	print("flicker_shots place=%s preset=%s near=%.2f far=%.0f scale=%.2f mipbias=%.2f aa=%d msaa=%d shadows=%s flat=%s chunks=%d" % [place, QualitySettings.NAMES[preset], cam.near, cam.far, vp.scaling_3d_scale, vp.texture_mipmap_bias, vp.screen_space_aa, vp.msaa_3d, str(settings_shadows), str(world.materials.flat), world.streamer.shown_cells().size()])
	# The building mask: the pixels that change when the chunks' building meshes (everything under
	# Near and Far: walls, roofs, shop fronts, objects, packs, far blocks) are hidden, so whatever
	# stands in front of a building (a tree, a pole) is left out.
	await _save(out.path_join("mask_on.png"))
	var hidden: Array[Node3D] = []
	for b in world.streamer.shown_builds():
		if b.view == null:
			continue
		for group: String in ["Near", "Far"]:
			var g := b.view.get_node_or_null(group)
			if g == null:
				continue
			for child in g.get_children():
				var n3 := child as Node3D
				if n3 != null and n3.visible:
					n3.visible = false
					hidden.append(n3)
	await _save(out.path_join("mask_off.png"))
	for n3 in hidden:
		n3.visible = true
	# One mask per layer (mask_<layer>.png: that layer alone hidden), for the metric's breakdown.
	var by_layer: Dictionary[String, Array] = {}
	for n3 in hidden:
		var key := String(n3.name).to_lower()
		if not by_layer.has(key):
			by_layer[key] = []
		by_layer[key].append(n3)
	for key: String in by_layer:
		for n3: Node3D in by_layer[key]:
			n3.visible = false
		await _save(out.path_join("layer_%s.png" % key))
		for n3: Node3D in by_layer[key]:
			n3.visible = true
	for i in 10:
		await get_tree().process_frame
	for move: String in ["static", "walk", "turn"]:
		for i in frames:
			var e := eye0
			var t := target0
			if move == "walk":
				e += forward * 0.02 * i
				t += forward * 0.02 * i
			elif move == "turn":
				t = e + (target0 - eye0).rotated(Vector3.UP, deg_to_rad(0.03 * i))
			cam.look_at_from_position(e, t, Vector3.UP)
			await _save(out.path_join("%s_%02d.png" % [move, i]))
	print("flicker_shots saved %s" % out)
	get_tree().quit(0)


func _save(path: String) -> void:
	await get_tree().process_frame
	await RenderingServer.frame_post_draw
	var img := get_tree().root.get_texture().get_image()
	img.save_png(path)
