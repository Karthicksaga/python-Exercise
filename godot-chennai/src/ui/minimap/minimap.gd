class_name Minimap
extends Control
## The corner minimap (G-281): a round, translucent plate round the player with the roads, an
## arrow for the player, the mission's marker and, when that marker is off the plate, an arrow
## pinned to the edge with the distance in metres. The map turns with the player (what is ahead
## is up) or stays north-up (`MapSettings`). Hazard zones and a followed target (the Monsoon Night
## flood, a tail) are drawn on it as before (G-144).
##
## Cheap by design: the road lines are one `draw_multiline` each, drawn in world metres under one
## canvas transform; `set_view` is called at 10 Hz at most and only then is anything redrawn. The
## disc clips the roads with `clip_children`, so nothing is computed per segment.

const PLATE := 136.0
## Metres from the plate's centre to its edge.
const RANGE := 260.0
const MARKER_INSET := 10.0
const TEXT_SIZE := 12

signal pressed

var projection := MapProjection.new()
var roads: MapRoads = null
## [{x, z, radius, kind, depth (0..1), label}] in world metres.
var zones: Array[Dictionary] = []
## Marker 0 is the mission's: [{x, z, kind, label, radius}] in world metres.
var markers: Array[Dictionary] = []
var player := Vector2.ZERO
var heading := 0.0
var quarry := Vector2.INF
var route_polyline := PackedVector2Array()
var settings: MapSettings = null
## How many times `set_view` was called (tests count refreshes).
var updates := 0

var _disc: _Layer
var _content: _Layer
var _overlay: _Layer
var _font := ThemeDB.fallback_font


## A child Control that paints with a callable (so one script holds all three layers).
class _Layer extends Control:
	var painter := Callable()

	func _draw() -> void:
		if painter.is_valid():
			painter.call(self)


func _init() -> void:
	name = "Minimap"
	custom_minimum_size = Vector2(PLATE, PLATE)
	size = custom_minimum_size
	mouse_filter = Control.MOUSE_FILTER_STOP
	focus_mode = Control.FOCUS_NONE
	projection.pixels_per_metre = PLATE / 2.0 / RANGE
	_disc = _make_layer("Disc", _paint_disc, self)
	_disc.clip_children = CanvasItem.CLIP_CHILDREN_AND_DRAW
	_content = _make_layer("Content", _paint_content, _disc)
	_overlay = _make_layer("Overlay", _paint_overlay, self)


func _ready() -> void:
	if settings == null:
		settings = MapSettings.shared()
	settings.changed.connect(_apply_settings)
	_apply_settings()


func _make_layer(layer_name: String, painter: Callable, parent: Control) -> _Layer:
	var l := _Layer.new()
	l.name = layer_name
	l.painter = painter
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	l.set_anchors_preset(Control.PRESET_FULL_RECT)
	parent.add_child(l)
	return l


func _gui_input(event: InputEvent) -> void:
	var tapped := false
	if event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		tapped = b.pressed and b.button_index == MOUSE_BUTTON_LEFT
	elif event is InputEventScreenTouch:
		tapped = (event as InputEventScreenTouch).pressed
	if tapped:
		pressed.emit()
		accept_event()


## The plate's size in pixels (the corner it sits in decides): the same view shows less or more.
func set_plate(pixels: float) -> void:
	projection.pixels_per_metre = pixels / 2.0 / RANGE
	_redraw()


func _apply_settings() -> void:
	projection.rotate_with_heading = settings.rotating
	_redraw()


## One update (the layer calls it at 10 Hz at most). `at` and `yaw` are the player's, `hazards`
## the zones to show, `nearby` the road lines, `points` the markers (first: the mission's),
## `followed` a target to follow (Vector2.INF: none).
func set_view(at: Vector2, yaw: float, hazards: Array[Dictionary], nearby: MapRoads, points: Array[Dictionary], followed: Vector2) -> void:
	updates += 1
	player = at
	heading = yaw
	zones = hazards
	roads = nearby
	markers = points
	quarry = followed
	projection.centre = at
	projection.heading = yaw
	_redraw()


## The mission marker's world point, or Vector2.INF.
func marker_point() -> Vector2:
	return Vector2(float(markers[0]["x"]), float(markers[0]["z"])) if not markers.is_empty() else Vector2.INF


func _redraw() -> void:
	if _disc == null:
		return
	_disc.queue_redraw()
	_content.queue_redraw()
	_overlay.queue_redraw()


func _centre() -> Vector2:
	return size / 2.0


func _radius() -> float:
	return minf(size.x, size.y) / 2.0


func _paint_disc(l: Control) -> void:
	l.draw_circle(_centre(), _radius(), Color(0.06, 0.07, 0.09, 0.62))


