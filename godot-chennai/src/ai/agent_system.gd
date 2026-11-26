class_name AgentSystem
extends RefCounted
## Road-following agents (port of `ai/src/Agents.ts`): traffic vehicles and pedestrians share
## this logic and differ only in their settings (`AgentPresets`). Each agent steers towards a
## "carrot" a few metres ahead in its lane, slows for anything in its path (other agents, the
## player, people on the road), stops at red lights and for people on zebra crossings
## (`TrafficSignals`), and takes turns through junctions: a vehicle claims a junction before it
## enters and waits while someone whose path crosses its own is inside. Agents far from the
## player are recycled to the spawn ring round them, so a small pool fills the streets.
##
## Lanes (Godot addition, G-121): a road's lanes each way come from the map (`CityLayout.
## lane_count`); each vehicle keeps a lane of its own (by its variation), one-way streets use
## the whole carriageway, so two vehicles side by side on a wide road do not block each other.
##
## `ground_ready(Vector2) -> bool` (optional) keeps agents off ground that has not loaded: no
## spawning there, and an agent whose next stretch is not loaded is re-placed (G-123).
##
## Pure logic: no nodes, no physics.

## How far towards the kerb traffic moves for a siren, metres.
const PULL_OVER := 1.8
const SIREN_RANGE := 55.0
const YIELD_SPEED := 2.0
## Stop lines further than this are ignored, metres.
const SIGNAL_RANGE := 50.0
## Where the steering axle sits, as a share of the half length ahead of the middle.
const FRONT_AXLE := 0.65
## A vehicle in a junction that has not moved for this long no longer holds others back, s.
const JAMMED := 4.0
const FLEE_SPEED := 3.8
const STEP_BACK := 1.2
const STEP_BACK_SPEED := 1.5
## Side of a spawn cell, metres.
const CELL := 100.0
const TURN_LEFT := -1
const TURN_STRAIGHT := 0
const TURN_RIGHT := 1
## Walkers step aside for someone in their way this far ahead (plus their speed), metres.
const DODGE_AHEAD := 3.5
## Furthest a walker steps out of its line, metres, and how fast, m/s.
const DODGE_MAX := 1.3
const DODGE_RATE := 1.1
## Room kept between two people passing, metres.
const PASSING_ROOM := 0.3
## Side of the broad phase's squares, metres.
const BUCKET := 16.0


class Agent:
	extends RefCounted
	var id: int = 0
	## Stable 0..1 number, for picking a model, colour, lane and pace.
	var variation: float = 0.0
	## Index into the system's `kinds`.
	var kind: int = 0
	## False while put away (quiet streets): not moved, not drawn, not in the way.
	var active: bool = true
	var pos: Vector2 = Vector2.ZERO
	## Height of the road surface under the agent, metres (decks and ramps, G-122).
	var y: float = 0.0
	## Radians, 0 = towards -Z, positive turning left.
	var heading: float = 0.0
	var speed: float = 0.0
	## Changes whenever the agent is moved to a new place (snap visuals instead of gliding).
	var generation: int = 0
	var pull_over: float = 0.0
	var edge: int = 0
	var next: int = 0
	var stuck: float = 0.0
	## Held at a stop line this step, or queued behind someone who is.
	var at_signal: bool = false
	var giving_way: bool = false
	## Braking for the player or an obstacle this step.
	var blocked_by_obstacle: bool = false
	## Walkers: metres stepped to the left (negative: right) of their line to pass someone.
	var dodge: float = 0.0


class Fear:
	extends RefCounted
	var at: Vector2
	var facing: bool = false
	var left: float = 0.0
	var back: float = 0.0


