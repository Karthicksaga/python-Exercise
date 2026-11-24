extends RefCounted
## The work of `player_screenshot.gd`, loaded at run time: a `--script` SceneTree compiles its
## own script before the autoloads exist, so anything that names them is loaded from here.

const HUD := "res://src/ui/debug_hud/debug_hud.tscn"

var tree: SceneTree
var ground: PlayerTestGround
var rig: PlayerRig


func _hold(stick: Vector2, frames: int) -> void:
	for i in frames:
		rig.body.input = PlayerInput.make(stick, rig.camera.yaw)
		await tree.physics_frame


func _shot(path: String) -> void:
	for i in 3:
		await tree.process_frame
	var image := tree.root.get_texture().get_image()
	print("screenshot %s (%dx%d): %s" % [path, image.get_width(), image.get_height(), error_string(image.save_png(path))])


func run(scene_tree: SceneTree) -> void:
	tree = scene_tree
	var out := "user://player"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await tree.process_frame
	ground = PlayerTestGround.new()
	tree.root.add_child(ground)
	# Loaded, not preloaded: scripts naming autoloads compile only once they exist.
	tree.root.add_child((load(HUD) as PackedScene).instantiate())
	rig = ground.rig
	rig.reads_devices = false
	var error := await rig.load_figure()
	if error != "":
		printerr(error)
		tree.quit(1)
		return
	# Idle, three-quarter view from behind, by the kerb and poles.
	rig.place(Vector3(1.0, 0.0, 12.0), 0.0)
	rig.camera.yaw = 0.5
	rig.camera.pitch = 0.22
	await _hold(Vector2.ZERO, 90)
	await _shot(out + "_idle.png")
	# Walking across the view, mid-stride.
	rig.camera.yaw = 0.0
	await _hold(Vector2(0.55, 0.15), 50)
	rig.camera.yaw = 0.9
	await _hold(Vector2(0.55, 0.15), 16)
	await _shot(out + "_walk.png")
	# Running.
	rig.place(Vector3(-2.0, 0.0, 22.0), 0.0)
	rig.camera.yaw = 0.0
	await _hold(Vector2(0, 0), 10)
	await _hold(Vector2(0.9, 0.5), 50)
	rig.camera.yaw = 1.0
	await _hold(Vector2(0.9, 0.5), 20)
	await _shot(out + "_run.png")
	# Back to the east wall with the camera between player and wall: pulled in, not through it.
	rig.place(Vector3(3.8, 0.0, 0.0), PI / 2.0)
	rig.camera.yaw = PI / 2.0
	rig.camera.pitch = 0.3
	await _hold(Vector2.ZERO, 60)
	await _shot(out + "_wall.png")
	# Close up from the front: hands, wrists, feet.
	rig.place(Vector3(0.0, 0.0, 14.0), PI)
	rig.camera.reach = 3.2
	rig.camera.yaw = 0.4
	rig.camera.pitch = -0.12
	rig.camera.snap()
	await _hold(Vector2.ZERO, 60)
	await _shot(out + "_closeup.png")
	tree.quit(0)
