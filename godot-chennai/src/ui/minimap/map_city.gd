class_name MapCity
extends RefCounted
## The whole loaded city for the full map (G-466): every main road of every tile, filed by
## ROAD_CELL cell so a view draws only the cells it shows, the world's edge (its land drawn a shade
## lighter than the blank around it), and the labels: area names, main road names, hospitals,
## police, bus stands and bus stops, each shown from a zoom on (`from_zoom`), and written in
## priority order without overlapping (decluttered on screen, `place`). Built once by the
## composition root on a worker thread (`MapCityFeed`); the map only draws. No world types here.

const ROAD_CELL := 2000.0
const LABEL_CELL := 1000.0

## Label kinds, in the order they are written (earlier wins a place on screen).
enum Kind { SUBURB, STATION, ROAD_MAJOR, NEIGHBOURHOOD, BUS_STAND, HOSPITAL, POLICE, ROAD, BUS_STOP }

## Largest half-view (metres from the centre to the top) at which each kind is written.
const FROM_ZOOM := {
	Kind.SUBURB: 26000.0,
	Kind.STATION: 2600.0,
	Kind.ROAD_MAJOR: 5200.0,
	Kind.NEIGHBOURHOOD: 2600.0,
	Kind.BUS_STAND: 1100.0,
	Kind.HOSPITAL: 1100.0,
	Kind.POLICE: 1100.0,
	Kind.ROAD: 1100.0,
	Kind.BUS_STOP: 450.0,
}
const FONT_SIZE := {
	Kind.SUBURB: 15, Kind.STATION: 12, Kind.ROAD_MAJOR: 11, Kind.NEIGHBOURHOOD: 12, Kind.BUS_STAND: 11,
	Kind.HOSPITAL: 11, Kind.POLICE: 11, Kind.ROAD: 10, Kind.BUS_STOP: 10,
}
const COLOUR := {
	Kind.SUBURB: Color(0.96, 0.9, 0.78, 0.95),
	Kind.STATION: Color(1, 1, 1, 0.95),
	Kind.ROAD_MAJOR: Color(1.0, 0.93, 0.7, 0.9),
	Kind.NEIGHBOURHOOD: Color(0.86, 0.82, 0.74, 0.85),
	Kind.BUS_STAND: Color(0.6, 0.85, 1.0, 0.9),
	Kind.HOSPITAL: Color(1.0, 0.55, 0.55, 0.95),
	Kind.POLICE: Color(0.62, 0.72, 1.0, 0.95),
	Kind.ROAD: Color(0.95, 0.9, 0.75, 0.75),
	Kind.BUS_STOP: Color(0.6, 0.85, 1.0, 0.8),
}
## Kinds with a glyph before the words (a cross, a shield, a dot).
const GLYPH := [Kind.HOSPITAL, Kind.POLICE, Kind.BUS_STAND, Kind.BUS_STOP]


## Main roads per ROAD_CELL cell (pairs of points, world metres).
var road_cells: Dictionary[Vector2i, PackedVector2Array] = {}
## The world's boundary (a closed ring) and its triangles (indices into it), for the land fill.
var boundary := PackedVector2Array()
var land_triangles := PackedInt32Array()
## Labels: position, words, kind, angle (radians; roads run along their line).
var label_points := PackedVector2Array()
var label_names := PackedStringArray()
var label_kinds := PackedInt32Array()
var label_angles := PackedFloat32Array()
var _label_cells: Dictionary[Vector2i, PackedInt32Array] = {}


func add_road(a: Vector2, b: Vector2) -> void:
	var c := Vector2i(floori((a.x + b.x) / 2.0 / ROAD_CELL), floori((a.y + b.y) / 2.0 / ROAD_CELL))
	if not road_cells.has(c):
		road_cells[c] = PackedVector2Array()
	road_cells[c].append(a)
	road_cells[c].append(b)


func add_label(at: Vector2, words: String, kind: int, angle: float = 0.0) -> void:
	var i := label_points.size()
	label_points.append(at)
	label_names.append(words)
	label_kinds.append(kind)
	label_angles.append(angle)
	var c := Vector2i(floori(at.x / LABEL_CELL), floori(at.y / LABEL_CELL))
	if not _label_cells.has(c):
		_label_cells[c] = PackedInt32Array()
	_label_cells[c].append(i)


func label_count() -> int:
	return label_points.size()


func road_segment_count() -> int:
	var n := 0
	for c: Vector2i in road_cells.keys():
		n += road_cells[c].size() / 2
	return n


## The road cells overlapping a world rectangle.
func roads_in(view: Rect2) -> Array[PackedVector2Array]:
	var out: Array[PackedVector2Array] = []
	var c0 := Vector2i(floori(view.position.x / ROAD_CELL) - 1, floori(view.position.y / ROAD_CELL) - 1)
	var c1 := Vector2i(floori(view.end.x / ROAD_CELL) + 1, floori(view.end.y / ROAD_CELL) + 1)
	for cx in range(c0.x, c1.x + 1):
		for cz in range(c0.y, c1.y + 1):
			var cell := Vector2i(cx, cz)
			if road_cells.has(cell):
				out.append(road_cells[cell])
	return out


## Indices of the labels inside a world rectangle that are written at half-view `half` metres.
func labels_in(view: Rect2, half: float) -> PackedInt32Array:
	var out := PackedInt32Array()
	var c0 := Vector2i(floori(view.position.x / LABEL_CELL), floori(view.position.y / LABEL_CELL))
	var c1 := Vector2i(floori(view.end.x / LABEL_CELL), floori(view.end.y / LABEL_CELL))
	for cx in range(c0.x, c1.x + 1):
		for cz in range(c0.y, c1.y + 1):
			var in_cell: PackedInt32Array = _label_cells.get(Vector2i(cx, cz), PackedInt32Array())
			for i in in_cell:
				if half <= float(FROM_ZOOM[label_kinds[i]]) and view.has_point(label_points[i]):
					out.append(i)
	return out


## Decluttering: the labels to write, in priority order (kind, then the order they came in), each
## with its screen box, none overlapping another or any of `blocked` (the map's own buttons and
## panels). `to_screen` turns a world point into a screen point; `font` measures the words.
## Returns [index, screen point, box] triples. At most `cap` labels.
static func place(candidates: Array[Dictionary], blocked: Array[Rect2], cap: int = 160) -> Array[Dictionary]:
	var sorted := candidates.duplicate()
	sorted.sort_custom(func(a: Dictionary, b: Dictionary) -> bool: return int(a["rank"]) < int(b["rank"]) or (int(a["rank"]) == int(b["rank"]) and int(a["order"]) < int(b["order"])))
	var placed: Array[Dictionary] = []
	var boxes: Array[Rect2] = []
	for c: Dictionary in sorted:
		if placed.size() >= cap:
			break
		var box: Rect2 = c["box"]
		var free := true
		for r in blocked:
			if r.intersects(box):
				free = false
				break
		if free:
			for r in boxes:
				if r.intersects(box):
					free = false
					break
		if free:
			placed.append(c)
			boxes.append(box)
	return placed
