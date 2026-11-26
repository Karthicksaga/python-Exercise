extends TestCase
## The fixed 60 Hz step (TD-6, G-2) and waiting in game time.


func test_project_settings() -> bool:
	assert_eq(Engine.physics_ticks_per_second, 60, "60 Hz physics")
	assert_eq(Engine.max_physics_steps_per_frame, 5, "at most 5 steps per frame, as the Three.js GameLoop")
	assert_eq(ProjectSettings.get_setting("physics/3d/physics_engine"), "Jolt Physics", "Jolt")
	assert_eq(ProjectSettings.get_setting("rendering/renderer/rendering_method.mobile"), "mobile", "Mobile renderer on phones")
	assert_eq(ProjectSettings.get_setting("display/window/handheld/orientation"), 4, "sensor landscape")
	assert_true(ProjectSettings.get_setting("input_devices/pointing/emulate_touch_from_mouse"), "touch from mouse")
	return true


func test_waits_in_game_time() -> bool:
	var loop: Node = tree.root.get_node("/root/GameLoop")
	var frames: int = loop.get("physics_frames")
	var seconds: float = loop.get("game_seconds")
	var hour: float = (loop.get("clock") as GameClock).hour
	await loop.call("wait_physics_frames", 10)
	assert_eq(int(loop.get("physics_frames")) - frames, 10, "ten physics frames")
	await loop.call("wait_game_seconds", 0.5)
	assert_eq(int(loop.get("physics_frames")) - frames, 40, "half a game second is 30 more steps")
	assert_near(float(loop.get("game_seconds")) - seconds, 40.0 / 60.0, 0.000001, "game seconds")
	assert_near((loop.get("clock") as GameClock).hour - hour, 40.0 / 60.0 / 60.0, 0.000001, "time of day moved by game time")
	return true


func test_game_time_stops_while_paused() -> bool:
	var loop: Node = tree.root.get_node("/root/GameLoop")
	tree.paused = true
	var frames: int = loop.get("physics_frames")
	await wait_frames(5)
	var still := int(loop.get("physics_frames")) == frames
	tree.paused = false
	assert_true(still, "no steps while paused")
	return true
