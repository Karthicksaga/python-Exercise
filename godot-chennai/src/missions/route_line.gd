## A polyline measured along its length (port of `RouteLine` in `missions/src/shareAuto.ts`).
## Points are Dictionaries {x, z} (doubles).
class_name RouteLine
extends RefCounted

var points: Array
var length: float
var _at: Array[float] = [0.0]


func _init(route_points: Array) -> void:
	assert(route_points.size() >= 2, "A route needs at least two points")
	points = route_points
	for i in range(1, points.size()):
		_at.append(_at[i - 1] + RulesMath.hypot(_x(i) - _x(i - 1), _z(i) - _z(i - 1)))
	length = _at[_at.size() - 1]


func _x(i: int) -> float:
	return points[i]["x"]


func _z(i: int) -> float:
	return points[i]["z"]


## The point `s` metres along, the unit direction there, and `side` metres to its left:
## {x, z, dx, dz}.
func point_at(s: float, side: float = 0.0) -> Dictionary:
	var d := maxf(0.0, minf(length, s))
	var i := 1
	while i < _at.size() - 1 and _at[i] < d:
		i += 1
	var ax := _x(i - 1)
	var az := _z(i - 1)
	var bx := _x(i)
	var bz := _z(i)
	var span := _at[i] - _at[i - 1]
	var t := (d - _at[i - 1]) / span if span > 0.0 else 0.0
	var dx := (bx - ax) / span if span > 0.0 else 1.0
	var dz := (bz - az) / span if span > 0.0 else 0.0
	# Left of the direction of travel (+X east, +Z south): (dz, -dx).
	return {"x": ax + (bx - ax) * t + dz * side, "z": az + (bz - az) * t - dx * side, "dx": dx, "dz": dz}


## The nearest point on the route to (x, z): {s, off}, searching only between `from` and `to`
## metres along, so a route that bends back near itself is not confused.
func project(x: float, z: float, from: float = 0.0, to: float = INF) -> Dictionary:
	var best := {"s": 0.0, "off": INF}
	for i in range(1, points.size()):
		if _at[i] < from or _at[i - 1] > to:
			continue
		var ax := _x(i - 1)
		var az := _z(i - 1)
		var bx := _x(i)
		var bz := _z(i)
		var span := _at[i] - _at[i - 1]
		var lo := maxf(0.0, (from - _at[i - 1]) / span) if span > 0.0 else 0.0
		var hi := minf(1.0, (to - _at[i - 1]) / span) if span > 0.0 else 0.0
		var t := 0.0
		if span > 0.0:
			t = maxf(lo, minf(hi, ((x - ax) * (bx - ax) + (z - az) * (bz - az)) / (span * span)))
		var off := RulesMath.hypot(ax + (bx - ax) * t - x, az + (bz - az) * t - z)
		if off < float(best["off"]):
			best = {"s": _at[i - 1] + span * t, "off": off}
	return best
