## The map-dependent content checks left open by the Rules agent (G-137): the baked content
## measured against the real roads, buildings, districts, landmarks and railway of the world files
## (`assets/world`, today's format 1, which the baked content was built against). Each case names
## the TypeScript case it ports: `streetWar.test.ts`, `laterStages.test.ts`, `fareSpots.test.ts`.
extends "res://tests/unit/rules/rules_test.gd"

var c := GameContent.load_file()

## `STATIONS` in `laterStages.ts` (the content places stages 18 and 19 at these).
const STATIONS := {
	"park": {"name": "Park", "x": 6822.1, "z": 472.2},
	"egmore": {"name": "Chennai Egmore", "x": 5541.0, "z": 806.0},
}

var _source: FileWorldSource = CityTestKit.v1()
var _layout: CityLayout = null


func layout() -> CityLayout:
	if _layout == null:
		_layout = CityTestKit.kit().layouts.layout_for(_source.cell_at(Vector2(40, 60)))
	return _layout


func districts() -> DistrictIndex:
	var list: Array = []
	for p: Place in _source.index_at(Vector2.ZERO).districts:
		list.append({"name": p.name, "kind": str(p.kind), "x": p.position.x, "z": p.position.y})
	return DistrictIndex.new(list)


func stage(n: int) -> MissionData.Mission:
	for m in c.missions:
		if m.stage == n:
			return m
	return null


func mission(id: String) -> MissionData.Mission:
	for m in c.missions:
		if m.id == id:
			return m
	return null


## Where an objective is, or INF for one with no place (get in, lose the police).
func place_of(o: MissionData.Objective) -> Vector2:
	if o.type == "reach" or o.type == "defeat":
		return Vector2(o.x, o.z)
	if o.type == "chase":
		var p: Dictionary = o.path[0]
		return Vector2(float(p["x"]), float(p["z"]))
	return Vector2.INF


func places(m: MissionData.Mission) -> Array[Vector2]:
	var out: Array[Vector2] = []
	for o in m.objectives:
		var p := place_of(o)
		if p != Vector2.INF:
			out.append(p)
	return out


func road_name_at(p: Vector2) -> String:
	var hit := layout().nearest_road_point(p)
	return "" if hit.is_empty() else layout().roads[int(hit["road_index"])].name


func landmark(id: String) -> Landmark:
	for l in _source.get_landmarks():
		if l.id == id:
			return l
	return null


func district_named(n: String) -> Dictionary:
	for d: Dictionary in districts().districts:
		if str(d["name"]) == n:
			return d
	return {}


func district_name_at(p: Vector2) -> String:
	return str(districts().at(p.x, p.y).get("name", ""))


## streetWar.test.ts: "are played in the districts the briefs name".
func test_street_war_stages_are_played_in_the_districts_the_briefs_name() -> bool:
	var first := func(id: String) -> String:
		return district_name_at(place_of(mission(id).objectives[0]))
	eq(first.call("courier-chase"), "Royapettah")
	eq(first.call("tea-shop"), "Triplicane")
	eq(first.call("drive-by"), "Triplicane")
	eq(first.call("snake-pit"), "Egmore")
	eq(first.call("turf-war"), "Royapettah")
	return true


## laterStages.test.ts: "are set where the briefs say".
func test_later_stages_are_set_where_the_briefs_say() -> bool:
	eq(district_name_at(places(stage(16))[0]), "Royapettah")
	var temple := landmark("kapaleeshwarar-temple")
	ok(temple != null, "the temple is a landmark")
	if temple != null:
		lt(places(stage(16))[1].distance_to(temple.position), 300.0, "stage 16 drop-off near the temple")
	eq(road_name_at(places(stage(17))[0]), "East Tank Square Street")
	eq(road_name_at(places(stage(18))[1]), "EVR Periyar Salai")
	lt(places(stage(18))[1].distance_to(Vector2(STATIONS["park"]["x"], STATIONS["park"]["z"])), 400.0, "stage 18 near Park station")
	var chepauk := district_named("Chepauk")
	ok(not chepauk.is_empty(), "Chepauk is a district")
	lt(places(stage(20))[2].distance_to(Vector2(float(chepauk["x"]), float(chepauk["z"]))), 700.0, "the stadium")
	eq(road_name_at(places(stage(21))[0]), "Kamarajar Salai")
	return true


## laterStages.test.ts: "names stations exactly where the railway has them".
func test_stations_are_exactly_where_the_railway_has_them() -> bool:
	var rail: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://assets/world/rail.json"))
	ok(rail is Dictionary, "rail.json reads")
	if not rail is Dictionary:
		return true
	var stations: Array = (rail as Dictionary).get("stations", [])
	for key: String in STATIONS:
		var want: Dictionary = STATIONS[key]
		var found: Dictionary = {}
		for s: Dictionary in stations:
			if str(s["name"]) == str(want["name"]):
				found = s
		ok(not found.is_empty(), "the railway has %s" % want["name"])
		if not found.is_empty():
			lt(RulesMath.hypot(float(found["x"]) - float(want["x"]), float(found["z"]) - float(want["z"])), 1.0, str(want["name"]))
	return true


