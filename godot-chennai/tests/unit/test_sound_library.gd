extends TestCase
## Every sound file is in the manifest with an acceptable licence, and in assets/LICENSES.md
## (G-82); horns and one-shots are their own (rendered from the designs and measured).

const RATE := Synth.RATE


func _audio_files(dir: String) -> PackedStringArray:
	var out := PackedStringArray()
	for f in DirAccess.get_files_at(dir):
		if f.get_extension() in ["wav", "ogg", "mp3"]:
			out.append(dir.path_join(f))
	for sub in DirAccess.get_directories_at(dir):
		out.append_array(_audio_files(dir.path_join(sub)))
	return out


func test_every_file_has_a_manifest_row_and_a_licence_row() -> bool:
	var lib := SoundLibrary.new()
	assert_eq(lib.error, "", "manifest reads")
	var by_path := {}
	for id: String in lib.entries:
		by_path[lib.path_of(id)] = id
	var licences := FileAccess.get_file_as_string("res://assets/LICENSES.md")
	var files := _audio_files("res://assets/audio")
	assert_true(files.size() >= 100, "the sound files are there (%d)" % files.size())
	for path in files:
		check(by_path.has(path), "%s is in assets/audio/manifest.json" % path)
		var rel := path.trim_prefix("res://")
		var covered := licences.contains("`%s`" % rel) or licences.contains("`%s/*`" % rel.get_base_dir())
		check(covered, "%s has a row in assets/LICENSES.md" % rel)
	for id: String in lib.entries:
		var e := lib.entry(id)
		check(FileAccess.file_exists(lib.path_of(id)), "%s: file %s exists" % [id, lib.path_of(id)])
		check(SoundLibrary.licence_ok(str(e.get("licence", ""))), "%s: licence %s is CC0/CC-BY/public domain" % [id, e.get("licence", "")])
		check(str(e.get("source", "")) in ["synth", "recording"], "%s: source is synth or recording" % id)
		if str(e.get("source", "")) == "recording":
			for field: String in ["url", "author", "original", "edits"]:
				check(str(e.get(field, "")) != "", "%s: recording has its %s" % [id, field])
	return true


func test_forbidden_licences_are_refused() -> bool:
	for bad: String in ["CC-BY-NC-4.0", "CC-BY-ND-3.0", "Sampling+", "", "unknown"]:
		assert_false(SoundLibrary.licence_ok(bad), "refuses %s" % bad)
	for good: String in ["CC0-1.0", "CC-BY-4.0", "CC-BY-3.0", "Public domain"]:
		assert_true(SoundLibrary.licence_ok(good), "accepts %s" % good)
	return true


func test_each_vehicle_horn_is_its_own() -> bool:
	var peaks := {}
	for kind in SoundProfiles.KINDS:
		var horn := Synth.horn(kind)
		var notes: Array = SoundProfiles.HORNS[kind]["notes"]
		var window := horn.slice(roundi(RATE * 0.2), roundi(RATE * 0.4)) if kind == "bus" else horn.slice(roundi(RATE * 0.04), roundi(RATE * 0.11))
		var strongest := AudioMeasure.peak(window, 150.0, 1100.0, 1.0)
		var matches := false
		for n: Array in notes:
			var hz: float = n[0]
			matches = matches or AudioMeasure.near(strongest, hz, 0.03) or AudioMeasure.near(strongest, hz * 2.0, 0.03)
		assert_true(matches, "%s horn peaks at %.0f Hz, notes %s" % [kind, strongest, notes])
		assert_true(AudioMeasure.rms(horn) > 0.01, "%s horn is heard" % kind)
		assert_false(peaks.has(strongest), "%s horn's peak is not another's" % kind)
		peaks[strongest] = kind
	# "pee-peep": the auto's horn is silent between its taps.
	var auto := Synth.horn("auto")
	var tap := AudioMeasure.rms(auto, roundi(RATE * 0.02), roundi(RATE * 0.1))
	var gap := AudioMeasure.rms(auto, roundi(RATE * 0.135), roundi(RATE * 0.18))
	assert_true(gap < tap * 0.1, "the auto's gap %.4f vs tap %.4f" % [gap, tap])
	assert_true(Synth.horn("bus").size() > Synth.horn("car").size(), "the bus's air horn lasts longest")
	return true


func test_wet_footsteps_splash_and_doors_differ() -> bool:
	var dry := Synth.footstep(1, 0.3, false)
	var wet := Synth.footstep(1, 0.3, true)
	# The splash is high: more energy above 3 kHz.
	var high := func(s: PackedFloat32Array) -> float:
		var f := Synth.Biquad.new("highpass", 3000.0, 0.707)
		var out := PackedFloat32Array()
		out.resize(s.size())
		for i in s.size():
			out[i] = f.run(s[i])
		return AudioMeasure.rms(out)
	assert_true(float(high.call(wet)) > float(high.call(dry)) * 1.5, "a wet step splashes")
	var car := AudioMeasure.peak(Synth.door("car"), 40.0, 400.0, 1.0)
	var bus := AudioMeasure.rms(Synth.door("bus"), roundi(RATE * 0.06), roundi(RATE * 0.15))
	var thunk := AudioMeasure.rms(Synth.door("car"), roundi(RATE * 0.06), roundi(RATE * 0.15))
	assert_true(car < 150.0, "a car door thunks low (%.0f Hz)" % car)
	assert_true(bus > thunk * 3.0, "a bus's air door hisses on after a car door has shut (%.4f vs %.4f)" % [bus, thunk])
	return true
