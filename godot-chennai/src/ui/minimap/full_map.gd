class_name FullMap
extends CanvasLayer
## The full-screen map, opened from the pause menu or by tapping the minimap (G-281): north-up
## roads of the whole neighbourhood, the player, the mission's marker (pinned to the edge with its
## distance when it is off screen) and the places, each with its label; drag to pan, + and - to
## zoom, ME to come back to the player, CLOSE (or Back) to leave. It runs while the tree is paused.
## Roads come from the composition root (`MapRoadFeed`): `near` has every street within a few
## kilometres, `wide` the main roads of a whole district. "© OpenStreetMap contributors" is on it.

signal closed

## Half the map's height in metres, per zoom step.
const ZOOMS: Array[float] = [450.0, 1100.0, 2600.0, 5200.0]
const GUTTER := 16.0
const TEXT := 14

var projection := MapProjection.new()
var near_roads: MapRoads = null
var wide_roads: MapRoads = null
var markers: Array[Dictionary] = []
var player := Vector2.ZERO
var heading := 0.0
var zoom := 1
var credit := "© OpenStreetMap contributors"
## True while the wide road set is still being read.
var loading := false

var close_button: Button
var zoom_in_button: Button
var zoom_out_button: Button
var recentre_button: Button
var _root: Control
var _view: _View
var _pan := Vector2.ZERO
var _dragging := false
var _font := ThemeDB.fallback_font


class _View extends Control:
	var painter := Callable()

	func _draw() -> void:
		if painter.is_valid():
			painter.call(self)


func _init() -> void:
	name = "FullMap"
	layer = 8
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	_root = Control.new()
	_root.name = "Root"
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.theme = UiTheme.get_theme()
	add_child(_root)
	_view = _View.new()
	_view.name = "View"
	_view.set_anchors_preset(Control.PRESET_FULL_RECT)
	_view.mouse_filter = Control.MOUSE_FILTER_STOP
	_view.painter = _paint
	_view.gui_input.connect(_on_input)
	_view.resized.connect(_fit)
	_root.add_child(_view)
	var margin := SafeAreaMargin.new()
	margin.name = "Safe"
	margin.gutter = int(GUTTER)
	_root.add_child(margin)
	var bar := HBoxContainer.new()
	bar.name = "Bar"
	bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_theme_constant_override("separation", 8)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	margin.add_child(bar)
	bar.add_child(UiTheme.label("MAP", UiTheme.BUTTON_SIZE + 4, UiTheme.AMBER))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_child(spacer)
	zoom_in_button = _button(bar, "+", "ZoomIn", func() -> void: set_zoom(zoom - 1))
	zoom_out_button = _button(bar, "-", "ZoomOut", func() -> void: set_zoom(zoom + 1))
	for b: Button in [zoom_in_button, zoom_out_button]:
		b.add_theme_font_size_override("font_size", 26)
	recentre_button = _button(bar, "ME", "Recentre", recentre)
	close_button = _button(bar, "CLOSE", "Close", close)
	close_button.custom_minimum_size.x = 96.0


func _button(bar: HBoxContainer, text: String, node_name: String, press: Callable) -> Button:
	var b := UiTheme.button(text)
	b.name = node_name
	b.custom_minimum_size = Vector2(UiTheme.MIN_TARGET, UiTheme.MIN_TARGET)
	b.pressed.connect(press)
	bar.add_child(b)
	return b


func is_open() -> bool:
	return visible


func open(at: Vector2, yaw: float, near: MapRoads, wide: MapRoads, points: Array[Dictionary]) -> void:
	player = at
	heading = yaw
	near_roads = near
	wide_roads = wide
	markers = points
	_pan = Vector2.ZERO
	visible = true
	_fit()
	recentre_button.grab_focus()


func close() -> void:
	if visible:
		visible = false
		_dragging = false
		closed.emit()


func set_roads(near: MapRoads, wide: MapRoads) -> void:
	near_roads = near
	wide_roads = wide
	_view.queue_redraw()


func set_zoom(z: int) -> void:
	zoom = clampi(z, 0, ZOOMS.size() - 1)
	zoom_in_button.disabled = zoom == 0
	zoom_out_button.disabled = zoom == ZOOMS.size() - 1
	_fit()


func recentre() -> void:
	_pan = Vector2.ZERO
	_fit()


## Metres across the view's height at the current zoom.
func view_metres() -> float:
	return ZOOMS[zoom] * 2.0


## The road set that fits this zoom: every street when zoomed in, main roads when zoomed out.
func roads_for_zoom() -> MapRoads:
	if zoom <= 1 and near_roads != null and not near_roads.is_empty():
		return near_roads
	return wide_roads if wide_roads != null and not wide_roads.is_empty() else near_roads


func _fit() -> void:
	projection.rotate_with_heading = false
	projection.centre = player + _pan
	projection.heading = heading
	projection.pixels_per_metre = maxf(_view.size.y, 1.0) / view_metres()
	_view.queue_redraw()


func _on_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		if b.button_index == MOUSE_BUTTON_LEFT:
			_dragging = b.pressed
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_UP:
			set_zoom(zoom - 1)
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			set_zoom(zoom + 1)
	elif event is InputEventMouseMotion and _dragging:
		_pan -= (event as InputEventMouseMotion).relative / projection.pixels_per_metre
		_fit()
	elif event is InputEventScreenDrag:
		_pan -= (event as InputEventScreenDrag).relative / projection.pixels_per_metre
		_fit()


func _unhandled_key_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


