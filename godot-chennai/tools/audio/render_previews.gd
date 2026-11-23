extends SceneTree
## Renders listening previews (not committed): each vehicle kind's engine as the game plays it
## (its loops through EngineBlend: 2 s idle, a 4 s rev through the gears' range, 2 s back to idle)
## and copies of every horn, as WAV files in the folder given.
##
##     godot --headless --audio-driver Dummy --path . --script res://tools/audio/render_previews.gd -- --out=/tmp/previews

func _initialize() -> void:
	var out := "user://previews"
	for arg in OS.get_cmdline_user_args():
		if arg.begins_with("--out="):
			out = arg.trim_prefix("--out=")
	DirAccess.make_dir_recursive_absolute(out)
	var lib := SoundLibrary.new()
	for kind in SoundProfiles.KINDS:
		var p := SoundProfiles.engine(kind)
		var points := lib.engine_points(kind)
		var loops: Array[PackedFloat32Array] = []
		for point in points:
			loops.append(lib.source_samples(str(point["id"])))
		var idle: float = p["idle_rpm"]
		var top := float(p["shift_rpm"]) * 1.05
		var rpm := func(t: float) -> float:
			if t < 2.0:
				return idle
			if t < 6.0:
				return lerpf(idle, top, (t - 2.0) / 4.0)
			return lerpf(top, idle, clampf((t - 6.0) / 2.0, 0.0, 1.0))
		var throttle := func(t: float) -> float: return 1.0 if t >= 2.0 and t < 6.0 else 0.0
		var samples := EngineBlend.render(points, loops, rpm, throttle, 9.0)
		var gain := float(p["volume"]) * 4.0
		for i in samples.size():
			samples[i] = clampf(samples[i] * gain, -1.0, 1.0)
		var source := str(lib.entry(str(points[0]["id"])).get("source", ""))
		Synth.to_stream(samples, false).save_to_wav(out.path_join("engine_%s_%s.wav" % [kind, source]))
		var horn := lib.path_of("horn.%s" % kind)
		var horn_source := str(lib.entry("horn.%s" % kind).get("source", ""))
		OS.execute("ffmpeg", PackedStringArray(["-hide_banner", "-loglevel", "error", "-y", "-i", ProjectSettings.globalize_path(horn), out.path_join("horn_%s_%s.wav" % [kind, horn_source])]))
	print("previews in %s" % out)
	quit()
