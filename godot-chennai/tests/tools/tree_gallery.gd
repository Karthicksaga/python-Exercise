extends SceneTree
## Every species of the tree kit side by side, at LOD 0 / 1 / 2, for a look at the models (G-381).
## Needs a display (xvfb, Compatibility renderer), like `city_shot.gd`:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 \
##       --script res://tests/tools/tree_gallery.gd -- --out=/tmp/shots/gallery --species=neem,rain
##
## Writes <out>_<species>.png (one species, three LODs in a row, front view) and, with no
## --species, <out>_all.png: every species at LOD 0 in rows. Nothing is written into the repository.

const SPECIES_DEFAULT := "all"


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var out := "user://gallery"
	var only := PackedStringArray()
	var wind := 0.0
	## --flat: the per-vertex lit variant of the shader (the Low preset).
	var flat := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--species="):
			only = arg.trim_prefix("--species=").split(",")
		elif arg.begins_with("--wind="):
			wind = float(arg.trim_prefix("--wind="))
		elif arg == "--flat":
			flat = true
	await process_frame
	var mat := TreeKit.make_material()
	mat.set_shader_parameter(&"sway", wind)
	if flat:
		mat.shader = CityMaterials.vertex_lit(TreeKit.SHADER)
	var kit := TreeKit.commit(TreeKit.build_models(), mat)
	var world := Node3D.new()
	root.add_child(world)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.62, 0.74, 0.88)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.7, 0.75, 0.85)
	env.ambient_light_energy = 0.7
	var we := WorldEnvironment.new()
	we.environment = env
	world.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 1.1
	world.add_child(sun)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(300, 300)
	ground.mesh = plane
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.5, 0.42, 0.3)
	ground.material_override = gm
	world.add_child(ground)
	var cam := Camera3D.new()
	cam.fov = 40.0
	world.add_child(cam)
	var shots: Array = []
	if only.is_empty():
		shots.append({"name": "all", "species": TreeSpecies.IDS, "lods": [0]})
	else:
		for id in only:
			shots.append({"name": id, "species": [StringName(id)], "lods": [0, 1, 2]})
	for shot: Dictionary in shots:
		for n in world.get_children():
			if n.has_meta(&"plant"):
				n.queue_free()
		await process_frame
		var ids: Array = shot["species"]
		var lods: Array = shot["lods"]
		var x := 0.0
		var spans := 0.0
		for id: StringName in ids:
			for lod: int in lods:
				var w := TreeSpecies.number(id, "width") + 2.0
				var mi := MeshInstance3D.new()
				mi.mesh = kit.mesh_of(id, lod)
				mi.position = Vector3(x + w * 0.5, 0, 0)
				mi.set_meta(&"plant", true)
				world.add_child(mi)
				x += w
		spans = x
		var tall := 3.0
		for id: StringName in ids:
			tall = maxf(tall, TreeSpecies.number(id, "height"))
		if only.is_empty():
			cam.position = Vector3(spans * 0.5, tall * 0.5, spans * 0.8)
			cam.fov = 40.0
		else:
			cam.position = Vector3(spans * 0.5, tall * 0.5, maxf(spans * 0.75, tall * 1.9))
		cam.look_at(Vector3(spans * 0.5, tall * 0.45, 0.0))
		for i in 6:
			await process_frame
		var path := "%s_%s.png" % [out, shot["name"]]
		root.get_texture().get_image().save_png(path)
		print("tree_gallery ", path)
	quit(0)