var settings: AgentPresets.Settings
var kinds: Array[AgentPresets.Kind] = []
var agents: Array[Agent] = []
var graph: RoadGraph
var bounds: Rect2
var signals: TrafficSignals = null
var ground_ready: Callable = Callable()
## Optional: called (with the method's name) by every method that changes agents from outside the
## step (hold, let_go, move_agent, place_at, slow, scare). The owner that steps this system on
## another thread checks there that no step is running (`CityLife`, G-364): a change made while
## the step iterates the same agents and dictionaries crashes that thread.
var on_change: Callable = Callable()
var rng: AiRandom
var _weights: PackedFloat32Array = PackedFloat32Array()
var _cells: Dictionary[Vector2i, PackedInt32Array] = {}
var _pool_key: Vector2i = Vector2i(-999999, -999999)
var _pool_edges: PackedInt32Array = PackedInt32Array()
var _pool_cumulative: PackedFloat64Array = PackedFloat64Array()
var _radius: PackedFloat32Array = PackedFloat32Array()
## node -> Array of claims [agent, dir: Vector2, turn]
var _claims: Dictionary[int, Array] = {}
var _holding: Array[PackedInt32Array] = []
var _wanted: int = 0
var _retire_now := false
var _held: Dictionary[int, bool] = {}
var _slowed: Dictionary[int, Vector2] = {}
var _fears: Dictionary[int, Fear] = {}
## The longest half length of any kind (the broad phase of the path check).
var _longest: float = 0.0
## Fixed routes for some agents (bus routes, G-214); null: everyone turns at random as before.
var routes: AgentRoutes = null


func _init(g: RoadGraph, world_bounds: Rect2, s: AgentPresets.Settings, seed_value: int = 1) -> void:
	settings = s
	bounds = world_bounds
	rng = AiRandom.new(seed_value)
	kinds = s.kinds
	for k in kinds:
		_longest = maxf(_longest, k.half_length)
	graph = g
	_wanted = 0 if g.edge_count() == 0 else s.count
	if g.edge_count() == 0:
		return
	_index(g)
	for id in s.count:
		var a := Agent.new()
		a.id = id
		a.variation = rng.next()
		a.kind = _kind_for(id)
		agents.append(a)
		_holding.append(PackedInt32Array())


## Kind for an agent id: a low-discrepancy spread, so every stretch of ids is mixed.
func _kind_for(id: int) -> int:
	var total := 0.0
	for k in kinds:
		total += k.share
	var v := fposmod(id * 0.6180339887, 1.0) * total
	var sum := 0.0
	for i in kinds.size():
		sum += kinds[i].share
		if v < sum:
			return i
	return kinds.size() - 1


func _index(g: RoadGraph) -> void:
	graph = g
	_radius = TrafficSignals.junction_radii(g) if settings.takes_turns else PackedFloat32Array()
	if not settings.takes_turns:
		_radius.resize(g.node_count())
	_cells.clear()
	_pool_key = Vector2i(-999999, -999999)
	for e in g.edge_count():
		var m := g.middle(e)
		var key := Vector2i(floori(m.x / CELL), floori(m.y / CELL))
		if not _cells.has(key):
			_cells[key] = PackedInt32Array()
		_cells[key].append(e)


## Move to a new road graph (the roads round a new area) without disturbing anyone: every agent
## keeps the stretch it is on, found in the new graph by its end points; agents whose road is not
## there are re-placed round `focus`. Junction claims start afresh; spawn weights are set again.
func rebase(g: RoadGraph, focus: Vector2) -> void:
	if g.edge_count() == 0 or agents.is_empty():
		return
	var old := graph
	var moved: Array[Vector2i] = []
	for a in agents:
		moved.append(Vector2i(_find_edge(g, old, a.edge), _find_edge(g, old, a.next)))
	_claims.clear()
	for i in _holding.size():
		_holding[i] = PackedInt32Array()
	_weights = PackedFloat32Array()
	_index(g)
	for i in agents.size():
		var a := agents[i]
		if moved[i].x < 0:
			if a.active:
				_place(a, focus, false)
			else:
				a.edge = 0
				a.next = 0
			continue
		a.edge = moved[i].x
		a.next = moved[i].y if moved[i].y >= 0 else _next_of(a)


static func _find_edge(g: RoadGraph, old: RoadGraph, e: int) -> int:
	if e < 0 or e >= old.edge_count():
		return -1
	return g.edge_between(g.node_at(old.node_pos[old.edge_from[e]]), g.node_at(old.node_pos[old.edge_to[e]]))


