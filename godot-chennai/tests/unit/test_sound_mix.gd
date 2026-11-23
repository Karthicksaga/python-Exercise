extends TestCase
## The mix (G-84): the buses exist with the Three.js levels, Master glues and limits, every player
## is routed to a bus that exists, and the beds sit where the design says against the engines.


func _bus(name: StringName) -> int:
	return AudioServer.get_bus_index(name)


func _db_to_linear(db: float) -> float:
	return pow(10.0, db / 20.0)


func test_buses_and_master_effects() -> bool:
	var expected := {&"Vehicles": 0.55, &"World": 0.495, &"Ambience": 0.4675, &"UI": 0.44}
	for name: StringName in expected:
		var i := _bus(name)
		assert_true(i > 0, "bus %s exists" % name)
		if i > 0:
			assert_near(_db_to_linear(AudioServer.get_bus_volume_db(i)), float(expected[name]), 0.005, "%s level" % name)
			assert_eq(AudioServer.get_bus_send(i), &"Master", "%s sends to Master" % name)
	var master := _bus(&"Master")
	var compressor := false
	var limiter_ceiling := 0.0
	for k in AudioServer.get_bus_effect_count(master):
		var e := AudioServer.get_bus_effect(master, k)
		if e is AudioEffectCompressor:
			compressor = true
		if e is AudioEffectHardLimiter:
			limiter_ceiling = (e as AudioEffectHardLimiter).ceiling_db
	assert_true(compressor, "Master has a compressor")
	assert_true(limiter_ceiling <= -1.0, "Master limits at -1 dBFS or lower (%.1f)" % limiter_ceiling)
	assert_true(AudioServer.get_bus_effect(_bus(&"Ambience"), 0) is AudioEffectLowPassFilter, "Ambience can be muffled")
	return true


func test_every_bus_named_in_code_exists() -> bool:
	var re := RegEx.create_from_string("bus\\s*=\\s*&\"(\\w+)\"|&\"(Vehicles|World|Ambience|UI)\"")
	for dir: String in ["res://src/audio", "res://src/game_engine/environment"]:
		for f in DirAccess.get_files_at(dir):
			if f.get_extension() != "gd":
				continue
			var text := FileAccess.get_file_as_string(dir.path_join(f))
			for m in re.search_all(text):
				var name := m.get_string(1) if m.get_string(1) != "" else m.get_string(2)
				check(_bus(StringName(name)) >= 0, "%s names bus %s" % [f, name])
	return true


func _rms(lib: SoundLibrary, id: String) -> float:
	return float(lib.entry(id).get("rms", 0.0))


func test_beds_sit_under_the_engine_and_horns_cut_through() -> bool:
	var lib := SoundLibrary.new()
	var vehicles := _db_to_linear(AudioServer.get_bus_volume_db(_bus(&"Vehicles")))
	var ambience := _db_to_linear(AudioServer.get_bus_volume_db(_bus(&"Ambience")))
	var car := SoundProfiles.engine("car")
	# The player's hatchback idling: its off-load idle loop at the voice's idle loudness.
	var engine := _rms(lib, "engine.car.loop.0.off") * float(car["volume"]) * 0.75 * vehicles
	var rush := SoundProfiles.ambience_levels(19.0, 0.0, INF, 0.5)
	var city := _rms(lib, "bed.city") * float(rush["city"]) * float(Ambience.BED_GAIN["city"]) * ambience
	var rain := _rms(lib, "bed.rain") * float(Ambience.BED_GAIN["rain"]) * ambience
	var sea := _rms(lib, "bed.sea") * float(Ambience.BED_GAIN["sea"]) * ambience
	var crickets := _rms(lib, "bed.crickets") * float(Ambience.BED_GAIN["crickets"]) * ambience
	var horn := _rms(lib, "horn.car") * vehicles
	var db := func(x: float) -> float: return 20.0 * log(x) / log(10.0)
	var gap: float = float(db.call(engine)) - float(db.call(city))
	assert_true(gap > 3.0 and gap < 10.0, "the evening rush hum sits 3-10 dB under the idling hatchback (%.1f dB)" % gap)
	assert_true(absf(float(db.call(rain)) - float(db.call(city))) < 4.0, "rain on the roofs is about as loud as the rush")
	assert_true(sea < city and sea > city * 0.4, "the sea a little under the city")
	assert_true(crickets < city * 0.5, "crickets well under")
	assert_true(horn > engine * 2.0, "a horn cuts through the engine")
	assert_true(_rms(lib, "horn.bus") < 0.5, "no sound file near full scale")
	return true
