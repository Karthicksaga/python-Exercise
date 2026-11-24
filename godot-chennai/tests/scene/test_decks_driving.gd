extends TestCase
## Driving up and over a flyover at speed (decisions G-150, G-151): the streamed regional world
## round the Gemini (Anna) flyover, a car from the vehicle catalogue (the same ray-cast body the
## handling parity tests measure) steered along the road from the ground, up the ramp, over the
## deck and down again. The deck colliders must carry it the whole way at the road's height, and
## the speed breaker colliders must lift a wheel. Waits in game time.

const ANNA := "Anna Flyover"
const NEAR := Vector2(4369.0, 3721.0)
const MAX_FRAMES := 60 * 240
const DT := 1.0 / 60.0

var streamer: ChunkStreamer
var holder: Node3D


func before_each() -> void:
	(tree.root.get_node("/root/WorldOrigin") as Node).call("recentre", NEAR.x, NEAR.y)
	holder = Node3D.new()
	root.add_child(holder)
	HandlingRig.ground(holder, 2500.0)
	streamer = ChunkStreamer.new()
	streamer.name = "Chunks"
	holder.add_child(streamer)
	streamer.focus = NEAR
	streamer.start(CityTestKit.regional_kit())


func _origin() -> Node:
	return tree.root.get_node("/root/WorldOrigin")


func _to_scene(p: Vector2, y: float) -> Vector3:
	return _origin().call("to_scene", p, y)


func _to_world(v: Vector3) -> Vector2:
	return _origin().call("to_world", v)


## The flyover's carriageway as one polyline in the direction of travel, from the ground before
## the ramp to the ground after it, with the surface height at each point.
func _path(layout: CityLayout) -> Array:
	var deck: Road = null
	for road in layout.roads:
		if road.name == ANNA and road.is_raised() and road.oneway and road.height_along(road.along[road.along.size() / 2]) > 6.0:
			if deck == null or road.length() > deck.length():
				deck = road
	if deck == null:
		return []
	var roads: Array[Road] = [deck]
	# Back to the ground, then forward to the ground (and 60 m further each way).
	for dir: int in [-1, 1]:
		var cur := deck
		var spare := 0.0
		for guard in 30:
			var end := cur.points[0] if dir < 0 else cur.points[cur.points.size() - 1]
			var heading := (cur.points[1] - cur.points[0]) if dir < 0 else (cur.points[cur.points.size() - 1] - cur.points[cur.points.size() - 2])
			var best: Road = null
			var best_dot := 0.3
			for r in layout.roads:
				if r == cur or r.kind == &"footway" or r.points.size() < 2:
					continue
				var joins := r.points[r.points.size() - 1].distance_to(end) < 0.05 if dir < 0 else r.points[0].distance_to(end) < 0.05
				if not joins:
					continue
				var d := (r.points[r.points.size() - 1] - r.points[r.points.size() - 2]) if dir < 0 else (r.points[1] - r.points[0])
				var dot := d.normalized().dot(heading.normalized())
				if dot > best_dot:
					best_dot = dot
					best = r
			if best == null:
				break
			if dir < 0:
				roads.push_front(best)
			else:
				roads.push_back(best)
			cur = best
			var low := best.height_along(0.0 if dir < 0 else best.along[best.along.size() - 1]) < 0.01 if best.is_raised() else true
			if low:
				spare += best.length()
				if spare > 60.0:
					break
	var pts := PackedVector2Array()
	var hs := PackedFloat32Array()
	# Every 2 m, with the road's own height there (heights are not linear between its points).
	for r in roads:
		for i in r.points.size() - 1:
			var steps := maxi(1, ceili(r.points[i].distance_to(r.points[i + 1]) / 2.0))
			for k in steps + 1:
				var q := r.points[i].lerp(r.points[i + 1], float(k) / steps)
				if not pts.is_empty() and pts[pts.size() - 1].distance_to(q) < 0.05:
					continue
				pts.append(q)
				hs.append(r.height_at(i, float(k) / steps))
	return [pts, hs]


