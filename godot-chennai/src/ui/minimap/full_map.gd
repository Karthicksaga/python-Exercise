class_name FullMap
extends CanvasLayer
## The full-screen map, opened from the pause menu or by tapping the minimap (G-281): north-up
## roads of the whole neighbourhood, the player, the mission's marker (pinned to the edge with its
## distance when it is off screen) and the places, each with its label; drag to pan, + and - to
## zoom, ME to come back to the player, CLOSE (or Back) to leave. It runs while the tree is paused.
## Roads come from the composition root (`MapRoadFeed`): `near` has every street within a few
## kilometres, `wide` the main roads of a whole district. "© OpenStreetMap contributors" is on it.

signal closed
## The view's centre moved (a pan ended, a zoom): the owner may read the streets round it (G-466).
signal view_moved(centre: Vector2)

## Half the map's height in metres, per zoom step.
## (G-466: two wider steps show the whole city: 12 and 26 km from the centre to the top.)
const ZOOMS: Array[float] = [450.0, 1100.0, 2600.0, 5200.0, 12000.0, 26000.0]
const GUTTER := 16.0
const TEXT := 14

var projection := MapProjection.new()
var near_roads: MapRoads = null
var wide_roads: MapRoads = null
## The whole railway (G-465): lines coloured by kind, stations as dots with names (names from the
## second zoom in), a legend of the kinds above RAIL ON/OFF, which toggles them on both maps
## (`MapSettings.rail_shown`). `cheap` (the Low preset): one colour, no tunnels, no outlines.
var rail: MapRail = null
## The whole city (G-466): main roads everywhere, the world's edge and every label, decluttered.
## Null until built (the near and wide road sets draw meanwhile).
var city: MapCity = null
## The labels written in the last paint: [{index, words, kind, box}] (tests).
var written: Array[Dictionary] = []
var cheap := false
var settings: MapSettings = null
var rail_button: Button
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
	# The rail legend's toggle, bottom right (inside the safe area, clear of the credit and scale).
	var corner := SafeAreaMargin.new()
	corner.name = "RailCorner"
	corner.gutter = int(GUTTER)
	corner.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.add_child(corner)
	var column := VBoxContainer.new()
	column.name = "RailColumn"
	column.mouse_filter = Control.MOUSE_FILTER_IGNORE
	column.size_flags_horizontal = Control.SIZE_SHRINK_END
	column.size_flags_vertical = Control.SIZE_SHRINK_END
	corner.add_child(column)
	rail_button = UiTheme.button(RailText.MAP_RAIL_ON)
	rail_button.name = "RailToggle"
	rail_button.toggle_mode = true
	rail_button.button_pressed = true
	rail_button.custom_minimum_size = Vector2(112.0, UiTheme.MIN_TARGET)
	rail_button.toggled.connect(func(on: bool) -> void:
		if settings != null:
			settings.set_rail_shown(on)
		_sync_rail())
	column.add_child(rail_button)


func _ready() -> void:
	if settings == null:
		settings = MapSettings.shared()
	settings.changed.connect(_sync_rail)
	_sync_rail()


## The toggle follows the saved option (changed here or elsewhere); hidden when there is no railway.
func _sync_rail() -> void:
	var on := settings == null or settings.rail_shown
	rail_button.set_pressed_no_signal(on)
	rail_button.text = RailText.MAP_RAIL_ON if on else RailText.MAP_RAIL_OFF
	rail_button.visible = rail != null and not rail.is_empty()
	_view.queue_redraw()


func set_rail(r: MapRail, low: bool) -> void:
	rail = r
	cheap = low
	_sync_rail()


## True when the railway is drawn now.
func rail_drawn() -> bool:
	return rail != null and not rail.is_empty() and (settings == null or settings.rail_shown)


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
	view_moved.emit(projection.centre)


func set_city(c: MapCity) -> void:
	city = c
	_view.queue_redraw()


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
			if _dragging and not b.pressed:
				view_moved.emit(projection.centre)
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
	elif event is InputEventScreenTouch and not (event as InputEventScreenTouch).pressed:
		view_moved.emit(projection.centre)


func _unhandled_key_input(event: InputEvent) -> void:
	if visible and event.is_action_pressed(&"ui_cancel"):
		get_viewport().set_input_as_handled()
		close()


