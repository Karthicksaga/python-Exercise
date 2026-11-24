extends TestCase
## The passenger you are to pick up (G-283): standing at the pick-up before the player has even
## got into the vehicle, waving when the player is near, on board (visible, at the seat) after the
## pick-up, gone after the drop. Through the real layer on the flat missions ground, in game time;
## the wave is measured on a real cast model.

const SAVE := "user://test-fare-figures.json"

var g: MissionsGround


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	await wait_physics_frames(2)


func _to_stage(id: String) -> void:
	var s := g.layer.session
	var done: Array[String] = []
	for m: MissionData.Mission in s.content.missions:
		if m.id == id:
			break
		done.append(m.id)
	s.store.set_section(SaveStore.PROGRESS, {"completed": done, "money": 0})
	s.store.write()
	s.reload()
	await wait_frames(3)


func _board(v: Vehicle) -> bool:
	g.driving.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
	await wait_physics_frames(1)
	g.driving.enter(v)
	return await wait_until(func() -> bool: return g.driving.mode() == &"driving", 60 * 8)


func test_the_passenger_stands_at_the_pickup_before_the_player_has_the_vehicle() -> bool:
	await _to_stage("auto-shift")
	var s := g.layer.session
	assert_eq(s.objective().type, "enter", "the stage starts by getting in")
	var pick: MissionData.Objective = s.runner.mission().objectives[1]
	g.put_player(pick.x - 40.0, pick.z)
	await wait_frames(4)
	var shown: Array[String] = g.layer.figures.stages()
	assert_eq(shown, ["waiting"] as Array[String], "one passenger waits, already")
	var p := g.layer.figures.people[0]
	assert_true(bool(p["visible"]), "and can be seen")
	var at := Vector2((p["position"] as Vector3).x, (p["position"] as Vector3).z)
	assert_vec_near(at, Vector2(pick.fare.kerb_x, pick.fare.kerb_z), 1.5, "on the pavement at the pick-up")
	assert_true(bool(p["wave"]), "waving: the player is 40 m away")
	assert_true((p["face"] as Vector3).distance_to(g.rig.body.global_position) < 0.5, "turned to the player")
	return true


func test_the_waiting_passenger_does_not_wave_from_afar() -> bool:
	await _to_stage("auto-shift")
	var pick: MissionData.Objective = g.layer.session.runner.mission().objectives[1]
	g.put_player(pick.x - 600.0, pick.z)
	await wait_frames(4)
	assert_false(bool(g.layer.figures.people[0].get("wave", false)), "600 m is too far to wave")
	return true


func test_the_passenger_is_on_board_and_visible_after_the_pickup_and_gone_after_the_drop() -> bool:
	await _to_stage("auto-shift")
	var s := g.layer.session
	var spot := s.content.parked("auto-park")
	g.put_player(float(spot["x"]) + 5.0, float(spot["z"]))
	await wait_until(func() -> bool: return g.layer.parked.has("auto-park"), 120)
	var auto: Vehicle = g.layer.parked["auto-park"]
	await wait_physics_frames(30)
	assert_true(await _board(auto), "in the auto")
	var pick: MissionData.Objective = s.objective()
	auto.teleport(Vector3(pick.x, auto.global_position.y, pick.z), 0.0)
	assert_true(await wait_until(func() -> bool: return s.objective().label == "Drop the passenger", 60 * 20), "picked up")
	await wait_frames(2)
	var riding := g.layer.figures.people[0]
	assert_true(bool(riding["visible"]) and float(riding.get("sit", 0.0)) >= 1.0, "shown on board, seated")
	var seat: Vector3 = riding["position"]
	assert_true(seat.distance_to(auto.global_position) < 2.5, "inside the vehicle (%.2f m from its centre)" % seat.distance_to(auto.global_position))
	var drop := s.objective()
	auto.teleport(Vector3(drop.x, auto.global_position.y, drop.z), 0.0)
	assert_true(await wait_until(func() -> bool: return ",".join(g.layer.figures.stages()) == "leaving", 60 * 10), "out they get")
	assert_true(await wait_until(func() -> bool: return g.layer.figures.stages().is_empty() or g.layer.figures.stages()[0] != "leaving", 60 * 20), "and walk off")
	await wait_frames(3)
	for p in g.layer.figures.people:
		assert_false(bool(p["visible"]) and p["stage"] != "waiting", "nobody left on the vehicle")
	return true


func test_a_wave_puts_the_hand_over_the_head_and_the_other_arm_stays_down() -> bool:
	var fig := HumanFigure.new()
	root.add_child(fig)
	var manifest := PeopleManifest.open(FareFigures.MANIFEST)
	var id := FareFigures.RIDERS[0]
	var error := await fig.load_model(manifest.model_path(id), manifest.height(id))
	assert_eq(error, "", "the model loads")
	fig.advance(0.0, 0.0, true)
	assert_true(FareWave.hand_above_head(fig) < 0.0, "at rest the hand is below the head (%.2f m)" % FareWave.hand_above_head(fig))
	var highest := -INF
	var lowest := INF
	for i in 60:
		fig.advance(1.0 / 60.0, 0.0, true)
		FareWave.apply(fig, float(i) / 60.0)
		var up := FareWave.hand_above_head(fig)
		highest = maxf(highest, up)
		lowest = minf(lowest, up)
		assert_true(fig.arm_out("Right") > 110.0, "the arm is raised (%.0f degrees out)" % fig.arm_out("Right"))
		assert_true(fig.arm_out("Left") < 25.0, "the left arm hangs")
	assert_true(lowest > 0.0, "the hand stays over the head all the while (%.2f m)" % lowest)
	assert_true(highest - lowest > 0.04, "and it moves: the forearm sways %.2f m" % (highest - lowest))
	fig.advance(1.0 / 60.0, 0.0, true)
	assert_true(FareWave.hand_above_head(fig) < 0.0, "stopping the wave lets the arm down at once")
	return true
