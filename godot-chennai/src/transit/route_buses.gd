class_name RouteBuses
extends AgentRoutes
## City buses on their real routes (decision G-214): the traffic's bus agents (`AgentSystem.
## is_bus`) are put on a route of the `TransitNetwork` that passes near the player, follow its
## snapped path stretch by stretch with the ordinary lane, signal and junction logic, pull in to
## the kerb at every stop, stand there with the doors open (`DWELL` s), close the doors and carry
## on; at the end of the route the bus is recycled like any other vehicle. Buses with no route
## near drive at random as before.
##
## How many are out follows the crowd rules: the share of the traffic pool the place and hour
## want (`AgentSystem.wanted_count`, `PlaceMap.area_counts`) applied to the bus agents, at least
## one while a route in service passes within `ROUTE_NEAR`. `request(route, stop)` sends a bus
## of that route towards a stop (the player waiting there): one is placed out of sight upstream.
##
## Runs on the AI thread inside `AgentSystem.update`; the game changes it only between steps
## (`CityLife.between_steps`) and reads `snapshot()` there. Pure logic, no nodes.

## Seconds a bus stands at a stop with its doors fully open (plus up to DWELL_SPREAD by bus).
const DWELL := 9.0
const DWELL_SPREAD := 6.0
## Seconds the doors take to open or close.
const DOOR_TIME := 1.2
## Longest a bus waits at the player's stop for them to board, seconds.
const HOLD_MAX := 30.0
## The bus keeps to the kerb this far before a stop, metres.
const KERB_BEFORE := 70.0
## A stop passed by more than this without stopping is given up, metres.
const MISSED := 4.0
## A route counts as near when its path passes this close to the player, metres.
const ROUTE_NEAR := 400.0
## A requested bus is put this far (by road) before the stop at most, metres.
const SEND_BACK := 900.0
## Path points closer than this are the same graph node (`RoadGraph` keys nodes to 10 cm).
const SAME_NODE := 0.25

const DRIVING := 0
const DWELLING := 1
const CLOSING := 2


class Follow:
	extends RefCounted
	var route: TransitNetwork.Route
	## Path segment the bus is on (path[seg] -> path[seg + 1]).
	var seg: int = 0
	## The next of the route's stops to call at (0..), stops.size() when none is left.
	var next_stop: int = 0
	var state: int = DRIVING
	var dwell: float = 0.0
	## 0 closed .. 1 open.
	var doors: float = 0.0
	## Doors held open (someone boarding) and how long it has been held.
	var held: bool = false
	var held_for: float = 0.0
	## The player is aboard: never recycled or put away.
	var carrying: bool = false
	## Metres along the route at the last step.
	var progress: float = 0.0


var network: TransitNetwork
## Game hour (set between steps).
var hour: float = 12.0
## Agent id -> its route.
var follows: Dictionary[int, Follow] = {}
## Bus agents by id, and how many of them should be out now.
var _buses: PackedInt32Array = PackedInt32Array()
var _want: int = 0
var _route_near: bool = false
## A bus sent towards a stop: route index, stop number on it; -1 none.
var _send_route: int = -1
var _send_stop: int = -1
var _sending: bool = false
var _sent_agent: int = -1


static func make(net: TransitNetwork) -> RouteBuses:
	var r := RouteBuses.new()
	r.network = net
	return r


# --- Commands (between steps) -----------------------------------------------------------------


## Send a bus of `route` to its stop number `stop` (the player waits there). Replaces any request.
func request(route: TransitNetwork.Route, stop: int) -> void:
	_send_route = route.index
	_send_stop = stop
	_sent_agent = -1


func cancel_request() -> void:
	_send_route = -1
	_send_stop = -1
	_sent_agent = -1


## The agent last sent by `request`, or -1.
func sent_agent() -> int:
	return _sent_agent


## Keep the doors of a bus standing at a stop open (boarding or alighting), or let it go.
func hold_doors(id: int, on: bool) -> void:
	var f: Follow = follows.get(id)
	if f != null:
		f.held = on
		if not on:
			f.held_for = 0.0


