class_name MapLabelPlacer
extends RefCounted
## Screen-space collision-free label placement for `FullMap`.

var _occupied: Array[Rect2] = []
var _viewport_size := Vector2.ZERO
var _font: Font


func begin(viewport_size: Vector2, font: Font) -> void:
	_occupied.clear()
	_viewport_size = viewport_size
	_font = font


func reserve(rect: Rect2) -> void:
	_occupied.append(rect.grow(4.0))


func draw_locality_label(canvas: Control, screen_pos: Vector2, text_en: String, text_ta: String, font_size: int, col: Color) -> bool:
	if _font == null or text_en == "":
		return false
	var upper := text_en.to_upper()
	var sz_en := _font.get_string_size(upper, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var sz_ta := _font.get_string_size(text_ta, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 2) if text_ta != "" else Vector2.ZERO
	var w := maxf(sz_en.x, sz_ta.x) + 12.0
	var h := sz_en.y + (sz_ta.y + 4.0 if text_ta != "" else 0.0) + 6.0
	var box := Rect2(screen_pos - Vector2(w * 0.5, h * 0.5), Vector2(w, h))
	if not _can_place(box):
		return false
	_occupied.append(box.grow(8.0))
	var p_en := Vector2(screen_pos.x - sz_en.x * 0.5, screen_pos.y)
	canvas.draw_string_outline(_font, p_en, upper, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 4, Color(0.03, 0.04, 0.06, 0.92))
	canvas.draw_string(_font, p_en, upper, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, col)
	if text_ta != "":
		var p_ta := Vector2(screen_pos.x - sz_ta.x * 0.5, screen_pos.y + float(font_size))
		canvas.draw_string_outline(_font, p_ta, text_ta, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 2, 3, Color(0.03, 0.04, 0.06, 0.9))
		canvas.draw_string(_font, p_ta, text_ta, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size - 2, Color(col.r, col.g, col.b, col.a * 0.85))
	return true


func draw_poi_label(canvas: Control, screen_pos: Vector2, text: String, font_size: int, col: Color) -> bool:
	if _font == null or text == "":
		return false
	var clipped := text if text.length() <= 26 else text.substr(0, 24) + "…"
	var sz := _font.get_string_size(clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var pos := screen_pos + Vector2(9.0, 4.0)
	var box := Rect2(pos - Vector2(2.0, sz.y), sz + Vector2(6.0, 4.0))
	if not _can_place(box):
		return false
	_occupied.append(box.grow(4.0))
	canvas.draw_string_outline(_font, pos, clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 3, Color(0.03, 0.04, 0.06, 0.92))
	canvas.draw_string(_font, pos, clipped, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, col)
	return true


func draw_street_label(canvas: Control, screen_pos: Vector2, angle_rad: float, text: String, font_size: int, col: Color) -> bool:
	if _font == null or text == "":
		return false
	var a := wrapf(angle_rad, -PI, PI)
	if a > PI * 0.5:
		a -= PI
	elif a < -PI * 0.5:
		a += PI
	var sz := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size)
	var span_w := absf(cos(a)) * sz.x + absf(sin(a)) * sz.y + 8.0
	var span_h := absf(sin(a)) * sz.x + absf(cos(a)) * sz.y + 8.0
	var box := Rect2(screen_pos - Vector2(span_w * 0.5, span_h * 0.5), Vector2(span_w, span_h))
	if not _can_place(box):
		return false
	_occupied.append(box.grow(6.0))
	canvas.draw_set_transform(screen_pos, a, Vector2.ONE)
	var offset := Vector2(-sz.x * 0.5, sz.y * 0.32)
	canvas.draw_string_outline(_font, offset, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, 3, Color(0.03, 0.04, 0.06, 0.95))
	canvas.draw_string(_font, offset, text, HORIZONTAL_ALIGNMENT_LEFT, -1, font_size, col)
	canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	return true


func _can_place(box: Rect2) -> bool:
	if box.position.x < 8.0 or box.position.y < 58.0:
		return false
	if box.end.x > _viewport_size.x - 8.0 or box.end.y > _viewport_size.y - 44.0:
		return false
	for r: Rect2 in _occupied:
		if r.intersects(box):
			return false
	return true