func use_signals(s: TrafficSignals) -> void:
	signals = s


func set_spawn_weights(w: PackedFloat32Array) -> void:
	_weights = w if w.size() == graph.edge_count() else PackedFloat32Array()
	_pool_key = Vector2i(-999999, -999999)


## How many agents should be out. Extra ones are put away once out of sight (or at once).
func set_active_count(count: int, immediately: bool = false) -> void:
	_wanted = clampi(count, 0, agents.size())
	if immediately:
		_retire_now = true


func active_count() -> int:
	var n := 0
	for a in agents:
		if a.active:
			n += 1
	return n


func wanted_count() -> int:
	return _wanted


## Put every agent on the map round a point. Call once before the first update.
func populate(focus: Vector2) -> void:
	for a in agents:
		if a.active:
			_place(a, focus, true)


## Metres to the left of the centre line for an agent on an edge: its own lane.
func lane_offset(a: Agent, e: int) -> float:
	return settings.lane(graph, e, a.variation) + a.pull_over * PULL_OVER + a.dodge


func _pool_at(focus: Vector2) -> void:
	var c := Vector2i(floori(focus.x / CELL), floori(focus.y / CELL))
	if c == _pool_key:
		return
	_pool_key = c
	var reach := ceili(settings.spawn_max / CELL) + 1
	_pool_edges = PackedInt32Array()
	for i in range(-reach, reach + 1):
		for k in range(-reach, reach + 1):
			_pool_edges.append_array(_cells.get(c + Vector2i(i, k), PackedInt32Array()))
	_pool_cumulative = PackedFloat64Array()
	_pool_cumulative.resize(_pool_edges.size())
	var sum := 0.0
	for i in _pool_edges.size():
		sum += maxf(0.0, _weights[_pool_edges[i]]) if not _weights.is_empty() else 1.0
		_pool_cumulative[i] = sum


func _pick_edge(focus: Vector2) -> int:
	_pool_at(focus)
	var total := _pool_cumulative[_pool_cumulative.size() - 1] if not _pool_cumulative.is_empty() else 0.0
	if total <= 0.0:
		return floori(rng.next() * graph.edge_count())
	var r := rng.next() * total
	var lo := 0
	var hi := _pool_cumulative.size() - 1
	while lo < hi:
		var mid := (lo + hi) >> 1
		if _pool_cumulative[mid] > r:
			hi = mid
		else:
			lo = mid + 1
	return _pool_edges[lo]


func _ready_at(p: Vector2) -> bool:
	return not ground_ready.is_valid() or ground_ready.call(p) == true


## Move an agent to a random stretch of road in the spawn ring round the focus. Returns false
## (and puts the agent away) when no stretch on loaded ground was found.
func _place(a: Agent, focus: Vector2, any_distance: bool) -> bool:
	_release_all(a)
	if routes != null:
		if routes.place(self, a, focus):
			return true
		routes.placed_freely(a)
	var chosen := -1
	var chosen_t := 0.5
	for attempt in 40:
		var e := _pick_edge(focus)
		var length := graph.edge_length[e]
		if length < 6.0:
			continue
		var t := 0.3 + rng.next() * 0.4
		var m := graph.point_on(e, length * t)
		if not bounds.grow(-15.0).has_point(m):
			continue
		var distance := m.distance_to(focus)
		var minimum := settings.spawn_min * 0.4 if any_distance else settings.spawn_min
		if distance < minimum or distance > settings.spawn_max:
			continue
		var s := length * t
		if s < _radius[graph.edge_from[e]] + 2.0 or length - s < _radius[graph.edge_to[e]] + 2.0:
			continue
		var crowded := false
		for other in agents:
			if other != a and other.active and other.pos.distance_to(m) < 12.0:
				crowded = true
				break
		if crowded or not _ready_at(m) or not _ready_at(graph.node_pos[graph.edge_to[e]]) or not _ready_at(graph.node_pos[graph.edge_from[e]]):
			continue
		chosen = e
		chosen_t = t
		break
	if chosen < 0:
		# Nowhere on loaded ground: wait out of the way until the next try.
		a.active = false
		a.speed = 0.0
		a.generation += 1
		return false
	put_on(a, chosen, graph.edge_length[chosen] * chosen_t)
	a.next = graph.next_edge(chosen, rng)
	return true