func _closest(pts: PackedVector2Array, p: Vector2) -> Vector2:
	# x = distance along the path, y = distance off it.
	var best := Vector2(0.0, INF)
	var run := 0.0
	for i in pts.size() - 1:
		var q := Geometry2D.get_closest_point_to_segment(p, pts[i], pts[i + 1])
		var off := q.distance_to(p)
		if off < best.y:
			best = Vector2(run + pts[i].distance_to(q), off)
		run += pts[i].distance_to(pts[i + 1])
	return best


func _point_at(pts: PackedVector2Array, d: float) -> Vector2:
	var run := 0.0
	for i in pts.size() - 1:
		var l := pts[i].distance_to(pts[i + 1])
		if run + l >= d:
			return pts[i].lerp(pts[i + 1], (d - run) / maxf(l, 1e-6))
		run += l
	return pts[pts.size() - 1]


func test_car_drives_up_over_and_down_a_flyover_at_speed() -> bool:
	return await _over_the_flyover(&"car")


## Transit agent (G-214): a motorbike rides the same flyover (bikes use the same decks).
func test_motorbike_rides_up_over_and_down_a_flyover_at_speed() -> bool:
	return await _over_the_flyover(&"bike")


func _over_the_flyover(kind: StringName) -> bool:
	var kit := CityTestKit.regional_kit()
	var layout := kit.layouts.layout_for(kit.source.cell_at(NEAR))
	var found := _path(layout)
	assert_true(found.size() == 2, "found the Anna Flyover in the data")
	if failures.size() > 0:
		return _finish()
	var pts: PackedVector2Array = found[0]
	var hs: PackedFloat32Array = found[1]
	var total := 0.0
	var top := 0.0
	for i in pts.size() - 1:
		total += pts[i].distance_to(pts[i + 1])
	for h in hs:
		top = maxf(top, h)
	assert_true(hs[0] < 0.05 and hs[hs.size() - 1] < 0.05, "the path starts and ends on the ground")
	assert_true(top > 6.0, "and climbs to the deck (%.1f m)" % top)
	streamer.focus = pts[0]
	assert_true(await wait_until(func() -> bool: return streamer.world_ready_around(pts[0]), MAX_FRAMES), "the start loads")
	var t := VehicleCatalog.type(kind)
	var car := RaycastVehicle.new()
	car.setup(t.spec)
	var start_dir := (pts[1] - pts[0]).normalized()
	car.position = _to_scene(pts[0], t.ride_height + 0.3)
	car.rotation.y = atan2(-start_dir.x, -start_dir.y)
	holder.add_child(car)
	await wait_physics_frames(30)
	var travelled := 0.0
	var peak_y := -INF
	var lowest_y := INF
	var worst_off := 0.0
	var worst_gap := 0.0
	var on_deck_min_speed := INF
	var on_deck_frames := 0
	var stalled := 0
	for frame in 60 * 90:
		var here := _to_world(car.global_position)
		var at := _closest(pts, here)
		travelled = at.x
		if travelled > total - 15.0:
			break
		# Steer at a point 14 m ahead on the path; hold about 70 km/h.
		var target := _point_at(pts, travelled + 14.0)
		var want := atan2(-(target.x - here.x), -(target.y - here.y))
		var err := wrapf(want - car.yaw(), -PI, PI)
		var speed := car.forward_speed()
		var throttle := 1.0 if speed < 19.5 else 0.0
		var brake := 0.3 if speed > 21.0 else 0.0
		# Steer +1 is to the right (`RaycastVehicle`: wheel angle = -steer x lock).
		car.set_controls(throttle, clampf(-err * 2.5, -1.0, 1.0), brake)
		streamer.focus = here
		await tree.physics_frame
		# The surface height under the car from the path.
		var k := 0
		var run := 0.0
		while k < pts.size() - 2 and run + pts[k].distance_to(pts[k + 1]) < travelled:
			run += pts[k].distance_to(pts[k + 1])
			k += 1
		var seg := maxf(pts[k].distance_to(pts[k + 1]), 1e-6)
		var surface := lerpf(hs[k], hs[k + 1], clampf((travelled - run) / seg, 0.0, 1.0))
		var y := car.global_position.y
		peak_y = maxf(peak_y, y)
		lowest_y = minf(lowest_y, y)
		worst_off = maxf(worst_off, at.y)
		if surface > 1.5:
			worst_gap = maxf(worst_gap, absf(y - t.ride_height - surface))
		if surface > 5.5:
			on_deck_frames += 1
			on_deck_min_speed = minf(on_deck_min_speed, speed)
		if OS.has_environment("DECK_DEBUG") and frame % 20 == 0:
			print("f%d d=%.1f off=%.1f y=%.2f surf=%.2f v=%.1f yaw=%.2f want=%.2f" % [frame, travelled, at.y, y, surface, speed, car.yaw(), want])
		stalled = stalled + 1 if speed < 1.0 else 0
		if stalled > 240:
			break
	car.set_controls(0.0, 0.0, 1.0)
	assert_true(travelled > total - 20.0, "drove the whole way over (%.0f of %.0f m)" % [travelled, total])
	assert_true(peak_y > top - 0.5, "rode up onto the deck (peak %.2f m, deck %.1f m)" % [peak_y, top])
	assert_true(lowest_y > -0.5, "never sank through the ground (lowest %.2f m)" % lowest_y)
	assert_true(worst_gap < 0.9, "stayed on the ramp and deck surface, never fell off it (worst %.2f m)" % worst_gap)
	assert_true(worst_off < 6.0, "kept to the carriageway (worst %.1f m off the centre line)" % worst_off)
	assert_true(on_deck_frames > 60 and on_deck_min_speed > 12.0, "crossed the deck at speed (%d frames, slowest %.1f m/s)" % [on_deck_frames, on_deck_min_speed])
	car.queue_free()
	return _finish()


