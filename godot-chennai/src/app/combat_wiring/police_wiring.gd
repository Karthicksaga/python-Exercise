class_name PoliceWiring
extends Node3D
## The police in play (port of `apps/game/src/Police.ts` with the TD-28 crew rules of
## `PoliceFleet`, G-419): cars sent from out of sight that drive after the player along the road
## graph (`Pursuer`), search round where the player was last seen, pull up and let officers out
## (ordinary `Combat` enemies in "police:" groups: they walk up to arrest below three stars and
## fight from three), a roadblock across the road ahead from four stars, the bust when the player
## keeps still beside an officer, the siren and the flashing light bars. The wanted level is one
## `Wanted`; it fades only after the first car has reached the reported spot (`responding`).
##
## Cars are `TrafficVehicleView`s of the police variant (their box is on the vehicles layer, so
## the player's vehicle hits them; jumps are made with the box off, G-360). They are made during
## loading (`prepare`) and reused. `car_cap` (quality presets: Low 2) caps the cars on the street.

signal busted(fine: int, stars: int, at: Vector2, yaw: float)

## Tuning (the Three.js game's estimates).
const ARRIVED_WITHIN := 30.0
const RESPONSE_MAX := 45.0
const TOP_SPEED: Array[float] = [0.0, 13.0, 15.0, 17.0, 19.0, 20.0]
const SPAWN_NEAR := 80.0
const SPAWN_FAR := 140.0
const SPAWN_CLEAR := 70.0
const SPAWN_EVERY := 5.0
const STOP_SHORT := 9.0
const SEARCH_AFTER := 3.0
const SEARCH_RADIUS := 120.0
const SIREN_HEARD := 250.0
const LOOK_EVERY := 0.2
const SHOT_SLACK := 0.4
const STORY_FIGHT := 60.0
const CHEST := 1.3
## From this many stars a car parks across the road ahead of a driving player (a roadblock).
const ROADBLOCK_FROM := 4
const ROADBLOCK_AHEAD := 70.0
## The player's own vehicles: taking these is never theft (content ids).
const OWN_VEHICLES: Array[String] = ["car-start", "bike-start", "auto-park"]

var combat: Combat
var wanted := Wanted.new()
var fleet := PoliceFleet.new()
## The drive graph round the player (read-only; may be null: cars drive straight).
var graph_source: Callable = Callable()
## line_clear(from: Vector2, to: Vector2) -> bool: nothing solid at chest height between.
var line_clear: Callable = Callable()
## Police stations (world metres): busted players are let go outside the nearest.
var stations := PackedVector2Array()
var car_cap: int = Wanted.CARS[Wanted.MAX_STARS]
## Make no car views (headless rules tests).
var load_models := true
var last_seen := Vector2.INF
var since_seen := 99.0
var seen_now := false
var last_crime := ""
var last_bust: Dictionary = {}
var _responding := -1.0
var _since_look := 99.0
var _spawn_in := 0.0
var _flash := 0.0
var _flash_on := false
var _officer_health: Dictionary[int, float] = {}
var _taken: Dictionary = {}
var _last_vehicle := ""
var _runs: Dictionary[int, Run] = {}
var _spare: Array[TrafficVehicleView] = []
var _player := {}
var _rng := RandomNumberGenerator.new()


## A car's moving parts (the fleet's `Unit` keeps its crew).
class Run:
	extends RefCounted
	var unit: PoliceFleet.Unit
	var pursuer := Pursuer.new()
	var view: TrafficVehicleView = null
	var search_goal := Vector2.INF
	var search_for := 0.0
	var standing_down := 0.0
	var roadblock := false


static func make(rules: Combat) -> PoliceWiring:
	var p := PoliceWiring.new()
	p.name = "Police"
	p.combat = rules
	p._rng.seed = 2811
	return p


## Loading work: the car views, made once (no models built mid-chase).
func prepare() -> void:
	if not load_models:
		return
	for i in Wanted.CARS[Wanted.MAX_STARS]:
		_spare.append(_new_view())


func _new_view() -> TrafficVehicleView:
	var v := TrafficVehicleView.make(&"police", 0.0, true)
	v.set_shown(false)
	add_child(v)
	return v


