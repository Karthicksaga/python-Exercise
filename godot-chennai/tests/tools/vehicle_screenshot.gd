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
## (getting into the variant, the door open), `bump` (a motorbike taps a traffic motorbike at
## 20 km/h: sparks, a wobble, still riding), `fall` (into a parked motorbike at 55 km/h: the rider
## slides off, the bike falls), `wreck` (the hatchback into the wall at 78 km/h, a second later:
## glass on the ground, darker dented paint, smoke), `burst` (the same 0.1 s after the hit). Everything waits in game time.


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
		"bump", "fall":
			var at := Vector3(40, 0, -60)
			var v := yard.spawn(&"motorbike", at + Vector3(0, 0, 8.0), 0.0, &"ride")
			if shot == "fall":
				yard.spawn(&"motorbike", at, PI / 2.0, &"parked")
			else:
				var tv := TrafficVehicleView.make(&"motorbike", 0.3)
				yard.add_child(tv)
				tv.set_pose(at, PI / 2.0, 0.0, 1.0 / 60.0, 5.0)
			await _frames(30)
			yard.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
			await physics_frame
			yard.driving.enter(v)
			await _until(func() -> bool: return yard.driving.mode() == &"driving", 600)
			v.set_speed((20.0 if shot == "bump" else 55.0) / 3.6)
			await _until(func() -> bool: return yard.driving.last_hit != null, 240)
			await _until(func() -> bool: return false, 6 if shot == "bump" else 16)
			print("hit: %s at %.1f km/h" % [yard.driving.last_hit.type if yard.driving.last_hit != null else &"-", yard.driving.last_hit.impact_kmh if yard.driving.last_hit != null else 0.0])
			yard.rig.camera.camera.current = false
			var cam := Camera3D.new()
			yard.add_child(cam)
			cam.look_at_from_position(at + Vector3(5.5, 2.0, 5.5), at + Vector3(0, 0.5, 2.0))
			cam.current = true
		"wreck", "burst":
			var v := yard.spawn(&"hatchback", Vector3(0, 0, VehicleYard.WALL_Z + 8.0), 0.0, &"ride")
			await _frames(30)
			yard.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
			await physics_frame
			yard.driving.enter(v)
			await _until(func() -> bool: return yard.driving.mode() == &"driving", 600)
			v.set_speed(78.0 / 3.6)
			await _until(func() -> bool: return yard.driving.last_crash != null, 240)
			await _until(func() -> bool: return false, 70 if shot == "wreck" else 7)
			yard.rig.camera.camera.current = false
			var cam := Camera3D.new()
			yard.add_child(cam)
			cam.look_at_from_position(v.global_position + Vector3(5.0, 2.2, 4.5), v.global_position + Vector3(0, 0.6, -0.5))
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
