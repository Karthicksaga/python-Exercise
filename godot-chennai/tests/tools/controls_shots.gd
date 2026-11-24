extends SceneTree
## Screenshots of the redesigned controls (G-170…G-179), Compatibility renderer under xvfb:
##
##     xvfb-run -a -s "-screen 0 1830x824x24" godot --path . --rendering-method gl_compatibility \
##       --rendering-driver opengl3 --audio-driver Dummy --resolution 915x412 --fixed-fps 60 \
##       --script res://tests/tools/controls_shots.gd -- --shot=foot --out=/tmp/shots/foot.png
##
## Shots: `foot` (stick held, ACTION dimmed), `near` (beside a car: ACTION reads GET IN), `driving`
## (slide-to-steer ring, GAS, BRAKE with its reverse hint, HORN, EXIT, readout), `reverse` (BRAKE
## held when stopped, REVERSE), `lefty` (foot, left-handed, large buttons), `lefty_drive`, `pad`
## (the same screen with the gamepad glyphs), `settings` (the pause menu's controls rows).
## `--hand=left` mirrors any of them.

func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	var shot := "foot"
	var out := "user://controls.png"
	var left := false
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--shot="):
			shot = arg.trim_prefix("--shot=")
		elif arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
		elif arg == "--hand=left":
			left = true
	await process_frame
	var s := ControlSettings.new()
	s.path = "user://controls-shots.json"
	s.left_handed = left or shot.begins_with("lefty")
	if shot == "lefty":
		s.button_size = ControlSettings.SIZE_LARGE
	ControlSettings.reset_shared()
	var yard := VehicleYard.new()
	# The yard builds its controls in _ready; swap their settings once they exist.
	root.add_child(yard)
	await yard.load_player()
	await physics_frame
	yard.rig.controls.settings = s
	yard.controls.settings = s
	var car := yard.spawn(&"hatchback", Vector3(0, 0, 4), 0.0, &"ride")
	await _frames(30)
	match shot:
		"foot", "lefty", "pad":
			yard.rider.place(Vector3(14, 0.05, 20), 0.0)
			yard.rig.place(Vector3(14, 0.05, 20), 0.0)
			await _frames(10)
			_touch(1, Vector2(150, 300), true)
			_drag(1, Vector2(150, 262))
			if shot == "pad":
				DeviceTracker.shared().current = DeviceTracker.Device.PAD
				DeviceTracker.shared().changed.emit(DeviceTracker.Device.PAD)
		"near":
			yard.rider.place(car.ground_point(car.type.entry.point + Vector2(float(car.type.entry.side) * 0.6, 0.0)), 0.0)
			yard.rig.camera.yaw = 0.8
			await _frames(10)
		"driving", "lefty_drive", "reverse":
			yard.driving.enter(car)
			await _until(func() -> bool: return yard.driving.mode() == &"driving", 600)
			if shot == "reverse":
				yard.driving.reverse_on_hold = true
				yard.driving.brake = true
				yard.controls.brake.press(true)
				await _until(func() -> bool: return yard.driving.reverse_hold.reversing, 200)
				await _frames(30)
			else:
				yard.driving.gas = true
				yard.controls.gas.press(true)
				await _until(func() -> bool: return car.forward_speed() > 8.0, 900)
				var at := Vector2(260, 280) if not s.left_handed else Vector2(655, 280)
				_zone_touch(yard.controls.steer_pad, at, true)
				_zone_drag(yard.controls.steer_pad, at + Vector2(45, 0))
				await _frames(40)
		"settings":
			var menu := PauseMenu.new()
			root.add_child(menu)
			ControlSettingsRows.add_to(menu, s)
			await _frames(3)
			yard.rig.controls.visible = false
			menu.open()
			await _frames(6)
	await _frames(4)
	var image := root.get_texture().get_image()
	var err := image.save_png(out)
	print("screenshot %s (%dx%d, %s): %s" % [out, image.get_width(), image.get_height(), shot, error_string(err)])
	quit(0 if err == OK else 1)


func _touch(index: int, at: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = index
	e.position = root.get_final_transform() * at
	e.pressed = pressed
	root.push_input(e)


func _drag(index: int, at: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = index
	e.position = root.get_final_transform() * at
	root.push_input(e)


func _zone_touch(zone: SteerZone, at: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = 2
	e.position = at - zone.global_position
	e.pressed = pressed
	zone._gui_input(e)


func _zone_drag(zone: SteerZone, at: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = 2
	e.position = at - zone.global_position
	zone._gui_input(e)


func _frames(n: int) -> void:
	for i in n:
		await process_frame


func _until(cond: Callable, max_frames: int) -> void:
	for i in max_frames:
		if cond.call() == true:
			return
		await physics_frame
