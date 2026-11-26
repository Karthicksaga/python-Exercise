class_name ContentKeys
extends RefCounted
## The translatable strings of the mission content (decision G-442), found the same way as
## `tools/i18n/content_keys.py` finds them: every string under a TEXT key (title, brief, label,
## ending, name, meaning, detail, where, and each value of `briefIf`) of the two content files has
## the key `c.<path>`, where an array element with an `id` is named by it and any other by its
## index (`c.missions.morning-walk.objectives.0.label`). The test compares this scan with the
## `c.` rows of `en.csv`, so a content change without a translation fails.

const DIR := "res://src/missions/content/"
const FILES: Array[String] = ["content.json", "missions_v2.json"]
const TEXT_KEYS: Array[String] = ["title", "brief", "label", "ending", "name", "meaning", "detail", "where"]
const BRIEF_IF := "briefIf"


## key → English text, over both content files.
static func scan() -> Dictionary[String, String]:
	var out: Dictionary[String, String] = {}
	for f in FILES:
		var json := JSON.new()
		if json.parse(FileAccess.get_file_as_string(DIR + f)) != OK:
			continue
		_walk(json.data, "", "", out)
	return out


static func _walk(node: Variant, path: String, parent_key: String, out: Dictionary[String, String]) -> void:
	if node is Dictionary:
		var d: Dictionary = node
		for k: Variant in d:
			var key := str(k)
			var v: Variant = d[k]
			if v is String and key != BRIEF_IF and (TEXT_KEYS.has(key) or parent_key == BRIEF_IF):
				out["c.%s.%s" % [path, key] if path != "" else "c.%s" % key] = v as String
			elif v is Dictionary or v is Array:
				_walk(v, "%s.%s" % [path, key] if path != "" else key, key, out)
	elif node is Array:
		var list: Array = node
		for i in list.size():
			var item: Variant = list[i]
			var item_name := str(i)
			if item is Dictionary and (item as Dictionary).get("id") is String:
				item_name = (item as Dictionary)["id"]
			_walk(item, "%s.%s" % [path, item_name], parent_key, out)
