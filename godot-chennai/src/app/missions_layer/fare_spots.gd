class_name FareSpots
extends RefCounted
## Where people wait for a ride: on the pavement beside a stop's marker (port of
## `fareSpots.ts` `kerbSpot`; the content's kerbs are baked from it, G-41, and this port is what
## the map checks in `test_content_on_map.gd` exercise). OSM maps no pavements, so the spot is
## estimated: just past the carriageway's edge, on the side the stop's real place is on, never on
## another road's carriageway (at a junction it slides along the road).

## Metres past the carriageway's edge where people stand (estimated: just past the kerb stone).
const KERB_STEP := 0.6
const SLIDES: Array[float] = [0.0, 6.0, -6.0, 12.0, -12.0, 20.0, -20.0]


## The pavement spot for a stop at road point `stop` (x, y = world x, z). `side` is a point on
## the side to wait on; `Vector2.INF` means none (the left of the road's direction: India drives
## on the left). `shift` moves the spot along the road, metres.
static func kerb_spot(layout: CityLayout, stop: Vector2, side: Vector2 = Vector2.INF, shift: float = 0.0) -> Vector2:
	var hit := layout.nearest_road_point(stop)
	if hit.is_empty():
		return stop
	var at_point: Vector2 = hit["point"]
	var heading: float = hit["heading"]
	var road: Road = layout.roads[int(hit["road_index"])]
	# Right of the road's direction is (cos h, -sin h) for heading h (0 = north, -Z).
	var right := Vector2(cos(heading), -sin(heading))
	var wanted := -1.0
	if side != Vector2.INF and side.distance_to(at_point) > 0.5:
		var s := signf((side - at_point).dot(right))
		wanted = s if s != 0.0 else -1.0
	var out := road.width / 2.0 + KERB_STEP
	var forward := Vector2(-sin(heading), -cos(heading))
	var same: Array[Road] = []
	for r in layout.roads:
		if r == road or (road.name != "" and r.name == road.name and r.kind != &"footway"):
			same.append(r)
	for base: float in SLIDES:
		var slide := base + shift
		# Along the road itself (it may bend), then out to the side.
		var here := at_point
		var here_heading := heading
		var here_road := road
		if slide != 0.0:
			var moved := nearest_in(same, at_point + forward * slide)
			if not moved.is_empty():
				here = moved["point"]
				here_heading = moved["heading"]
				here_road = moved["road"]
		var r := Vector2(cos(here_heading), -sin(here_heading))
		# Keep to the same side of the road when its drawn direction flips between pieces.
		var flip := -1.0 if r.dot(right) < 0.0 else 1.0
		for s: float in [wanted, -wanted]:
			var p := here + r * out * s * flip
			if not layout.on_other_road(p, here_road.id, 0.5):
				return round_tenth(p)
	return round_tenth(at_point + right * out * wanted)


## The nearest drivable point among `roads` (brute force: the lists are a few roads):
## {road, point, distance, heading}, or {}.
static func nearest_in(roads: Array[Road], p: Vector2) -> Dictionary:
	var best: Dictionary = {}
	var best_d2 := INF
	for road in roads:
		if road.kind == &"footway":
			continue
		for i in range(road.points.size() - 1):
			var a := road.points[i]
			var b := road.points[i + 1]
			var q := Geometry2D.get_closest_point_to_segment(p, a, b)
			var d2 := q.distance_squared_to(p)
			if d2 < best_d2:
				best_d2 = d2
				best = {"road": road, "point": q, "distance": sqrt(d2), "heading": atan2(-(b.x - a.x), -(b.y - a.y))}
	return best


static func round_tenth(p: Vector2) -> Vector2:
	return Vector2(RulesMath.js_round(p.x * 10.0) / 10.0, RulesMath.js_round(p.y * 10.0) / 10.0)