## Put an agent on stretch `e`, `along` metres down it, in its lane, standing (the caller sets
## `a.next`). For `AgentRoutes.place` and the usual placing.
func put_on(a: Agent, e: int, along: float) -> void:
	a.active = true
	a.pull_over = 0.0
	a.dodge = 0.0
	a.edge = e
	a.next = e
	a.pos = graph.point_on(e, along, lane_offset(a, e))
	a.heading = graph.heading(e)
	a.y = graph.height_on(e, along)
	a.speed = 0.0
	a.stuck = 0.0
	a.generation += 1
	_slowed.erase(a.id)
	_fears.erase(a.id)


## Move an agent to a new place round `focus` now (as when it is recycled). For `AgentRoutes`.
func replace(a: Agent, focus: Vector2) -> bool:
	return _place(a, focus, false)


## True when the agent's kind is a bus (`Kind.group`).
func is_bus(a: Agent) -> bool:
	return kinds[a.kind].group == &"bus"


func _next_of(a: Agent) -> int:
	if routes != null:
		var e := routes.next_edge(self, a)
		if e != -2:
			return e
	return graph.next_edge(a.edge, rng)


## Hold an agent still where it is (someone knocked down, a vehicle being taken): not steered,
## moved, recycled or put away until let go. It stays in everyone's way.
func _changing(what: StringName) -> void:
	if on_change.is_valid():
		on_change.call(what)


func hold(a: Agent) -> void:
	_changing(&"hold")
	_held[a.id] = true
	_release_all(a)
	a.speed = 0.0
	a.stuck = 0.0
	_fears.erase(a.id)


func is_held(a: Agent) -> bool:
	return _held.has(a.id)


## Let a held agent go: it carries on from where it is, or with `respawn` is moved to a new
## place out of sight round `near`.
func let_go(a: Agent, respawn: bool = false, near: Vector2 = Vector2.ZERO) -> void:
	_changing(&"let_go")
	_held.erase(a.id)
	if respawn and a.active and graph.edge_count() > 0:
		_place(a, near, false)


## Put an agent at a point at once (its road stays the same).
func move_agent(a: Agent, p: Vector2, heading: float) -> void:
	_changing(&"move_agent")
	a.pos = p
	a.heading = heading
	a.generation += 1


## Put an agent at a point on the nearest stretch of road (within ~100 m), going the way of
## that stretch closest to `heading` (a driver pulled out of a taken car). Lets go of a held agent.
func place_at(a: Agent, p: Vector2, heading: float) -> void:
	_changing(&"place_at")
	if graph.edge_count() == 0:
		return
	var f := Vector2(-sin(heading), -cos(heading))
	var c := Vector2i(floori(p.x / CELL), floori(p.y / CELL))
	var best := -1
	var best_score := INF
	for i in range(-1, 2):
		for j in range(-1, 2):
			for e: int in _cells.get(c + Vector2i(i, j), PackedInt32Array()):
				var from := graph.node_pos[graph.edge_from[e]]
				var d := graph.edge_dir[e]
				var s := clampf((p - from).dot(d), 0.0, graph.edge_length[e])
				var score := (from + d * s).distance_to(p) - d.dot(f)
				if score < best_score:
					best_score = score
					best = e
	_held.erase(a.id)
	_release_all(a)
	if best >= 0:
		a.edge = best
		a.next = graph.next_edge(best, rng)
	a.active = true
	a.pos = p
	a.heading = heading
	a.stuck = 0.0
	a.generation += 1


## Keep an agent below `speed` m/s for `seconds` (limping).
func slow(a: Agent, speed: float, seconds: float) -> void:
	_changing(&"slow")
	_slowed[a.id] = Vector2(speed, seconds)


func speed_limit(a: Agent) -> float:
	return _slowed[a.id].x if _slowed.has(a.id) else INF


