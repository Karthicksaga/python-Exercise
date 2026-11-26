extends SceneTree
## Re-sites the stages that sat together in the Anna Nagar test box over the whole city (G-280):
##
##   godot --headless --audio-driver Dummy --path . --script res://tools/rules/respace_stages.gd
##
## Each stage in SITES is moved as a whole: its first marker goes to the nearest main road of the
## chosen district, the others keep their original distances and bearings from it as far as the real
## roads allow (the bearing is searched in 15 degree steps for the least change), every marker, its
## kerb spot, its enemies and the vehicle parked for it end up on a street and outside buildings.
## Output: `tools/rules/stage_sites.json`, which `apply_stage_sites.py` folds into
## `src/missions/content/content.json` together with the new texts. Needs `world/` (format 2).

const SITES := {
	"borrowed-wheels": {"at": [3020.0, 198.0], "name": "kilpauk"},
	"auto-shift": {"at": [3457.0, -3083.0], "name": "perambur"},
	"parcel-run": {"at": [3650.0, 1474.0], "name": "chetpet"},
	"bike-courier": {"at": [1500.0, 7137.0], "name": "saidapet"},
	"bike-thieves": {"at": [280.0, 3598.0], "name": "kodambakkam"},
	"godown-raid": {"at": [-4228.0, -1098.0], "name": "ambattur"},
	"tea-shop": {"at": [7814.0, -789.0], "name": "georgetown"},
	"turf-war": {"at": [2543.0, 5160.0], "name": "tnagar"},
	"planted-chain": {"at": [6295.0, 9486.0], "name": "besant"},
	"beach-road-brawl": {"at": [7420.0, 4950.0], "name": "marina"},
}
## G-453: the city jobs and the life places move the same way, each as a cluster of its own (a job's
## stops keep their distances, 0.5 to 3 km), every job in a district of its own. `share-auto` stays: its
## route is a recorded Anna Nagar road line. Written to `tools/rules/job_sites.json`; run with
## `-- jobs` after the stages (`apply_job_sites.py` folds it into the content).
const JOB_SITES := {
	"ambulance-run": {"at": [5164.0, 8734.0], "name": "adyar"},
	"courier": {"at": [1632.0, 2631.0], "name": "choolaimedu"},
	"cab-ride": {"at": [2741.0, -1069.0], "name": "ayanavaram"},
	"bus-route": {"at": [1111.0, 8483.0], "name": "guindy", "line": true},
	"hospital-transfer": {"at": [3291.0, 2550.0], "name": "nungambakkam"},
	"food-delivery": {"at": [6489.0, 5932.0], "name": "mylapore"},
	"medicine-run": {"at": [4866.0, -481.0], "name": "purasawalkam"},
	"tower-park-visit": {"at": [4304.0, 4523.0], "name": "teynampet"},
	"evening-bus": {"at": [-1114.0, 1498.0], "name": "koyambedu", "line": true},
}
## Life places (not home: the player starts there) with the points that travel with them: the gym's
## juice shop and the cinema's Ravi are the stories' other places.
const PLACE_SITES := {
	"hospital": {"at": [3598.0, 242.0], "name": "kellys", "keys": [[311.4, 45.2]]},
	"gym": {"at": [1068.0, 4899.0], "name": "west_mambalam", "keys": [[-112.5, -148.7], [-102.4, -270.0]]},
	"mall": {"at": [1171.0, 11980.0], "name": "velachery", "keys": [[156.6, -301.2]]},
	"cinema": {"at": [-689.0, 3114.0], "name": "saligramam", "keys": [[314.8, -29.1], [157.4, -60.3]]},
}
const MAIN: Array[StringName] = [&"primary", &"secondary", &"tertiary"]
const DRIVABLE: Array[StringName] = [&"primary", &"secondary", &"tertiary", &"residential", &"service"]

var _regional: RegionalWorldSource
var _layouts: CityLayouts
var _districts: Array[Place] = []
## Jobs and places (G-453) also keep off raised roads and anything named like a flyover or bridge: a
## passenger is not dropped on one. The stages were baked without it and stay as they were.
var _strict := false
var _graphs: Dictionary = {}


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	_regional = RegionalWorldSource.new()
	var err := _regional.open_index()
	if err != "":
		printerr(err)
		quit(1)
		return
	_layouts = CityLayouts.create(_regional)
	var content: Dictionary = JSON.parse_string(FileAccess.get_file_as_string("res://src/missions/content/content.json"))
	if "jobs" in OS.get_cmdline_user_args():
		_strict = true
		_run_jobs(content)
		return
	var out := {}
	for m: Dictionary in content["missions"]:
		var id := str(m["id"])
		if not SITES.has(id):
			continue
		var res := _site(m, content, SITES[id])
		if res.is_empty():
			printerr("%s: could not be placed" % id)
			quit(1)
			return
		out[id] = res
	var f := FileAccess.open("res://tools/rules/stage_sites.json", FileAccess.WRITE)
	f.store_string(JSON.stringify(out, "\t", false) + "\n")
	f.close()
	quit(0)