## No new jobs at two stars and more: the refusal's text, or "".
func job_refusal(on_a_job: bool) -> String:
	if on_a_job or Wanted.jobs_allowed(wanted.stars):
		return ""
	return "No new jobs while the police are after you. Lose them first."


## Count a crime; the police know where it happened.
func report(crime: String) -> Dictionary:
	last_crime = crime
	var ev := wanted.report(crime, Wanted.witnessed(crime, seen_now))
	if not ev.is_empty() and fleet.counted() == 0:
		_spawn_in = 0.0
	if not _player.is_empty() and wanted.stars > 0:
		last_seen = Vector2(float(_player["x"]), float(_player["z"]))
		since_seen = 0.0
		_responding = 0.0
	return ev


## A shot from `from` ending at `to`. Shots in a story fight (its enemies close by) are part of
## that fight: the police don't come for them.
func gunfire(from: Vector2, to: Vector2) -> void:
	for id: int in _runs:
		var r := _runs[id]
		if not r.unit.active:
			continue
		var h := r.pursuer.heading
		var d := to - r.pursuer.position()
		var along := d.x * -sin(h) + d.y * -cos(h)
		var side := d.x * cos(h) - d.y * sin(h)
		if absf(along) < 2.1 + SHOT_SLACK and absf(side) < 0.9 + SHOT_SLACK:
			report("policeCarShot")
	for e in combat.enemies:
		if not Wanted.is_police_group(e.group) and e.health > 0.0 and Vector2(e.x, e.z).distance_to(from) < STORY_FIGHT:
			return
	report("gunfire")


## The officers' groups now (the combat step keeps them).
func groups() -> Array[String]:
	var out: Array[String] = []
	for e in combat.enemies:
		if Wanted.is_police_group(e.group) and not out.has(e.group):
			out.append(e.group)
	return out


## Everything stands down: not wanted, no cars, no officers (arrest, knock-out, new game).
func clear() -> void:
	wanted.clear()
	for id: int in _runs:
		_put_away(_runs[id])
	_remove_police()
	_officer_health.clear()
	last_seen = Vector2.INF
	since_seen = 99.0
	seen_now = false
	_responding = -1.0


func set_stars(stars: int) -> void:
	wanted.set_level(stars)
	if not _player.is_empty():
		last_seen = Vector2(float(_player["x"]), float(_player["z"]))
	since_seen = 0.0
	_spawn_in = 0.0
	if stars > 0:
		_responding = 0.0


func _remove_police() -> void:
	for i in range(combat.enemies.size() - 1, -1, -1):
		if Wanted.is_police_group(combat.enemies[i].group):
			combat.enemies.remove_at(i)


func _put_away(r: Run) -> void:
	if r.unit.group != "":
		PoliceFleet.remove_living(combat, r.unit.group)
	fleet.put_away(r.unit)
	r.roadblock = false
	if r.view != null:
		r.view.set_shown(false)
		_spare.append(r.view)
		r.view = null


func _officers() -> Array[Combat.Enemy]:
	var out: Array[Combat.Enemy] = []
	for e in combat.enemies:
		if Wanted.is_police_group(e.group):
			out.append(e)
	return out


func _clear(a: Vector2, b: Vector2) -> bool:
	return not line_clear.is_valid() or bool(line_clear.call(a, b))


## Whether any unit sees the player now.
func _look(at: Vector2) -> bool:
	for id: int in _runs:
		var r := _runs[id]
		if not PoliceFleet.can_look(r.unit):
			continue
		if r.pursuer.position().distance_to(at) < Wanted.SIGHT_CAR and _clear(r.pursuer.position(), at):
			return true
	for o in _officers():
		if o.health > 0.0 and Vector2(o.x, o.z).distance_to(at) < Wanted.SIGHT_OFFICER and _clear(Vector2(o.x, o.z), at):
			return true
	return false