## Something frightening at `at`: agents within `radius` react for `seconds`. Those walking
## towards it stop and step back; the others run off along their way.
func scare(at: Vector2, radius: float, seconds: float) -> void:
	_changing(&"scare")
	for a in agents:
		if not a.active or _held.has(a.id):
			continue
		var r := at - a.pos
		if r.length() > radius:
			continue
		var fear := Fear.new()
		fear.at = at
		fear.facing = r.dot(Vector2(-sin(a.heading), -cos(a.heading))) > 0.0
		fear.left = seconds
		fear.back = STEP_BACK if fear.facing else 0.0
		_fears[a.id] = fear


func is_scared(a: Agent) -> bool:
	return _fears.has(a.id)


## The steering target: `look_ahead` metres further along the route, in the agent's lane,
## measured from the front axle.
func _carrot(a: Agent, front: Vector2) -> Vector2:
	var e := a.edge
	var from := graph.node_pos[graph.edge_from[e]]
	var along := (front - from).dot(graph.edge_dir[e]) + settings.look_ahead
	var following := a.next
	# Look round the corner only when the route carries on roughly forwards (a target on a
	# stretch that doubles back would circle the agent).
	var gentle := graph.edge_dir[e].dot(graph.edge_dir[following]) > 0.3
	if along > graph.edge_length[e] and following != e and gentle:
		along -= graph.edge_length[e]
		e = following
	return graph.point_on(e, minf(along, graph.edge_length[e]), lane_offset(a, e))


## Speed that brings the front to a halt `room` metres ahead.
func _stop_speed(room: float) -> float:
	var left := room - 0.3
	return 0.0 if left <= 0.05 else sqrt(settings.braking * left)


## Distance from the agent's front to a stop line it must stop at, or INF.
func _signal_stop(a: Agent, k: AgentPresets.Kind, along: float) -> float:
	if signals == null:
		return INF
	var remaining := graph.edge_length[a.edge] - along
	var approach := signals.approach_on(a.edge)
	var to_line := 0.0
	if approach != null:
		to_line = remaining - approach.stop_back
	else:
		if a.next == a.edge:
			return INF
		approach = signals.approach_on(a.next)
		if approach == null:
			return INF
		to_line = remaining + graph.edge_length[a.next] - approach.stop_back
	var nose := to_line - k.half_length
	if nose < 0.0 or nose > SIGNAL_RANGE:
		return INF
	return nose if signals.must_stop(approach, a.speed, nose, settings.braking) else INF


func _turn_of(e: int, n: int) -> int:
	var d := graph.edge_dir[e]
	var nd := graph.edge_dir[n]
	if d.dot(nd) < -0.7:
		return TURN_RIGHT
	var cross := d.x * nd.y - d.y * nd.x
	if cross > 0.35:
		return TURN_RIGHT
	if cross < -0.35:
		return TURN_LEFT
	return TURN_STRAIGHT


func _compatible(node: int, a: Agent, d: Vector2, turn: int) -> bool:
	for claim: Array in _claims.get(node, []):
		var other: Agent = claim[0]
		if other == a or other.stuck > JAMMED:
			continue
		var dot := d.dot(claim[1] as Vector2)
		if dot > 0.7:
			continue
		if dot < -0.7 and turn != TURN_RIGHT and int(claim[2]) != TURN_RIGHT:
			continue
		return false
	return true


func _release(a: Agent, node: int) -> void:
	var list: Array = _claims.get(node, [])
	for i in list.size():
		if (list[i] as Array)[0] == a:
			list.remove_at(i)
			break
	if list.is_empty():
		_claims.erase(node)
	var held := _holding[a.id]
	var k := held.find(node)
	if k >= 0:
		held.remove_at(k)
		_holding[a.id] = held


func _release_all(a: Agent) -> void:
	if a.id >= _holding.size():
		return
	for node in _holding[a.id].duplicate():
		_release(a, node)


func _release_passed(a: Agent, k: AgentPresets.Kind) -> void:
	var held := _holding[a.id].duplicate()
	for n in held:
		if n == graph.edge_to[a.edge]:
			continue
		if a.pos.distance_to(graph.node_pos[n]) > _radius[n] + k.half_length + 0.5:
			_release(a, n)


