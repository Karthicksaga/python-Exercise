class_name StreetReactions
extends Node
## People react to being hit by the player's vehicle (decisions G-362, G-363; the owner's report on
## afed12f: "why is the NPC standing after hitting the bike?"). The rules are `StreetHits` (pure,
## src/ai/); this node applies them to the life layer and draws the people who are down.
##
## - **Walkers and crowd adults** touched by the driven vehicle's box: below `StreetHits.FALL_FROM`
##   they stagger back and look (the AI's fear: step back if facing it, else hurry off); from it
##   they are knocked off their feet (`PersonView.play_fall`), slide, lie, get up (`play_getup`)
##   and walk on: the walker agent is held meanwhile (traffic stops for the person lying in the
##   road) and handed back where they stood up.
## - **Traffic riders** (bike, auto) whose vehicle takes a hit of at least its kind's `fall_from`
##   (their share of the severity) fall off; the vehicle stops where it is and leans (a bike lies
##   on its side) until the rider has got up and walked back to it.
## - Everyone within `StreetHits.BYSTANDER_REACH` turns to look (`CityLife.report_incident`) and
##   walkers stop or run off; a traffic vehicle near by honks (`honk`); the crime goes to `wanted`
##   when the game has one.
## - **Never a child.** Children and crowd spots at play are skipped before any test
##   (`StreetHits.can_be_hit`); every figure this node knocks down is checked again against the
##   cast's minors. Walkers and drivers are adults by `CastPicker` already.
## Agents are changed only between the AI's steps (`CityLife.between_steps`). Per frame: only the
## people who are down are animated; the touch test runs at the AI's 30 Hz, over the walkers and
## the crowd near the player, and allocates nothing. Figures are kept for the next incident.

## A hit traffic vehicle near by honks this long after the incident (game seconds).
const HONK_AFTER := 0.6
const GRAVITY := 9.81
## A person on the ground scrapes to a stop at this rate, m/s².
const SCRAPE := 7.0
## A rider walks back to the vehicle at this pace, for at most this long.
const WALK_BACK_SPEED := 1.3
const WALK_BACK_MAX := 4.0
## A bike lies over this far (radians); an auto rocks onto two wheels this far.
const BIKE_DOWN := 1.45
const AUTO_LEAN := 0.12

## A person reacted: &"stagger" or &"fall", who: &"walker", &"crowd" or &"rider", at a world point.
signal reacted(band: StringName, who: StringName, at: Vector2)
## A traffic vehicle near an incident honks: its kind (`VehicleType.kind`) and scene position.
signal honk(kind: StringName, at: Vector3)

var life: CityLife
var driving: Driving
## The game's wanted level, when it has one (no instance exists yet): incidents are reported.
var wanted: Wanted = null
## Counts for tests and the HUD.
var stats: Dictionary = {"stagger": 0, "fall": 0, "rider": 0, "children_passed": 0, "tests": 0, "test_usec": 0, "test_usec_max": 0}
## Touch tests that found nobody (their cost is the per-step price of driving near people).
var _quiet := Vector2i.ZERO


class Down:
	extends RefCounted
	## &"walker", &"crowd", &"rider".
	var who: StringName
	## Agent id (walker, rider) or crowd spot key.
	var id: int = 0
	var fig: PersonView
	var velocity := Vector3.ZERO
	var ground := 0.0
	## &"flying", &"sliding", &"lying", &"rising", &"walking", &"done".
	var phase: StringName = &"flying"
	var t := 0.0
	## Walker: moved to where they lie (the AI's obstacle) once landed.
	var placed := false
	var heading := 0.0
	var view: TrafficVehicleView = null
	## Rider: where they walk back to (scene), the seat's foot point.
	var back_to := Vector3.ZERO


var _downs: Array[Down] = []
var _spare: Dictionary[String, Array] = {}
var _minors: Dictionary[String, bool] = {}
## Rider falls judged by `Driving` (a node signal), applied at the next step: [view, launch].
var _riders: Array[Array] = []
var _honk_in := -1.0
var _honk_kind: StringName = &""
var _honk_at := Vector3.ZERO


