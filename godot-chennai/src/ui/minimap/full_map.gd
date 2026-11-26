class_name FullMap
extends CanvasLayer
## The full-screen map, opened from the pause menu or by tapping the minimap (G-281): north-up
## roads of the whole neighbourhood, the player, the mission's marker (pinned to the edge with its
## distance when it is off screen) and the places, each with its label; drag to pan, + and - to
## zoom, ME to come back to the player, CLOSE (or Back) to leave. It runs while the tree is paused.
## Roads come from the composition root (`MapRoadFeed`): `near` has every street within a few
## kilometres, `wide` the main roads of a whole district. "© OpenStreetMap contributors" is on it.

signal closed
signal route_requested(route: Dictionary)

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

var geo_index: ChennaiGeoIndex = null
var street_service: StreetNameService = null
var layers: Dictionary[StringName, bool] = {
	&"parks": true,
	&"water": true,
	&"railway": true,
	&"metro": true,
	&"localities": true,
	&"road_names": true,
	&"route": true,
}

var close_button: Button
var zoom_in_button: Button
var zoom_out_button: Button
var recentre_button: Button
var find_button: Button
var route_button: Button
var layers_button: Button

var _root: Control
var _view: _View
var _pan := Vector2.ZERO
var _dragging := false
var _drag_dist := 0.0
var _press_pos := Vector2.ZERO
var _font: Font
var _label_placer := MapLabelPlacer.new()

var _search_panel: PanelContainer
var _search_edit: LineEdit
var _search_list: VBoxContainer
var _route_panel: PanelContainer
var _route_summary: Label
var _route_stops_box: VBoxContainer
var _route_mode_btn: Button
var _layers_panel: PanelContainer
var _inspector_panel: PanelContainer
var _inspector_title: Label
var _inspector_sub: Label
var _inspector_coords: Label

var _selected_place: Dictionary = {}
var _waypoints: Array[Dictionary] = []
var _dest_stop: Dictionary = {}
var _active_route: Dictionary = {}
var _route_mode := "fastest"


class _View extends Control:
	var painter := Callable()

	func _draw() -> void:
		if painter.is_valid():
			painter.call(self)