## Distance from the front to a junction it must wait at, or INF; claims it when free.
func _junction_gate(a: Agent, k: AgentPresets.Kind, along: float, may_enter: bool) -> float:
	var e := a.edge
	var n := graph.edge_to[e]
	var r := _radius[n]
	if r == 0.0 or _holding[a.id].has(n) or a.next == e:
		return INF
	var nose := graph.edge_length[e] - along - r - k.half_length
	if nose > 1.5 + a.speed * a.speed / settings.braking:
		return INF
	if not may_enter and nose > 0.0:
		return INF
	var turn := _turn_of(e, a.next)
	if nose < -0.5 or _compatible(n, a, graph.edge_dir[e], turn):
		if not _claims.has(n):
			_claims[n] = []
		_claims[n].append([a, graph.edge_dir[e], turn])
		_holding[a.id].append(n)
		return INF
	return maxf(0.0, nose)


func _apply_active(focus: Vector2) -> void:
	var retire_beyond := settings.retire_beyond
	for a in agents:
		var wanted := a.id < _wanted or (routes != null and (routes.wants_out(self, a) or routes.keeps(a)))
		if wanted and not a.active:
			_place(a, focus, _retire_now)
		elif not wanted and a.active and not _held.has(a.id) and (_retire_now or a.pos.distance_to(focus) > retire_beyond):
			a.active = false
			a.speed = 0.0
			a.at_signal = false
			a.giving_way = false
			_release_all(a)
			a.generation += 1
	_retire_now = false