func _paint_content(l: Control) -> void:
	var ppm := projection.pixels_per_metre
	var rot := projection.angle()
	# World metres drawn under one transform: point' = centre_px + R * ppm * (q - view centre).
	l.draw_set_transform(_centre() - projection.centre.rotated(rot) * ppm, rot, Vector2(ppm, ppm))
	if roads != null:
		if not roads.minor.is_empty():
			l.draw_multiline(roads.minor, Color(1, 1, 1, 0.20), 1.0 / ppm)
		if not roads.major.is_empty():
			l.draw_multiline(roads.major, Color(1, 0.93, 0.78, 0.55), 2.2 / ppm)
	for z in zones:
		_paint_zone(l, z)
	if route_polyline.size() >= 2:
		l.draw_polyline(route_polyline, Color(0.06, 0.25, 0.45, 0.9), 5.0 / ppm)
		l.draw_polyline(route_polyline, Color("#38bdf8"), 2.8 / ppm)
	if quarry != Vector2.INF:
		l.draw_circle(quarry, 4.0 / ppm, Color.WHITE)
	# Areas of the markers that are on the plate: a thin ring of the real size.
	for m in markers:
		var r := float(m.get("radius", 0.0))
		if r * ppm >= 5.0:
			var c := MarkerKind.colour_of(StringName(str(m.get("kind", "mission"))))
			l.draw_arc(Vector2(float(m["x"]), float(m["z"])), r, 0.0, TAU, 24, Color(c, 0.8), 1.5 / ppm)
	l.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _paint_zone(l: Control, z: Dictionary) -> void:
	var ppm := projection.pixels_per_metre
	var c := Vector2(float(z["x"]), float(z["z"]))
	var r := float(z["radius"])
	var w := 1.5 / ppm
	match str(z["kind"]):
		"flood":
			var depth := clampf(float(z.get("depth", 0.0)), 0.0, 1.0)
			l.draw_circle(c, r, Color(0.2, 0.5, 0.9, 0.35 + 0.35 * depth))
			l.draw_arc(c, r, 0.0, TAU, 24, Color(0.55, 0.8, 1.0, 0.9), w)
			if depth >= 0.55:
				l.draw_circle(c, r * 0.4, Color(0.05, 0.2, 0.6, 0.8))
		"strike":
			l.draw_circle(c, r, Color(0.95, 0.25, 0.2, 0.45))
			l.draw_arc(c, r, 0.0, TAU, 24, UiTheme.DANGER, w)
			l.draw_line(c + Vector2(-r, -r) * 0.5, c + Vector2(r, r) * 0.5, UiTheme.DANGER, 2.0 / ppm)
			l.draw_line(c + Vector2(-r, r) * 0.5, c + Vector2(r, -r) * 0.5, UiTheme.DANGER, 2.0 / ppm)
		_:
			l.draw_circle(c, r, Color(1.0, 0.72, 0.1, 0.4))
			l.draw_arc(c, r, 0.0, TAU, 24, UiTheme.AMBER, w)


func _paint_overlay(l: Control) -> void:
	var c := _centre()
	var radius := _radius()
	l.draw_arc(c, radius - 1.0, 0.0, TAU, 48, Color(1, 1, 1, 0.35), 2.0)
	for i in markers.size():
		var m := markers[i]
		var kind := StringName(str(m.get("kind", "mission")))
		var colour := MarkerKind.colour_of(kind)
		var world := Vector2(float(m["x"]), float(m["z"]))
		var hit := projection.clamp_to_circle(world, radius, MARKER_INSET)
		var at: Vector2 = c + (hit["at"] as Vector2)
		if bool(hit["inside"]):
			MapGlyphs.draw(l, kind, at, 6.0 if i == 0 else 4.5, colour)
		elif i == 0:
			# The waypoint arrow: pinned to the edge, with how far it is.
			MapGlyphs.draw_arrow(l, at, hit["direction"], 8.0, colour)
			var text := MapProjection.distance_text(world.distance_to(player))
			var width := _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE).x
			var inward: Vector2 = -(hit["direction"] as Vector2)
			var tp := (c + (hit["at"] as Vector2) + inward * 22.0) - Vector2(width / 2.0, -4.0)
			l.draw_string_outline(_font, tp, text, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE, 4, Color(0, 0, 0, 0.85))
			l.draw_string(_font, tp, text, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE, colour)
	# North: a letter that moves round the rim when the map turns.
	var north := Vector2.UP.rotated(projection.angle())
	var np := c + north * (radius - 10.0)
	if not markers.is_empty() and bool(projection.clamp_to_circle(marker_point(), radius, MARKER_INSET)["inside"]):
		var near := MapProjection.distance_text(marker_point().distance_to(player))
		var w2 := _font.get_string_size(near, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE).x
		var label_y := size.y - 20.0 if (north.y > 0.65 and absf(np.x - c.x) < w2 * 0.5 + 12.0) else size.y - 8.0
		var p2 := Vector2(c.x - w2 / 2.0, label_y)
		l.draw_string_outline(_font, p2, near, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE, 4, Color(0, 0, 0, 0.85))
		l.draw_string(_font, p2, near, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE, MarkerKind.colour_of(StringName(str(markers[0].get("kind", "mission")))))
	# The player: an arrow pointing the way they face (up when the map turns).
	var fwd := Vector2.UP if projection.rotate_with_heading else Vector2(-sin(heading), -cos(heading))
	var side := Vector2(-fwd.y, fwd.x)
	var tip := c + fwd * 8.0
	l.draw_colored_polygon(PackedVector2Array([tip, c - fwd * 6.0 + side * 5.0, c - fwd * 2.5, c - fwd * 6.0 - side * 5.0]), Color.WHITE)
	l.draw_polyline(PackedVector2Array([tip, c - fwd * 6.0 + side * 5.0, c - fwd * 2.5, c - fwd * 6.0 - side * 5.0, tip]), Color(0.05, 0.06, 0.09, 0.9), 1.5)
	l.draw_string_outline(_font, np + Vector2(-4, 4), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE, 4, Color(0, 0, 0, 0.85))
	l.draw_string(_font, np + Vector2(-4, 4), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT_SIZE, Color(1, 1, 1, 0.85))