## Every fare and goods hand-over in the game with the marker it belongs to (`fareSpots.test.ts`).
func fares() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for m in c.missions:
		for o in m.objectives:
			if o.type != "reach":
				continue
			if o.fare != null:
				out.append({"where": "stage %d: %s" % [m.stage, o.label], "stop": Vector2(o.x, o.z), "radius": o.radius, "kerb": Vector2(o.fare.kerb_x, o.fare.kerb_z)})
			if o.goods != null:
				out.append({"where": "stage %d: %s (goods)" % [m.stage, o.label], "stop": Vector2(o.x, o.z), "radius": o.radius, "kerb": Vector2(o.goods.kerb_x, o.goods.kerb_z)})
	for j in c.jobs:
		for s in j.stops:
			if s.fare != null:
				out.append({"where": "%s: %s" % [j.id, s.label], "stop": Vector2(s.x, s.z), "radius": s.radius, "kerb": Vector2(s.fare.kerb_x, s.fare.kerb_z)})
			if s.goods != null:
				out.append({"where": "%s: %s (goods)" % [j.id, s.label], "stop": Vector2(s.x, s.z), "radius": s.radius, "kerb": Vector2(s.goods.kerb_x, s.goods.kerb_z)})
	return out


func inside_a_building(p: Vector2) -> bool:
	var chunk := _source.read_chunk(_source.cell_at(p))
	for b in chunk.buildings:
		if StreetFurniture.point_in_polygon(p, b.outline):
			return true
	return false


## fareSpots.test.ts: "stand on the pavement beside the marker: off the carriageway, outside
## buildings, close enough to walk".
func test_waiting_spots_stand_on_the_pavement_beside_the_marker() -> bool:
	var list := fares()
	gt(list.size(), 30, "fares and goods found")
	for f in list:
		var where: String = f["where"]
		var kerb: Vector2 = f["kerb"]
		var stop: Vector2 = f["stop"]
		var own_hit := layout().nearest_road_point(stop)
		ok(not own_hit.is_empty(), "%s: a road" % where)
		if own_hit.is_empty():
			continue
		var own: Road = layout().roads[int(own_hit["road_index"])]
		# Beside the stop's own road, and on no road's carriageway.
		var same: Array[Road] = []
		for r in layout().roads:
			if r == own or (own.name != "" and r.name == own.name):
				same.append(r)
		var road := FareSpots.nearest_in(same, kerb)
		var distance: float = road["distance"]
		gt(distance, own.width / 2.0 + 0.3, "%s: off the carriageway" % where)
		no(layout().on_other_road(kerb, own.id, 0.3), "%s: on another road" % where)
		lt(absf(distance - (own.width / 2.0 + FareSpots.KERB_STEP)), 1.5, "%s: beside it" % where)
		# A short walk from where the vehicle stops (it can be anywhere in the marker).
		lt(kerb.distance_to(stop), float(f["radius"]) + 22.0, "%s: a short walk" % where)
		no(inside_a_building(kerb), "%s: inside a building" % where)
	return true


## fareSpots.test.ts: "picks the side the real place is on".
func test_the_waiting_spot_is_on_the_side_the_real_place_is_on() -> bool:
	# A stretch of 5th Avenue with nothing else on either side (the spawn itself is a junction).
	var clear := func(p: Vector2) -> bool:
		var hit := layout().nearest_road_point(p)
		var road: Road = layout().roads[int(hit["road_index"])]
		var heading: float = hit["heading"]
		var at: Vector2 = hit["point"]
		var r := Vector2(cos(heading), -sin(heading))
		var out := road.width / 2.0 + 0.9
		for s: float in [1.0, -1.0]:
			if layout().on_other_road(at + r * out * s, road.id, 0.5):
				return false
		return true
	var probe := Vector2(40, 60)
	var k := 0
	while k < 40 and not clear.call(probe):
		probe = Vector2(40.0 - k * 10.0, 60.0)
		k += 1
	var stop := layout().nearest_road_point(probe)
	var at: Vector2 = stop["point"]
	var heading: float = stop["heading"]
	var right := Vector2(cos(heading), -sin(heading))
	var on_right := FareSpots.kerb_spot(layout(), at, at + right * 30.0)
	var on_left := FareSpots.kerb_spot(layout(), at, at - right * 30.0)
	gt((on_right - at).dot(right), 0.0, "the right-hand place gets the right side")
	lt((on_left - at).dot(right), 0.0, "the left-hand place gets the left side")
	return true


## New (Godot): the port of `kerbSpot` reproduces the kerbs baked from the TypeScript for the
## stops that name no side (the bulk of them), within the 0.1 m the content rounds to.
func test_kerb_spot_reproduces_a_baked_kerb_when_no_side_is_given() -> bool:
	var agree := 0
	var tried := 0
	for f in fares():
		var stop: Vector2 = f["stop"]
		var kerb := FareSpots.kerb_spot(layout(), stop)
		tried += 1
		if kerb.distance_to(f["kerb"]) < 0.15:
			agree += 1
	# Stops that name a side (a real hospital, a bus stop) or shift along the road are baked
	# with that extra input, which the table does not keep: those differ (34 of 49 agree today).
	gt(float(agree) / float(tried), 0.6, "most baked kerbs reproduced (%d of %d)" % [agree, tried])
	return true
