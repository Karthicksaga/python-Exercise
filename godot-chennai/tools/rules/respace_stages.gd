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
const MAIN: Array[StringName] = [&"primary", &"secondary", &"tertiary"]
const DRIVABLE: Array[StringName] = [&"primary", &"secondary", &"tertiary", &"residential", &"service"]

var _regional: RegionalWorldSource
var _layouts: CityLayouts
var _districts: Array[Place] = []


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


func _site(m: Dictionary, content: Dictionary, spec: Dictionary) -> Dictionary:
	var objectives: Array = m["objectives"]
	# The distinct places of the stage, in order of first use (a "defeat" stands where its "reach" did).
	var keys: Array[Vector2] = []
	for o: Dictionary in objectives:
		if o.has("x"):
			var p := Vector2(float(o["x"]), float(o["z"]))
			if not keys.any(func(k: Vector2) -> bool: return k.distance_to(p) < 0.05):
				keys.append(p)
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
