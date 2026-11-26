class_name RouteMap
extends Control
## A small route map of the railway (G-330): every line's track as a coloured polyline, stations
## as dots with their names, the player as an amber dot, fitted to the control. Plain data from
## the app (world metres, +X east, -Z north: north is up). Until the nav agent's city map is
## merged this is the map entry; it then becomes a layer of that map.

## Lines: [points (PackedVector2Array), colour (Color)].
var lines: Array[Array] = []
## Stations: [point (Vector2), name (String)].
var stations: Array[Array] = []
var player: Vector2 = Vector2(INF, INF)
var credit: String = ""


func _init() -> void:
	custom_minimum_size = Vector2(260, 220)
	mouse_filter = Control.MOUSE_FILTER_IGNORE


func set_data(line_list: Array[Array], station_list: Array[Array], at: Vector2, attribution: String) -> void:
	lines = line_list
	stations = station_list
	player = at
	credit = attribution
	queue_redraw()


func _bounds() -> Rect2:
	var r := Rect2()
	var first := true
	for l in lines:
		for p: Vector2 in l[0] as PackedVector2Array:
			if first:
				r = Rect2(p, Vector2.ZERO)
				first = false
			else:
				r = r.expand(p)
	return r.grow(300.0)


func to_map(p: Vector2) -> Vector2:
	var b := _bounds()
	var pad := 12.0
	var scale := minf((size.x - 2 * pad) / maxf(1.0, b.size.x), (size.y - 2 * pad - 14) / maxf(1.0, b.size.y))
	var used := b.size * scale
	var off := (size - Vector2(0, 14) - used) / 2.0
	return off + (p - b.position) * scale


func _draw() -> void:
	draw_style_box(RailHudStyle.glass(RailHudStyle.GLASS_PANEL), Rect2(Vector2.ZERO, size))
	for l in lines:
		var pts := l[0] as PackedVector2Array
		var c := l[1] as Color
		var out := PackedVector2Array()
		var step := maxi(1, pts.size() / 120)
		for i in range(0, pts.size(), step):
			out.append(to_map(pts[i]))
		out.append(to_map(pts[pts.size() - 1]))
		draw_polyline(out, c, 3.0, true)
	var font := get_theme_default_font()
	for s in stations:
		var p := to_map(s[0] as Vector2)
		draw_circle(p, 3.5, RailHudStyle.TEXT)
		draw_string(font, p + Vector2(6, 4), str(s[1]), HORIZONTAL_ALIGNMENT_LEFT, 120, 11, RailHudStyle.TEXT_DIM)
	if is_finite(player.x):
		draw_circle(to_map(player), 6.0, RailHudStyle.AMBER)
	draw_string(font, Vector2(10, size.y - 6), credit, HORIZONTAL_ALIGNMENT_LEFT, size.x - 20, 10, RailHudStyle.TEXT_DIM)