func _paint(v: Control) -> void:
	var size := v.size
	var c := size / 2.0
	v.draw_rect(Rect2(Vector2.ZERO, size), Color(0.05, 0.06, 0.09, 1.0))
	var ppm := projection.pixels_per_metre
	var view := Rect2(projection.centre - c / ppm, size / ppm)
	v.draw_set_transform(c - projection.centre * ppm, 0.0, Vector2(ppm, ppm))
	# The city: its land a shade lighter than the blank round it, then every main road in view.
	if city != null and not city.land_triangles.is_empty():
		var colours := PackedColorArray()
		colours.resize(city.boundary.size())
		colours.fill(Color(0.09, 0.105, 0.13, 1.0))
		RenderingServer.canvas_item_add_triangle_array(v.get_canvas_item(), city.land_triangles, city.boundary, colours)
	var major_w := (2.4 if zoom <= 1 else (1.6 if zoom <= 3 else 1.1)) / ppm
	if city != null:
		for cell in city.roads_in(view):
			v.draw_multiline(cell, Color(1, 0.93, 0.78, 0.6 if zoom <= 3 else 0.45), major_w)
	var roads := roads_for_zoom()
	if roads != null:
		if zoom <= 1 and not roads.minor.is_empty():
			v.draw_multiline(roads.minor, Color(1, 1, 1, 0.20), 1.0 / ppm)
		if not roads.major.is_empty() and (city == null or zoom <= 1):
			v.draw_multiline(roads.major, Color(1, 0.93, 0.78, 0.6), major_w)
	if rail_drawn():
		rail.draw_lines(v, ppm, 3.0 if zoom <= 1 else (2.2 if zoom <= 3 else 1.6), cheap)
		rail.draw_stations(v, ppm, 6.0 if zoom <= 1 else (4.0 if zoom <= 3 else 3.0), cheap)
	v.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	_paint_labels(v, view, size)
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
	_paint_rail_legend(v)
	_paint_scale(v, size)
	v.draw_string(_font, Vector2(GUTTER, size.y - 8.0), credit, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.6))
	v.draw_string(_font, Vector2(size.x - GUTTER - 12.0, 92.0), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, Color(1, 1, 1, 0.7))
	v.draw_line(Vector2(size.x - GUTTER - 6.0, 124.0), Vector2(size.x - GUTTER - 6.0, 98.0), Color(1, 1, 1, 0.7), 2.0)


## The map's own panels and buttons, where no label may go (screen rects).
func _blocked(size: Vector2) -> Array[Rect2]:
	var out: Array[Rect2] = []
	for b: Button in [zoom_in_button, zoom_out_button, recentre_button, close_button, rail_button]:
		if b.is_visible_in_tree():
			out.append(b.get_global_rect().grow(4.0))
	out.append(Rect2(0, 0, 200, close_button.get_global_rect().end.y + 4.0))  # the MAP title
	out.append(Rect2(0, size.y - 76.0, minf(size.x * 0.55, 420.0), 76.0))  # scale, legend, credit
	if rail != null and not rail.is_empty() and rail_button.is_visible_in_tree():
		var r := rail_button.get_global_rect()
		out.append(Rect2(r.position.x - 60.0, r.position.y - 16.0 - 18.0 * rail.kinds.size(), r.size.x + 60.0, 18.0 * rail.kinds.size() + 16.0))
	return out


