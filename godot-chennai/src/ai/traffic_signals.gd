class_name TrafficSignals
extends RefCounted
## Traffic signals at the main junctions and the zebra crossings in front of them (port of
## `ai/src/Signals.ts`). A junction gets signals where three or more roads meet and one is a main
## road, or near a mapped OSM `highway=traffic_signals` node (the world index's `signals`). Nodes
## a few metres apart are one junction. The arms are split into two groups by direction, which
## take turns: green, amber, a moment of all-red. Each junction starts its cycle at its own time.
##
## Every signalled arm has a stop line and, just beyond it, a zebra crossing where people walking
## along the cross road step over this one. Traffic stops at the line on red, on amber when it
## can stop comfortably, and whenever someone is on the crossing. Pure logic.

const GREEN := 0
const AMBER := 1
const RED := 2
## Seconds of green per group, amber, and all-red between them.
const TIMING := {"green": 12.0, "amber": 3.0, "all_red": 1.0}
## Depth of a zebra crossing along the road, metres.
const ZEBRA_DEPTH := 3.0
## People walk this far outside the kerb (matches the pedestrian lane).
const VERGE_WALK := 1.4
const LINE_GAP := 1.0
## Signal nodes closer than this are one junction, metres.
const CLUSTER := 16.0
const MAX_STOP_BACK := 16.0
## A junction this close to a mapped traffic_signals node is signalled whatever its roads.
const MAPPED_REACH := 20.0


## One signalled arm: an incoming edge, its stop line and crossing.
class Approach:
	extends RefCounted
	var index: int = 0
	var junction: int = 0
	var edge: int = 0
	var group: int = 0
	## Distance of the stop line before the end of `edge`, metres.
	var stop_back: float = 0.0
	## The stop line's point on the centre line and the direction of travel towards the junction.
	var point: Vector2
	var dir: Vector2
	var width: float = 0.0
	## Centre of the zebra; its depth along the road and span across it.
	var crossing: Vector2
	var depth: float = ZEBRA_DEPTH
	var span: float = 0.0


class Junction:
	extends RefCounted
	var id: int = 0
	var point: Vector2
	var nodes: PackedInt32Array
	var approaches: Array[Approach] = []
	## Seconds added to the clock, so neighbours change at different times.
	var offset: float = 0.0
	## Whether a mapped OSM signal is near (else the junction qualified by its roads).
	var mapped: bool = false


var junctions: Array[Junction] = []
var approaches: Array[Approach] = []
## Seconds since the signals were switched on.
var time: float = 0.0
var cycle: float = 0.0
var _by_edge: Dictionary[int, Approach] = {}
var _occupied: PackedByteArray = PackedByteArray()


static func is_main_kind(k: StringName) -> bool:
	return k == &"primary" or k == &"secondary" or k == &"tertiary" or k == &"motorway"


## Places vehicles take in turn: nodes where three or more roads meet, and sharp corners. The
## radius of the area traffic crosses there, 0 elsewhere (`junctionRadii`).
static func junction_radii(g: RoadGraph) -> PackedFloat32Array:
	var arms := _arms(g)
	var incoming := _incoming(g)
	var radius := PackedFloat32Array()
	radius.resize(g.node_count())
	for n in g.node_count():
		var around: Array = (arms[n] as Dictionary).keys()
		if around.size() < 2:
			continue
		if around.size() == 2:
			var a: Vector2 = g.node_pos[int(around[0])] - g.node_pos[n]
			var b: Vector2 = g.node_pos[int(around[1])] - g.node_pos[n]
			if a.normalized().dot(b.normalized()) < -0.5:
				continue
		var widest := 0.0
		for e in g.node_out[n]:
			widest = maxf(widest, g.edge_width[e])
		for e in (incoming[n] as PackedInt32Array):
			widest = maxf(widest, g.edge_width[e])
		radius[n] = widest / 2.0 + 1.0
	return radius


static func _arms(g: RoadGraph) -> Array:
	var arms: Array = []
	for n in g.node_count():
		arms.append({})
	for e in g.edge_count():
		(arms[g.edge_from[e]] as Dictionary)[g.edge_to[e]] = true
		(arms[g.edge_to[e]] as Dictionary)[g.edge_from[e]] = true
	return arms


