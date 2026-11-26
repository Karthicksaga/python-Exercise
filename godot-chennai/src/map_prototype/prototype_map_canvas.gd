class_name PrototypeMapCanvas
extends Control
## Interactive full-screen Chennai map canvas for the UI/UX Prototype.
## Renders real read-only OSM geometry (coastline, water, parks, beaches, roads, buildings,
## railway, localities, POIs) with collision-free labels, route preview, and touch/mouse gestures.

signal map_tapped(world_pos: Vector2)
signal view_changed

const MIN_VIEW_METRES := 280.0
const MAX_VIEW_METRES := 46000.0
const DEFAULT_VIEW_METRES := 2200.0

var data: PrototypeWorldData = null
var projection := MapProjection.new()
var label_placer := PrototypeLabelPlacer.new()

var view_centre := Vector2(40.0, 60.0)
var view_height_metres := DEFAULT_VIEW_METRES
var player_pos := Vector2(40.0, 60.0)
var player_heading := 0.0

## Stops: [{"role": "start"|"waypoint"|"dest", "name": String, "pos": Vector2}]
var stops: Array[Dictionary] = []
var selected_pin: Dictionary = {}  # {"name": String, "pos": Vector2, ...}
var bookmarks: Array[Dictionary] = []  # [{"name": String, "pos": Vector2, "category": String, ...}]
var measure_points: Array[Vector2] = []  # 0, 1, or 2 world points for straight-line ruler
var route_polyline := PackedVector2Array()

var layers: Dictionary[StringName, bool] = {
	&"normal": true,
	&"road_names": true,
	&"buildings": true,
	&"localities": true,
	&"landmarks": true,
	&"railway": true,
	&"metro": true,
	&"parks": true,
	&"water": true,
	&"missions": true,
	&"route": true,
}

var _font: Font
var _dragging := false
var _drag_moved := 0.0
var _press_pos := Vector2.ZERO
var _touches: Dictionary[int, Vector2] = {}
var _last_pinch_dist := 0.0


func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP
	_font = RailFonts.with_tamil()
	resized.connect(_update_projection)
	_update_projection()


func zoom_tier() -> String:
	if view_height_metres > 9000.0:
		return "City"
	if view_height_metres > 2600.0:
		return "Locality"
	if view_height_metres > 700.0:
		return "Street"
	return "Detailed"


func zoom_by(factor: float, anchor_screen: Vector2 = Vector2.INF) -> void:
	var prev_world := view_centre
	if anchor_screen != Vector2.INF and size.x > 1.0 and size.y > 1.0:
		prev_world = screen_to_world(anchor_screen)
	view_height_metres = clampf(view_height_metres * factor, MIN_VIEW_METRES, MAX_VIEW_METRES)
	_update_projection()
	if anchor_screen != Vector2.INF and size.x > 1.0 and size.y > 1.0:
		var after_world := screen_to_world(anchor_screen)
		view_centre += prev_world - after_world
	_clamp_view()
	_refresh_tiles()
	_update_projection()
	view_changed.emit()
	queue_redraw()


func focus_on(world_pos: Vector2, target_height: float = -1.0) -> void:
	view_centre = world_pos
	if target_height > 0.0:
		view_height_metres = clampf(target_height, MIN_VIEW_METRES, MAX_VIEW_METRES)
	_clamp_view()
	_refresh_tiles()
	_update_projection()
	view_changed.emit()
	queue_redraw()


func screen_to_world(screen_pos: Vector2) -> Vector2:
	projection.centre = view_centre
	projection.rotate_with_heading = false
	projection.pixels_per_metre = maxf(size.y, 1.0) / view_height_metres
	return projection.world_at(screen_pos - size * 0.5)


func world_to_screen(world_pos: Vector2) -> Vector2:
	projection.centre = view_centre
	projection.rotate_with_heading = false
	projection.pixels_per_metre = maxf(size.y, 1.0) / view_height_metres
	return size * 0.5 + projection.offset_of(world_pos)


