extends TestCase
## The player on foot on the test ground (ports of the Three.js `onfoot.spec.ts` behaviours),
## in game time: the stick walks and runs relative to the camera and stays on the ground, jump
## and gravity, walls stop the player, kerbs and steps are climbed, the camera never ends up in
## geometry and eases (not snaps) round poles, drag-to-look, look-ahead, vehicle hooks.

var ground: PlayerTestGround
var rig: PlayerRig
var body: PlayerController


func before_each() -> void:
	ground = PlayerTestGround.new()
	root.add_child(ground)
	rig = ground.rig
	body = rig.body
	var error := await rig.load_figure()
	check(error == "", "figure loads: %s" % error)
	rig.place(Vector3(0, 0.1, 2), 0.0)
	await wait_physics_frames(30)


## Holds the stick (x right, y forward) for `seconds` of game time, relative to the camera.
func _hold(stick: Vector2, seconds: float, run: bool = false) -> void:
	rig.reads_devices = false
	for i in roundi(seconds * 60.0):
		body.input = PlayerInput.make(stick, rig.camera.yaw, false, run)
		await tree.physics_frame
	body.input = PlayerInput.new()


func _forward(yaw: float) -> Vector3:
	return Vector3(-sin(yaw), 0.0, -cos(yaw))


func test_stick_walks_and_runs_relative_to_the_camera_and_stays_on_the_ground() -> bool:
	assert_true(body.is_on_floor(), "starts on the ground")
	# South of the walls and blocks: open ground in every direction.
	for yaw: float in [0.0, 1.1, -2.4]:
		rig.place(Vector3(0, 0, 18), yaw)
		rig.camera.yaw = yaw
		await wait_physics_frames(5)
		var start := body.global_position
		await _hold(Vector2(0, 0.5), 1.0)
		var walked := body.global_position
		var walk := (walked - start).dot(_forward(yaw))
		assert_true(walk > 0.8 and walk < 3.2, "yaw %.1f: walked %.2f m forward in 1 s" % [yaw, walk])
		var side := absf((walked - start).dot(_forward(yaw).cross(Vector3.UP)))
		assert_true(side < 0.15, "yaw %.1f: walking straight (%.2f m sideways)" % [yaw, side])
		# Stick right goes the camera's right.
		var before_right := body.global_position
		await _hold(Vector2(0.5, 0), 0.6)
		var right := (body.global_position - before_right).dot(_forward(yaw).cross(Vector3.UP))
		assert_true(right > 0.3, "yaw %.1f: stick right moves right (%.2f m)" % [yaw, right])
		rig.place(Vector3(0, 0, 18), yaw)
		await wait_physics_frames(5)
		var from := body.global_position
		await _hold(Vector2(0, 0.5), 1.0)
		var w2 := (body.global_position - from).dot(_forward(yaw))
		var mid := body.global_position
		await _hold(Vector2(0, 1), 1.5)
		var ran := (body.global_position - mid).dot(_forward(yaw))
		assert_true(ran > w2 * 2.5, "yaw %.1f: ran %.2f m in 1.5 s, walked %.2f in 1 s" % [yaw, ran, w2])
		assert_true(absf(body.global_position.y) < 0.08, "yaw %.1f: on the ground (y %.3f)" % [yaw, body.global_position.y])
		assert_true(body.is_on_floor(), "yaw %.1f: grounded" % yaw)
	# The RUN switch runs at any stick travel.
	rig.place(Vector3(0, 0, 2), 0.0)
	rig.camera.yaw = 0.0
	await wait_physics_frames(5)
	await _hold(Vector2(0, 0.4), 1.0, true)
	assert_true(body.speed > PlayerController.RUN_SPEED * 0.9, "RUN with a light stick runs (%.1f m/s)" % body.speed)
	return true


func test_the_figure_faces_the_way_it_walks() -> bool:
	rig.place(Vector3(0, 0, 18), 0.0)
	rig.camera.yaw = 0.7
	await _hold(Vector2(0.6, 0), 1.0)
	var right := _forward(0.7).cross(Vector3.UP)
	var want := atan2(-right.x, -right.z)
	assert_true(absf(wrapf(body.yaw - want, -PI, PI)) < 0.05, "faces the travel (%.2f vs %.2f)" % [body.yaw, want])
	assert_eq(body.figure.gait, "walk", "walk clip while walking")
	await _hold(Vector2(0, 1), 1.0)
	assert_eq(body.figure.gait, "run", "run clip while running")
	await _hold(Vector2.ZERO, 0.8)
	assert_eq(body.figure.gait, "idle", "idle when stopped")
	return true


