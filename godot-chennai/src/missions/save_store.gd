## The save file (G-43): one JSON file in `user://` whose top-level keys are the Three.js game's
## localStorage keys, each holding the same JSON it stored, so a save carries over 1:1:
##   "cow-progress-v1"  {completed: [stage ids], money, life: {...}}  (MissionRunner, Life)
##   "cow-jobs-v1"      {reputation, done, failed, best}               (JobRunner.record())
##   "cow-weapons-v1"   {owned, ammo, gun}                             (Arsenal.save())
##   "cow-districts-v1" [names]                                        (VisitedDistricts)
##   "cow-hour-v1"      game hour (number)                             (GameClock)
##   "cow-weather-v1"   "clear" | "rain"
##   "chennai-heritage-v1" {order, count, done}                        (HeritageJournal, G-472)
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
## The heritage journal's own section (culture, G-472): not a Three.js key.
const HERITAGE := "chennai-heritage-v1"
## The sections the game's progress owns (NEW GAME clears them). Any other section on disk (the
## settings, the journal) is kept when this store writes, even if it was read before they were saved.
const PROGRESS_KEYS: Array[String] = [PROGRESS, JOBS, WEAPONS, DISTRICTS, HOUR, WEATHER]
## The save format version (G-142). 1: the Three.js keys only. 2: adds `medals`, `flags` and
## `extrasDone` inside `cow-progress-v1` for the medals, choices and extra missions. A file without
## the key is version 1 and is migrated when read (nothing is lost; the old keys are untouched).
const VERSION_KEY := "chennai-save-version"
const VERSION := 2

var path: String
var data: Dictionary = {}
## The version the file had when read (1 for a file from before the key, 0 for no file) and
## whether it was newer than this game knows (then it is left alone).
var read_version := 0
var too_new := false
## Sections this store set itself (`set_section`): they win over the file's copy when writing.
var _set_here: Dictionary[String, bool] = {}


func _init(file_path: String = DEFAULT_PATH) -> void:
	path = file_path


## Read the file; a missing or damaged one gives an empty save. Returns self.
func read() -> SaveStore:
	data = {}
	if FileAccess.file_exists(path):
		var json := JSON.new()
		if json.parse(FileAccess.get_file_as_string(path)) == OK and json.data is Dictionary:
			data = json.data
	_migrate()
	return self


## Bring an older file up to VERSION (in memory; the next write saves it).
func _migrate() -> void:
	if data.is_empty():
		read_version = 0
		return
	var found: Variant = data.get(VERSION_KEY, 1)
	read_version = int(found) if (found is int or found is float) else 1
	if read_version > VERSION:
		too_new = true
		return
	if read_version < 2:
		var p: Variant = data.get(PROGRESS)
		if p is Dictionary:
			var progress_dict: Dictionary = p
			if not progress_dict.has("medals"):
				progress_dict["medals"] = {}
			if not progress_dict.has("flags"):
				progress_dict["flags"] = {}
			if not progress_dict.has("extrasDone"):
				progress_dict["extrasDone"] = []


## The medals, choices and extra missions finished, as `MissionRunner.extras_state()` has them.
func extras() -> Dictionary:
	var p: Variant = data.get(PROGRESS)
	if not (p is Dictionary):
		return {}
	var d: Dictionary = p
	return {"medals": d.get("medals", {}), "flags": d.get("flags", {}), "extrasDone": d.get("extrasDone", [])}


func save_extras(state: Dictionary) -> void:
	var rest: Variant = data.get(PROGRESS)
	var merged: Dictionary = (rest as Dictionary).duplicate(true) if rest is Dictionary else {}
	merged.merge(state, true)
	data[PROGRESS] = merged


## Write the file (temporary file, then rename). Returns OK or the error.
func write() -> Error:
	if not too_new:
		data[VERSION_KEY] = VERSION
	_keep_other_sections()
	var tmp := path + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null:
		return FileAccess.get_open_error()
	f.store_string(JSON.stringify(data, " "))
	f.close()
	return DirAccess.rename_absolute(tmp, path)


## Sections other systems saved in the file since this store read it (settings, the heritage journal)
## stay as they are on disk: a store that holds the stage progress would otherwise write over them
## from its older copy. A section this store set itself, and the progress sections, are its own.
func _keep_other_sections() -> void:
	if too_new or not FileAccess.file_exists(path):
		return
	var json := JSON.new()
	if json.parse(FileAccess.get_file_as_string(path)) != OK or not (json.data is Dictionary):
		return
	var on_disk: Dictionary = json.data
	for key: Variant in on_disk:
		var k := str(key)
		if k == VERSION_KEY or _set_here.has(k) or PROGRESS_KEYS.has(k):
			continue
		data[k] = on_disk[key]


func section(key: String, fallback: Variant = null) -> Variant:
	return data.get(key, fallback)


func set_section(key: String, value: Variant) -> void:
	_set_here[key] = true
	data[key] = value


## The stage progress {completed, money} as MissionRunner takes it, or {} for a new game
## (the TS `loadProgress`: both fields must be there and of the right type).
func progress() -> Dictionary:
	var value: Variant = data.get(PROGRESS)
	if not (value is Dictionary):
		return {}
	var p: Dictionary = value
	var completed: Variant = p.get("completed")
	var money: Variant = p.get("money")
	if completed is Array and (money is float or money is int):
		var ids: Array = []
		for id: Variant in completed:
			ids.append(str(id))
		return {"completed": ids, "money": money}
	return {}


## Store MissionRunner.progress(), keeping the save's other fields (the `life` state).
func save_progress(progress_now: Dictionary) -> void:
	var rest: Variant = data.get(PROGRESS)
	var merged: Dictionary = (rest as Dictionary).duplicate(true) if rest is Dictionary else {}
	merged.merge(progress_now, true)
	data[PROGRESS] = merged
