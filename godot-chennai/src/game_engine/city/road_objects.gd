class_name RoadObjects
extends RefCounted
## The small roadside objects of G-310 to G-313 merged into the chunk's one objects surface (so
## no draw call is added): overhead wires between poles, shrubs on medians, tree guards and the
## poles of streets that have none. Plain geometry on a worker thread.

const WIRE_HEIGHTS: Array[float] = [8.25, 7.95]
const WIRE_LATERAL: Array[float] = [0.0, 0.32]
const WIRE_SAG := 0.45
const WIRE_STEPS := 4
const WIRE_WIDTH := 0.05
const WIRE_COLOUR := 0x16171a
## Longest span a wire crosses between two poles, and the shortest worth drawing.
const WIRE_MAX := 75.0
const WIRE_MIN := 8.0
const SHRUB_PITCH := 3.0


## Wires from each pole to the next pole on the same side of the same road, a little slack in each.
## Returns the number of spans drawn.
static func wires(into: MeshBuilder, poles: Array[StreetFurniture.Pole], centre: Vector2) -> int:
	var count := 0
	for i in poles.size():
		var a := poles[i]
		var la := Vector2(sin(a.yaw), cos(a.yaw))
		for j in range(i + 1, mini(poles.size(), i + 4)):
			var b := poles[j]
			if b.road_id != a.road_id:
				continue
			var lb := Vector2(sin(b.yaw), cos(b.yaw))
			var span := a.position.distance_to(b.position)
			if la.dot(lb) < 0.5 or span < WIRE_MIN or span > WIRE_MAX:
				continue
			for w in WIRE_HEIGHTS.size():
				var off := la * WIRE_LATERAL[w]
				_wire(into, a.position + off - centre, b.position + off - centre, WIRE_HEIGHTS[w], span)
			count += 1
			break
	return count


static func _wire(into: MeshBuilder, a: Vector2, b: Vector2, h: float, span: float) -> void:
	var col := CityModels._lin(WIRE_COLOUR)
	var prev := Vector3(a.x, h, a.y)
	for k in range(1, WIRE_STEPS + 1):
		var t := float(k) / WIRE_STEPS
		var p := a.lerp(b, t)
		var sag := WIRE_SAG * span / 38.0 * 4.0 * t * (1.0 - t)
		var next := Vector3(p.x, h - sag, p.y)
		# A vertical strip, both faces.
		var up := Vector3(0, WIRE_WIDTH, 0)
		var i0 := into.vertex(prev, Vector3.UP, Vector2(CityModels.DARK_U, 0.5), col)
		var i1 := into.vertex(next, Vector3.UP, Vector2(CityModels.DARK_U, 0.5), col)
		var i2 := into.vertex(next + up, Vector3.UP, Vector2(CityModels.DARK_U, 0.5), col)
		var i3 := into.vertex(prev + up, Vector3.UP, Vector2(CityModels.DARK_U, 0.5), col)
		into.quad(i0, i1, i2, i3)
		into.quad(i0, i3, i2, i1)
		prev = next


## Shrubs along the median runs: a bush every SHRUB_PITCH metres, a quarter in flower.
static func shrubs(into: MeshBuilder, models: CityModels, runs: Array[StreetFurniture.KerbRun], centre: Vector2) -> int:
	var count := 0
	for run in runs:
		var carry := 0.0
		for i in run.inner.size() - 1:
			var a := (run.inner[i] + run.outer[i]) / 2.0
			var b := (run.inner[i + 1] + run.outer[i + 1]) / 2.0
			var length := a.distance_to(b)
			if length < 0.05:
				continue
			var d := SHRUB_PITCH - carry
			while d <= length:
				var p := a.lerp(b, d / length)
				var u := CityHash.tree_unit(p, 71)
				var model := models.bloom if u < 0.18 else models.shrub
				var s := 0.6 + 0.45 * CityHash.tree_unit(p, 72)
				into.append(model, Transform3D(Basis(Vector3.UP, u * TAU).scaled(Vector3(s, s * (0.8 + 0.5 * CityHash.tree_unit(p, 73)), s)), Vector3(p.x - centre.x, StreetFurniture.KERB_HEIGHT + 0.07, p.y - centre.y)))
				count += 1
				d += SHRUB_PITCH
			carry = length - (d - SHRUB_PITCH)
	return count


## Cages round the trees in `at`.
static func guards(into: MeshBuilder, models: CityModels, at: Array[Vector2], centre: Vector2) -> void:
	for p in at:
		CityModels.place(into, models.guard, Vector3(p.x - centre.x, 0.0, p.y - centre.y), CityHash.tree_unit(p, 74) * PI)


## W-beam crash barrier along each run's inner line: a post every 4 m and a two-sided beam strip
## 0.3 m high at 0.45 m, grey. Returns the number of segments.
static func barriers(into: MeshBuilder, runs: Array[StreetFurniture.KerbRun], centre: Vector2) -> int:
	var count := 0
	var col := CityModels._lin(0xa3a8ab)
	var uv := Vector2(CityModels.DARK_U, 0.5)
	for run in runs:
		var carry := 0.0
		for i in run.inner.size() - 1:
			var a := run.inner[i] - centre
			var b := run.inner[i + 1] - centre
			var length := a.distance_to(b)
			if length < 0.05:
				continue
			var n := Vector3(b.y - a.y, 0.0, -(b.x - a.x)) / length
			var va := Vector3(a.x, 0.45, a.y)
			var vb := Vector3(b.x, 0.45, b.y)
			var up := Vector3(0, 0.3, 0)
			var i0 := into.vertex(va, n, uv, col)
			var i1 := into.vertex(vb, n, uv, col)
			var i2 := into.vertex(vb + up, n, uv, col)
			var i3 := into.vertex(va + up, n, uv, col)
			into.quad(i0, i1, i2, i3)
			into.quad(i0, i3, i2, i1)
			var d := 4.0 - carry
			while d <= length:
				var p := a.lerp(b, d / length)
				CityModels.box(into, Vector3(p.x - 0.04, 0.0, p.y - 0.04), Vector3(p.x + 0.04, 0.78, p.y + 0.04), 0x6c7074)
				d += 4.0
			carry = length - (d - 4.0)
			count += 1
	return count
