## A car that drives after a moving goal along the road graph (the Three.js `@cow/ai` Pursuer's
## job, G-419): a shortest route over the graph's nodes (A*, bounded), followed at a speed that
## slows for bends and for stopping short of the goal; and, when the goal is near and nothing
## solid is in the way (`clear`), straight at it. Pure logic on a `RoadGraph` (read-only, so it
## may be read while the AI thread runs its step: the graph itself is never changed after it is
## built); world metres, heading 0 towards -Z, positive turning left.
class_name Pursuer
extends RefCounted

## Metres from the goal under which the car drives straight at it when the way is clear.
const DIRECT_WITHIN := 40.0
## A waypoint counts as reached within this many metres.
const REACHED := 5.0
## Replan when the goal has moved this far from the planned one, or after this many seconds.
const REPLAN_MOVE := 25.0
const REPLAN_EVERY := 2.5
## m/s² up and down; turn rate (rad/s) at speed.
const ACCEL := 4.0
const BRAKE := 8.0
const TURN_RATE := 1.4
## Most nodes A* opens before it gives up (a goal across the city is out of reach).
const SEARCH_LIMIT := 4000
## Slowest speed through a sharp bend, m/s.
const BEND_SPEED := 6.0

var x := 0.0
var z := 0.0
var heading := 0.0
var speed := 0.0
## &"route", &"direct" or &"stopped" (no way to the goal).
var mode: StringName = &"stopped"
var route := PackedVector2Array()
var _next := 0
var _planned_goal := Vector2(INF, INF)
var _since_plan := 99.0


func _init(px: float = 0.0, pz: float = 0.0, h: float = 0.0) -> void:
	x = px
	z = pz
	heading = h


func position() -> Vector2:
	return Vector2(x, z)


## Forget the route (a teleport, a new goal far away).
func replan() -> void:
	route = PackedVector2Array()
	_next = 0
	_planned_goal = Vector2(INF, INF)
	_since_plan = 99.0


## One step towards `goal`. `stop_short` metres short of it (negative: drive through it, a ram);
## `clear(from: Vector2, to: Vector2) -> bool` says whether nothing solid lies between.
func update(dt: float, graph: RoadGraph, goal: Vector2, top_speed: float, stop_short: float, clear: Callable) -> void:
	_since_plan += dt
	var here := Vector2(x, z)
	var to_goal := here.distance_to(goal)
	var aim := goal
	var want := top_speed
	if to_goal < DIRECT_WITHIN and (not clear.is_valid() or bool(clear.call(here, goal))):
		mode = &"direct"
	elif graph != null and graph.node_count() > 1:
		if route.is_empty() or _since_plan > REPLAN_EVERY or _planned_goal.distance_to(goal) > REPLAN_MOVE or _next >= route.size():
			_plan(graph, here, goal)
		if route.is_empty():
			mode = &"direct" if to_goal < DIRECT_WITHIN * 2.0 else &"stopped"
		else:
			mode = &"route"
			while _next < route.size() - 1 and here.distance_to(route[_next]) < REACHED:
				_next += 1
			aim = route[_next]
			# Slow for the bend at the next waypoint.
			if _next < route.size() - 1:
				var a := (route[_next] - here).normalized()
				var b := (route[_next + 1] - route[_next]).normalized()
				var bend := acos(clampf(a.dot(b), -1.0, 1.0))
				var corner := lerpf(top_speed, BEND_SPEED, clampf(bend / 1.2, 0.0, 1.0))
				var d := here.distance_to(route[_next])
				want = minf(want, sqrt(corner * corner + 2.0 * BRAKE * 0.5 * d))
	else:
		mode = &"direct"
	if mode == &"stopped":
		want = 0.0
	if stop_short >= 0.0:
		var room := maxf(0.0, to_goal - stop_short)
		want = minf(want, sqrt(2.0 * BRAKE * 0.6 * room))
	# Steer towards the aim, turning no faster than the car can at this speed.
	var off := aim - here
	if off.length() > 0.05:
		var desired := atan2(-off.x, -off.y)
		var turn := wrapf(desired - heading, -PI, PI)
		var rate := TURN_RATE * clampf(speed / 4.0, 0.3, 1.0) * dt
		heading = wrapf(heading + clampf(turn, -rate, rate), -PI, PI)
		# Facing well away from the aim: slow down to turn.
		if absf(turn) > 1.2:
			want = minf(want, 5.0)
	speed = move_toward(speed, want, (ACCEL if want > speed else BRAKE) * dt)
	x += -sin(heading) * speed * dt
	z += -cos(heading) * speed * dt


