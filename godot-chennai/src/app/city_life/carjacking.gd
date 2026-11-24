class_name Carjacking
extends Node
## Carjacking in the game (TD-30, G-128): stop a traffic car, auto or bike (stand in front of it,
## or catch it at a red light), get in, pull the driver out, drive off; a crime.
##
## - While the player is on foot, the nearest traffic vehicle of a takeable kind that is all but
##   stopped and within `Carjack.REACH` (`Carjack.pick`) is swapped for a real drivable `Vehicle`
##   of the same variant and paint at the same place, with its driver seated in it. The AI agent
##   is held (it stays in everyone's way) and its view hidden. The swapped vehicle is marked
##   `driver_aboard`, so `Driving.enter` plays the pull phase of the boarding (G-77): the
##   game's usual Get-in button and boarding do the rest.
## - When the driver is pulled out (`boarding_event` "pulled") the crime is reported (`Wanted`
##   "carjacking", when the game has one) and `carjacked` is emitted; the driver runs off and
##   walkers near by are scared. Once the player is seated, the agent is let go to a new place
##   out of sight and the vehicle is the player's.
## - If the player walks away instead, the swap is undone and the traffic drives on.
## - Moving ones too (G-300): within reach of a car, auto or bike going up to
##   `Carjack.MAX_TAKE_SPEED`, the ACTION button offers TAKE OVER (`offer`). Pressed, the next
##   step between the AI's steps swaps the vehicle in at once (stopped dead, the driver at the wheel)
##   and starts the boarding with the pull phase. Buses and ambulances are never offered; drivers
##   are adults by `CastPicker`, so no child is ever pulled out.
## Runs between the AI's steps (`CityLife.between_steps`), never while the AI thread runs.

signal carjacked(look: StringName, at: Vector2)

## The swap is undone when the player is this far from the vehicle without getting in.
const GIVE_UP := 5.0
## Taken vehicles left behind are freed this far from the player (beyond the chunk unload).
const FORGET := 360.0
const FLEE_SECONDS := 9.0
const FLEE_SPEED := 3.2
## A pulled driver staggers (leans, slower) for this long before running (fallback for the fall clip).
const STAGGER_SECONDS := 0.6

var life: CityLife
var driving: Driving
## The game's wanted level (Phase 5 wires one); null: the crime is only signalled.
var wanted: Wanted = null
## The swapped vehicle waiting to be taken, its agent and its seated driver.
var vehicle: Vehicle = null
var agent_id: int = -1
var _driver: PersonView = null
var _pulled := false
## The agent the player asked to take over (TAKE OVER pressed), done in the next step; -1: none.
var _request: int = -1
## The takeable moving vehicle offered by the last step ({} when none), read by `offer`.
var _offered: Dictionary = {}
## Drivers running away: [view, seconds left, direction (scene)].
var _fleeing: Array[Array] = []
## Vehicles taken so far that still exist.
var stolen: Array[Vehicle] = []
## Counters for tests: swaps, undone, taken.
var stats: Dictionary = {"swapped": 0, "undone": 0, "taken": 0}


static func make(city_life: CityLife, session: Driving) -> Carjacking:
	var c := Carjacking.new()
	c.name = "Carjacking"
	c.life = city_life
	c.driving = session
	return c


func _ready() -> void:
	life.between_steps.connect(_step)
	driving.boarding_event.connect(_on_boarding)


func _traffic_list() -> Array:
	var out: Array = []
	var traffic := life.population.traffic
	for a in traffic.agents:
		if not a.active or life.taken.has(a.id):
			continue
		var k := traffic.kinds[a.kind]
		out.append({"id": a.id, "kind": String(k.group), "x": a.pos.x, "z": a.pos.y, "heading": a.heading, "speed": a.speed, "half_width": k.half_width, "half_length": k.half_length})
	return out