## The player as the police see them this step: {x, z, speed, vx, vz, vehicle_id, vehicle_kind,
## half_length, impact, allowed_kinds: Array, on_foot}.
func step(dt: float, p: Dictionary) -> void:
	_player = p
	var at := Vector2(float(p["x"]), float(p["z"]))
	var speed := float(p["speed"])
	var on_foot := bool(p["on_foot"])
	var vehicle := str(p.get("vehicle_id", ""))
	# Getting into someone else's vehicle (traffic taken over is the carjacking's own crime).
	if vehicle != "" and vehicle != _last_vehicle:
		if Wanted.is_vehicle_theft({"id": vehicle, "kind": str(p.get("vehicle_kind", ""))}, OWN_VEHICLES, p.get("allowed_kinds", []), _taken):
			report("vehicleTheft")
		_taken[vehicle] = true
	_last_vehicle = vehicle
	# Officers the player hurt since the last step.
	for o in _officers():
		var before: float = _officer_health.get(o.id, o.health)
		if o.health < before:
			report("officerDown" if o.health <= 0.0 else "officerAssaulted")
		_officer_health[o.id] = o.health
	if float(p.get("impact", 0.0)) > 0.0 and not on_foot:
		for id: int in _runs:
			var r := _runs[id]
			if r.unit.active and r.pursuer.position().distance_to(at) < float(p.get("half_length", 2.0)) + 2.9 and speed > r.pursuer.speed + 1.5:
				report("policeCarRammed")
	_since_look += dt
	if _since_look >= LOOK_EVERY:
		_since_look = 0.0
		seen_now = wanted.stars > 0 and _look(at)
	since_seen += dt
	if seen_now:
		last_seen = at
		since_seen = 0.0
	var held := false
	if on_foot and speed < Wanted.STILL_BELOW:
		for o in _officers():
			if o.health > 0.0 and Vector2(o.x, o.z).distance_to(at) < Wanted.BUST_RANGE:
				held = true
	var ev := wanted.update(dt, seen_now, held, _still_responding(dt))
	if str(ev.get("type", "")) == "busted":
		_arrest(int(ev["fine"]), int(ev["stars"]), at)
		return
	var stars := wanted.stars
	var units := Wanted.police_units(stars)
	# Below three stars officers walk up to make an arrest; they don't throw punches or shoot.
	if not bool(units["armed"]):
		for o in _officers():
			o.cooldown = maxf(o.cooldown, 0.5)
			o.windup = -1.0
	fleet.tick(dt)
	_spawn_in -= dt
	var graph: RoadGraph = graph_source.call() if graph_source.is_valid() else null
	if stars > 0:
		_dispatch(graph, at)
	for id: int in _runs.keys():
		var r := _runs[id]
		if r.unit.active:
			_drive(r, dt, graph, at, speed, on_foot, p)


func _still_responding(dt: float) -> bool:
	if _responding < 0.0:
		return false
	_responding += dt
	var arrived := false
	if last_seen != Vector2.INF:
		for id: int in _runs:
			var r := _runs[id]
			if r.unit.active and r.pursuer.position().distance_to(last_seen) < ARRIVED_WITHIN:
				arrived = true
	if arrived or seen_now or wanted.stars == 0 or _responding > RESPONSE_MAX:
		_responding = -1.0
	return _responding >= 0.0


## A spawn point out of the player's sight near where the police look: {at, heading} or {}.
func _spawn_point(graph: RoadGraph, player: Vector2, centre: Vector2) -> Dictionary:
	var candidates: Array[Vector2] = []
	var headings: Array[float] = []
	if graph != null and graph.node_count() > 1:
		for i in graph.node_count():
			if graph.node_out[i].is_empty():
				continue
			var n := graph.node_pos[i]
			var from_centre := n.distance_to(centre)
			if from_centre < SPAWN_NEAR or from_centre > SPAWN_FAR or n.distance_to(player) < SPAWN_CLEAR:
				continue
			candidates.append(n)
			var e := graph.node_out[i][0]
			headings.append(graph.heading(e))
	else:
		for k in 16:
			var a := TAU * k / 16.0
			var n := centre + Vector2(cos(a), sin(a)) * (SPAWN_NEAR + SPAWN_FAR) * 0.5
			if n.distance_to(player) >= SPAWN_CLEAR:
				candidates.append(n)
				headings.append(atan2(-(centre.x - n.x), -(centre.y - n.y)))
	if candidates.is_empty():
		return {}
	var fallback := -1
	for attempt in mini(12, candidates.size()):
		var pick := _rng.randi_range(0, candidates.size() - 1)
		if not _clear(player, candidates[pick]):
			return {"at": candidates[pick], "heading": headings[pick]}
		fallback = pick
	# Nothing hides any of them (open ground): the farthest tried, still beyond SPAWN_CLEAR.
	return {"at": candidates[fallback], "heading": headings[fallback]}


