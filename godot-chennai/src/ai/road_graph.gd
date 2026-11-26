class_name RoadGraph
extends RefCounted
## The road network as a graph (port of `ai/src/RoadGraph.ts`): junctions and bends are nodes,
## stretches of road between them are directed edges. Built from the roads of an area (format 2
## pieces join up because neighbouring pieces share their end point); traffic and pedestrians
## navigate on it. Pure data: built on a worker thread, read by `AgentSystem`.
##
## Edges carry what the AI needs of their road: kind, width, lanes each way, one-way, name and
## the road itself (for the kind of place, `PlaceMap`).

## Height of a flyover deck per OSM layer above the ground, metres (an estimate: Chennai's
## flyovers clear about 5.5 m).
const DECK_STEP := 6.0
## Ramps down from a deck along the roads joining it: metres of road per metre of height (5 %).
const RAMP_RUN := 20.0

## Positions of the nodes (x, z), metres.
var node_pos: PackedVector2Array = PackedVector2Array()
## Height of the road surface at each node above the ground plane, metres (G-122): 0 on the
## ground; on a flyover deck and down its ramps when the graph was built with `decks`. Traffic
## and walkers carry this height from day one (the Three.js AI assumed y = 0).
var node_y: PackedFloat32Array = PackedFloat32Array()
## Edges leaving each node.
var node_out: Array[PackedInt32Array] = []
var edge_from: PackedInt32Array = PackedInt32Array()
var edge_to: PackedInt32Array = PackedInt32Array()
var edge_length: PackedFloat32Array = PackedFloat32Array()
## Unit direction of travel.
var edge_dir: PackedVector2Array = PackedVector2Array()
var edge_width: PackedFloat32Array = PackedFloat32Array()
## Lanes in this direction of travel (at least 1).
var edge_lanes: PackedInt32Array = PackedInt32Array()
var edge_oneway: PackedByteArray = PackedByteArray()
## Index into `roads` of the road the edge belongs to.
var edge_road: PackedInt32Array = PackedInt32Array()
## Segment of its road each edge runs along (points[i] -> points[i + 1]), and 1 when the edge runs
## it backwards: so an agent's height comes from the road's own height samples (format 2.1,
## `Road.height_at`, decision G-151) on flyovers, bridges and their ramps (G-214).
var edge_seg: PackedInt32Array = PackedInt32Array()
var edge_back: PackedByteArray = PackedByteArray()
var roads: Array[Road] = []
var _index: Dictionary[Vector2i, int] = {}


func edge_count() -> int:
	return edge_from.size()


func node_count() -> int:
	return node_pos.size()


func kind(edge: int) -> StringName:
	return roads[edge_road[edge]].kind


func road(edge: int) -> Road:
	return roads[edge_road[edge]]


## Builds a graph from `list`. `include(road) -> bool` picks the roads (vehicles skip
## footpaths, pedestrians use everything); `respect_oneway` false for pedestrians, who walk
## both ways on any street.
##
## `decks`: raise bridges with an OSM `layer` of 1 or more to `layer * DECK_STEP` and ramp the
## roads joining them down at 1 in RAMP_RUN. Off while the world draws flyovers flat on the
## ground (World agent, weak list): traffic must drive on the surface that is drawn.
static func build(list: Array[Road], include: Callable, respect_oneway: bool = true, decks: bool = false) -> RoadGraph:
	var g := RoadGraph.new()
	var deck_nodes: Dictionary[int, float] = {}
	for road in list:
		if road.points.size() < 2 or not include.call(road):
			continue
		var ri := g.roads.size()
		g.roads.append(road)
		var lanes := CityLayout.lane_count(road)
		var each_way := lanes if road.oneway and respect_oneway else maxi(1, lanes / 2)
		for i in road.points.size() - 1:
			var a := g._node_at(road.points[i])
			var b := g._node_at(road.points[i + 1])
			if decks and road.bridge and road.layer > 0:
				var h := road.layer * DECK_STEP
				deck_nodes[a] = maxf(deck_nodes.get(a, 0.0), h)
				deck_nodes[b] = maxf(deck_nodes.get(b, 0.0), h)
			if a == b:
				continue
			var one := road.oneway and respect_oneway
			g._connect(a, b, road, ri, each_way, one, i, false)
			if not one:
				g._connect(b, a, road, ri, each_way, false, i, true)
	g.node_y.resize(g.node_pos.size())
	if not deck_nodes.is_empty():
		g._raise(deck_nodes)
	return g


