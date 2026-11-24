class_name TransitLayer
extends Node3D
## Buses and stations in the game (decisions G-214…G-219), wired from the pure `src/transit`
## logic to the views; no transit rules of its own.
##
## - **Route buses.** Gives the traffic a `RouteBuses` (between AI steps, `CityLife.between_steps`),
##   keeps its hour, copies its snapshot each step and draws it: doors open at stops
##   (`TrafficVehicleView.set_doors`), the destination sign (`RouteSign`, Tamil and English).
## - **Passenger.** Near a stop the HUD hint shows the stop and the next bus (`TransitHint`); a bus
##   of a route through the stop is sent towards it (`RouteBuses.request`). When one stands there
##   with its doors open the ACTION button offers BOARD (`ActionContext`): the ticket is paid from
##   the missions' purse with a toast, the player stands inside holding on (the cast's idle clip),
##   a few seated adults ride along, an interior camera looks down the bus, the next stop is
##   announced in Tamil and English, FAST TRAVEL skips to it behind a short fade, and ACTION
##   (ALIGHT) or the last stop puts the player back on the pavement. Never during a crash or while
##   wanted (`wanted_level`, 0 until phase 5).
## - **Stations.** Inside a station's place (`StationPlace`) the hint shows its names, platforms
##   and the next trains (`TrainService` stub: trains are phase 6).
## - **Bus job.** The baked bus jobs move onto the mapped stops (`BusJobRoutes.adapt`) and one job
##   on a real route is added.

## The hint shows a stop this close, metres; a bus is sent when the player is this close.
const HINT_REACH := 35.0
const SEND_REACH := 22.0
const CANCEL_REACH := 70.0
## BOARD is offered this close to the bus's front door, metres.
const BOARD_REACH := 9.0
## Seconds the doors stay held after boarding or alighting, and the fade's half length.
const HOLD_AFTER := 1.6
const FADE := 0.25
## Where the player stands in a city bus (bus frame, model ground at y 0; behind the middle, by the
## rear ceiling rail) and where the interior camera sits.
const STAND := Vector3(-0.15, 1.08, 1.7)
const EYE := Vector3(0.35, 2.75, 4.9)
const SEATED_PASSENGERS := 4
## The player steps off at the stop's pole when it is this close to the door, metres.
const ALIGHT_TO_POLE := 16.0
## How long fast travel waits for the next stop's streets to load, physics frames.
const JUMP_WAIT := 600

signal boarded(route_ref: String, fare: int)
signal alighted(stop_name: String)

var world: CityWorld
var life: CityLife
var rig: PlayerRig
var driving: Driving = null
var missions: MissionsLayer = null
var network: TransitNetwork = null
var buses: RouteBuses = null
var trains: TrainService = null
var places: Array[StationPlace] = []
var ride: BusRide = null
var hint: TransitHint
## 0 while nobody wants the player (Phase 5's `Wanted` replaces it).
var wanted_level: Callable = func() -> int: return 0
## Purse when no missions layer is present (tests): balance and charge.
var purse: float = 500.0
## The bus jobs' differences from the baked stops (`BusJobRoutes.adapt` reports, by job id).
var job_report: Dictionary = {}
var _snap: Dictionary[int, Dictionary] = {}
var _commands: Array[Callable] = []
var _hooked := false
var _signed: Dictionary[int, int] = {}
var _font: Font
var _canvas: CanvasLayer
var _fade: ColorRect
var _requested_stop: int = -1
var _anchor: Node3D = null
var _eye: Camera3D = null
var _riding_view: TrafficVehicleView = null
var _passengers: Array[PersonView] = []
var _announce: Dictionary = {}
var _jumping := false
var _ending := false
var _station_check := 0.0
var _station: StationPlace = null
var _action_source: Callable = Callable()
## Main-thread time of this layer's physics frames, µs: {frames, total, max} (frame-time log).
## False keeps route buses out of the traffic (the before/after frame-time comparison).
var routes_on: bool = true
var cost: Dictionary = {"frames": 0, "total": 0, "max": 0}