func set_carrying(id: int, on: bool) -> void:
	var f: Follow = follows.get(id)
	if f != null:
		f.carrying = on


## Put a bus straight at one of its route's stops, standing with the doors opening (fast travel).
## False when that stretch of road is not in the graph or not on loaded ground.
func jump_to_stop(system: AgentSystem, a: AgentSystem.Agent, stop: int) -> bool:
	var f: Follow = follows.get(a.id)
	if f == null or stop < 0 or stop >= f.route.stops.size():
		return false
	var k := system.kinds[a.kind]
	var d := maxf(0.0, f.route.stop_at[stop] - door_offset(k))
	var seg := f.route.segment_at(d)
	var e := edge_for(system.graph, f.route, seg)
	if e < 0 or not _ground(system, f.route.path[seg]) or not _ground(system, f.route.path[seg + 1]):
		return false
	var carrying := f.carrying
	system.put_on(a, e, d - f.route.run[seg])
	a.next = _route_next(system, f, seg)
	f.seg = seg
	f.next_stop = stop
	f.state = DWELLING
	f.dwell = _dwell_for(a)
	f.doors = 0.0
	f.carrying = carrying
	f.progress = d
	return true


# --- AgentRoutes ------------------------------------------------------------------------------


func before_update(system: AgentSystem, focus: Vector2) -> void:
	if network == null:
		return
	if _buses.is_empty():
		for a in system.agents:
			if system.is_bus(a):
				_buses.append(a.id)
	_route_near = false
	for i in range(0, network.route_segments_near(focus, ROUTE_NEAR).size(), 2):
		_route_near = true
		break
	var share := float(system.wanted_count()) / maxf(1.0, float(system.agents.size()))
	_want = 0
	if _route_near and not _buses.is_empty():
		_want = clampi(ceili(_buses.size() * share * 1.5), 1, _buses.size())
	_dispatch(system, focus)


func wants_out(_system: AgentSystem, a: AgentSystem.Agent) -> bool:
	if _want <= 0:
		return false
	var slot := _buses.find(a.id)
	return slot >= 0 and slot < _want


func place(system: AgentSystem, a: AgentSystem.Agent, focus: Vector2) -> bool:
	if network == null or not system.is_bus(a):
		return false
	if _sending and _send_route >= 0:
		_sending = false
		if _place_before_stop(system, a, focus, network.routes[_send_route], _send_stop):
			_sent_agent = a.id
			return true
	return _place_on_any(system, a, focus)


func placed_freely(a: AgentSystem.Agent) -> void:
	follows.erase(a.id)


func next_edge(system: AgentSystem, a: AgentSystem.Agent) -> int:
	var f: Follow = follows.get(a.id)
	if f == null:
		return -2
	var g := system.graph
	var from := g.node_pos[g.edge_from[a.edge]]
	var to := g.node_pos[g.edge_to[a.edge]]
	var found := -1
	for k in range(maxi(0, f.seg - 2), mini(f.route.path.size() - 1, f.seg + 6)):
		if f.route.path[k].distance_to(from) < SAME_NODE and f.route.path[k + 1].distance_to(to) < SAME_NODE:
			found = k
			break
	if found < 0:
		follows.erase(a.id)  # off its route (re-placed, or the graph changed): drives freely
		return -2
	f.seg = found
	return _route_next(system, f, found)


