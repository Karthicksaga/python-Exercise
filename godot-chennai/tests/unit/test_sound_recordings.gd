extends TestCase
## The recorded and synthesised sounds of phase 6 (G-370…G-379): every sound the owner listed
## exists, loops wrap without a click, loudness is in range, nothing clips, the sizes stay inside
## the budget, and every shipped sound has its row and (CC-BY) its credit.
##
## Loop wraps, loudness and clipping are measured on the decoded files by
## `tools/audio/audio_dsp.py` when they are made and stored in the manifest (`metrics`, with the
## file's sha256); `tools/audio/test_audio_files.py` measures the files again from scratch. Here the
## stored numbers are held to the limits and tied to the shipped bytes by the hash.

## Every sound the sounds task listed (the engines are checked by `test_engine_sound.gd`).
const LISTED: PackedStringArray = [
	"rail.horn.emu", "rail.rumble", "rail.clatter", "rail.squeal", "rail.door.chime", "rail.door.open", "rail.door.close",
	"rail.announce", "crossing.bell", "crossing.boom",
	"engine.auto.start", "engine.auto.stop", "engine.bike.start", "engine.bike.stop", "engine.thumper.start", "engine.thumper.stop",
	"engine.bus.start", "engine.bus.stop", "engine.goods.start", "engine.goods.stop", "engine.ambulance.start", "engine.ambulance.stop",
	"horn.auto", "horn.bike", "horn.thumper", "horn.bus", "horn.goods", "door.bus", "bus.airbrake",
	"bed.market", "bed.tea", "bell.temple", "bird.crow.0", "bird.crow.1", "bird.crow.2",
]
## Loop wrap: the step across the loop point against an ordinary step (1 is a clean wrap).
const MAX_LOOP_JUMP := 5.0
## A sound plays at most this loud (peak dBFS after the Ogg encode) and averages in this range (RMS dBFS).
const MAX_PEAK_DB := -1.0
const RMS_RANGE := Vector2(-46.0, -8.0)
## What a "-16 LUFS" sound may measure (a peaky sound is limited by its peak, not its loudness).
const LUFS_TARGET := -16.0
const LUFS_TOLERANCE := 3.0
const LUFS_PEAK_LIMITED_FLOOR := -26.0
## G-370: new audio stays under 6 MB; the sound folder was 2.9 MB before it.
const AUDIO_BUDGET_BYTES := 8_900_000

var lib: SoundLibrary


func before_each() -> void:
	lib = SoundLibrary.new()


func _files(dir: String) -> PackedStringArray:
	var out := PackedStringArray()
	for f in DirAccess.get_files_at(dir):
		if f.get_extension() in ["wav", "ogg"]:
			out.append(dir.path_join(f))
	for sub in DirAccess.get_directories_at(dir):
		out.append_array(_files(dir.path_join(sub)))
	return out


func _phase6(id: String) -> bool:
	return str(lib.entry(id).get("path", "")).contains("/rec/") or str(lib.entry(id).get("path", "")).contains("/synthetic/")


func test_every_listed_sound_exists_and_loads() -> bool:
	for id in LISTED:
		assert_true(lib.has(id), "%s is in the manifest" % id)
		assert_true(FileAccess.file_exists(lib.path_of(id)), "%s: the file is there" % id)
		assert_true(lib.stream(id) != null, "%s loads" % id)
	for kind: String in ["auto", "bike", "thumper", "bus", "goods", "ambulance"]:
		assert_true(lib.engine_points(kind).size() >= 6, "%s has its loops" % kind)
	return true


func test_loops_are_marked_and_loop() -> bool:
	for id: String in ["rail.rumble", "rail.clatter", "rail.squeal", "crossing.bell", "bed.market", "bed.tea"]:
		assert_true(bool(lib.entry(id).get("loop", false)), "%s is a loop" % id)
		var s := lib.stream(id)
		assert_true(s is AudioStreamOggVorbis and (s as AudioStreamOggVorbis).loop, "%s repeats" % id)
	for id: String in ["rail.horn.emu", "rail.announce", "bell.temple", "crossing.boom", "horn.bus", "bus.airbrake"]:
		assert_false(bool(lib.entry(id).get("loop", false)), "%s plays once" % id)
	return true


func test_stored_metrics_match_the_shipped_bytes() -> bool:
	var checked := 0
	for id: String in lib.entries:
		if not _phase6(id):
			continue
		var m: Dictionary = lib.entry(id).get("metrics", {})
		assert_true(not m.is_empty(), "%s has its measurements" % id)
		if m.is_empty():
			continue
		assert_eq(FileAccess.get_sha256(lib.path_of(id)), str(m.get("sha256", "")), "%s: the file is the one that was measured" % id)
		checked += 1
	assert_true(checked >= 20, "the phase 6 files were checked (%d)" % checked)
	return true


