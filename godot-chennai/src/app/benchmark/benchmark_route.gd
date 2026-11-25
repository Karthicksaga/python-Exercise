class_name BenchmarkRoute
extends RefCounted
## The benchmark's fixed route (decision G-400): seven segments, about 90 s of game time, the same
## for every quality level and every run. A segment is a path in world metres (x east, surface
## height, z with -Z north; heights from the regional world's road data, estimated there), a time
## of day, a speed and a duration. Where the camera is at time `t` of a segment is a pure function
## of the segment and `t` (`pose`), so every level is drawn from exactly the same viewpoints.
##
## The paths were taken from the data by `tests/tools/bench_route_finder.gd` (run it again when the
## world data changes and paste its output here); `test_benchmark.gd` checks each one still lies on
## its road.

class Segment:
	extends RefCounted
	var id: StringName
	## What the owner reads on the card ("Evening long street").
	var title: String
	## Short name for the card's table column (fits 9 characters).
	var short: String
	## The road or place the path follows (checked by the tests against the data).
	var place: String
	var hour: float
	## Game seconds measured.
	var seconds: float
	## Metres a game second along the path.
	var speed: float
	## Camera behind and above the focus, metres; it looks `ahead` metres in front, `look_up` high.
	var back: float
	var up: float
	var ahead: float = 8.0
	var look_up: float = 1.4
	var path: PackedVector3Array

	func _init(seg_id: StringName, seg_title: String, seg_short: String, seg_place: String, seg_hour: float, secs: float, metres_a_second: float, cam_back: float, cam_up: float, pts: PackedVector3Array) -> void:
		id = seg_id
		title = seg_title
		short = seg_short
		place = seg_place
		hour = seg_hour
		seconds = secs
		speed = metres_a_second
		back = cam_back
		up = cam_up
		path = pts

	func length() -> float:
		var total := 0.0
		for i in range(1, path.size()):
			total += Vector2(path[i].x, path[i].z).distance_to(Vector2(path[i - 1].x, path[i - 1].z))
		return total


## Where one segment's camera and focus are at one time (world metres; heights above the ground).
class Pose:
	extends RefCounted
	## The focus on the path (the player's feet stand here; streaming and traffic follow it).
	var focus := Vector2.ZERO
	var focus_height: float = 0.0
	## Game heading of the path there (0 looks north, turning left is positive).
	var yaw: float = 0.0
	var eye := Vector2.ZERO
	var eye_height: float = 0.0
	var target := Vector2.ZERO
	var target_height: float = 0.0


## Physics steps a game second (the project's fixed step).
const STEPS_A_SECOND := 60


static var _all: Array[Segment] = []