## The city jobs and the life places (G-453): `tools/rules/job_sites.json`.
func _run_jobs(content: Dictionary) -> void:
	var jobs := {}
	for j: Dictionary in content["jobs"]:
		var id := str(j["id"])
		if not JOB_SITES.has(id):
			continue
		var keys: Array[Vector2] = []
		for st: Dictionary in j["stops"]:
			var p := Vector2(float(st["x"]), float(st["z"]))
			if not keys.any(func(k: Vector2) -> bool: return k.distance_to(p) < 0.05):
				keys.append(p)
		var res := _cluster_entry(keys, JOB_SITES[id], id)
		if res.is_empty():
			printerr("%s: could not be placed" % id)
			quit(1)
			return
		jobs[id] = res
	var places := {}
	for id: String in PLACE_SITES:
		var spec: Dictionary = PLACE_SITES[id]
		var keys: Array[Vector2] = []
		for k: Array in spec["keys"]:
			keys.append(Vector2(float(k[0]), float(k[1])))
		var res := _cluster_entry(keys, spec, id)
		if res.is_empty():
			printerr("%s: could not be placed" % id)
			quit(1)
			return
		places[id] = res
	var f := FileAccess.open("res://tools/rules/job_sites.json", FileAccess.WRITE)
	f.store_string(JSON.stringify({"jobs": jobs, "places": places}, "\t", false) + "\n")
	f.close()
	quit(0)


## One cluster as the JSON entry: each point with its kerb, road, district, heading and the spot a
## vehicle can be parked behind it.
func _cluster_entry(keys: Array[Vector2], spec: Dictionary, id: String) -> Dictionary:
	var cl := _cluster(keys, spec)
	if cl.is_empty():
		return {}
	var pts: Array[Dictionary] = []
	pts.assign(cl["pts"])
	var points: Array = []
	for i in pts.size():
		var hit := pts[i]
		var spot := Vector2(hit["x"], hit["z"])
		var kerb := FareSpots.kerb_spot(_layout_at(spot), spot)
		points.append({"from": [keys[i].x, keys[i].y], "x": snappedf(spot.x, 0.1), "z": snappedf(spot.y, 0.1), "kerb": [snappedf(kerb.x, 0.1), snappedf(kerb.y, 0.1)], "road": hit["road"], "kind": hit["kind"], "width": hit["width"], "district": _district_at(spot), "heading": hit["heading"], "park": hit["park"]})
	# How far apart consecutive points are by road, before and after (the job's clock is scaled by the ratio).
	var old_road := 0.0
	var new_road := 0.0
	for i in range(1, points.size()):
		var o := _road_length(keys[i - 1], keys[i])
		var n := _road_length(Vector2(points[i - 1]["x"], points[i - 1]["z"]), Vector2(points[i]["x"], points[i]["z"]))
		old_road += o if o > 0.0 else keys[i - 1].distance_to(keys[i]) * 1.3
		new_road += n if n > 0.0 else Vector2(points[i - 1]["x"], points[i - 1]["z"]).distance_to(Vector2(points[i]["x"], points[i]["z"])) * 1.3
	print("%-18s road %5.0f m (was %5.0f)" % [id, new_road, old_road])
	print("%-18s rot %3d  score %6.1f  %s" % [id, roundi(rad_to_deg(float(cl["rot"]))), float(cl["score"]), points.map(func(p: Dictionary) -> String: return "(%d, %d) %s, %s" % [p["x"], p["z"], p["road"], p["district"]])])
	return {"rot": snappedf(rad_to_deg(float(cl["rot"])), 1.0), "points": points, "road_m": snappedf(new_road, 1.0), "was_road_m": snappedf(old_road, 1.0)}