func _step(dt: float) -> void:
	_run_away(dt)
	_forget_far()
	_offered = {}
	if driving.rider == null:
		_request = -1
		return
	var feet := WorldOrigin.to_world(driving.rider.position())
	if vehicle != null:
		_request = -1
		if driving.vehicle == vehicle:
			_finish()
		elif driving.boarding_vehicle != vehicle and driving.mode() == &"foot" and not _pulled:
			var at := WorldOrigin.to_world(vehicle.global_position)
			if Carjack.distance_to_footprint(feet.x, feet.y, {"x": at.x, "z": at.y, "heading": vehicle.yaw(), "half_width": vehicle.type.spec.half_extents.x, "half_length": vehicle.type.spec.half_extents.z}) > GIVE_UP:
				_undo()
		return
	if driving.mode() != &"foot" or driving.boarding != null:
		_request = -1
		return
	# Only as close as the Get-in button offers a vehicle (it then offers this one).
	var reach := minf(Carjack.REACH, Driving.ENTER_REACH - 0.2)
	var list := _traffic_list()
	var asked := _request
	_request = -1
	if asked >= 0:
		# The one the player pressed for, not whoever is nearest by now.
		list = list.filter(func(e: Dictionary) -> bool: return int(e["id"]) == asked)
	var pick := Carjack.pick(feet.x, feet.y, list, reach, Carjack.MAX_TAKE_SPEED)
	if pick.is_empty():
		if asked >= 0:
			# Gone, out of reach or too fast by now: never a silent press.
			driving.toast.emit("Too far to take over")
		return
	var id := int(pick["id"])
	if absf(float(pick["speed"])) < Carjack.MAX_SPEED or id == asked:
		_swap(id)
		if id == asked:
			driving.enter(vehicle)
	else:
		_offered = pick


## The ACTION button's TAKE OVER (an `ActionContext` source): a moving vehicle in reach, or the
## stopped one already swapped in. Reads only what the last step cached, never the AI's agents.
func offer() -> Variant:
	if driving.mode() != &"foot" or driving.rider == null or driving.boarding != null:
		return null
	if vehicle != null:
		if _pulled:
			return null
		var gap := vehicle.global_position.distance_to(driving.rider.position())
		return ActionCandidate.make("TAKE OVER", ActionContext.P_TAKE_OVER, gap, func() -> void: driving.enter(vehicle))
	if _offered.is_empty():
		return null
	var id := int(_offered["id"])
	var feet := WorldOrigin.to_world(driving.rider.position())
	var gap := Carjack.distance_to_footprint(feet.x, feet.y, _offered)
	return ActionCandidate.make("TAKE OVER", ActionContext.P_TAKE_OVER, gap, func() -> void: request(id))


## How many pulled-out drivers are still running off.
func fleeing_count() -> int:
	return _fleeing.size()


## Take over this traffic vehicle at the next step (it is checked again then: still in reach,
## still takeable). Pressing TAKE OVER calls this.
func request(id: int) -> void:
	_request = id


func _swap(id: int) -> void:
	var traffic := life.population.traffic
	var a := traffic.agents[id]
	var view := life.views[id]
	traffic.hold(a)
	life.taken[id] = true
	view.visible = false
	(view.get_child(0) as CollisionShape3D).disabled = true
	var v := Vehicle.new()
	v.variant = view.variant
	v.type = view.variant.type
	v.id = StringName("taken_%d_%d" % [id, stats["swapped"]])
	v.name = String(v.id)
	v.setup(v.type.spec)
	v.model = VehicleModel.build(v.type, v.variant)
	v.add_child(v.model)
	v.add_to_group(Vehicle.GROUP)
	v.add_to_group(WorldOrigin.GROUP)
	v.set_meta(&"driver_aboard", true)
	v.park()
	# Where the view is drawn (it moved on since the AI's last step), standing still from now on.
	var drawn := WorldOrigin.to_world(view.global_position)
	v.place(WorldOrigin.to_scene(drawn, a.y), a.heading)
	life.world.add_child(v)
	vehicle = v
	agent_id = id
	_pulled = false
	var who := life.cast.driver(traffic.kinds[a.kind].group, id)
	_driver = life.pool.make_view(who) if who != "" else null
	if _driver != null:
		v.add_child(_driver)
		_driver.transform = Transform3D(Basis.IDENTITY, view.driver_seat - Vector3(0, _driver.seat_height, 0))
		_driver.play(&"sit")
		_driver.visible = true
	stats["swapped"] = int(stats["swapped"]) + 1


