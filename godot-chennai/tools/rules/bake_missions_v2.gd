extends SceneTree
## Bakes the places, routes and rough patches the new missions need (docs/mission-design.md §4,
## G-145) from the real road data, into `src/missions/content/anchors.json`:
##
##   godot --headless --audio-driver Dummy --path . --script res://tools/rules/bake_missions_v2.gd
##
## ANCHORS: a named place snapped onto a road (by district or landmark, optionally a named road),
## with the kerb spot beside it (`FareSpots`). PATHS: the shortest way along the road graph between
## two anchors (Dijkstra over the roads' own points; `kinds` limits the roads, `avoid` leaves out
## another path's middle). ZONES and PATCHES are points along a path. The graph exists only here, at
## bake time; the game plays the baked polylines (the live road-graph agents come with the traffic
## branch, W7).

const ANCHORS := {
	"hall_lodge": {"district": "Triplicane", "road": "Triplicane High Road"},
	"hall_gate": {"district": "Thousand Lights", "road": "Greams Road"},
	"hall_side": {"district": "Thousand Lights", "road": "Pathari Road"},
	"sambar_kitchen": {"district": "Mylapore", "road": "East Tank Square Street"},
	"sambar_hall": {"district": "Mandaveli", "road": "Venkatakrishna Road"},
	"wrong_start": {"district": "Thousand Lights", "road": "Anna Salai"},
	"wrong_drop": {"district": "Nandanam", "road": "Anna Salai"},
	"wrong_station": {"district": "Nandanam", "road": "Nandanam Main Road"},
	"monsoon_patient": {"district": "Santhome", "road": "Santhome High Road"},
	"monsoon_hospital": {"district": "Alwarpet", "road": "TTK Road"},
	"bandh_depot": {"district": "Egmore", "road": "Pantheon Road"},
	"bandh_one": {"district": "Royapettah", "road": "Bharathi Salai"},
	"bandh_two": {"district": "Triplicane", "road": "Buchi Babu Street"},
	"bandh_three": {"landmark": "marina-beach", "road": "Marina Beach Road"},
	"strike_one": {"district": "Teynampet", "road": "Anna Salai"},
	"strike_two": {"district": "Egmore", "road": "EVR Periyar Salai"},
	"strike_three": {"district": "Chepauk", "road": "Wallajah Road"},
}
const MAIN: Array[String] = ["primary", "secondary", "tertiary"]
const PATHS := {
	"hall_route": {"from": "hall_lodge", "to": "hall_gate", "kinds": ["primary", "secondary", "tertiary", "residential"]},
	"sambar_lane": {"from": "sambar_kitchen", "to": "sambar_hall", "kinds": ["primary", "secondary", "tertiary", "residential", "service"]},
	"sambar_main": {"from": "sambar_kitchen", "to": "sambar_hall", "kinds": ["primary", "secondary", "tertiary"], "avoid": "sambar_lane"},
	"wrong_route": {"from": "wrong_start", "to": "wrong_drop", "kinds": ["primary", "secondary", "tertiary"]},
	"monsoon_short": {"from": "monsoon_patient", "to": "monsoon_hospital", "kinds": ["primary", "secondary", "tertiary", "residential"]},
	"monsoon_alt": {"from": "monsoon_patient", "to": "monsoon_hospital", "kinds": ["primary", "secondary", "tertiary", "residential"], "avoid": "monsoon_short"},
}

