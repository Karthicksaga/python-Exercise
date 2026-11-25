class_name TransitFonts
extends RefCounted
## Fonts for transit text (decision G-219): the default Latin font with the whole Tamil block as a
## fallback (`assets/transit/noto-sans-tamil-ui-600.woff2`), so any OSM stop or destination name
## draws, on the HUD and on bus signs. One shared resource.

const TAMIL := "res://assets/transit/noto-sans-tamil-ui-600.woff2"

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
