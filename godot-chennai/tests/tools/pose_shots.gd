extends SceneTree
## Screenshots of the procedural poses (G-260…G-266) for the review in `chennai-game-design` §7
## (Compatibility renderer under xvfb; write them to a scratch folder, never the repository):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 --fixed-fps 60 \
##       --script res://tests/tools/pose_shots.gd -- --out=/tmp/poses
##
## Writes `<out>/seat_<variant>[_xray].png` (the driver seated; x-ray hides the body so the pose
## shows inside cars and buses, with markers on the grips and footrests), `steer_<variant>.png`,
## `fare_<variant>[_xray].png` (two passengers seated), `walk_<n>.png`, `run_<n>.png` (side view
## through a stride), `fall_<phase>.png` (a throw: mid-air, lying, sitting up, crouching, one
## knee). Optional `--only=seat,steer,fare,walk,run,fall`. Everything waits in game time.

var out := "user://poses"
var only := PackedStringArray()
var yard: VehicleYard
var cam: Camera3D


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg.begins_with("--only="):
			only = arg.trim_prefix("--only=").split(",")
	DirAccess.make_dir_recursive_absolute(out)
	await process_frame
	yard = VehicleYard.new()
	root.add_child(yard)
	await yard.load_player()
	yard.rig.controls.visible = false
	yard.controls.visible = false
	cam = Camera3D.new()
	cam.fov = 40
	yard.add_child(cam)
	await _frames(5)
	if _want("seat"):
		for variant: StringName in [&"auto", &"motorbike", &"hatchback", &"bus"]:
			await _seat(variant)
	if _want("steer"):
		for variant: StringName in [&"auto", &"hatchback"]:
			await _steer(variant)
	if _want("fare"):
		for variant: StringName in [&"auto", &"hatchback"]:
			await _fare(variant)
	if _want("walk"):
		await _gait("walk", 1.6)
	if _want("run"):
		await _gait("run", 6.2)
	if _want("fall"):
		await _fall()
	quit()


func _want(what: String) -> bool:
	return only.is_empty() or only.has(what)


func _frames(n: int) -> void:
	for i in n:
		await physics_frame
	await process_frame


func _until(cond: Callable, max_frames: int) -> void:
	for i in max_frames:
		if cond.call() == true:
			return
		await physics_frame


func _shot(name: String) -> void:
	cam.current = true
	await process_frame
	await process_frame
	var path := out.path_join(name + ".png")
	root.get_viewport().get_texture().get_image().save_png(path)
	print("wrote ", path)


func _board(v: Vehicle) -> void:
	yard.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
	await _frames(1)
	yard.driving.enter(v)
	await _until(func() -> bool: return yard.driving.mode() == &"driving", 600)
	await _frames(20)


func _leave() -> void:
	yard.driving.steer = 0.0
	yard.driving.exit()
	await _until(func() -> bool: return yard.driving.mode() == &"foot" and yard.driving.boarding == null, 600)


## Small spheres on the given scene points (grips, footrests).
func _markers(points: Array[Vector3]) -> Node3D:
	var n := Node3D.new()
	yard.add_child(n)
	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(1.0, 0.2, 0.6)
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	for p in points:
		var m := MeshInstance3D.new()
		var s := SphereMesh.new()
		s.radius = 0.02
		s.height = 0.04
		s.material = mat
		m.mesh = s
		n.add_child(m)
		m.global_position = p
	return n


func _look_at_side(v: Vehicle, distance: float, height: float, ahead: float = 0.0) -> void:
	var seat := v.rider_transform()
	var side := -v.global_basis.x * float(v.type.entry.side) if v.type.entry.side != 0 else -v.global_basis.x
	var target := seat.origin + Vector3(0, 0.1, 0) - v.global_basis.z * ahead
	cam.look_at_from_position(target + side * distance + Vector3(0, height, 0) + v.global_basis.z * distance * 0.35, target)


func _seat(variant: StringName) -> void:
	var v := yard.spawn(variant, Vector3(0, 0, 20), 0.0, &"ride")
	await _frames(30)
	await _board(v)
	var far := 3.2 if variant != &"bus" else 4.5
	_look_at_side(v, far, 0.6)
	await _shot("seat_%s" % variant)
	var seat := v.rider_transform()
	var pose := v.type.pose
	var pts: Array[Vector3] = []
	for side in 2:
		var m := Vector3(-1 if side == 0 else 1, 1, 1)
		pts.append(seat * (pose.hand * m))
		pts.append(seat * (pose.foot * m))
	var marks := _markers(pts)
	v.model.visible = false
	await _shot("seat_%s_xray" % variant)
	# From the front three-quarter too.
	cam.look_at_from_position(seat.origin - v.global_basis.z * 2.6 + v.global_basis.x * 1.4 + Vector3(0, 0.5, 0), seat.origin + Vector3(0, 0.15, 0))
	await _shot("seat_%s_xray_front" % variant)
	v.model.visible = true
	marks.queue_free()
	await _leave()
	v.queue_free()
	await _frames(5)


