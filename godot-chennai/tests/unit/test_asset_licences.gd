extends TestCase
## The whole game is open (owner, 24 Nov 2026; decision G-100): no asset may come from, or cite,
## Adobe Mixamo. Checks the licence table, every manifest and text file under res://assets, and
## the JSON part of every glTF binary (names, extras, generator). The bone names of MPFB's own
## `mixamo` skeleton (`mixamorig_Hips`...) are a naming convention, not a source, so the check is
## for the product name "Mixamo" (capital M).

const GaitFingerprint := preload("res://tests/support/gait_fingerprint.gd")
const ROOT := "res://assets"
const WORD := "Mixamo"
const GAITS: PackedStringArray = ["idle", "walk", "run"]
## A clip closer than this (degrees, GaitFingerprint.distance) to the Mixamo clip of the same name
## moves like it. Measured 24 Nov 2026: the Mixamo-era cast (retargeted, eased, re-baked, played
## 25% slow) was 2.1-3.4 (idle), 3.1-3.9 (walk), 5.3-5.9 (run) from these references; the CC0
## clips are 15.9-16.0, 10.4-10.9 and 22.1-22.3 away.
const MIXAMO_NEAR := 7.0
## The Mixamo idle, walk and run of the old `locomotion.glb` (git history before G-100) as
## GaitFingerprint values: joint angles only, not the clips (tests/tools/gait_fingerprints.gd).
const MIXAMO: Dictionary = {
	"idle": [12.1, 3.7, 9.8, 4.7, 12.9, 7.5, 12.1, 3.7, 9.7, 4.7, 12.9, 7.4, 12.1, 3.7, 9.8, 4.7, 12.8, 7.4, 12.2, 3.7, 9.9, 4.7, 12.8, 7.4, 12.2, 3.7, 9.9, 4.7, 12.7, 7.5, 12.2, 3.7, 9.9, 4.7, 12.8, 7.5, 12.2, 3.7, 9.9, 4.7, 12.8, 7.5, 12.2, 3.7, 9.9, 4.7, 12.8, 7.5, 12.2, 3.7, 9.9, 4.8, 12.8, 7.4, 12.2, 3.7, 9.8, 4.8, 12.8, 7.4, 12.2, 3.8, 9.7, 4.8, 12.9, 7.4, 12.1, 3.8, 9.6, 4.8, 12.9, 7.5, 12.1, 3.9, 9.6, 4.9, 12.9, 7.4, 12.0, 3.9, 9.6, 4.9, 12.8, 7.4, 12.0, 4.0, 9.7, 5.0, 12.9, 7.4, 12.0, 4.0, 9.8, 5.0, 12.9, 7.4, 11.9, 3.9, 9.9, 5.0, 12.9, 7.5, 11.9, 3.9, 10.0, 5.0, 12.9, 7.5, 12.0, 3.8, 10.0, 4.9, 12.8, 7.5, 12.1, 3.8, 10.0, 4.9, 12.8, 7.5, 12.1, 3.7, 10.0, 4.8, 12.8, 7.5, 12.1, 3.7, 10.0, 4.7, 12.8, 7.5, 12.0, 3.7, 9.8, 4.7, 12.8, 7.5, 12.0, 3.7, 9.8, 4.7, 12.8, 7.5],
	"walk": [68.7, 23.1, 21.5, 11.1, 36.3, 32.5, 60.0, 28.2, 21.1, 6.9, 32.6, 33.5, 47.3, 30.8, 21.5, 2.8, 32.0, 33.9, 33.6, 32.3, 21.1, -1.9, 31.0, 34.1, 23.5, 33.9, 19.2, -7.4, 26.9, 35.1, 22.4, 36.7, 18.1, -12.5, 24.9, 38.8, 23.7, 36.6, 19.3, -15.7, 25.8, 42.2, 21.6, 32.3, 24.4, -16.1, 24.8, 42.4, 22.9, 29.1, 36.5, -12.4, 26.4, 44.4, 25.1, 25.7, 51.5, -5.0, 27.7, 47.3, 25.6, 21.7, 62.5, 4.3, 27.9, 49.4, 23.9, 16.8, 67.4, 13.8, 27.1, 48.7, 22.6, 12.1, 64.8, 21.4, 27.1, 46.0, 22.0, 7.8, 56.4, 27.3, 29.2, 42.7, 21.8, 3.6, 44.2, 32.3, 32.7, 38.7, 22.6, -0.3, 30.0, 35.5, 38.0, 35.7, 25.2, -3.3, 22.6, 37.3, 45.8, 35.1, 29.1, -5.4, 26.1, 39.2, 54.6, 36.0, 31.0, -7.9, 28.8, 37.5, 60.0, 34.7, 34.1, -9.1, 29.5, 34.3, 63.2, 32.5, 44.3, -6.1, 28.8, 30.6, 65.6, 31.2, 59.3, 1.3, 31.8, 27.5, 65.6, 29.7, 68.6, 8.9, 30.0, 22.7, 60.5, 28.5, 71.5, 16.6, 25.4, 16.8, 50.1, 28.7],
	"run": [135.4, 50.8, 47.7, 13.9, 81.8, 78.1, 127.3, 57.6, 38.8, 2.7, 80.5, 74.0, 113.9, 60.1, 29.1, -7.6, 82.7, 69.9, 97.6, 59.5, 23.7, -15.1, 88.6, 70.7, 79.0, 56.8, 26.7, -17.8, 95.3, 74.2, 58.0, 51.5, 36.8, -16.7, 99.7, 78.0, 35.4, 43.1, 50.7, -14.1, 101.2, 80.4, 16.8, 33.5, 67.1, -10.2, 101.9, 80.1, 17.1, 29.6, 83.5, -6.0, 101.0, 74.3, 39.6, 34.7, 96.8, -1.5, 96.2, 68.2, 52.3, 34.0, 107.1, 4.6, 89.6, 66.9, 56.9, 28.5, 112.5, 12.8, 82.8, 71.7, 54.9, 19.9, 112.3, 22.7, 78.1, 78.8, 48.9, 10.2, 105.5, 32.0, 76.0, 86.8, 42.9, 2.1, 92.2, 38.2, 77.0, 95.4, 41.4, -1.5, 74.5, 39.9, 82.0, 102.5, 49.1, -1.8, 55.5, 38.5, 89.6, 109.9, 60.6, -1.9, 39.1, 36.4, 94.7, 116.6, 74.5, -1.2, 27.2, 34.6, 97.5, 120.8, 90.2, 1.2, 24.5, 33.9, 100.0, 121.4, 105.4, 5.1, 31.7, 34.7, 103.3, 117.9, 118.7, 11.1, 43.1, 35.0, 105.4, 109.6, 129.5, 21.1, 51.4, 31.8, 102.2, 98.0, 136.2, 35.3, 53.1, 24.6, 91.6, 87.8]
}


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


