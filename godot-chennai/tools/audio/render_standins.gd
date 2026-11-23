extends SceneTree
## Renders the synthesised stand-in sounds (decision G-81) into `assets/audio/standin/` and
## writes their rows in `assets/audio/manifest.json`. Entries that already point at a recording
## (`source: "recording"`) are left alone, so this never overwrites a real sound.
##
##     godot --headless --audio-driver Dummy --path . --script res://tools/audio/render_standins.gd
##
## Engine loops stay 16-bit PCM WAV (sample-accurate loop points, read back by the tests); every
## other sound is converted to OGG Vorbis with ffmpeg (q 3, mono, 22.05 kHz) to keep the APK small.
## Then run `godot --headless --path . --import` so Godot picks the files up.

const DIR := "res://assets/audio/standin"
const LICENCE := "CC0-1.0"
const AUTHOR := "Chennai Open World project (synthesised by tools/audio/render_standins.gd)"

var manifest: Dictionary = {}
var files: Dictionary = {}
var made := 0
var kept := 0


func _initialize() -> void:
	var text := FileAccess.get_file_as_string(SoundLibrary.MANIFEST)
	var parsed: Variant = JSON.parse_string(text) if text != "" else null
	if parsed is Dictionary:
		manifest = parsed
	var old: Variant = manifest.get("files", {})
	if old is Dictionary:
		files = old
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path(DIR))
	var started := Time.get_ticks_msec()
	_engines()
	_horns_and_vehicles()
	_people()
	_ambience()
	_cues()
	manifest["version"] = 1
	manifest["about"] = "Every sound file the game plays (SoundLibrary, decision G-82). source: recording or synth (stand-in). Licence rows also in assets/LICENSES.md."
	manifest["files"] = _sorted(files)
	var out := FileAccess.open(SoundLibrary.MANIFEST, FileAccess.WRITE)
	out.store_string(JSON.stringify(manifest, "  ", false) + "\n")
	out.close()
	print("render_standins: %d stand-ins written, %d recordings kept (%d ms)" % [made, kept, Time.get_ticks_msec() - started])
	quit()


func _sorted(d: Dictionary) -> Dictionary:
	var keys := d.keys()
	keys.sort()
	var out := {}
	for k: String in keys:
		out[k] = d[k]
	return out


## Writes one stand-in unless a recording owns the id.
func _put(id: String, samples: PackedFloat32Array, loop: bool, extra: Dictionary, what: String, wav: bool = false) -> void:
	var existing: Variant = files.get(id, {})
	if existing is Dictionary and str((existing as Dictionary).get("source", "")) == "recording":
		kept += 1
		return
	var base := DIR.path_join(id.replace(".", "_"))
	var wav_path := base + ".wav"
	var stream := Synth.to_stream(samples, loop)
	stream.save_to_wav(ProjectSettings.globalize_path(wav_path))
	var path := wav_path
	if not wav:
		path = base + ".ogg"
		var args := PackedStringArray(["-hide_banner", "-loglevel", "error", "-y", "-i", ProjectSettings.globalize_path(wav_path), "-ac", "1", "-ar", "22050", "-c:a", "libvorbis", "-q:a", "3", ProjectSettings.globalize_path(path)])
		var code := OS.execute("ffmpeg", args)
		if code != 0:
			push_error("ffmpeg failed for %s" % id)
			path = wav_path
		else:
			DirAccess.remove_absolute(ProjectSettings.globalize_path(wav_path))
	var row := {"path": path, "loop": loop, "what": what, "source": "synth", "licence": LICENCE, "author": AUTHOR,
		"url": "", "original": "", "edits": "Synthesised (Synth.%s); no recording yet" % what.get_slice(" ", 0),
		"rms": snappedf(_rms(samples), 0.00001), "seconds": snappedf(samples.size() / float(Synth.RATE), 0.001)}
	row.merge(extra)
	files[id] = row
	made += 1


static func _rms(samples: PackedFloat32Array) -> float:
	var sum := 0.0
	for v in samples:
		sum += v * v
	return sqrt(sum / maxi(1, samples.size()))