## Heights from the deck nodes outwards: each node takes the highest of (deck height minus the
## road distance to it over RAMP_RUN), so ramps fall evenly to the ground (a highest-first search,
## both ways along every edge: a one-way ramp still slopes).
func _raise(deck_nodes: Dictionary[int, float]) -> void:
	var around: Array[PackedInt32Array] = []
	around.resize(node_pos.size())
	for e in edge_count():
		around[edge_from[e]].append(e)
		around[edge_to[e]].append(e)
	var open: Array[Vector2] = []  # (height, node), highest last
	for n: int in deck_nodes:
		node_y[n] = deck_nodes[n]
		open.append(Vector2(deck_nodes[n], n))
	open.sort()
	while not open.is_empty():
		var top: Vector2 = open.pop_back()
		var n := int(top.y)
		if top.x < node_y[n]:
			continue
		for e in around[n]:
			var m := edge_to[e] if edge_from[e] == n else edge_from[e]
			var h := top.x - edge_length[e] / RAMP_RUN
			if deck_nodes.has(m) or h <= node_y[m] or h <= 0.0:
				continue
			node_y[m] = h
			open.insert(open.bsearch(Vector2(h, m)), Vector2(h, m))


## Height of the road surface `along` metres down an edge: the road's own heights where it is
## raised (`infra.bin`), else the deck estimate of `build(..., decks)` (0 on the ground).
func height_on(edge: int, along: float) -> float:
	var r := roads[edge_road[edge]]
	if r.is_raised() and edge < edge_seg.size():
		var t := clampf(along / edge_length[edge], 0.0, 1.0)
		return r.height_at(edge_seg[edge], 1.0 - t if edge_back[edge] == 1 else t)
	var a := node_y[edge_from[edge]]
	var b := node_y[edge_to[edge]]
	if a == b:
		return a
	return lerpf(a, b, clampf(along / edge_length[edge], 0.0, 1.0))


## Roads that meet share a point in OpenStreetMap, so equal coordinates (to 10 cm) are a junction.
func _node_at(p: Vector2) -> int:
	var key := Vector2i(roundi(p.x * 10.0), roundi(p.y * 10.0))
	var id: int = _index.get(key, -1)
	if id < 0:
		id = node_pos.size()
		node_pos.append(p)
		node_out.append(PackedInt32Array())
		_index[key] = id
	return id


func _connect(a: int, b: int, road: Road, ri: int, lanes: int, oneway: bool, seg: int = 0, back: bool = false) -> void:
	var pa := node_pos[a]
	var pb := node_pos[b]
	var length := pa.distance_to(pb)
	if length < 0.5:
		return
	node_out[a].append(edge_from.size())
	edge_from.append(a)
	edge_to.append(b)
	edge_length.append(length)
	edge_dir.append((pb - pa) / length)
	edge_width.append(road.width)
	edge_lanes.append(lanes)
	edge_oneway.append(1 if oneway else 0)
	edge_road.append(ri)
	edge_seg.append(seg)
	edge_back.append(1 if back else 0)


## The node at exactly this point (to 10 cm), or -1.
func node_at(p: Vector2) -> int:
	return _index.get(Vector2i(roundi(p.x * 10.0), roundi(p.y * 10.0)), -1)


## Point `along` metres down an edge, `lane` metres to the left of its centre line (India
## drives on the left: positive is the left of the direction of travel).
func point_on(edge: int, along: float, lane: float = 0.0) -> Vector2:
	var d := edge_dir[edge]
	var p := node_pos[edge_from[edge]] + d * along
	return Vector2(p.x + d.y * lane, p.y - d.x * lane)


## Heading of travel along an edge (radians, 0 = towards -Z, positive turning left).
func heading(edge: int) -> float:
	var d := edge_dir[edge]
	return atan2(-d.x, -d.y)


## The edge to take after `edge`: any way onwards, turning back only at a dead end. A one-way
## street can end with no way out: returns `edge` itself and the caller re-places the agent.
func next_edge(edge: int, rng: AiRandom) -> int:
	var at := edge_to[edge]
	var back := edge_from[edge]
	var options := PackedInt32Array()
	for e in node_out[at]:
		if edge_to[e] != back:
			options.append(e)
	if options.is_empty():
		options = node_out[at]
	if options.is_empty():
		return edge
	return options[mini(options.size() - 1, floori(rng.next() * options.size()))]


## Midpoint of an edge.
func middle(edge: int) -> Vector2:
	return node_pos[edge_from[edge]] + edge_dir[edge] * edge_length[edge] * 0.5


## The edge between two nodes, or -1.
func edge_between(a: int, b: int) -> int:
	if a < 0 or a >= node_out.size():
		return -1
	for e in node_out[a]:
		if edge_to[e] == b:
			return e
	return -1
