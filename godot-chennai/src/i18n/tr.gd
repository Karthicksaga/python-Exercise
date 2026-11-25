class_name Tr
extends RefCounted
## The translation front door (decision G-440). Every user-visible string is a key such as
## `menu.pause.resume` in `assets/i18n/en.csv` and `ta.csv`; code and tests call `Tr.t(key, args)`
## and never touch the engine's translation classes. The loader reads the CSV files into
## `Translation` objects registered with the `TranslationServer` (so engine `tr()` and
## `auto_translate` work too) and keeps them for its own lookups.
##
## Three display modes (`Mode`): English, Tamil, and Both (Tamil above English: the rule of the
## place signs). `t` and `stacked` stack the two languages on separate lines in Both mode (titles,
## buttons, paragraphs); `line` puts them on one line with " · " (small HUD readouts). Texts hold
## `{0}`, `{1}` (an Array of arguments) or `{name}` (a Dictionary) placeholders, so Tamil word order
## may differ from English.
##
## English is the default until the game applies the saved setting (`LanguageSettings.apply`), so
## tests see English unless they ask. Tamil rows still marked "needs native review" are shown by
## default; a release build can hide them (`hide_unreviewed`): the feature tag
## `tamil_reviewed_only` in the export preset or the project setting `chennai/i18n/hide_unreviewed`.

enum Mode { ENGLISH, TAMIL, BOTH }

const DIR := "res://assets/i18n/"
const LOCALES: Array[String] = ["en", "ta"]
const SETTING_HIDE := "chennai/i18n/hide_unreviewed"
const FEATURE_HIDE := "tamil_reviewed_only"
## Keys of the content strings (mission, job and story text) start with this.
const CONTENT_PREFIX := "c."

## The signal holder: static code cannot own a signal.
class Bus:
	extends RefCounted
	signal changed

static var bus: Bus = Bus.new()
static var mode: Mode = Mode.ENGLISH
## Show only reviewed Tamil (a release choice). Changing it needs `reload()`.
static var hide_unreviewed: bool = false
## Keys asked for and not found, for the tests and the log.
static var missing: PackedStringArray = PackedStringArray()

static var _catalogs: Dictionary[String, TrCatalog] = {}
static var _messages: Dictionary[String, Translation] = {}
static var _source_index: Dictionary[String, String] = {}
static var _loaded: bool = false
static var _bound: Array[WeakRef] = []


## Reads the CSV files again (after `hide_unreviewed` changed, or in a test).
static func reload() -> void:
	_loaded = false
	_ensure()


static func _ensure() -> void:
	if _loaded:
		return
	_loaded = true
	hide_unreviewed = hide_unreviewed or OS.has_feature(FEATURE_HIDE) or bool(ProjectSettings.get_setting(SETTING_HIDE, false))
	_catalogs.clear()
	_messages.clear()
	_source_index.clear()
	for locale in LOCALES:
		var cat := TrCatalog.load_file("%s%s.csv" % [DIR, locale])
		if cat.error != "":
			push_error("Tr: %s" % cat.error)
		_catalogs[locale] = cat
		var old := TranslationServer.get_translation_object(locale)
		if old != null and old.locale == locale:
			TranslationServer.remove_translation(old)
		var tr_obj := Translation.new()
		tr_obj.locale = locale
		for key in cat.texts:
			if locale == "ta" and hide_unreviewed and not cat.is_reviewed(key):
				continue
			tr_obj.add_message(StringName(key), cat.texts[key])
		TranslationServer.add_translation(tr_obj)
		_messages[locale] = tr_obj
	var en := _catalogs["en"]
	for key in en.texts:
		if key.begins_with(CONTENT_PREFIX) and not _source_index.has(en.texts[key]):
			_source_index[en.texts[key]] = key


## The catalog of a locale ("en" or "ta"), for tests and tools.
static func catalog(locale: String) -> TrCatalog:
	_ensure()
	return _catalogs[locale]


static func has_key(key: String) -> bool:
	_ensure()
	return _catalogs["en"].texts.has(key)


## One language's text for `key`, "" when that language has none (or it is hidden for review).
static func raw(key: String, locale: String) -> String:
	_ensure()
	return String((_messages[locale] as Translation).get_message(StringName(key)))


## `key` in one language with its arguments filled in: Tamil falls back to English, and a key in
## neither language comes back as the key itself (and is listed in `missing`).
static func lang(key: String, locale: String, args: Variant = null) -> String:
	var s := raw(key, locale)
	if s == "" and locale != "en":
		s = raw(key, "en")
	if s == "":
		if not missing.has(key):
			missing.append(key)
		return key
	return fill(s, args, locale)


## Replaces `{0}`, `{1}` from an Array or `{name}` from a Dictionary. An argument that is a
## StringName (`&"guide.side.left"`) is a key, translated in the same language as the text.
static func fill(text: String, args: Variant, locale: String = "en") -> String:
	if args is Array:
		var list: Array = args
		for i in list.size():
			text = text.replace("{%d}" % i, _arg(list[i], locale))
	elif args is Dictionary:
		var dict: Dictionary = args
		for k: Variant in dict:
			text = text.replace("{%s}" % str(k), _arg(dict[k], locale))
	return text


