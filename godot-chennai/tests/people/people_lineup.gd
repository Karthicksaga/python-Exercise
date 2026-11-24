## Review renders of the cast (not a test): stands people in a row, poses them in one clip at a
## given time and saves a PNG. Run through tools/run_people_tests.sh --lineup (Compatibility
## renderer under xvfb), e.g.
##   tools/run_people_tests.sh --lineup -- --anim walk --time 0.3 --out /tmp/walk.png --size 1830x824
## Options: --ids a,b,c (default: everyone in the manifest), --anim, --time (seconds),
## --lod 0|1, --spacing m, --yaw degrees (turn the people), --orbit degrees (move the camera
## round them), --out, --size WxH.
extends SceneTree

const PeopleGltf := preload("res://tests/people/people_gltf.gd")


func _initialize() -> void:
	await process_frame
	var args := _parse(OS.get_cmdline_user_args())
	var size_parts: PackedStringArray = String(args.get("size", "1830x824")).split("x")
	var size := Vector2i(int(size_parts[0]), int(size_parts[1]))
	root.size = size
	DisplayServer.window_set_size(size)
	var ids: PackedStringArray = String(args.get("ids", "")).split(",", false)
	var people: Array[Dictionary] = []
	for entry in PeopleGltf.read_manifest():
		if ids.is_empty() or ids.has(String(entry["id"])):
			people.append(entry)
	var world := Node3D.new()
	root.add_child(world)
	_add_lights(world)
	var spacing := float(args.get("spacing", "0.8"))
	var lod := int(args.get("lod", "0"))
	var anim := String(args.get("anim", "idle"))
	var t := float(args.get("time", "0.0"))
	var yaw := deg_to_rad(float(args.get("yaw", "0")))
	var tallest := 0.0
	for i in people.size():
		var entry := people[i]
		var scene := PeopleGltf.load_person(entry)
		if scene == null:
			push_error("could not load %s" % entry["id"])
			continue
		world.add_child(scene)
		scene.position = Vector3((i - (people.size() - 1) / 2.0) * spacing, 0, 0)
		scene.rotation.y = yaw
		PeopleGltf.show_lod(scene, lod)
		var player := PeopleGltf.find_player(scene)
		if player and player.has_animation(anim):
			player.play(anim)
			player.seek(t, true)
			player.pause()
		tallest = maxf(tallest, float(entry.get("heightM", 1.7)))
	var cam := Camera3D.new()
	world.add_child(cam)
	cam.fov = 30.0
	var width := maxf(1.0, people.size() * spacing)
	var aspect := float(size.x) / size.y
	var view_h := maxf(tallest * 1.18, width / aspect * 1.05)
	var dist := view_h / 2.0 / tan(deg_to_rad(cam.fov / 2.0))
	var side := deg_to_rad(float(args.get("orbit", "0")))
	cam.position = Vector3(sin(side) * dist, tallest * 0.55, cos(side) * dist)
	cam.look_at(Vector3(0, tallest * 0.5, 0))
	cam.current = true
	for i in 8:
		await process_frame
	var img := root.get_texture().get_image()
	var out := String(args.get("out", "user://lineup.png"))
	img.save_png(out)
	print("saved %s (%d people, %s at %.2f s)" % [out, people.size(), anim, t])
	quit(0)


func _add_lights(world: Node3D) -> void:
	var env := WorldEnvironment.new()
	var e := Environment.new()
	e.background_mode = Environment.BG_COLOR
	e.background_color = Color(0.62, 0.66, 0.7)
	e.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	e.ambient_light_color = Color(0.85, 0.82, 0.78)
	e.ambient_light_energy = 0.45
	e.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	e.tonemap_white = 6.0
	env.environment = e
	world.add_child(env)
	var sun := DirectionalLight3D.new()
	sun.light_energy = 0.8
	sun.light_color = Color(1.0, 0.95, 0.86)
	sun.shadow_enabled = true
	sun.rotation_degrees = Vector3(-42, 28, 0)
	world.add_child(sun)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(60, 20)
	ground.mesh = plane
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.42, 0.4, 0.37)
	ground.material_override = mat
	world.add_child(ground)


func _parse(args: PackedStringArray) -> Dictionary:
	var out: Dictionary = {}
	var i := 0
	while i < args.size():
		var a := args[i]
		if a.begins_with("--") and i + 1 < args.size():
			out[a.substr(2)] = args[i + 1]
			i += 2
		else:
			i += 1
	return out