func visible_world_rect() -> Rect2:
	var ppm := maxf(size.y, 1.0) / view_height_metres
	var half := (size * 0.5) / maxf(ppm, 1e-4)
	return Rect2(view_centre - half, half * 2.0)


func _update_projection() -> void:
	projection.rotate_with_heading = false
	projection.centre = view_centre
	projection.pixels_per_metre = maxf(size.y, 1.0) / view_height_metres


func _clamp_view() -> void:
	if data == null or data.source == null:
		return
	var b := data.source.get_bounds()
	view_centre.x = clampf(view_centre.x, b.position.x - 2000.0, b.end.x + 2000.0)
	view_centre.y = clampf(view_centre.y, b.position.y - 2000.0, b.end.y + 2000.0)


func _refresh_tiles() -> void:
	if data == null or not data.loaded:
		return
	# Cap lazy loading during wide city zooms so frame budget stays smooth.
	var r := visible_world_rect()
	if view_height_metres <= 18000.0:
		data.ensure_tiles_for_rect(r, true)


func _gui_input(event: InputEvent) -> void:
	if event is InputEventMouseButton:
		var b := event as InputEventMouseButton
		if b.button_index == MOUSE_BUTTON_LEFT:
			if b.pressed:
				if b.double_click:
					zoom_by(0.55, b.position)
					_dragging = false
				else:
					_dragging = true
					_drag_moved = 0.0
					_press_pos = b.position
			else:
				if _dragging and _drag_moved < 7.0:
					map_tapped.emit(screen_to_world(b.position))
				_dragging = false
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom_by(0.76, b.position)
		elif b.pressed and b.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom_by(1.32, b.position)
	elif event is InputEventMouseMotion and _dragging:
		var rel := (event as InputEventMouseMotion).relative
		_drag_moved += rel.length()
		view_centre -= rel / maxf(projection.pixels_per_metre, 1e-4)
		_clamp_view()
		_refresh_tiles()
		_update_projection()
		view_changed.emit()
		queue_redraw()
	elif event is InputEventMagnifyGesture:
		var mg := event as InputEventMagnifyGesture
		if mg.factor > 0.01:
			zoom_by(1.0 / mg.factor, mg.position)
	elif event is InputEventScreenTouch:
		var st := event as InputEventScreenTouch
		if st.pressed:
			_touches[st.index] = st.position
			if _touches.size() == 1:
				_drag_moved = 0.0
				_press_pos = st.position
		else:
			if _touches.size() == 1 and _drag_moved < 8.0 and st.position.distance_to(_press_pos) < 8.0:
				map_tapped.emit(screen_to_world(st.position))
			_touches.erase(st.index)
			_last_pinch_dist = 0.0
	elif event is InputEventScreenDrag:
		var sd := event as InputEventScreenDrag
		_touches[sd.index] = sd.position
		if _touches.size() >= 2:
			var keys := _touches.keys()
			var p0: Vector2 = _touches[keys[0]]
			var p1: Vector2 = _touches[keys[1]]
			var dist := p0.distance_to(p1)
			if _last_pinch_dist > 10.0 and dist > 10.0:
				zoom_by(_last_pinch_dist / dist, (p0 + p1) * 0.5)
			_last_pinch_dist = dist
		else:
			_drag_moved += sd.relative.length()
			view_centre -= sd.relative / maxf(projection.pixels_per_metre, 1e-4)
			_clamp_view()
			_refresh_tiles()
			_update_projection()
			view_changed.emit()
			queue_redraw()