static func make(city: CityWorld, city_life: CityLife, player: PlayerRig) -> TransitLayer:
	var t := TransitLayer.new()
	t.name = "TransitLayer"
	t.world = city
	t.life = city_life
	t.rig = player
	# After CityLife (0) has synced the views each physics frame; before the camera (100).
	t.process_physics_priority = 10
	return t


## Loading work: the network on a worker thread, the views' hook, the HUD hint. "" or the error;
## no transit data is not an error (the game runs without buses on routes).
func prepare() -> String:
	_font = TransitFonts.with_tamil()
	_canvas = CanvasLayer.new()
	_canvas.layer = 6
	add_child(_canvas)
	hint = TransitHint.new()
	_canvas.add_child(hint)
	hint.fast_travel_pressed.connect(fast_travel)
	_fade = ColorRect.new()
	_fade.color = Color(0, 0, 0, 0)
	_fade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_fade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_fade.visible = false
	_canvas.add_child(_fade)
	network = await BackgroundTask.start(TransitNetwork.load_dir.bind(TransitNetwork.DIR)).finish(get_tree())
	if network == null or not network.ok():
		push_warning("[transit] %s" % (network.error if network != null else "no network"))
		network = null
		return ""
	buses = RouteBuses.make(network)
	trains = TrainService.stub(network)
	places = StationPlace.all_from(network)
	ride = BusRide.make(network)
	if life != null:
		life.between_steps.connect(_between_steps)
	if rig != null and rig.controls != null:
		_action_source = rig.controls.action_context.add_source(_action)
	_adapt_jobs()
	print("[transit] %d stops, %d routes (%d in the first set), %d stations" % [network.stops.size(), network.routes.size(), int(network.counts()["first"]), network.stations.size()])
	return ""


func _ready() -> void:
	_find_missions()


func _find_missions() -> void:
	if missions != null:
		return
	var root := get_tree().root if is_inside_tree() else null
	if root == null:
		return
	for n in root.find_children("*", "MissionsLayer", true, false):
		missions = n as MissionsLayer
		return


# --- Between AI steps -------------------------------------------------------------------------


func _between_steps(_dt: float) -> void:
	if buses == null:
		return
	var traffic := life.population.traffic if life.population != null else null
	if traffic == null:
		return
	if not _hooked and routes_on:
		traffic.routes = buses
		_hooked = true
	buses.hour = life.hour()
	for c in _commands:
		c.call(traffic)
	_commands.clear()
	_snap = buses.snapshot()


func _queue(c: Callable) -> void:
	_commands.append(c)


# --- Each physics frame -----------------------------------------------------------------------


func _physics_process(dt: float) -> void:
	if network == null or life == null or not life.is_inside_tree():
		return
	var t0 := Time.get_ticks_usec()
	_draw_buses()
	if ride.riding():
		_step_ride(dt)
	else:
		_step_on_foot(dt)
	var used := Time.get_ticks_usec() - t0
	cost["frames"] = int(cost["frames"]) + 1
	cost["total"] = int(cost["total"]) + used
	cost["max"] = maxi(int(cost["max"]), used)


func _draw_buses() -> void:
	for id: int in _snap:
		if id >= life.views.size():
			continue
		var v := life.views[id]
		var st := _snap[id]
		v.set_doors(float(st["doors"]))
		var ri := int(st["route"])
		if _signed.get(id, -1) != ri:
			var r := network.routes[ri]
			v.set_route_sign(r.ref, r.to_name, r.to_ta, _font)
			_signed[id] = ri
	for id: int in _signed.keys():
		if not _snap.has(id) and id < life.views.size():
			life.views[id].set_route_sign("", "", "", _font)
			life.views[id].set_doors(0.0)
			_signed.erase(id)