func test_jump_lifts_the_player_and_gravity_brings_them_back() -> bool:
	rig.reads_devices = false
	assert_true(body.is_on_floor(), "on the ground before jumping")
	body.input = PlayerInput.make(Vector2.ZERO, 0.0, true)
	# physics_frame comes before the step: the jump is read by the step after this wait.
	await wait_physics_frames(2)
	body.input = PlayerInput.new()
	var top := 0.0
	var landed := false
	for i in 180:
		top = maxf(top, body.global_position.y)
		if top > 0.5 and body.is_on_floor():
			landed = true
			break
		await tree.physics_frame
	assert_true(top > 0.9 and top < 1.25, "jump apex %.2f m (7.2 m/s at 24 m/s²: 1.08 m)" % top)
	assert_true(landed, "back on the ground")
	assert_true(absf(body.global_position.y) < 0.1, "landed at %.3f" % body.global_position.y)
	return true


func test_walls_stop_the_player() -> bool:
	# Run east (stick right with the camera facing north) at the wall at x = 6 for long enough.
	rig.place(Vector3(0, 0, 2), 0.0)
	rig.camera.yaw = 0.0
	await wait_physics_frames(5)
	await _hold(Vector2(1, 0), 3.0)
	var x := body.global_position.x
	var face := 6.0 - PlayerController.RADIUS
	assert_true(x < face + 0.02, "stopped at the wall, not through it (x %.3f, face %.3f)" % [x, face])
	assert_true(x > face - 0.2, "reached the wall (x %.3f)" % x)
	# Into the corner (north-east), still never through either wall.
	await _hold(Vector2(1, 1).normalized(), 3.0)
	assert_true(body.global_position.x < face + 0.02 and body.global_position.z > -10.0 + PlayerController.RADIUS - 0.02, "held in the corner at %s" % body.global_position)
	return true


func test_kerbs_and_steps_are_climbed_but_not_ledges() -> bool:
	for case: Array in [["Kerb", 4.0, 0.15, true], ["Step", 0.0, 0.3, true], ["Ledge", -4.0, 0.6, false]]:
		var z: float = case[1]
		rig.place(Vector3(0, 0, z), 0.0)
		rig.camera.yaw = 0.0
		await wait_physics_frames(5)
		# West (stick left), onto the block that spans x -6..-2.
		await _hold(Vector2(-0.6, 0), 2.0)
		var p := body.global_position
		if case[3]:
			assert_true(p.x < -2.6, "%s: walked on (x %.2f)" % [case[0], p.x])
			assert_near(p.y, float(case[2]), 0.04, "%s: standing on top" % case[0])
		else:
			assert_true(p.x > -2.0, "%s: too high to step on (x %.2f)" % [case[0], p.x])
			assert_true(p.y < 0.05, "%s: still on the ground (y %.2f)" % [case[0], p.y])
	return true


func _camera_inside() -> bool:
	var space := body.get_world_3d().direct_space_state
	var q := PhysicsShapeQueryParameters3D.new()
	var probe := SphereShape3D.new()
	probe.radius = 0.1
	q.shape = probe
	q.transform = Transform3D(Basis.IDENTITY, rig.camera.camera.global_position)
	q.collision_mask = FollowCamera.VIEW_MASK
	return not space.intersect_shape(q, 1).is_empty()


func test_camera_never_inside_geometry() -> bool:
	# Back against the east wall and in the corner, the camera swung all the way round and
	# tilted down to the ground: every step, it is clear of every collider.
	var inside := 0
	var steps := 0
	var walled := 0
	for at: Vector3 in [Vector3(5.4, 0, 0), Vector3(5.4, 0, -9.4), Vector3(-1.5, 0, 6.6)]:
		rig.place(at, 0.0)
		await wait_physics_frames(10)
		rig.reads_devices = false
		for i in 240:
			rig.camera.look(9.0, 2.0 if i < 120 else -3.0)
			await tree.physics_frame
			steps += 1
			if _camera_inside():
				inside += 1
			if rig.camera.blocked == &"wall":
				walled += 1
	assert_eq(inside, 0, "steps with the camera inside geometry (of %d)" % steps)
	assert_true(walled > 20, "walls did pull the camera in (%d steps)" % walled)
	return true


func test_camera_eases_round_a_pole_instead_of_snapping() -> bool:
	# Walk past a street-light pole so it crosses between the player and the camera.
	rig.place(Vector3(3.5, 0, 6.0), 0.0)
	rig.camera.yaw = 0.0
	rig.camera.pitch = 0.1
	await wait_physics_frames(20)
	var largest := 0.0
	var thin := 0
	var last := rig.camera.distance
	rig.reads_devices = false
	for i in 150:
		body.input = PlayerInput.make(Vector2(-0.6, 0), rig.camera.yaw)
		await tree.physics_frame
		largest = maxf(largest, absf(rig.camera.distance - last))
		last = rig.camera.distance
		if rig.camera.blocked == &"thin":
			thin += 1
		check(not _camera_inside(), "camera clear of the pole at step %d" % i)
	assert_true(thin > 3, "the pole was seen as a thin obstacle (%d steps)" % thin)
	# An instant pull-in would jump about 4 m in one step; easing keeps every step small.
	assert_true(largest < 0.25, "largest step-to-step change of distance %.3f m" % largest)
	return true


