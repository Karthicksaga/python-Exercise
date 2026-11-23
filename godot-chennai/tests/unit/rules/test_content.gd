## The baked content tables (G-41), checked with the parts of the TS content tests that need no
## road or building data: `apps/game/src/content.test.ts`, `streetWar.test.ts`,
## `laterStages.test.ts` and `fareSpots.test.ts`. Assertions that measure against the map (on a
## road, inside a district, outside buildings, at a station) need the world reader (Data) and
## are left out here; docs/rules.md lists them. Each case names the TS case it comes from.
extends "res://tests/unit/rules/rules_test.gd"

var c := GameContent.load_file()

const OLD_JOBS := ["ambulance-run", "courier", "cab-ride", "bus-route", "hospital-transfer", "food-delivery", "medicine-run", "share-auto", "tower-park-visit", "evening-bus"]
const NEW_JOBS := ["marina-evening", "egmore-transfer", "mount-road-bus"]
const GANG_COLOURS := [0xe0b020, 0x3a86c8, 0x4f9a45]


func dist(a: Variant, b: Variant) -> float:
	return RulesMath.hypot(float(a["x"] if a is Dictionary else a.x) - float(b["x"] if b is Dictionary else b.x), float(a["z"] if a is Dictionary else a.z) - float(b["z"] if b is Dictionary else b.z))


## Where an objective is (reach/defeat: itself; chase: its first point), or null.
func place_of(o: MissionData.Objective) -> Variant:
	if o.type == "reach" or o.type == "defeat":
		return {"x": o.x, "z": o.z}
	if o.type == "chase":
		return o.path[0]
	return null


func places(m: MissionData.Mission) -> Array:
	var out: Array = []
	for o in m.objectives:
		var p: Variant = place_of(o)
		if p != null:
			out.append(p)
	return out


func stage(n: int) -> MissionData.Mission:
	for m in c.missions:
		if m.stage == n:
			return m
	return null


func test_content_loads() -> bool:
	eq(c.error, "")
	return true


