class_name MissionMinimap
extends Control
## The mission minimap (G-144): a small north-up plate round the player showing what a mission's
## hazards do and where to go: flood water (blue, deeper is darker, with its depth ring), shut or
## slow roads (red, amber), the marker (amber diamond), a tail's target (white dot) and the roads
## near enough to read the water against. It appears only while the current objective has hazards
## or a target to follow. World metres in, pixels out; 300 m to the edge.

const RANGE := 300.0
const PLATE := 128.0

## [{x, z, radius, kind, depth (0..1 of the deepest), label}] in world metres.
var zones: Array[Dictionary] = []
## Pairs of points (world metres): a road segment is points 2i and 2i+1.
var roads := PackedVector2Array()
var player := Vector2.ZERO
var heading := 0.0
var marker := Vector2.INF
var quarry := Vector2.INF
## The route the player is told to avoid is drawn red: set by the layer for blocked segments.
var _plate := StyleBoxFlat.new()


func _init() -> void:
	custom_minimum_size = Vector2(PLATE, PLATE)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	_plate.bg_color = Color(0.06, 0.07, 0.09, 0.82)
	_plate.set_corner_radius_all(12)
	_plate.border_color = Color(1, 1, 1, 0.18)
	_plate.set_border_width_all(1)


## Where a world point is on the plate.
func to_plate(p: Vector2) -> Vector2:
	var c := size / 2.0
	return c + (p - player) * (minf(size.x, size.y) / 2.0 / RANGE)


func set_view(at: Vector2, yaw: float, hazards: Array[Dictionary], nearby_roads: PackedVector2Array, target: Vector2, followed: Vector2) -> void:
	player = at
	heading = yaw
	zones = hazards
	roads = nearby_roads
	marker = target
	quarry = followed
	visible = not hazards.is_empty() or followed != Vector2.INF
	queue_redraw()


func _draw() -> void:
	draw_style_box(_plate, Rect2(Vector2.ZERO, size))
	var scale := minf(size.x, size.y) / 2.0 / RANGE
	var clip := Rect2(Vector2.ZERO, size).grow(-2.0)
	var i := 0
	while i + 1 < roads.size():
		draw_line(to_plate(roads[i]), to_plate(roads[i + 1]), Color(1, 1, 1, 0.28), 1.0)
		i += 2
	for z in zones:
		var c := to_plate(Vector2(float(z["x"]), float(z["z"])))
		var r := float(z["radius"]) * scale
		match str(z["kind"]):
			"flood":
				var depth := clampf(float(z.get("depth", 0.0)), 0.0, 1.0)
				draw_circle(c, r, Color(0.2, 0.5, 0.9, 0.35 + 0.35 * depth))
				draw_arc(c, r, 0.0, TAU, 24, Color(0.55, 0.8, 1.0, 0.9), 1.5)
				if depth >= 0.55:
					draw_circle(c, r * 0.4, Color(0.05, 0.2, 0.6, 0.8))
			"strike":
				draw_circle(c, r, Color(0.95, 0.25, 0.2, 0.45))
				draw_arc(c, r, 0.0, TAU, 24, UiTheme.DANGER, 1.5)
				draw_line(c + Vector2(-r, -r) * 0.5, c + Vector2(r, r) * 0.5, UiTheme.DANGER, 2.0)
				draw_line(c + Vector2(-r, r) * 0.5, c + Vector2(r, -r) * 0.5, UiTheme.DANGER, 2.0)
			_:
				draw_circle(c, r, Color(1.0, 0.72, 0.1, 0.4))
				draw_arc(c, r, 0.0, TAU, 24, UiTheme.AMBER, 1.5)
	if quarry != Vector2.INF:
		var q := to_plate(quarry)
		if clip.has_point(q):
			draw_circle(q, 4.0, Color.WHITE)
			draw_arc(q, 6.5, 0.0, TAU, 16, Color(1, 1, 1, 0.7), 1.0)
	if marker != Vector2.INF:
		var m := to_plate(marker)
		# A marker beyond the plate is pinned to its edge.
		var c := size / 2.0
		if not clip.has_point(m):
			m = c + (m - c).normalized() * (minf(size.x, size.y) / 2.0 - 6.0)
		draw_colored_polygon(PackedVector2Array([m + Vector2(0, -6), m + Vector2(6, 0), m + Vector2(0, 6), m + Vector2(-6, 0)]), UiTheme.AMBER)
	# The player: an arrow pointing the way they face (heading 0 = north, positive to the left).
	var p := size / 2.0
	var fwd := Vector2(-sin(heading), -cos(heading))
	var side := Vector2(-fwd.y, fwd.x)
	draw_colored_polygon(PackedVector2Array([p + fwd * 7.0, p - fwd * 5.0 + side * 4.5, p - fwd * 2.0, p - fwd * 5.0 - side * 4.5]), Color.WHITE)
	draw_string(ThemeDB.fallback_font, Vector2(size.x - 14.0, 14.0), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.6))