func stop_room(system: AgentSystem, a: AgentSystem.Agent, dt: float) -> float:
	var f: Follow = follows.get(a.id)
	if f == null:
		return INF
	var r := f.route
	var g := system.graph
	var dir := (r.path[f.seg + 1] - r.path[f.seg]).normalized() if f.seg + 1 < r.path.size() else Vector2.ZERO
	f.progress = r.run[f.seg] + (a.pos - r.path[f.seg]).dot(dir)
	if g == null:
		return INF
	match f.state:
		DWELLING:
			f.doors = minf(1.0, f.doors + dt / DOOR_TIME)
			if f.doors >= 1.0:
				if f.held and f.held_for < HOLD_MAX:
					f.held_for += dt
				else:
					f.dwell -= dt
			if f.dwell <= 0.0 and not f.held:
				f.state = CLOSING
			return 0.0
		CLOSING:
			f.doors = maxf(0.0, f.doors - dt / DOOR_TIME)
			if f.doors <= 0.0:
				f.state = DRIVING
				f.next_stop += 1
			return 0.0
	if f.next_stop >= r.stops.size():
		return INF
	var k := system.kinds[a.kind]
	var room := r.stop_at[f.next_stop] - door_offset(k) - f.progress
	if room < -MISSED:
		f.next_stop += 1
		return INF
	if room < 1.0 and a.speed < 0.35:
		f.state = DWELLING
		f.dwell = _dwell_for(a)
		return 0.0
	return maxf(0.0, room)


func kerb(a: AgentSystem.Agent) -> float:
	var f: Follow = follows.get(a.id)
	if f == null:
		return 0.0
	if f.state != DRIVING:
		return 1.0
	if f.next_stop < f.route.stops.size():
		var room := f.route.stop_at[f.next_stop] - f.progress
		if room < KERB_BEFORE and room > -MISSED:
			return 1.0
	return 0.0


func keeps(a: AgentSystem.Agent) -> bool:
	var f: Follow = follows.get(a.id)
	if f == null:
		return false
	# The bus sent to the player's stop stays out until the request ends.
	return f.carrying or f.state != DRIVING or f.held or (a.id == _sent_agent and _send_route >= 0)


# --- Reading (between steps) ------------------------------------------------------------------


## Per route bus: {route (index), doors, state, stop (the stop index it stands at or -1), next
## (the next stop's number), progress}. Copied for the views and the passenger ride.
func snapshot() -> Dictionary[int, Dictionary]:
	var out: Dictionary[int, Dictionary] = {}
	for id: int in follows:
		var f := follows[id]
		var at := -1
		if f.state != DRIVING and f.next_stop < f.route.stops.size():
			at = f.route.stops[f.next_stop]
		out[id] = {"route": f.route.index, "doors": f.doors, "state": f.state, "stop": at, "next": f.next_stop, "progress": f.progress, "carrying": f.carrying}
	return out


## Metres from a bus's middle to its front door (the stop pole stands by the door).
static func door_offset(k: AgentPresets.Kind) -> float:
	return k.half_length * 0.6


## The graph edge along a route's path segment, or -1.
static func edge_for(g: RoadGraph, r: TransitNetwork.Route, seg: int) -> int:
	if seg < 0 or seg + 1 >= r.path.size():
		return -1
	var n := g.node_at(r.path[seg])
	if n < 0:
		return -1
	for e in g.node_out[n]:
		if g.node_pos[g.edge_to[e]].distance_to(r.path[seg + 1]) < SAME_NODE:
			return e
	return -1


# --- Inside -----------------------------------------------------------------------------------


func _route_next(system: AgentSystem, f: Follow, seg: int) -> int:
	var k := seg + 1
	# Skip path points the graph merged into one node.
	while k + 1 < f.route.path.size() and f.route.path[k].distance_to(f.route.path[k + 1]) < SAME_NODE:
		k += 1
	if k + 1 >= f.route.path.size():
		return _end_trip(system, f)
	var e := edge_for(system.graph, f.route, k)
	if e < 0:
		return -2
	return e


## At the end of the route the agent's own edge (`AgentSystem` then re-places it); a bus carrying
## the player drives on freely (the ride ends at the last stop, `BusRide`).
func _end_trip(system: AgentSystem, f: Follow) -> int:
	for id: int in follows:
		if follows[id] == f:
			if f.carrying:
				return -2
			follows.erase(id)
			return system.agents[id].edge
	return -2