func player_world() -> Vector2:
	return WorldOrigin.to_world(rig.body.global_position)


func _on_foot() -> bool:
	return rig.body.is_on_foot() and (driving == null or driving.mode() == &"foot")


func _step_on_foot(dt: float) -> void:
	if not _on_foot():
		hint.hide_hint()
		return
	var at := player_world()
	var stop := network.nearest_served_stop(at, HINT_REACH)
	if stop != null:
		var nb := network.next_bus(stop, life.hour())
		var line := ""
		var coming := _coming_to(stop)
		if not coming.is_empty():
			var r := network.routes[int(coming["route"])]
			line = "%s to %s · %s" % [r.ref, r.to_name, "at the stop" if int(coming["stop"]) == stop.index else "coming"]
		elif not nb.is_empty():
			var r := nb["route"] as TransitNetwork.Route
			line = "Next bus %s to %s · %d min" % [r.ref, r.to_name, maxi(1, ceili(float(nb["minutes"])))]
		else:
			line = "No bus now"
		hint.show_stop(stop.label(), stop.name_ta, line)
		if at.distance_to(stop.position) <= SEND_REACH and _requested_stop != stop.index and not nb.is_empty():
			_requested_stop = stop.index
			var r := nb["route"] as TransitNetwork.Route
			var k := r.stop_number(stop.index)
			_queue(func(_t: AgentSystem) -> void: buses.request(r, k))
		return
	if _requested_stop >= 0 and at.distance_to(network.stops[_requested_stop].position) > CANCEL_REACH:
		_requested_stop = -1
		_queue(func(_t: AgentSystem) -> void: buses.cancel_request())
	_station_check -= dt
	if _station_check <= 0.0:
		_station_check = 0.5
		_station = StationPlace.find(places, at)
	if _station != null:
		hint.show_station(_station.station.label(), _station.station.name_ta, station_line(_station, life.hour()))
	else:
		hint.hide_hint()


## The route bus coming to (or standing at) a stop: its snapshot plus "id", or {}.
func _coming_to(stop: TransitNetwork.Stop) -> Dictionary:
	for id: int in _snap:
		var st := _snap[id]
		var r := network.routes[int(st["route"])]
		var k := r.stop_number(stop.index)
		if k >= 0 and int(st["next"]) == k:
			var out := st.duplicate()
			out["id"] = id
			return out
	return {}


## "Platforms 1, 2 · Beach - Tambaram 3 min · trains are not running yet"
func station_line(sp: StationPlace, hour: float) -> String:
	var parts: PackedStringArray = []
	var pl := sp.platform_list()
	if not pl.is_empty():
		parts.append("Platforms: %s" % ", ".join(pl))
	var dep := trains.departures(sp.station, hour)
	if not dep.is_empty():
		var ln := dep[0]["line"] as TransitNetwork.RailLine
		parts.append("%s · %d min" % [_short_line(ln.name), maxi(1, ceili(float(dep[0]["minutes"])))])
	if not trains.has_trains():
		parts.append("no trains yet")
	return " · ".join(parts)


static func _short_line(name: String) -> String:
	return name.replace(" suburban line", "").replace("Chennai ", "")


# --- The ACTION button ------------------------------------------------------------------------


func _action() -> Variant:
	if network == null:
		return null
	if ride.riding():
		var st: Dictionary = _snap.get(ride.agent_id, {})
		if not _jumping and ride.can_alight(st):
			return ActionCandidate.make("ALIGHT", ActionContext.P_HAND_OVER + 10, 0.0, alight)
		return null
	if not _on_foot():
		return null
	var id := bus_to_board()
	if id < 0:
		return null
	return ActionCandidate.make("BOARD", ActionContext.P_BOARD + 1, _door_point(life.views[id]).distance_to(rig.body.global_position), board.bind(id))


