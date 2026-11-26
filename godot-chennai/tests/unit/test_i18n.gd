extends TestCase
## The translation system (G-440…G-445): the two catalogs agree, every key the code uses exists in
## both languages, placeholders match, the three display modes, the Language setting (saved,
## live), the unreviewed-Tamil release flag, the review table and the Tamil glyphs.

const SRC := "res://src"
## A key looks like `menu.pause.resume`: lower-case words joined by dots.
const KEY_PATTERN := "\"([a-z][a-z0-9_]*(?:\\.[A-Za-z0-9_-]+)+)\""
## Keys the code builds at run time from an id (a life item, a film): checked by the tests of their data.
const DYNAMIC_PREFIXES: Array[String] = ["life.outfit.lower.", "life.film."]
## Code whose key-shaped strings are not translation keys (sound ids such as `rail.door.open`).
const NOT_TEXT_DIRS: Array[String] = ["res://src/audio/"]
## The audio files that do use translated text.
const TEXT_AUDIO: Array[String] = ["res://src/audio/sound.gd", "res://src/audio/sound_credits.gd"]

var _saved_mode: Tr.Mode = Tr.Mode.ENGLISH


func before_each() -> void:
	_saved_mode = Tr.mode
	Tr.hide_unreviewed = false
	Tr.set_mode(Tr.Mode.ENGLISH)


## Every test leaves the language as it found it (English): later tests read English.
func _done() -> bool:
	Tr.hide_unreviewed = false
	Tr.set_mode(Tr.Mode.ENGLISH)
	return true


func _restore() -> void:
	Tr.hide_unreviewed = false
	Tr.reload_catalogs()
	Tr.set_mode(Tr.Mode.ENGLISH)


func _source_files(dir: String) -> PackedStringArray:
	var out := PackedStringArray()
	for file in DirAccess.get_files_at(dir):
		if file.get_extension() == "gd":
			out.append(dir.path_join(file))
	for sub in DirAccess.get_directories_at(dir):
		out.append_array(_source_files(dir.path_join(sub)))
	return out


static func _is_not_text(path: String) -> bool:
	for dir in NOT_TEXT_DIRS:
		if path.begins_with(dir) and not TEXT_AUDIO.has(path):
			return true
	return false


## Every key-shaped string literal of `src`, with the files that use it.
func _used_keys() -> Dictionary[String, String]:
	var rx := RegEx.new()
	rx.compile(KEY_PATTERN)
	var namespaces: Dictionary[String, bool] = {}
	for key in Tr.catalog("en").texts:
		namespaces[key.split(".")[0]] = true
	var out: Dictionary[String, String] = {}
	for path in _source_files(SRC):
		if _is_not_text(path):
			continue
		var text := FileAccess.get_file_as_string(path)
		for line in text.split("\n"):
			if line.strip_edges().begins_with("#"):
				continue
			for m in rx.search_all(line):
				var key := m.get_string(1)
				if namespaces.has(key.split(".")[0]) and not out.has(key):
					out[key] = path
	return out


func test_catalogs_load_with_the_same_keys() -> bool:
	var en := Tr.catalog("en")
	var ta := Tr.catalog("ta")
	assert_eq(en.error, "", "en.csv reads")
	assert_eq(ta.error, "", "ta.csv reads")
	assert_true(en.texts.size() > 700, "the English catalog is big (%d keys)" % en.texts.size())
	for key in en.texts:
		assert_true(ta.texts.has(key), "%s is in Tamil" % key)
		assert_true(en.texts[key] != "", "%s has English" % key)
	for key in ta.texts:
		assert_true(en.texts.has(key), "%s (Tamil) is in English" % key)
		assert_true(ta.texts[key] != "", "%s has Tamil" % key)
		var status: String = ta.status.get(key, "")
		assert_true(status == TrCatalog.STATUS_REVIEWED or status == TrCatalog.STATUS_UNREVIEWED, "%s has a status (%s)" % [key, status])
	return _done()


func test_no_duplicate_keys() -> bool:
	assert_eq(Tr.catalog("en").duplicates.size(), 0, "no key twice in en.csv: %s" % ", ".join(Tr.catalog("en").duplicates))
	assert_eq(Tr.catalog("ta").duplicates.size(), 0, "no key twice in ta.csv: %s" % ", ".join(Tr.catalog("ta").duplicates))
	return _done()


func test_placeholders_match_between_languages() -> bool:
	var en := Tr.catalog("en")
	var ta := Tr.catalog("ta")
	for key in en.texts:
		var a := TrCatalog.placeholders(en.texts[key])
		var b := TrCatalog.placeholders(ta.texts.get(key, ""))
		assert_eq(", ".join(b), ", ".join(a), "%s: the same placeholders in both languages" % key)
	return _done()


