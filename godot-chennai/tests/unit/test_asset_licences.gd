extends TestCase
## The whole game is open (owner, 24 Nov 2026; decision G-100): no asset may come from, or cite,
## Adobe Mixamo. Checks the licence table, every manifest and text file under res://assets, and
## the JSON part of every glTF binary (names, extras, generator). The bone names of MPFB's own
## `mixamo` skeleton (`mixamorig_Hips`...) are a naming convention, not a source, so the check is
## for the product name "Mixamo" (capital M).

const ROOT := "res://assets"
const WORD := "Mixamo"


func test_no_asset_cites_mixamo() -> bool:
	var files := _files(ROOT)
	check(files.size() > 100, "found the assets (%d files)" % files.size())
	var checked := 0
	for path in files:
		var ext := path.get_extension().to_lower()
		var text := ""
		if ext in ["md", "json", "txt", "gltf"]:
			text = FileAccess.get_file_as_string(path)
		elif ext == "glb":
			text = _glb_json(path)
		else:
			continue
		checked += 1
		check(not text.contains(WORD), "%s cites %s" % [path, WORD])
	check(checked > 50, "read the manifests, licences and glTF files (%d)" % checked)
	var licences := FileAccess.get_file_as_string(ROOT.path_join("LICENSES.md"))
	check(licences.contains("CC0"), "LICENSES.md lists CC0 sources")
	check(licences.contains("Universal Animation Library"), "LICENSES.md credits the CC0 locomotion source")
	return true


## The JSON chunk of a binary glTF (the first chunk, right after the 12-byte header).
func _glb_json(path: String) -> String:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null or f.get_length() < 20:
		return ""
	f.seek(12)
	var length := f.get_32()
	f.get_32()  # chunk type "JSON"
	return f.get_buffer(length).get_string_from_utf8()


func _files(dir: String) -> PackedStringArray:
	var out := PackedStringArray()
	for file in DirAccess.get_files_at(dir):
		out.append(dir.path_join(file))
	for sub in DirAccess.get_directories_at(dir):
		if not sub.begins_with("."):
			out.append_array(_files(dir.path_join(sub)))
	return out
