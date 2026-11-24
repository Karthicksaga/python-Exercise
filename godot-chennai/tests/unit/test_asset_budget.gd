extends TestCase
## Size guards for what the APK carries (G-241): big textures are VRAM compressed, long sounds are
## Ogg Vorbis, and no GLB hides a 2K or 4K texture. They fail when a new asset would grow the APK
## without anyone deciding so (docs/app-size.md has the numbers and the budget).

## Textures of at least this many pixels must import as VRAM compressed (compress/mode=2).
const BIG_TEXTURE_PIXELS: int = 256 * 256
## A WAV bigger than this should be an Ogg Vorbis file.
const MAX_WAV_BYTES: int = 200 * 1024
## Longest side of an image embedded in a GLB.
const MAX_GLB_TEXTURE: int = 1024
## A big texture whose file is this small is a flat palette and may stay lossless.
const SMALL_LOSSLESS_BYTES: int = 16 * 1024
const IMAGE_EXTENSIONS: Array[String] = ["png", "jpg", "jpeg", "webp"]


static func _files(dir: String, out: Array[String]) -> void:
	for f in DirAccess.get_files_at(dir):
		out.append(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		_files(dir.path_join(d), out)


func _assets() -> Array[String]:
	var out: Array[String] = []
	_files("res://assets", out)
	return out


func test_big_textures_are_vram_compressed() -> bool:
	var seen := 0
	for path in _assets():
		if not IMAGE_EXTENSIONS.has(path.get_extension()):
			continue
		var img := Image.load_from_file(path)
		if img == null or img.get_width() * img.get_height() < BIG_TEXTURE_PIXELS:
			continue
		seen += 1
		var cfg := ConfigFile.new()
		if not check(cfg.load(path + ".import") == OK, "%s has an import file" % path):
			continue
		check(cfg.get_value("remap", "importer", "") == "texture", "%s imports as a texture" % path)
		# A flat-colour palette (the vehicle palettes, 0.2 to 0.4 KB in the APK) stays lossless on purpose:
		# the model tests compare its swatches exactly.
		if FileAccess.get_file_as_bytes(path).size() <= SMALL_LOSSLESS_BYTES:
			continue
		check(int(cfg.get_value("params", "compress/mode", -1)) == 2, "%s (%dx%d) is not VRAM compressed (compress/mode=2): it would ship as a lossless image, ~4x bigger on the GPU and in the APK" % [path, img.get_width(), img.get_height()])
	check(seen >= 4, "the city textures were found (%d)" % seen)
	return true


func test_long_sounds_are_not_wav() -> bool:
	var wavs := 0
	for path in _assets():
		if path.get_extension() != "wav":
			continue
		wavs += 1
		check(FileAccess.get_file_as_bytes(path).size() <= MAX_WAV_BYTES, "%s is a long WAV: convert it to Ogg Vorbis (quality 4 or 5)" % path)
	check(wavs > 0, "the short stand-in sounds were found")
	return true


func test_glb_textures_are_not_oversized() -> bool:
	var checked := 0
	for path in _assets():
		if path.get_extension() != "glb" or path.contains("/legacy/"):
			continue
		var bytes := FileAccess.get_file_as_bytes(path)
		var json_len := bytes.decode_u32(12)
		var parsed: Variant = JSON.parse_string(bytes.slice(20, 20 + json_len).get_string_from_utf8())
		if not parsed is Dictionary:
			continue
		var doc := parsed as Dictionary
		var views: Array = doc.get("bufferViews", [])
		var bin_start := 20 + json_len + 8
		for im: Variant in doc.get("images", []):
			var d := im as Dictionary
			if not d.has("bufferView"):
				continue
			var v := views[int(d["bufferView"])] as Dictionary
			var from := bin_start + int(v.get("byteOffset", 0))
			var data := bytes.slice(from, from + int(v["byteLength"]))
			var img := Image.new()
			var err := ERR_FILE_UNRECOGNIZED
			match String(d.get("mimeType", "")):
				"image/png":
					err = img.load_png_from_buffer(data)
				"image/webp":
					err = img.load_webp_from_buffer(data)
				"image/jpeg":
					err = img.load_jpg_from_buffer(data)
			if err != OK:
				continue
			checked += 1
			check(maxi(img.get_width(), img.get_height()) <= MAX_GLB_TEXTURE, "%s embeds a %dx%d texture (budget %d)" % [path, img.get_width(), img.get_height(), MAX_GLB_TEXTURE])
	check(checked > 100, "the embedded textures were found (%d)" % checked)
	return true
