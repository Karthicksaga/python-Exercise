class_name RailFonts
extends RefCounted
## The font for station boards and the railway HUD: the default Latin font with the whole Tamil
## block as a fallback (`assets/city/noto-sans-tamil-categories.woff2`, Noto Sans Tamil Bold, OFL;
## its licence row is in `assets/LICENSES.md`), so every station's Tamil name draws. Shared.

const TAMIL := "res://assets/city/noto-sans-tamil-categories.woff2"

static var _shared: Font = null


static func with_tamil() -> Font:
	if _shared != null:
		return _shared
	var v := FontVariation.new()
	v.base_font = ThemeDB.fallback_font
	var tamil := load(TAMIL) as Font
	if tamil != null:
		v.fallbacks = [tamil]
	_shared = v
	return v