func _site(m: Dictionary, content: Dictionary, spec: Dictionary) -> Dictionary:
	var objectives: Array = m["objectives"]
	# The distinct places of the stage, in order of first use (a "defeat" stands where its "reach" did).
	var keys: Array[Vector2] = []
	for o: Dictionary in objectives:
		if o.has("x"):
			var p := Vector2(float(o["x"]), float(o["z"]))
			if not keys.any(func(k: Vector2) -> bool: return k.distance_to(p) < 0.05):
				keys.append(p)
	var cl := _cluster(keys, spec)
	if cl.is_empty():
		return {}
	var best_rot: float = cl["rot"]
	var best_score: float = cl["score"]
	var best_pts: Array[Dictionary] = []
	best_pts.assign(cl["pts"])
	# Things tied to a marker move with it: the enemies of its group and the vehicles parked beside.
	var points: Array = []
	for i in best_pts.size():
		var hit := best_pts[i]
		var spot := Vector2(hit["x"], hit["z"])
		var kerb := FareSpots.kerb_spot(_layout_at(spot), spot)
		var entry := {"from": [keys[i].x, keys[i].y], "x": snappedf(spot.x, 0.1), "z": snappedf(spot.y, 0.1), "kerb": [snappedf(kerb.x, 0.1), snappedf(kerb.y, 0.1)], "road": hit["road"], "kind": hit["kind"], "width": hit["width"], "district": _district_at(spot), "heading": hit["heading"], "park": hit["park"]}
		points.append(entry)
	var groups := {}
	for o: Dictionary in objectives:
		if o.get("type", "") == "defeat" and o.has("group"):
			var gid := str(o["group"])
			var idx := _key_index(keys, Vector2(float(o["x"]), float(o["z"])))
			var base := Vector2(points[idx]["x"], points[idx]["z"])
			var members: Array = []
			for e: Dictionary in content["enemies"][gid]:
				var off := Vector2(float(e["x"]), float(e["z"])) - keys[idx]
				var p := base + off.rotated(best_rot)
				var tries := 0
				while _in_building(p) and tries < 12:
					tries += 1
					p = base + (off.rotated(best_rot) * (1.0 - 0.08 * tries))
				members.append({"x": snappedf(p.x, 0.1), "z": snappedf(p.y, 0.1)})
			groups[gid] = members
	print("%-18s rot %3d  score %6.1f  %s" % [m["id"], roundi(rad_to_deg(best_rot)), best_score, points.map(func(p: Dictionary) -> String: return "(%d, %d) %s, %s" % [p["x"], p["z"], p["road"], p["district"]])])
	return {"rot": snappedf(rad_to_deg(best_rot), 1.0), "points": points, "groups": groups}


## The keys (distinct points, the first is the anchor) moved as a whole to the district at `spec.at`:
## the anchor on the nearest main road, the others at their original distances and bearings as far as
## the roads allow. {rot, score, pts} or {}.
func _cluster(keys: Array[Vector2], spec: Dictionary) -> Dictionary:
	if bool(spec.get("line", false)):
		return _line(keys, spec)
	var centre := Vector2(float(spec["at"][0]), float(spec["at"][1]))
	var first := _snap(centre, 700.0, MAIN)
	if first.is_empty():
		first = _snap(centre, 1500.0, DRIVABLE)
	if first.is_empty():
		return {}
	var best_rot := 0.0
	var best_score := INF
	var best_pts: Array[Dictionary] = []
	for step in 24:
		var rot := deg_to_rad(15.0 * step)
		var pts: Array[Dictionary] = [first]
		var score := 0.0
		var ok := true
		for k in range(1, keys.size()):
			var want: Vector2 = Vector2(first["x"], first["z"]) + (keys[k] - keys[0]).rotated(rot)
			var hit := _snap(want, 180.0, MAIN)
			if hit.is_empty():
				hit = _snap(want, 180.0, DRIVABLE)
			if hit.is_empty():
				ok = false
				break
			var here := Vector2(hit["x"], hit["z"])
			score += here.distance_to(want) + 2.0 * absf(here.distance_to(Vector2(first["x"], first["z"])) - keys[k].distance_to(keys[0]))
			pts.append(hit)
		if ok and score < best_score:
			best_score = score
			best_rot = rot
			best_pts = pts
	if best_pts.is_empty():
		return {}
	return {"rot": best_rot, "score": best_score, "pts": best_pts}


func _key_index(keys: Array[Vector2], p: Vector2) -> int:
	for i in keys.size():
		if keys[i].distance_to(p) < 0.05:
			return i
	return 0


func _layout_at(p: Vector2) -> CityLayout:
	return _layouts.layout_for(_regional.cell_at(p))