func _init() -> void:
	name = "FullMap"
	layer = 9
	process_mode = Node.PROCESS_MODE_ALWAYS
	visible = false
	_font = RailFonts.with_tamil()
	_root = Control.new()
	_root.name = "Root"
	_root.set_anchors_preset(Control.PRESET_FULL_RECT)
	_root.theme = UiTheme.get_theme()
	add_child(_root)
	_view = _View.new()
	_view.name = "View"
	_view.set_anchors_preset(Control.PRESET_FULL_RECT)
	_view.mouse_filter = Control.MOUSE_FILTER_STOP
	# Over the pause menu's list: its drags are the map's (G-492).
	_view.add_to_group(TouchScroll.COVER_GROUP)
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
	bar.add_theme_constant_override("separation", 6)
	bar.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bar.size_flags_vertical = Control.SIZE_SHRINK_BEGIN
	margin.add_child(bar)
	bar.add_child(UiTheme.label("MAP", UiTheme.BUTTON_SIZE + 4, UiTheme.AMBER))
	find_button = _button(bar, "FIND", "Find", _toggle_search)
	route_button = _button(bar, "ROUTE", "Route", _toggle_route)
	layers_button = _button(bar, "LAYERS", "Layers", _toggle_layers)
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	spacer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	bar.add_child(spacer)
	zoom_in_button = _button(bar, "+", "ZoomIn", func() -> void: set_zoom(zoom - 1))
	zoom_out_button = _button(bar, "-", "ZoomOut", func() -> void: set_zoom(zoom + 1))
	for b: Button in [zoom_in_button, zoom_out_button]:
		b.add_theme_font_size_override("font_size", 26)
	recentre_button = _button(bar, "", "Recentre", recentre)
	Tr.bind(recentre_button, "map.me")
	close_button = _button(bar, "", "Close", close)
	Tr.bind(close_button, "map.close")
	close_button.custom_minimum_size.x = 96.0
	_build_drawers(margin)


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
	# One finger arrives as touch and as emulated mouse (phone), one mouse as mouse and emulated
	# touch (`emulate_touch_from_mouse`): only the real one pans, else the map moved twice as far
	# as the finger (G-492).
	if event.device == InputEvent.DEVICE_ID_EMULATION:
		return
	if event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		if b.button_index == MOUSE_BUTTON_LEFT:
			if b.pressed:
				_dragging = true
				_drag_dist = 0.0
				_press_pos = b.position
			else:
				_dragging = false
				if _drag_dist < 8.0 and geo_index != null and geo_index.loaded:
					_on_map_tapped(b.position)
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_UP:
			set_zoom(zoom - 1)
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			set_zoom(zoom + 1)
	elif event is InputEventMouseMotion and _dragging:
		var mm := event as InputEventMouseMotion
		_drag_dist += mm.relative.length()
		_pan -= mm.relative / projection.pixels_per_metre
		_fit()
	elif event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			_drag_dist = 0.0
			_press_pos = st.position
		elif _drag_dist < 10.0 and geo_index != null and geo_index.loaded:
			_on_map_tapped(st.position)
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		_drag_dist += sd.relative.length()
		_pan -= sd.relative / projection.pixels_per_metre
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
	_label_placer.begin(size, _font)

	# World-space OSM parks, water, beaches, roads, railway, and active route
	var half_m := (size * 0.5) / maxf(ppm, 1e-4)
	var vrect := Rect2(projection.centre - half_m, half_m * 2.0)
	v.draw_set_transform(c - projection.centre * ppm, 0.0, Vector2(ppm, ppm))
	if geo_index != null and geo_index.loaded and geo_index.source != null:
		_paint_geo_areas(v, vrect, ppm)
	var roads := roads_for_zoom()
	if roads != null:
		if zoom <= 1 and not roads.minor.is_empty():
			v.draw_multiline(roads.minor, Color(1, 1, 1, 0.20), 1.0 / ppm)
		if not roads.major.is_empty():
			v.draw_multiline(roads.major, Color(1, 0.93, 0.78, 0.6), (2.4 if zoom <= 1 else 1.4) / ppm)
	if geo_index != null and geo_index.loaded and bool(layers.get(&"railway", true)):
		for idx in geo_index.rail_tracks.size():
			var sys := geo_index.rail_track_systems[idx]
			var rcol := Color(0.32, 0.78, 0.92, 0.7) if sys == "mrts" else Color(0.95, 0.62, 0.22, 0.7)
			v.draw_polyline(geo_index.rail_tracks[idx], rcol, 2.0 / ppm)
	if geo_index != null and geo_index.loaded and bool(layers.get(&"metro", true)):
		for mtr: Dictionary in geo_index.metro_tracks:
			var mcol := Color("#2dd4bf")
			var cname := str(mtr.get("colour", "")).to_lower()
			if cname == "blue":
				mcol = Color("#3b82f6")
			elif cname == "green":
				mcol = Color("#22c55e")
			v.draw_polyline(mtr["points"] as PackedVector2Array, Color(mcol, 0.85), 2.4 / ppm)
	if bool(layers.get(&"route", true)) and not _active_route.is_empty() and bool(_active_route.get("ok", false)):
		var poly: PackedVector2Array = _active_route.get("polyline", PackedVector2Array())
		if poly.size() >= 2:
			v.draw_polyline(poly, Color(0.08, 0.28, 0.48, 0.9), 7.5 / ppm)
			v.draw_polyline(poly, Color("#38bdf8"), 4.0 / ppm)
	v.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	if geo_index != null and geo_index.loaded:
		_paint_geo_labels(v, vrect, c)

	if loading:
		v.draw_string(_font, Vector2(c.x - 60.0, 62.0), Tr.line("map.drawing"), HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, Color(1, 1, 1, 0.7))
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
				_label_placer.draw_poi_label(v, at, text, TEXT, colour if primary else Color(1, 1, 1, 0.85))
		elif primary:
			MapGlyphs.draw_arrow(v, at, hit["direction"], 10.0, colour)
			var far := MapProjection.distance_text(world.distance_to(player))
			var label := "%s %s" % [str(m.get("label", MarkerKind.label_of(kind))), far]
			var w := _font.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT).x
			var tp := at - (hit["direction"] as Vector2) * 30.0 - Vector2(w / 2.0, -5.0)
			tp.x = clampf(tp.x, 6.0, size.x - w - 6.0)
			v.draw_string_outline(_font, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, 4, Color(0, 0, 0, 0.9))
			v.draw_string(_font, tp, label, HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, colour)
	if not _selected_place.is_empty():
		var sp: Vector2 = _selected_place["pos"]
		var sat := c + projection.offset_of(sp)
		v.draw_arc(sat, 11.0, 0.0, TAU, 24, Color("#ff6b5a"), 2.4)
		v.draw_circle(sat, 4.5, Color("#ff6b5a"))
	if not _dest_stop.is_empty():
		var dp: Vector2 = _dest_stop["pos"]
		var dat := c + projection.offset_of(dp)
		v.draw_circle(dat, 9.0, UiTheme.AMBER)
		v.draw_string(_font, dat + Vector2(-4.0, 4.0), "B", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.BLACK)
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
	v.draw_string(_font, Vector2(size.x - GUTTER - 12.0, 92.0), Tr.line("map.north"), HORIZONTAL_ALIGNMENT_LEFT, -1, TEXT, Color(1, 1, 1, 0.7))
	v.draw_line(Vector2(size.x - GUTTER - 6.0, 124.0), Vector2(size.x - GUTTER - 6.0, 98.0), Color(1, 1, 1, 0.7), 2.0)


