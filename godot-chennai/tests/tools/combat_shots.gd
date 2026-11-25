extends SceneTree
## Screenshots of the fight and carry poses (G-430..G-433) for the review in
## `chennai-game-design` §7. Compatibility renderer under xvfb; write them to a scratch folder,
## never the repository:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 --fixed-fps 60 \
##       --script res://tests/tools/combat_shots.gd -- --out=/tmp/combat
##
## Writes punch_*, bat_*, carry_*, weapon_*, puffs_*. Optional `--only=punch,bat,carry,weapon,puffs`.

const DT := 1.0 / 60.0
var out := "user://combat"
var only := PackedStringArray()
var cam: Camera3D
var fig: HumanFigure
var foe: PersonView
var puffs: HitPuffs
var stage: Node3D


func _initialize() -> void:
	_run.call_deferred()


func _want(what: String) -> bool:
	return only.is_empty() or only.has(what)


func _run() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--only="):
			only = arg.trim_prefix("--only=").split(",")
	DirAccess.make_dir_recursive_absolute(out)
	await process_frame
	_stage()
	fig = HumanFigure.new()
	stage.add_child(fig)
	var e := await fig.load_model(PeopleManifest.DEFAULT_PLAYER, PlayerController.HEIGHT)
	print("player: ", e)
	var pool := PeoplePool.new()
	stage.add_child(pool)
	await pool.prepare(PackedStringArray(["it-professional-m"]))
	foe = pool.make_view("it-professional-m")
	stage.add_child(foe)
	foe.position = Vector3(0, 0, -1.55)
	foe.rotation.y = PI
	foe.play(&"idle")
	foe.advance(DT, 2.0)
	puffs = HitPuffs.new()
	puffs.auto_advance = false
	stage.add_child(puffs)
	for i in 30:
		fig.advance(DT, 0.0, true)
		foe.advance(DT, 2.0)
		await physics_frame
	if _want("punch"):
		await _punch()
	if _want("bat"):
		await _bat()
	if _want("carry"):
		await _carry()
	if _want("weapon"):
		await _weapons()
	if _want("puffs"):
		await _puffs()
	quit()


func _stage() -> void:
	stage = Node3D.new()
	root.add_child(stage)
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.62, 0.74, 0.86)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.75, 0.78, 0.82)
	env.ambient_light_energy = 0.9
	var we := WorldEnvironment.new()
	we.environment = env
	stage.add_child(we)
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-50, -35, 0)
	sun.light_energy = 1.1
	stage.add_child(sun)
	var ground := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(40, 40)
	var gm := StandardMaterial3D.new()
	gm.albedo_color = Color(0.45, 0.42, 0.38)
	plane.material = gm
	ground.mesh = plane
	stage.add_child(ground)
	cam = Camera3D.new()
	cam.fov = 38
	stage.add_child(cam)


func _tick(n: int, speed: float = 0.0) -> void:
	for i in n:
		fig.advance(DT, speed, true)
		foe.advance(DT, 2.0)
		puffs.advance(DT)
		await physics_frame


func _shot(name: String) -> void:
	cam.current = true
	await process_frame
	await process_frame
	var path := out.path_join(name + ".png")
	root.get_viewport().get_texture().get_image().save_png(path)
	print("wrote ", path)


func _look(from: Vector3, at: Vector3) -> void:
	cam.look_at_from_position(from, at)


func _to_time(t: float) -> void:
	while fig.is_striking() and fig.strike_time() < t:
		await _tick(1)


func _punch() -> void:
	foe.visible = false
	fig.play_strike(&"jab", 0)
	await _to_time(0.12)
	# Side view (from the figure's left) and a three-quarter front view.
	_look(Vector3(-2.6, 1.35, -0.4), Vector3(0, 1.25, -0.4))
	await _shot("punch_jab_side")
	_look(Vector3(1.4, 1.5, -2.6), Vector3(0, 1.3, -0.2))
	await _shot("punch_jab_front34")
	await _tick(30)
	fig.play_strike(&"cross", 1)
	await _to_time(0.12)
	_look(Vector3(2.6, 1.35, -0.4), Vector3(0, 1.25, -0.4))
	await _shot("punch_cross_side")
	await _tick(30)
	fig.play_strike(&"hook", 0)
	await _to_time(0.12)
	_look(Vector3(1.0, 1.9, -2.4), Vector3(0, 1.3, -0.2))
	await _shot("punch_hook_front34")
	await _tick(30)
	foe.visible = true


func _bat() -> void:
	foe.visible = false
	WeaponModels.attach(fig, &"bat")
	fig.play_strike(&"bat", 1)
	var i := 0
	for t: float in [0.13, 0.22, 0.34, 0.5]:
		await _to_time(t)
		_look(Vector3(2.4, 1.7, -2.4), Vector3(0, 1.15, -0.2))
		await _shot("bat_%d_%03dms" % [i, roundi(t * 1000.0)])
		i += 1
	await _tick(40)
	WeaponModels.detach(fig)
	foe.visible = true


func _carry() -> void:
	foe.visible = false
	fig.carry(true, &"box")
	await _tick(40, 1.6)
	_look(Vector3(2.4, 1.5, -2.6), Vector3(0, 1.1, 0))
	await _shot("carry_box_front34")
	_look(Vector3(3.0, 1.2, 0.0), Vector3(0, 1.1, 0))
	await _shot("carry_box_side")
	fig.carry(true, &"shoulder")
	await _tick(40, 1.6)
	_look(Vector3(2.4, 1.6, -2.4), Vector3(0, 1.3, 0))
	await _shot("carry_shoulder_front34")
	fig.carry(false)
	await _tick(40)
	foe.visible = true


func _weapons() -> void:
	foe.visible = false
	for id: StringName in WeaponModels.IDS:
		WeaponModels.attach(fig, id)
		await _tick(10)
		var hand := fig.to_global(fig.poser.at(PoseRig.HAND[1]))
		_look(hand + Vector3(1.1, 0.35, -0.9), hand)
		await _shot("weapon_%s_hand" % id)
		_look(Vector3(2.4, 1.5, -2.4), Vector3(0, 1.1, 0))
		await _shot("weapon_%s_body" % id)
	WeaponModels.detach(fig)
	foe.visible = true


func _puffs() -> void:
	foe.visible = true
	fig.play_strike(&"cross", 1)
	await _to_time(0.12)
	var at := fig.strike_point()
	puffs.spawn(at, Vector3(0.0, 0.2, 1.0).normalized(), 1.0)
	await _tick(2)
	_look(Vector3(2.0, 1.5, -0.6), at)
	await _shot("puffs_flash_side")
	await _tick(8)
	_look(Vector3(2.4, 1.7, 0.4), at)
	await _shot("puffs_dust_front")
	await _tick(60)
	WeaponModels.attach(fig, &"bat")
	fig.play_strike(&"bat", 1)
	await _to_time(0.22)
	puffs.spawn(fig.strike_point(), Vector3(-0.6, 0.2, 0.8).normalized(), 1.6)
	await _tick(3)
	_look(Vector3(2.8, 1.8, 0.8), fig.strike_point())
	await _shot("puffs_bat_flash")