func test_every_key_the_code_uses_exists_in_both_languages() -> bool:
	var used := _used_keys()
	assert_true(used.size() > 400, "the scan found the keys (%d)" % used.size())
	for key in used:
		if _is_prefix(key):
			continue
		# A counted text is asked for by its base (`Tr.n("job.note.bumps", ...)`): both forms must exist.
		var forms: Array[String] = []
		if _is_counted(key):
			forms.append_array([key + ".one", key + ".other"])
		else:
			forms.append(key)
		for form in forms:
			assert_true(Tr.catalog("en").texts.has(form), "%s (used in %s) is missing in en.csv" % [form, used[key]])
			assert_true(Tr.catalog("ta").texts.has(form), "%s (used in %s) is missing in ta.csv" % [form, used[key]])
	return _done()


## A key that is only the start of others (`life.film.sambar-sunday`, to which the code adds `.title`).
static func _is_prefix(key: String) -> bool:
	if Tr.catalog("en").texts.has(key):
		return false
	for other in Tr.catalog("en").texts:
		if other.begins_with(key + "."):
			return true
	return false


static func _is_counted(key: String) -> bool:
	return not Tr.catalog("en").texts.has(key) and Tr.catalog("en").texts.has(key + ".one")


func test_no_key_is_left_unused() -> bool:
	var used := _used_keys()
	for key in Tr.catalog("en").texts:
		if key.begins_with(Tr.CONTENT_PREFIX):
			continue
		var dynamic := false
		for prefix in DYNAMIC_PREFIXES:
			dynamic = dynamic or key.begins_with(prefix)
		var base := key.get_basename() if key.ends_with(".one") or key.ends_with(".other") else key
		assert_true(used.has(key) or used.has(base) or dynamic, "%s is in the catalogs but no code uses it" % key)
	return _done()


func test_tr_calls_name_a_key_that_exists() -> bool:
	var rx := RegEx.new()
	rx.compile("Tr\\.(?:t|line|stacked|ref|n|nref|raw)\\(\\s*\"([^\"]+)\"|Tr\\.(?:bind|lang)\\([^,\"]+,\\s*\"([a-z][^\"]+\\.[^\"]+)\"")
	var checked := 0
	for path in _source_files(SRC):
		if path.ends_with("/tr.gd") or _is_not_text(path):
			continue
		var text := FileAccess.get_file_as_string(path)
		for m in rx.search_all(text):
			var key := m.get_string(1) if m.get_string(1) != "" else m.get_string(2)
			if key.contains("%") or key.ends_with("."):
				continue
			checked += 1
			assert_true(Tr.catalog("en").texts.has(key) or _is_counted(key) or _is_prefix(key), "Tr call with the unknown key %s in %s" % [key, path])
	assert_true(checked > 300, "found the Tr calls (%d)" % checked)
	return _done()


func test_content_strings_have_keys_in_both_languages() -> bool:
	var scan := ContentKeys.scan()
	assert_true(scan.size() >= 270, "the content scan finds its strings (%d)" % scan.size())
	var en := Tr.catalog("en")
	for key: String in scan:
		assert_eq(en.texts.get(key, "<missing>"), scan[key], "%s: en.csv holds the content's English" % key)
		assert_true(Tr.catalog("ta").texts.has(key), "%s has Tamil" % key)
	var rows := 0
	for key in en.texts:
		if key.begins_with(Tr.CONTENT_PREFIX):
			rows += 1
			assert_true(scan.has(key), "%s is in en.csv but not in the content" % key)
	assert_eq(rows, scan.size(), "en.csv has exactly the content's strings")
	# The 21 stages, 13 jobs and 5 extra missions are all there.
	for id: String in ["morning-walk", "harmonium-thief", "the-bandh", "hall-ticket"]:
		assert_true(scan.has("c.missions.%s.title" % id), "%s has a title key" % id)
	for id: String in ["ambulance-run", "mount-road-bus"]:
		assert_true(scan.has("c.jobs.%s.title" % id), "%s has a title key" % id)
	return _done()