func _paint_geo_areas(v: Control, vrect: Rect2, ppm: float) -> void:
	var show_parks: bool = bool(layers.get(&"parks", true))
	var show_water: bool = bool(layers.get(&"water", true))
	var t0 := geo_index.source.tile_at(vrect.position)
	var t1 := geo_index.source.tile_at(vrect.end)
	var count := 0
	for tx in range(t0.x, t1.x + 1):
		for tz in range(t0.y, t1.y + 1):
			var tile := Vector2i(tx, tz)
			if not geo_index.source.tiles.has(tile):
				continue
			count += 1
			if count > 4:
				return
			geo_index.ensure_tile(tile, true)
			for a: Dictionary in geo_index.get_tile_areas(tile):
				if not (a["box"] as Rect2).intersects(vrect):
					continue
				var kind: StringName = a["kind"]
				var col := Color.TRANSPARENT
				if kind == &"park" and show_parks:
					col = Color(0.08, 0.22, 0.14, 0.62)
				elif kind == &"water" and show_water:
					col = Color(0.04, 0.14, 0.28, 0.75)
				elif kind == &"beach" and show_parks:
					col = Color(0.24, 0.21, 0.12, 0.55)
				if col.a <= 0.0:
					continue
				var outline: PackedVector2Array = a["outline"]
				if not Geometry2D.triangulate_polygon(outline).is_empty():
					v.draw_colored_polygon(outline, col)
				else:
					v.draw_polyline(outline, col, 1.5 / ppm)


func _paint_geo_labels(v: Control, vrect: Rect2, c: Vector2) -> void:
	if bool(layers.get(&"railway", true)):
		for st: Dictionary in geo_index.rail_stations:
			var sp: Vector2 = st["pos"]
			if not vrect.has_point(sp):
				continue
			var at := c + projection.offset_of(sp)
			v.draw_rect(Rect2(at - Vector2(4.0, 4.0), Vector2(8.0, 8.0)), Color("#38bdf8"))
			if view_metres() <= 5500.0:
				_label_placer.draw_poi_label(v, at, str(st["name"]), 11, Color("#93e2ff"))
	if bool(layers.get(&"metro", true)):
		for mst: Dictionary in geo_index.metro_stations:
			var mp: Vector2 = mst["pos"]
			if not vrect.has_point(mp):
				continue
			var at := c + projection.offset_of(mp)
			v.draw_circle(at, 4.5, Color("#2dd4bf"))
			v.draw_arc(at, 4.5, 0.0, TAU, 12, Color(0.04, 0.06, 0.09, 0.9), 1.2)
			if view_metres() <= 5500.0:
				var mlabel := str(mst["name"]) + " (M)"
				_label_placer.draw_poi_label(v, at, mlabel, 11, Color("#5eead4"))
	if bool(layers.get(&"localities", true)):
		for a: Dictionary in geo_index.areas_meta:
			var ap: Vector2 = a["pos"]
			if not vrect.grow(1000.0).has_point(ap):
				continue
			var at := c + projection.offset_of(ap)
			var ta := str(a["name_ta"]) if view_metres() <= 6000.0 else ""
			_label_placer.draw_locality_label(v, at, str(a["name"]), ta, 13, Color(0.95, 0.87, 0.62, 0.9))
	if bool(layers.get(&"road_names", true)) and view_metres() <= 2600.0:
		var seen: Dictionary[String, bool] = {}
		var placed := 0
		for road: Road in geo_index.get_roads_in_rect(vrect):
			if road.name == "" or road.points.size() < 2 or seen.has(road.name):
				continue
			if zoom > 0 and not Road.MAIN_KINDS.has(road.kind):
				continue
			var mid := road.points[road.points.size() / 2]
			if not vrect.has_point(mid):
				continue
			var p0 := road.points[maxi(0, road.points.size() / 2 - 1)]
			var p1 := road.points[mini(road.points.size() - 1, road.points.size() / 2)]
			if p0.distance_to(p1) < 5.0:
				continue
			if _label_placer.draw_street_label(v, c + projection.offset_of(mid), (p1 - p0).angle(), road.name, 11, Color("#dce6f5")):
				seen[road.name] = true
				placed += 1
				if placed >= 20:
					break


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
	var text := Tr.line("hud.m", [int(length)]) if length < 1000.0 else Tr.line("hud.km", [int(length / 1000.0)])
	v.draw_string(_font, from + Vector2(0, 16), text, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.85))