var _roads: Array[Road] = []
var _districts: DistrictIndex
var _layout: CityLayout
var _source: FileWorldSource


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	_source = FileWorldSource.new()
	var err := _source.open()
	if err != "":
		printerr(err)
		quit(1)
		return
	_roads = _source.loaded_roads().roads
	var list: Array = []
	for p: Place in _source.index_at(Vector2.ZERO).districts:
		list.append({"name": p.name, "kind": str(p.kind), "x": p.position.x, "z": p.position.y})
	_districts = DistrictIndex.new(list)
	_layout = CityLayouts.create(_source).layout_for(_source.cell_at(Vector2(40, 60)))
	var out := {"anchors": {}, "paths": {}}
	for name: String in ANCHORS:
		var a := _anchor(ANCHORS[name])
		if a.is_empty():
			printerr("anchor %s: no road" % name)
			quit(1)
			return
		out["anchors"][name] = a
		print("anchor %-18s %8.1f %8.1f  %s (%s)" % [name, a["x"], a["z"], a["road"], a["district"]])
	for name: String in PATHS:
		var spec: Dictionary = PATHS[name]
		var avoid: Array = []
		if spec.has("avoid"):
			avoid = _middle(out["paths"][spec["avoid"]])
		var path := _shortest(out["anchors"][spec["from"]], out["anchors"][spec["to"]], spec["kinds"], avoid)
		if path.is_empty():
			printerr("path %s: not connected" % name)
			quit(1)
			return
		out["paths"][name] = path
		print("path %-14s %d points, %.0f m" % [name, path.size(), Chase.path_length(path)])
	var file := FileAccess.open("res://src/missions/content/anchors.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(out, "\t", false) + "\n")
	file.close()
	quit(0)


func _anchor(spec: Dictionary) -> Dictionary:
	var base := Vector2.ZERO
	if spec.has("district"):
		for d: Dictionary in _districts.districts:
			if str(d["name"]) == str(spec["district"]):
				base = Vector2(float(d["x"]), float(d["z"]))
	else:
		for l in _source.get_landmarks():
			if l.id == str(spec["landmark"]):
				base = l.position
	var want := str(spec.get("road", ""))
	var best := INF
	var found: Dictionary = {}
	for road in _roads:
		if road.kind == &"footway" or (want != "" and not road.name.contains(want)):
			continue
		for i in range(road.points.size() - 1):
			var q := Geometry2D.get_closest_point_to_segment(base, road.points[i], road.points[i + 1])
			var d := q.distance_to(base)
			if d < best:
				best = d
				found = {"point": q, "road": road, "heading": atan2(-(road.points[i + 1].x - road.points[i].x), -(road.points[i + 1].y - road.points[i].y))}
	if found.is_empty():
		return {}
	var p: Vector2 = FareSpots.round_tenth(found["point"])
	var kerb := FareSpots.kerb_spot(_layout, p)
	var near := _districts.at(p.x, p.y)
	return {"x": p.x, "z": p.y, "road": (found["road"] as Road).name, "kind": str((found["road"] as Road).kind), "width": (found["road"] as Road).width, "district": str(near.get("name", "")), "heading": snappedf(float(found["heading"]), 0.001), "kerb": {"x": snappedf(kerb.x, 0.1), "z": snappedf(kerb.y, 0.1)}}


func _key(p: Vector2) -> Vector2i:
	return Vector2i(roundi(p.x * 2.0), roundi(p.y * 2.0))


## Points of a path strictly inside it (more than 150 m from either end), keys to keep out.
func _middle(path: Array) -> Array:
	var out: Array = []
	var total := Chase.path_length(path)
	var run := 0.0
	for i in path.size():
		if i > 0:
			run += RulesMath.hypot(float(path[i]["x"]) - float(path[i - 1]["x"]), float(path[i]["z"]) - float(path[i - 1]["z"]))
		if run > 150.0 and total - run > 150.0:
			out.append(_key(Vector2(float(path[i]["x"]), float(path[i]["z"]))))
	return out


func _shortest(from: Dictionary, to: Dictionary, kinds: Array, avoid: Array) -> Array:
	var a := Vector2(float(from["x"]), float(from["z"]))
	var b := Vector2(float(to["x"]), float(to["z"]))
	var box := Rect2(a, Vector2.ZERO).expand(b).grow(900.0)
	var nodes: Dictionary[Vector2i, int] = {}
	var pos: Array[Vector2] = []
	var adj: Array[PackedInt32Array] = []
	var blocked := {}
	for k: Variant in avoid:
		blocked[k] = true
	for road in _roads:
		if road.kind == &"footway" or not kinds.has(str(road.kind)):
			continue
		var prev := -1
		for p in road.points:
			if not box.has_point(p):
				prev = -1
				continue
			var key := _key(p)
			if blocked.has(key):
				prev = -1
				continue
			if not nodes.has(key):
				nodes[key] = pos.size()
				pos.append(p)
				adj.append(PackedInt32Array())
			var id := nodes[key]
			if prev >= 0 and prev != id:
				adj[prev].append(id)
				adj[id].append(prev)
			prev = id
	# Roads of the data end near, not always on, the road they meet: a road's loose end is joined
	# to the nearest segment of another road within 12 m, through a new node at the foot of it.
	var segs: Dictionary[Vector2i, PackedInt32Array] = {}
	var seg_a := PackedInt32Array()
	var seg_b := PackedInt32Array()
	for u in pos.size():
		for v: int in adj[u]:
			if v > u:
				var si := seg_a.size()
				seg_a.append(u)
				seg_b.append(v)
				for cx in range(floori(minf(pos[u].x, pos[v].x) / 30.0), floori(maxf(pos[u].x, pos[v].x) / 30.0) + 1):
					for cz in range(floori(minf(pos[u].y, pos[v].y) / 30.0), floori(maxf(pos[u].y, pos[v].y) / 30.0) + 1):
						var cell := Vector2i(cx, cz)
						if not segs.has(cell):
							segs[cell] = PackedInt32Array()
						segs[cell].append(si)
	var loose: Array[int] = []
	for i in pos.size():
		if adj[i].size() <= 1:
			loose.append(i)
	for i in loose:
		var cell := Vector2i(floori(pos[i].x / 30.0), floori(pos[i].y / 30.0))
		var best_d := 12.0
		var best_s := -1
		var best_q := Vector2.ZERO
		for dx in range(-1, 2):
			for dz in range(-1, 2):
				for si: int in segs.get(cell + Vector2i(dx, dz), PackedInt32Array()):
					var u := seg_a[si]
					var v := seg_b[si]
					if u == i or v == i or adj[i].has(u) or adj[i].has(v):
						continue
					var q := Geometry2D.get_closest_point_to_segment(pos[i], pos[u], pos[v])
					var d := q.distance_to(pos[i])
					if d < best_d:
						best_d = d
						best_s = si
						best_q = q
		if best_s >= 0:
			var n := pos.size()
			pos.append(best_q)
			adj.append(PackedInt32Array([seg_a[best_s], seg_b[best_s], i]))
			adj[seg_a[best_s]].append(n)
			adj[seg_b[best_s]].append(n)
			adj[i].append(n)
	var start := _nearest(pos, a)
	var goal := _nearest(pos, b)
	if start < 0 or goal < 0:
		return []
	var dist := PackedFloat64Array()
	dist.resize(pos.size())
	dist.fill(INF)
	var came := PackedInt32Array()
	came.resize(pos.size())
	came.fill(-1)
	dist[start] = 0.0
	# A binary heap of [distance, node].
	var heap: Array[Vector2] = [Vector2(0.0, start)]
	while not heap.is_empty():
		var top := heap[0]
		var last: Vector2 = heap.pop_back()
		if not heap.is_empty():
			heap[0] = last
			var i := 0
			while true:
				var l := i * 2 + 1
				var r := l + 1
				var m := i
				if l < heap.size() and heap[l].x < heap[m].x:
					m = l
				if r < heap.size() and heap[r].x < heap[m].x:
					m = r
				if m == i:
					break
				var t := heap[i]
				heap[i] = heap[m]
				heap[m] = t
				i = m
		var u := int(top.y)
		if top.x > dist[u] + 0.01:
			continue
		if u == goal:
			break
		for v: int in adj[u]:
			var nd := dist[u] + pos[u].distance_to(pos[v])
			if nd < dist[v]:
				dist[v] = nd
				came[v] = u
				heap.append(Vector2(nd, v))
				var j := heap.size() - 1
				while j > 0:
					var parent := (j - 1) / 2
					if heap[parent].x <= heap[j].x:
						break
					var t2 := heap[parent]
					heap[parent] = heap[j]
					heap[j] = t2
					j = parent
	if dist[goal] == INF:
		return []
	var chain: Array[Vector2] = []
	var at := goal
	while at >= 0:
		chain.append(pos[at])
		at = came[at]
	chain.reverse()
	# The anchors themselves at the ends, and points no closer than 4 m together.
	var path: Array = [{"x": a.x, "z": a.y}]
	for p in chain:
		var last_p: Dictionary = path[path.size() - 1]
		if Vector2(float(last_p["x"]), float(last_p["z"])).distance_to(p) >= 4.0:
			path.append({"x": snappedf(p.x, 0.1), "z": snappedf(p.y, 0.1)})
	path.append({"x": b.x, "z": b.y})
	return path


func _nearest(pos: Array[Vector2], p: Vector2) -> int:
	var best := -1
	var best_d := INF
	for i in pos.size():
		var d := pos[i].distance_squared_to(p)
		if d < best_d:
			best_d = d
			best = i
	return best