func test_content_text_translates_by_its_english() -> bool:
	var scan := ContentKeys.scan()
	Tr.set_mode(Tr.Mode.TAMIL)
	assert_eq(Tr.src("Morning walk"), Tr.raw("c.missions.morning-walk.title", "ta"), "a title in Tamil")
	assert_eq(Tr.src("Some name from the map"), "Some name from the map", "unknown text stays as it is")
	Tr.set_mode(Tr.Mode.BOTH)
	assert_eq(Tr.src("Morning walk"), "%s\n%s" % [Tr.raw("c.missions.morning-walk.title", "ta"), "Morning walk"], "both: Tamil above English")
	Tr.set_mode(Tr.Mode.ENGLISH)
	for key: String in scan:
		assert_eq(Tr.src(scan[key]) != "", true, "%s translates" % key)
	assert_eq(Tr.src("Morning walk"), "Morning walk", "English mode: the English")
	return _done()


func test_life_data_has_its_keys() -> bool:
	for o in Life.OUTFITS:
		assert_true(Tr.has_key(str(o["key"])), "outfit %s" % o["id"])
		assert_true(Tr.has_key("life.outfit.lower.%s" % o["id"]), "outfit %s in a sentence" % o["id"])
	for s in Life.SNACKS:
		assert_true(Tr.has_key(str(s["key"])), "snack %s" % s["id"])
	for f in Life.FILMS:
		for part: String in ["title", "genre", "plot", "scene.0", "scene.1"]:
			assert_true(Tr.has_key("%s.%s" % [f["key"], part]), "film %s %s" % [f["id"], part])
	for k: String in ["entry", "phone", "interval", "end"]:
		assert_true(Tr.has_key("life.moment.%s" % k), "moment %s" % k)
	return _done()


func test_texts_fill_placeholders_in_each_language() -> bool:
	assert_eq(Tr.t("set.look_speed", ["1.50"]), "Look speed: 1.50x", "English with a list")
	assert_eq(Tr.t("job.note.bumps.other", {"n": 3, "pct": 30}), "3 bumps: -30%", "named placeholders")
	Tr.set_mode(Tr.Mode.TAMIL)
	assert_contains(Tr.t("set.look_speed", ["1.50"]), "1.50x", "Tamil keeps the number")
	assert_true(Tr.t("set.look_speed", ["1.50"]) != "Look speed: 1.50x", "and is in Tamil")
	# A key inside the arguments is translated in the language of the text that holds it.
	Tr.set_mode(Tr.Mode.ENGLISH)
	assert_eq(Tr.t("set.weather", [&"weather.rain"]), "Weather: Rain", "a StringName argument is a key")
	assert_eq(Tr.t("title.continue_line", [Tr.ref("title.stage", [3]), "2,400", 2, 21]), "Stage 3 · ₹2,400 · 2 of 21 stages", "a Ref argument")
	Tr.set_mode(Tr.Mode.BOTH)
	var both := Tr.t("set.weather", [&"weather.rain"])
	var halves := both.split("\n")
	assert_eq(halves.size(), 2, "both modes: two lines")
	assert_contains(halves[0], Tr.raw("weather.rain", "ta"), "the Tamil line has the Tamil weather")
	assert_false(halves[0].contains("Rain"), "and no English in it")
	assert_eq(halves[1], "Weather: Rain", "the English line is English")
	return _done()


func test_display_modes() -> bool:
	assert_eq(Tr.t("menu.pause.resume"), "RESUME", "English by default")
	Tr.set_mode(Tr.Mode.TAMIL)
	assert_eq(Tr.t("menu.pause.resume"), Tr.raw("menu.pause.resume", "ta"), "Tamil")
	assert_true(Tr.t("menu.pause.resume") != "RESUME", "not the English")
	Tr.set_mode(Tr.Mode.BOTH)
	assert_eq(Tr.t("menu.pause.resume"), "%s\nRESUME" % Tr.raw("menu.pause.resume", "ta"), "both: Tamil above English")
	assert_eq(Tr.stacked("menu.pause.resume"), Tr.t("menu.pause.resume"), "stacked is the same")
	assert_eq(Tr.line("menu.pause.resume"), "%s · RESUME" % Tr.raw("menu.pause.resume", "ta"), "line: one row")
	# Where the Tamil is the English (a key label), both shows it once.
	assert_eq(Tr.t("guide.brake_or_space").count("\n"), 1, "different texts stack")
	# The server follows: engine code that asks for the locale sees Tamil.
	assert_eq(TranslationServer.get_locale(), "ta", "the engine locale is Tamil in both modes")
	Tr.set_mode(Tr.Mode.ENGLISH)
	assert_eq(TranslationServer.get_locale(), "en", "and English again")
	return _done()


func test_missing_keys_are_reported_not_hidden() -> bool:
	Tr.missing = PackedStringArray()
	assert_eq(Tr.t("no.such.key"), "no.such.key", "an unknown key comes back as itself")
	assert_true(Tr.missing.has("no.such.key"), "and is listed")
	Tr.missing = PackedStringArray()
	return _done()