func _build_drawers(margin: SafeAreaMargin) -> void:
	var overlay := Control.new()
	overlay.name = "Drawers"
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	margin.add_child(overlay)

	# Search drawer
	_search_panel = PanelContainer.new()
	_search_panel.visible = false
	_search_panel.offset_top = 56.0
	_search_panel.offset_right = 340.0
	_search_panel.offset_bottom = 270.0
	_search_panel.add_theme_stylebox_override("panel", _glass_box())
	overlay.add_child(_search_panel)
	var svb := VBoxContainer.new()
	svb.add_theme_constant_override("separation", 4)
	_search_panel.add_child(svb)
	_search_edit = LineEdit.new()
	_search_edit.placeholder_text = "Search streets, localities, GPS..."
	_search_edit.add_theme_font_override("font", _font)
	_search_edit.add_theme_font_size_override("font_size", 12)
	_search_edit.text_changed.connect(_on_search_changed)
	svb.add_child(_search_edit)
	var ssc := ScrollContainer.new()
	ssc.size_flags_vertical = Control.SIZE_EXPAND_FILL
	ssc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	svb.add_child(ssc)
	_search_list = VBoxContainer.new()
	_search_list.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	_search_list.add_theme_constant_override("separation", 3)
	ssc.add_child(_search_list)

	# Route drawer
	_route_panel = PanelContainer.new()
	_route_panel.visible = false
	_route_panel.offset_top = 56.0
	_route_panel.offset_right = 300.0
	_route_panel.offset_bottom = 290.0
	_route_panel.add_theme_stylebox_override("panel", _glass_box())
	overlay.add_child(_route_panel)
	var rvb := VBoxContainer.new()
	rvb.add_theme_constant_override("separation", 4)
	_route_panel.add_child(rvb)
	var rhdr := HBoxContainer.new()
	rvb.add_child(rhdr)
	rhdr.add_child(UiTheme.label("ROUTE", 13, UiTheme.AMBER))
	var rsp := Control.new()
	rsp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	rhdr.add_child(rsp)
	_route_mode_btn = _small_btn("Fastest", func() -> void:
		_route_mode = "shortest" if _route_mode == "fastest" else "fastest"
		_route_mode_btn.text = _route_mode.capitalize()
		_recompute_route()
	)
	rhdr.add_child(_route_mode_btn)
	rhdr.add_child(_small_btn("Clear", _clear_route))
	_route_stops_box = VBoxContainer.new()
	_route_stops_box.add_theme_constant_override("separation", 2)
	rvb.add_child(_route_stops_box)
	_route_summary = UiTheme.label("Tap map or Search to set Destination.", 11, UiTheme.TEXT_DIM)
	_route_summary.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	rvb.add_child(_route_summary)

	# Layers drawer
	_layers_panel = PanelContainer.new()
	_layers_panel.visible = false
	_layers_panel.anchor_left = 1.0
	_layers_panel.anchor_right = 1.0
	_layers_panel.offset_left = -220.0
	_layers_panel.offset_top = 56.0
	_layers_panel.offset_bottom = 240.0
	_layers_panel.add_theme_stylebox_override("panel", _glass_box())
	overlay.add_child(_layers_panel)
	var lvb := VBoxContainer.new()
	lvb.add_theme_constant_override("separation", 2)
	_layers_panel.add_child(lvb)
	for pair: Array in [[&"localities", "Localities (EN/TA)"], [&"road_names", "Road Names"], [&"railway", "Railway & Stations"], [&"metro", "Chennai Metro (OSM)"], [&"parks", "Parks & Beaches"], [&"water", "Water & Canals"], [&"route", "Active Route"]]:
		var lid: StringName = pair[0]
		var cb := CheckBox.new()
		cb.text = str(pair[1])
		cb.button_pressed = bool(layers.get(lid, true))
		cb.add_theme_font_size_override("font_size", 11)
		cb.add_theme_color_override("font_color", UiTheme.TEXT)
		cb.add_theme_color_override("font_pressed_color", UiTheme.AMBER)
		cb.toggled.connect(func(on: bool) -> void:
			layers[lid] = on
			_view.queue_redraw()
		)
		lvb.add_child(cb)

	# Place Inspector (bottom-right)
	_inspector_panel = PanelContainer.new()
	_inspector_panel.visible = false
	_inspector_panel.anchor_left = 1.0
	_inspector_panel.anchor_right = 1.0
	_inspector_panel.anchor_top = 1.0
	_inspector_panel.anchor_bottom = 1.0
	_inspector_panel.offset_left = -330.0
	_inspector_panel.offset_top = -132.0
	_inspector_panel.offset_bottom = -16.0
	_inspector_panel.add_theme_stylebox_override("panel", _glass_box())
	overlay.add_child(_inspector_panel)
	var ivb := VBoxContainer.new()
	ivb.add_theme_constant_override("separation", 2)
	_inspector_panel.add_child(ivb)
	_inspector_title = UiTheme.label("Selected", 13, UiTheme.AMBER)
	ivb.add_child(_inspector_title)
	_inspector_sub = UiTheme.label("", 11, UiTheme.TEXT)
	ivb.add_child(_inspector_sub)
	_inspector_coords = UiTheme.label("", 10, UiTheme.TEXT_DIM)
	ivb.add_child(_inspector_coords)
	var irow := HBoxContainer.new()
	irow.add_theme_constant_override("separation", 4)
	ivb.add_child(irow)
	irow.add_child(_small_btn("Set Dest", func() -> void:
		if not _selected_place.is_empty():
			_dest_stop = {"role": "dest", "name": str(_selected_place["name"]), "pos": _selected_place["pos"]}
			_recompute_route()
	))
	irow.add_child(_small_btn("+ Wp", func() -> void:
		if not _selected_place.is_empty():
			_waypoints.append({"role": "waypoint", "name": str(_selected_place["name"]), "pos": _selected_place["pos"]})
			_recompute_route()
	))
	irow.add_child(_small_btn("Copy GPS", func() -> void:
		if not _selected_place.is_empty() and geo_index != null:
			var ll := geo_index.to_latlng(_selected_place["pos"] as Vector2)
			DisplayServer.clipboard_set("%.5f, %.5f" % [ll.x, ll.y])
	))
	irow.add_child(_small_btn("×", func() -> void:
		_selected_place = {}
		_inspector_panel.visible = false
		_view.queue_redraw()
	))


