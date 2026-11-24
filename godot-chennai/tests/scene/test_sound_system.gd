extends TestCase
## The Sound API in a running tree (headless, Dummy audio driver): the player's engine follows
## speed and accelerator, horns per kind, footsteps at the stride's cadence in game time, traffic
## voices for the nearest few, honking in jams by hour, ambience beds by hour and place, birds by
## hour, and SOUND off remembered. A fresh SoundSystem per test with its own settings file.

const DT := 1.0 / 60.0
const SETTINGS := "user://test_sound_save.json"

var s: SoundSystem


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SETTINGS))
	s = SoundSystem.new()
	s.settings_path = SETTINGS
	root.add_child(s)
	await wait_frames(1)


func _drive(kind: String, speed: float, accelerator: float, seconds: float) -> void:
	for i in roundi(seconds / DT):
		s.set_engine(kind, speed, accelerator, DT)


func test_player_engine_follows_speed_accelerator_and_gears() -> bool:
	_drive("car", 0.0, 0.0, 1.0)
	var st := s.state()
	assert_eq((st["engine"] as Dictionary)["kind"], "car", "the car's engine")
	assert_near(float((st["engine"] as Dictionary)["rpm"]), 800.0, 15.0, "idling")
	assert_true(s.engine.playing_players() >= 1 and s.engine.playing_players() <= 2, "only the loops being heard play (%d)" % s.engine.playing_players())
	_drive("car", 0.0, 1.0, 0.5)
	assert_true(s.engine.rpm > 1500.0, "revs in neutral with the accelerator down (%d)" % s.engine.rpm)
	var gears: Array[int] = []
	s.engine.gear_changed.connect(func(g: int) -> void: gears.append(g))
	var speed := 1.0
	while speed < 22.0:
		_drive("car", speed, 1.0, 0.1)
		speed += 0.4
	assert_eq(gears, [2, 3, 4, 5] as Array[int], "changes up through the gears")
	_drive("auto", 3.0, 0.5, 0.3)
	assert_eq((s.state()["engine"] as Dictionary)["kind"], "auto", "a different vehicle, a different engine")
	s.engine_off()
	assert_eq(s.state()["engine"], null, "on foot: no engine")
	var faded := await wait_until(func() -> bool: return s.get_children().filter(func(n: Node) -> bool: return n is EngineVoice).is_empty(), 120)
	assert_true(faded, "the stopped engines fade and are freed")
	return true


func test_horns_doors_and_landing_are_counted_by_kind() -> bool:
	for kind: String in ["car", "auto", "bus", "thumper"]:
		s.horn(kind)
	s.horn("taxi")
	var played: Dictionary = s.state()["played"]
	assert_eq(played.get("horn:car", 0), 2, "car horn (and the taxi's)")
	assert_eq(played.get("horn:auto", 0), 1, "auto horn")
	assert_eq(played.get("horn:thumper", 0), 1, "the 350's horn")
	s.door("bus")
	s.door("bike")
	s.land(0.7)
	played = s.state()["played"]
	assert_eq(played["door"], 2, "doors")
	assert_eq(played["land"], 1, "landing thud")
	return true


func test_footsteps_fall_at_the_stride_cadence() -> bool:
	for i in 600:
		s.walk(DT, 1.4, true, false)
	var walking: int = s.state()["played"]["footstep"]
	var expected := 10.0 / SoundProfiles.step_interval(1.4)
	assert_true(absf(walking - expected) <= 1.5, "walking 10 s: %d steps, expected %.1f" % [walking, expected])
	for i in 600:
		s.walk(DT, 5.0, true, true)
	var played: Dictionary = s.state()["played"]
	var running: int = int(played["footstep"]) - walking
	assert_true(absf(running - 10.0 / SoundProfiles.step_interval(5.0)) <= 1.5, "running 10 s: %d steps" % running)
	assert_true(running > walking, "running is quicker")
	assert_eq(played.get("wet_footstep", 0), running, "the run in the rain splashed")
	for i in 120:
		s.walk(DT, 4.0, false, false)
		s.walk(DT, 0.2, true, false)
	assert_eq(int(s.state()["played"]["footstep"]), walking + running, "no steps in the air or standing")
	return true


func _traffic(count: int, speed: float) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var kinds: PackedStringArray = ["bus", "auto", "car", "bike", "car", "auto"]
	for i in count:
		out.append({"id": i + 1, "position": Vector3(5.0 + i * 9.0, 0.0, 0.0), "speed": speed, "kind": kinds[i % kinds.size()]})
	return out


