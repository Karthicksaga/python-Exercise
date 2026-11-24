class_name RailPath
extends RefCounted
## A track centre line with arc length (port of `packages/rail/src/path.ts`): where a train is at a
## distance along it, and where a point lies relative to it. World metres, +X east, +Z south
## (TD-2). Pure logic, safe on worker threads.


## A place on the line: position, the way it runs and the distance along it.
class Pose:
	extends RefCounted
	var x: float = 0.0
	var z: float = 0.0
	## Yaw facing the direction of travel: 0 faces north (-Z), positive turns left (west).
	var yaw: float = 0.0
	var s: float = 0.0

	func point() -> Vector2:
		return Vector2(x, z)


## The nearest point of the line to a point.
class Hit:
	extends RefCounted
	var s: float = 0.0
	## Signed distance to the side: positive on the left of the direction of travel.
	var lateral: float = 0.0
	var distance: float = INF


var points: PackedVector2Array
## Distance along the line of each point.
var lengths: PackedFloat64Array


## Yaw that faces along (dx, dz).
static func yaw_of(dx: float, dz: float) -> float:
	return atan2(-dx, -dz)


func _init(line: PackedVector2Array) -> void:
	assert(line.size() >= 2, "A rail path needs at least two points.")
	points = line
	lengths = PackedFloat64Array()
	lengths.resize(line.size())
	lengths[0] = 0.0
	for i in range(1, line.size()):
		lengths[i] = lengths[i - 1] + line[i - 1].distance_to(line[i])


## From a flat [x0, z0, x1, z1, ...] list (the rail file's form).
static func from_flat(flat: Array) -> RailPath:
	var pts := PackedVector2Array()
	var i := 0
	while i + 1 < flat.size():
		pts.append(Vector2(float(flat[i]), float(flat[i + 1])))
		i += 2
	return RailPath.new(pts)


func length() -> float:
	return lengths[lengths.size() - 1]


## Index of the segment that holds distance `s` (clamped to the line).
func segment(s: float) -> int:
	var lo := 0
	var hi := lengths.size() - 2
	while lo < hi:
		var mid := (lo + hi + 1) >> 1
		if lengths[mid] <= s:
			lo = mid
		else:
			hi = mid - 1
	return lo


## Where the line is at distance `s`, clamped to its ends.
func at(s: float) -> Pose:
	var c := clampf(s, 0.0, length())
	var i := segment(c)
	var a := points[i]
	var b := points[i + 1]
	var span := lengths[i + 1] - lengths[i]
	var t := (c - lengths[i]) / span if span > 0.0 else 0.0
	var p := Pose.new()
	p.x = a.x + (b.x - a.x) * t
	p.z = a.y + (b.y - a.y) * t
	p.yaw = yaw_of(b.x - a.x, b.y - a.y)
	p.s = c
	return p


## A point `lateral` metres to the left (negative: right) of the line at distance `s`.
func beside(s: float, lateral: float) -> Vector2:
	var p := at(s)
	return Vector2(p.x - cos(p.yaw) * lateral, p.z + sin(p.yaw) * lateral)


## The nearest point of the line to `p`.
func project(p: Vector2) -> Hit:
	var best := Hit.new()
	for i in points.size() - 1:
		var a := points[i]
		var b := points[i + 1]
		var dx := b.x - a.x
		var dz := b.y - a.y
		var span2 := dx * dx + dz * dz
		var t := clampf(((p.x - a.x) * dx + (p.y - a.y) * dz) / span2, 0.0, 1.0) if span2 > 0.0 else 0.0
		var fx := a.x + dx * t
		var fz := a.y + dz * t
		var distance := Vector2(p.x - fx, p.y - fz).length()
		if distance < best.distance:
			var span := sqrt(span2)
			if span == 0.0:
				span = 1.0
			best.lateral = ((p.x - fx) * dz + (p.y - fz) * -dx) / span
			best.s = lengths[i] + sqrt(span2) * t
			best.distance = distance
	return best


## Like `project`, but only looks at segments within `reach` of `p` along a bounding box test
## first (the same answer when the nearest point is within reach; INF distance otherwise). Cheap
## enough to call every frame for 20 km lines.
func project_near(p: Vector2, reach: float) -> Hit:
	var best := Hit.new()
	for i in points.size() - 1:
		var a := points[i]
		var b := points[i + 1]
		if p.x < minf(a.x, b.x) - reach or p.x > maxf(a.x, b.x) + reach or p.y < minf(a.y, b.y) - reach or p.y > maxf(a.y, b.y) + reach:
			continue
		var dx := b.x - a.x
		var dz := b.y - a.y
		var span2 := dx * dx + dz * dz
		var t := clampf(((p.x - a.x) * dx + (p.y - a.y) * dz) / span2, 0.0, 1.0) if span2 > 0.0 else 0.0
		var fx := a.x + dx * t
		var fz := a.y + dz * t
		var distance := Vector2(p.x - fx, p.y - fz).length()
		if distance < best.distance:
			var span := sqrt(span2)
			if span == 0.0:
				span = 1.0
			best.lateral = ((p.x - fx) * dz + (p.y - fz) * -dx) / span
			best.s = lengths[i] + sqrt(span2) * t
			best.distance = distance
	return best
