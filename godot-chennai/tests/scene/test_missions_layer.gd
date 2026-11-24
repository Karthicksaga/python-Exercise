extends TestCase
## The missions played through the real player, vehicles and HUD (G-130), in game time: the
## behaviours of the Three.js `driving.spec.ts` (stages 1 and 2, new game), `jobs.spec.ts` (the
## board) and `fares.spec.ts` (a passenger boards and alights), on a flat ground carrying the
## real baked content.

const SAVE := "user://test-missions-layer.json"

var g: MissionsGround


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	await wait_physics_frames(2)


func _session() -> MissionSession:
	return g.layer.session


func _money() -> int:
	return _session().runner.balance()


## Walk with the stick (`move`: x right, y forward, camera facing north) for `seconds`.
func _walk(move: Vector2, seconds: float) -> void:
	g.rig.body.input = PlayerInput.make(move, 0.0)
	await wait_game_seconds(seconds)
	g.rig.body.input = PlayerInput.make(Vector2.ZERO, 0.0)


func _board(v: Vehicle) -> bool:
	g.driving.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
	await wait_physics_frames(1)
	check(g.driving.enter(v), "enter %s" % v.id)
	return await wait_until(func() -> bool: return g.driving.mode() == &"driving", 60 * 8)


func _parked(id: String) -> Vehicle:
	await wait_until(func() -> bool: return g.layer.parked.has(id), 120)
	var v: Vehicle = g.layer.parked.get(id)
	await wait_physics_frames(30)
	return v


func _finish_stage_1() -> void:
	var t: MissionData.Objective = _session().objective()
	g.put_player(t.x, t.z)
	await wait_until(func() -> bool: return _money() == 50, 120)


func test_stage_1_on_foot_pays_50_and_progress_survives_a_restart() -> bool:
	var s := _session()
	assert_eq(s.runner.mission().id, "morning-walk", "stage 1")
	assert_eq(_money(), 0, "no money yet")
	await wait_frames(2)
	assert_contains(g.layer.hud.objective_label.text, "Walk to the marker", "the HUD shows the objective")
	assert_true(g.layer.beacon.shown(), "the marker is drawn")
	var target := g.layer.target
	# Skip most of the walk, then finish it with the stick (west, towards the marker).
	g.put_player(float(target["x"]) + 6.0, float(target["z"]))
	await wait_physics_frames(2)
	assert_eq(s.runner.mission().id, "morning-walk", "not done 6 m away")
	await wait_frames(1)
	assert_true(absf(g.layer.hud.arrow.bearing + PI / 2.0) < 0.5, "the arrow points left, at the marker (%.2f)" % g.layer.hud.arrow.bearing)
	var toasts: Array[String] = []
	s.notice.connect(func(title: String, _d: String, _sec: float) -> void: toasts.append(title))
	await _walk(Vector2(-1, 0), 3.0)
	assert_true(toasts.has("Stage 1 complete"), "the completion toast")
	assert_eq(_money(), 50, "paid ₹50")
	await wait_frames(2)
	assert_eq(g.layer.hud.money_label.text, "₹50", "the HUD shows ₹50")
	assert_eq(s.runner.mission().id, "borrowed-wheels", "stage 2 next")
	assert_eq(s.objective().label, "Get in the hatchback", "get in the hatchback")
	# Reopen the game: money and stage are restored from the save file.
	g.queue_free()
	await wait_physics_frames(1)
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	await wait_physics_frames(2)
	assert_eq(_money(), 50, "money restored")
	assert_eq(_session().runner.mission().id, "borrowed-wheels", "stage restored")
	return true


