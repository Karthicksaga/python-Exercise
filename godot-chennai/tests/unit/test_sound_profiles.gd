extends TestCase
## The sound design as data (ported from `packages/audio/src/profiles.test.ts`, TD-26).


func _idle_hz(kind: String) -> float:
	var p := SoundProfiles.engine(kind)
	return SoundProfiles.firing_hz(p, p["idle_rpm"])


func test_each_engine_idles_on_its_own_note() -> bool:
	assert_near(_idle_hz("car"), 26.7, 0.05, "car: 800 rpm, four cylinders")
	assert_near(_idle_hz("bus"), 32.5, 0.05, "bus: 650 rpm, six cylinders")
	assert_near(_idle_hz("auto"), 11.25, 0.05, "auto: a single you can count")
	assert_true(_idle_hz("bike") < 15.0, "bike idles below 15 Hz")
	assert_true(_idle_hz("thumper") < _idle_hz("bike"), "the 350 cc thumper thumps slower than the 150 cc bike")
	assert_true(_idle_hz("premium") > _idle_hz("bus"), "the V8 idles above the bus")
	# No two engines share a note within 10 % at idle or near the change point.
	for at: String in ["idle_rpm", "shift_rpm"]:
		for i in SoundProfiles.KINDS.size():
			for j in range(i + 1, SoundProfiles.KINDS.size()):
				var a := SoundProfiles.engine(SoundProfiles.KINDS[i])
				var b := SoundProfiles.engine(SoundProfiles.KINDS[j])
				var na := SoundProfiles.firing_hz(a, a[at])
				var nb := SoundProfiles.firing_hz(b, b[at])
				assert_true(absf(na - nb) / maxf(na, nb) > 0.1, "%s vs %s at %s: %.1f vs %.1f Hz" % [SoundProfiles.KINDS[i], SoundProfiles.KINDS[j], at, na, nb])
	return true


func test_revs_climb_through_each_gear_and_drop_at_the_change() -> bool:
	for kind in SoundProfiles.KINDS:
		var p := SoundProfiles.engine(kind)
		var previous := SoundProfiles.engine_rpm(p, 0.5, 1.0)
		var drops := 0
		var speed := 0.6
		while speed <= float(p["top_speed"]):
			var rpm := SoundProfiles.engine_rpm(p, speed, 1.0)
			check(rpm >= float(p["idle_rpm"]) * 0.94, "%s at %.1f m/s: %d rpm under idle" % [kind, speed, rpm])
			if rpm < previous - 50.0:
				drops += 1
			previous = rpm
			speed += 0.05
		assert_eq(drops, int(p["gears"]) - 1, "%s gear changes" % kind)
	return true


func test_revs_freely_at_a_standstill() -> bool:
	var car := SoundProfiles.engine("car")
	assert_eq(SoundProfiles.engine_rpm(car, 0.0, 0.0), float(car["idle_rpm"]), "idles without the accelerator")
	assert_true(SoundProfiles.engine_rpm(car, 0.0, 1.0) > float(car["idle_rpm"]) * 2.0, "revs up in neutral")
	assert_true(SoundProfiles.engine_rpm(car, 0.0, 1.0) < float(car["shift_rpm"]), "but not past the change point")
	return true


func _lowest(kind: String) -> float:
	var low := INF
	for n: Array in SoundProfiles.HORNS[kind]["notes"]:
		low = minf(low, float(n[0]))
	return low


func _horn_length(kind: String) -> float:
	var end := 0.0
	for n: Array in SoundProfiles.HORNS[kind]["notes"]:
		end = maxf(end, float(n[1]) + float(n[2]))
	return end


func test_no_two_vehicles_share_a_horn() -> bool:
	var seen := {}
	for kind in SoundProfiles.KINDS:
		var signature := ""
		for n: Array in SoundProfiles.HORNS[kind]["notes"]:
			signature += "%s@%s," % [n[0], n[1]]
		assert_false(seen.has(signature), "%s's horn is its own" % kind)
		seen[signature] = true
	return true


func test_bus_horn_lowest_and_longest_auto_highest_tapped_twice() -> bool:
	for kind in SoundProfiles.KINDS:
		if kind != "bus":
			assert_true(_lowest("bus") < _lowest(kind), "bus below %s" % kind)
			assert_true(_horn_length("bus") > _horn_length(kind), "bus longer than %s" % kind)
		if kind != "auto":
			assert_true(_lowest("auto") > _lowest(kind), "auto above %s" % kind)
	var taps := 0
	for n: Array in SoundProfiles.HORNS["auto"]["notes"]:
		if float(n[1]) > 0.0:
			taps += 1
	assert_eq(taps, 1, "the auto's second tap")
	assert_true(float(SoundProfiles.HORNS["auto"]["buzz"]) > 0.0, "the auto's horn buzzes")
	assert_true(float(SoundProfiles.HORNS["bus"]["attack"]) > float(SoundProfiles.HORNS["car"]["attack"]), "an air horn swells")
	return true


