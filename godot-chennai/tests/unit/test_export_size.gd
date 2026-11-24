extends TestCase
## The APK diet (G-240): export_presets.cfg leaves unused legacy assets out of the APK (the
## Three.js cast and road vehicles the sync tool owns stay in the repository byte for byte). These
## tests fail if the game would load a file the export leaves out, or if a new legacy file would
## ship without anyone deciding so.

const PRESETS := "res://export_presets.cfg"
## What the game still loads from the legacy folders (anything else there is excluded).
const LEGACY_KEPT: Array[String] = [
	"assets/people/legacy/people.json",
	"assets/people/legacy/player.glb",
	"assets/vehicles/legacy/motorbike.json",
	"assets/vehicles/legacy/motorbike.glb",
	"assets/vehicles/legacy/motorbike_lod1.glb",
]
const TEXT_EXTENSIONS: Array[String] = ["gd", "tscn", "tres", "json", "cfg", "godot", "gdshader"]
## Folders whose files never ship (so a reference from them is no reference at run time).
const NOT_SHIPPED: Array[String] = ["tests/", "tools/", "docs/", ".godot/", "build/", "addons/"]


## The `exclude_filter` patterns of every Android preset (all presets must agree).
func _exclude_patterns() -> Array[PackedStringArray]:
	var cfg := ConfigFile.new()
	var out: Array[PackedStringArray] = []
	if cfg.load(PRESETS) != OK:
		return out
	for section in cfg.get_sections():
		if section.contains(".options") or not section.begins_with("preset."):
			continue
		var raw := String(cfg.get_value(section, "exclude_filter", ""))
		var pats := PackedStringArray()
		for p in raw.split(","):
			if p.strip_edges() != "":
				pats.append(p.strip_edges())
		out.append(pats)
	return out


static func _is_excluded(rel: String, patterns: PackedStringArray) -> bool:
	for p in patterns:
		if rel.matchn(p) or ("res://" + rel).matchn(p) or ("res://" + rel).matchn("res://" + p):
			return true
	return false


static func _files(dir: String, out: Array[String]) -> void:
	for f in DirAccess.get_files_at(dir):
		out.append(dir.path_join(f))
	for d in DirAccess.get_directories_at(dir):
		if d == ".godot" or d == "build" or d == ".git":
			continue
		_files(dir.path_join(d), out)


## Every project file as a path relative to res://.
func _project_files() -> Array[String]:
	var all: Array[String] = []
	_files("res://", all)
	var rel: Array[String] = []
	for p in all:
		rel.append(p.trim_prefix("res://"))
	return rel


func _shipped(rel: String) -> bool:
	for n in NOT_SHIPPED:
		if rel.begins_with(n):
			return false
	return true


func test_presets_exclude_the_same_files() -> bool:
	var sets := _exclude_patterns()
	if not check(sets.size() >= 2, "export_presets.cfg lists both Android presets (%d)" % sets.size()):
		return true
	var files := _project_files()
	for i in range(1, sets.size()):
		for rel in files:
			if _is_excluded(rel, sets[0]) != _is_excluded(rel, sets[i]):
				check(false, "preset %d treats %s differently from preset 0" % [i, rel])
				break
	return true


func test_only_the_loaded_legacy_files_ship() -> bool:
	var pats := _exclude_patterns()[0]
	var shipped: Array[String] = []
	for rel in _project_files():
		if not (rel.begins_with("assets/people/legacy/") or rel.begins_with("assets/vehicles/legacy/")):
			continue
		if rel.ends_with(".import") or rel.ends_with(".uid"):
			continue
		if not _is_excluded(rel, pats):
			shipped.append(rel)
	for rel in shipped:
		check(LEGACY_KEPT.has(rel), "%s would ship in the APK but nothing is known to load it: add it to exclude_filter (or to LEGACY_KEPT with the code that loads it)" % rel)
	for rel in LEGACY_KEPT:
		check(shipped.has(rel), "%s is loaded by the game but the export leaves it out" % rel)
	return true