static func _incoming(g: RoadGraph) -> Array:
	var incoming: Array = []
	for n in g.node_count():
		incoming.append(PackedInt32Array())
	for e in g.edge_count():
		# Packed arrays are values: append to the list and put it back.
		var list: PackedInt32Array = incoming[g.edge_to[e]]
		list.append(e)
		incoming[g.edge_to[e]] = list
	return incoming


static func build(g: RoadGraph, mapped: PackedVector2Array = PackedVector2Array()) -> TrafficSignals:
	var s := TrafficSignals.new()
	s.cycle = 2.0 * (float(TIMING["green"]) + float(TIMING["amber"]) + float(TIMING["all_red"]))
	var arms := _arms(g)
	var incoming := _incoming(g)
	# Mapped signals by 20 m cell.
	var mapped_cells: Dictionary[Vector2i, PackedVector2Array] = {}
	for m in mapped:
		var k := Vector2i(floori(m.x / MAPPED_REACH), floori(m.y / MAPPED_REACH))
		if not mapped_cells.has(k):
			mapped_cells[k] = PackedVector2Array()
		mapped_cells[k].append(m)
	# 1. Nodes that qualify.
	var candidates := PackedInt32Array()
	var near_mapped: Dictionary[int, bool] = {}
	for n in g.node_count():
		if (arms[n] as Dictionary).size() < 3:
			continue
		var p := g.node_pos[n]
		var main := false
		for e in g.node_out[n]:
			main = main or is_main_kind(g.kind(e))
		for e in (incoming[n] as PackedInt32Array):
			main = main or is_main_kind(g.kind(e))
		var by_map := false
		var c := Vector2i(floori(p.x / MAPPED_REACH), floori(p.y / MAPPED_REACH))
		for dx in range(-1, 2):
			for dz in range(-1, 2):
				for m: Vector2 in mapped_cells.get(c + Vector2i(dx, dz), PackedVector2Array()):
					if absf(m.x - p.x) < MAPPED_REACH and absf(m.y - p.y) < MAPPED_REACH:
						by_map = true
		if main or by_map:
			candidates.append(n)
			if by_map:
				near_mapped[n] = true
	# 2. Join those close together (union-find over 16 m buckets).
	var parent: Dictionary[int, int] = {}
	for n in candidates:
		parent[n] = n
	var buckets: Dictionary[Vector2i, PackedInt32Array] = {}
	for n in candidates:
		var p := g.node_pos[n]
		var cell := Vector2i(floori(p.x / CLUSTER), floori(p.y / CLUSTER))
		for i in range(-1, 2):
			for k in range(-1, 2):
				for m: int in buckets.get(cell + Vector2i(i, k), PackedInt32Array()):
					if g.node_pos[m].distance_to(p) < CLUSTER:
						parent[_root(parent, n)] = _root(parent, m)
		if not buckets.has(cell):
			buckets[cell] = PackedInt32Array()
		buckets[cell].append(n)
	var clusters: Dictionary[int, PackedInt32Array] = {}
	for n in candidates:
		var r := _root(parent, n)
		if not clusters.has(r):
			clusters[r] = PackedInt32Array()
		clusters[r].append(n)
	# 3. Arms, groups, stop lines and crossings.
	for root: int in clusters:
		var members: PackedInt32Array = clusters[root]
		var inside: Dictionary[int, bool] = {}
		for n in members:
			inside[n] = true
		var arms_out: Array[Vector3] = []
		var entering := PackedInt32Array()
		for n in members:
			for e in g.node_out[n]:
				if not inside.has(g.edge_to[e]):
					arms_out.append(Vector3(g.edge_dir[e].x, g.edge_dir[e].y, g.edge_width[e]))
			for e in (incoming[n] as PackedInt32Array):
				if inside.has(g.edge_from[e]):
					continue
				arms_out.append(Vector3(-g.edge_dir[e].x, -g.edge_dir[e].y, g.edge_width[e]))
				entering.append(e)
		if entering.is_empty():
			continue
		var reference := entering[0]
		for e in entering:
			if g.edge_width[e] > g.edge_width[reference]:
				reference = e
		var j := Junction.new()
		j.id = s.junctions.size()
		j.nodes = members
		for e in entering:
			var d := g.edge_dir[e]
			var node_p := g.node_pos[g.edge_to[e]]
			var a := -d
			var approach := Approach.new()
			approach.index = s.approaches.size()
			approach.junction = j.id
			approach.edge = e
			approach.group = 0 if absf(a.dot(g.edge_dir[reference])) >= sqrt(0.5) else 1
			var half_cross := 0.0
			for arm in arms_out:
				if absf(arm.x * a.x + arm.y * a.y) < 0.7:
					half_cross = maxf(half_cross, arm.z / 2.0)
			if half_cross == 0.0:
				for arm in arms_out:
					if arm.x * a.x + arm.y * a.y < 0.99:
						half_cross = maxf(half_cross, arm.z / 2.0)
			if half_cross == 0.0:
				half_cross = g.edge_width[e] / 2.0
			var cross_back := minf(half_cross + VERGE_WALK, MAX_STOP_BACK - ZEBRA_DEPTH / 2.0 - LINE_GAP)
			approach.stop_back = cross_back + ZEBRA_DEPTH / 2.0 + LINE_GAP
			approach.point = node_p - d * approach.stop_back
			approach.dir = d
			approach.width = g.edge_width[e]
			approach.crossing = node_p - d * cross_back
			approach.span = g.edge_width[e]
			j.approaches.append(approach)
			s.approaches.append(approach)
			s._by_edge[e] = approach
		var sum := Vector2.ZERO
		for n in members:
			sum += g.node_pos[n]
			j.mapped = j.mapped or near_mapped.has(n)
		j.point = sum / members.size()
		# A spread of start times that does not depend on the order roads were listed in.
		j.offset = fposmod(absf(sin(j.point.x * 12.9898 + j.point.y * 78.233)) * 43758.5453, 1.0) * s.cycle
		s.junctions.append(j)
	s._occupied.resize(s.approaches.size())
	return s


