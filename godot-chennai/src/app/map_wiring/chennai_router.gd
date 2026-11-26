class_name ChennaiRouter
extends RefCounted
## Offline A* road-network router over Chennai OSM roads (`RegionalWorldSource`).
## Respects `oneway`, road classifications, and supports `fastest` and `shortest` modes.

const SPEED_MPS := {
	&"motorway": 16.5,
	&"primary": 11.5,
	&"secondary": 9.5,
	&"tertiary": 8.0,
	&"residential": 5.8,
	&"service": 4.2,
	&"track": 3.5,
}
const MAX_SPEED_MPS := 17.0


class _Graph:
	extends RefCounted
	var node_pos: PackedVector2Array = PackedVector2Array()
	var node_out: Array[PackedInt32Array] = []
	var edge_from: PackedInt32Array = PackedInt32Array()
	var edge_to: PackedInt32Array = PackedInt32Array()
	var edge_len: PackedFloat32Array = PackedFloat32Array()
	var edge_cost: PackedFloat32Array = PackedFloat32Array()
	var edge_time: PackedFloat32Array = PackedFloat32Array()
	var edge_bridge: PackedByteArray = PackedByteArray()
	var edge_name: PackedStringArray = PackedStringArray()
	var edge_kind: Array[StringName] = []
	var _index: Dictionary[Vector2i, int] = {}

	func node_at(p: Vector2) -> int:
		var key := Vector2i(roundi(p.x * 10.0), roundi(p.y * 10.0))
		var id: int = _index.get(key, -1)
		if id < 0:
			id = node_pos.size()
			node_pos.append(p)
			node_out.append(PackedInt32Array())
			_index[key] = id
		return id

	func add_edge(a: int, b: int, length: float, cost: float, time_sec: float, is_bridge: bool, rname: String, rkind: StringName) -> void:
		if a == b or length < 0.2:
			return
		var ei := edge_from.size()
		node_out[a].append(ei)
		edge_from.append(a)
		edge_to.append(b)
		edge_len.append(length)
		edge_cost.append(cost)
		edge_time.append(time_sec)
		edge_bridge.append(1 if is_bridge else 0)
		edge_name.append(rname)
		edge_kind.append(rkind)

	func nearest_node(p: Vector2, max_dist: float = 900.0) -> int:
		var best := -1
		var best_d2 := max_dist * max_dist
		for i in node_pos.size():
			if node_out[i].is_empty():
				continue
			var d2 := node_pos[i].distance_squared_to(p)
			if d2 < best_d2:
				best_d2 = d2
				best = i
		return best


