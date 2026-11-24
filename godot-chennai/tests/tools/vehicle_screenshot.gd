extends SceneTree
## Vehicle screenshots (Compatibility renderer under xvfb; the headless renderer draws nothing):
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 --fixed-fps 60 \
##       --script res://tests/tools/vehicle_screenshot.gd -- --shot=drive --variant=hatchback --out=/tmp/x.png
##
## Shots: `lineup` (every variant parked, seen from the side), `drive` (the variant driven along
## the road at speed with the chase camera and the touch controls), `crash` (the motorbike into
## the wall: the rider mid-air), `windscreen` (the hatchback into the wall at full speed), `door`
## (getting into the variant, the door open). Everything waits in game time.


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var shot := "drive"
	var variant := "hatchback"
	var out := "user://vehicle.png"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			shot = arg.trim_prefix("--shot=")
		elif arg.begins_with("--variant="):
			variant = arg.trim_prefix("--variant=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	await process_frame
	var yard := VehicleYard.new()
	root.add_child(yard)
	await yard.load_player()
	await physics_frame
	match shot:
		"lineup":
			yard.park_all()
			await _frames(40)
			var cam := Camera3D.new()
			yard.add_child(cam)
			cam.fov = 45
			cam.look_at_from_position(Vector3(-40, 2.6, 10), Vector3(-8, 0.7, -1))
			cam.current = true
			yard.rig.controls.visible = false
			yard.controls.visible = false
		"drive":
			var v := yard.spawn(StringName(variant), Vector3(0, 0, 40), 0.0, &"ride")
			await _frames(30)
			yard.driving.enter(v)
			await _until(func() -> bool: return yard.driving.mode() == &"driving", 600)
			yard.driving.gas = true
			yard.controls.gas.press(true)
			var cruise := minf(v.type.spec.max_speed * 0.6, 16.0)
			await _until(func() -> bool: return v.forward_speed() > cruise, 900)
			yard.driving.steer = 0.35
			yard.controls.steer_pad.hold(0.35)
			if v.has_siren():
				yard.driving.press_horn()
			await _frames(25)
		"crash", "windscreen":
			var id := &"motorbike" if shot == "crash" else &"hatchback"
			var v := yard.spawn(id, Vector3(0, 0, 40), 0.0, &"ride")
			await _frames(30)
			yard.driving.enter(v)
			await _until(func() -> bool: return yard.driving.mode() == &"driving", 600)
			yard.driving.gas = true
			await _until(func() -> bool: return yard.driving.mode() == &"thrown", 60 * 40)
			await _until(func() -> bool: return yard.rider.flight.peak_height > 0.6 or yard.rider.knockdown() != &"flying", 120)
			yard.rig.camera.camera.current = false
			var cam := Camera3D.new()
			yard.add_child(cam)
			var at := yard.rider.position()
			cam.look_at_from_position(at + Vector3(5.0, 1.4, 3.2), at + Vector3(0, 0.3, 0))
			cam.current = true
		"door":
			var v := yard.spawn(StringName(variant), Vector3(0, 0, 40), 0.0, &"ride")
			await _frames(30)
			yard.rider.place(v.ground_point(Vector2(3, 1)), 0)
			yard.driving.enter(v)
			await _until(func() -> bool: return v.door() > 0.95 or yard.driving.mode() == &"driving", 600)
			var cam := Camera3D.new()
			yard.add_child(cam)
			cam.look_at_from_position(v.global_transform * Vector3(5.5, 2.2, 4.5), v.global_position)
			cam.current = true
			yard.rig.controls.visible = false
			yard.controls.visible = false
	await _frames(3)
	var image := root.get_texture().get_image()
	var err := image.save_png(out)
	print("screenshot %s (%dx%d, %s): %s" % [out, image.get_width(), image.get_height(), shot, error_string(err)])
	quit(0 if err == OK else 1)


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _until(cond: Callable, max_frames: int) -> void:
	for i in max_frames:
		if cond.call() == true:
			return
		await physics_frame