func _paint(v: Control) -> void:
	var size := v.size
	var c := size / 2.0
	v.draw_rect(Rect2(Vector2.ZERO, size), Color(0.05, 0.06, 0.09, 1.0))
	var ppm := projection.pixels_per_metre
	var roads := roads_for_zoom()
	if roads != null:
		v.draw_set_transform(c - projection.centre * ppm, 0.0, Vector2(ppm, ppm))
		if zoom <= 1 and not roads.minor.is_empty():
			v.draw_multiline(roads.minor, Color(1, 1, 1, 0.20), 1.0 / ppm)
		if not roads.major.is_empty():
			v.draw_multiline(roads.major, Color(1, 0.93, 0.78, 0.6), (2.4 if zoom <= 1 else 1.4) / ppm)
		v.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if loading:
		v.draw_string(_font, Vector2(c.x - 60.0, 62.0), "Drawing the map...", HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, Color(1, 1, 1, 0.7))
	var half := size / 2.0
	# Places and the mission's marker, with their words; the mission's is pinned when off screen.
	for i in markers.size():
		var m := markers[i]
		var kind := StringName(str(m.get("kind", "mission")))
		var colour := MarkerKind.colour_of(kind)
		var world := Vector2(float(m["x"]), float(m["z"]))
		var hit := projection.clamp_to_rect(world, half - Vector2(0, 0), 26.0)
		var at: Vector2 = c + (hit["at"] as Vector2)
		var primary := bool(m.get("primary", false))
		if bool(hit["inside"]):
			MapGlyphs.draw(v, kind, at, 9.0 if primary else 6.0, colour)
			var text := str(m.get("label", MarkerKind.label_of(kind)))
			if primary or ZOOMS[zoom] <= 2600.0:
				v.draw_string_outline(_font, at + Vector2(12, 5), text, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, 4, Color(0, 0, 0, 0.9))
				v.draw_string(_font, at + Vector2(12, 5), text, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, colour if primary else Color(1, 1, 1, 0.85))
		elif primary:
			MapGlyphs.draw_arrow(v, at, hit["direction"], 10.0, colour)
			var far := MapProjection.distance_text(world.distance_to(player))
			var label := "%s %s" % [str(m.get("label", MarkerKind.label_of(kind))), far]
			var w := _font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT).x
			var tp := at - (hit["direction"] as Vector2) * 30.0 - Vector2(w / 2.0, -5.0)
			tp.x = clampf(tp.x, 6.0, size.x - w - 6.0)
			v.draw_string_outline(_font, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, 4, Color(0, 0, 0, 0.9))
			v.draw_string(_font, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, colour)
	# The player.
	var pp := c + projection.offset_of(player)
	var fwd := Vector2(-sin(heading), -cos(heading))
	var side := Vector2(-fwd.y, fwd.x)
	v.draw_colored_polygon(PackedVector2Array([pp + fwd * 11.0, pp - fwd * 8.0 + side * 7.0, pp - fwd * 3.0, pp - fwd * 8.0 - side * 7.0]), Color.WHITE)
	v.draw_polyline(PackedVector2Array([pp + fwd * 11.0, pp - fwd * 8.0 + side * 7.0, pp - fwd * 3.0, pp - fwd * 8.0 - side * 7.0, pp + fwd * 11.0]), Color(0.05, 0.06, 0.09, 0.9), 1.5)
	_paint_legend(v, size)
	_paint_scale(v, size)
	v.draw_string(_font, Vector2(GUTTER, size.y - 8.0), credit, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.6))
	v.draw_string(_font, Vector2(size.x - GUTTER - 12.0, 92.0), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, Color(1, 1, 1, 0.7))
	v.draw_line(Vector2(size.x - GUTTER - 6.0, 124.0), Vector2(size.x - GUTTER - 6.0, 98.0), Color(1, 1, 1, 0.7), 2.0)


## The kinds on the map, each with its shape, colour and words (what the circles mean).
func _paint_legend(v: Control, size: Vector2) -> void:
	var kinds: Array[StringName] = []
	for m in markers:
		var k := StringName(str(m.get("kind", "mission")))
		if not kinds.has(k):
			kinds.append(k)
	var x := GUTTER
	var y := size.y - 34.0
	for k in kinds:
		MapGlyphs.draw(v, k, Vector2(x + 7.0, y), 6.0, MarkerKind.colour_of(k))
		var text := MarkerKind.label_of(k)
		v.draw_string_outline(_font, Vector2(x + 18.0, y + 5.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 4, Color(0, 0, 0, 0.9))
		v.draw_string(_font, Vector2(x + 18.0, y + 5.0), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.85))
		x += 28.0 + _font.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x


func _paint_scale(v: Control, size: Vector2) -> void:
	var ppm := projection.pixels_per_metre
	var length := 100.0
	for candidate: float in [100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0]:
		length = candidate
		if candidate * ppm >= 70.0:
			break
	var px := length * ppm
	var from := Vector2(size.x - GUTTER - px, size.y - 30.0)
	v.draw_line(from, from + Vector2(px, 0), Color(1, 1, 1, 0.85), 2.0)
	v.draw_line(from, from + Vector2(0, -6), Color(1, 1, 1, 0.85), 2.0)
	v.draw_line(from + Vector2(px, 0), from + Vector2(px, -6), Color(1, 1, 1, 0.85), 2.0)
	var text := "%d m" % int(length) if length < 1000.0 else "%d km" % int(length / 1000.0)
	v.draw_string(_font, from + Vector2(0, 16), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.85))