static func make(city_life: CityLife, session: Driving) -> StreetReactions:
	var r := StreetReactions.new()
	r.name = "StreetReactions"
	r.life = city_life
	r.driving = session
	return r


func _ready() -> void:
	life.between_steps.connect(_step)
	driving.crashed.connect(_on_vehicle_hit)
	driving.bumped.connect(_on_vehicle_hit)
	if life.cast != null:
		for e in life.cast.entries:
			if CastPicker.is_minor(e):
				_minors[str(e["id"])] = true


## Mean cost of a touch test that found nobody, µs (desktop measurement in the tests).
func quiet_test_usec() -> float:
	return float(_quiet.y) / maxf(1.0, float(_quiet.x))


## People down now (tests).
func downed_count() -> int:
	return _downs.size()


## The figures of the people down now (tests: none is ever a child).
func downed_people() -> PackedStringArray:
	var out := PackedStringArray()
	for d in _downs:
		out.append(d.fig.person_id if d.fig != null else "")
	return out


func is_minor(person: String) -> bool:
	return _minors.has(person)


func _on_vehicle_hit(v: Vehicle, outcome: CrashRules.Outcome) -> void:
	var hit := outcome.hit
	if hit == null or not (hit.other is TrafficVehicleView) or not is_instance_valid(hit.other):
		return
	var view := hit.other as TrafficVehicleView
	if not view.open_seat or view.agent_id < 0 or life.taken.has(view.agent_id):
		return
	var theirs := outcome.impact_kmh * v.mass / maxf(1.0, view.variant.type.spec.mass)
	if not StreetHits.rider_falls(view.variant.type.crash.fall_from, theirs):
		return
	var vel := Vector2(v.linear_velocity.x, v.linear_velocity.z)
	if vel.length() < 1.0:
		vel = hit.approach
	var off := Vector2(view.global_position.x - v.global_position.x, view.global_position.z - v.global_position.z)
	_riders.append([view, StreetHits.launch(vel, off)])


## Between the AI's steps: hand back people who are up, start rider falls, test the touch.
func _step(dt: float) -> void:
	for d in _downs:
		_settle(d)
	for i in range(_downs.size() - 1, -1, -1):
		if _downs[i].phase == &"done":
			_release(_downs[i])
			_downs.remove_at(i)
	for r in _riders:
		_knock_rider(r[0] as TrafficVehicleView, r[1] as Vector3)
	_riders.clear()
	var v := driving.vehicle
	if v == null or life.population == null:
		return
	var vel := Vector2(v.linear_velocity.x, v.linear_velocity.z)
	var speed := vel.length()
	if speed < StreetHits.STAGGER_FROM:
		return
	var t0 := Time.get_ticks_usec()
	var before := _downs.size() + int(stats["stagger"])
	_touch_test(v, vel, speed, dt)
	var spent := Time.get_ticks_usec() - t0
	if _downs.size() + int(stats["stagger"]) == before:
		_quiet += Vector2i(1, spent)
	stats["tests"] = int(stats["tests"]) + 1
	stats["test_usec"] = int(stats["test_usec"]) + spent
	stats["test_usec_max"] = maxi(int(stats["test_usec_max"]), spent)


