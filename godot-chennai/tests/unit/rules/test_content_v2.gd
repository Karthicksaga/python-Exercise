## The five new missions (docs/mission-design.md §4, G-145) as data: shape, route choices, goals,
## no brands, and every marker on the real map: roads and buildings of the regional (format 2)
## world, which is also the W5 check for the existing 21 stages and 13 jobs. New (Godot) cases.
extends "res://tests/unit/rules/rules_test.gd"

var c := GameContent.load_file()
var _src: RegionalWorldSource = null

const IDS := ["hall-ticket", "sambar-sixty", "wrong-number", "monsoon-night", "the-bandh"]
## Words that must not appear: brands and real businesses (the content is original).
const BANNED := ["google", "uber", "ola ", "swiggy", "zomato", "amazon", "flipkart", "starbucks", "mcdonald", "kfc", "domino", "apollo", "fortis", "tata", "reliance", "airtel", "jio", "hdfc", "sbi ", "icici", "saravana", "pothys", "nalli", "murugan idli", "sangeetha", "anjappar", "ponnusamy", "adyar ananda", "bata", "nike", "adidas"]
## Existing content whose marker is not at a street: a park, and railway stations (buildings).
const OFF_STREET := ["park-trouble", "harmonium-thief"]


func src() -> RegionalWorldSource:
	if _src == null:
		_src = RegionalWorldSource.new()
		_src.open_index()
	return _src


func road_distance(p: Vector2, drivable_only: bool = true) -> float:
	var best := INF
	for r in src().roads_near(p, 80.0):
		if drivable_only and r.kind == &"footway":
			continue
		for i in range(r.points.size() - 1):
			best = minf(best, Geometry2D.get_closest_point_to_segment(p, r.points[i], r.points[i + 1]).distance_to(p))
	return best


func inside_building(p: Vector2) -> bool:
	for b in src().read_chunk(src().cell_at(p)).buildings:
		if StreetFurniture.point_in_polygon(p, b.outline):
			return true
	return false


func mission(id: String) -> MissionData.Mission:
	return c.any_mission(id)


# --- Shape ---------------------------------------------------------------------------------------

func test_the_five_missions_are_extras_with_goals_a_checkpoint_and_a_brief() -> bool:
	eq(c.extras.map(func(m: MissionData.Mission) -> String: return m.id), IDS)
	eq(c.extras.map(func(m: MissionData.Mission) -> int: return m.stage), [22, 23, 24, 25, 26])
	for m in c.extras:
		eq(m.kind, "extra", m.id)
		gt(m.brief.length(), 120, "%s has a real brief" % m.id)
		ge(m.reward, 400, m.id)
		ok(m.goals.size() >= 2 and m.goals.size() <= Medals.MAX_GOALS, "%s has 2 or 3 bonus goals" % m.id)
		ok(m.objectives.any(func(o: MissionData.Objective) -> bool: return o.checkpoint), "%s has a checkpoint" % m.id)
		ok(m.objectives[0].type == "enter", "%s starts by getting into its vehicle" % m.id)
		for g in m.goals:
			ok(Medals.RANK.size() > 0 and ["no_damage", "par_time", "time_left", "no_police", "cargo", "quiet_zone", "no_suspicion", "no_retry"].has(str(g["kind"])), "%s: goal %s is a known kind" % [m.id, g["kind"]])
		for o in m.objectives:
			if o.on_fail != "":
				ok(m.objectives.any(func(x: MissionData.Objective) -> bool: return x.id == o.on_fail), "%s: on_fail %s exists" % [m.id, o.on_fail])
			if o.next != "" and o.next != "end":
				ok(m.objectives.any(func(x: MissionData.Objective) -> bool: return x.id == o.next), "%s: next %s exists" % [m.id, o.next])
	return true


