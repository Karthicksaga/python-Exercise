extends TestCase
## The new mission systems played through the layer and the HUD (G-140..G-147): the retry dialog
## and the checkpoint, the choice dialog, the medals screen, the stability and suspicion meters,
## the flood on the minimap and in the vehicle, and the cues through the real `Sound` autoload.
## The rules are stepped by the test (`session.step`) with the layer's own stepping off, so each
## case is exact; the layer reacts to the session's signals as in the game.

const SAVE := "user://test-missions-v2.json"

var g: MissionsGround


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	await wait_physics_frames(2)
	g.layer.active = false
	g.layer.spawn_parking = false


func _session() -> MissionSession:
	return g.layer.session


func _status(x: float, z: float, mode: String = "foot", speed: float = 0.0) -> MissionData.PlayerStatus:
	return MissionData.PlayerStatus.make(x, z, mode, speed)


## Step the session `seconds` of game time in 0.1 s steps with the player where `at` says.
func _step(seconds: float, status: MissionData.PlayerStatus) -> void:
	var left := seconds
	while left > 0.0:
		var dt := minf(0.1, left)
		_session().step(dt, status)
		left -= dt


func _cues() -> Dictionary:
	return (Sound.state()["played"] as Dictionary).duplicate()


func test_a_failure_offers_retry_at_the_checkpoint_and_the_player_goes_back() -> bool:
	var s := _session()
	assert_true(s.play_stage("hall-ticket"), "Hall Ticket is open from the Stages tab")
	var lodge := s.runner.mission().objectives[1]
	_step(0.2, _status(lodge.x, lodge.z, "auto"))
	assert_eq(s.runner.objective().label, "Pick up the student at the lodge", "in the auto: the pick-up")
	_step(8.0, _status(lodge.x, lodge.z, "auto", 0.0))
	assert_true(s.runner.objective().label.begins_with("Drive to the exam centre"), "the student is in")
	assert_eq(s.runner.checkpoint_index(), 2, "a checkpoint at the gate leg")
	var place := s.checkpoint_place()
	assert_eq(place["mode"], "auto", "back in the auto")
	var before := _cues()
	s.runner.extend_time(-9999.0)
	_step(0.2, _status(lodge.x + 400.0, lodge.z, "auto", 9.0))
	assert_eq(s.runner.objective().label, "The gate has shut: run to the side gate, Pathari Road", "fail-forward to the side gate")
	assert_false(g.layer.hud.dialog_open(), "no dialog: it branched")
	s.runner.extend_time(-9999.0)
	_step(0.2, _status(lodge.x + 400.0, lodge.z, "foot", 0.0))
	assert_true(g.layer.hud.dialog_open(), "the retry dialog is up")
	assert_true(g.layer.get_tree().paused, "the game is held")
	assert_eq(g.layer.hud.dialog_title.text, "Out of time", "named by the reason")
	assert_true(g.layer.hud.buttons.has("retry") and g.layer.hud.buttons.has("start_over"), "RETRY and START OVER")
	for id: String in ["retry", "start_over"]:
		assert_true(g.layer.hud.buttons[id].custom_minimum_size.y >= UiTheme.MIN_TARGET, "%s is a 48 dp target" % id)
	assert_eq(_cues().get("cue.fail", 0), int(before.get("cue.fail", 0)) + 2, "two failure cues through the real Sound autoload")
	assert_true(g.layer.hud.press("retry"), "RETRY")
	assert_false(g.layer.get_tree().paused, "and on")
	assert_true(s.runner.objective().label.begins_with("Drive to the exam centre"), "back at the checkpoint, not the start")
	assert_eq(s.runner.stats().retries, 1, "one retry")
	# START OVER on the next failure.
	s.runner.extend_time(-9999.0)
	_step(0.2, _status(0, 0, "auto", 9.0))
	s.runner.extend_time(-9999.0)
	_step(0.2, _status(0, 0, "foot"))
	assert_true(g.layer.hud.press("start_over"), "START OVER")
	assert_eq(s.runner.objective().label, "Get in the auto outside the lodge", "the stage's first objective")
	return true