func _touch_test(v: Vehicle, vel: Vector2, speed: float, dt: float) -> void:
	var centre := WorldOrigin.to_world(v.global_position)
	var f3 := -v.global_basis.z
	var forward := Vector2(f3.x, f3.z).normalized()
	var h := v.type.spec.half_extents
	var half := Vector2(h.x, h.z)
	var band := StreetHits.band(speed)
	var walkers := life.population.walkers
	for a in walkers.agents:
		if not a.active or walkers.is_held(a) or life.downed.has(a.id) or life.stagger.has(a.id):
			continue
		if a.pos.distance_squared_to(centre) > 64.0:
			continue
		if StreetHits.swept(centre, forward, half, vel, dt, a.pos, StreetHits.RADIUS):
			_walker_hit(a, band, centre, vel, v)
	for p in life.population.people:
		if p.pos.distance_squared_to(centre) > 64.0:
			continue
		if not StreetHits.can_be_hit(p.child, p.play):
			if StreetHits.swept(centre, forward, half, vel, dt, p.pos, StreetHits.RADIUS):
				stats["children_passed"] = int(stats["children_passed"]) + 1
			continue
		if life.downed_crowd.has(p.key):
			continue
		if StreetHits.swept(centre, forward, half, vel, dt, p.pos, StreetHits.RADIUS):
			_crowd_hit(p, band, centre, vel, v)


func _walker_hit(a: AgentSystem.Agent, band: StringName, centre: Vector2, vel: Vector2, v: Vehicle) -> void:
	var walkers := life.population.walkers
	var who := life.cast.walker(a.id)
	if band == &"stagger" or is_minor(who):
		# Rocked back, looking at the vehicle (fear: step back if facing it, else hurry on).
		walkers.scare(centre, a.pos.distance_to(centre) + 0.3, 2.0)
		life.stagger[a.id] = StreetHits.STAGGER_TIME
		_incident(&"stagger", &"walker", a.pos)
		return
	var fig := _take_fig(who)
	if fig == null:
		return
	walkers.hold(a)
	life.downed[a.id] = true
	var d := Down.new()
	d.who = &"walker"
	d.id = a.id
	d.fig = fig
	d.heading = a.heading
	var at := WorldOrigin.to_scene(a.pos, a.y)
	d.ground = at.y
	fig.global_transform = Transform3D(Basis(Vector3.UP, a.heading), at)
	_fall(d, StreetHits.launch(vel, a.pos - centre))
	v.knock(0.9)
	_incident(&"fall", &"walker", a.pos)


func _crowd_hit(p: CrowdField.Person, band: StringName, centre: Vector2, vel: Vector2, v: Vehicle) -> void:
	var who := life.cast.crowd_person(p.look, p.child, p.play)
	if band == &"stagger" or who == "" or is_minor(who):
		_incident(&"stagger", &"crowd", p.pos)
		return
	var fig := _take_fig(who)
	if fig == null:
		return
	life.downed_crowd[p.key] = true
	var d := Down.new()
	d.who = &"crowd"
	d.id = p.key
	d.fig = fig
	d.heading = p.yaw
	var at := WorldOrigin.to_scene(p.pos, 0.0)
	d.ground = at.y
	fig.global_transform = Transform3D(Basis(Vector3.UP, p.yaw), at)
	_fall(d, StreetHits.launch(vel, p.pos - centre))
	v.knock(0.9)
	_incident(&"fall", &"crowd", p.pos)


func _knock_rider(view: TrafficVehicleView, launch: Vector3) -> void:
	if not is_instance_valid(view) or view.agent_id < 0 or life.taken.has(view.agent_id):
		return
	var traffic := life.population.traffic
	var a := traffic.agents[view.agent_id]
	if not a.active:
		return
	var group := traffic.kinds[a.kind].group
	var who := life.cast.driver(group, a.id)
	traffic.hold(a)
	life.taken[a.id] = true
	var d := Down.new()
	d.who = &"rider"
	d.id = a.id
	d.view = view
	d.heading = a.heading
	d.ground = view.global_position.y - view.ride_height()
	var seat := view.driver_transform()
	d.back_to = Vector3(seat.origin.x, d.ground, seat.origin.z) + view.global_basis.x * (view.variant.type.spec.half_extents.x + 0.5)
	# The vehicle stops where it is and goes over (a bike on its side, away from the push).
	var side := -1.0 if launch.dot(view.global_basis.x) > 0.0 else 1.0
	view.model.set_roll(side * (BIKE_DOWN if view.variant.type.leans else AUTO_LEAN))
	var fig := _take_fig(who) if not is_minor(who) else null
	if fig == null:
		# Nobody to draw (never a minor): the vehicle just waits a moment and drives on.
		d.phase = &"lying"
		_downs.append(d)
		return
	d.fig = fig
	fig.global_transform = Transform3D(seat.basis, seat.origin - seat.basis.y * CityLife.SEAT_HIP)
	_fall(d, launch + Vector3(0, 0.6, 0))
	var at := WorldOrigin.to_world(view.global_position)
	_incident(&"fall", &"rider", at)


