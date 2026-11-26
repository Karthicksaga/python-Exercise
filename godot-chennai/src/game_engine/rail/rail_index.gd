class_name RailIndex
extends RefCounted
## The railway cut into the world's 250 m chunks (G-325): each drawn track and each elevated line
## (the MRTS viaduct) split into pieces of at most `STEP` metres, grouped by the chunk holding each
## piece's middle, with the distance along its track (so the sleeper texture and the masts line up
## across chunk edges). Built once on a worker thread; read by the chunk builds. Pure data.

## Longest piece of a track before it is cut, metres (curves stay smooth, chunks split cleanly).
const STEP := 20.0


## A run of track inside one chunk.
class Piece:
	extends RefCounted
	var track_id: int = 0
	## "main", "service" or "elevated".
	var kind: String = "main"
	var points: PackedVector2Array = PackedVector2Array()
	## Distance along the whole track of each point.
	var along: PackedFloat32Array = PackedFloat32Array()
	## Formation height above the ground at each point (elevated lines; empty on the ground).
	var heights: PackedFloat32Array = PackedFloat32Array()


var chunk_size: float = 250.0
var grid_origin: Vector2 = Vector2.ZERO
var pieces: Dictionary[Vector2i, Array] = {}
## Level crossings by chunk (world points).
var crossings: Dictionary[Vector2i, PackedVector2Array] = {}
## Every drawn segment's two ends per chunk, for "is another track near this point" checks.
var segments: Dictionary[Vector2i, PackedVector2Array] = {}


static func build(network: RailNetwork, origin: Vector2, size: float) -> RailIndex:
	var index := RailIndex.new()
	index.chunk_size = size
	index.grid_origin = origin
	var next_id := 1_000_000_000
	for t in network.tracks:
		index._add(t.id, t.kind, t.points, PackedFloat32Array())
	for line in network.lines:
		if not line.elevated():
			continue
		# The Metro's tunnels are not drawn (G-462): only the runs at or above UNDERGROUND.
		var run := PackedVector2Array()
		var hs := PackedFloat32Array()
		for i in line.path.points.size():
			if line.heights[i] >= RailLine.UNDERGROUND:
				run.append(line.path.points[i])
				hs.append(line.heights[i])
				continue
			if run.size() >= 2:
				next_id += 1
				index._add(next_id, "elevated", run, hs)
			run = PackedVector2Array()
			hs = PackedFloat32Array()
		if run.size() >= 2:
			next_id += 1
			index._add(next_id, "elevated", run, hs)
	for c in network.crossings:
		var cell := index.cell_at(Vector2(c.x, c.z))
		if not index.crossings.has(cell):
			index.crossings[cell] = PackedVector2Array()
		index.crossings[cell].append(Vector2(c.x, c.z))
	return index


func cell_at(p: Vector2) -> Vector2i:
	return Vector2i(floori((p.x - grid_origin.x) / chunk_size), floori((p.y - grid_origin.y) / chunk_size))


func cell_centre(cell: Vector2i) -> Vector2:
	return grid_origin + (Vector2(cell) + Vector2(0.5, 0.5)) * chunk_size


func _add(id: int, kind: String, line: PackedVector2Array, heights: PackedFloat32Array) -> void:
	# Densify: cut every segment into pieces of at most STEP metres.
	var pts := PackedVector2Array()
	var hs := PackedFloat32Array()
	var dist := PackedFloat32Array()
	var run := 0.0
	for i in line.size() - 1:
		var a := line[i]
		var b := line[i + 1]
		var n := maxi(1, ceili(a.distance_to(b) / STEP))
		for k in n:
			var t := float(k) / n
			pts.append(a.lerp(b, t))
			if not heights.is_empty():
				hs.append(lerpf(heights[i], heights[i + 1], t))
			dist.append(run + a.distance_to(b) * t)
		run += a.distance_to(b)
	pts.append(line[line.size() - 1])
	if not heights.is_empty():
		hs.append(heights[heights.size() - 1])
	dist.append(run)
	var current: Piece = null
	var current_cell := Vector2i(-99999, -99999)
	for i in pts.size() - 1:
		var mid := (pts[i] + pts[i + 1]) / 2.0
		var cell := cell_at(mid)
		if not segments.has(cell):
			segments[cell] = PackedVector2Array()
		segments[cell].append(pts[i])
		segments[cell].append(pts[i + 1])
		if current == null or cell != current_cell:
			current = Piece.new()
			current.track_id = id
			current.kind = kind
			current.points.append(pts[i])
			current.along.append(dist[i])
			if not hs.is_empty():
				current.heights.append(hs[i])
			current_cell = cell
			if not pieces.has(cell):
				pieces[cell] = []
			pieces[cell].append(current)
		current.points.append(pts[i + 1])
		current.along.append(dist[i + 1])
		if not hs.is_empty():
			current.heights.append(hs[i + 1])


## Cells with railway in them within `radius` of a point.
func cells_near(p: Vector2, radius: float) -> Array[Vector2i]:
	var out: Array[Vector2i] = []
	var c0 := cell_at(p - Vector2(radius, radius))
	var c1 := cell_at(p + Vector2(radius, radius))
	for cx in range(c0.x, c1.x + 1):
		for cz in range(c0.y, c1.y + 1):
			var cell := Vector2i(cx, cz)
			if not pieces.has(cell):
				continue
			var centre := cell_centre(cell)
			var half := chunk_size / 2.0
			var dx := maxf(0.0, absf(p.x - centre.x) - half)
			var dz := maxf(0.0, absf(p.y - centre.y) - half)
			if dx * dx + dz * dz <= radius * radius:
				out.append(cell)
	return out


## Distance from a point to the nearest drawn track segment in its chunk and the ones around it.
func track_distance(p: Vector2, skip_id_line: PackedVector2Array = PackedVector2Array()) -> float:
	var best := INF
	var c := cell_at(p)
	for dx in range(-1, 2):
		for dz in range(-1, 2):
			var seg: PackedVector2Array = segments.get(c + Vector2i(dx, dz), PackedVector2Array())
			var i := 0
			while i + 1 < seg.size():
				best = minf(best, _to_segment(p, seg[i], seg[i + 1]))
				i += 2
	return best


static func _to_segment(p: Vector2, a: Vector2, b: Vector2) -> float:
	var ab := b - a
	var l2 := ab.length_squared()
	var t := clampf((p - a).dot(ab) / l2, 0.0, 1.0) if l2 > 0.0 else 0.0
	return p.distance_to(a + ab * t)