static func _arg(value: Variant, locale: String) -> String:
	if value is StringName:
		return lang(String(value as StringName), locale)
	if value is Ref:
		var r: Ref = value
		return lang(r.key, locale, r.args)
	return str(value)


## A key with its own arguments, to pass inside the arguments of another text: it is translated in
## the language of the text that holds it (`Tr.t("title.continue_line", [Tr.ref("title.stage", [3])])`).
class Ref:
	extends RefCounted
	var key: String = ""
	var args: Variant = null


static func ref(key: String, args: Variant = null) -> Ref:
	var r := Ref.new()
	r.key = key
	r.args = args
	return r


static func _compose(key: String, args: Variant, joiner: String) -> String:
	_ensure()
	if mode == Mode.ENGLISH:
		return lang(key, "en", args)
	if mode == Mode.TAMIL:
		return lang(key, "ta", args)
	var ta := lang(key, "ta", args)
	var en := lang(key, "en", args)
	return en if ta == en else ta + joiner + en


## The text in the display mode; Both stacks Tamil above English on two lines.
static func t(key: String, args: Variant = null) -> String:
	return _compose(key, args, "\n")


## Same as `t`, named where the stacking is the point (titles, signs).
static func stacked(key: String, args: Variant = null) -> String:
	return _compose(key, args, "\n")


## Both languages on one line, for small readouts.
static func line(key: String, args: Variant = null) -> String:
	return _compose(key, args, " · ")


## `n` as an argument of another text (see `ref`): the `.one` or `.other` text, with `{n}` filled in.
static func nref(key: String, count: int, args: Variant = null) -> Ref:
	var dict: Dictionary = {"n": count}
	if args is Dictionary:
		dict.merge(args as Dictionary)
	return ref("%s.%s" % [key, "one" if count == 1 else "other"], dict)


## A count-dependent text: `<key>.one` for 1, else `<key>.other`; `{n}` is the count.
static func n(key: String, count: int, args: Variant = null) -> String:
	var dict: Dictionary = {"n": count}
	if args is Dictionary:
		dict.merge(args as Dictionary)
	return t("%s.%s" % [key, "one" if count == 1 else "other"], dict)


## The translation of a content string (mission, job and story text) written in English in the
## data: found by its English text; an unknown text (a place name from the map) comes back as is.
static func src(english: String, joiner: String = "\n") -> String:
	_ensure()
	var key: String = _source_index.get(english, "")
	if key == "":
		return english
	return _compose(key, null, joiner)


## `src` as an argument of another text (see `ref`): the content string in the language of the
## text that holds it.
static func srcref(english: String) -> Variant:
	_ensure()
	var key: String = _source_index.get(english, "")
	return ref(key) if key != "" else english


static func src_line(english: String) -> String:
	return src(english, " · ")


static func is_source(english: String) -> bool:
	_ensure()
	return _source_index.has(english)


## True while some Tamil text in the game is still marked "needs native review" and would be shown
## (the About page says so).
static func has_unreviewed() -> bool:
	_ensure()
	var cat: TrCatalog = _catalogs["ta"]
	for key in cat.texts:
		if not cat.is_reviewed(key) and not hide_unreviewed:
			return true
	return false


## A font size for compact controls: two languages stacked on a small button need smaller letters.
static func fit(base: int) -> int:
	return maxi(9, roundi(base * 0.75)) if mode == Mode.BOTH else base


## Sets the display mode and tells every open screen (`Tr.bus.changed`) and the bound controls.
static func set_mode(m: Mode) -> void:
	_ensure()
	mode = m
	TranslationServer.set_locale("en" if m == Mode.ENGLISH else "ta")
	refresh_bound()
	bus.changed.emit()


## Makes `c.<prop>` follow the language: sets it now and again whenever the mode changes.
## `line` puts Both on one line. Returns `c` so a widget can be built and bound in one expression.
static func bind(c: Control, key: String, args: Variant = null, inline: bool = false, prop: StringName = &"text", base_size: int = 0) -> Control:
	var known := c.has_meta(&"tr_key")
	c.set_meta(&"tr_size", base_size)
	c.set_meta(&"tr_key", key)
	c.set_meta(&"tr_args", args)
	c.set_meta(&"tr_inline", inline)
	c.set_meta(&"tr_prop", prop)
	_apply(c)
	if not known:
		if _bound.size() > 400:
			_prune()
		_bound.append(weakref(c))
	return c


static func refresh_bound() -> void:
	_prune()
	for w in _bound:
		var c := w.get_ref() as Control
		if c != null:
			_apply(c)


static func _apply(c: Control) -> void:
	var key := String(c.get_meta(&"tr_key", ""))
	if key == "":
		return
	var args: Variant = c.get_meta(&"tr_args") if c.has_meta(&"tr_args") else null
	var text := line(key, args) if bool(c.get_meta(&"tr_inline", false)) else t(key, args)
	c.set(StringName(c.get_meta(&"tr_prop", &"text")), text)
	var base := int(c.get_meta(&"tr_size", 0))
	if base > 0:
		c.add_theme_font_size_override("font_size", fit(base))


static func _prune() -> void:
	var live: Array[WeakRef] = []
	for w in _bound:
		if w.get_ref() != null:
			live.append(w)
	_bound = live
