class_name MapRail
extends RefCounted
## The railway as the maps draw it (G-465): each kind of line (suburban, MRTS, express, Metro Blue,
## Metro Green) one colour, as pairs of points (segment 2i to 2i+1, world metres) for one
## `draw_multiline` per kind, with the stretches in a tunnel apart (drawn fainter), and the
## stations as dots with their names. Built once by the composition root from the rail network
## (`MapRailFeed`, on a worker thread); the minimap takes the part round the player (`nearby`).
## The map only draws: no rail module types in here.


## One kind of line: how it is drawn and what the legend calls it.
class Kind:
	extends RefCounted
	var key: StringName = &""
	var label: String = ""
	var colour: Color = Color.WHITE
	## Segments above the ground (pairs of points) and in a tunnel (pairs).
	var lines := PackedVector2Array()
	var under := PackedVector2Array()


var kinds: Array[Kind] = []
var station_points := PackedVector2Array()
var station_names := PackedStringArray()
## The station's dot colour (its kind's; the first kind that calls there).
var station_colours := PackedColorArray()
## Where this set was gathered (Vector2.INF: the whole network) and how far round it.
var centre := Vector2.INF
var radius := 0.0
## Segments by INDEX_CELL cell, for `nearby` (built by `index()`): codes (kind * 2 + tunnel) << 24 | pair.
const INDEX_CELL := 1000.0
var _cells: Dictionary[Vector2i, PackedInt32Array] = {}


## Builds the cell index (once, after the kinds are filled; worker thread).
func index() -> void:
	_cells.clear()
	for ki in kinds.size():
		for tunnel in 2:
			var pairs := kinds[ki].under if tunnel == 1 else kinds[ki].lines
			var j := 0
			while j + 1 < pairs.size():
				var code := ((ki * 2 + tunnel) << 24) | (j / 2)
				var a := _cell((pairs[j] + pairs[j + 1]) / 2.0)
				if not _cells.has(a):
					_cells[a] = PackedInt32Array()
				_cells[a].append(code)
				j += 2


static func _cell(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / INDEX_CELL), floori(p.y / INDEX_CELL))


func is_empty() -> bool:
	for k in kinds:
		if not k.lines.is_empty() or not k.under.is_empty():
			return false
	return station_points.is_empty()


func kind(key: StringName) -> Kind:
	for k in kinds:
		if k.key == key:
			return k
	return null


## Adds a kind (or returns the one with this key).
func add_kind(key: StringName, label: String, colour: Color) -> Kind:
	var k := kind(key)
	if k != null:
		return k
	k = Kind.new()
	k.key = key
	k.label = label
	k.colour = colour
	kinds.append(k)
	return k


func segment_count() -> int:
	var n := 0
	for k in kinds:
		n += (k.lines.size() + k.under.size()) / 2
	return n


## Does this set still cover a view of `view_radius` metres round `at`?
func covers(at: Vector2, view_radius: float) -> bool:
	return centre != Vector2.INF and at.distance_to(centre) + view_radius <= radius


## The segments and stations within `r` metres of `at` (a segment counts when either end or its
## middle is within r: segments are at most a few hundred metres), for the minimap.
func nearby(at: Vector2, r: float) -> MapRail:
	var out := MapRail.new()
	out.centre = at
	out.radius = r
	var r2 := r * r
	for k in kinds:
		out.add_kind(k.key, k.label, k.colour)
	if _cells.is_empty():
		for ki in kinds.size():
			out.kinds[ki].lines = _within(kinds[ki].lines, at, r2)
			out.kinds[ki].under = _within(kinds[ki].under, at, r2)
	else:
		# Segments are at most a few hundred metres: the cells round the circle plus one hold them all.
		var c0 := _cell(at - Vector2(r, r)) - Vector2i.ONE
		var c1 := _cell(at + Vector2(r, r)) + Vector2i.ONE
		var lines_out: Array[PackedVector2Array] = []
		var under_out: Array[PackedVector2Array] = []
		for ki in kinds.size():
			lines_out.append(PackedVector2Array())
			under_out.append(PackedVector2Array())
		for cx in range(c0.x, c1.x + 1):
			for cz in range(c0.y, c1.y + 1):
				var in_cell: PackedInt32Array = _cells.get(Vector2i(cx, cz), PackedInt32Array())
				for code in in_cell:
					var ki := (code >> 24) / 2
					var tunnel := (code >> 24) % 2
					var j := (code & 0xFFFFFF) * 2
					var pairs := kinds[ki].under if tunnel == 1 else kinds[ki].lines
					var a := pairs[j]
					var b := pairs[j + 1]
					if a.distance_squared_to(at) <= r2 or b.distance_squared_to(at) <= r2 or ((a + b) / 2.0).distance_squared_to(at) <= r2:
						if tunnel == 1:
							under_out[ki].append(a)
							under_out[ki].append(b)
						else:
							lines_out[ki].append(a)
							lines_out[ki].append(b)
		for ki in kinds.size():
			out.kinds[ki].lines = lines_out[ki]
			out.kinds[ki].under = under_out[ki]
	for i in station_points.size():
		if station_points[i].distance_squared_to(at) <= r2:
			out.station_points.append(station_points[i])
			out.station_names.append(station_names[i])
			out.station_colours.append(station_colours[i])
	return out


static func _within(pairs: PackedVector2Array, at: Vector2, r2: float) -> PackedVector2Array:
	var out := PackedVector2Array()
	var i := 0
	while i + 1 < pairs.size():
		var a := pairs[i]
		var b := pairs[i + 1]
		if a.distance_squared_to(at) <= r2 or b.distance_squared_to(at) <= r2 or ((a + b) / 2.0).distance_squared_to(at) <= r2:
			out.append(a)
			out.append(b)
		i += 2
	return out


## Draws the lines (and with `cheap`, one colour and no tunnels: the Low preset) on a canvas whose
## transform is already world metres; `ppm` pixels per metre, `width` the line width in pixels.
func draw_lines(c: CanvasItem, ppm: float, width: float, cheap: bool) -> void:
	if cheap:
		var all := PackedVector2Array()
		for k in kinds:
			all.append_array(k.lines)
		if not all.is_empty():
			c.draw_multiline(all, Color(0.85, 0.85, 0.9, 0.7), width / ppm)
		return
	for k in kinds:
		if not k.under.is_empty():
			c.draw_multiline(k.under, Color(k.colour, 0.38), width * 0.7 / ppm)
		if not k.lines.is_empty():
			c.draw_multiline(k.lines, k.colour, width / ppm)


## The station dots (world metres under the canvas transform): `dot` pixels across.
func draw_stations(c: CanvasItem, ppm: float, dot: float, cheap: bool) -> void:
	for i in station_points.size():
		var p := station_points[i]
		if not cheap:
			c.draw_circle(p, (dot / 2.0 + 1.2) / ppm, Color(0.05, 0.06, 0.09, 0.9))
		c.draw_circle(p, dot / 2.0 / ppm, Color.WHITE if cheap else station_colours[i].lerp(Color.WHITE, 0.45))