## A route bus standing with its doors open whose front door is within reach, or -1.
func bus_to_board() -> int:
	var feet := rig.body.global_position
	for id: int in _snap:
		var st := _snap[id]
		if int(st["state"]) == RouteBuses.DRIVING or float(st["doors"]) < 0.6 or id >= life.views.size():
			continue
		var v := life.views[id]
		if v.visible and _door_point(v).distance_to(feet) <= BOARD_REACH:
			return id
	return -1


## The bus's front door on the kerb side at the pavement (scene position).
func _door_point(v: TrafficVehicleView) -> Vector3:
	var m := VehicleCatalog.manifest_for(v.variant.type)
	var entry: Dictionary = m.data.get("entry", {}) if m != null else {}
	var p: Array = entry.get("point", [-2.0, 0.0, -4.4])
	var local := Vector3(float(p[0]), 0.0, float(p[2])) + Vector3(0, v.model.position.y, 0)
	return v.global_transform * local


func _balance() -> float:
	_find_missions()
	if missions != null and missions.session != null:
		return float(missions.session.runner.balance())
	return purse


func _charge(rupees: int) -> void:
	if missions != null and missions.session != null:
		missions.session.runner.charge(float(rupees))
		missions.session.save()
	else:
		purse -= rupees


func _toast(title: String, detail: String) -> void:
	if missions != null and missions.hud != null:
		missions.hud.toast(title, detail)


func _crashed() -> bool:
	return not rig.body.controls_enabled or (driving != null and driving.mode() == &"thrown")


## Board the route bus `id` standing at a stop.
func board(id: int) -> bool:
	var st: Dictionary = _snap.get(id, {})
	if st.is_empty() or ride.riding():
		return false
	var r := network.routes[int(st["route"])]
	var k := int(st["next"])
	var out := ride.board(r, k, id, _balance(), int(wanted_level.call()), _crashed(), _on_foot())
	_toast(String(out["title"]), String(out["detail"]))
	if not bool(out["ok"]):
		return false
	_charge(int(out["fare"]))
	_queue(func(_t: AgentSystem) -> void:
		buses.cancel_request()
		buses.set_carrying(id, true)
		buses.hold_doors(id, true))
	_requested_stop = -1
	var v := life.views[id]
	_riding_view = v
	_anchor = Node3D.new()
	_anchor.name = "PassengerSpot"
	v.add_child(_anchor)
	_anchor.position = STAND + Vector3(0, v.model.position.y, 0)
	rig.body.enter_vehicle(v, _anchor)
	_walk_parts(false)
	_eye = Camera3D.new()
	_eye.name = "InteriorCamera"
	_eye.fov = 72.0
	_eye.near = 0.08
	v.add_child(_eye)
	_eye.position = EYE + Vector3(0, v.model.position.y, 0)
	_eye.rotation = Vector3(-0.12, 0.0, 0.0)
	_eye.make_current()
	_seat_passengers(v)
	_announce = {}
	hint.show_ride("Route %s to %s" % [r.ref, r.to_name], r.to_ta, String(out["title"]), false)
	get_tree().create_timer(HOLD_AFTER, false, true).timeout.connect(func() -> void:
		if ride.riding() and ride.agent_id == id:
			_queue(func(_t: AgentSystem) -> void: buses.hold_doors(id, false)))
	boarded.emit(r.ref, int(out["fare"]))
	return true


## Riding, the stick and JUMP do nothing: hide them (only real options); ACTION stays for ALIGHT.
func _walk_parts(on: bool) -> void:
	if rig.controls == null:
		return
	for part: String in ["Stick", "Jump"]:
		var n := rig.controls.find_child(part, true, false) as CanvasItem
		if n != null:
			n.visible = on