func _engines() -> void:
	for kind in SoundProfiles.KINDS:
		var p := SoundProfiles.engine(kind)
		for i in SoundProfiles.RPM_POINTS.size():
			var rpm := SoundProfiles.point_rpm(p, SoundProfiles.RPM_POINTS[i])
			for on: bool in [false, true]:
				var r := Synth.engine_loop(kind, rpm, 1.0 if on else 0.0, 100 + i * 2 + int(on))
				var load := "on" if on else "off"
				_put("engine.%s.loop.%d.%s" % [kind, i, load], r["samples"], true,
					{"category": "engine", "kind": kind, "rpm": snappedf(float(r["rpm"]), 0.001), "load": load}, "engine_loop %s %d rpm %s-load" % [kind, roundi(float(r["rpm"])), load], true)
		_put("engine.%s.start" % kind, Synth.engine_start(kind), false, {"category": "engine", "kind": kind}, "engine_start %s" % kind)
		_put("engine.%s.stop" % kind, Synth.engine_stop(kind), false, {"category": "engine", "kind": kind}, "engine_stop %s" % kind)


func _horns_and_vehicles() -> void:
	for kind in SoundProfiles.KINDS:
		_put("horn.%s" % kind, Synth.horn(kind), false, {"category": "horn", "kind": kind}, "horn %s" % kind)
	for kind: String in ["car", "ambulance", "bus", "auto"]:
		_put("door.%s" % kind, Synth.door(kind), false, {"category": "door", "kind": kind}, "door %s" % kind)
	_put("vehicle.gear", Synth.gear_clunk(), false, {"category": "vehicle"}, "gear_clunk")
	_put("vehicle.crash.light", Synth.crash(0.4), false, {"category": "vehicle"}, "crash light")
	_put("vehicle.crash.heavy", Synth.crash(1.0), false, {"category": "vehicle"}, "crash heavy")
	_put("vehicle.skid", Synth.skid(), true, {"category": "vehicle"}, "skid loop")
	_put("vehicle.wind", Synth.noise_bed(2.0, [["lowpass", 300.0, 0.707]], 2.5, 31), true, {"category": "vehicle"}, "noise_bed wind and tyres")
	_put("siren.ambulance", Synth.siren(false), true, {"category": "siren"}, "siren ambulance")
	_put("siren.police", Synth.siren(true), true, {"category": "siren"}, "siren police")


func _people() -> void:
	for i in 4:
		_put("step.dry.%d" % i, Synth.footstep(200 + i, 0.3, false), false, {"category": "footstep"}, "footstep dry")
		_put("step.wet.%d" % i, Synth.footstep(300 + i, 0.3, true), false, {"category": "footstep"}, "footstep wet")
	_put("step.land", Synth.landing(), false, {"category": "footstep"}, "landing")


func _ambience() -> void:
	_put("bed.city", Synth.noise_bed(4.0, [["lowpass", 220.0, 0.7], ["lowpass", 160.0, 0.7]], 3.0, 41), true, {"category": "ambience"}, "noise_bed city hum")
	_put("bed.rain", Synth.noise_bed(3.0, [["highpass", 900.0, 0.7], ["lowpass", 7000.0, 0.7]], 0.5, 43), true, {"category": "ambience"}, "noise_bed rain")
	_put("bed.sea", Synth.sea(), true, {"category": "ambience"}, "sea waves")
	_put("bed.crickets", Synth.crickets(), true, {"category": "ambience"}, "crickets")
	for i in 3:
		_put("bird.crow.%d" % i, Synth.crow(500 + i), false, {"category": "ambience"}, "crow")
	for i in 2:
		_put("bird.koel.%d" % i, Synth.koel(600 + i), false, {"category": "ambience"}, "koel")


func _cues() -> void:
	for name: String in ["cash", "chime", "fanfare", "fail", "punch", "shot", "hurt", "click"]:
		_put("cue.%s" % name, Synth.cue(name), false, {"category": "cue"}, "cue %s" % name)