## No idle, walk or run anywhere under assets/ (the cast, the player's clip rig) moves like the
## Mixamo clips, however it was retargeted or renamed (decision G-101).
func test_no_clip_moves_like_the_mixamo_clips() -> bool:
	var checked := 0
	var closest := INF
	for path in _files(ROOT):
		if path.get_extension().to_lower() != "glb" or not ResourceLoader.exists(path, "PackedScene"):
			continue
		var packed := load(path) as PackedScene
		if packed == null:
			continue
		var scene := packed.instantiate() as Node3D
		if scene == null:
			continue
		var prints := GaitFingerprint.of_scene(scene, GAITS)
		scene.free()
		for clip: String in prints:
			var d := GaitFingerprint.distance(prints[clip], PackedFloat32Array(MIXAMO[clip] as Array))
			closest = minf(closest, d)
			checked += 1
			check(d >= MIXAMO_NEAR, "%s %s moves like the Mixamo %s (%.1f° < %.1f°)" % [path, clip, clip, d, MIXAMO_NEAR])
	# 70 people and the player's clip rig, three gaits each.
	check(checked >= 71 * 3, "fingerprinted the gait clips (%d)" % checked)
	check(PackedFloat32Array(MIXAMO["walk"] as Array).size() == GaitFingerprint.SAMPLES * 6, "reference has every sample")
	print("    licences: %d gait clips, closest to a Mixamo clip %.1f° (limit %.1f°)" % [checked, closest, MIXAMO_NEAR])
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
