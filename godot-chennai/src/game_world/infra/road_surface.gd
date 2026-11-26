class_name RoadSurface
extends RefCounted
## What the road under a point does to a vehicle (decision G-450): the condition of the way
## (good, worn, damaged, unpaved: `RoadStyle.condition`) turned into `RoadStyle.feel` numbers, and
## the puddles drawn on it. Node-free and read-only for the callers, like `RoadHeights`.
##
## The chunk builder tells it about each chunk it builds, on its worker thread (`note_chunk`):
## whether the chunk is open country (that changes how arterials are judged) and the chunk's
## puddles. The main thread then only reads: the segment grid of the street layout for the road
## under the point, a cached condition per road, a few puddle rectangles of one chunk. Nothing
## here builds a layout or blocks: a point whose tile is not ready is plain good tar.

## Puddles add this to the speed share kept and the grip while a vehicle is in one.
const PUDDLE_TOP_SPEED := 0.92
const PUDDLE_GRIP := 0.9
## Margin past the carriageway's edge that still counts as on the road, metres.
const EDGE := 0.4


## One chunk as the builder planned it: open country or not, and its puddles as 6 floats each
## (centre x, z, unit direction x, z, half length, half width).
class ChunkInfo:
	extends RefCounted
	var rural: bool = false
	var puddles := PackedFloat32Array()


## The nearest segment found so far (a lambda cannot assign the outer locals).
class _Nearest:
	extends RefCounted
	var distance: float = INF
	var road: Road = null
	var mid: Vector2 = Vector2.ZERO


var layouts: CityLayouts
var _chunks: Dictionary[Vector2i, ChunkInfo] = {}
var _mutex := Mutex.new()
## Road instance id * 2 + (rural ? 1 : 0) -> condition. Main thread only.
var _conditions: Dictionary[int, StringName] = {}


static func create(with_layouts: CityLayouts) -> RoadSurface:
	var s := RoadSurface.new()
	s.layouts = with_layouts
	return s


## A chunk was planned (any thread): its rural flag and the `RoadDetail.Mark`s with kind `puddle`.
func note_chunk(cell: Vector2i, rural: bool, marks: Array) -> void:
	var info := ChunkInfo.new()
	info.rural = rural
	for m: RoadDetail.Mark in marks:
		if m.kind != &"puddle":
			continue
		info.puddles.append_array(PackedFloat32Array([m.position.x, m.position.y, m.dir.x, m.dir.y, m.length / 2.0, m.width / 2.0]))
	_mutex.lock()
	_chunks[cell] = info
	_mutex.unlock()


func chunk_info(cell: Vector2i) -> ChunkInfo:
	_mutex.lock()
	var info: ChunkInfo = _chunks.get(cell)
	_mutex.unlock()
	return info


## The condition of a way as the chunk that draws that stretch (`cell`) judged it.
func condition_at(road: Road, cell: Vector2i) -> StringName:
	var info := chunk_info(cell)
	var rural := info != null and info.rural
	var key := road.get_instance_id() * 2 + (1 if rural else 0)
	var c: StringName = _conditions.get(key, &"")
	if c == &"":
		c = RoadStyle.condition(road, rural)
		_conditions[key] = c
	return c


## Condition of the road a vehicle at `p` (world metres) at height `near_y` drives on, `GOOD` when
## it is on none (or the tile's layout is not ready). `puddle` is set when it is in a puddle.
func lookup(p: Vector2, near_y: float = 0.0) -> Dictionary:
	var out := {"condition": RoadStyle.GOOD, "puddle": false, "on_road": false}
	if layouts == null:
		return out
	var source := layouts.source
	var cell := source.cell_at(p)
	if layouts.single == null:
		var regional := source as RegionalWorldSource
		if regional == null or not layouts.has_tile(regional.tile_of(cell)):
			return out
	var layout := layouts.layout_for(cell)
	var best := _Nearest.new()
	layout.segments_near(p, 1.0, func(ri: int, i: int) -> bool:
		var road := layout.roads[ri]
		if road.points.size() < 2 or i + 1 >= road.points.size() or road.tunnel:
			return false
		var a := road.points[i]
		var b := road.points[i + 1]
		var ab := b - a
		var len2 := ab.length_squared()
		var t := 0.0 if len2 < 1e-9 else clampf((p - a).dot(ab) / len2, 0.0, 1.0)
		var d := a.lerp(b, t).distance_to(p)
		if d > road.width / 2.0 + EDGE or d >= best.distance:
			return false
		if road.is_raised() and absf(road.height_at(i, t) - near_y) > 2.5:
			return false
		if not road.is_raised() and near_y > 3.0:
			return false
		best.distance = d
		best.road = road
		best.mid = (a + b) * 0.5
		return false)
	if best.road == null:
		return out
	out["on_road"] = true
	var c := condition_at(best.road, source.cell_at(best.mid))
	out["condition"] = c
	if c == RoadStyle.DAMAGED or c == RoadStyle.UNPAVED:
		out["puddle"] = _in_puddle(p, cell)
	return out


## The feel of the surface at a world point, `RoadStyle.feel` plus `wet` (in a puddle) and
## `on_road`. The main thread may call it every few frames (a handful of segments, no build).
func feel_at(p: Vector2, near_y: float = 0.0) -> Dictionary:
	var found := lookup(p, near_y)
	var f := RoadStyle.feel(found["condition"])
	f["wet"] = found["puddle"]
	f["on_road"] = found["on_road"]
	f["condition"] = found["condition"]
	if f["wet"]:
		f["top_speed"] = float(f["top_speed"]) * PUDDLE_TOP_SPEED
		f["grip"] = float(f["grip"]) * PUDDLE_GRIP
	return f


func _in_puddle(p: Vector2, cell: Vector2i) -> bool:
	var info := chunk_info(cell)
	if info == null:
		return false
	var arr := info.puddles
	for k in range(0, arr.size(), 6):
		var d := p - Vector2(arr[k], arr[k + 1])
		var dir := Vector2(arr[k + 2], arr[k + 3])
		if absf(d.dot(dir)) <= arr[k + 4] and absf(d.dot(Vector2(-dir.y, dir.x))) <= arr[k + 5]:
			return true
	return false