func _seat_passengers(v: TrafficVehicleView) -> void:
	var m := VehicleCatalog.manifest_for(v.variant.type)
	if m == null or life.pool == null or life.cast == null:
		return
	var seats: Array[Vector3] = []
	for s: Dictionary in m.data.get("seats", []):
		if String(s.get("role", "")) == "passenger":
			var hip: Array = s.get("hip", [0, 0, 0])
			seats.append(Vector3(float(hip[0]), float(hip[1]), float(hip[2])))
	for i in mini(SEATED_PASSENGERS, seats.size()):
		# Every fourth seat from the front: the bus is not full. Adults only (walkers are adults).
		var seat := seats[mini(seats.size() - 1, 2 + i * 4)]
		var who := life.cast.walker(37 + i * 5)
		if who == "":
			continue
		var fig := life.pool.make_view(who)
		if fig == null:
			continue
		v.add_child(fig)
		fig.position = seat + Vector3(0, v.model.position.y - fig.seat_height, 0)
		fig.rotation = Vector3.ZERO
		fig.play(&"sit", 0.0, 0.3 * i)
		_passengers.append(fig)


func _step_ride(dt: float) -> void:
	rig.body.figure.advance(dt, 0.0, true)
	for p in _passengers:
		p.advance(dt, 2.0)
	var st: Dictionary = _snap.get(ride.agent_id, {})
	if _jumping or _ending:
		return
	for e in ride.update(st):
		match String(e["type"]):
			"announce":
				_announce = e
			"terminus":
				_ending = true
				get_tree().create_timer(1.0, false, true).timeout.connect(func() -> void:
					_ending = false
					if ride.riding():
						alight())
			"lost":
				alight()
				return
	var r := ride.route
	if r == null:
		return
	var standing := not st.is_empty() and int(st["state"]) != RouteBuses.DRIVING
	var detail := "Route %s to %s" % [r.ref, r.to_name]
	if standing and ride.can_alight(st):
		detail += " · ACTION to get off"
	if standing and int(st["next"]) < r.stops.size():
		var here := network.stops[r.stops[int(st["next"])]]
		hint.show_ride("At %s" % here.label(), here.name_ta if here.name_ta != "" else r.to_ta, detail, _can_fast_travel(st))
	elif _announce.is_empty():
		hint.show_ride(detail, r.to_ta, "", _can_fast_travel(st))
	else:
		hint.show_ride(String(_announce["en"]), String(_announce["ta"]), detail, _can_fast_travel(st))


func _can_fast_travel(st: Dictionary) -> bool:
	return not st.is_empty() and ride.riding() and int(st["next"]) < ride.route.stops.size() and not _jumping


## Get off the bus: back on the pavement by the front door, facing away from the road.
func alight() -> bool:
	if not ride.riding():
		return false
	var id := ride.agent_id
	var st: Dictionary = _snap.get(id, {})
	var stop := ride.alight(st)
	var v := _riding_view
	var feet := _door_point(v) if v != null else rig.body.global_position
	# The stop's pole stands on the pavement: step off there when the bus stopped near it (a bus
	# standing out in its lane would otherwise leave the player in the carriageway).
	if stop != null:
		var pole := WorldOrigin.to_scene(stop.position, feet.y)
		var to_door := Vector2(feet.x - pole.x, feet.z - pole.z)
		if to_door.length() < ALIGHT_TO_POLE:
			# A step towards the road from the pole (its shelter stands on the pole).
			var step := to_door.normalized() * minf(1.5, to_door.length())
			feet = pole + Vector3(step.x, 0.0, step.y)
	var yaw := (v.global_rotation.y + PI / 2.0) if v != null else rig.body.yaw
	rig.body.exit_vehicle(feet + Vector3(0, 0.05, 0), yaw)
	_walk_parts(true)
	rig.camera.camera.make_current()
	rig.camera.yaw = yaw
	rig.camera.snap()
	for p in _passengers:
		p.queue_free()
	_passengers.clear()
	if _eye != null:
		_eye.queue_free()
		_eye = null
	if _anchor != null:
		_anchor.queue_free()
		_anchor = null
	_riding_view = null
	_queue(func(_t: AgentSystem) -> void:
		buses.set_carrying(id, false)
		buses.hold_doors(id, true))
	get_tree().create_timer(HOLD_AFTER, false, true).timeout.connect(func() -> void:
		_queue(func(_t: AgentSystem) -> void: buses.hold_doors(id, false)))
	hint.hide_hint()
	var name_text := stop.label() if stop != null else ""
	if name_text != "":
		_toast(name_text, stop.name_ta)
	alighted.emit(name_text)
	return true


