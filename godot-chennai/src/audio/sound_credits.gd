class_name SoundCredits
extends RefCounted
## The credits of the sound recordings that need them (G-377): every CC-BY recording in
## `assets/audio/manifest.json` is named with its author, licence and where it came from, for the
## ABOUT page. CC0 and public-domain recordings need no credit and are thanked in one line.
## Recordings are listed once per original file (an engine cut into loops is one credit).


## The ABOUT lines: one per credited original file, then a line for the rest.
static func lines(library: SoundLibrary) -> PackedStringArray:
	var by_original: Dictionary = {}
	var free := 0
	var synth := 0
	for id: String in library.entries:
		var e := library.entry(id)
		if str(e.get("source", "")) != "recording":
			synth += 1
			continue
		var licence := str(e.get("licence", ""))
		if not licence.begins_with("CC-BY"):
			free += 1
			continue
		var key := "%s|%s" % [str(e.get("original", "")), licence]
		by_original[key] = e
	var keys: Array = by_original.keys()
	keys.sort()
	var out := PackedStringArray()
	for key: String in keys:
		var e: Dictionary = by_original[key]
		out.append("%s: %s, %s, %s" % [_name(str(e.get("original", ""))), str(e.get("author", "")), _licence(str(e.get("licence", ""))), _site(str(e.get("url", "")))])
	if free > 0:
		out.append("%d more recordings are CC0 or public domain (OpenGameArt, Wikimedia Commons); thanks to their authors." % free)
	if synth > 0:
		out.append("The other %d sounds are synthesised for this game." % synth)
	return out


static func text(library: SoundLibrary = null) -> String:
	var lib := library if library != null else SoundLibrary.new()
	return "Sound recordings, with thanks:\n" + "\n".join(lines(lib))


static func _name(original: String) -> String:
	return original.get_basename().replace("_", " ")


## "CC-BY-4.0" as "CC BY 4.0".
static func _licence(id: String) -> String:
	return id.replace("CC-BY-", "CC BY ").replace("CC0-1.0", "CC0")


static func _site(url: String) -> String:
	if url.contains("opengameart.org"):
		return "OpenGameArt"
	if url.contains("commons.wikimedia.org"):
		return "Wikimedia Commons"
	return url