func test_each_mission_uses_its_new_mechanic() -> bool:
	var hall := mission("hall-ticket")
	ok(hall.dynamic, "Hall Ticket runs the dynamic events")
	var gate := hall.objectives[2]
	eq(gate.on_fail, "side", "late: the side gate")
	eq(gate.next, "end", "on time: done, the side gate is skipped")
	eq(hall.objectives[3].mode, "foot", "the side gate is reached on foot")
	eq(hall.quiet_zones.size(), 1, "a no-horn hospital zone")
	var sambar := mission("sambar-sixty")
	var carry := sambar.objectives[2]
	eq(carry.type, "fragile")
	ge(carry.rough.size(), 8, "breakers and potholes on both routes")
	ok(carry.rough.any(func(r: Dictionary) -> bool: return r["kind"] == "breaker") and carry.rough.any(func(r: Dictionary) -> bool: return r["kind"] == "pothole"))
	eq(sambar.objectives[1].goods.items, ["vessel"] as Array[String])
	var wrong := mission("wrong-number")
	var tail := wrong.objectives[2]
	eq(tail.type, "tail")
	gt(Chase.path_length(tail.path), 3000.0, "a long tail through Mount Road")
	eq(tail.pauses.size(), 3, "three scooter swaps")
	var choice := wrong.objectives[3]
	eq(choice.type, "choice")
	eq(choice.options.map(func(o: Dictionary) -> String: return o["id"]), ["report", "take"])
	ok(int(choice.options[1].get("wanted", 0)) == 1 and int(choice.options[0].get("reputation", 0)) > 0, "heat for the envelope, reputation for the report")
	var monsoon := mission("monsoon-night")
	eq(monsoon.rain, 1.0, "heavy rain")
	var water := monsoon.objectives[2]
	eq(water.hazards.size(), 3, "three floods")
	ok(water.hazards[0].start < water.hazards[1].start and water.hazards[1].start < water.hazards[2].start, "they come in order")
	eq(water.ruin, "patient_lost")
	ok(monsoon.objectives[1].strict and water.strict, "a wrecked ambulance fails the run")
	var bandh := mission("the-bandh")
	eq(bandh.objectives[2].hazards.size(), 3, "three shut arterials")
	ok(bandh.objectives[2].hazards.all(func(h: HazardZone) -> bool: return h.blocks and h.kind == "strike"))
	eq(bandh.brief_if.keys(), ["took_envelope"], "reacts to Wrong Number")
	eq(c.extras.size(), 5)
	return true


func test_the_content_is_original_no_brands_and_no_children() -> bool:
	var text := FileAccess.get_file_as_string(GameContent.V2_PATH).to_lower()
	for word: String in BANNED:
		ok(not text.contains(word), "no %s in the new missions" % word)
	for word: String in ["child", "kid ", "boy ", "girl ", "baby", "toddler", "school bus", "schoolchild"]:
		ok(not text.contains(word), "no %s: nobody young is anywhere near danger" % word)
	return true


# --- The map (W5) -------------------------------------------------------------------------------

func test_the_new_missions_stand_on_the_streets_of_the_regional_world() -> bool:
	eq(src().error, "")
	eq(src().format, 2)
	var checked := 0
	for m in c.extras:
		for o in m.objectives:
			if o.type == "enter" or o.type == "choice":
				continue
			var points: Array[Vector2] = []
			if o.type == "tail":
				for p: Dictionary in o.path:
					points.append(Vector2(float(p["x"]), float(p["z"])))
			else:
				points.append(Vector2(o.x, o.z))
				if o.goods != null:
					points.append(Vector2(o.goods.kerb_x, o.goods.kerb_z))
				if o.fare != null:
					points.append(Vector2(o.fare.kerb_x, o.fare.kerb_z))
			for p in points:
				checked += 1
				var d := road_distance(p, false)
				lt(d, 20.0 if o.type != "tail" else 8.0, "%s / %s: on a street (%.1f m)" % [m.id, o.label.left(28), d])
				no(inside_building(p), "%s / %s: not inside a building at %s" % [m.id, o.label.left(28), p])
	gt(float(checked), 100.0, "many points checked")
	return true


func test_hazard_zones_and_rough_patches_sit_on_streets() -> bool:
	for m in c.extras:
		for o in m.objectives:
			for h in o.hazards:
				lt(road_distance(Vector2(h.x, h.z), false), 25.0, "%s: %s on a street" % [m.id, h.label])
			for r in o.rough:
				lt(road_distance(Vector2(float(r["x"]), float(r["z"])), false), 8.0, "%s: a %s on a street" % [m.id, r["kind"]])
	return true