## The player walked away: the traffic vehicle is back where the drivable one stands.
func _undo() -> void:
	var traffic := life.population.traffic
	var a := traffic.agents[agent_id]
	var at := WorldOrigin.to_world(vehicle.global_position)
	traffic.move_agent(a, at, vehicle.yaw())
	traffic.let_go(a)
	life.taken.erase(agent_id)
	vehicle.queue_free()
	vehicle = null
	_driver = null
	agent_id = -1
	stats["undone"] = int(stats["undone"]) + 1


func _on_boarding(v: Vehicle, event: StringName) -> void:
	if v != vehicle or event != &"pulled":
		return
	_pulled = true
	v.remove_meta(&"driver_aboard")
	var at := WorldOrigin.to_world(v.global_position)
	var look := life.views[agent_id].variant.id
	if wanted != null:
		wanted.report("carjacking")
	carjacked.emit(look, at)
	life.population.walkers.scare(at, 14.0, 5.0)
	if _driver != null:
		# Out of the seat on the far side from the player, and away.
		var side := v.global_basis.x
		var away := WorldOrigin.to_world(driving.rider.position()) - at
		var dir := Vector3(side.x, 0, side.z) * (-1.0 if Vector2(side.x, side.z).dot(away) > 0.0 else 1.0)
		var feet := v.global_position + dir * (v.type.spec.half_extents.x + 0.6)
		feet.y = v.global_position.y + v.model.position.y
		_driver.reparent(life.pool)
		_driver.global_transform = Transform3D(Basis(Vector3.UP, atan2(-dir.x, -dir.z)), feet)
		# Stumbles first (the fall clips come with the animation work), then runs.
		_driver.play(&"idle")
		_fleeing.append([_driver, FLEE_SECONDS, dir.normalized()])
		_driver = null


## Seated: the vehicle is the player's, the agent goes back into the pool elsewhere.
func _finish() -> void:
	var traffic := life.population.traffic
	var a := traffic.agents[agent_id]
	traffic.let_go(a, true, life.focus_world())
	life.taken.erase(agent_id)
	if vehicle.has_meta(&"driver_aboard"):
		vehicle.remove_meta(&"driver_aboard")
	stolen.append(vehicle)
	vehicle = null
	agent_id = -1
	stats["taken"] = int(stats["taken"]) + 1


func _run_away(dt: float) -> void:
	var cam := get_viewport().get_camera_3d()
	for i in range(_fleeing.size() - 1, -1, -1):
		var f: Array = _fleeing[i]
		var view: PersonView = f[0]
		var left: float = f[1] - dt
		f[1] = left
		var dir: Vector3 = f[2]
		var staggering := FLEE_SECONDS - left < STAGGER_SECONDS
		view.rotation.x = -0.4 if staggering else 0.0
		if not staggering and view.clip != &"run":
			view.play(&"run", FLEE_SPEED)
		view.global_position += dir * FLEE_SPEED * (0.4 if staggering else 1.0) * dt
		view.advance(dt, view.global_position.distance_to(cam.global_position) if cam != null else 0.0)
		if left <= 0.0:
			view.queue_free()
			_fleeing.remove_at(i)


func _forget_far() -> void:
	var focus := life.focus_world()
	for i in range(stolen.size() - 1, -1, -1):
		var v := stolen[i]
		if not is_instance_valid(v):
			stolen.remove_at(i)
		elif not v.is_driven() and driving.boarding_vehicle != v and WorldOrigin.to_world(v.global_position).distance_to(focus) > FORGET:
			v.queue_free()
			stolen.remove_at(i)
