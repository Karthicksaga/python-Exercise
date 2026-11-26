class_name SoundLibrary
extends RefCounted
## Every sound the game plays, by id, from `assets/audio/manifest.json` (decision G-82). Each
## entry names its file, what it is (engine loops carry their rpm and load), where it came from
## and its licence. Recordings and synthesised stand-ins look the same here: a kind without an
## acceptable recording keeps its stand-in (`source: "synth"`), and swapping in a recording is a
## manifest change, not a code change.
##
## Loading: `request_all()` starts threaded loads of every file (call it at boot); `stream()` then
## returns a file once it has arrived, or loads it on the spot if asked before (a small hitch,
## logged once).

const MANIFEST := "res://assets/audio/manifest.json"
const FORBIDDEN_LICENCES: PackedStringArray = ["NC", "ND", "Sampling+", "RemArc"]

var entries: Dictionary = {}
var error: String = ""
var _streams: Dictionary = {}
var _requested: Dictionary = {}
## Paths requested for a threaded load and not taken yet.
var _pending: Dictionary = {}


func _init(path: String = MANIFEST) -> void:
	var text := FileAccess.get_file_as_string(path)
	if text == "":
		error = "No sound manifest at %s." % path
		return
	var parsed: Variant = JSON.parse_string(text)
	if not parsed is Dictionary:
		error = "The sound manifest %s is not a JSON object." % path
		return
	var files: Variant = (parsed as Dictionary).get("files", {})
	if files is Dictionary:
		entries = files


func has(id: String) -> bool:
	return entries.has(id)


func entry(id: String) -> Dictionary:
	return entries.get(id, {})


func path_of(id: String) -> String:
	return str(entry(id).get("path", ""))


## Starts a threaded load of every file (no waiting).
func request_all() -> void:
	for id: String in entries:
		var path := path_of(id)
		if path != "" and not _requested.has(path) and ResourceLoader.exists(path):
			if ResourceLoader.load_threaded_request(path, "AudioStream") == OK:
				_requested[path] = true
				_pending[path] = true


## Takes every load still pending and lets go of it (G-456): a threaded request nobody collects stays in
## the loader to the end of the run and shows up as a leaked object at exit, one for each of the
## library's files. Waits for loads still under way, so only a run that is about to end calls it.
func drain() -> void:
	for path: String in _pending.keys():
		ResourceLoader.load_threaded_get(path)
	_pending.clear()


## The stream for an id, or null. Never blocks on a load already under way unless it is needed now.
func stream(id: String) -> AudioStream:
	if _streams.has(id):
		return _streams[id]
	var path := path_of(id)
	if path == "":
		return null
	var s: AudioStream = null
	if _pending.has(path):
		_pending.erase(path)
		s = ResourceLoader.load_threaded_get(path) as AudioStream
	else:
		s = load(path) as AudioStream
	if s == null:
		return null
	if bool(entry(id).get("loop", false)):
		_set_loop(s)
	_streams[id] = s
	return s


static func _set_loop(s: AudioStream) -> void:
	if s is AudioStreamWAV:
		var w := s as AudioStreamWAV
		if w.loop_mode == AudioStreamWAV.LOOP_DISABLED:
			w.loop_mode = AudioStreamWAV.LOOP_FORWARD
			w.loop_begin = 0
			w.loop_end = roundi(w.get_length() * w.mix_rate)
	elif s is AudioStreamOggVorbis:
		(s as AudioStreamOggVorbis).loop = true


## Float samples of a library sound as stored in its source file (16-bit PCM WAV), for tests and
## previews. The game plays the imported copy (QOA-compressed WAV, decision G-82).
func source_samples(id: String) -> PackedFloat32Array:
	var path := path_of(id)
	if path.get_extension() != "wav":
		return PackedFloat32Array()
	var w := AudioStreamWAV.load_from_file(path, {"compress/mode": 0})
	return Synth.from_wav(w) if w != null else PackedFloat32Array()


## Ids starting with `prefix` (e.g. "step.wet."), sorted.
func ids_with(prefix: String) -> PackedStringArray:
	var out := PackedStringArray()
	for id: String in entries:
		if id.begins_with(prefix):
			out.append(id)
	out.sort()
	return out


## The engine loops of a kind: [{id, rpm, on_load}], sorted by rpm then off-load first.
func engine_points(kind: String) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for id in ids_with("engine.%s.loop." % kind):
		var e := entry(id)
		out.append({"id": id, "rpm": float(e.get("rpm", 0.0)), "on_load": str(e.get("load", "off")) == "on"})
	out.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		if float(a["rpm"]) != float(b["rpm"]):
			return float(a["rpm"]) < float(b["rpm"])
		return not bool(a["on_load"]) and bool(b["on_load"]))
	return out


## Which kinds still play synthesised stand-ins for their engine (for the report and the owner).
func synth_engine_kinds() -> PackedStringArray:
	var out := PackedStringArray()
	for kind in SoundProfiles.KINDS:
		for p in engine_points(kind):
			if str(entry(str(p["id"])).get("source", "")) == "synth":
				out.append(kind)
				break
	return out


## A licence string is acceptable for the game (CC0, public domain, CC-BY; CC-BY-SA only flagged).
static func licence_ok(licence: String) -> bool:
	if licence.strip_edges() == "":
		return false
	for bad in FORBIDDEN_LICENCES:
		if licence.contains(bad):
			return false
	return licence.begins_with("CC0") or licence.begins_with("CC-BY") or licence == "Public domain"
