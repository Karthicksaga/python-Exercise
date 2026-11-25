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


func _db(x: float) -> float:
	return 20.0 * log(x) / log(10.0)


## Phase 6 mix limits (G-378): every new sound against the player's idling hatchback, as the
## buses and the code's gains play it (bus level x gain x the file's RMS).
func test_bus_train_crossing_and_street_sounds_sit_in_the_mix() -> bool:
	var lib := SoundLibrary.new()
	var vehicles := _db_to_linear(AudioServer.get_bus_volume_db(_bus(&"Vehicles")))
	var world := _db_to_linear(AudioServer.get_bus_volume_db(_bus(&"World")))
	var ambience := _db_to_linear(AudioServer.get_bus_volume_db(_bus(&"Ambience")))
	var car := _rms(lib, "engine.car.loop.0.off") * float(SoundProfiles.engine("car")["volume"]) * 0.75 * vehicles
	# The bus: the loudest engine at idle, but not by more than 6 dB over the hatchback.
	var bus := _rms(lib, "engine.bus.loop.0.off") * float(SoundProfiles.engine("bus")["volume"]) * 0.75 * vehicles
	var gap := _db(bus) - _db(car)
	assert_true(gap > 0.0 and gap < 6.0, "the bus idles 0-6 dB over the hatchback (%.1f dB)" % gap)
	var goods := _rms(lib, "engine.goods.loop.0.off") * float(SoundProfiles.engine("goods")["volume"]) * 0.75 * vehicles
	assert_true(_db(goods) < _db(bus) and _db(goods) > _db(car) - 8.0, "the goods carrier sits between the car and the bus (%.1f dB)" % (_db(goods) - _db(car)))
	# Horns: the bus and truck horns are heard over their engines and no louder than the loudest car horn + 6 dB.
	var loudest_horn := 0.0
	for kind in SoundProfiles.KINDS:
		loudest_horn = maxf(loudest_horn, _rms(lib, "horn.%s" % kind))
	for kind: String in ["bus", "goods"]:
		var horn := _rms(lib, "horn.%s" % kind) * vehicles
		assert_true(horn > _rms(lib, "engine.%s.loop.0.off" % kind) * vehicles * 1.2, "the %s horn cuts through its engine" % kind)
		assert_true(_db(horn) < _db(loudest_horn * vehicles) + 6.0, "the %s horn is not the loudest by more than 6 dB" % kind)
	var brake := _rms(lib, "bus.airbrake") * vehicles * 0.6
	assert_true(brake < _rms(lib, "horn.bus") * vehicles, "the air brake's hiss is quieter than the bus horn")
	# A train at full speed, the player inside: rumble and clatter together 0-9 dB over the idling hatchback.
	var run := RailSounds.motion_levels(RailSounds.FULL_SPEED, 0.0, true, 0.0)
	var rumble := _rms(lib, "rail.rumble") * float(run["rumble"]) * float(RailSounds.LOOP_GAIN["rumble"]) * world
	var clatter := _rms(lib, "rail.clatter") * float(run["clatter"]) * float(RailSounds.LOOP_GAIN["clatter"]) * world
	var train := sqrt(rumble * rumble + clatter * clatter)
	var over := _db(train) - _db(car)
	assert_true(over > 0.0 and over < 9.0, "a train at full speed, inside: %.1f dB over the idling hatchback" % over)
	var beside := RailSounds.motion_levels(RailSounds.FULL_SPEED, 0.0, false, 15.0)
	assert_true(float(beside["rumble"]) * _rms(lib, "rail.rumble") < float(run["rumble"]) * _rms(lib, "rail.rumble"), "a train passing outside is not louder than inside")
	# The squeal and the crossing bell are noticed but never louder than the train's own noise.
	var squeal := _rms(lib, "rail.squeal") * float(RailSounds.LOOP_GAIN["squeal"]) * world
	assert_true(_db(squeal) < _db(train) + 3.0, "the brake squeal does not drown the train")
	var bell := _rms(lib, "crossing.bell") * float(RailSounds.LOOP_GAIN["bell"]) * world
	assert_true(_db(bell) > _db(car) - 6.0 and _db(bell) < _db(car) + 9.0, "the crossing bell is heard over the street, not over a train (%.1f dB vs the hatchback)" % (_db(bell) - _db(car)))
	var emu := _rms(lib, "rail.horn.emu") * RailSounds.HORN_GAIN * vehicles
	assert_true(_db(emu) < _db(loudest_horn * vehicles) + 6.0 and _db(emu) > _db(car) + 3.0, "the EMU horn cuts through the street")
	# The market and the tea stall under the city's rush hum.
	var rush := SoundProfiles.ambience_levels(19.0, 0.0, INF, 0.5)
	var city := _rms(lib, "bed.city") * float(rush["city"]) * float(Ambience.BED_GAIN["city"]) * ambience
	var market := _rms(lib, "bed.market") * float(Ambience.BED_GAIN["market"]) * ambience
	var tea := _rms(lib, "bed.tea") * float(Ambience.BED_GAIN["tea"]) * ambience
	assert_true(_db(market) < _db(city) + 3.0 and _db(market) > _db(city) - 9.0, "the market murmur is about the rush's loudness (%.1f dB)" % (_db(market) - _db(city)))
	assert_true(tea < market, "the tea stall is quieter than the market")
	assert_true(_db(car) - _db(market) > 2.0, "the market sits under the idling hatchback")
	return true