func _in_building(p: Vector2) -> bool:
	for b in _regional.read_chunk(_regional.cell_at(p)).buildings:
		if StreetFurniture.point_in_polygon(p, b.outline):
			return true
	return false


## The nearest point of a road of these kinds within `reach` of `want`, slid along the road to a
## spot where neither it, its kerb nor the vehicle parked behind it is inside a building.
func _snap(want: Vector2, reach: float, kinds: Array[StringName]) -> Dictionary:
	var best_d := INF
	var road_found: Road = null
	var seg := 0
	var foot := Vector2.ZERO
	for road in _regional.roads_near(want, reach):
		if not kinds.has(road.kind) or road.tunnel or road.bridge:
			continue
		if _strict and (road.is_raised() or _is_crossing_name(road.name)):
			continue
		for i in range(road.points.size() - 1):
			var q := Geometry2D.get_closest_point_to_segment(want, road.points[i], road.points[i + 1])
			var d := q.distance_to(want)
			if d < best_d:
				best_d = d
				road_found = road
				seg = i
				foot = q
	if road_found == null or best_d > reach:
		return {}
	for d: float in [0.0, 6.0, -6.0, 12.0, -12.0, 20.0, -20.0, 30.0, -30.0, 45.0, -45.0, 60.0, -60.0, 90.0, -90.0]:
		var at := _walk(road_found, seg, foot, d)
		var p := FareSpots.round_tenth(at["point"])
		var kerb := FareSpots.kerb_spot(_layout_at(p), p)
		var behind := _walk(road_found, int(at["seg"]), at["point"], -14.0)
		var parked := FareSpots.round_tenth(behind["point"])
		if _in_building(p) or _in_building(kerb) or _in_building(parked):
			continue
		var heading: float = at["heading"]
		var back_heading: float = behind["heading"]
		return {"x": p.x, "z": p.y, "road": road_found.name, "kind": str(road_found.kind), "width": road_found.width, "heading": snappedf(heading, 0.001), "park": [parked.x, parked.y, snappedf(back_heading, 0.001)]}
	return {}


## A bus's stops all stand on one main road, at their original spacing along it (a bus cannot serve
## stops that only look near each other: they would be on different, unjoined streets). The road is the
## one nearest the district's centre long enough to hold them all.
func _line(keys: Array[Vector2], spec: Dictionary) -> Dictionary:
	var centre := Vector2(float(spec["at"][0]), float(spec["at"][1]))
	var gaps: Array[float] = [0.0]
	for k in range(1, keys.size()):
		gaps.append(gaps[k - 1] + keys[k - 1].distance_to(keys[k]))
	var span: float = gaps[gaps.size() - 1]
	var best: Road = null
	var best_d := INF
	for road in _regional.roads_near(centre, 2000.0):
		if not MAIN.has(road.kind) or road.tunnel or road.bridge or road.is_raised() or _is_crossing_name(road.name):
			continue
		var length := 0.0
		for i in range(road.points.size() - 1):
			length += road.points[i].distance_to(road.points[i + 1])
		if length < span + 80.0:
			continue
		var d := INF
		for i in range(road.points.size() - 1):
			d = minf(d, Geometry2D.get_closest_point_to_segment(centre, road.points[i], road.points[i + 1]).distance_to(centre))
		if d < best_d:
			best_d = d
			best = road
	if best == null:
		return {}
	var total := 0.0
	var foot_at := 0.0
	var walked := 0.0
	var near := INF
	for i in range(best.points.size() - 1):
		var q := Geometry2D.get_closest_point_to_segment(centre, best.points[i], best.points[i + 1])
		if q.distance_to(centre) < near:
			near = q.distance_to(centre)
			foot_at = walked + best.points[i].distance_to(q)
		walked += best.points[i].distance_to(best.points[i + 1])
	total = walked
	var start := clampf(foot_at - span / 2.0, 20.0, total - span - 20.0)
	for shift: float in [0.0, 10.0, -10.0, 20.0, -20.0, 40.0, -40.0, 80.0, -80.0]:
		var s0 := clampf(start + shift, 10.0, maxf(10.0, total - span - 10.0))
		var pts: Array[Dictionary] = []
		var clear := true
		for k in keys.size():
			var at := _walk(best, 0, best.points[0], s0 + gaps[k])
			var p := FareSpots.round_tenth(at["point"])
			var kerb := FareSpots.kerb_spot(_layout_at(p), p)
			if _in_building(p) or _in_building(kerb):
				clear = false
				break
			var behind := _walk(best, int(at["seg"]), at["point"], -14.0)
			var parked := FareSpots.round_tenth(behind["point"])
			if k == 0 and _in_building(parked):
				clear = false
				break
			pts.append({"x": p.x, "z": p.y, "road": best.name, "kind": str(best.kind), "width": best.width, "heading": snappedf(float(at["heading"]), 0.001), "park": [parked.x, parked.y, snappedf(float(behind["heading"]), 0.001)]})
		if clear:
			return {"rot": 0.0, "score": 0.0, "pts": pts}
	return {}