func test_wrong_number_choice_dialog_pays_flags_and_the_medals_screen_follows() -> bool:
	var s := _session()
	assert_true(s.play_stage("wrong-number"), "Wrong Number is open")
	var m := s.runner.mission()
	_step(0.2, _status(0, 0, "bike"))
	var start := m.objectives[1]
	_step(0.2, _status(start.x, start.z, "bike", 3.0))
	assert_eq(s.runner.objective().type, "tail", "the tail begins")
	# Follow 40 m behind the runner until he reaches the drop-off.
	var guard := 0
	while s.runner.objective().type == "tail" and guard < 20000:
		guard += 1
		var q: Dictionary = s.runner.tail_target()
		_step(0.1, _status(float(q["x"]) + 40.0, float(q["z"]), "bike", 8.0))
	assert_eq(s.runner.objective().type, "choice", "he drops the envelope: a choice")
	assert_true(g.layer.hud.dialog_open() and g.layer.get_tree().paused, "the choice holds the game")
	assert_eq(g.layer.hud.dialog_title.text, "He has dropped the envelope. What now?", "the question")
	assert_true(g.layer.hud.buttons.has("report") and g.layer.hud.buttons.has("take"), "two options")
	assert_true(g.layer.hud.buttons["take"].custom_minimum_size.y >= UiTheme.MIN_TARGET, "a 48 dp target")
	var money := s.runner.balance()
	var heat: Array[int] = []
	s.heat_raised.connect(func(stars: int) -> void: heat.append(stars))
	var fanfare := int(_cues().get("cue.fanfare", 0))
	assert_true(g.layer.hud.press("take"), "take the envelope")
	assert_eq(heat, [1], "a star of heat")
	assert_eq(s.runner.balance(), money + 1100 + 400, "1,100 for the envelope and the mission's 400")
	assert_true(s.runner.has_flag("took_envelope"), "remembered")
	assert_true(g.layer.hud.dialog_open(), "the medals screen")
	assert_eq(g.layer.hud.dialog_title.text, "Wrong Number", "the medals screen title")
	assert_true(g.layer.hud.medals_box.visible, "with the medal and the goals")
	assert_eq(g.layer.hud.medal_goals.get_child_count(), 3, "three bonus goals")
	assert_true(int(_cues().get("cue.fanfare", 0)) > fanfare, "a fanfare through the real Sound autoload")
	assert_true(g.layer.hud.buttons["continue"].custom_minimum_size.y >= UiTheme.MIN_TARGET, "CONTINUE is a 48 dp target")
	assert_true(g.layer.hud.press("continue"), "CONTINUE")
	assert_false(g.layer.get_tree().paused, "the game goes on")
	# The save holds the medal and the flag; the Bandh reacts to it.
	var again := MissionSession.open(SAVE)
	assert_true(again.runner.has_flag("took_envelope"), "the choice is saved")
	assert_true(again.runner.medal_of("wrong-number") != "", "the medal is saved")
	assert_eq(again.store.read_version, 2, "save version 2")
	assert_contains(again.brief_for(again.content.any_mission("the-bandh")), "owners know your bike", "a later mission reacts")
	return true


func test_the_stability_meter_shows_and_a_rough_patch_drains_it() -> bool:
	var s := _session()
	assert_true(s.play_stage("sambar-sixty"), "Sambar is open")
	var m := s.runner.mission()
	_step(0.2, _status(0, 0, "auto"))
	var kitchen := m.objectives[1]
	_step(6.0, _status(kitchen.x, kitchen.z, "auto", 0.0))
	assert_eq(s.runner.objective().type, "fragile", "carrying the vessel")
	g.layer.active = true
	await wait_frames(2)
	g.layer.active = false
	var patch: Dictionary = s.runner.objective().rough[0]
	assert_true(g.layer.hud.stability_row.visible, "the meter shows")
	assert_eq(g.layer.hud.stability_label.text, "Cargo", "the label")
	assert_true(g.layer.hud.stability_bar.value > 99.0, "full")
	_step(0.1, _status(float(patch["x"]), float(patch["z"]), "auto", 9.0))
	g.layer.active = true
	await wait_frames(2)
	g.layer.active = false
	assert_true(g.layer.hud.stability_bar.value < 95.0, "a breaker taken fast: %.1f" % g.layer.hud.stability_bar.value)
	assert_true(g.layer.hud.stability_bar.colour() == Color("#4ccb6b"), "still green")
	return true


