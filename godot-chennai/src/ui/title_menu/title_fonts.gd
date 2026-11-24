class_name TitleFonts
extends RefCounted
## The title screen's fonts (G-160): Barlow Condensed Bold and ExtraBold for the name and the menu,
## Noto Sans Tamil Bold for சென்னை (both SIL OFL 1.1, rows in `assets/LICENSES.md`). The Tamil cut
## is a static Bold instance of the variable font, subset to Tamil and Latin (56 KB). A missing
## file falls back to the theme's font, so the menu still shows (wide tracking keeps the look).

const DISPLAY := "res://assets/fonts/title/BarlowCondensed-Bold.ttf"
const DISPLAY_EXTRA := "res://assets/fonts/title/BarlowCondensed-ExtraBold.ttf"
const TAMIL := "res://assets/fonts/title/NotoSansTamil-Bold-title.ttf"

static var _files: Dictionary[String, Font] = {}


static func _file(path: String) -> Font:
	if not _files.has(path):
		var f: Font = null
		if ResourceLoader.exists(path):
			f = load(path) as Font
		_files[path] = f if f != null else ThemeDB.fallback_font
	return _files[path]


## The condensed display face with `tracking` extra pixels between letters. Tamil glyphs fall
## back to the Tamil face, so one font draws a mixed line.
static func display(extra_bold: bool = false, tracking: float = 0.0) -> Font:
	var v := FontVariation.new()
	v.base_font = _file(DISPLAY_EXTRA if extra_bold else DISPLAY)
	v.spacing_glyph = roundi(tracking)
	v.fallbacks = [_file(TAMIL)]
	return v


static func tamil(tracking: float = 0.0) -> Font:
	var v := FontVariation.new()
	v.base_font = _file(TAMIL)
	v.spacing_glyph = roundi(tracking)
	return v


## True when the three font files are in the project (the test checks the Tamil glyphs).
static func installed() -> bool:
	return ResourceLoader.exists(DISPLAY) and ResourceLoader.exists(DISPLAY_EXTRA) and ResourceLoader.exists(TAMIL)