## Advance every agent one step. `obstacles`: Vector3(x, z, radius) things to stop for besides
## other agents (the player, parked vehicles, people on the road); `siren`: Vector3(x, z,
## heading) of an emergency vehicle traffic pulls over for, or null.
func update(dt: float, obstacles: PackedVector3Array, focus: Vector2, siren: Variant = null) -> void:
	if routes != null:
		routes.before_update(self, focus)
	_apply_active(focus)
	# Broad phase (G-127): obstacles and agents by BUCKET-metre square, so each agent looks only
	# at those in the squares its reach touches, not at everyone.
	var obstacle_cells := _bucket_points(obstacles)
	var biggest := 0.0
	for o in obstacles:
		biggest = maxf(biggest, o.z)
	var agent_cells: Dictionary[Vector2i, Array] = {}
	for other in agents:
		if other.active:
			var key := Vector2i(floori(other.pos.x / BUCKET), floori(other.pos.y / BUCKET))
			if not agent_cells.has(key):
				agent_cells[key] = []
			agent_cells[key].append(other)
	var near_obstacles := PackedVector3Array()
	var near_agents: Array[Agent] = []
	for a in agents:
		if not a.active or _held.has(a.id):
			continue
		var k := kinds[a.kind]
		var e := a.edge
		var from := graph.node_pos[graph.edge_from[e]]
		var f := Vector2(-sin(a.heading), -cos(a.heading))
		# The nearest thing in the path: distance from the front to its near side.
		var reach := k.gap + a.speed * 1.1 + 2.0 + k.half_length
		var clear := INF
		var blocker: Agent = null
		var by_obstacle := false
		var walker := not settings.vehicles
		var step_to := 0.0
		var stepping := false
		var look := reach + maxf(_longest, biggest) + DODGE_AHEAD + 1.0
		var c0 := Vector2i(floori((a.pos.x - look) / BUCKET), floori((a.pos.y - look) / BUCKET))
		var c1 := Vector2i(floori((a.pos.x + look) / BUCKET), floori((a.pos.y + look) / BUCKET))
		near_obstacles.clear()
		near_agents.clear()
		for cx in range(c0.x, c1.x + 1):
			for cz in range(c0.y, c1.y + 1):
				var key := Vector2i(cx, cz)
				for i: int in obstacle_cells.get(key, PackedInt32Array()):
					near_obstacles.append(obstacles[i])
				near_agents.append_array(agent_cells.get(key, []))
		for o in near_obstacles:
			var r := Vector2(o.x, o.y) - a.pos
			var ahead := r.dot(f)
			if ahead <= 0.0 or ahead > reach + o.z:
				continue
			var lateral := r.x * f.y - r.y * f.x
			if walker and ahead > o.z + k.half_length + 0.15:
				var aside := _aside(a, k.half_width + o.z + PASSING_ROOM, lateral, ahead)
				if aside != INF:
					step_to = aside if not stepping or absf(aside) > absf(step_to) else step_to
					stepping = true
				continue
			if absf(lateral) >= k.half_width + o.z or ahead - o.z - k.half_length >= clear:
				continue
			clear = ahead - o.z - k.half_length
			by_obstacle = true
		# Nobody further than this can be in the way this step (a bus's half length plus reach).
		var near_sq := (reach + _longest + DODGE_AHEAD) * (reach + _longest + DODGE_AHEAD)
		for other in near_agents:
			if other == a or not other.active or other.pos.distance_squared_to(a.pos) > near_sq:
				continue
			var c := cos(other.heading - a.heading)
			if walker and (c < 0.0 or other.speed < a.speed * 0.7 or a.pos.distance_squared_to(other.pos) < 1.0):
				# Someone coming the other way, dawdling ahead, or walking close abreast: step clear.
				var rw := other.pos - a.pos
				var ahead_w := rw.dot(f)
				var room := k.half_width + kinds[other.kind].half_width + PASSING_ROOM
				if ahead_w > -room and ahead_w < DODGE_AHEAD + a.speed:
					var aside_w := _aside(a, room, rw.x * f.y - rw.y * f.x, ahead_w + room)
					if aside_w != INF:
						step_to = aside_w if not stepping or absf(aside_w) > absf(step_to) else step_to
						stepping = true
					continue
			if c < 0.0 and not settings.stops_for_oncoming:
				continue
			var theirs := kinds[other.kind]
			var ac := absf(c)
			var as_ := absf(sin(other.heading - a.heading))
			var depth := ac * theirs.half_length + as_ * theirs.half_width
			var side := as_ * theirs.half_length + ac * theirs.half_width
			var r := other.pos - a.pos
			var ahead := r.dot(f)
			if ahead <= 0.0 or ahead > reach + depth:
				continue
			var offset := absf(r.x * f.y - r.y * f.x)
			if offset >= k.half_width + side or ahead - depth - k.half_length >= clear:
				continue
			clear = ahead - depth - k.half_length
			blocker = other
			by_obstacle = false
		a.blocked_by_obstacle = by_obstacle
		if walker:
			var goal := step_to if stepping else 0.0
			a.dodge += clampf(goal - a.dodge, -DODGE_RATE * dt, DODGE_RATE * dt)
		var target := minf(k.max_speed, settings.speed(graph, e, a.variation) * k.speed_factor)
		if clear < INF:
			target = 0.0 if clear <= k.gap else minf(target, (clear - k.gap) * 1.2)
		var along := (a.pos - from).dot(graph.edge_dir[e])
		var line := _signal_stop(a, k, along)
		if line < INF:
			target = minf(target, _stop_speed(line))
		a.at_signal = line < INF or (blocker != null and blocker.at_signal and clear < k.gap + 3.0)
		var kerb := 0.0
		if routes != null:
			var room := routes.stop_room(self, a, dt)
			if room < INF:
				target = minf(target, _stop_speed(room))
			kerb = routes.kerb(a)
		if settings.takes_turns:
			if not _holding[a.id].is_empty():
				_release_passed(a, k)
			var box := _junction_gate(a, k, along, line == INF) if _radius[graph.edge_to[e]] > 0.0 else INF
			a.giving_way = box < INF
			if a.giving_way:
				target = minf(target, _stop_speed(box))
		var yielding := false
		if siren != null:
			var sv: Vector3 = siren
			var rs := a.pos - Vector2(sv.x, sv.y)
			var ahead_s := rs.dot(Vector2(-sin(sv.z), -cos(sv.z)))
			yielding = ahead_s > -4.0 and rs.length() < SIREN_RANGE
		a.pull_over += clampf(maxf(1.0 if yielding else 0.0, kerb) - a.pull_over, -dt, dt)
		if yielding:
			target = minf(target, YIELD_SPEED)
		var slowed := _slowed.has(a.id)
		if slowed:
			var sl := _slowed[a.id]
			target = minf(target, sl.x)
			sl.y -= dt
			if sl.y <= 0.0:
				_slowed.erase(a.id)
			else:
				_slowed[a.id] = sl
		var fear: Fear = _fears.get(a.id)
		if fear != null:
			if fear.facing:
				target = 0.0
				if fear.back > 0.0:
					var away := a.pos - fear.at
					var dist := away.length()
					if dist < 0.001:
						away = Vector2(1, 0)
						dist = 1.0
					var step := minf(fear.back, STEP_BACK_SPEED * dt)
					a.pos += away / dist * step
					fear.back -= step
			elif not slowed and clear == INF:
				target = maxf(target, FLEE_SPEED)
			fear.left -= dt
			if fear.left <= 0.0:
				_fears.erase(a.id)
		var rate := settings.acceleration * k.acceleration_factor if target > a.speed else settings.braking
		a.speed += clampf(target - a.speed, -rate * dt, rate * dt)
		# Steer towards the carrot, gently when barely moving so stopped agents don't spin.
		var axle := k.half_length * FRONT_AXLE
		var front := a.pos + f * axle
		var carrot := _carrot(a, front)
		var wanted := atan2(-(carrot.x - front.x), -(carrot.y - front.y))
		var diff := wrapf(wanted - a.heading, -PI, PI)
		var turn := settings.turn_rate * dt * minf(1.0, a.speed / 1.5 + 0.15)
		a.heading += clampf(diff, -turn, turn)
		if absf(diff) > 0.5:
			a.speed = minf(a.speed, maxf(1.2, target * 0.45))
		a.pos += Vector2(-sin(a.heading), -cos(a.heading)) * a.speed * dt
		a.y = graph.height_on(a.edge, (a.pos - graph.node_pos[graph.edge_from[a.edge]]).dot(graph.edge_dir[a.edge]))
		# Reached the end of this stretch (by the front axle, which steers): carry on.
		var moved := (a.pos - from).dot(graph.edge_dir[e]) + axle
		if moved >= graph.edge_length[e] - 1.0:
			if a.next == a.edge or not _ready_at(graph.node_pos[graph.edge_to[a.next]]):
				_place(a, focus, false)
				continue
			a.edge = a.next
			a.next = _next_of(a)
		# Recycle agents far away, or jammed a long time out of sight (waiting at lights is not jammed).
		var kept := routes != null and routes.keeps(a)
		a.stuck = a.stuck + dt if a.speed < 0.2 and not a.at_signal and fear == null and not kept else 0.0
		var distance := a.pos.distance_to(focus)
		if not kept and (distance > settings.despawn or (a.stuck > 8.0 and distance > 45.0)):
			_place(a, focus, false)


## Where a walker should stand across its line (its `dodge`, metres to the left) to pass someone
## `lateral` metres to its left (negative: right) and `ahead` metres in front with `room` between
## centres, or INF when there is room already. India keeps left: someone dead ahead is passed
## on the left; someone already to one side, on the other.
func _aside(a: Agent, room: float, lateral: float, ahead: float) -> float:
	if absf(lateral) >= room or ahead <= 0.0:
		return INF
	var side := -1.0 if lateral >= 0.0 else 1.0
	return clampf(a.dodge + side * (room - absf(lateral)), -DODGE_MAX, DODGE_MAX)


static func _bucket_points(points: PackedVector3Array) -> Dictionary[Vector2i, PackedInt32Array]:
	var cells: Dictionary[Vector2i, PackedInt32Array] = {}
	for i in points.size():
		var key := Vector2i(floori(points[i].x / BUCKET), floori(points[i].y / BUCKET))
		if not cells.has(key):
			cells[key] = PackedInt32Array()
		cells[key].append(i)
	return cells


## Active agents' positions (for crossings and the sound of traffic).
func positions() -> PackedVector2Array:
	var out := PackedVector2Array()
	for a in agents:
		if a.active:
			out.append(a.pos)
	return out