func test_the_flood_is_on_the_minimap_and_stalls_the_ambulance() -> bool:
	var s := _session()
	assert_true(s.play_stage("monsoon-night"), "Monsoon Night is open")
	var m := s.runner.mission()
	_step(0.2, _status(0, 0, "ambulance"))
	var patient := m.objectives[1]
	_step(0.2, _status(patient.x, patient.z, "ambulance", 0.0))
	_step(30.0, _status(patient.x, patient.z, "ambulance", 0.0))
	assert_eq(s.runner.objective().type, "fragile", "the drive with the patient")
	var flood: HazardZone = s.runner.objective().hazards[0]
	g.layer.active = true
	g.layer.spawn_parking = false
	await wait_frames(2)
	assert_false(g.layer.hud.minimap.visible and g.layer.hud.minimap.zones.size() > 0, "no water yet")
	g.layer.active = false
	# Let the water rise: 60 s on, at the underpass, in an ambulance moving at 10 m/s.
	var amb := Vehicle.create(&"ambulance", &"amb-test")
	amb.add_to_group(WorldOrigin.GROUP)
	g.add_child(amb)
	amb.place(Vector3(flood.x, 0.0, flood.z), 0.0)
	await wait_physics_frames(30)
	g.driving.rider.place(amb.ground_point(amb.type.entry.point + Vector2(float(amb.type.entry.side) * 0.4, 0.0)), 0.0)
	await wait_physics_frames(1)
	assert_true(g.driving.enter(amb), "in the ambulance")
	assert_true(await wait_until(func() -> bool: return g.driving.mode() == &"driving", 60 * 8), "driving")
	_step(60.0, _status(flood.x, flood.z, "ambulance", 10.0))
	g.layer.active = true
	await wait_frames(2)
	assert_true(g.layer.hud.minimap.visible, "the minimap appears with the water")
	assert_true(g.layer.hud.minimap.zones.size() >= 1 and str(g.layer.hud.minimap.zones[0]["kind"]) == "flood", "the flood is drawn")
	assert_true(float(g.layer.hud.minimap.zones[0]["depth"]) > 0.5, "deep by now: %.2f" % float(g.layer.hud.minimap.zones[0]["depth"]))
	var e := s.hazard_effect(flood.x, flood.z, 1.0)
	assert_true(bool(e["stalled"]), "the engine stalls in the deep water")
	amb.set_speed(10.0)
	await wait_physics_frames(6)
	assert_true(amb.forward_speed() < 0.5, "the stalled ambulance stops (%.2f m/s)" % amb.forward_speed())
	g.layer.active = false
	g.driving.exit()
	await wait_physics_frames(30)
	amb.queue_free()
	return true


func test_the_tail_shows_suspicion_and_warns_when_too_close() -> bool:
	var s := _session()
	assert_true(s.play_stage("wrong-number"), "Wrong Number is open")
	var m := s.runner.mission()
	_step(0.2, _status(0, 0, "bike"))
	var start := m.objectives[1]
	_step(0.2, _status(start.x, start.z, "bike", 3.0))
	var warned: Array[String] = []
	s.meter_warning.connect(func(meter: String) -> void: warned.append(meter))
	for i in 200:
		var q: Dictionary = s.runner.tail_target()
		_step(0.1, _status(float(q["x"]) + 6.0, float(q["z"]), "bike", 8.0))
		if not warned.is_empty():
			break
	assert_eq(warned, ["suspicion"], "the HUD warns before he sees you")
	g.layer.active = true
	await wait_frames(2)
	g.layer.active = false
	assert_true(g.layer.hud.suspicion_row.visible, "the suspicion meter shows")
	assert_true(g.layer.hud.suspicion_bar.value >= 45.0, "at the warning band (%.1f)" % g.layer.hud.suspicion_bar.value)
	assert_true(g.layer.hud.minimap.visible and g.layer.hud.minimap.quarry != Vector2.INF, "the minimap follows the runner")
	return true


func test_the_board_has_a_stages_tab_with_four_rows_and_replays_a_medalled_mission() -> bool:
	g.layer.active = true
	g.layer.open_board()
	assert_true(g.layer.hud.buttons.has("tab"), "a STAGES tab button")
	assert_true(g.layer.hud.press("tab"), "switch to Stages")
	assert_eq(g.layer.hud.dialog_title.text, "Stages", "the tab")
	for id: String in ["hall-ticket", "sambar-sixty", "wrong-number", "monsoon-night", "the-bandh"]:
		assert_true(g.layer.hud.buttons.has(id), "%s is on the tab" % id)
		assert_true(g.layer.hud.buttons[id].custom_minimum_size.y >= UiTheme.MIN_TARGET, "%s PLAY is a 48 dp target" % id)
	var scroll := g.layer.hud.dialog_rows.get_parent() as ScrollContainer
	assert_true(scroll.custom_minimum_size.y >= 4.0 * MissionHud.ROW_HEIGHT, "four rows show at 915x412 (%.0f px)" % scroll.custom_minimum_size.y)
	assert_true(g.layer.hud.press("monsoon-night"), "play Monsoon Night")
	assert_false(g.layer.hud.dialog_open(), "the dialog closed")
	assert_eq(_session().runner.mission().id, "monsoon-night", "the mission")
	assert_eq(_session().runner.objective().label, "Get in the ambulance", "the first objective")
	await wait_physics_frames(2)
	assert_true(Weather.raining, "the mission brings the rain")
	_session().leave_stage()
	await wait_physics_frames(2)
	g.layer.active = false
	return true


func test_a_toast_does_not_depend_on_a_waited_frame() -> bool:
	# W10: the toast's size is right on the frame it is shown and after the one-frame fit.
	g.layer.hud.toast("Stage 1: Morning walk", "Stretch your legs. Walk down the street to the marker.", 4.0)
	var panel := g.layer.hud.toast_panel
	assert_true(panel.size.y < 120.0, "right away: %.0f px" % panel.size.y)
	assert_true(panel.size.x >= 240.0, "and wide enough")
	return true
