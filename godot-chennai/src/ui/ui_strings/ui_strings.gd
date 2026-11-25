class_name UiStrings
extends RefCounted
## The words on the HUD's buttons that are new since the Tamil + English work started (G-494), in
## one table so the translation system (`src/i18n`, built on another branch) can take them over
## in one move: each key becomes a translation key and `text()` becomes `tr()`. English only for
## now; the Tamil column is left empty on purpose (machine Tamil is not shipped unreviewed, an
## open owner decision), and an empty entry falls back to English.

const EN: Dictionary[StringName, String] = {
	&"get_out": "GET OUT",
	&"stopping_to_get_out": "Stopping to get out",
}
const TA: Dictionary[StringName, String] = {
	&"get_out": "",
	&"stopping_to_get_out": "",
}

## "en" or "ta"; the i18n work will own the language choice.
static var language: String = "en"


## The words for `key` in the current language (English when there is no reviewed Tamil yet).
static func text(key: StringName) -> String:
	if language == "ta" and String(TA.get(key, "")) != "":
		return TA[key]
	return EN.get(key, String(key))