func _fall(d: Down, launch: Vector3) -> void:
	d.velocity = launch
	d.phase = &"flying"
	d.t = 0.0
	d.fig.set_seat(null)
	d.fig.play(&"idle")
	d.fig.play_fall(launch)
	_downs.append(d)


## The reaction around an incident: counted, bystanders, the crowd looks, a honk, the crime.
func _incident(band: StringName, who: StringName, at: Vector2) -> void:
	var key: StringName = &"rider" if who == &"rider" else band
	stats[key] = int(stats[key]) + 1
	reacted.emit(band, who, at)
	life.population.walkers.scare(at, StreetHits.BYSTANDER_REACH, StreetHits.SCARE_SECONDS)
	life.report_incident(&"rider_down" if who == &"rider" else (&"person_down" if band == &"fall" else &"stagger"), at)
	if band == &"fall":
		_honk_from_near(at)
		if wanted != null:
			wanted.report("pedestrianInjured", true)


func _honk_from_near(at: Vector2) -> void:
	var traffic := life.population.traffic
	var best: AgentSystem.Agent = null
	var best_d := StreetHits.HONK_REACH
	for a in traffic.agents:
		if not a.active or life.taken.has(a.id):
			continue
		var dist := a.pos.distance_to(at)
		if dist < best_d:
			best_d = dist
			best = a
	if best == null:
		return
	_honk_in = HONK_AFTER
	_honk_kind = VehicleCatalog.variant(traffic.kinds[best.kind].name).type.kind
	_honk_at = WorldOrigin.to_scene(best.pos, best.y)


## A walker lying in the road is where the AI sees them; up again, handed back there.
func _settle(d: Down) -> void:
	if d.who == &"walker":
		var a := life.population.walkers.agents[d.id]
		if d.phase in [&"lying", &"rising"] and not d.placed:
			d.placed = true
			life.population.walkers.move_agent(a, WorldOrigin.to_world(d.fig.global_position), d.heading)
		elif d.phase == &"walking":
			life.population.walkers.move_agent(a, WorldOrigin.to_world(d.fig.global_position), d.heading)
			life.population.walkers.let_go(a)
			life.downed.erase(d.id)
			d.phase = &"done"
	elif d.who == &"crowd" and d.phase == &"walking":
		life.downed_crowd.erase(d.id)
		d.phase = &"done"
	elif d.who == &"rider" and d.phase == &"walking" and _back(d):
		if is_instance_valid(d.view):
			d.view.model.set_roll(0.0)
			life.taken.erase(d.id)
			life.population.traffic.let_go(life.population.traffic.agents[d.id])
		d.phase = &"done"


func _back(d: Down) -> bool:
	if d.fig == null:
		return true
	var gap := Vector2(d.back_to.x - d.fig.global_position.x, d.back_to.z - d.fig.global_position.z).length()
	return gap < 0.3 or d.t > WALK_BACK_MAX


func _physics_process(dt: float) -> void:
	if _honk_in >= 0.0:
		_honk_in -= dt
		if _honk_in < 0.0:
			honk.emit(_honk_kind, _honk_at)
	if _downs.is_empty():
		return
	var cam := get_viewport().get_camera_3d()
	for d in _downs:
		_animate(d, dt)
		if d.fig != null:
			d.fig.advance(dt, d.fig.global_position.distance_to(cam.global_position) if cam != null else 0.0, true)


