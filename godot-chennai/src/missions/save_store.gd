## The save file (G-43): one JSON file in `user://` whose top-level keys are the Three.js game's
## localStorage keys, each holding the same JSON it stored, so a save carries over 1:1:
##   "cow-progress-v1"  {completed: [stage ids], money, life: {...}}  (MissionRunner, Life)
##   "cow-jobs-v1"      {reputation, done, failed, best}               (JobRunner.record())
##   "cow-weapons-v1"   {owned, ammo, gun}                             (Arsenal.save())
##   "cow-districts-v1" [names]                                        (VisitedDistricts)
##   "cow-hour-v1"      game hour (number)                             (DayClock)
##   "cow-weather-v1"   "clear" | "rain"
## Writes go to a temporary file first and are then renamed, so a crash mid-write keeps the old
## save. A missing or damaged file loads as a new game. The path is injected (tests use their own).
class_name SaveStore
extends RefCounted

const DEFAULT_PATH := "user://chennai-save-v1.json"
const PROGRESS := "cow-progress-v1"
const JOBS := "cow-jobs-v1"
const WEAPONS := "cow-weapons-v1"
const DISTRICTS := "cow-districts-v1"
const HOUR := "cow-hour-v1"
const WEATHER := "cow-weather-v1"

var path: String
var data: Dictionary = {}


func _init(file_path: String = DEFAULT_PATH) -> void:
	path = file_path


## Read the file; a missing or damaged one gives an empty save. Returns self.
func read() -> SaveStore:
	data = {}
	if FileAccess.file_exists(path):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
		if parsed is Dictionary:
			data = parsed
	return self


## Write the file (temporary file, then rename). Returns OK or the error.
func write() -> Error:
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	f.store_string(JSON.stringify(data, " "))
	f.close()
	return DirAccess.rename_absolute(tmp, path)


func section(key: String, fallback: Variant = null) -> Variant:
	return data.get(key, fallback)


func set_section(key: String, value: Variant) -> void:
	data[key] = value


## The stage progress {completed, money} as MissionRunner takes it, or {} for a new game
## (the TS `loadProgress`: both fields must be there and of the right type).
func progress() -> Dictionary:
	var p: Variant = data.get(PROGRESS)
	if p is Dictionary and p.get("completed") is Array and (p.get("money") is float or p.get("money") is int):
		var ids: Array = []
		for id: Variant in p["completed"]:
			ids.append(str(id))
		return {"completed": ids, "money": p["money"]}
	return {}


## Store MissionRunner.progress(), keeping the save's other fields (the `life` state).
func save_progress(progress_now: Dictionary) -> void:
	var rest: Variant = data.get(PROGRESS)
	var merged: Dictionary = (rest as Dictionary).duplicate(true) if rest is Dictionary else {}
	merged.merge(progress_now, true)
	data[PROGRESS] = merged