func test_stage_2_needs_the_car_and_a_full_stop() -> bool:
	await _finish_stage_1()
	assert_eq(_session().runner.mission().id, "borrowed-wheels", "stage 2")
	var car := await _parked("car-start")
	assert_true(car != null and car.type.kind == &"car", "the hatchback is parked at the start")
	await wait_frames(1)
	var marker := Vector2(float(g.layer.target["x"]), float(g.layer.target["z"]))
	assert_true(marker.distance_to(Vector2(car.global_position.x, car.global_position.z)) < 0.5, "the marker points at the car")
	assert_true(await _board(car), "in the car")
	assert_true(await wait_until(func() -> bool: return _session().objective().label == "Drive to Anna Nagar Tower Park", 30), "getting in moves the objective on")
	var park := _session().objective()
	# Driving through the marker does not count; stopping in it does.
	car.teleport(Vector3(park.x, car.global_position.y, park.z + 20.0), 0.0)
	await wait_physics_frames(1)
	car.set_speed(12.0)
	await wait_game_seconds(3.5)
	assert_true(car.global_position.z < park.z - park.radius, "drove through the marker without stopping (z %.1f, marker %.1f, speed %.1f)" % [car.global_position.z, park.z, car.forward_speed()])
	assert_eq(_money(), 50, "driving through does not count")
	car.teleport(Vector3(park.x, car.global_position.y, park.z), 0.0)
	var paid := await wait_until(func() -> bool: return _money() == 200, 60 * 5)
	assert_true(paid, "a full stop in the marker pays ₹150 (money %d)" % _money())
	assert_eq(_session().runner.mission().id, "auto-shift", "stage 3 next")
	return true


func test_new_game_from_the_title_menu_clears_progress() -> bool:
	await _finish_stage_1()
	assert_eq(_money(), 50, "stage 1 done")
	var title: TitleMenu = (load("res://src/ui/title_menu/title_menu.tscn") as PackedScene).instantiate()
	root.add_child(title)
	title.new_game_requested.connect(g.layer.new_game)
	var played := [false]
	title.play_requested.connect(func() -> void: played[0] = true)
	(title.find_child("NewGame", true, false) as Button).pressed.emit()
	assert_true(played[0], "NEW GAME then plays")
	assert_eq(_money(), 0, "money cleared")
	assert_eq(_session().runner.mission().id, "morning-walk", "back to stage 1")
	await wait_physics_frames(2)
	var spawn := _session().content.spawn
	assert_true(Vector2(g.rig.body.global_position.x, g.rig.body.global_position.z).distance_to(Vector2(float(spawn["x"]), float(spawn["z"]))) < 1.0, "the player is back at the start")
	var fresh := MissionSession.open(SAVE)
	assert_eq(fresh.runner.balance(), 0, "the save file is cleared")
	assert_eq(fresh.runner.mission().id, "morning-walk", "the saved stage is cleared")
	title.queue_free()
	return true


func test_the_board_offers_every_job_and_each_jobs_vehicle_is_parked() -> bool:
	g.layer.open_board()
	assert_true(g.layer.hud.dialog_open(), "the board opens")
	assert_true(g.layer.get_tree().paused, "the game is held behind it")
	assert_eq(g.layer.hud.dialog_title.text, "Job board", "titled")
	var ids: Array[String] = []
	for j in _session().content.jobs:
		if g.layer.hud.buttons.has(j.id):
			ids.append(j.id)
			assert_true(g.layer.hud.buttons[j.id].size.y >= UiTheme.MIN_TARGET or g.layer.hud.buttons[j.id].custom_minimum_size.y >= UiTheme.MIN_TARGET, "%s's button is a 48 dp target" % j.id)
	assert_eq(ids.size(), 13, "every job offered")
	assert_true(g.layer.hud.buttons["bus-route"].disabled, "the bus needs reputation")
	assert_true(g.layer.hud.press("ambulance-run"), "take the ambulance run")
	assert_false(g.layer.hud.dialog_open(), "the board closes")
	assert_false(g.layer.get_tree().paused, "the game goes on")
	assert_eq(_session().jobs.job().id, "ambulance-run", "on the job")
	await wait_frames(2)
	assert_eq(g.layer.hud.objective_label.text, "Get in the ambulance", "the HUD asks for the ambulance")
	# Each job's vehicle kind is parked somewhere: go near one spot of each kind and see it there.
	var kinds := {}
	for j in _session().content.jobs:
		kinds[j.vehicle] = true
	for kind: String in kinds:
		var spot: Dictionary = {}
		for p in _session().content.parking:
			if str(p["kind"]) == kind and absf(float(p["x"])) < MissionsGround.HALF - 50.0 and absf(float(p["z"])) < MissionsGround.HALF - 50.0:
				spot = p
				break
		assert_false(spot.is_empty(), "a %s parked" % kind)
		g.put_player(float(spot["x"]) + 6.0, float(spot["z"]))
		var v := await _parked(str(spot["id"]))
		assert_true(v != null and String(v.type.kind) == kind, "a %s stands at %s" % [kind, spot["id"]])
		assert_true(Vector2(v.global_position.x, v.global_position.z).distance_to(Vector2(float(spot["x"]), float(spot["z"]))) < 1.0, "%s parked on its spot" % spot["id"])
	await wait_frames(1)
	var amb: Vehicle = g.layer.parked["ambulance"]
	g.put_player(amb.global_position.x + 20.0, amb.global_position.z)
	await wait_frames(2)
	assert_true(Vector2(float(g.layer.target["x"]), float(g.layer.target["z"])).distance_to(Vector2(amb.global_position.x, amb.global_position.z)) < 0.5, "the marker points at the ambulance")
	g.layer.open_board()
	assert_true(g.layer.hud.press("quit"), "QUIT JOB on the board")
	assert_eq(_session().jobs.reputation(), JobRunner.START_REPUTATION - JobRunner.FAIL_REPUTATION, "quitting costs reputation")
	assert_true(g.layer.hud.dialog_open(), "the failure is shown")
	assert_true(g.layer.hud.press("continue"), "CONTINUE")
	assert_false(g.layer.get_tree().paused, "and the game goes on")
	return true