func _dispatch(graph: RoadGraph, at: Vector2) -> void:
	if _spawn_in > 0.0 or fleet.counted() >= mini(car_cap, int(Wanted.police_units(wanted.stars)["cars"])):
		return
	var spot := _spawn_point(graph, at, last_seen if last_seen != Vector2.INF else at)
	if spot.is_empty():
		_spawn_in = 1.0
		return
	var u := fleet.dispatch(wanted.stars, func(_u: PoliceFleet.Unit) -> bool: return false)
	if u == null:
		return
	var r: Run = _runs.get(u.id)
	if r == null:
		r = Run.new()
		r.unit = u
		_runs[u.id] = r
	var p: Vector2 = spot["at"]
	r.pursuer = Pursuer.new(p.x, p.y, float(spot["heading"]))
	r.pursuer.speed = 8.0
	r.search_goal = Vector2.INF
	r.standing_down = 0.0
	r.roadblock = false
	if load_models:
		r.view = _spare.pop_back() if not _spare.is_empty() else _new_view()
		r.view.set_shown(true)
		r.view.set_pose(WorldOrigin.to_scene_xz(p.x, p.y, 0.0), r.pursuer.heading, 0.0, 0.0, 999.0)
	_spawn_in = SPAWN_EVERY


func _drive(r: Run, dt: float, graph: RoadGraph, at: Vector2, speed: float, on_foot: bool, p: Dictionary) -> void:
	var stars := wanted.stars
	var car := r.pursuer
	var to_player := car.position().distance_to(at)
	if stars == 0:
		if r.unit.group != "":
			PoliceFleet.remove_living(combat, r.unit.group)
			fleet.recall(r.unit)
		r.standing_down += dt
		var seen := to_player < PoliceFleet.LEAVE_BEYOND and _clear(at, car.position())
		if not seen or r.standing_down > 8.0:
			_put_away(r)
			return
	elif to_player > PoliceFleet.RECYCLE_BEYOND and (last_seen == Vector2.INF or car.position().distance_to(last_seen) > PoliceFleet.RECYCLE_BEYOND):
		_put_away(r)
		return
	if r.unit.state == "parked":
		var group := r.unit.group
		var living := PoliceFleet.living(combat, group)
		var result := fleet.step_parked(r.unit, living, PoliceFleet.escaped(to_player, not on_foot, speed))
		if result == "recall":
			PoliceFleet.remove_living(combat, group)
		car.speed = 0.0
	elif r.unit.state == "abandoned":
		car.speed = 0.0
		if PoliceFleet.abandoned_should_go(to_player, _clear(at, car.position())):
			_put_away(r)
			return
	elif r.roadblock:
		car.speed = 0.0
		if since_seen > 10.0 or to_player > 200.0:
			r.roadblock = false
	else:
		var units := Wanted.police_units(stars)
		var ram := bool(units["ram"]) and not on_foot and speed > 3.0 and since_seen < 1.0
		var goal := at
		var stop_short := STOP_SHORT
		if since_seen < SEARCH_AFTER or last_seen == Vector2.INF:
			goal = at if since_seen < 1.0 else (last_seen if last_seen != Vector2.INF else at)
			r.search_goal = Vector2.INF
			if ram:
				stop_short = -1.0
				goal = at + Vector2(float(p.get("vx", 0.0)), float(p.get("vz", 0.0))) * (1.2 if r.unit.id % 2 == 1 else 0.3)
		else:
			r.search_for -= dt
			var there := r.search_goal != Vector2.INF and car.position().distance_to(r.search_goal) < 10.0
			if r.search_goal == Vector2.INF or there or r.search_for <= 0.0:
				var a := _rng.randf() * TAU
				var rad := _rng.randf() * SEARCH_RADIUS
				var aim := last_seen + Vector2(cos(a), sin(a)) * rad
				var n := Pursuer.nearest_node(graph, aim) if graph != null else -1
				r.search_goal = graph.node_pos[n] if n >= 0 else aim
				r.search_for = 20.0
			goal = r.search_goal
			stop_short = 2.0
		# A roadblock: from four stars one car takes a spot ahead of a driving player and waits.
		if stars >= ROADBLOCK_FROM and not on_foot and speed > 6.0 and since_seen < 1.0 and r.unit.id % 2 == 0 and to_player > 60.0:
			var v := Vector2(float(p.get("vx", 0.0)), float(p.get("vz", 0.0)))
			goal = at + v.normalized() * ROADBLOCK_AHEAD
			stop_short = 0.5
			if car.position().distance_to(goal) < 4.0:
				r.roadblock = true
				car.heading = atan2(-v.y, v.x)
		car.update(dt, graph, goal, TOP_SPEED[stars], stop_short, func(a: Vector2, b: Vector2) -> bool: return _clear(a, b))
		var stopped := on_foot or speed < 2.0
		var living_on_foot := PoliceFleet.living_on_foot(combat)
		if PoliceFleet.should_deploy(r.unit, stars, seen_now, ram, stopped, to_player, car.speed):
			var out := fleet.deploy(r.unit, stars, living_on_foot)
			if not out.is_empty():
				_deploy(r, out)
	if r.view != null:
		r.view.set_pose(WorldOrigin.to_scene_xz(car.x, car.z, 0.0), car.heading, car.speed, dt, 50.0)