func test_no_shipped_text_names_an_excluded_file() -> bool:
	var pats := _exclude_patterns()[0]
	var files := _project_files()
	var excluded: Array[String] = []
	for rel in files:
		if _shipped(rel) and _is_excluded(rel, pats) and not rel.ends_with(".import") and not rel.ends_with(".uid"):
			excluded.append(rel)
	check(excluded.size() > 50, "the export leaves out the legacy cast and vehicles (%d files)" % excluded.size())
	var by_file: Dictionary[String, String] = {}
	for rel in excluded:
		by_file[rel.get_file()] = rel
	for rel in files:
		if not _shipped(rel) or _is_excluded(rel, pats) or not TEXT_EXTENSIONS.has(rel.get_extension()):
			continue
		var text := FileAccess.get_file_as_string("res://" + rel)
		if text == "":
			continue
		for ex in excluded:
			# A full path (res:// or relative) in code, scenes or data.
			if text.contains(ex):
				check(false, "%s names %s, which the export leaves out" % [rel, ex])
	# A path built from a folder and a file name (e.g. `dir.path_join("x.glb")`): look for the
	# bare names of the excluded GLBs in code and scenes (not in manifests, which name their cast).
	# (The same names shipped elsewhere, e.g. assets/people/baker.glb vs a legacy baker.glb, are fine.)
	for rel in files:
		if not _shipped(rel) or _is_excluded(rel, pats) or not ["gd", "tscn", "tres"].has(rel.get_extension()):
			continue
		var text2 := FileAccess.get_file_as_string("res://" + rel)
		for ex in excluded:
			if ex.get_extension() == "glb" and text2.contains('"' + ex.get_file() + '"') and not _basename_ships(ex.get_file(), files, pats):
				check(false, "%s names the file %s, which the export leaves out" % [rel, ex.get_file()])
	return true


func test_models_the_game_resolves_are_in_the_export() -> bool:
	var pats := _exclude_patterns()[0]
	# The player's model.
	check(not _is_excluded(PeopleManifest.DEFAULT_PLAYER.trim_prefix("res://"), pats), "the default player model ships")
	# Every person of the cast and every figure of the fare list.
	for manifest_path: String in [PeoplePool.MANIFEST, FareFigures.MANIFEST]:
		var m := PeopleManifest.open(manifest_path)
		check(m.entries.size() > 30, "%s lists the cast (%d)" % [manifest_path, m.entries.size()])
		for id in m.ids():
			var p := m.model_path(id)
			check(p != "", "%s: %s has a model" % [manifest_path, id])
			if p != "":
				check(not _is_excluded(p.trim_prefix("res://"), pats), "%s: the model of %s (%s) ships" % [manifest_path, id, p])
	# Every vehicle model a kind or variant draws, with each LOD and its manifest.
	var types: Array[VehicleType] = []
	for k in VehicleCatalog.kinds():
		types.append(VehicleCatalog.type(k))
	for v in VehicleCatalog.variant_ids():
		types.append(VehicleCatalog.variant(v).type)
	for t in types:
		var man := VehicleCatalog.manifest_for(t)
		if not check(man != null, "%s has a model" % t.kind):
			continue
		check(not _is_excluded((man.dir.path_join(man.id + ".json")).trim_prefix("res://"), pats), "the manifest of %s ships" % man.id)
		for l in man.lods():
			check(not _is_excluded(String(l["file"]).trim_prefix("res://"), pats), "%s: %s ships" % [man.id, l["file"]])
	return true


## True when a shipped file has this base name (a name that two folders share is no proof).
func _basename_ships(file_name: String, files: Array[String], pats: PackedStringArray) -> bool:
	for rel in files:
		if rel.get_file() == file_name and not _is_excluded(rel, pats):
			return true
	return false


func test_the_regional_world_ships_and_the_v1_chunks_do_not() -> bool:
	# main.gd builds the regional world when it is there and falls back to the v1 chunks only
	# without it; the APK always carries the regional world, so the v1 chunks are dead weight.
	var pats := _exclude_patterns()[0]
	check(RegionalWorldSource.available(), "the regional world is in the project")
	var includes := _include_patterns()
	for rel in _project_files():
		if rel.begins_with("world/tiles/") and (rel.ends_with(".bin") or rel.ends_with(".json")):
			check(not _is_excluded(rel, pats), "%s ships" % rel)
			check(_is_excluded(rel, includes), "%s is matched by include_filter (data files that are not resources only ship when it lists them)" % rel)
		if rel.begins_with("assets/world/c/"):
			check(_is_excluded(rel, pats), "%s (v1 chunk) stays out of the APK" % rel)
	check(_is_excluded("world/world.json", includes) and not _is_excluded("world/world.json", pats), "world/world.json ships")
	return true


func _include_patterns() -> PackedStringArray:
	var cfg := ConfigFile.new()
	var pats := PackedStringArray()
	if cfg.load(PRESETS) != OK:
		return pats
	for p in String(cfg.get_value("preset.0", "include_filter", "")).split(","):
		if p.strip_edges() != "":
			pats.append(p.strip_edges())
	return pats
