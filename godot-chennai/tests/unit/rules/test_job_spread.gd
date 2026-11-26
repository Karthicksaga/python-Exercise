## G-453: the city jobs, the life places and the stories are spread over the districts like the 26
## stages (`test_stage_spread.gd`). Each job is a cluster of its own (its stops keep 0.5 to 3 km), in
## a district of its own; the hospital, gym, mall and cinema are in four more districts, away from
## home; the stories follow their places; every point is on a street, outside buildings, on ground
## the regional world decodes. New (Godot) cases; the owner's phone report.
extends "res://tests/unit/rules/rules_test.gd"

var c := GameContent.load_file()
var _src: RegionalWorldSource = null

## `share-auto` stays on 2nd Avenue (a recorded Anna Nagar road line), the three far jobs were
## placed by hand long ago; the rest moved (`tools/rules/respace_stages.gd -- jobs`).
const STAYED := ["share-auto"]
const FAR_ALREADY := ["marina-evening", "egmore-transfer", "mount-road-bus"]
const MOVED_PLACES := ["hospital", "gym", "mall", "cinema"]
## No gap between two stops of one job may be one of the stages' 2 to 8 km drives.
const MAX_GAP := 3000.0
const MIN_SPAN := 500.0  # chain of gaps
const MAX_SPAN := 3500.0
const MIN_DISTRICTS := 8


func src() -> RegionalWorldSource:
	if _src == null:
		_src = RegionalWorldSource.new()
		_src.open_index()
	return _src


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


func spawn() -> Vector2:
	return Vector2(float(c.spawn["x"]), float(c.spawn["z"]))


func first_stop(j: JobData.Job) -> Vector2:
	return Vector2(j.stops[0].x, j.stops[0].z)


func test_every_job_is_in_a_district_of_its_own_and_at_least_eight_are_used() -> bool:
	eq(c.jobs.size(), 13)
	var by_district := {}
	for j in c.jobs:
		var d := district_of(first_stop(j))
		ok(d != "", "%s starts in a district" % j.id)
		if j.id in STAYED:
			continue
		ok(not by_district.has(d), "%s: district %s is not another job's (%s)" % [j.id, d, by_district.get(d, "")])
		by_district[d] = j.id
	var all := {}
	for j in c.jobs:
		all[district_of(first_stop(j))] = true
	ge(float(all.size()), float(MIN_DISTRICTS), "jobs start in at least %d districts: %s" % [MIN_DISTRICTS, str(all.keys())])
	return true


func test_a_jobs_stops_are_its_own_cluster_not_a_drive_across_the_city() -> bool:
	for j in c.jobs:
		if j.stops.size() < 2:
			continue
		for i in range(1, j.stops.size()):
			var gap := Vector2(j.stops[i - 1].x, j.stops[i - 1].z).distance_to(Vector2(j.stops[i].x, j.stops[i].z))
			if j.id in FAR_ALREADY and gap > MAX_GAP:
				continue
			le(gap, MAX_GAP, "%s: stop %d is %.0f m from the one before" % [j.id, i, gap])
		if j.id in FAR_ALREADY:
			continue
		# The whole chain, stop to stop (the lunch round ends 400 m from where it began).
		var chain := 0.0
		var farthest := 0.0
		for i in range(1, j.stops.size()):
			chain += Vector2(j.stops[i - 1].x, j.stops[i - 1].z).distance_to(Vector2(j.stops[i].x, j.stops[i].z))
			farthest = maxf(farthest, first_stop(j).distance_to(Vector2(j.stops[i].x, j.stops[i].z)))
		ge(chain, MIN_SPAN, "%s: the stops are %.0f m of drive apart" % [j.id, chain])
		le(farthest, MAX_SPAN, "%s: no stop is more than %.0f m from the first" % [j.id, farthest])
	return true


func test_jobs_are_away_from_home_and_wait_for_the_player_at_their_start() -> bool:
	var moved := 0
	for j in c.jobs:
		if j.id in STAYED:
			continue
		if j.id not in FAR_ALREADY:
			moved += 1
			gt(first_stop(j).distance_to(spawn()), 2000.0, "%s starts more than 2 km from home" % j.id)
		ge(j.start_radius, 1.0, "%s: the clock waits until the vehicle is at the start" % j.id)
		var parked := {}
		for spot in c.parking:
			var p := Vector2(float(spot["x"]), float(spot["z"]))
			if str(spot["kind"]) == j.vehicle and p.distance_to(first_stop(j)) < minf(j.start_radius, 200.0):
				parked = spot
		ok(not parked.is_empty(), "%s: a %s is parked at the start" % [j.id, j.vehicle])
	eq(moved, 9, "nine jobs moved")
	return true