## Length of the shortest drive between two points over the drivable roads of the layout round them
## (ignoring one-way rules), metres; -1 when no road joins them. A job's clock is scaled by how much
## longer its new road run is than the old one.
func _road_length(a: Vector2, b: Vector2) -> float:
	var layout := _layout_at(a)
	var g: Dictionary = _graphs.get(layout.get_instance_id(), {})
	if g.is_empty():
		var index: Dictionary[int, int] = {}
		var pos := PackedVector2Array()
		var adj: Array[PackedInt32Array] = []
		var len: Array[PackedFloat32Array] = []
		for road in layout.roads:
			if not DRIVABLE.has(road.kind) or road.tunnel:
				continue
			var prev := -1
			for p in road.points:
				var key := CityLayout.node_key(p)
				if not index.has(key):
					index[key] = pos.size()
					pos.append(p)
					adj.append(PackedInt32Array())
					len.append(PackedFloat32Array())
				var at: int = index[key]
				if prev >= 0 and prev != at:
					var d := pos[prev].distance_to(pos[at])
					adj[prev].append(at)
					len[prev].append(d)
					adj[at].append(prev)
					len[at].append(d)
				prev = at
		g = {"pos": pos, "adj": adj, "len": len}
		_graphs[layout.get_instance_id()] = g
	var pos: PackedVector2Array = g["pos"]
	var adj: Array[PackedInt32Array] = g["adj"]
	var len: Array[PackedFloat32Array] = g["len"]
	var from := _nearest_node(pos, a)
	var to := _nearest_node(pos, b)
	if from < 0 or to < 0:
		return -1.0
	var dist := {}
	var open: Array[Vector2] = [Vector2(0.0, float(from))]
	dist[from] = 0.0
	var done := {}
	while not open.is_empty():
		# The nearest open node (a linear scan: a few hundred open nodes at most within the cut-off).
		var best := 0
		for i in open.size():
			if open[i].x < open[best].x:
				best = i
		var top := open[best]
		open[best] = open[open.size() - 1]
		open.pop_back()
		var u := int(top.y)
		if done.has(u):
			continue
		done[u] = true
		if u == to:
			return top.x
		if top.x > 9000.0:
			break
		for k in adj[u].size():
			var v := adj[u][k]
			var nd := top.x + len[u][k]
			if not dist.has(v) or nd < float(dist[v]):
				dist[v] = nd
				open.append(Vector2(nd, float(v)))
	return -1.0


func _nearest_node(pos: PackedVector2Array, p: Vector2) -> int:
	var best := -1
	var best_d := 60.0
	for i in pos.size():
		var d := pos[i].distance_to(p)
		if d < best_d:
			best_d = d
			best = i
	return best


static func _is_crossing_name(n: String) -> bool:
	var lower := n.to_lower()
	for word: String in ["flyover", "bridge", "subway", "overpass", "underpass"]:
		if lower.contains(word):
			return true
	return false


func _district_at(p: Vector2) -> String:
	var index := _regional.index_at(p)
	if index == null:
		return ""
	var best := ""
	var best_d := INF
	for d: Place in index.districts:
		var dist := d.position.distance_to(p)
		if dist < best_d:
			best_d = dist
			best = d.name
	return best


## The point `d` metres along a road from `from` on segment `seg` (negative: backwards).
func _walk(road: Road, seg: int, from: Vector2, d: float) -> Dictionary:
	var pts := road.points
	var at := from
	var i := seg
	var left := absf(d)
	var forward := d >= 0.0
	while left > 0.0:
		var target := pts[i + 1] if forward else pts[i]
		var gap := at.distance_to(target)
		if gap >= left:
			at = at.move_toward(target, left)
			left = 0.0
		else:
			left -= gap
			at = target
			if forward:
				if i + 1 >= pts.size() - 1:
					break
				i += 1
			else:
				if i == 0:
					break
				i -= 1
	var a := pts[i]
	var b := pts[i + 1]
	return {"point": at, "seg": i, "heading": atan2(-(b.x - a.x), -(b.y - a.y))}
