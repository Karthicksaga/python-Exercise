## G-280: the 26 stages are spread over the whole city. Consecutive stages start 2 to 8 km from
## where the last one ended, the places are in many districts, and every marker, kerb, enemy and
## parked vehicle of the stages that were moved stands on a street, outside buildings, on ground
## the regional (format 2) world has loaded. New (Godot) cases; the owner's phone report.
extends "res://tests/unit/rules/rules_test.gd"

var c := GameContent.load_file()
var _src: RegionalWorldSource = null
var _layouts: CityLayouts = null

const MIN_GAP := 2000.0
const MAX_GAP := 8200.0
## The stages that stay in Anna Nagar because their fiction is there (the walk from home, the
## cross-town race, Tower Park, the Roundtana) and the vehicle stages whose vehicle is parked
## at the first marker.
const HOME := ["morning-walk", "cross-town", "park-trouble", "roundtana-showdown"]
const MOVED := ["borrowed-wheels", "auto-shift", "parcel-run", "bike-courier", "bike-thieves", "godown-raid", "tea-shop", "turf-war", "planted-chain", "beach-road-brawl"]
const PARKED_FOR := {"auto-shift": "auto-park", "parcel-run": "car-chetpet", "bike-courier": "bike-saidapet", "bike-thieves": "bike-kodambakkam"}


func src() -> RegionalWorldSource:
	if _src == null:
		_src = RegionalWorldSource.new()
		_src.open_index()
	return _src


func layouts() -> CityLayouts:
	if _layouts == null:
		_layouts = CityLayouts.create(src())
	return _layouts


func all_stages() -> Array[MissionData.Mission]:
	var out: Array[MissionData.Mission] = []
	out.append_array(c.missions)
	out.append_array(c.extras)
	return out


## Every place an objective names, in order (a chase or tail by its first point).
func places(m: MissionData.Mission) -> Array[Vector2]:
	var out: Array[Vector2] = []
	for o in m.objectives:
		match o.type:
			"reach", "defeat", "fragile", "hazard_zone":
				out.append(Vector2(o.x, o.z))
			"chase", "tail":
				if not o.path.is_empty():
					out.append(Vector2(float(o.path[0]["x"]), float(o.path[0]["z"])))
	return out


func road_distance(p: Vector2) -> float:
	var best := INF
	for r in src().roads_near(p, 80.0):
		if r.kind == &"footway":
			continue
		for i in range(r.points.size() - 1):
			best = minf(best, Geometry2D.get_closest_point_to_segment(p, r.points[i], r.points[i + 1]).distance_to(p))
	return best


func inside_building(p: Vector2) -> bool:
	for b in src().read_chunk(src().cell_at(p)).buildings:
		if StreetFurniture.point_in_polygon(p, b.outline):
			return true
	return false


func district_of(p: Vector2) -> String:
	var index := src().index_at(p)
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


## The owner's bug: the next mission is far away, but not on the other side of the region.
func test_consecutive_stages_start_two_to_eight_km_from_the_last_end() -> bool:
	var list := all_stages()
	eq(list.size(), 26)
	var prev_end := Vector2.INF
	for m in list:
		var spots := places(m)
		ok(not spots.is_empty(), "%s has places" % m.id)
		if spots.is_empty():
			continue
		if prev_end != Vector2.INF:
			var gap := prev_end.distance_to(spots[0])
			ge(gap, MIN_GAP, "stage %d %s starts %.0f m from the last end" % [m.stage, m.id, gap])
			le(gap, MAX_GAP, "stage %d %s starts %.0f m from the last end" % [m.stage, m.id, gap])
		prev_end = spots[spots.size() - 1]
	return true


func test_the_stages_are_numbered_in_play_order() -> bool:
	var n := 0
	for m in all_stages():
		n += 1
		eq(m.stage, n, m.id)
	return true