func _toggle_search() -> void:
	_search_panel.visible = not _search_panel.visible
	if _search_panel.visible:
		_route_panel.visible = false
		_on_search_changed(_search_edit.text)
		_search_edit.grab_focus()


func _toggle_route() -> void:
	_route_panel.visible = not _route_panel.visible
	if _route_panel.visible:
		_search_panel.visible = false
		_rebuild_stops_ui()


func _toggle_layers() -> void:
	_layers_panel.visible = not _layers_panel.visible


func _on_search_changed(q: String) -> void:
	if geo_index == null or not geo_index.loaded:
		return
	for ch in _search_list.get_children():
		ch.queue_free()
	var hits := geo_index.search(q, player, 12)
	for h: Dictionary in hits:
		var b := Button.new()
		b.alignment = HORIZONTAL_ALIGNMENT_LEFT
		b.add_theme_font_override("font", _font)
		b.add_theme_font_size_override("font_size", 11)
		b.text = "%s · %s (%s)" % [str(h["name"]), str(h["category"]), MapProjection.distance_text(float(h["distance"]))]
		b.pressed.connect(func() -> void:
			_search_panel.visible = false
			var pos: Vector2 = h["pos"]
			if h.has("road_name") and h.has("tile"):
				pos = geo_index.resolve_road_position(str(h["road_name"]), h["tile"] as Vector2i)
			var picked := h.duplicate()
			picked["pos"] = pos
			_select_place(picked)
			_pan = pos - player
			set_zoom(1)
		)
		_search_list.add_child(b)


