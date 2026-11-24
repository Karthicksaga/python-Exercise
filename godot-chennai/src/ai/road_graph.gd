class_name RoadGraph
extends RefCounted
## The road network as a graph (port of `ai/src/RoadGraph.ts`): junctions and bends are nodes,
## stretches of road between them are directed edges. Built from the roads of an area (format 2
## pieces join up because neighbouring pieces share their end point); traffic and pedestrians
## navigate on it. Pure data: built on a worker thread, read by `AgentSystem`.
##
## Edges carry what the AI needs of their road: kind, width, lanes each way, one-way, name and
## the road itself (for the kind of place, `PlaceMap`).

## Positions of the nodes (x, z), metres.
var node_pos: PackedVector2Array = PackedVector2Array()
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
static func build(list: Array[Road], include: Callable, respect_oneway: bool = true) -> RoadGraph:
	var g := RoadGraph.new()
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
			if a == b:
				continue
			var one := road.oneway and respect_oneway
			g._connect(a, b, road, ri, each_way, one)
			if not one:
				g._connect(b, a, road, ri, each_way, false)
	return g


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


func _connect(a: int, b: int, road: Road, ri: int, lanes: int, oneway: bool) -> void:
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