func _draw() -> void:
	if size.x <= 1.0 or size.y <= 1.0:
		return
	_update_projection()
	var c := size * 0.5
	var ppm := projection.pixels_per_metre
	var vrect := visible_world_rect()

	# 1. Dark theme land base
	draw_rect(Rect2(Vector2.ZERO, size), Color(0.055, 0.068, 0.095, 1.0))

	if data == null or not data.loaded or data.source == null:
		draw_string(_font, c - Vector2(90.0, 0.0), "Loading Chennai OSM map...", HORIZONTAL_ALIGNMENT_LEFT, -1, 15, Color(1, 1, 1, 0.7))
		return

	# World-space transform for polygons, lines, buildings, and roads
	draw_set_transform(c - projection.centre * ppm, 0.0, Vector2(ppm, ppm))

	# 2. Sea / Coastline (Bay of Bengal)
	if layers.get(&"normal", true) and data.source.sea != null:
		var sea := data.source.sea
		_draw_sea(sea, ppm)

	# 3. Parks, Water bodies, Beaches from `areas.bin` & `infra.bin`
	_draw_areas(vrect, ppm)
	if layers.get(&"water", true):
		_draw_waterways(vrect, ppm)

	# 4. Building footprints at Detailed zoom
	if layers.get(&"buildings", true) and view_height_metres <= 720.0:
		var buildings := data.get_buildings_in_rect(vrect, 16)
		for bpoly: PackedVector2Array in buildings:
			_safe_fill_polygon(bpoly, Color(0.12, 0.15, 0.21, 0.9))
			draw_polyline(bpoly, Color(0.24, 0.29, 0.39, 0.65), 0.7 / ppm)

	# 5. Roads by classification
	var visible_roads: Array[Road] = []
	if layers.get(&"normal", true):
		visible_roads = _draw_roads(vrect, ppm)

	# 6. Railway tracks
	if layers.get(&"railway", true):
		for idx in data.rail_tracks.size():
			var tr := data.rail_tracks[idx]
			var sys := data.rail_track_systems[idx]
			var rcol := Color(0.32, 0.78, 0.92, 0.72) if sys == "mrts" else Color(0.95, 0.62, 0.22, 0.72)
			draw_polyline(tr, rcol, 2.0 / ppm)

	# 7. Active / Preview Route Polyline
	if layers.get(&"route", true) and route_polyline.size() >= 2:
		draw_polyline(route_polyline, Color(0.03, 0.08, 0.15, 0.9), 7.5 / ppm)
		draw_polyline(route_polyline, Color("#38bdf8"), 4.2 / ppm)
		_draw_route_chevrons(ppm)

	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)

	# 8. Screen-space collision-free labels & markers
	label_placer.begin(size, _font, 68.0, 56.0)
	_draw_stops_and_pins(c)
	_draw_player_marker(c)
	_draw_landmarks_and_pois(vrect, c)
	if layers.get(&"localities", true):
		_draw_localities(vrect, c)
	if layers.get(&"road_names", true) and not visible_roads.is_empty():
		_draw_road_labels(visible_roads, vrect, c)
	if layers.get(&"missions", true):
		_draw_sample_missions(c)

	# 9. Map Chrome: Scale Bar, North Arrow, Zoom Tier, Attribution
	_draw_chrome(ppm)


func _draw_areas(vrect: Rect2, ppm: float) -> void:
	var show_parks: bool = bool(layers.get(&"parks", true))
	var show_water: bool = bool(layers.get(&"water", true))
	var show_normal: bool = bool(layers.get(&"normal", true))
	if not show_parks and not show_water and not show_normal:
		return
	var t0 := data.source.tile_at(vrect.position)
	var t1 := data.source.tile_at(vrect.end)
	for tx in range(t0.x, t1.x + 1):
		for tz in range(t0.y, t1.y + 1):
			var areas := data.get_tile_areas(Vector2i(tx, tz))
			for a: Dictionary in areas:
				var box: Rect2 = a["box"]
				if not box.intersects(vrect):
					continue
				if box.size.length() * ppm < 3.5:
					continue
				var kind: StringName = a["kind"]
				var outline: PackedVector2Array = a["outline"]
				var col := Color.TRANSPARENT
				match kind:
					&"park", &"forest", &"meadow", &"orchard":
						if show_parks:
							col = Color(0.08, 0.21, 0.14, 0.85)
					&"water", &"reservoir", &"wetland", &"mangrove":
						if show_water:
							col = Color(0.05, 0.17, 0.28, 0.9)
					&"beach":
						if show_normal:
							col = Color(0.20, 0.18, 0.12, 0.85)
					&"aerodrome", &"apron":
						if show_normal:
							col = Color(0.11, 0.12, 0.16, 0.75)
				if col.a > 0.0:
					_safe_fill_polygon(outline, col)