## Puts the floating origin back for the tests that follow (they assume world = scene metres).
func _finish() -> bool:
	streamer.clear()
	_origin().call("recentre", 0.0, 0.0)
	return true


func test_a_speed_breaker_lifts_the_car() -> bool:
	# The first mapped hump of the Kathipara tile (G-153), approached straight along its road.
	var tile := CityTestKit.regional().tile_infra(Vector2i(2, 6))
	var hump: WorldSpot = null
	for s in tile.spots:
		if s.mapped and s.kind == &"hump":
			hump = s
			break
	assert_true(hump != null, "a mapped hump")
	if hump == null:
		return _finish()
	_origin().call("recentre", hump.position.x, hump.position.y)
	streamer.focus = hump.position
	assert_true(await wait_until(func() -> bool: return streamer.world_ready_around(hump.position, 120.0), MAX_FRAMES), "its streets load")
	var dir := hump.direction()
	var start := hump.position - dir * 14.0
	var t := VehicleCatalog.type(&"car")
	var car := RaycastVehicle.new()
	car.setup(t.spec)
	car.position = _to_scene(start, t.ride_height + 0.2)
	car.rotation.y = atan2(-dir.x, -dir.y)
	holder.add_child(car)
	await wait_physics_frames(40)
	var rest := car.global_position.y
	var peak := rest
	for frame in 60 * 6:
		var speed := car.forward_speed()
		car.set_controls(1.0 if speed < 6.0 else 0.0, 0.0, 0.0)
		await tree.physics_frame
		peak = maxf(peak, car.global_position.y)
		if (_to_world(car.global_position) - hump.position).dot(dir) > 8.0:
			break
	assert_true((_to_world(car.global_position) - hump.position).dot(dir) > 4.0, "drove over it")
	assert_true(peak - rest > 0.03, "the hump lifted the car (%.3f m)" % (peak - rest))
	car.queue_free()
	return _finish()