func test_counted_texts_pick_one_or_other() -> bool:
	assert_eq(Tr.n("job.note.bumps", 1, {"pct": 10}), "1 bump: -10%", "one")
	assert_eq(Tr.n("job.note.bumps", 2, {"pct": 20}), "2 bumps: -20%", "other")
	return _done()


func test_language_setting_saves_and_switches_live() -> bool:
	var path := "user://language-test.json"
	DirAccess.remove_absolute(path)
	var s := LanguageSettings.new()
	s.path = path
	var changes: Array[int] = []
	s.changed.connect(func() -> void: changes.append(1))
	var label := Label.new()
	root.add_child(label)
	Tr.bind(label, "menu.pause.resume")
	assert_eq(label.text, "RESUME", "a bound label starts in English")
	var heard := [0]
	var on_change := func() -> void: heard[0] += 1
	Tr.bus.changed.connect(on_change)
	s.set_mode(Tr.Mode.TAMIL)
	assert_eq(Tr.mode, Tr.Mode.TAMIL, "the setting switched the language")
	assert_eq(label.text, Tr.raw("menu.pause.resume", "ta"), "an open label followed at once")
	assert_eq(changes.size(), 1, "the setting announced it")
	assert_eq(heard[0], 1, "and so did Tr")
	s.set_mode(Tr.Mode.BOTH)
	assert_eq(label.text, "%s\nRESUME" % Tr.raw("menu.pause.resume", "ta"), "both stacks")
	# Saved: a fresh instance reads it back; the file keeps other sections.
	var again := LanguageSettings.new()
	again.path = path
	again.load_saved()
	assert_eq(again.mode, Tr.Mode.BOTH, "the choice persists")
	again.apply()
	assert_eq(Tr.mode, Tr.Mode.BOTH, "and applies")
	# next() cycles English, Tamil, Both.
	s.set_mode(Tr.Mode.ENGLISH)
	s.next()
	assert_eq(s.mode, Tr.Mode.TAMIL, "next: Tamil")
	s.next()
	assert_eq(s.mode, Tr.Mode.BOTH, "next: both")
	s.next()
	assert_eq(s.mode, Tr.Mode.ENGLISH, "next: English")
	assert_eq(s.label(), "Language: English", "the row says the language")
	# A damaged value keeps English.
	var bad := LanguageSettings.new()
	bad.from_dict({"mode": "klingon"})
	assert_eq(bad.mode, Tr.Mode.ENGLISH, "unknown value: English")
	var store := SaveStore.new(path).read()
	store.set_section("other", {"x": 1})
	store.write()
	again.set_mode(Tr.Mode.TAMIL)
	assert_true(SaveStore.new(path).read().section("other") != null, "other sections of the save file are kept")
	Tr.bus.changed.disconnect(on_change)
	label.queue_free()
	DirAccess.remove_absolute(path)
	Tr.set_mode(Tr.Mode.ENGLISH)
	return _done()


func test_pause_menu_and_title_follow_the_language() -> bool:
	var menu := PauseMenu.new()
	root.add_child(menu)
	var language := LanguageSettings.new()
	language.path = "user://language-test2.json"
	menu.add_setting(&"Language", language.label, language.next)
	menu.open()
	var resume := menu.get_node(^"Root/Safe/Area/Panel").find_child("Resume", true, false) as Button
	assert_eq(resume.text, "RESUME", "English")
	assert_eq(menu.setting_button(&"Language").text, "Language: English", "the language row")
	menu.setting_button(&"Language").pressed.emit()
	assert_eq(resume.text, Tr.raw("menu.pause.resume", "ta"), "pressing the row switched the open menu to Tamil")
	assert_eq(menu.setting_button(&"Language").text, "%s: %s" % [Tr.raw("set.language", "ta").split(":")[0], LanguageSettings.name_of(Tr.Mode.TAMIL)], "the row shows the new language")
	menu.setting_button(&"Language").pressed.emit()
	assert_eq(resume.text, "%s\nRESUME" % Tr.raw("menu.pause.resume", "ta"), "then both")
	menu.queue_free()
	DirAccess.remove_absolute("user://language-test2.json")
	Tr.set_mode(Tr.Mode.ENGLISH)
	return _done()