static func compute_route(geo: ChennaiGeoIndex, stops: Array[Dictionary], route_mode: String = "fastest") -> Dictionary:
	if geo == null or geo.source == null or stops.size() < 2:
		return {"ok": false, "reason": "Select at least a Start and Destination."}

	var lo: Vector2 = stops[0]["pos"]
	var hi: Vector2 = stops[0]["pos"]
	for s: Dictionary in stops:
		var sp: Vector2 = s["pos"]
		lo = lo.min(sp)
		hi = hi.max(sp)
	var span := Rect2(lo, hi - lo).grow(2500.0)
	var t0 := geo.source.tile_at(span.position)
	var t1 := geo.source.tile_at(span.end)
	for tx in range(t0.x, t1.x + 1):
		for tz in range(t0.y, t1.y + 1):
			geo.ensure_tile(Vector2i(tx, tz), false)

	var roads := geo.get_roads_in_rect(span)
	if roads.is_empty():
		return {"ok": false, "reason": "No OSM road data loaded in this region."}

	var g := _build_graph(roads, route_mode)
	if g.node_pos.is_empty():
		return {"ok": false, "reason": "No drivable road graph found."}

	var full_polyline := PackedVector2Array()
	var total_dist := 0.0
	var total_time := 0.0
	var bridge_count := 0
	var in_bridge := false
	var all_segments: Array[Dictionary] = []
	var h_scale := 1.0 if route_mode == "shortest" else (1.0 / MAX_SPEED_MPS)

	for leg_i in range(stops.size() - 1):
		var p_a: Vector2 = stops[leg_i]["pos"]
		var p_b: Vector2 = stops[leg_i + 1]["pos"]
		var n_a := g.nearest_node(p_a)
		var n_b := g.nearest_node(p_b)
		if n_a < 0 or n_b < 0:
			return {"ok": false, "reason": "Stop '%s' is too far from mapped OSM roads." % str(stops[leg_i + 1]["name"] if n_b < 0 else stops[leg_i]["name"])}

		var edge_path := _astar(g, n_a, n_b, h_scale)
		if edge_path.is_empty() and n_a != n_b:
			return {"ok": false, "reason": "No connected road path found to '%s'." % str(stops[leg_i + 1]["name"])}

		if full_polyline.is_empty():
			full_polyline.append(g.node_pos[n_a])
		for ei: int in edge_path:
			var to_pos := g.node_pos[g.edge_to[ei]]
			var from_pos := g.node_pos[g.edge_from[ei]]
			full_polyline.append(to_pos)
			var elen := g.edge_len[ei]
			var etime := g.edge_time[ei]
			var is_br := g.edge_bridge[ei] != 0
			if is_br and not in_bridge:
				bridge_count += 1
			in_bridge = is_br
			total_dist += elen
			total_time += etime
			all_segments.append({
				"from": from_pos,
				"to": to_pos,
				"len": elen,
				"time": etime,
				"name": g.edge_name[ei],
				"kind": g.edge_kind[ei],
				"leg": leg_i,
			})

	var steps := _build_turn_steps(all_segments, stops)
	return {
		"ok": true,
		"reason": "",
		"mode": route_mode,
		"polyline": full_polyline,
		"steps": steps,
		"total_distance": total_dist,
		"estimated_seconds": total_time,
		"bridge_count": bridge_count,
		"stops": stops.duplicate(true),
	}


static func _build_graph(roads: Array[Road], route_mode: String = "fastest") -> _Graph:
	var g := _Graph.new()
	var shortest := route_mode == "shortest"
	for road: Road in roads:
		if road.kind == &"footway" or road.kind == &"raceway" or road.points.size() < 2:
			continue
		var spd: float = float(SPEED_MPS.get(road.kind, 6.0))
		for i in range(road.points.size() - 1):
			var pa := road.points[i]
			var pb := road.points[i + 1]
			var a := g.node_at(pa)
			var b := g.node_at(pb)
			var dist := pa.distance_to(pb)
			if dist < 0.2:
				continue
			var t_sec := dist / spd
			var cost := dist if shortest else t_sec
			g.add_edge(a, b, dist, cost, t_sec, road.bridge, road.name, road.kind)
			if not road.oneway:
				g.add_edge(b, a, dist, cost, t_sec, road.bridge, road.name, road.kind)
	return g


static func _astar(g: _Graph, start: int, goal: int, h_scale: float) -> PackedInt32Array:
	if start == goal:
		return PackedInt32Array()
	var n := g.node_pos.size()
	var goal_pos := g.node_pos[goal]
	var g_score := PackedFloat64Array()
	g_score.resize(n)
	g_score.fill(INF)
	var came_edge := PackedInt32Array()
	came_edge.resize(n)
	came_edge.fill(-1)
	var closed := PackedByteArray()
	closed.resize(n)

	var heap_f: Array[float] = []
	var heap_n: Array[int] = []
	g_score[start] = 0.0
	_heap_push(heap_f, heap_n, g.node_pos[start].distance_to(goal_pos) * h_scale, start)

	var found := false
	while not heap_n.is_empty():
		var cur := _heap_pop(heap_f, heap_n)
		if cur == goal:
			found = true
			break
		if closed[cur] != 0:
			continue
		closed[cur] = 1
		var cur_g := g_score[cur]
		for ei: int in g.node_out[cur]:
			var nxt := g.edge_to[ei]
			if closed[nxt] != 0:
				continue
			var cand_g := cur_g + g.edge_cost[ei]
			if cand_g < g_score[nxt]:
				g_score[nxt] = cand_g
				came_edge[nxt] = ei
				var f := cand_g + g.node_pos[nxt].distance_to(goal_pos) * h_scale
				_heap_push(heap_f, heap_n, f, nxt)

	if not found:
		return PackedInt32Array()

	var rev := PackedInt32Array()
	var cur := goal
	while cur != start:
		var ei := came_edge[cur]
		if ei < 0:
			return PackedInt32Array()
		rev.append(ei)
		cur = g.edge_from[ei]
	rev.reverse()
	return rev