func test_the_stages_cover_the_city_in_many_districts() -> bool:
	var districts := {}
	var box := Rect2()
	var first := true
	for m in all_stages():
		for p in places(m):
			districts[district_of(p)] = true
			box = Rect2(p, Vector2.ZERO) if first else box.expand(p)
			first = false
	districts.erase("")
	ge(float(districts.size()), 15.0, "districts used: %s" % str(districts.keys()))
	ge(box.size.x, 10000.0, "spread east to west")
	ge(box.size.y, 10000.0, "spread north to south")
	# No longer a cluster round the start: most stages begin well away from home.
	var far := 0
	for m in all_stages():
		if places(m)[0].distance_to(Vector2(c.spawn["x"], c.spawn["z"])) > 2000.0:
			far += 1
	ge(float(far), 20.0, "stages that begin more than 2 km from the start")
	for id: String in HOME:
		lt(places(c.any_mission(id))[0].distance_to(Vector2(c.spawn["x"], c.spawn["z"])), 600.0, "%s stays at home" % id)
	return true


## Everything a moved stage places is on loaded ground, on a street and not in a building.
func test_moved_stages_stand_on_loaded_streets_outside_buildings() -> bool:
	eq(src().error, "")
	var bounds := src().get_bounds()
	var checked := 0
	for id: String in MOVED:
		var m := c.any_mission(id)
		for o in m.objectives:
			if o.type != "reach" and o.type != "defeat":
				continue
			var p := Vector2(o.x, o.z)
			checked += 1
			ok(bounds.has_point(p) and src().index_at(p) != null, "%s: %s is inside loaded world data" % [id, o.label.left(30)])
			lt(road_distance(p), 12.0, "%s: %s is on a street" % [id, o.label.left(30)])
			no(inside_building(p), "%s: %s is not in a building" % [id, o.label.left(30)])
			var chunk := src().read_chunk(src().cell_at(p))
			ok(chunk.ok(), "%s: the chunk under %s decodes" % [id, o.label.left(30)])
			for stop: Variant in [o.fare, o.goods]:
				if stop == null:
					continue
				var kerb := Vector2(float(stop.kerb_x), float(stop.kerb_z))
				checked += 1
				lt(road_distance(kerb), 20.0, "%s: kerb near a street" % id)
				no(inside_building(kerb), "%s: kerb not in a building" % id)
				lt(kerb.distance_to(p), o.radius + 22.0, "%s: a short walk to the kerb" % id)
			if o.type == "defeat":
				for e: EnemySpot in c.enemies[o.group]:
					var q := Vector2(e.x, e.z)
					checked += 1
					lt(q.distance_to(p), 30.0, "%s: %s's enemy is at the marker" % [id, o.group])
					no(inside_building(q), "%s: an enemy of %s is not in a building" % [id, o.group])
	gt(float(checked), 40.0, "many points checked")
	return true


func test_the_vehicles_for_moved_stages_wait_at_their_first_marker() -> bool:
	for id: String in PARKED_FOR:
		var spot := c.parked(PARKED_FOR[id])
		ok(not spot.is_empty(), "%s: %s is parked" % [id, PARKED_FOR[id]])
		if spot.is_empty():
			continue
		var p := Vector2(float(spot["x"]), float(spot["z"]))
		lt(p.distance_to(places(c.any_mission(id))[0]), 30.0, "%s: the vehicle is at the first marker" % id)
		lt(road_distance(p), 12.0, "%s: on a street" % id)
		no(inside_building(p), "%s: not in a building" % id)
	return true


## The kerb of every moved stop is what the port of `kerbSpot` gives on the regional layout (the
## v1 box does not reach Perambur or Besant Nagar, so `test_content_on_map.gd` uses it only inside).
func test_moved_kerbs_are_reproduced_on_the_regional_layout() -> bool:
	var count := 0
	for id: String in MOVED:
		for o in c.any_mission(id).objectives:
			for stop: Variant in [o.fare, o.goods]:
				if o.type != "reach" or stop == null:
					continue
				count += 1
				var at := Vector2(o.x, o.z)
				var layout := layouts().layout_for(src().cell_at(at))
				var kerb := FareSpots.kerb_spot_hinted(layout, at, int(stop.kerb_side), float(stop.kerb_shift))
				lt(kerb.distance_to(Vector2(float(stop.kerb_x), float(stop.kerb_z))), 0.15, "%s: %s kerb" % [id, o.label.left(24)])
	ge(float(count), 6.0)
	return true