func test_phase6_sounds_are_mono_loop_cleanly_and_are_not_clipped_or_too_quiet() -> bool:
	for id: String in lib.entries:
		if not _phase6(id):
			continue
		var e := lib.entry(id)
		var m: Dictionary = e.get("metrics", {})
		if m.is_empty():
			continue
		assert_eq(int(m["channels"]), 1, "%s is mono" % id)
		assert_true(float(m["peak_db"]) <= MAX_PEAK_DB, "%s: peak %.1f dBFS does not clip" % [id, m["peak_db"]])
		assert_true(float(m["rms_db"]) >= RMS_RANGE.x and float(m["rms_db"]) <= RMS_RANGE.y, "%s: RMS %.1f dBFS in range" % [id, m["rms_db"]])
		if bool(e.get("loop", false)):
			assert_true(float(m["loop_jump"]) <= MAX_LOOP_JUMP, "%s: loop point step %.2f x an ordinary step" % [id, m["loop_jump"]])
		var norm := str(e.get("normalised", ""))
		if norm.begins_with("-16 LUFS"):
			var lufs := float(m["lufs"])
			if norm.contains("peak limited"):
				assert_true(lufs >= LUFS_PEAK_LIMITED_FLOOR and lufs <= LUFS_TARGET + LUFS_TOLERANCE, "%s: %.1f LUFS (peak limited)" % [id, lufs])
			else:
				assert_true(absf(lufs - LUFS_TARGET) <= LUFS_TOLERANCE, "%s: %.1f LUFS near %.0f" % [id, lufs, LUFS_TARGET])
	return true


func test_wav_loops_wrap_without_a_click_in_the_samples() -> bool:
	# The engine loops are WAV, so the wrap is measured here on the samples themselves.
	var checked := 0
	for id: String in lib.entries:
		if not _phase6(id) or lib.path_of(id).get_extension() != "wav":
			continue
		var s := lib.source_samples(id)
		assert_true(s.size() > 1000, "%s has samples" % id)
		var jump := absf(s[0] - s[s.size() - 1])
		var sum := 0.0
		for i in range(1, s.size()):
			sum += (s[i] - s[i - 1]) * (s[i] - s[i - 1])
		var typical := sqrt(sum / float(s.size() - 1))
		assert_true(jump <= typical * 4.0, "%s: wrap step %.4f vs ordinary %.4f" % [id, jump, typical])
		var peak := 0.0
		for v in s:
			peak = maxf(peak, absf(v))
		assert_true(peak <= 0.9, "%s does not clip (%.2f)" % [id, peak])
		checked += 1
	assert_true(checked >= 20, "engine loops measured (%d)" % checked)
	return true


func test_new_audio_stays_inside_the_size_budget() -> bool:
	var total := 0
	for path in _files("res://assets/audio"):
		total += FileAccess.get_file_as_bytes(path).size()
	assert_true(total <= AUDIO_BUDGET_BYTES, "assets/audio is %.2f MB, budget %.1f MB (2.9 + 6)" % [total / 1e6, AUDIO_BUDGET_BYTES / 1e6])
	return true


func _row_for(licences: String, rel: String) -> bool:
	return licences.contains("`%s`" % rel)


func test_every_recording_and_synthetic_sound_has_its_own_licence_row() -> bool:
	var licences := FileAccess.get_file_as_string("res://assets/LICENSES.md")
	var n := 0
	for id: String in lib.entries:
		if not _phase6(id):
			continue
		var rel := lib.path_of(id).trim_prefix("res://")
		assert_true(_row_for(licences, rel), "%s has a row of its own in assets/LICENSES.md" % rel)
		n += 1
	assert_true(n >= 40, "phase 6 sounds checked (%d)" % n)
	# The check can fail: a file with no row is caught.
	assert_false(_row_for(licences, "assets/audio/rec/no_such_sound.ogg"), "a sound with no row fails")
	# Every file under assets/audio has a manifest row (a shipped sound cannot slip in unlisted).
	var by_path := {}
	for id: String in lib.entries:
		by_path[lib.path_of(id)] = true
	for path in _files("res://assets/audio"):
		check(by_path.has(path), "%s is in the manifest" % path)
	return true


func test_recordings_name_their_source_and_cc_by_is_credited_on_the_about_page() -> bool:
	var text := SoundCredits.text(lib)
	var credited := 0
	for id: String in lib.entries:
		var e := lib.entry(id)
		if str(e.get("source", "")) != "recording":
			continue
		for field: String in ["url", "author", "original", "licence", "edits"]:
			check(str(e.get(field, "")) != "", "%s: recording names its %s" % [id, field])
		check(str(e["url"]).begins_with("https://"), "%s: the source is a link" % id)
		if str(e["licence"]).begins_with("CC-BY"):
			check(text.contains(str(e["author"])), "%s: %s is credited on the About page" % [id, e["author"]])
			credited += 1
	assert_true(credited >= 5, "CC-BY recordings are credited (%d)" % credited)
	assert_contains(text, "synthesised", "the page says what is synthetic")
	return true


func test_synthetic_sounds_are_flagged_and_original() -> bool:
	var n := 0
	for id: String in lib.entries:
		if not str(lib.path_of(id)).contains("/synthetic/"):
			continue
		var e := lib.entry(id)
		assert_eq(str(e["source"]), "synth", "%s is marked synthetic" % id)
		assert_eq(str(e["licence"]), "CC0-1.0", "%s is original work" % id)
		n += 1
	assert_true(n >= 5, "synthetic sounds found (%d)" % n)
	return true
