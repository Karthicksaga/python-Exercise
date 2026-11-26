class_name BusJobRoutes
extends RefCounted
## The city bus job on real stops and routes (decision G-218). The baked bus jobs (`content.json`,
## from the Three.js game) keep their order, timetable and fares, but each stop moves to the
## OpenStreetMap stop within `MATCH` metres where the network has one (its kerb moves with it),
## and the job learns the real route that serves its stops in order, if any. `from_route` makes a
## new job from a stretch of a real route (its own stops, kerbs and timetable at the network's
## speed). Pure logic: the game applies it when the transit data has loaded; the baked content
## and its tests are unchanged.

## Furthest a baked stop moves to a mapped stop, metres.
const MATCH := 45.0
## Seconds a bus spends at each stop in a generated job, and the spare time at the end.
const STOP_SECONDS := 20.0
const SPARE := 60.0


## Moves a bus job's stops onto the network's stops. Returns {moved: [metres per stop, -1 where
## none matched], route: ref or "", names: [the stops' OSM names]}; {} for other jobs.
static func adapt(job: JobData.Job, net: TransitNetwork) -> Dictionary:
	if job.kind != "bus" or net == null:
		return {}
	var moved: Array[float] = []
	var names: PackedStringArray = PackedStringArray()
	var matched: Array[TransitNetwork.Stop] = []
	for s in job.stops:
		var at := Vector2(s.x, s.z)
		var hit := net.nearest_served_stop(at, MATCH)
		if hit == null:
			hit = net.nearest_stop(at, MATCH)
		if hit == null:
			moved.append(-1.0)
			names.append("")
			matched.append(null)
			continue
		var delta := hit.position - at
		moved.append(delta.length())
		names.append(hit.label())
		matched.append(hit)
		s.x = hit.position.x
		s.z = hit.position.y
		if s.fare != null:
			s.fare.kerb_x += delta.x
			s.fare.kerb_z += delta.y
	return {"moved": moved, "route": _serving_route(net, matched), "names": names}


## A route that calls at every matched stop in this order, or "".
static func _serving_route(net: TransitNetwork, stops: Array[TransitNetwork.Stop]) -> String:
	for r in net.routes:
		var last := -1
		var ok := true
		var any := false
		for s in stops:
			if s == null:
				continue
			any = true
			var k := r.stop_number(s.index)
			if k <= last:
				ok = false
				break
			last = k
		if ok and any:
			return r.ref
	return ""


## A bus job on `count` stops of a real route from its stop number `first`: markers where the bus
## stands (the route's lane), kerbs at the mapped stop poles, boarders and alighters as
## `FareStop.bus_crowd`, due times at the network's average speed. Null when the route is short.
static func from_route(net: TransitNetwork, r: TransitNetwork.Route, first: int, count: int) -> JobData.Job:
	if first < 0 or count < 2 or first + count > r.stops.size():
		return null
	var crowd := FareStop.bus_crowd(count)
	var stop_list: Array = []
	var due := 0.0
	for i in count:
		var k := first + i
		var s := net.stops[r.stops[k]]
		var on_road := r.point_at(r.stop_at[k])
		if i > 0:
			due += (r.stop_at[k] - r.stop_at[k - 1]) / TransitTimetable.metres_per_minute() * 60.0 + STOP_SECONDS
		var js := JobData.Stop.make("Bus stop %d of %d: %s" % [i + 1, count, s.label()], on_road.x, on_road.y, 9.0, 4.0, roundf(due) if i > 0 else roundf(STOP_SECONDS * 2.0))
		var fare := MissionData.Fare.new()
		fare.board = int(crowd[i].get("board", 0))
		fare.alight = int(crowd[i].get("alight", 0))
		fare.kerb_x = s.position.x
		fare.kerb_z = s.position.y
		js.fare = fare
		stop_list.append(js)
	var metres := r.stop_at[first + count - 1] - r.stop_at[first]
	var job := JobData.Job.make("bus-osm-%d-%d" % [r.osm, first], "bus", "bus", stop_list, roundf(due + SPARE), 300 + 250 * count + roundi(metres * 0.05), 120)
	job.title = "Route %s" % r.ref
	var dest := net.stops[r.stops[first + count - 1]].label()
	job.brief = "Drive route %s from %s to %s, stopping at %d real stops in order." % [r.ref, net.stops[r.stops[first]].label(), dest, count]
	job.min_reputation = 50
	job.start_radius = 300.0
	return job