func _safe_fill_polygon(poly: PackedVector2Array, col: Color) -> void:
	if poly.size() < 3:
		return
	if Geometry2D.triangulate_polygon(poly).is_empty():
		return
	draw_colored_polygon(poly, col)


func _draw_sea(sea: WorldSea, ppm: float) -> void:
	var sea_col := Color(0.04, 0.11, 0.19, 1.0)
	if sea.outline.size() >= 3 and not Geometry2D.triangulate_polygon(sea.outline).is_empty():
		draw_colored_polygon(sea.outline, sea_col)
	elif sea.coast.size() >= 2:
		var east_x := 26000.0
		for i in range(sea.coast.size() - 1):
			var a := sea.coast[i]
			var b := sea.coast[i + 1]
			if absf(a.y - b.y) < 0.05:
				continue
			draw_colored_polygon(PackedVector2Array([a, Vector2(east_x, a.y), Vector2(east_x, b.y), b]), sea_col)
	if sea.coast.size() >= 2:
		draw_polyline(sea.coast, Color(0.18, 0.42, 0.62, 0.8), maxf(1.5 / ppm, 1.5))


func _draw_waterways(vrect: Rect2, ppm: float) -> void:
	var t0 := data.source.tile_at(vrect.position)
	var t1 := data.source.tile_at(vrect.end)
	for tx in range(t0.x, t1.x + 1):
		for tz in range(t0.y, t1.y + 1):
			var infra := data.source.tile_infra(Vector2i(tx, tz))
			if infra == null or not infra.ok():
				continue
			for w: WorldWaterway in infra.waterways:
				if w.tunnel or w.points.size() < 2:
					continue
				var width_px := maxf(1.5, w.width * ppm)
				draw_polyline(w.points, Color(0.06, 0.22, 0.36, 0.9), width_px / ppm)


func _draw_roads(vrect: Rect2, ppm: float) -> Array[Road]:
	var drawn: Array[Road] = []
	var t0 := data.source.tile_at(vrect.position)
	var t1 := data.source.tile_at(vrect.end)
	var minor_lines := PackedVector2Array()
	var tertiary_lines := PackedVector2Array()
	var secondary_lines := PackedVector2Array()
	var primary_lines := PackedVector2Array()
	var motorway_lines := PackedVector2Array()

	var show_minor := view_height_metres <= 4200.0
	var show_tertiary := view_height_metres <= 12000.0

	for tx in range(t0.x, t1.x + 1):
		for tz in range(t0.y, t1.y + 1):
			var tile := Vector2i(tx, tz)
			var net := data.source.tile_roads(tile)
			if net == null:
				continue
			for road: Road in net.roads:
				if road.kind == &"footway" or road.points.size() < 2:
					continue
				if not _road_in_rect(road.points, vrect):
					continue
				var is_minor := road.kind == &"residential" or road.kind == &"service" or road.kind == &"track"
				if is_minor and not show_minor:
					continue
				if road.kind == &"tertiary" and not show_tertiary:
					continue
				drawn.append(road)
				var pts := road.points
				var target := minor_lines
				match road.kind:
					&"motorway":
						target = motorway_lines
					&"primary":
						target = primary_lines
					&"secondary":
						target = secondary_lines
					&"tertiary":
						target = tertiary_lines
					_:
						target = minor_lines
				for i in range(pts.size() - 1):
					target.append(pts[i])
					target.append(pts[i + 1])

	if not minor_lines.is_empty():
		draw_multiline(minor_lines, Color(1.0, 1.0, 1.0, 0.18 if view_height_metres > 1400.0 else 0.26), 1.0 / ppm)
	if not tertiary_lines.is_empty():
		draw_multiline(tertiary_lines, Color(0.84, 0.87, 0.93, 0.42), (1.7 if view_height_metres <= 2600.0 else 1.1) / ppm)
	if not secondary_lines.is_empty():
		draw_multiline(secondary_lines, Color(0.98, 0.92, 0.74, 0.65), (2.4 if view_height_metres <= 4000.0 else 1.5) / ppm)
	if not primary_lines.is_empty():
		draw_multiline(primary_lines, Color(1.0, 0.82, 0.45, 0.85), (3.1 if view_height_metres <= 4000.0 else 2.0) / ppm)
	if not motorway_lines.is_empty():
		draw_multiline(motorway_lines, Color(1.0, 0.62, 0.22, 0.95), (3.8 if view_height_metres <= 6000.0 else 2.4) / ppm)
	return drawn