func _plan(graph: RoadGraph, here: Vector2, goal: Vector2) -> void:
	_since_plan = 0.0
	_planned_goal = goal
	_next = 0
	route = PackedVector2Array()
	var a := nearest_node(graph, here)
	var b := nearest_node(graph, goal)
	if a < 0 or b < 0:
		return
	var nodes := find_route(graph, a, b, SEARCH_LIMIT)
	for n in nodes:
		route.append(graph.node_pos[n])
	if not route.is_empty():
		route.append(goal)


## The node nearest `p`, or -1 for an empty graph (a linear scan; called a few times a second).
static func nearest_node(graph: RoadGraph, p: Vector2) -> int:
	var best := -1
	var best_d := INF
	for i in graph.node_count():
		if graph.node_out[i].is_empty():
			continue
		var d := graph.node_pos[i].distance_squared_to(p)
		if d < best_d:
			best_d = d
			best = i
	return best


## Nodes from `a` to `b` along the graph's directed edges (A* on distance), or [] when there is
## no way within `limit` opened nodes.
static func find_route(graph: RoadGraph, a: int, b: int, limit: int = SEARCH_LIMIT) -> PackedInt32Array:
	if a == b:
		return PackedInt32Array([a])
	var goal := graph.node_pos[b]
	var cost: Dictionary[int, float] = {a: 0.0}
	var came: Dictionary[int, int] = {}
	var heap := _Heap.new()
	heap.push(a, graph.node_pos[a].distance_to(goal))
	var opened := 0
	while not heap.empty() and opened < limit:
		var n := heap.pop()
		if n == b:
			var out := PackedInt32Array([b])
			while came.has(n):
				n = came[n]
				out.append(n)
			out.reverse()
			return out
		opened += 1
		var base: float = cost[n]
		for e in graph.node_out[n]:
			var m := graph.edge_to[e]
			var c := base + graph.edge_length[e]
			if c < float(cost.get(m, INF)):
				cost[m] = c
				came[m] = n
				heap.push(m, c + graph.node_pos[m].distance_to(goal))
	return PackedInt32Array()


## Length of a route of nodes, metres.
static func route_length(graph: RoadGraph, nodes: PackedInt32Array) -> float:
	var total := 0.0
	for i in range(1, nodes.size()):
		total += graph.node_pos[nodes[i - 1]].distance_to(graph.node_pos[nodes[i]])
	return total


## A binary min-heap of (node, priority) in two packed arrays.
class _Heap:
	var nodes := PackedInt32Array()
	var keys := PackedFloat32Array()

	func empty() -> bool:
		return nodes.is_empty()

	func push(n: int, k: float) -> void:
		nodes.append(n)
		keys.append(k)
		var i := nodes.size() - 1
		while i > 0:
			var p := (i - 1) >> 1
			if keys[p] <= keys[i]:
				break
			_swap(i, p)
			i = p

	func pop() -> int:
		var top := nodes[0]
		var last := nodes.size() - 1
		_swap(0, last)
		nodes.resize(last)
		keys.resize(last)
		var i := 0
		while true:
			var l := i * 2 + 1
			var r := l + 1
			var m := i
			if l < last and keys[l] < keys[m]:
				m = l
			if r < last and keys[r] < keys[m]:
				m = r
			if m == i:
				break
			_swap(i, m)
			i = m
		return top

	func _swap(i: int, j: int) -> void:
		var n := nodes[i]
		nodes[i] = nodes[j]
		nodes[j] = n
		var k := keys[i]
		keys[i] = keys[j]
		keys[j] = k