## Officers out beside the car's doors, straight after the player.
func _deploy(r: Run, out: Dictionary) -> void:
	var h := r.pursuer.heading
	var side := 1.6
	var rx := cos(h)
	var rz := -sin(h)
	var spots: Array = []
	for s: float in [1.0, -1.0].slice(0, int(out["count"])):
		spots.append(EnemySpot.make(r.pursuer.x - rx * side * s, r.pursuer.z - rz * side * s, bool(out["armed"])))
	var group := str(out["group"])
	combat.spawn_group(group, spots)
	for e in combat.enemies:
		if e.group == group:
			e.alerted = true
			e.heading = h
			_officer_health[e.id] = e.health


func _arrest(fine: int, stars: int, at: Vector2) -> void:
	var station := at
	var best := INF
	for s in stations:
		var d := s.distance_to(at)
		if d < best:
			best = d
			station = s
	clear()
	# Outside, a few metres off the station's point, facing the way back.
	var out := station + Vector2(0, 6) if station != at else at
	last_bust = {"fine": fine, "stars": stars, "x": out.x, "z": out.y}
	busted.emit(fine, stars, out, 0.0)


## Each frame: the light bars flash and the siren follows the nearest chasing car.
func _process(dt: float) -> void:
	_flash += dt
	var nearest := INF
	if _flash > 0.18:
		_flash = 0.0
		_flash_on = not _flash_on
	for id: int in _runs:
		var r := _runs[id]
		if not r.unit.active or r.view == null:
			continue
		r.view.model.flash_beacons(0 if _flash_on else 1)
		if r.unit.state == "chase" and wanted.stars > 0 and not _player.is_empty():
			nearest = minf(nearest, r.pursuer.position().distance_to(Vector2(float(_player["x"]), float(_player["z"]))))
	Sound.set_police_siren(maxf(0.15, 1.0 - (nearest - 20.0) / (SIREN_HEARD - 20.0)) if nearest < SIREN_HEARD else 0.0)


## Cars on the street now: [{x, z, speed, state, mode}] (tests, minimap).
func cars() -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for id: int in _runs:
		var r := _runs[id]
		if r.unit.active:
			out.append({"x": r.pursuer.x, "z": r.pursuer.z, "speed": r.pursuer.speed, "state": r.unit.state, "mode": r.pursuer.mode, "roadblock": r.roadblock})
	return out


func officers() -> Array[Combat.Enemy]:
	return _officers()


## Traffic gives way to police cars: (x, z, radius) per car, world metres.
func obstacles() -> PackedVector3Array:
	var out := PackedVector3Array()
	for id: int in _runs:
		var r := _runs[id]
		if r.unit.active:
			var f := Vector2(-sin(r.pursuer.heading), -cos(r.pursuer.heading))
			var c := r.pursuer.position()
			out.append(Vector3(c.x + f.x, c.y + f.y, 1.1))
			out.append(Vector3(c.x - f.x, c.y - f.y, 1.1))
	return out