func test_nearest_traffic_is_heard_in_3d_and_jams_honk_by_hour() -> bool:
	s.set_listener(Vector3.ZERO, 0.0)
	var moving := _traffic(6, 6.0)
	s.set_traffic(moving, DT, 12.0)
	var heard: Array = s.state()["traffic"]
	assert_eq(heard.size(), 3, "the nearest three")
	assert_eq((heard[0] as Dictionary)["kind"], "bus", "each as its own kind")
	var placed := s.get_children().filter(func(n: Node) -> bool: return n is EngineVoice and (n as EngineVoice).positional)
	assert_eq(placed.size(), 3, "three positional voices")
	assert_near(((placed[0] as EngineVoice).global_position - Vector3(5, 0, 0)).length(), 0.0, 0.01, "placed at the vehicle")
	# A jam in the evening rush, then the same jam at 3 am, two game minutes each.
	var jam := _traffic(6, 0.0)
	for i in 7200:
		s.set_traffic(jam, DT, 19.0)
	var rush: int = s.state()["played"]["traffic_honk"]
	for i in 7200:
		s.set_traffic(jam, DT, 3.0)
	var night: int = int(s.state()["played"]["traffic_honk"]) - rush
	assert_true(rush >= 5, "the rush honks (%d in 2 min)" % rush)
	assert_true(rush > night * 2, "far more than at 3 am (%d vs %d)" % [rush, night])
	s.set_traffic([] as Array[Dictionary], DT, 12.0)
	assert_eq((s.state()["traffic"] as Array).size(), 0, "nothing heard when the street empties")
	return true


func _ambience(hour: float, rain: float, coast: float, seconds: float) -> void:
	for i in roundi(seconds / DT):
		s.ambience.update(DT, {"hour": hour, "rain": rain, "coast": coast, "traffic": 0.6, "enclosed": false})


func test_ambience_beds_follow_hour_and_place() -> bool:
	_ambience(13.0, 0.0, INF, 3.0)
	assert_eq(s.ambience.active(), PackedStringArray(["city"]), "an inland afternoon: the city's hum only")
	_ambience(23.0, 0.0, 60.0, 3.0)
	assert_eq(s.ambience.active(), PackedStringArray(["city", "crickets", "sea"]), "a night by the beach: hum, crickets, waves")
	assert_true(s.ambience.level("city") < float(SoundProfiles.ambience_levels(13.0, 0.0, INF, 0.6)["city"]), "the night is quieter than the afternoon")
	_ambience(23.0, 1.0, INF, 8.0)
	var raining := s.ambience.active()
	assert_true(raining.has("rain"), "rain on the roofs")
	assert_false(raining.has("sea"), "the sea bed stops inland")
	assert_true(s.ambience.level("crickets") < 0.05, "crickets fall quiet in the rain")
	return true


func test_birds_by_hour() -> bool:
	_ambience(6.3, 0.0, INF, 120.0)
	assert_true(int(s.ambience.played["koel"]) >= 2, "the koel at dawn (%d)" % s.ambience.played["koel"])
	var dawn_crows: int = s.ambience.played["crow"]
	_ambience(10.0, 0.0, INF, 120.0)
	assert_true(int(s.ambience.played["crow"]) - dawn_crows >= 3, "crows by day")
	var before: Dictionary = s.ambience.played.duplicate()
	_ambience(23.0, 0.0, INF, 120.0)
	assert_eq(s.ambience.played["crow"], before["crow"], "no crows at night")
	assert_eq(s.ambience.played["koel"], before["koel"], "no koel at night")
	assert_true(int(s.ambience.played["honk"]) > 0, "a distant horn now and then")
	return true


func test_sound_off_mutes_master_and_is_remembered() -> bool:
	var master := AudioServer.get_bus_index(&"Master")
	assert_true(s.enabled, "on by default")
	assert_eq(s.label(), "Sound: On", "menu label")
	s.set_enabled(false)
	assert_true(AudioServer.is_bus_mute(master), "Master muted")
	assert_eq(s.label(), "Sound: Off", "menu label off")
	var again := SoundSystem.new()
	again.settings_path = SETTINGS
	root.add_child(again)
	await wait_frames(1)
	assert_false(again.enabled, "remembered after a restart")
	again.set_enabled(true)
	assert_false(AudioServer.is_bus_mute(master), "unmuted")
	return true


func test_suspend_silences_everything_sustained() -> bool:
	_drive("bus", 5.0, 0.5, 0.3)
	s.set_siren(true)
	s.set_skid(0.8)
	s.set_traffic(_traffic(2, 4.0), DT, 12.0)
	_ambience(19.0, 0.0, INF, 1.0)
	s.suspend()
	assert_eq(s.state()["engine"], null, "no engine")
	assert_eq((s.state()["traffic"] as Array).size(), 0, "no traffic")
	assert_eq(s.ambience.active().size(), 0, "no beds")
	return true
