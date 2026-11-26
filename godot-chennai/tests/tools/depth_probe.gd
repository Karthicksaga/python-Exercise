extends SceneTree
## Measures how far the renderer's depth buffer keeps two parallel faces apart (G-500): a red
## quad behind a green one `gap` metres in front of it, facing the camera at distance z; prints the
## share of red pixels (the far face showing through: z-fighting) for each distance, gap and
## near plane. Needs a display:
##
##     xvfb-run -a -s "-screen 0 1280x720x24" godot --path . --audio-driver Dummy \
##       --rendering-method mobile --script res://tests/tools/depth_probe.gd
##
## (or `--rendering-method gl_compatibility --rendering-driver opengl3`). One line per case:
## "depth_probe near=… gap=… z=… red=…%".

const DISTANCES: Array[float] = [25.0, 50.0, 100.0, 150.0, 200.0, 300.0, 450.0]
const GAPS: Array[float] = [0.0, 0.005, 0.03, 0.1]
const NEARS: Array[float] = [0.1, 0.25]


func _initialize() -> void:
	_run.call_deferred()


func _quad(colour: Color) -> MeshInstance3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.albedo_color = colour
	var q := QuadMesh.new()
	q.material = m
	var mi := MeshInstance3D.new()
	mi.mesh = q
	return mi


func _run() -> void:
	var cam := Camera3D.new()
	cam.far = 1500.0
	cam.fov = 60.0
	root.add_child(cam)
	cam.make_current()
	var back := _quad(Color.RED)
	var front := _quad(Color.GREEN)
	root.add_child(back)
	root.add_child(front)
	# The far face is drawn after the near one, so wherever the two depths round to the same value
	# the far face wins the test (reverse-Z compares greater-or-equal): what a phone does at random.
	((back.mesh as QuadMesh).material as StandardMaterial3D).render_priority = 1
	var rd := RenderingServer.get_rendering_device()
	var d24 := false
	if rd != null:
		d24 = rd.texture_is_format_supported_for_usage(RenderingDevice.DATA_FORMAT_D24_UNORM_S8_UINT, RenderingDevice.TEXTURE_USAGE_DEPTH_STENCIL_ATTACHMENT_BIT | RenderingDevice.TEXTURE_USAGE_SAMPLING_BIT)
	print("depth_probe renderer=%s d24s8_supported=%s" % [RenderingServer.get_current_rendering_method(), d24])
	for near in NEARS:
		cam.near = near
		for gap in GAPS:
			for z in DISTANCES:
				# The quads fill a third of the view at every distance, a little turned (a wall seen
				# at an angle), so depth varies across them as on a real facade.
				var size := z * 0.4
				for mi: MeshInstance3D in [back, front]:
					(mi.mesh as QuadMesh).size = Vector2(size, size)
				back.transform = Transform3D(Basis(Vector3.UP, 0.5), Vector3(0, 0, -z))
				front.transform = Transform3D(Basis(Vector3.UP, 0.5), Vector3(0, 0, -z) + Basis(Vector3.UP, 0.5) * Vector3(0, 0, gap))
				for i in 3:
					await process_frame
				var img := root.get_texture().get_image()
				var red := 0
				var any := 0
				for y in range(0, img.get_height(), 2):
					for x in range(0, img.get_width(), 2):
						var c := img.get_pixel(x, y)
						if c.r > 0.5 and c.g < 0.3:
							red += 1
							any += 1
						elif c.g > 0.5 and c.r < 0.3:
							any += 1
				print("depth_probe near=%.2f gap=%.3f z=%.0f red=%.1f%% (of %d face pixels)" % [near, gap, z, 100.0 * red / maxf(1.0, any), any])
	quit(0)