## Every label in view at this zoom (areas, roads, stations, hospitals, police, bus stands and
## stops), written in priority order, none over another or over the map's controls (G-466).
func _paint_labels(v: Control, view: Rect2, size: Vector2) -> void:
	written.clear()
	var half := ZOOMS[zoom]
	var c := size / 2.0
	var candidates: Array[Dictionary] = []
	var order := 0
	if city != null:
		for i in city.labels_in(view, half):
			var kind := city.label_kinds[i]
			var words := city.label_names[i]
			var fs: int = MapCity.FONT_SIZE[kind]
			var at := c + projection.offset_of(city.label_points[i])
			var w := _font.get_string_size(words, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + (12.0 if MapCity.GLYPH.has(kind) else 0.0)
			var ang := city.label_angles[i]
			var ext := Vector2(absf(cos(ang)) * w + absf(sin(ang)) * fs, absf(sin(ang)) * w + absf(cos(ang)) * fs)
			candidates.append({"rank": kind, "order": order, "index": i, "words": words, "kind": kind, "at": at, "angle": ang, "size": fs, "width": w, "box": Rect2(at - ext / 2.0, ext).grow(2.0)})
			order += 1
	if rail_drawn() and half <= float(MapCity.FROM_ZOOM[MapCity.Kind.STATION]):
		for i in rail.station_points.size():
			if not view.has_point(rail.station_points[i]):
				continue
			var at := c + projection.offset_of(rail.station_points[i])
			var words := rail.station_names[i]
			var w := _font.get_string_size(words, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT - 2).x
			candidates.append({"rank": MapCity.Kind.STATION, "order": order, "index": i, "words": words, "kind": MapCity.Kind.STATION, "at": at + Vector2(7.0 + w / 2.0, -10.0), "angle": 0.0, "size": TEXT - 2, "width": w, "box": Rect2(at + Vector2(5.0, -20.0), Vector2(w + 4.0, TEXT + 2.0))})
			order += 1
	for p in MapCity.place(candidates, _blocked(size)):
		_write(v, p)
		written.append({"index": p["index"], "words": p["words"], "kind": p["kind"], "box": p["box"]})


func _write(v: Control, p: Dictionary) -> void:
	var kind: int = p["kind"]
	var fs: int = p["size"]
	var words: String = p["words"]
	var w: float = p["width"]
	var colour: Color = MapCity.COLOUR[kind]
	v.draw_set_transform(p["at"], float(p["angle"]), Vector2.ONE)
	var x := -w / 2.0
	if MapCity.GLYPH.has(kind):
		_glyph(v, kind, Vector2(x + 4.0, -fs * 0.3), colour)
		x += 12.0
	var baseline := Vector2(x, fs * 0.35)
	v.draw_string_outline(_font, baseline, words, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, 4, Color(0, 0, 0, 0.85))
	v.draw_string(_font, baseline, words, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, colour)
	v.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## A small sign before the words: a cross (hospital), a shield (police), a dot (bus stand, stop).
func _glyph(v: Control, kind: int, at: Vector2, colour: Color) -> void:
	match kind:
		MapCity.Kind.HOSPITAL:
			v.draw_rect(Rect2(at + Vector2(-4, -1.2), Vector2(8, 2.4)), colour)
			v.draw_rect(Rect2(at + Vector2(-1.2, -4), Vector2(2.4, 8)), colour)
		MapCity.Kind.POLICE:
			v.draw_colored_polygon(PackedVector2Array([at + Vector2(-4, -4), at + Vector2(4, -4), at + Vector2(4, 1), at + Vector2(0, 5), at + Vector2(-4, 1)]), colour)
		_:
			v.draw_circle(at, 3.2, colour)


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


## The rail kinds, a colour bar and a name each, stacked above the RAIL ON/OFF toggle; dimmed when
## the lines are off.
func _paint_rail_legend(v: Control) -> void:
	if rail == null or rail.is_empty() or not rail_button.is_visible_in_tree():
		return
	var r := rail_button.get_global_rect()
	var right := r.position.x + r.size.x
	var y := r.position.y - 12.0
	var alpha := 1.0 if rail_drawn() else 0.4
	for i in range(rail.kinds.size() - 1, -1, -1):
		var k := rail.kinds[i]
		var w := _font.get_string_size(k.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12).x
		var x := right - w
		v.draw_line(Vector2(x - 26.0, y - 4.0), Vector2(x - 8.0, y - 4.0), Color(k.colour, alpha), 4.0)
		v.draw_string_outline(_font, Vector2(x, y), k.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 4, Color(0, 0, 0, 0.9 * alpha))
		v.draw_string(_font, Vector2(x, y), k.label, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.85 * alpha))
		y -= 18.0


func _paint_scale(v: Control, size: Vector2) -> void:
	var ppm := projection.pixels_per_metre
	var length := 100.0
	for candidate: float in [100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0]:
		length = candidate
		if candidate * ppm >= 70.0:
			break
	var px := length * ppm
	var from := Vector2(GUTTER, size.y - 62.0)
	v.draw_line(from, from + Vector2(px, 0), Color(1, 1, 1, 0.85), 2.0)
	v.draw_line(from, from + Vector2(0, -6), Color(1, 1, 1, 0.85), 2.0)
	v.draw_line(from + Vector2(px, 0), from + Vector2(px, -6), Color(1, 1, 1, 0.85), 2.0)
	var text := "%d m" % int(length) if length < 1000.0 else "%d km" % int(length / 1000.0)
	v.draw_string(_font, from + Vector2(0, 16), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.85))