func _animate(d: Down, dt: float) -> void:
	d.t += dt
	var fig := d.fig
	match d.phase:
		&"flying":
			d.velocity.y -= GRAVITY * dt
			var p := _blocked(d, fig.global_position, fig.global_position + d.velocity * dt)
			if p.y <= d.ground and d.velocity.y < 0.0:
				p.y = d.ground
				d.velocity.y = 0.0
				fig.play_landed()
				d.phase = &"sliding"
			fig.global_position = p
		&"sliding":
			var flat := Vector2(d.velocity.x, d.velocity.z)
			var speed := maxf(0.0, flat.length() - SCRAPE * dt)
			flat = flat.normalized() * speed if speed > 0.0 else Vector2.ZERO
			d.velocity = Vector3(flat.x, 0.0, flat.y)
			var to := _blocked(d, fig.global_position, fig.global_position + d.velocity * dt)
			to.y = d.ground
			fig.global_position = to
			if speed <= 0.0:
				d.phase = &"lying"
				d.t = 0.0
		&"lying":
			if d.t >= (StreetHits.RIDER_LIE if d.who == &"rider" else StreetHits.LIE):
				d.t = 0.0
				if fig == null:
					d.phase = &"walking"
				else:
					fig.play_getup()
					d.phase = &"rising"
		&"rising":
			if fig.knockdown_state() == &"" or d.t > Knockdown.GETUP_TIME + 0.5:
				d.t = 0.0
				d.phase = &"walking"
				if d.who == &"rider":
					fig.play(&"walk", WALK_BACK_SPEED)
		&"walking":
			if d.who == &"rider" and fig != null and not _back(d):
				var to := d.back_to - fig.global_position
				to.y = 0.0
				var step := minf(to.length(), WALK_BACK_SPEED * dt)
				fig.global_transform = Transform3D(Basis(Vector3.UP, atan2(-to.x, -to.z)), fig.global_position + to.normalized() * step)


## The body's move from `from` to `to` stopped by walls, poles and vehicles (a ray at the waist),
## and the ground under it followed (kerbs, pavements). Only for people in motion: one or two
## rays a frame each, for the second or two they slide.
func _blocked(d: Down, from: Vector3, to: Vector3) -> Vector3:
	var space := life.get_world_3d().direct_space_state
	var waist := Vector3(0, 0.5, 0)
	var q := PhysicsRayQueryParameters3D.create(from + waist, to + waist, PhysicsLayers.WORLD | PhysicsLayers.VEHICLES)
	if d.view != null and is_instance_valid(d.view):
		q.exclude = [d.view.get_rid()]
	var hit := space.intersect_ray(q)
	var out := to
	if not hit.is_empty():
		var flat := Vector3(to.x - from.x, 0.0, to.z - from.z)
		var at := (hit["position"] as Vector3) - waist - flat.normalized() * 0.3
		out = Vector3(at.x, to.y, at.z)
		d.velocity = Vector3(0.0, minf(0.0, d.velocity.y), 0.0)
	var down := PhysicsRayQueryParameters3D.create(out + Vector3(0, 1.0, 0), out + Vector3(0, -1.5, 0), PhysicsLayers.WORLD)
	var ground := space.intersect_ray(down)
	if not ground.is_empty():
		d.ground = (ground["position"] as Vector3).y
	return out


func _take_fig(who: String) -> PersonView:
	if who == "" or is_minor(who):
		return null
	var list: Array = _spare.get(who, [])
	var fig: PersonView = list.pop_back() if not list.is_empty() else life.pool.make_view(who)
	if fig == null:
		return null
	if fig.get_parent() == null:
		life.pool.add_child(fig)
	fig.visible = true
	fig.rotation = Vector3.ZERO
	return fig


func _release(d: Down) -> void:
	if d.fig == null:
		return
	d.fig.visible = false
	if not _spare.has(d.fig.person_id):
		_spare[d.fig.person_id] = []
	_spare[d.fig.person_id].append(d.fig)
	d.fig = null