## content.test.ts: "keeps the ten original jobs and stages, and adds the city jobs" (full).
func test_keeps_the_original_jobs_and_stages_and_adds_the_city_jobs() -> bool:
	eq(c.jobs.map(func(j: JobData.Job) -> String: return j.id), OLD_JOBS + NEW_JOBS)
	eq(c.missions.slice(0, 10).map(func(m: MissionData.Mission) -> int: return m.stage), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
	eq(c.missions.slice(0, 10).map(func(m: MissionData.Mission) -> String: return m.id), ["morning-walk", "borrowed-wheels", "auto-shift", "parcel-run", "cross-town", "bike-courier", "park-trouble", "bike-thieves", "godown-raid", "roundtana-showdown"])
	eq(c.missions.size(), 21)
	eq(c.missions.slice(15).map(func(m: MissionData.Mission) -> String: return m.id), ["wedding-party", "planted-chain", "mumbai-mail", "harmonium-thief", "stadium-biryani", "beach-road-brawl"])
	var ids := {}
	for j in c.jobs:
		ids[j.id] = true
	eq(ids.size(), c.jobs.size())
	return true


## content.test.ts: "is the same every time it is built" (adapted: the table loads the same twice).
func test_loads_the_same_every_time() -> bool:
	var again := GameContent.load_file()
	eq(again.missions.size(), c.missions.size())
	for i in c.missions.size():
		eq(again.missions[i].objectives.size(), c.missions[i].objectives.size())
		eq(again.missions[i].reward, c.missions[i].reward)
	eq(again.parking, c.parking)
	return true


## content.test.ts: "gives parking spots unique ids and parks every job's vehicle somewhere" (full).
func test_parking_ids_are_unique_and_every_jobs_vehicle_is_parked() -> bool:
	var ids := {}
	var kinds := {}
	for p in c.parking:
		ids[p["id"]] = true
		kinds[p["kind"]] = true
	eq(ids.size(), c.parking.size())
	for id: String in ["car-tnagar", "ambulance-egmore", "bus-mount-road"]:
		ok(ids.has(id), id)
	for j in c.jobs:
		ok(kinds.has(j.vehicle), "vehicle for %s" % j.id)
	return true


## content.test.ts: "puts every stop on a drivable road inside the city" (partial: the road and
## bounds checks need the world reader).
func test_every_job_has_a_time_limit_and_a_payout() -> bool:
	for j in c.jobs:
		gt(j.time_limit, 0, j.id)
		gt(j.payout, 0, j.id)
	return true


## content.test.ts: "parks the city jobs' vehicles near their starts" (full).
func test_parks_the_city_jobs_vehicles_near_their_starts() -> bool:
	for pair: Array in [["car-tnagar", "marina-evening", 80.0], ["ambulance-egmore", "egmore-transfer", 80.0], ["bus-mount-road", "mount-road-bus", 200.0]]:
		var spot := c.parked(pair[0])
		var first := c.job(pair[1]).stops[0]
		lt(dist(spot, first), pair[2], pair[0])
		var radius: float = c.job(pair[1]).start_radius if c.job(pair[1]).start_radius >= 0.0 else INF
		lt(dist(spot, first), radius, pair[0])
	return true


## content.test.ts: "runs the Marina drive ... avoiding Anna Salai" (partial: landmarks and road names need the map).
func test_marina_drive_in_the_evening_avoiding_anna_salai() -> bool:
	var marina := c.job("marina-evening")
	eq(marina.vehicle, "car")
	eq(marina.hours, {"from": 16, "to": 20.5})
	eq(marina.stops.size(), 2)
	gt(marina.stops[0].dwell, 0)
	gt(marina.stops[1].dwell, 0)
	ok(marina.stops[0].label.contains("Sir Thyagaraya Road"))
	gt(marina.time_limit, 480)
	lt(marina.time_limit, 1200)
	eq(marina.avoid.name, "Anna Salai")
	gt(marina.avoid.points.size(), 100)
	lt(marina.avoid.points.size(), 700)
	eq(JobRunner.inside_zone(marina.avoid, marina.stops[0].x, marina.stops[0].z), false)
	eq(JobRunner.inside_zone(marina.avoid, marina.stops[1].x, marina.stops[1].z), false)
	return true


## content.test.ts: "moves the hospital transfer between two real hospitals ..." (partial:
## districts and hospital names need the map).
func test_hospital_transfer_is_an_ambulance_job() -> bool:
	eq(c.job("egmore-transfer").vehicle, "ambulance")
	return true


## content.test.ts: "runs the bus along four mapped Anna Salai stops in order, on time" (partial).
func test_mount_road_bus_four_stops_in_order_on_time() -> bool:
	var bus := c.job("mount-road-bus")
	eq(bus.vehicle, "bus")
	eq(bus.stops.size(), 4)
	var last := 0.0
	for i in bus.stops.size():
		gt(bus.stops[i].due, last)
		last = bus.stops[i].due
		if i > 0:
			gt(dist(bus.stops[i], bus.stops[i - 1]), 300)
	var span := dist(bus.stops[0], bus.stops[3])
	gt(span, 1500)
	lt(span, 4000)
	gt(bus.time_limit, last)
	return true


## content.test.ts: "runs the share auto along 2nd Avenue ..." (partial: on-road, district and road width checks need the map).
func test_share_auto_route_thirumangalam_to_anna_nagar_east() -> bool:
	var share := c.job("share-auto")
	eq(share.kind, "share")
	eq(share.vehicle, "auto")
	var route := share.share
	eq(route.from, "Thirumangalam")
	eq(route.to, "Anna Nagar East")
	for i in range(1, route.points.size()):
		lt(dist(route.points[i], route.points[i - 1]), 400)
	var line := RouteLine.new(route.points)
	gt(line.length, 1500)
	lt(line.length, 3000)
	gt(float(route.points.back()["x"]) - float(route.points[0]["x"]), 1500)
	var closest := INF
	for p: Dictionary in route.points:
		closest = minf(closest, dist(p, {"x": 0.0, "z": 0.0}))
	lt(closest, 60)
	gt(route.kerb, route.lane)
	gt(route.lane, 0.5)
	eq(share.stops.size(), 1)
	lt(dist(share.stops[0], route.points.back()), 1)
	var spot := c.parked("auto-share")
	eq(spot["kind"], "auto")
	lt(dist(spot, route.points[0]), share.start_radius)
	lt(ShareShift.share_fare(line.length), 30)
	lt(share.payout, int(ShareShift.SHARE_AUTO["capacity"]) * 100)
	gt(share.time_limit, line.length / 8)
	return true


## streetWar.test.ts: "are three invented gangs with their own colours ..." (partial: the district check needs the map).
func test_three_invented_gangs_with_their_own_colours() -> bool:
	eq(c.gangs.map(func(g: Dictionary) -> String: return g["name"]), ["Manjal Puli", "Neela Nandu", "Pachai Paambu"])
	eq(c.gangs.map(func(g: Dictionary) -> int: return int(g["colour"])), GANG_COLOURS)
	return true


## streetWar.test.ts: "put two crews of three on corners inside their own turf, at the roadside" (partial).
func test_two_crews_of_three_per_gang_armed_as_designed() -> bool:
	for g in c.gangs:
		var crews := c.crews.filter(func(x: Dictionary) -> bool: return x["gang"] == g["id"])
		eq(crews.size(), 2)
		for crew: Dictionary in crews:
			ok(str(crew["id"]).begins_with("gang:%s:" % g["id"]))
			eq((crew["members"] as Array).size(), 3)
			var weapons: Array = []
			for m: Dictionary in crew["members"]:
				eq(m.get("calm"), true)
				eq(m.get("tint"), g["colour"])
				weapons.append(m.get("weapon"))
				if m.get("weapon") == "pistol":
					eq(m.get("armed"), true)
			weapons.sort()
			eq(weapons, ["bat", "fists", "pistol"])
	for a in c.crews:
		for b in c.crews:
			if a != b:
				gt(dist(a, b), 100)
	return true


## streetWar.test.ts: "are far from the Anna Nagar home square ..." (full).
func test_crews_are_far_from_the_home_square() -> bool:
	for crew in c.crews:
		gt(dist(crew, c.spawn), 3000)
	return true


## streetWar.test.ts: "follow stage 10 in order, each with a brief and a reward in money" (full).
func test_stages_11_to_15_follow_in_order() -> bool:
	var stages := c.missions.slice(10, 15)
	eq(stages.map(func(m: MissionData.Mission) -> Array: return [m.stage, m.id]), [[11, "courier-chase"], [12, "tea-shop"], [13, "drive-by"], [14, "snake-pit"], [15, "turf-war"]])
	for m: MissionData.Mission in stages:
		gt(m.brief.length(), 40)
		gt(m.reward, 1500)
	return true


## streetWar.test.ts: "hand over real weapons as rewards" (full).
func test_stages_hand_over_real_guns() -> bool:
	var given: Array = []
	for m: MissionData.Mission in c.missions.slice(10, 15):
		given.append_array(m.weapons)
	ge(given.size(), 3)
	for w: Dictionary in given:
		ok(Weapons.is_gun(w["id"]), w["id"])
		gt(w["ammo"], 0)
	return true


## streetWar.test.ts: "have an enemy group for every fight and ambush, in the gangs' colours" (full).
func test_every_fight_and_ambush_has_its_group_in_gang_colours() -> bool:
	for m: MissionData.Mission in c.missions.slice(10, 15):
		for o in m.objectives:
			var group := o.group if o.type == "defeat" else (o.hostiles if o.type == "reach" else "")
			if group == "":
				continue
			var spots: Array = c.enemies.get(group, [])
			ge(spots.size(), 4, group)
			for s: EnemySpot in spots:
				ok(GANG_COLOURS.has(s.tint), group)
				eq(s.calm, false)
				if o.type == "defeat":
					lt(dist(s, o), 30)
	var weapons := func(group: String) -> Dictionary:
		var out := {}
		for s: EnemySpot in c.enemies[group]:
			out[s.weapon] = true
		return out
	var hideout: Dictionary = weapons.call("hideout")
	ok(hideout.has("shotgun") and hideout.has("smg"))
	ok((c.enemies["turf"] as Array).any(func(s: EnemySpot) -> bool: return s.health > 200))
	return true


## streetWar.test.ts: "the courier's route is one continuous road ..." (partial: the on-road check needs the map).
func test_courier_route_long_enough_and_away_from_the_wait() -> bool:
	var m := c.mission("courier-chase")
	var chase: MissionData.Objective = null
	for o in m.objectives:
		if o.type == "chase":
			chase = o
	gt(Chase.path_length(chase.path), 800)
	for i in range(1, chase.path.size()):
		lt(dist(chase.path[i], chase.path[i - 1]), 250)
	var a: Dictionary = chase.path[0]
	var b: Dictionary = chase.path[1]
	var d: Dictionary = chase.path[2]
	gt((float(b["x"]) - float(a["x"])) * (float(d["x"]) - float(b["x"])) + (float(b["z"]) - float(a["z"])) * (float(d["z"]) - float(b["z"])), 0)
	var wait := m.objectives[2]
	eq(wait.type, "reach")
	gt(dist(wait, chase.path[0]), 30)
	gt(dist(wait, chase.path.back()), dist(chase.path[0], chase.path.back()))
	lt(dist(c.parked("car-royapettah"), wait), 250)
	return true


## streetWar.test.ts: "the drive-by escape has a motorbike where it starts and a reachable time limit" (full).
func test_drive_by_has_a_bike_at_the_start_and_a_reachable_limit() -> bool:
	var m := c.mission("drive-by")
	var start := m.objectives[0]
	var ride := m.objectives[2]
	var bike := c.parked("bike-triplicane")
	eq(bike["kind"], "bike")
	lt(dist(bike, start), start.radius)
	eq(ride.mode, "bike")
	eq(ride.hostiles, "driveby")
	gt(ride.time_limit, dist(start, ride) * 1.5 / 8)
	gt(dist(start, ride), 300)
	return true


## streetWar.test.ts: "lie by the roadside: a bat near home, guns and rounds in the gang districts" (partial).
func test_weapon_pickups_a_bat_near_home_and_guns_with_rounds() -> bool:
	var by := func(w: String) -> Array: return c.pickups.filter(func(p: Dictionary) -> bool: return p["weapon"] == w)
	var bats: Array = by.call("bat")
	var shotguns: Array = by.call("shotgun")
	var smgs: Array = by.call("smg")
	eq(bats.size(), 1)
	lt(dist(bats[0], c.spawn), 600)
	ge(shotguns.size(), 1)
	ge(smgs.size(), 1)
	var ids := {}
	for p in c.pickups:
		ids[p["id"]] = true
		if Weapons.is_gun(p["weapon"]):
			gt(p["ammo"], 0)
	eq(ids.size(), c.pickups.size())
	return true


## laterStages.test.ts: "follow stage 15 in order, each with a brief, money, and reputation" (full).
func test_stages_16_to_21_follow_with_brief_money_and_reputation() -> bool:
	var later := c.missions.slice(15)
	eq(later.map(func(m: MissionData.Mission) -> int: return m.stage), [16, 17, 18, 19, 20, 21])
	var with_rep := 0
	for m: MissionData.Mission in later:
		gt(m.brief.length(), 80, m.id)
		gt(m.reward, 1000, m.id)
		if m.reputation > 0:
			with_rep += 1
	ge(with_rep, 4)
	return true


## laterStages.test.ts: "start near where the stage before ended: no long empty drives" (full;
## the station point is the TS `STATIONS.egmore` constant).
func test_later_stages_start_near_where_the_one_before_ended() -> bool:
	lt(dist(c.parked("auto-royapettah"), places(stage(15)).back()), 120)
	for n in range(16, 22):
		var before: Dictionary = places(stage(n - 1)).back()
		var here := places(stage(n))
		var first: Dictionary = here[0] if here.size() > 0 else before
		lt(dist(before, first), 1500, "stage %d" % n)
	lt(dist(c.parked("car-mylapore"), places(stage(18))[0]), 400)
	lt(dist(c.parked("bike-egmore"), {"x": 5541.0, "z": 806.0}), 400)
	return true


## laterStages.test.ts: "use the new kinds of objective ..." (full).
func test_later_stages_use_the_new_kinds_of_objective() -> bool:
	var all: Array = []
	for m: MissionData.Mission in c.missions.slice(15):
		all.append_array(m.objectives)
	eq(all.filter(func(o: MissionData.Objective) -> bool: return o.type == "reach" and o.fare != null).size(), 4)
	var evade: Array = all.filter(func(o: MissionData.Objective) -> bool: return o.type == "evade")
	eq(evade[0].stars, 2)
	ok(all.any(func(o: MissionData.Objective) -> bool: return o.type == "reach" and o.by_train))
	var chase: Array = all.filter(func(o: MissionData.Objective) -> bool: return o.type == "chase")
	var first_chase: MissionData.Objective = chase[0]
	gt(first_chase.path.size(), 2)
	ge(all.filter(func(o: MissionData.Objective) -> bool: return o.type == "reach" and o.time_limit > 0).size(), 3)
	ok(all.any(func(o: MissionData.Objective) -> bool: return o.type == "defeat" and o.group == "brawl"))
	eq(stage(16).objectives[1].fare.board, 3)
	return true


## laterStages.test.ts: "has a chase path along the road and a gang ... unarmed but for bats"
## (partial: the outside-buildings check needs the chunk reader).
func test_stage_19_chase_and_an_unarmed_brawl_gang() -> bool:
	var chase: MissionData.Objective = null
	for o in stage(19).objectives:
		if o.type == "chase":
			chase = o
	gt(Chase.path_length(chase.path), 500)
	var brawl: Array = c.enemies["brawl"]
	eq(brawl.size(), 5)
	ok(brawl.all(func(e: EnemySpot) -> bool: return not e.armed))
	return true


## fareSpots.test.ts: "are given for stage 3, the new stages, and every cab, ambulance and bus job" (full).
func test_fares_and_goods_are_given_where_the_stages_and_jobs_need_them() -> bool:
	var stage_fares := func(n: int) -> int:
		var count := 0
		for o in stage(n).objectives:
			if o.type == "reach" and o.fare != null:
				count += 1
		return count
	eq(stage_fares.call(3), 2)
	eq(stage_fares.call(16) + stage_fares.call(18), 4)
	for id: String in ["ambulance-run", "cab-ride", "bus-route", "hospital-transfer", "tower-park-visit", "evening-bus", "marina-evening", "egmore-transfer", "mount-road-bus"]:
		ok(c.job(id).stops.all(func(s: JobData.Stop) -> bool: return s.fare != null), id)
	no(c.job("courier").stops.any(func(s: JobData.Stop) -> bool: return s.fare != null))
	for id: String in ["courier", "food-delivery", "medicine-run"]:
		ok(c.job(id).stops.all(func(s: JobData.Stop) -> bool: return s.goods != null), id)
	var goods_stages: Array = []
	for m in c.missions:
		if m.objectives.any(func(o: MissionData.Objective) -> bool: return o.type == "reach" and o.goods != null):
			goods_stages.append(m.stage)
	eq(goods_stages, [4, 6, 11, 19, 20])
	return true


## New (Godot): every stage can be played through by the runner from its own data: a scripted
## player meets each objective in turn (teleporting, in the right vehicle, stopped), so no stage
## is unfinishable because of a typo in the table.
func test_every_stage_can_be_completed_by_the_runner() -> bool:
	var runner := MissionRunner.new(c.missions)
	var done := 0
	var guard := 0
	while runner.mission() != null and guard < 200000:
		guard += 1
		var o := runner.objective()
		var p := MissionData.PlayerStatus.make(o.x, o.z, o.mode if o.mode != "" else "car", 0)
		if o.type == "enter":
			p.mode = o.vehicle
		elif o.type == "defeat":
			p.cleared[o.group] = true
		elif o.type == "evade":
			p.wanted = 2 if guard % 2 == 0 else 0
		elif o.type == "chase":
			var q: Dictionary = runner.quarry()
			p.x = q["x"]
			p.z = q["z"]
		if o.by_train:
			p.on_train = true
		for e in runner.update(0.1, p):
			if e["type"] == "completed":
				done += 1
			if e["type"] == "failed":
				fail("stage %s" % runner.mission().id, "failed: %s" % e["reason"])
	eq(done, 21)
	eq(runner.balance(), c.missions.reduce(func(s: int, m: MissionData.Mission) -> int: return s + m.reward, 0))
	return true