static func _root(parent: Dictionary[int, int], n: int) -> int:
	var r := n
	while parent[r] != r:
		r = parent[r]
	parent[n] = r
	return r


## The signalled arm `edge` leads into, or null.
func approach_on(edge: int) -> Approach:
	return _by_edge.get(edge)


## What a group of a junction shows now: GREEN, AMBER or RED.
func light(junction: int, group: int) -> int:
	var j := junctions[junction]
	var half := cycle / 2.0
	var t := fposmod(time + j.offset + (half if group == 1 else 0.0), cycle)
	if t < float(TIMING["green"]):
		return GREEN
	if t < float(TIMING["green"]) + float(TIMING["amber"]):
		return AMBER
	return RED


func light_for(a: Approach) -> int:
	return light(a.junction, a.group)


## Someone is on (or stepping onto) this arm's zebra crossing.
func crossing_busy(a: Approach) -> bool:
	return _occupied[a.index] == 1


## Advance the clock and see who is on the crossings (`walkers`: positions of people).
func update(dt: float, walkers: PackedVector2Array) -> void:
	time += dt
	_occupied.fill(0)
	if walkers.is_empty():
		return
	var lo := Vector2(INF, INF)
	var hi := Vector2(-INF, -INF)
	for w in walkers:
		lo = lo.min(w)
		hi = hi.max(w)
	for a in approaches:
		var c := a.crossing
		var reach := a.span + a.depth
		if c.x < lo.x - reach or c.x > hi.x + reach or c.y < lo.y - reach or c.y > hi.y + reach:
			continue
		for w in walkers:
			var r := w - c
			if absf(r.x) > reach or absf(r.y) > reach:
				continue
			var along := absf(r.dot(a.dir))
			var across := absf(r.x * a.dir.y - r.y * a.dir.x)
			if along < a.depth / 2.0 + 0.5 and across < a.span / 2.0 + 0.6:
				_occupied[a.index] = 1
				break


## Whether traffic on an arm must stop at the line. `nose`: metres from the vehicle's front to
## the line; `braking`: the hardest deceleration it can manage.
func must_stop(a: Approach, speed: float, nose: float, braking: float) -> bool:
	if crossing_busy(a):
		return true
	var l := light_for(a)
	if l == GREEN:
		return false
	var needed := speed * speed / (2.0 * maxf(nose, 0.01))
	if l == AMBER:
		return needed <= braking * 0.55
	return needed <= braking


## Approaches within `radius` of a point (the heads to draw).
func approaches_near(p: Vector2, radius: float) -> Array[Approach]:
	var out: Array[Approach] = []
	for a in approaches:
		if a.point.distance_to(p) < radius:
			out.append(a)
	return out
