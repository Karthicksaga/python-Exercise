class_name PrototypeMinimap
extends Control
## Compact corner minimap preview for the Prototype Navigation HUD.
## Shares the exact same `PrototypeWorldData`, `MapProjection`, player position, and active route
## as the full-screen map, and displays the active street name underneath.

const PLATE := 118.0
const RANGE_METRES := 240.0

var data: PrototypeWorldData = null
var projection := MapProjection.new()
var player_pos := Vector2(40.0, 60.0)
var player_heading := 0.0
var route_polyline := PackedVector2Array()
var current_street := ""

var _font: Font


func _ready() -> void:
	custom_minimum_size = Vector2(PLATE, PLATE + 24.0)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_font = RailFonts.with_tamil()


func update_state(pos: Vector2, heading: float, poly: PackedVector2Array, street: String) -> void:
	player_pos = pos
	player_heading = heading
	route_polyline = poly
	current_street = street
	queue_redraw()


func _draw() -> void:
	var c := Vector2(size.x * 0.5, PLATE * 0.5)
	var r := PLATE * 0.5 - 2.0
	draw_circle(c, r, Color(0.05, 0.06, 0.09, 0.85))

	projection.rotate_with_heading = true
	projection.centre = player_pos
	projection.heading = player_heading
	projection.pixels_per_metre = r / RANGE_METRES

	var ppm := projection.pixels_per_metre
	var rot := projection.angle()

	if data != null and data.loaded and data.source != null:
		var box := Rect2(player_pos - Vector2(RANGE_METRES, RANGE_METRES), Vector2(RANGE_METRES * 2.0, RANGE_METRES * 2.0))
		var tile := data.source.tile_at(player_pos)
		var net := data.source.tile_roads(tile)
		if net != null:
			for road: Road in net.roads:
				if road.kind == &"footway" or road.points.size() < 2:
					continue
				var pts := PackedVector2Array()
				var any_in := false
				for p: Vector2 in road.points:
					if box.has_point(p):
						any_in = true
					var off := (p - player_pos).rotated(rot) * ppm
					if off.length() <= r * 1.15:
						pts.append(c + off)
					elif not pts.is_empty():
						pts.append(c + off.normalized() * r)
				if any_in and pts.size() >= 2:
					var col := Color(1, 0.9, 0.72, 0.75) if Road.MAIN_KINDS.has(road.kind) else Color(1, 1, 1, 0.25)
					draw_polyline(pts, col, 2.0 if Road.MAIN_KINDS.has(road.kind) else 1.0)

	if route_polyline.size() >= 2:
		var rpts := PackedVector2Array()
		for p: Vector2 in route_polyline:
			var off := (p - player_pos).rotated(rot) * ppm
			if off.length() <= r:
				rpts.append(c + off)
		if rpts.size() >= 2:
			draw_polyline(rpts, Color("#38bdf8"), 3.2)

	draw_arc(c, r, 0.0, TAU, 40, Color(1, 1, 1, 0.45), 2.0)

	# North rim indicator
	var north := Vector2.UP.rotated(rot)
	var np := c + north * (r - 9.0)
	draw_string(_font, np + Vector2(-4, 4), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 10, Color("#ffb703"))

	# Player arrow (pointing straight up when rotating)
	var tip := c + Vector2(0, -7)
	draw_colored_polygon(PackedVector2Array([tip, c + Vector2(5, 6), c + Vector2(0, 3), c + Vector2(-5, 6)]), Color.WHITE)

	# Street pill underneath plate
	var label_text := current_street if current_street != "" else "Unnamed Street"
	if label_text.length() > 22:
		label_text = label_text.left(20) + "…"
	var tw := _font.get_string_size(label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 11).x
	var pill := Rect2(Vector2(c.x - tw * 0.5 - 8.0, PLATE + 3.0), Vector2(tw + 16.0, 20.0))
	draw_rect(pill, Color(0.05, 0.06, 0.09, 0.88))
	draw_rect(pill, Color(1, 1, 1, 0.2), false, 1.0)
	draw_string(_font, Vector2(c.x - tw * 0.5, PLATE + 17.0), label_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#ffb703"))