func _steer(variant: StringName) -> void:
	var v := yard.spawn(variant, Vector3(0, 0, 20), 0.0, &"ride")
	await _frames(30)
	await _board(v)
	yard.driving.steer = -1.0
	await _frames(40)
	var seat := v.rider_transform()
	cam.look_at_from_position(seat.origin - v.global_basis.z * 2.4 + v.global_basis.x * 0.9 + Vector3(0, 0.6, 0), seat.origin + Vector3(0, 0.2, 0))
	if variant != &"auto":
		v.model.visible = false
	await _shot("steer_%s" % variant)
	v.model.visible = true
	await _leave()
	v.queue_free()
	await _frames(5)


func _fare(variant: StringName) -> void:
	var v := yard.spawn(variant, Vector3(0, 0, 20), 0.0, &"ride")
	await _frames(30)
	var figures := FareFigures.new()
	yard.add_child(figures)
	var kerb := v.global_position + Vector3(-3, 0, 0)
	var fare := {"stop": FareStop.new(MissionData.Fare.make(0, 2, kerb.x, kerb.z), String(v.type.kind))}
	for i in 600:
		figures.show_scene(1.0 / 60.0, fare, {}, v, 0.0)
		var ready := figures._figures.size() >= 2 and figures._figures[0] != null and figures._figures[1] != null and figures._figures[1].is_ready()
		if ready and i > 30:
			break
		await physics_frame
	for i in 10:
		figures.show_scene(1.0 / 60.0, fare, {}, v, 0.0)
		await physics_frame
	var slot: Vector3 = figures.people[0]["slot"]
	var seat := FareFigures.seat_transform(v, slot)
	cam.look_at_from_position(seat.origin - v.global_basis.x * 3.2 + v.global_basis.z * 0.8 + Vector3(0, 0.5, 0), seat.origin + Vector3(0, 0.1, 0))
	await _shot("fare_%s" % variant)
	v.model.visible = false
	await _shot("fare_%s_xray" % variant)
	v.model.visible = true
	figures.queue_free()
	v.queue_free()
	await _frames(5)


func _gait(name: String, speed: float) -> void:
	var body := yard.rig.body
	body.set_physics_process(false)
	var f := body.figure
	f.global_position = Vector3(0, 0, -30)
	f.rotation = Vector3.ZERO
	cam.look_at_from_position(Vector3(-3.6, 1.05, -30), Vector3(0, 0.9, -30))
	for i in 120:
		f.advance(1.0 / 60.0, speed, true)
	var length := 1.0 / maxf(0.1, speed / (HumanFigure.WALK_CLIP_SPEED * f.clip_length("walk")) if name == "walk" else speed / (HumanFigure.RUN_CLIP_SPEED * f.clip_length("run")))
	for k in 4:
		for i in roundi(length * 60.0 / 4.0):
			f.advance(1.0 / 60.0, speed, true)
		await _shot("%s_%d" % [name, k])
	cam.look_at_from_position(Vector3(-2.2, 1.2, -32.6), Vector3(0, 0.95, -30))
	await _shot("%s_front" % name)
	body.set_physics_process(true)


func _fall() -> void:
	var body := yard.rig.body
	body.set_physics_process(false)
	var f := body.figure
	f.global_position = Vector3(0, 0, -30)
	f.rotation = Vector3.ZERO
	f.advance(1.0 / 60.0, 0.0, true)
	cam.look_at_from_position(Vector3(-3.8, 1.2, -30.4), Vector3(0, 0.5, -30.4))
	f.play_fall(Vector3(0, 3.0, -9.0))
	for i in 20:
		f.advance(1.0 / 60.0, 0.0, true)
	await _shot("fall_air")
	f.play_landed()
	for i in 80:
		f.advance(1.0 / 60.0, 0.0, true)
	await _shot("fall_lying")
	cam.look_at_from_position(Vector3(-2.0, 2.2, -32.0), Vector3(0, 0.2, -30.3))
	await _shot("fall_lying_above")
	cam.look_at_from_position(Vector3(-3.8, 1.2, -30.4), Vector3(0, 0.5, -30.4))
	f.play_getup()
	var marks: Array[Array] = [["situp", 0.25], ["crouch", 0.5], ["kneel", 0.7], ["standing", 1.05]]
	var t := 0.0
	for m: Array in marks:
		while t < float(m[1]) * Knockdown.GETUP_TIME:
			f.advance(1.0 / 60.0, 0.0, true)
			t += 1.0 / 60.0
		await _shot("fall_%s" % m[0])
	body.set_physics_process(true)