static func _heap_push(hf: Array[float], hn: Array[int], f: float, node: int) -> void:
	hf.append(f)
	hn.append(node)
	var i := hn.size() - 1
	while i > 0:
		var p := (i - 1) >> 1
		if hf[i] < hf[p]:
			var tf := hf[i]
			hf[i] = hf[p]
			hf[p] = tf
			var tn := hn[i]
			hn[i] = hn[p]
			hn[p] = tn
			i = p
		else:
			break


static func _heap_pop(hf: Array[float], hn: Array[int]) -> int:
	var top := hn[0]
	var last_f: float = hf.pop_back()
	var last_n: int = hn.pop_back()
	if not hn.is_empty():
		hf[0] = last_f
		hn[0] = last_n
		var n := hn.size()
		var i := 0
		while true:
			var l := i * 2 + 1
			var r := l + 1
			var smallest := i
			if l < n and hf[l] < hf[smallest]:
				smallest = l
			if r < n and hf[r] < hf[smallest]:
				smallest = r
			if smallest == i:
				break
			var tf := hf[i]
			hf[i] = hf[smallest]
			hf[smallest] = tf
			var tn := hn[i]
			hn[i] = hn[smallest]
			hn[smallest] = tn
			i = smallest
	return top


static func _build_turn_steps(segments: Array[Dictionary], stops: Array[Dictionary]) -> Array[Dictionary]:
	var steps: Array[Dictionary] = []
	if segments.is_empty():
		return steps

	var cum_dist := 0.0
	var cur_name := _label_for_seg(segments[0])
	var cur_dist := 0.0
	var cur_maneuver := "HEAD"
	var prev_dir := ((segments[0]["to"] as Vector2) - (segments[0]["from"] as Vector2)).normalized()

	for i in segments.size():
		var seg := segments[i]
		var seg_name := _label_for_seg(seg)
		var dir := ((seg["to"] as Vector2) - (seg["from"] as Vector2)).normalized()
		var seg_len := float(seg["len"])
		var angle := prev_dir.angle_to(dir)

		var significant_turn := absf(angle) > deg_to_rad(36.0) and cur_dist > 18.0
		var name_changed := seg_name != cur_name and cur_dist > 20.0
		if i > 0 and (significant_turn or name_changed):
			steps.append({
				"maneuver": cur_maneuver,
				"road": cur_name,
				"distance": cur_dist,
				"cum_distance": cum_dist,
				"pos": seg["from"],
			})
			cur_maneuver = _turn_word(angle) if significant_turn else "CONTINUE"
			cur_name = seg_name
			cur_dist = 0.0

		cur_dist += seg_len
		cum_dist += seg_len
		prev_dir = dir

	steps.append({
		"maneuver": cur_maneuver,
		"road": cur_name,
		"distance": cur_dist,
		"cum_distance": cum_dist,
		"pos": segments[segments.size() - 1]["to"],
	})
	var dest_name := str(stops[stops.size() - 1].get("name", "Destination"))
	steps.append({
		"maneuver": "ARRIVE",
		"road": dest_name,
		"distance": 0.0,
		"cum_distance": cum_dist,
		"pos": stops[stops.size() - 1]["pos"],
	})
	return steps


static func _label_for_seg(seg: Dictionary) -> String:
	var nm := str(seg.get("name", "")).strip_edges()
	if nm != "":
		return nm
	return str(seg.get("kind", "road")).capitalize() + " Road"


static func _turn_word(angle_rad: float) -> String:
	var deg := rad_to_deg(angle_rad)
	if deg > 125.0 or deg < -125.0:
		return "U-TURN"
	if deg > 42.0:
		return "TURN RIGHT"
	if deg > 20.0:
		return "SLIGHT RIGHT"
	if deg < -42.0:
		return "TURN LEFT"
	if deg < -20.0:
		return "SLIGHT LEFT"
	return "CONTINUE"