func test_vehicle_names_map_to_sound_kinds() -> bool:
	assert_eq(SoundProfiles.sound_kind("auto"), "auto", "auto")
	assert_eq(SoundProfiles.sound_kind("lorry"), "car", "unknown kinds sound like a car")
	assert_eq(SoundProfiles.sound_kind("taxi"), "car", "taxis are hatchbacks")
	assert_eq(SoundProfiles.sound_kind("motorbike"), "bike", "motorbike")
	assert_eq(SoundProfiles.sound_kind("suv"), "premium", "SUVs")
	return true


func test_placing_sounds_by_distance_and_bearing() -> bool:
	var o := Vector2.ZERO
	assert_near(float(SoundProfiles.place(o, 0.0, Vector2(0, -3))["gain"]), 1.0, 0.00001, "full close by")
	var mid := SoundProfiles.place(o, 0.0, Vector2(0, -30))
	assert_true(float(mid["gain"]) > 0.05 and float(mid["gain"]) < 0.3, "fades with distance")
	assert_eq(float(SoundProfiles.place(o, 0.0, Vector2(0, -60))["gain"]), 0.0, "silent past the edge")
	assert_true(float(SoundProfiles.place(o, 0.0, Vector2(0, -10))["cutoff"]) > float(mid["cutoff"]), "duller far away")
	assert_true(float(SoundProfiles.place(o, 0.0, Vector2(10, 0))["pan"]) > 0.5, "east is right facing north")
	assert_true(float(SoundProfiles.place(o, 0.0, Vector2(-10, 0))["pan"]) < -0.5, "west is left")
	assert_true(float(SoundProfiles.place(o, PI, Vector2(10, 0))["pan"]) < -0.5, "east is left facing south")
	assert_true(absf(float(SoundProfiles.place(o, 0.0, Vector2(0, -10))["pan"])) < 0.01, "ahead is centred")
	return true


func test_footsteps_quicken_from_walk_to_run() -> bool:
	assert_true(SoundProfiles.step_interval(1.4) > 0.45 and SoundProfiles.step_interval(1.4) < 0.6, "walking cadence")
	assert_true(SoundProfiles.step_interval(5.0) < SoundProfiles.step_interval(1.4), "running is quicker")
	assert_true(SoundProfiles.step_interval(5.0) >= 0.28, "never a blur")
	return true


func test_city_by_hour_and_wildlife() -> bool:
	assert_true(SoundProfiles.city_level(19) > SoundProfiles.city_level(13), "the evening rush is loudest")
	assert_true(SoundProfiles.city_level(13) > SoundProfiles.city_level(3), "day above the small hours")
	assert_true(SoundProfiles.city_level(3) < 0.15, "quiet before dawn")
	assert_true(float(SoundProfiles.wildlife(6.3)["koel"]) > 0.9, "the koel at dawn")
	assert_true(float(SoundProfiles.wildlife(14)["koel"]) < 0.01, "no koel at 2 pm")
	assert_true(float(SoundProfiles.wildlife(10)["crows"]) > 0.4, "crows by day")
	assert_eq(float(SoundProfiles.wildlife(23)["crows"]), 0.0, "no crows at night")
	assert_eq(float(SoundProfiles.wildlife(23)["crickets"]), 1.0, "crickets at night")
	assert_true(float(SoundProfiles.wildlife(12)["crickets"]) < 0.01, "no crickets at noon")
	return true


func test_stopped_traffic_honks_more_in_the_rush() -> bool:
	assert_eq(SoundProfiles.honk_chance(19, 0.5), 0.0, "not straight away")
	assert_true(SoundProfiles.honk_chance(19, 4) > SoundProfiles.honk_chance(3, 4) * 2.0, "the rush honks far more than 3 am")
	return true


func test_ambience_beds_by_hour_and_place() -> bool:
	var rush_inland := SoundProfiles.ambience_levels(19, 0.0, INF, 1.0)
	var night_coast := SoundProfiles.ambience_levels(23, 0.0, 50.0, 0.2)
	var rain_noon := SoundProfiles.ambience_levels(12.5, 1.0, INF, 0.5)
	assert_true(float(rush_inland["city"]) > float(night_coast["city"]), "the rush hums louder than a night on the beach road")
	assert_eq(float(rush_inland["sea"]), 0.0, "no sea inland")
	assert_true(float(night_coast["sea"]) > 0.8, "waves by the coast")
	assert_true(float(night_coast["crickets"]) > 0.9, "crickets at night")
	assert_eq(float(rain_noon["rain"]), 1.0, "rain on the roofs")
	assert_eq(float(SoundProfiles.ambience_levels(23, 1.0, INF, 0.5)["crickets"]), 0.0, "crickets fall quiet in heavy rain")
	return true