## The route, in the order it runs. The same objects every call.
static func segments() -> Array[Segment]:
	if _all.is_empty():
		_all = [
			Segment.new(&"morning", "Morning street, traffic and people", "Morning", "Anna Salai (Mount Road)", 8.5, 12.0, 6.0, 9.0, 3.4, PackedVector3Array([Vector3(5093.6, 0.00, 3091.1), Vector3(5101.8, 0.00, 3082.5), Vector3(5108.5, 0.00, 3075.2), Vector3(5115.3, 0.00, 3068.0), Vector3(5122.0, 0.00, 3060.8), Vector3(5128.8, 0.00, 3053.6), Vector3(5135.5, 0.00, 3046.4), Vector3(5142.3, 0.00, 3039.2), Vector3(5149.0, 0.00, 3032.0), Vector3(5155.9, 0.00, 3024.9)])),
			Segment.new(&"dusk", "Evening 18:40, long street", "18:40", "Kamarajar Salai", 18.0 + 40.0 / 60.0, 12.0, 8.0, 9.0, 3.4, PackedVector3Array([Vector3(7762.0, 0.00, 3232.3), Vector3(7760.0, 0.00, 3244.1), Vector3(7758.4, 0.00, 3253.9), Vector3(7756.8, 0.00, 3263.7), Vector3(7755.1, 0.00, 3273.6), Vector3(7753.5, 0.00, 3283.4), Vector3(7751.9, 0.00, 3293.2), Vector3(7750.3, 0.00, 3303.0), Vector3(7748.6, 0.00, 3312.8), Vector3(7747.0, 0.00, 3322.7), Vector3(7745.4, 0.00, 3332.5), Vector3(7743.8, 0.00, 3342.3)])),
			Segment.new(&"night", "Night street", "Night", "EVR Periyar Salai", 22.0, 12.0, 6.0, 9.0, 3.4, PackedVector3Array([Vector3(6596.8, 0.00, 455.5), Vector3(6587.5, 0.00, 460.3), Vector3(6577.5, 0.00, 464.7), Vector3(6568.8, 0.00, 466.7), Vector3(6558.6, 0.00, 468.6), Vector3(6547.8, 0.00, 469.7), Vector3(6538.7, 0.00, 470.1), Vector3(6529.2, 0.00, 470.5), Vector3(6518.2, 0.00, 470.8), Vector3(6509.0, 0.00, 471.0)])),
			Segment.new(&"platform", "Railway platform, Chennai Egmore", "Platform", "Chennai Egmore", 17.5, 12.0, 1.5, 6.0, 2.4, PackedVector3Array([Vector3(5547.2, 0.90, 706.9), Vector3(5523.5, 0.90, 710.5)])),
			Segment.new(&"market", "Market street, T. Nagar", "Market", "Ranganathan Street", 11.0, 12.0, 1.4, 7.0, 2.8, PackedVector3Array([Vector3(2242.0, 0.00, 5366.8), Vector3(2231.0, 0.00, 5363.5), Vector3(2221.7, 0.00, 5360.6), Vector3(2212.2, 0.00, 5357.7)])),
			Segment.new(&"flyover", "Over the Anna flyover", "Flyover", "Anna Flyover", 10.0, 12.0, 12.0, 9.0, 3.4, PackedVector3Array([Vector3(4585.6, 3.46, 3520.5), Vector3(4576.1, 4.06, 3527.7), Vector3(4568.2, 4.55, 3533.7), Vector3(4560.3, 5.05, 3539.8), Vector3(4552.4, 5.55, 3545.8), Vector3(4544.5, 6.05, 3551.8), Vector3(4536.5, 6.47, 3557.8), Vector3(4528.6, 6.50, 3563.9), Vector3(4520.7, 6.50, 3569.9), Vector3(4512.8, 6.50, 3575.9), Vector3(4504.9, 6.50, 3581.9), Vector3(4496.9, 6.50, 3588.0), Vector3(4489.0, 6.50, 3594.0), Vector3(4481.1, 6.50, 3600.0), Vector3(4473.2, 6.50, 3606.0), Vector3(4465.3, 6.50, 3612.0), Vector3(4457.3, 6.50, 3618.1), Vector3(4449.4, 6.50, 3624.1)])),
			Segment.new(&"drive", "Driving into new streets (chunks load)", "Driving", "Anna Salai (Mount Road)", 13.0, 18.0, 20.0, 9.0, 3.4, PackedVector3Array([Vector3(5719.0, 0.00, 2550.9), Vector3(5727.2, 0.00, 2543.7), Vector3(5734.5, 0.00, 2536.9), Vector3(5741.8, 0.00, 2530.2), Vector3(5749.1, 0.00, 2523.8), Vector3(5756.7, 0.00, 2517.3), Vector3(5764.3, 0.00, 2510.9), Vector3(5772.0, 0.00, 2504.4), Vector3(5779.6, 0.00, 2498.0), Vector3(5787.1, 0.00, 2491.7), Vector3(5794.7, 0.00, 2485.3), Vector3(5802.3, 0.00, 2478.9), Vector3(5811.0, 0.00, 2471.6), Vector3(5818.5, 0.00, 2465.3), Vector3(5826.1, 0.00, 2458.9), Vector3(5833.7, 0.00, 2452.5), Vector3(5841.4, 0.00, 2446.1), Vector3(5849.0, 0.00, 2439.7), Vector3(5856.6, 0.00, 2433.3), Vector3(5864.3, 0.00, 2426.8), Vector3(5871.9, 0.00, 2420.4), Vector3(5879.5, 0.00, 2414.0), Vector3(5887.0, 0.00, 2407.7), Vector3(5894.5, 0.00, 2401.4), Vector3(5902.0, 0.00, 2395.1), Vector3(5909.5, 0.00, 2388.8), Vector3(5917.1, 0.00, 2382.4), Vector3(5924.7, 0.00, 2376.0), Vector3(5932.4, 0.00, 2369.6), Vector3(5941.5, 0.00, 2362.0), Vector3(5949.1, 0.00, 2355.6), Vector3(5956.7, 0.00, 2349.2), Vector3(5964.3, 0.00, 2342.8), Vector3(5971.9, 0.00, 2336.4), Vector3(5979.5, 0.00, 2330.0), Vector3(5987.1, 0.00, 2323.6), Vector3(5994.7, 0.00, 2317.2), Vector3(6002.4, 0.00, 2310.8), Vector3(6010.0, 0.00, 2304.4), Vector3(6017.6, 0.00, 2298.0), Vector3(6025.2, 0.00, 2291.6)])),
		]
	return _all


## Game seconds the whole route measures, times `scale` (shorter runs for CI and tests).
static func total_seconds(scale: float = 1.0) -> float:
	var total := 0.0
	for s in segments():
		total += s.seconds
	return total * scale


## Physics steps a segment measures at `scale` (at least one).
static func steps(segment: Segment, scale: float = 1.0) -> int:
	return maxi(1, roundi(segment.seconds * scale * STEPS_A_SECOND))


## The pose `t` game seconds into `segment` (clamped to the path's end). With `scale` < 1 the run is
## shorter but covers the same stretch of road, faster (so a short CI run still loads new chunks).
static func pose(segment: Segment, t: float, scale: float = 1.0) -> Pose:
	var d := segment.speed * clampf(t / maxf(scale, 0.0001), 0.0, segment.seconds)
	var at := _along(segment.path, d)
	var dir := _direction(segment.path, d)
	var p := Pose.new()
	p.focus = Vector2(at.x, at.z)
	p.focus_height = at.y
	p.yaw = atan2(-dir.x, -dir.y)
	p.eye = p.focus - dir * segment.back
	p.eye_height = at.y + segment.up
	p.target = p.focus + dir * segment.ahead
	p.target_height = at.y + segment.look_up
	return p


static func _flat(v: Vector3) -> Vector2:
	return Vector2(v.x, v.z)


## The point `d` metres along the path, height interpolated.
static func _along(path: PackedVector3Array, d: float) -> Vector3:
	var run := 0.0
	for i in range(1, path.size()):
		var l := _flat(path[i]).distance_to(_flat(path[i - 1]))
		if run + l >= d:
			return path[i - 1].lerp(path[i], clampf((d - run) / maxf(l, 0.0001), 0.0, 1.0))
		run += l
	return path[path.size() - 1]


## The path's direction (unit, world x and z) at `d` metres, averaged over 10 m so corners in the
## data do not jerk the camera.
static func _direction(path: PackedVector3Array, d: float) -> Vector2:
	var a := _along(path, maxf(0.0, d - 5.0))
	var b := _along(path, d + 5.0)
	var v := _flat(b) - _flat(a)
	if v.length() < 0.001:
		v = _flat(path[path.size() - 1]) - _flat(path[0])
	return v.normalized()