func test_a_fares_passenger_boards_and_alights() -> bool:
	var s := _session()
	s.store.set_section(SaveStore.PROGRESS, {"completed": ["morning-walk", "borrowed-wheels"], "money": 200})
	s.store.write()
	s.reload()
	assert_eq(s.runner.mission().id, "auto-shift", "stage 3, the auto fare")
	var spot := s.content.parked("auto-park")
	g.put_player(float(spot["x"]) + 5.0, float(spot["z"]))
	var auto := await _parked("auto-park")
	assert_true(await _board(auto), "in the auto")
	assert_true(await wait_until(func() -> bool: return s.objective() != null and s.objective().label == "Pick up the passenger", 30), "pick-up objective")
	var pick := s.objective()
	await wait_frames(1)
	assert_eq(g.layer.figures.stages(), ["waiting"] as Array[String], "the passenger waits at the kerb")
	var kerb := Vector3(pick.fare.kerb_x, 0, pick.fare.kerb_z)
	assert_true(Vector2(kerb.x, kerb.z).distance_to(Vector2(pick.x, pick.z)) > 2.0, "the kerb spot is off the marker")
	auto.teleport(Vector3(pick.x, auto.global_position.y, pick.z), 0.0)
	var walking := await wait_until(func() -> bool: return ",".join(g.layer.figures.stages()) == "walking", 60 * 5)
	assert_true(walking, "they walk over once the auto stops")
	await wait_frames(1)
	var person: Vector3 = g.layer.figures.people[0]["position"]
	var door := auto.ground_point(FareFigures.kerb_door(auto, kerb).point)
	assert_true(Vector2(person.x, person.z).distance_to(Vector2(door.x, door.z)) < Vector2(kerb.x, kerb.z).distance_to(Vector2(door.x, door.z)) + 0.01, "walking from the kerb towards the door")
	assert_eq(s.objective().label, "Pick up the passenger", "the objective waits for them")
	assert_contains(g.layer.hud.objective_label.text, "Passenger getting in", "the HUD says so")
	assert_true(await wait_until(func() -> bool: return s.objective().label == "Drop the passenger", 60 * 20), "in: the drop is next")
	assert_eq(s.runner.aboard(), 1, "one aboard")
	assert_eq(_money(), 200, "not paid yet")
	var drop := s.objective()
	auto.teleport(Vector3(drop.x, auto.global_position.y, drop.z), 0.0)
	assert_true(await wait_until(func() -> bool: return ",".join(g.layer.figures.stages()) == "leaving", 60 * 10), "they get out and walk off")
	assert_eq(_money(), 200, "paid only once they are on the pavement")
	assert_true(await wait_until(func() -> bool: return _money() == 500, 60 * 20), "paid ₹300 at the drop")
	assert_eq(s.runner.mission().id, "parcel-run", "stage 4 next")
	return true