func test_the_new_vehicles_are_parked_on_the_street_and_every_extras_vehicle_is_parked() -> bool:
	var ids := ["auto-hall", "auto-sambar", "bike-wrong", "ambulance-monsoon", "bike-bandh"]
	for id: String in ids:
		var spot := c.parked(id)
		ok(not spot.is_empty(), "%s is parked" % id)
		if spot.is_empty():
			continue
		var p := Vector2(float(spot["x"]), float(spot["z"]))
		lt(road_distance(p), 12.0, "%s stands on a street" % id)
		no(inside_building(p), "%s is not inside a building" % id)
	for m in c.extras:
		var kind := str(m.objectives[0].vehicle)
		ok(c.parking.any(func(s: Dictionary) -> bool: return str(s["kind"]) == kind and str(s["id"]).begins_with(kind) and Vector2(float(s["x"]), float(s["z"])).distance_to(Vector2(m.objectives[1].x, m.objectives[1].z)) < 60.0), "%s: a %s waits within 60 m of the first stop" % [m.id, kind])
	return true


func test_anchors_name_their_districts_and_roads() -> bool:
	var anchors: Dictionary = c.anchors["anchors"]
	eq(anchors.size(), 17)
	var index := DistrictIndex.new(_district_list())
	for name: String in anchors:
		var a: Dictionary = anchors[name]
		lt(road_distance(Vector2(float(a["x"]), float(a["z"]))), 2.0, "%s is on its road" % name)
		ok(str(a["road"]) != "" and str(a["district"]) != "", "%s: road and district named" % name)
		var found := index.at(float(a["x"]), float(a["z"]))
		ok(not found.is_empty(), name)
	eq(anchors["hall_lodge"]["district"], "Triplicane")
	eq(anchors["sambar_hall"]["road"], "Venkatakrishna Road")
	eq(anchors["bandh_three"]["road"], "Marina Beach Road")
	return true


func _district_list() -> Array:
	var list: Array = []
	for p: Place in CityTestKit.v1().index_at(Vector2.ZERO).districts:
		list.append({"name": p.name, "kind": str(p.kind), "x": p.position.x, "z": p.position.y})
	return list


func test_existing_stages_and_jobs_stand_on_streets_of_the_regional_world() -> bool:
	var count := 0
	for m in c.missions:
		for o in m.objectives:
			if o.type != "reach" and o.type != "defeat":
				continue
			var p := Vector2(o.x, o.z)
			count += 1
			if OFF_STREET.has(m.id):
				continue
			lt(road_distance(p, false), 60.0, "%s / %s is near a street" % [m.id, o.label.left(30)])
			no(inside_building(p), "%s / %s is not inside a building" % [m.id, o.label.left(30)])
	for j in c.jobs:
		for s in j.stops:
			count += 1
			var q := Vector2(s.x, s.z)
			lt(road_distance(q, false), 20.0, "%s / %s is near a street" % [j.id, s.label.left(30)])
			no(inside_building(q), "%s / %s is not inside a building" % [j.id, s.label.left(30)])
	gt(float(count), 70.0)
	return true


# --- Playing them (scripted) --------------------------------------------------------------------

func _status(o: MissionData.Objective, runner: MissionRunner, mode_hint: String) -> MissionData.PlayerStatus:
	var mode := o.mode if o.mode != "" else mode_hint
	var p := MissionData.PlayerStatus.make(o.x, o.z, mode, 0.0)
	if o.type == "enter":
		p.mode = o.vehicle
	elif o.type == "tail":
		var q: Variant = runner.tail_target()
		var behind := Vector2(float(q["x"]), float(q["z"]))
		p.x = behind.x + 45.0
		p.z = behind.y
		p.mode = mode_hint
		p.speed = 6.0
	return p


func test_each_new_mission_can_be_completed_from_its_own_data() -> bool:
	for id: String in IDS:
		var runner := MissionRunner.new(c.missions, {}, c.extras)
		ok(runner.play(id), "%s is open" % id)
		var m := mission(id)
		var kind := m.objectives[0].vehicle
		var done := false
		var guard := 0
		var chosen := false
		while not done and guard < 200000:
			guard += 1
			var o := runner.objective()
			if o == null:
				break
			if o.type == "choice":
				for e in runner.choose("report" if o.options.size() > 0 else ""):
					done = done or e["type"] == "completed"
				continue
			var p := _status(o, runner, kind)
			# A tail is followed, not teleported to: keep a steady gap behind the target.
			for e in runner.update(0.1, p):
				if e["type"] == "completed":
					done = true
				if e["type"] == "failed":
					fail(id, "failed: %s at %s" % [e["reason"], o.label])
					done = true
			if guard > 100000:
				break
		ok(done, "%s completes" % id)
		ok(runner.medal_of(id) != "" or m.goals.is_empty(), "%s earns a medal" % id)
	return true