func test_unreviewed_tamil_can_be_left_out_of_a_release() -> bool:
	var ta := Tr.catalog("ta")
	var key := "menu.pause.resume"
	assert_eq(ta.status.get(key, ""), TrCatalog.STATUS_UNREVIEWED, "the Tamil is marked as needing review")
	assert_true(Tr.has_unreviewed(), "the About page has something to say")
	assert_true(Tr.raw(key, "ta") != "", "by default the Tamil is shown")
	Tr.hide_unreviewed = true
	Tr.reload_catalogs()
	assert_eq(Tr.raw(key, "ta"), "", "the release flag leaves it out")
	Tr.set_mode(Tr.Mode.TAMIL)
	assert_eq(Tr.t(key), "RESUME", "so Tamil mode shows the English")
	Tr.set_mode(Tr.Mode.BOTH)
	assert_eq(Tr.t(key), "RESUME", "and both shows it once")
	assert_false(Tr.has_unreviewed(), "nothing unreviewed is shown, nothing to apologise for")
	_restore()
	assert_true(Tr.raw(key, "ta") != "", "and the default is back")
	return _done()


func test_review_table_matches_the_catalog() -> bool:
	var doc := FileAccess.get_file_as_string("res://docs/tamil-review.md")
	assert_true(doc != "", "docs/tamil-review.md exists")
	var ta := Tr.catalog("ta")
	var rows := 0
	for line in doc.split("\n"):
		if line.begins_with("| `"):
			rows += 1
	assert_eq(rows, ta.texts.size(), "one row for every Tamil string")
	var en := Tr.catalog("en")
	for key in ta.texts:
		var row := "| `%s` | %s | %s | %s |" % [key, _cell(en.texts.get(key, "")), _cell(ta.texts[key]), ta.status.get(key, "needs native review")]
		assert_true(doc.contains(row + "\n"), "%s is in the table as it is in the catalog" % key)
	assert_contains(doc, "%d Tamil strings" % ta.texts.size(), "the summary counts them")
	return _done()


## How `tools/i18n/review_table.py` writes a cell.
static func _cell(text: String) -> String:
	return text.replace("|", "\\|").replace("\n", " / ")


func test_the_about_page_says_the_tamil_is_under_review() -> bool:
	var scene := (load("res://src/ui/title_menu/title_menu.tscn") as PackedScene).instantiate() as TitleMenu
	root.add_child(scene)
	scene.reduced_motion = true
	scene.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
	assert_contains(scene.about_text(), Tr.t("about.tamil_review"), "the About page flags it")
	Tr.hide_unreviewed = true
	Tr.reload_catalogs()
	scene.set_credits("© OpenStreetMap contributors", "2026-11-15T00:16:27Z")
	assert_false(scene.about_text().contains(Tr.t("about.tamil_review")), "and does not when only reviewed Tamil is shown")
	_restore()
	scene.queue_free()
	return _done()


func test_tamil_glyphs_are_in_the_fonts() -> bool:
	assert_true(UiTheme.font() != null and UiTheme.font(true) != null, "the UI fonts load")
	var ts := TextServerManager.get_primary_interface()
	var checked := 0
	for key in Tr.catalog("ta").texts:
		var text: String = Tr.catalog("ta").texts[key]
		for bold: bool in [false, true]:
			var font := UiTheme.font(bold)
			for c in text:
				var code := c.unicode_at(0)
				if code < 0x80 or code == 0x20 or code == 0xA0 or code == 0x2192 or code == 0xB7 or code == 0x2605 or code == 0x20B9 or code == 0x2026:
					continue
				assert_true(font.has_char(code), "%s: U+%04X is in the font" % [key, code])
		checked += 1
	assert_true(checked > 700, "all the Tamil was checked (%d)" % checked)
	# Shaped, no glyph is the .notdef box (index 0), at the sizes of a 915x412 and a 1830x824 screen.
	var font := UiTheme.font()
	for size: int in [12, 14, 16, 24, 28, 32]:
		for key in Tr.catalog("ta").texts:
			var text: String = Tr.catalog("ta").texts[key]
			if text.length() > 90 or not _has_tamil(text):
				continue
			var rid := ts.create_shaped_text()
			ts.shaped_text_add_string(rid, text, font.get_rids(), size, {}, "ta")
			ts.shaped_text_shape(rid)
			for g: Dictionary in ts.shaped_text_get_glyphs(rid):
				if (int(g["flags"]) & TextServer.GRAPHEME_IS_SPACE) != 0 or (int(g["flags"]) & TextServer.GRAPHEME_IS_VIRTUAL) != 0:
					continue
				if int(g["index"]) == 0:
					check(false, "%s at %d: a missing glyph (tofu box) in %s" % [key, size, text])
					break
			ts.free_rid(rid)
	return _done()


static func _has_tamil(text: String) -> bool:
	for c in text:
		if c.unicode_at(0) >= 0x0B80 and c.unicode_at(0) <= 0x0BFF:
			return true
	return false
