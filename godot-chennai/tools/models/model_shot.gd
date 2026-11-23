extends SceneTree
## Review screenshots of vehicle GLBs in the Compatibility renderer (not a test; output is not
## committed). Loads the files at run time with GLTFDocument, so no project import is needed.
##
##   xvfb-run -a -s "-screen 0 1830x824x24" godot --path godot-chennai --rendering-method gl_compatibility \
##     --rendering-driver opengl3 --audio-driver Dummy --resolution 1830x824 \
##     --script res://tools/models/model_shot.gd -- <out.png> <view> <span_m> <file.glb[@x,z[,yaw[,r:g:b]]]> ...
##
## view: three_quarter | side | front | rear | top | low (low three-quarter); span_m frames the
## camera (about the length of the line-up). A colour applies to the material named `paint`.

const GROUND_COLOR := Color(0.16, 0.155, 0.15)


func _initialize() -> void:
	await process_frame
	var args := OS.get_cmdline_user_args()
	if args.size() < 4:
		push_error("usage: <out.png> <view> <span_m> <file.glb[@x,z,yaw,r:g:b]>...")
		quit(2)
		return
	var out_path: String = args[0]
	var view: String = args[1]
	var span := float(args[2])
	var scene := Node3D.new()
	root.add_child(scene)
	_add_environment(scene)
	var top := 0.0
	for i in range(3, args.size()):
		var spec: String = args[i]
		var parts := spec.split("@")
		var node := _load_glb(parts[0])
		if node == null:
			quit(1)
			return
		scene.add_child(node)
		if parts.size() > 1:
			var p := parts[1].split(",")
			node.position = Vector3(float(p[0]), 0.0, float(p[1]))
			if p.size() > 2:
				node.rotation_degrees.y = float(p[2])
			if p.size() > 3:
				var c := p[3].split(":")
				_paint(node, Color(float(c[0]), float(c[1]), float(c[2])))
		top = maxf(top, _height(node))
		if OS.get_environment("OPEN_DOORS") == "1":
			_open_doors(node)
	var cam := Camera3D.new()
	cam.fov = 40.0
	cam.far = 4000.0
	scene.add_child(cam)
	var h := clampf(top, 1.0, 40.0)
	var target := Vector3(0, h * 0.42, 0)
	var d := span * 1.25 + 2.0
	var eye: Vector3
	match view:
		"side":
			eye = Vector3(d, h * 0.5, 0)
		"front":
			eye = Vector3(0.0, h * 0.55, -d)
		"rear":
			eye = Vector3(0.0, h * 0.6, d)
		"top":
			eye = Vector3(0.01, d * 1.2, 0.0)
		"low":
			eye = Vector3(d * 0.55, h * 0.25, -d * 0.7)
		_:
			eye = Vector3(d * 0.62, h * 0.75 + d * 0.18, -d * 0.72)
	cam.look_at_from_position(eye, target, Vector3.UP if view != "top" else Vector3.FORWARD)
	cam.current = true
	for f in 8:
		await process_frame
	var img := root.get_viewport().get_texture().get_image()
	img.save_png(out_path)
	print("SHOT ", out_path, " ", img.get_width(), "x", img.get_height())
	quit(0)


func _load_glb(path: String) -> Node3D:
	var doc := GLTFDocument.new()
	var state := GLTFState.new()
	var err := doc.append_from_file(path, state)
	if err != OK:
		push_error("cannot load %s (%d)" % [path, err])
		return null
	var scene := doc.generate_scene(state) as Node3D
	_bake_meshes(scene)
	return scene


## GLTFDocument leaves ImporterMeshInstance3D nodes (the editor importer converts them on
## import); turn them into MeshInstance3D so they draw.
static func _bake_meshes(scene: Node) -> void:
	for n in scene.find_children("*", "ImporterMeshInstance3D", true, false):
		var imi := n as ImporterMeshInstance3D
		var mi := MeshInstance3D.new()
		mi.name = imi.name
		mi.transform = imi.transform
		mi.mesh = imi.mesh.get_mesh()
		var parent := imi.get_parent()
		var idx := imi.get_index()
		var kids := imi.get_children()
		for k in kids:
			imi.remove_child(k)
			mi.add_child(k)
		parent.remove_child(imi)
		parent.add_child(mi)
		parent.move_child(mi, idx)
		imi.free()


## OPEN_DOORS=1: swing door_* nodes (hinged at their origin about Y) 65 degrees outwards.
func _open_doors(node: Node) -> void:
	for n in node.find_children("door_*", "", true, false):
		var d := n as Node3D
		d.rotation_degrees.y = 65.0 if d.position.x > 0.0 else -65.0


func _paint(node: Node, color: Color) -> void:
	for n in node.find_children("*", "", true, false):
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			for s in mi.mesh.get_surface_count():
				var mat := mi.mesh.surface_get_material(s) as StandardMaterial3D
				if mat != null and mat.resource_name == "paint":
					var m2 := mat.duplicate() as StandardMaterial3D
					m2.albedo_color = color
					mi.set_surface_override_material(s, m2)


func _height(node: Node) -> float:
	var hi := 0.0
	for n in node.find_children("*", "", true, false):
		if n is MeshInstance3D:
			var mi := n as MeshInstance3D
			var aabb := mi.get_aabb()
			hi = maxf(hi, mi.position.y + aabb.end.y)
	return hi


func _add_environment(scene: Node3D) -> void:
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-38, -140, 0)
	sun.light_color = Color(1.0, 0.9, 0.76)
	sun.light_energy = 1.25
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 200.0
	scene.add_child(sun)
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = Sky.new()
	var sky := ProceduralSkyMaterial.new()
	sky.sky_top_color = Color(0.36, 0.52, 0.72)
	sky.sky_horizon_color = Color(0.82, 0.78, 0.7)
	sky.ground_horizon_color = Color(0.7, 0.66, 0.6)
	env.sky.sky_material = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.8
	env.reflected_light_source = Environment.REFLECTION_SOURCE_SKY
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	var we := WorldEnvironment.new()
	we.environment = env
	scene.add_child(we)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(3000, 3000)
	ground.mesh = plane
	var gm := StandardMaterial3D.new()
	gm.albedo_color = GROUND_COLOR
	gm.roughness = 0.95
	ground.material_override = gm
	scene.add_child(ground)
