class_name PrototypeLabelPlacer
extends RefCounted
## Collision-free screen-space label placement for the Chennai Map Prototype.
## Prevents overlapping street names, locality names, and POI labels across zoom levels.

var _placed: Array[Rect2] = []
var _viewport: Rect2 = Rect2()
var _font: Font


func begin(viewport_size: Vector2, font: Font, top_pad: float = 68.0, bottom_pad: float = 52.0) -> void:
	_placed.clear()
	_viewport = Rect2(Vector2(12.0, top_pad), Vector2(maxf(1.0, viewport_size.x - 24.0), maxf(1.0, viewport_size.y - top_pad - bottom_pad)))
	_font = font


func reserve(rect: Rect2, pad: float = 4.0) -> bool:
	var padded := rect.grow(pad)
	if not _viewport.encloses(rect):
		return false
	for existing: Rect2 in _placed:
		if existing.intersects(padded):
			return false
	_placed.append(padded)
	return true


func draw_locality_label(canvas: CanvasItem, at: Vector2, text: String, tamil: String, font_size: int, colour: Color) -> bool:
	if _font == null or text == "":
		return false
	var sz := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var pos := at - Vector2(sz.x * 0.5, 0.0)
	var total_h := sz.y + (16.0 if tamil != "" else 0.0)
	var box := Rect2(pos - Vector2(4.0, sz.y), Vector2(sz.x + 8.0, total_h))
	if not reserve(box, 8.0):
		return false
	canvas.draw_string_outline(_font, pos, text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 5, Color(0.03, 0.04, 0.07, 0.92))
	canvas.draw_string(_font, pos, text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, colour)
	if tamil != "":
		var tsz := _font.get_string_size(tamil, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 2)
		var tpos := at + Vector2(-tsz.x * 0.5, 14.0)
		canvas.draw_string_outline(_font, tpos, tamil, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 2, 4, Color(0.03, 0.04, 0.07, 0.9))
		canvas.draw_string(_font, tpos, tamil, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 2, Color(colour, 0.85))
	return true


func draw_poi_label(canvas: CanvasItem, at: Vector2, text: String, font_size: int, colour: Color) -> bool:
	if _font == null or text == "":
		return false
	var clipped := text if text.length() <= 26 else text.left(24) + "…"
	var sz := _font.get_string_size(clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var pos := at + Vector2(10.0, 4.0)
	var box := Rect2(pos - Vector2(2.0, sz.y), Vector2(sz.x + 6.0, sz.y + 4.0))
	if not reserve(box, 5.0):
		return false
	canvas.draw_string_outline(_font, pos, clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 4, Color(0.03, 0.04, 0.07, 0.92))
	canvas.draw_string(_font, pos, clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, colour)
	return true


func draw_street_label(canvas: CanvasItem, at: Vector2, angle_rad: float, text: String, font_size: int, colour: Color) -> bool:
	if _font == null or text == "":
		return false
	var clipped := text if text.length() <= 30 else text.left(28) + "…"
	var sz := _font.get_string_size(clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var a := angle_rad
	# Keep road text upright (never upside-down).
	if a > PI * 0.5:
		a -= PI
	elif a < -PI * 0.5:
		a += PI
	var cos_a := absf(cos(a))
	var sin_a := absf(sin(a))
	var bw := sz.x * cos_a + sz.y * sin_a
	var bh := sz.x * sin_a + sz.y * cos_a
	var box := Rect2(at - Vector2(bw * 0.5, bh * 0.5), Vector2(bw, bh))
	if not reserve(box, 10.0):
		return false
	canvas.draw_set_transform(at, a, Vector2.ONE)
	var origin := Vector2(-sz.x * 0.5, sz.y * 0.3)
	canvas.draw_string_outline(_font, origin, clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 4, Color(0.03, 0.04, 0.07, 0.95))
	canvas.draw_string(_font, origin, clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, colour)
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	return true