func _dwell_for(a: AgentSystem.Agent) -> float:
	return DWELL + DWELL_SPREAD * a.variation


func _ground(system: AgentSystem, p: Vector2) -> bool:
	return not system.ground_ready.is_valid() or system.ground_ready.call(p) == true


func _crowded(system: AgentSystem, a: AgentSystem.Agent, p: Vector2) -> bool:
	for other in system.agents:
		if other != a and other.active and other.pos.distance_to(p) < 14.0:
			return true
	return false


## On any route near the focus, in the spawn ring, on loaded ground (out of sight, as all spawns).
func _place_on_any(system: AgentSystem, a: AgentSystem.Agent, focus: Vector2) -> bool:
	var s := system.settings
	var pairs := network.route_segments_near(focus, s.spawn_max)
	if pairs.is_empty():
		return false
	for attempt in 24:
		var pick := floori(system.rng.next() * (pairs.size() / 2)) * 2
		var r := network.routes[pairs[pick]]
		var seg := pairs[pick + 1]
		if not TransitTimetable.in_service(r, hour):
			continue
		var m := (r.path[seg] + r.path[seg + 1]) * 0.5
		var dist := m.distance_to(focus)
		if dist < s.spawn_min or dist > s.spawn_max:
			continue
		if _put(system, a, r, seg, 0.5):
			return true
	return false


## Upstream of a stop, as far back as the spawn ring allows (out of sight of the player there).
func _place_before_stop(system: AgentSystem, a: AgentSystem.Agent, focus: Vector2, r: TransitNetwork.Route, stop: int) -> bool:
	if stop < 0 or stop >= r.stops.size():
		return false
	var s := system.settings
	var at := r.stop_at[stop]
	var d := at - 20.0
	while d > maxf(0.0, at - SEND_BACK):
		var p := r.point_at(d)
		var dist := p.distance_to(focus)
		if dist >= s.spawn_min and dist <= s.spawn_max:
			var seg := r.segment_at(d)
			var span := r.run[seg + 1] - r.run[seg]
			if span > 1.0 and _put(system, a, r, seg, clampf((d - r.run[seg]) / span, 0.05, 0.95)):
				return true
		d -= 15.0
	return false


func _put(system: AgentSystem, a: AgentSystem.Agent, r: TransitNetwork.Route, seg: int, t: float) -> bool:
	var e := edge_for(system.graph, r, seg)
	if e < 0:
		return false
	var p := r.path[seg].lerp(r.path[seg + 1], t)
	if not _ground(system, p) or not _ground(system, r.path[seg]) or not _ground(system, r.path[seg + 1]) or _crowded(system, a, p):
		return false
	var f := Follow.new()
	f.route = r
	f.seg = seg
	f.progress = r.run[seg] + system.graph.edge_length[e] * t
	f.next_stop = r.stops.size()
	for k in r.stops.size():
		if r.stop_at[k] > f.progress + 2.0:
			f.next_stop = k
			break
	follows[a.id] = f
	system.put_on(a, e, system.graph.edge_length[e] * t)
	var nxt := _route_next(system, f, seg)
	a.next = nxt if nxt >= 0 else system.graph.next_edge(e, system.rng)
	return true


func _dispatch(system: AgentSystem, focus: Vector2) -> void:
	if _send_route < 0 or _sent_agent >= 0:
		return
	var r := network.routes[_send_route]
	# A bus of the route already on its way to the stop will do.
	for id: int in follows:
		var f := follows[id]
		if f.route == r and f.next_stop <= _send_stop and r.stop_at[_send_stop] - f.progress < SEND_BACK:
			_sent_agent = id
			return
	# Else re-place a bus out of sight (or one put away).
	var best: AgentSystem.Agent = null
	for id in _buses:
		var a := system.agents[id]
		if keeps(a):
			continue
		if not a.active or a.pos.distance_to(focus) > 60.0:
			best = a
			break
	if best == null:
		return
	_sending = true
	system.replace(best, focus)
	_sending = false