## Skip the ride to the next stop behind a short fade (instant with reduced motion). When the
## next stop's streets are not loaded yet, the player is moved there first and the bus follows
## once they are (game time, at most JUMP_WAIT physics frames).
func fast_travel() -> void:
	if not ride.riding() or _jumping:
		return
	var st: Dictionary = _snap.get(ride.agent_id, {})
	if st.is_empty():
		return
	var target := int(st["next"])
	if int(st["state"]) != RouteBuses.DRIVING:
		target += 1
	if target >= ride.route.stops.size():
		return
	_jumping = true
	await _fade_to(1.0)
	var id := ride.agent_id
	var stop := network.stops[ride.route.stops[target]]
	var done := [false]
	# The streets stream round the next stop meanwhile (the player rides on in the bus).
	var proxy := Node3D.new()
	proxy.name = "FastTravelFocus"
	proxy.add_to_group(WorldOrigin.GROUP)
	world.add_child(proxy)
	proxy.global_position = WorldOrigin.to_scene(stop.position, 0.0)
	var before := world.focus_node
	world.focus_node = proxy
	for f in JUMP_WAIT:
		if f % 2 == 0 and world.world_ready_around(stop.position, 120.0):
			_queue(func(t: AgentSystem) -> void:
				if id < t.agents.size():
					done[0] = buses.jump_to_stop(t, t.agents[id], target))
		await GameLoop.wait_physics_frames(1)
		if bool(done[0]):
			break
	world.focus_node = before
	proxy.queue_free()
	if not bool(done[0]):
		_toast("Could not skip ahead", "The bus rides on to the next stop.")
	_jumping = false
	await _fade_to(0.0)


func _fade_to(alpha: float) -> void:
	var reduced := DisplayServer.accessibility_should_reduce_animation() == 1
	_fade.visible = true
	if reduced:
		_fade.color.a = alpha
	else:
		var tw := create_tween()
		tw.set_pause_mode(Tween.TWEEN_PAUSE_PROCESS)
		tw.tween_property(_fade, "color:a", alpha, FADE)
		await tw.finished
	_fade.visible = alpha > 0.0


# --- The bus job ------------------------------------------------------------------------------


func _adapt_jobs() -> void:
	_find_missions()
	if missions == null or missions.session == null or missions.session.content == null:
		return
	var content := missions.session.content
	for j in content.jobs:
		if j.kind == "bus":
			job_report[j.id] = BusJobRoutes.adapt(j, network)
	var job := real_route_job(Vector2(-149.2, 5.3))
	if job != null and content.job(job.id) == null:
		content.jobs.append(job)
		job_report[job.id] = {"made": true, "stops": job.stops.size(), "title": job.title}


## A job on the first-set route with a stop nearest `near` (the parked city bus): five stops on.
func real_route_job(near: Vector2) -> JobData.Job:
	var best: TransitNetwork.Route = null
	var best_k := -1
	var bd := INF
	for r in network.routes:
		if not r.first:
			continue
		for k in r.stops.size() - 4:
			var d := network.stops[r.stops[k]].position.distance_to(near)
			if d < bd:
				bd = d
				best = r
				best_k = k
	return BusJobRoutes.from_route(network, best, best_k, 5) if best != null else null


func _exit_tree() -> void:
	if _action_source.is_valid() and rig != null and rig.controls != null:
		rig.controls.action_context.remove_source(_action_source)
