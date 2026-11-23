class_name PeopleManifest
extends RefCounted
## Reads a people manifest (`people.json`: `{"people": [{"id", "file", "lod1"?, "heightM"?, ...}]}`),
## the schema of the Three.js game's `people.json` and of the new cast's manifest, so the
## player's model can be any person in it (decision G-63). File paths are relative to the
## manifest's folder; the legacy manifest's `people/x.glb` (relative to the old
## `assets/models/`) resolves to `x.glb` beside it.

const LEGACY := "res://assets/people/legacy/people.json"
## The player's model when no person is chosen: the Three.js game's player.
const DEFAULT_PLAYER := "res://assets/people/legacy/player.glb"

var path: String = ""
var entries: Array[Dictionary] = []


static func open(manifest_path: String) -> PeopleManifest:
	var m := PeopleManifest.new()
	m.path = manifest_path
	var text := FileAccess.get_file_as_string(manifest_path)
	var data: Variant = JSON.parse_string(text)
	if data is Dictionary and (data as Dictionary).get("people") is Array:
		for e: Variant in (data as Dictionary)["people"] as Array:
			if e is Dictionary and (e as Dictionary).has("id") and (e as Dictionary).has("file"):
				m.entries.append(e as Dictionary)
	return m


func ids() -> PackedStringArray:
	var out := PackedStringArray()
	for e in entries:
		out.append(str(e["id"]))
	return out


func entry(id: String) -> Dictionary:
	for e in entries:
		if str(e["id"]) == id:
			return e
	return {}


## The model file of person `id` as a res:// path, or "" when unknown or missing.
func model_path(id: String) -> String:
	var e := entry(id)
	if e.is_empty():
		return ""
	var dir := path.get_base_dir()
	var file := str(e["file"])
	for candidate: String in [dir.path_join(file), dir.path_join(file.get_file())]:
		if ResourceLoader.exists(candidate):
			return candidate
	return ""


## Height in metres the manifest gives person `id`, or 0 when it gives none.
func height(id: String) -> float:
	return float(entry(id).get("heightM", 0.0))