func test_drag_on_the_right_half_turns_the_camera() -> bool:
	var before := rig.camera.yaw
	var pitch := rig.camera.pitch
	var size := tree.root.get_visible_rect().size
	var start := Vector2(size.x * 0.6, size.y * 0.4)
	_touch(7, start, true)
	var steps := 11
	for k in range(1, steps + 1):
		_drag(7, start + Vector2(-286.0, 40.0) * k / steps)
		await tree.physics_frame
	_touch(7, start + Vector2(-286.0, 40.0), false)
	await wait_physics_frames(2)
	var turned := rig.camera.yaw - before
	assert_true(turned > 1.4 and turned < 1.75, "dragging 286 left turned the view %.2f rad" % turned)
	assert_true(rig.camera.pitch > pitch, "dragging down tilts the view up")
	return true


func test_touch_stick_walks() -> bool:
	var size := tree.root.get_visible_rect().size
	var start := Vector2(size.x * 0.15, size.y * 0.7)
	var from := body.global_position
	_touch(3, start, true)
	_drag(3, start + Vector2(0, -28))
	await wait_game_seconds(1.0)
	assert_near(rig.controls.move.y, 0.5, 0.01, "half the stick's travel forward")
	_touch(3, start + Vector2(0, -28), false)
	await wait_physics_frames(2)
	assert_eq(rig.controls.move, Vector2.ZERO, "stick centred when let go")
	var walked := (body.global_position - from).dot(_forward(rig.camera.yaw))
	assert_true(walked > 0.8 and walked < 3.2, "the touch stick walked %.2f m" % walked)
	return true


func test_camera_looks_ahead_when_running() -> bool:
	rig.camera.yaw = 0.0
	await _hold(Vector2(0, 1), 2.0)
	var ahead := (rig.camera.camera.global_basis * Vector3.FORWARD)
	# The view points past the player along the run: the aim is ahead of the feet.
	var to_feet := (body.global_position + Vector3.UP * FollowCamera.LOOK_HEIGHT - rig.camera.camera.global_position).normalized()
	var lead_angle := rad_to_deg(Vector2(ahead.x, ahead.z).angle_to(Vector2(to_feet.x, to_feet.z)))
	assert_true(rig.camera._lead.length() > 0.5, "look-ahead %.2f m at a run" % rig.camera._lead.length())
	print("    look-ahead at a run: %.2f m" % rig.camera._lead.length())
	assert_true(absf(lead_angle) < 30.0, "still framing the player")
	return true


func test_vehicle_hooks_take_the_player_off_their_feet_and_back() -> bool:
	var vehicle := Node3D.new()
	vehicle.position = Vector3(-2, 0, 8)
	ground.add_child(vehicle)
	var seat := Node3D.new()
	seat.position = Vector3(0.3, 0.6, 0.2)
	vehicle.add_child(seat)
	var events: Array[String] = []
	body.entered_vehicle.connect(func(v: Node3D) -> void: events.append("in %s" % v.name))
	body.exited_vehicle.connect(func(v: Node3D) -> void: events.append("out %s" % v.name))
	body.enter_vehicle(vehicle, seat)
	await wait_physics_frames(3)
	assert_false(body.is_on_foot(), "riding")
	assert_eq(body.collision_layer, 0, "no collision while riding")
	assert_true(body.global_position.distance_to(seat.global_position) < 0.001, "follows the seat")
	vehicle.position += Vector3(5, 0, 0)
	await wait_physics_frames(2)
	assert_true(body.global_position.distance_to(seat.global_position) < 0.001, "still on the seat as it moves")
	body.exit_vehicle(Vector3(1, 0, 8), 1.0)
	await wait_physics_frames(10)
	assert_true(body.is_on_foot() and body.is_on_floor(), "back on foot, on the ground")
	assert_eq(body.collision_layer, PlayerController.LAYER_PLAYER, "collides again")
	assert_eq(events, ["in %s" % vehicle.name, "out %s" % vehicle.name], "signals")
	return true


## Events carry window pixels; tests give UI units (the stretch maps one to the other).
func _window(at: Vector2) -> Vector2:
	return tree.root.get_final_transform() * at


func _touch(index: int, at: Vector2, pressed: bool) -> void:
	var e := InputEventScreenTouch.new()
	e.index = index
	e.position = _window(at)
	e.pressed = pressed
	tree.root.push_input(e)


func _drag(index: int, at: Vector2) -> void:
	var e := InputEventScreenDrag.new()
	e.index = index
	e.position = _window(at)
	tree.root.push_input(e)
