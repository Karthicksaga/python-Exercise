extends TestCase
## Sample-based engines (G-83): the game's own loop files, blended and pitch-shifted exactly as
## `EngineVoice` plays them, rendered offline and measured (the Three.js `sound.spec` approach).

const RATE := Synth.RATE

var lib: SoundLibrary


func before_each() -> void:
	lib = SoundLibrary.new()


func _loops(kind: String) -> Array[PackedFloat32Array]:
	var out: Array[PackedFloat32Array] = []
	for p in lib.engine_points(kind):
		out.append(lib.source_samples(str(p["id"])))
	return out


func _render(kind: String, rpm: Callable, throttle: Callable, seconds: float) -> PackedFloat32Array:
	return EngineBlend.render(lib.engine_points(kind), _loops(kind), rpm, throttle, seconds)


func _steady(kind: String, rpm: float, throttle: float, seconds: float = 1.0) -> PackedFloat32Array:
	return _render(kind, func(_t: float) -> float: return rpm, func(_t: float) -> float: return throttle, seconds)


func test_every_kind_has_loops_at_four_rpm_points_on_and_off_load() -> bool:
	for kind in SoundProfiles.KINDS:
		var points := lib.engine_points(kind)
		assert_eq(points.size(), 8, "%s: 4 rpm points × off/on load" % kind)
		for p in points:
			var s := lib.source_samples(str(p["id"]))
			check(s.size() > RATE / 4, "%s: %s has samples" % [kind, p["id"]])
			check(lib.stream(str(p["id"])) != null, "%s: %s loads" % [kind, p["id"]])
		assert_true(lib.has("engine.%s.start" % kind) and lib.has("engine.%s.stop" % kind), "%s: start and stop one-shots" % kind)
	return true


func test_each_engine_idles_on_its_own_note_and_revs_up_when_driven() -> bool:
	var idle := {}
	for kind in SoundProfiles.KINDS:
		var p := SoundProfiles.engine(kind)
		var designed := SoundProfiles.firing_hz(p, p["idle_rpm"])
		var still := _steady(kind, p["idle_rpm"], 0.0)
		var measured := AudioMeasure.peak(still, 5.0, 120.0, 0.5)
		idle[kind] = measured
		assert_true(AudioMeasure.near(measured, designed, 0.08), "%s idles at %.1f Hz, designed %.1f" % [kind, measured, designed])
		assert_true(AudioMeasure.rms(still) > 0.005, "%s is heard at idle" % kind)
		var driven := _steady(kind, SoundProfiles.engine_rpm(p, 8.0, 1.0), 1.0)
		assert_true(AudioMeasure.peak(driven, 5.0, 400.0, 0.5) > measured * 2.0, "%s revs up at 8 m/s" % kind)
	for i in SoundProfiles.KINDS.size():
		for j in range(i + 1, SoundProfiles.KINDS.size()):
			var a: float = idle[SoundProfiles.KINDS[i]]
			var b: float = idle[SoundProfiles.KINDS[j]]
			assert_true(absf(a - b) / maxf(a, b) > 0.1, "%s and %s idle apart" % [SoundProfiles.KINDS[i], SoundProfiles.KINDS[j]])
	# The bus is the loudest engine at idle, the small bike quieter (with the profiles' volumes).
	var level := func(kind: String) -> float:
		var p := SoundProfiles.engine(kind)
		return AudioMeasure.rms(_steady(kind, p["idle_rpm"], 0.0, 0.6)) * float(p["volume"])
	assert_true(float(level.call("bus")) > float(level.call("car")), "bus louder than car at idle")
	assert_true(float(level.call("bike")) < float(level.call("bus")), "bike quieter than bus")
	return true


func test_pitch_tracks_rpm_between_the_sample_points() -> bool:
	for kind: String in ["car", "auto", "bus", "thumper"]:
		var p := SoundProfiles.engine(kind)
		for share: float in [0.15, 0.45, 0.8]:
			var rpm := SoundProfiles.point_rpm(p, share)
			var designed := SoundProfiles.firing_hz(p, rpm)
			var measured := AudioMeasure.peak(_steady(kind, rpm, 0.5, 0.8), 5.0, designed * 1.6, 0.5)
			assert_true(AudioMeasure.near(measured, designed, 0.06), "%s at %d rpm: %.1f Hz, designed %.1f" % [kind, rpm, measured, designed])
	return true


func test_crossfades_and_loop_wraps_do_not_click() -> bool:
	for kind in SoundProfiles.KINDS:
		var p := SoundProfiles.engine(kind)
		var idle: float = p["idle_rpm"]
		var top := float(p["shift_rpm"]) * 1.1
		# A full rev from idle past the change point with the accelerator coming in, through every point.
		var sweep := _render(kind, func(t: float) -> float: return lerpf(idle, top, clampf(t / 2.0, 0.0, 1.0)), func(t: float) -> float: return clampf(t / 1.5, 0.0, 1.0), 2.0)
		# Reference: the same voice held still at rpms along the way (no transitions in them).
		var reference := 0.0
		for k in 9:
			var share := k / 8.0
			reference = maxf(reference, AudioMeasure.max_curvature(_steady(kind, lerpf(idle, top, share), share, 0.25)))
		var worst := AudioMeasure.max_curvature(sweep)
		assert_true(worst <= reference * 1.3, "%s: largest jump in the sweep %.4f vs %.4f when held" % [kind, worst, reference])
		for loop in _loops(kind):
			var n := loop.size()
			var inside := AudioMeasure.max_curvature(loop)
			var wrap := maxf(absf(loop[0] - 2.0 * loop[n - 1] + loop[n - 2]), absf(loop[1] - 2.0 * loop[0] + loop[n - 1]))
			check(wrap <= inside * 1.01, "%s: loop wrap %.4f vs %.4f inside" % [kind, wrap, inside])
	return true


func test_blend_weights_are_equal_power_and_follow_the_accelerator() -> bool:
	var points := lib.engine_points("car")
	for rpm: float in [800.0, 1200.0, 2000.0, 3000.0, 3600.0]:
		for t: float in [0.0, 0.5, 1.0]:
			var power := 0.0
			for w in EngineBlend.weights(points, rpm, t):
				power += float(w["gain"]) * float(w["gain"])
			assert_near(power, 1.0, 0.001, "constant power at %d rpm, accelerator %.1f" % [rpm, t])
	var coasting := EngineBlend.weights(points, 800.0, 0.0)
	var pulling := EngineBlend.weights(points, 800.0, 1.0)
	assert_near(float(coasting[0]["gain"]), 1.0, 0.001, "coasting plays the off-load loop")
	assert_near(float(pulling[1]["gain"]), 1.0, 0.001, "pulling plays the on-load loop")
	var pitch: float = EngineBlend.weights(points, 1600.0, 0.0)[0]["pitch"]
	assert_near(pitch, 1600.0 / float(points[0]["rpm"]), 0.001, "pitch = rpm / the loop's rpm")
	return true
