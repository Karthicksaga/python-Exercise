class_name MapGlyphs
extends RefCounted
## The small shapes a map draws for each marker kind, so kinds differ by shape as well as colour
## (colour alone fails for colour-blind players): a pick-up is a downward arrow, a drop-off a
## square, a mission a diamond, a fight a cross, a vehicle a circle, a place a ring, a target a
## dot with a ring. `draw` paints onto any CanvasItem in pixels, centred on `at`.


static func draw(item: CanvasItem, kind: StringName, at: Vector2, size: float, colour: Color) -> void:
	var edge := Color(0.05, 0.06, 0.09, 0.9)
	match kind:
		MarkerKind.PICKUP:
			var pts := PackedVector2Array([at + Vector2(-size, -size * 0.7), at + Vector2(size, -size * 0.7), at + Vector2(0, size)])
			item.draw_colored_polygon(pts, colour)
			item.draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[0]]), edge, 1.5)
		MarkerKind.DROPOFF:
			var r := Rect2(at - Vector2(size, size) * 0.85, Vector2(size, size) * 1.7)
			item.draw_rect(r, colour)
			item.draw_rect(r, edge, false, 1.5)
		MarkerKind.FIGHT:
			item.draw_line(at + Vector2(-size, -size), at + Vector2(size, size), edge, 5.0)
			item.draw_line(at + Vector2(-size, size), at + Vector2(size, -size), edge, 5.0)
			item.draw_line(at + Vector2(-size, -size), at + Vector2(size, size), colour, 3.0)
			item.draw_line(at + Vector2(-size, size), at + Vector2(size, -size), colour, 3.0)
		MarkerKind.VEHICLE:
			item.draw_circle(at, size * 0.9, colour)
			item.draw_arc(at, size * 0.9, 0.0, TAU, 16, edge, 1.5)
		MarkerKind.PLACE:
			item.draw_arc(at, size * 0.8, 0.0, TAU, 16, edge, 4.0)
			item.draw_arc(at, size * 0.8, 0.0, TAU, 16, colour, 2.5)
		MarkerKind.TARGET:
			item.draw_circle(at, size * 0.5, colour)
			item.draw_arc(at, size * 1.0, 0.0, TAU, 16, colour, 1.5)
		_:
			var d := PackedVector2Array([at + Vector2(0, -size), at + Vector2(size, 0), at + Vector2(0, size), at + Vector2(-size, 0)])
			item.draw_colored_polygon(d, colour)
			item.draw_polyline(PackedVector2Array([d[0], d[1], d[2], d[3], d[0]]), edge, 1.5)


## An arrow with its tip at `at`, pointing along `direction`.
static func draw_arrow(item: CanvasItem, at: Vector2, direction: Vector2, size: float, colour: Color) -> void:
	var side := Vector2(-direction.y, direction.x)
	var pts := PackedVector2Array([at, at - direction * size * 1.6 + side * size, at - direction * size * 0.9, at - direction * size * 1.6 - side * size])
	item.draw_colored_polygon(pts, colour)
	item.draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]), Color(0.05, 0.06, 0.09, 0.9), 1.5)