static func _road_in_rect(pts: PackedVector2Array, r: Rect2) -> bool:
	var lo := pts[0]
	var hi := pts[0]
	for p: Vector2 in pts:
		lo = lo.min(p)
		hi = hi.max(p)
	return Rect2(lo, hi - lo).intersects(r)


func _draw_route_chevrons(ppm: float) -> void:
	var step_m := maxf(60.0, view_height_metres * 0.08)
	var acc := 0.0
	for i in range(route_polyline.size() - 1):
		var a := route_polyline[i]
		var b := route_polyline[i + 1]
		var d := a.distance_to(b)
		if d < 1.0:
			continue
		acc += d
		if acc >= step_m:
			acc = 0.0
			var mid := (a + b) * 0.5
			var dir := (b - a) / d
			var side := Vector2(-dir.y, dir.x)
			var sz := 4.5 / ppm
			draw_polyline(PackedVector2Array([mid - dir * sz + side * sz, mid + dir * sz, mid - dir * sz - side * sz]), Color(1, 1, 1, 0.95), 1.6 / ppm)


func _draw_stops_and_pins(c: Vector2) -> void:
	for i in stops.size():
		var s := stops[i]
		var wp: Vector2 = s["pos"]
		var at := c + projection.offset_of(wp)
		if not Rect2(Vector2(-30, -30), size + Vector2(60, 60)).has_point(at):
			continue
		var role := str(s.get("role", "waypoint"))
		var col := Color("#38bdf8")
		var badge := "W%d" % i
		if role == "start":
			col = Color("#46d17a")
			badge = "A"
		elif role == "dest":
			col = Color("#ffb703")
			badge = "B"
		draw_circle(at, 11.0, Color(0.04, 0.05, 0.08, 0.95))
		draw_circle(at, 8.5, col)
		var bsz := _font.get_string_size(badge, HORIZONTAL_ALIGNMENT_LEFT, -1, 11)
		draw_string(_font, at + Vector2(-bsz.x * 0.5, 4.0), badge, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color.BLACK)
		label_placer.draw_poi_label(self, at + Vector2(3.0, 0.0), str(s.get("name", "")), 13, col)

	if not selected_pin.is_empty():
		var sp: Vector2 = selected_pin["pos"]
		var at := c + projection.offset_of(sp)
		draw_arc(at, 12.0, 0.0, TAU, 24, Color("#ff6b5a"), 2.5)
		draw_circle(at, 5.0, Color("#ff6b5a"))
		label_placer.draw_poi_label(self, at + Vector2(4.0, 0.0), str(selected_pin.get("name", "Pinned Location")), 13, Color("#ff9e92"))

	# Saved bookmark pins
	if bool(layers.get(&"landmarks", true)):
		for bm: Dictionary in bookmarks:
			var bp: Vector2 = bm["pos"]
			var bat := c + projection.offset_of(bp)
			if not Rect2(Vector2(-24, -24), size + Vector2(48, 48)).has_point(bat):
				continue
			draw_circle(bat, 7.5, Color(0.05, 0.06, 0.09, 0.92))
			draw_arc(bat, 7.5, 0.0, TAU, 16, Color("#ffd166"), 1.6)
			draw_string(_font, bat + Vector2(-5.0, 4.0), "★", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color("#ffd166"))

	# 2-point Distance & Compass Bearing Ruler
	if not measure_points.is_empty():
		var p0 := c + projection.offset_of(measure_points[0])
		draw_circle(p0, 6.0, Color("#38bdf8"))
		draw_arc(p0, 9.0, 0.0, TAU, 16, Color.WHITE, 1.5)
		if measure_points.size() >= 2:
			var p1 := c + projection.offset_of(measure_points[1])
			draw_dashed_line(p0, p1, Color("#38bdf8"), 2.2, 8.0)
			draw_circle(p1, 6.0, Color("#ffb703"))
			draw_arc(p1, 9.0, 0.0, TAU, 16, Color.WHITE, 1.5)
			var br := PrototypeWorldData.compass_bearing(measure_points[0], measure_points[1])
			var txt := "%s · %s %d°" % [MapProjection.distance_text(float(br["distance"])), str(br["cardinal"]), int(br["deg"])]
			var mid := (p0 + p1) * 0.5
			var sz := _font.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12)
			var box := Rect2(mid - Vector2(sz.x * 0.5 + 8.0, 12.0), Vector2(sz.x + 16.0, 22.0))
			draw_rect(box, Color(0.04, 0.06, 0.1, 0.92), true)
			draw_rect(box, Color("#38bdf8"), false, 1.2)
			draw_string(_font, mid + Vector2(-sz.x * 0.5, 4.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color("#e6edf3"))


func _draw_player_marker(c: Vector2) -> void:
	var pp := c + projection.offset_of(player_pos)
	draw_circle(pp, 15.0, Color(0.22, 0.74, 0.97, 0.22))
	var fwd := Vector2(-sin(player_heading), -cos(player_heading))
	var side := Vector2(-fwd.y, fwd.x)
	var pts := PackedVector2Array([pp + fwd * 11.0, pp - fwd * 8.0 + side * 7.0, pp - fwd * 3.0, pp - fwd * 8.0 - side * 7.0])
	draw_colored_polygon(pts, Color.WHITE)
	draw_polyline(PackedVector2Array([pts[0], pts[1], pts[2], pts[3], pts[0]]), Color(0.05, 0.06, 0.09, 0.95), 1.5)


func _draw_landmarks_and_pois(vrect: Rect2, c: Vector2) -> void:
	var show_landmarks: bool = bool(layers.get(&"landmarks", true))
	var show_rail: bool = bool(layers.get(&"railway", true))

	if show_landmarks:
		for lm: Landmark in data.source.get_landmarks():
			if not vrect.grow(1000.0).has_point(lm.position):
				continue
			var at := c + projection.offset_of(lm.position)
			MapGlyphs.draw(self, MarkerKind.PLACE, at, 6.5, Color("#ffd166"))
			label_placer.draw_poi_label(self, at, lm.name, 13, Color("#ffe8a3"))

	if show_rail and view_height_metres <= 18000.0:
		for st: Dictionary in data.rail_stations:
			var sp: Vector2 = st["pos"]
			if not vrect.has_point(sp):
				continue
			var at := c + projection.offset_of(sp)
			draw_rect(Rect2(at - Vector2(4.5, 4.5), Vector2(9.0, 9.0)), Color("#38bdf8"))
			draw_rect(Rect2(at - Vector2(4.5, 4.5), Vector2(9.0, 9.0)), Color(0.04, 0.06, 0.1), false, 1.5)
			if view_height_metres <= 9000.0:
				var st_name := str(st["name"])
				label_placer.draw_poi_label(self, at, st_name, 12, Color("#93e2ff"))

	if show_landmarks and view_height_metres <= 2600.0:
		var drawn_pois := 0
		for p: Dictionary in data.all_pois:
			var pp: Vector2 = p["pos"]
			if not vrect.has_point(pp):
				continue
			var kind := str(p["kind"])
			var important := kind in ["hospital", "place_of_worship", "school", "college", "mall", "fuel", "park", "bus_station", "police", "cinema"]
			if view_height_metres > 950.0 and not important:
				continue
			var at := c + projection.offset_of(pp)
			var col := _poi_colour(kind)
			draw_circle(at, 3.5, col)
			if label_placer.draw_poi_label(self, at - Vector2(3.0, 0.0), str(p["name"]), 11, Color(col, 0.92)):
				drawn_pois += 1
				if drawn_pois >= 45:
					break


static func _poi_colour(kind: String) -> Color:
	match kind:
		"hospital", "clinic", "pharmacy":
			return Color("#ff7b72")
		"place_of_worship":
			return Color("#f2b749")
		"fuel":
			return Color("#ffa657")
		"school", "college", "university":
			return Color("#a5d6ff")
		"restaurant", "cafe", "fast_food":
			return Color("#7ee787")
		_:
			return Color("#b6c2d9")


func _draw_localities(vrect: Rect2, c: Vector2) -> void:
	# Priority 1: Named areas with Tamil names from areas.json
	for a: Dictionary in data.areas_meta:
		var ap: Vector2 = a["pos"]
		if not vrect.grow(1200.0).has_point(ap):
			continue
		var at := c + projection.offset_of(ap)
		var fsize := 15 if view_height_metres > 6000.0 else 13
		var ta := str(a["name_ta"]) if view_height_metres <= 14000.0 else ""
		label_placer.draw_locality_label(self, at, str(a["name"]), ta, fsize, Color(0.95, 0.87, 0.62, 0.92))

	# Priority 2: Greater Chennai suburbs / neighbourhoods from tile.json
	if view_height_metres <= 18000.0:
		var drawn := 0
		for d: Dictionary in data.all_districts:
			var kind := str(d["kind"])
			if view_height_metres > 7000.0 and kind != "suburb" and kind != "town" and kind != "city":
				continue
			var dp: Vector2 = d["pos"]
			if not vrect.has_point(dp):
				continue
			var at := c + projection.offset_of(dp)
			if label_placer.draw_locality_label(self, at, str(d["name"]), str(d["name_ta"]), 12, Color(0.76, 0.83, 0.93, 0.84)):
				drawn += 1
				if drawn >= 28:
					break


func _draw_road_labels(roads: Array[Road], vrect: Rect2, c: Vector2) -> void:
	if view_height_metres > 11000.0:
		return
	var seen_names: Dictionary[String, bool] = {}
	# Sort priority: motorway/primary first, then secondary/tertiary, then residential.
	var tiers: Array[Array] = [[], [], []]
	for r: Road in roads:
		if r.name == "" or r.points.size() < 2:
			continue
		if r.kind == &"motorway" or r.kind == &"primary":
			tiers[0].append(r)
		elif r.kind == &"secondary" or r.kind == &"tertiary":
			tiers[1].append(r)
		elif view_height_metres <= 2400.0:
			tiers[2].append(r)

	var placed := 0
	for tier_idx in tiers.size():
		for r_var: Variant in tiers[tier_idx]:
			var r := r_var as Road
			if seen_names.has(r.name):
				continue
			var anchor := _pick_visible_midpoint(r.points, vrect)
			if anchor.is_empty():
				continue
			var wp: Vector2 = anchor["pos"]
			var dir: Vector2 = anchor["dir"]
			var screen_pt := c + projection.offset_of(wp)
			var angle := dir.angle()
			var col := Color("#ffd98a") if tier_idx == 0 else (Color("#dce6f5") if tier_idx == 1 else Color("#b6c2d4"))
			var fsize := 12 if tier_idx == 0 else 11
			if label_placer.draw_street_label(self, screen_pt, angle, r.name, fsize, col):
				seen_names[r.name] = true
				placed += 1
				if placed >= 34:
					return


static func _pick_visible_midpoint(pts: PackedVector2Array, vrect: Rect2) -> Dictionary:
	if pts.size() < 2:
		return {}
	var mid_idx := clampi(pts.size() / 2 - 1, 0, pts.size() - 2)
	var a := pts[mid_idx]
	var b := pts[mid_idx + 1]
	var m := (a + b) * 0.5
	if vrect.has_point(m) and a.distance_to(b) > 8.0:
		return {"pos": m, "dir": (b - a).normalized()}
	for i in range(pts.size() - 1):
		a = pts[i]
		b = pts[i + 1]
		m = (a + b) * 0.5
		if vrect.has_point(m) and a.distance_to(b) > 8.0:
			return {"pos": m, "dir": (b - a).normalized()}
	return {}


func _draw_sample_missions(c: Vector2) -> void:
	for sm: Dictionary in data.sample_missions:
		var mp := Vector2(float(sm["x"]), float(sm["z"]))
		var at := c + projection.offset_of(mp)
		if not Rect2(Vector2(-20, -20), size + Vector2(40, 40)).has_point(at):
			continue
		var kind: StringName = sm["kind"]
		var col := MarkerKind.colour_of(kind)
		MapGlyphs.draw(self, kind, at, 7.5, col)
		label_placer.draw_poi_label(self, at, str(sm["label"]), 11, col)


func _draw_chrome(ppm: float) -> void:
	# Scale bar (bottom-left)
	var length := 100.0
	for candidate: float in [50.0, 100.0, 200.0, 500.0, 1000.0, 2000.0, 5000.0, 10000.0]:
		length = candidate
		if candidate * ppm >= 68.0:
			break
	var px := length * ppm
	var from := Vector2(18.0, size.y - 34.0)
	draw_line(from, from + Vector2(px, 0), Color(1, 1, 1, 0.88), 2.0)
	draw_line(from, from + Vector2(0, -6), Color(1, 1, 1, 0.88), 2.0)
	draw_line(from + Vector2(px, 0), from + Vector2(px, -6), Color(1, 1, 1, 0.88), 2.0)
	var stext := "%d m" % int(length) if length < 1000.0 else "%d km" % int(length / 1000.0)
	draw_string_outline(_font, from + Vector2(0, -10), stext, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, 3, Color(0, 0, 0, 0.9))
	draw_string(_font, from + Vector2(0, -10), stext, HORIZONTAL_ALIGNMENT_LEFT, -1, 12, Color(1, 1, 1, 0.9))

	# Zoom tier badge + Attribution
	var tier := "%s Zoom · © OpenStreetMap contributors (2026-11-23), ODbL 1.0" % zoom_tier()
	draw_string_outline(_font, Vector2(18.0, size.y - 12.0), tier, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, 3, Color(0, 0, 0, 0.9))
	draw_string(_font, Vector2(18.0, size.y - 12.0), tier, HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(0.85, 0.88, 0.94, 0.72))

	# North indicator (top-right below toolbar)
	var np := Vector2(size.x - 28.0, 88.0)
	draw_circle(np, 16.0, Color(0.05, 0.06, 0.09, 0.72))
	draw_arc(np, 16.0, 0.0, TAU, 24, Color(1, 1, 1, 0.25), 1.0)
	draw_colored_polygon(PackedVector2Array([np + Vector2(0, -11), np + Vector2(4, 2), np + Vector2(0, -1), np + Vector2(-4, 2)]), Color("#ffb703"))
	draw_string(_font, np + Vector2(-4, 12), "N", HORIZONTAL_ALIGNMENT_LEFT, -1, 11, Color(1, 1, 1, 0.9))