func _on_map_tapped(screen_pos: Vector2) -> void:
	var c := _view.size * 0.5
	var world_pos := projection.world_at(screen_pos - c)
	var st := geo_index.identify_street(world_pos)
	var loc := geo_index.identify_locality(world_pos)
	var sname := str(st.get("name", ""))
	_select_place({
		"name": sname if sname != "" else str(loc.get("name", "Pinned Location")),
		"name_ta": str(loc.get("name_ta", "")),
		"category": "Street" if sname != "" else "Locality",
		"locality": str(loc.get("name", "Chennai")),
		"pos": world_pos,
		"distance": world_pos.distance_to(player),
	})


func _select_place(item: Dictionary) -> void:
	_selected_place = item
	var wp: Vector2 = item["pos"]
	var br := ChennaiGeoIndex.compass_bearing(player, wp)
	_inspector_title.text = str(item.get("name", "Location"))
	_inspector_sub.text = "%s · %s · %s %s" % [str(item.get("category", "Place")), str(item.get("locality", "Chennai")), MapProjection.distance_text(float(br["distance"])), str(br["cardinal"])]
	if geo_index != null:
		var ll := geo_index.to_latlng(wp)
		_inspector_coords.text = "%.5f°N, %.5f°E" % [ll.x, ll.y]
	_inspector_panel.visible = true
	_view.queue_redraw()


func _recompute_route() -> void:
	if geo_index == null or _dest_stop.is_empty():
		return
	var stops: Array[Dictionary] = [{"role": "start", "name": "Current Position", "pos": player}]
	for w: Dictionary in _waypoints:
		stops.append(w)
	stops.append(_dest_stop)
	_active_route = ChennaiRouter.compute_route(geo_index, stops, _route_mode)
	_rebuild_stops_ui()
	if bool(_active_route.get("ok", false)):
		var d_str := MapProjection.distance_text(float(_active_route["total_distance"]))
		var mins := maxi(1, roundi(float(_active_route["estimated_seconds"]) / 60.0))
		_route_summary.text = "%s · EST. %d min (%s)" % [d_str, mins, _route_mode.capitalize()]
		if street_service != null:
			street_service.set_destination(_dest_stop)
			street_service.set_route(_active_route)
		route_requested.emit(_active_route)
	else:
		_route_summary.text = str(_active_route.get("reason", "No route found."))
	_view.queue_redraw()


func _clear_route() -> void:
	_waypoints.clear()
	_dest_stop = {}
	_active_route = {}
	_route_summary.text = "Tap map or Search to set Destination."
	if street_service != null:
		street_service.clear_route()
	route_requested.emit({})
	_rebuild_stops_ui()
	_view.queue_redraw()


func _rebuild_stops_ui() -> void:
	for ch in _route_stops_box.get_children():
		ch.queue_free()
	_route_stops_box.add_child(UiTheme.label("A: Current Position", 11, Color("#46d17a")))
	for i in _waypoints.size():
		_route_stops_box.add_child(UiTheme.label("W%d: %s" % [i + 1, str(_waypoints[i]["name"])], 11, Color("#38bdf8")))
	var d_txt := "B: " + str(_dest_stop["name"]) if not _dest_stop.is_empty() else "B: (Select on map)"
	_route_stops_box.add_child(UiTheme.label(d_txt, 11, UiTheme.AMBER))


func _small_btn(text: String, on_press: Callable) -> Button:
	var b := Button.new()
	b.text = text
	b.custom_minimum_size = Vector2(46, 30)
	b.add_theme_font_size_override("font_size", 11)
	b.pressed.connect(on_press)
	return b


static func _glass_box() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color(0.05, 0.06, 0.09, 0.92)
	box.border_color = Color(1, 1, 1, 0.16)
	box.set_border_width_all(1)
	box.set_corner_radius_all(10)
	box.content_margin_left = 10
	box.content_margin_right = 10
	box.content_margin_top = 8
	box.content_margin_bottom = 8
	return box
