extends TestCase
## The player's sounds on the player's test ground, in game time: footsteps at the stride's
## cadence while walking and running, none standing still or in the air, and a landing thud.

var ground: PlayerTestGround
var rig: PlayerRig
var body: PlayerController
var s: SoundSystem
var hooks: PlayerSounds


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path("user://test_player_sounds_save.json"))
	s = SoundSystem.new()
	s.settings_path = "user://test_player_sounds_save.json"
	root.add_child(s)
	ground = PlayerTestGround.new()
	root.add_child(ground)
	rig = ground.rig
	body = rig.body
	rig.reads_devices = false
	hooks = PlayerSounds.new()
	hooks.sound = s
	root.add_child(hooks)
	hooks.follow(body)
	rig.place(Vector3(0, 0.1, 18), 0.0)
	await wait_physics_frames(30)


func _hold(stick: Vector2, seconds: float, run: bool = false, jump: bool = false) -> void:
	for i in roundi(seconds * 60.0):
		body.input = PlayerInput.make(stick, rig.camera.yaw, jump and i == 0, run)
		await tree.physics_frame
	body.input = PlayerInput.new()


func _steps() -> int:
	return int((s.state()["played"] as Dictionary)["footstep"])


func test_footsteps_follow_the_walk_and_the_run() -> bool:
	var before := _steps()
	await _hold(Vector2.ZERO, 2.0)
	assert_eq(_steps(), before, "no steps standing still")
	await _hold(Vector2(0, 0.6), 4.0)
	var walked := _steps() - before
	var walk_speed := body.speed
	var expected := 3.5 / SoundProfiles.step_interval(walk_speed)  # minus the half second to get going
	assert_true(walk_speed > 1.0, "walking (%.1f m/s)" % walk_speed)
	assert_true(absf(walked - expected) <= 2.5, "walking 4 s: %d steps, about %.0f expected" % [walked, expected])
	rig.place(Vector3(0, 0.1, 18), PI)
	await wait_physics_frames(10)
	before = _steps()
	await _hold(Vector2(0, 1), 4.0, true)
	var ran := _steps() - before
	assert_true(body.speed > 4.0, "running (%.1f m/s)" % body.speed)
	assert_true(ran > walked, "running steps come quicker (%d vs %d)" % [ran, walked])
	return true


func test_a_jump_lands_with_a_thud_and_no_steps_in_the_air() -> bool:
	await _hold(Vector2.ZERO, 0.5)
	var lands := int((s.state()["played"] as Dictionary)["land"])
	var steps := _steps()
	await _hold(Vector2.ZERO, 0.4, false, true)
	assert_false(body.is_on_floor(), "in the air")
	assert_eq(_steps(), steps, "no steps in the air")
	await _hold(Vector2.ZERO, 1.0)
	assert_true(body.is_on_floor(), "back on the ground")
	assert_eq(int((s.state()["played"] as Dictionary)["land"]), lands + 1, "one landing thud")
	return true