## Everything a moved job places is on loaded ground, on a street and not in a building.
func test_moved_jobs_stand_on_loaded_streets_outside_buildings() -> bool:
	eq(src().error, "")
	var bounds := src().get_bounds()
	var checked := 0
	for j in c.jobs:
		if j.id in STAYED or j.id in FAR_ALREADY:
			continue
		for s in j.stops:
			var p := Vector2(s.x, s.z)
			checked += 1
			ok(bounds.has_point(p) and src().index_at(p) != null, "%s: %s is inside loaded world data" % [j.id, s.label.left(30)])
			lt(road_distance(p), 12.0, "%s: %s is on a street" % [j.id, s.label.left(30)])
			no(inside_building(p), "%s: %s is not in a building" % [j.id, s.label.left(30)])
			ok(src().read_chunk(src().cell_at(p)).ok(), "%s: the chunk under %s decodes" % [j.id, s.label.left(30)])
			for stop: Variant in [s.fare, s.goods]:
				if stop == null:
					continue
				var kerb := Vector2(float(stop.kerb_x), float(stop.kerb_z))
				checked += 1
				lt(road_distance(kerb), 20.0, "%s: kerb near a street" % j.id)
				no(inside_building(kerb), "%s: kerb not in a building" % j.id)
				lt(kerb.distance_to(p), s.radius + 22.0, "%s: a short walk to the kerb" % j.id)
	gt(float(checked), 40.0, "many points checked")
	return true


func test_bus_stops_stand_one_after_another_on_one_road() -> bool:
	for id: String in ["bus-route", "evening-bus"]:
		var j := c.job(id)
		for i in range(1, j.stops.size()):
			var a := Vector2(j.stops[i - 1].x, j.stops[i - 1].z)
			var b := Vector2(j.stops[i].x, j.stops[i].z)
			ge(a.distance_to(b), 150.0, "%s: stop %d is a real stop apart" % [id, i])
			le(a.distance_to(b), 450.0, "%s: but the next one is near" % id)
			gt(j.stops[i].due, j.stops[i - 1].due, "%s: due times rise" % id)
	return true


func test_life_places_are_in_four_districts_away_from_home() -> bool:
	var seen := {}
	for id: String in MOVED_PLACES:
		var place := c.place(id)
		var p := Vector2(float(place["x"]), float(place["z"]))
		var d := district_of(p)
		ok(d != "" and not seen.has(d), "%s: its own district (%s)" % [id, d])
		seen[d] = true
		gt(p.distance_to(spawn()), 2000.0, "%s is more than 2 km from home" % id)
		ok(src().index_at(p) != null and src().read_chunk(src().cell_at(p)).ok(), "%s: on loaded ground" % id)
		lt(road_distance(p), 25.0, "%s: by a street" % id)
		no(inside_building(p), "%s: outside buildings" % id)
	var home := c.place("home")
	lt(Vector2(float(home["x"]), float(home["z"])).distance_to(spawn()), 60.0, "home stays where the game starts")
	eq(seen.size(), 4)
	return true


func test_the_stories_follow_their_places() -> bool:
	var home := Vector2(float(c.place("home")["x"]), float(c.place("home")["z"]))
	var checked := 0
	for st in c.stories:
		for step in st.steps:
			if step.type == "activity":
				var place_id := (step as StoryRunner.Step).place
				var pl: Dictionary = c.place(place_id)
				eq(Vector2(step.x, step.z), Vector2(float(pl["x"]), float(pl["z"])), "%s: the %s step is at the place" % [st.id, place_id])
				checked += 1
			elif step.type == "reach" and not (is_equal_approx(step.x, home.x) and is_equal_approx(step.z, home.y)):
				var near := INF
				for id: String in MOVED_PLACES:
					var pl := c.place(id)
					near = minf(near, Vector2(step.x, step.z).distance_to(Vector2(float(pl["x"]), float(pl["z"]))))
				lt(near, 600.0, "%s: %s is by a place, not left in Anna Nagar" % [st.id, step.label.left(30)])
				no(inside_building(Vector2(step.x, step.z)), "%s: %s is outside buildings" % [st.id, step.label.left(30)])
				lt(road_distance(Vector2(step.x, step.z)), 25.0, "%s: %s is by a street" % [st.id, step.label.left(30)])
				checked += 1
	ge(float(checked), 5.0, "story points checked")
	# The way home from the hospital takes as long as it is: the old 139 s was for 300 m.
	var paati := c.stories.filter(func(s: StoryRunner.Story) -> bool: return s.id == "paati-checkup")[0] as StoryRunner.Story
	var last: MissionData.Objective = paati.steps[paati.steps.size() - 1]
	var road := Vector2(last.x, last.z).distance_to(Vector2(float(c.place("hospital")["x"]), float(c.place("hospital")["z"])))
	ge(last.time_limit, road / 12.0, "Paati's way home leaves time for the %.0f m" % road)
	return true
