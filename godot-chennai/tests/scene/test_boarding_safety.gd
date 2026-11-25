extends TestCase
## Getting on is safe (the owner's phone report on build afed12f: "When I entered the bike I was
## thrown away for a long distance"). In the real game (`main.tscn`, streamed city, live traffic
## and the parked vehicles round the start) every kind is boarded in a crowded street (parked
## neighbours a hand's width away, traffic passing), stood still and ridden off gently: nobody is
## thrown, the rider stays within 3 m of the vehicle for 5 s and the hit judge reports nothing.
## Waits in game time.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180
const SETTINGS := "user://test_boarding_safety_save.json"
## The rider must stay this close to the vehicle (metres) and on it for this long (game seconds).
const STAY := 3.0
const WATCH := 5.0

var _old_hour: float
var _old_weather: String
var _old_sound: String
var _old_origin: Vector2
## The shared save as it was (the game saves mission progress while these tests ride around;
## the next test that boots the game must find it unchanged). null: there was none.
var _old_save: Variant = null


func before_each() -> void:
	_old_hour = GameLoop.clock.hour
	_old_weather = Weather.settings_path
	_old_sound = Sound.settings_path
	_old_origin = Vector2(WorldOrigin.origin_x, WorldOrigin.origin_z)
	_old_save = FileAccess.get_file_as_string(SaveStore.DEFAULT_PATH) if FileAccess.file_exists(SaveStore.DEFAULT_PATH) else null
	GameLoop.clock.hour = 18.0
	Weather.settings_path = SETTINGS
	Sound.settings_path = SETTINGS
	Weather.set_raining(false, true, false)


func _restore() -> void:
	tree.paused = false
	WorldOrigin.recentre(_old_origin.x, _old_origin.y)
	GameLoop.clock.hour = _old_hour
	Weather.set_raining(false, true, false)
	Weather.settings_path = _old_weather
	Sound.settings_path = _old_sound
	Sound.suspend()
	if _old_save == null:
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SaveStore.DEFAULT_PATH))
	else:
		var f := FileAccess.open(SaveStore.DEFAULT_PATH, FileAccess.WRITE)
		f.store_string(String(_old_save))
		f.close()


func _play() -> Main:
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		return null
	main.play()
	await wait_physics_frames(2)
	return main


## Throttle and time of the ride-off: gentle, and short enough to stay inside the clear run.
const RIDE_GAS := 0.3
const RIDE_SECONDS := 2.0
## The ride-off heads where nothing solid stands for this far (metres).
const CLEAR_RUN := 40.0


## Watch the rider on `v` for `seconds` of game time. Standing: never thrown, never more than
## STAY metres from the vehicle, nothing felt, not shoved. `gas`: a gentle ride-off on a clear
## run (`_face_clear_run`): no throw or fall, and still within STAY of the vehicle, unless the
## vehicle touched something static first (then a throw is the crash rules' fair judgement of a
## real crash, which these tests are not about; it is reported, and the ride-off is clear of
## static solids for CLEAR_RUN metres, so it does not happen).
func _watch(main: Main, v: Vehicle, label: String, seconds: float, gas: bool) -> void:
	var d := main.play_wiring.driving
	var worst := 0.0
	var fastest := 0.0
	var modes: Dictionary[StringName, bool] = {}
	var static_contact := ""
	var off_before_contact := false
	d.gas = gas
	d.gas_amount = RIDE_GAS
	for i in int(seconds * 60.0):
		await wait_physics_frames(1)
		if not is_instance_valid(v):
			break
		# A judged hit against something static (a wall, a pole: not the ground, which the hit
		# measure leaves out, and not traffic or a parked vehicle).
		var hit := d.last_hit
		if static_contact == "" and hit != null and hit.hit != null and hit.hit.other is StaticBody3D:
			static_contact = (hit.hit.other as Node).name
		modes[d.mode()] = true
		if d.mode() != &"driving" and static_contact == "":
			off_before_contact = true
		if static_contact == "":
			worst = maxf(worst, d.rider.position().distance_to(v.global_position))
		fastest = maxf(fastest, v.linear_velocity.length())
	d.gas = false
	d.gas_amount = 1.0
	assert_true(worst <= STAY, "%s: the rider stays on (farthest %.2f m from the vehicle)" % [label, worst])
	if not gas:
		assert_eq(modes.keys(), [&"driving"] as Array[StringName], "%s: riding the whole time" % label)
		# Standing still nothing may even be felt.
		assert_true(d.last_crash == null, "%s: no crash judged (%s)" % [label, _describe(d.last_crash)])
		assert_true(d.last_hit == null, "%s: no hit felt (%s)" % [label, _describe(d.last_hit)])
		assert_true(fastest < 1.0, "%s: the vehicle is not shoved (%.1f m/s)" % [label, fastest])
		return
	assert_false(off_before_contact, "%s: never off the seat before touching anything static (%s; fastest %.1f m/s)" % [label, _describe(d.last_crash), fastest])
	if static_contact != "":
		print("    %s: touched %s on the clear run (%s, fastest %.1f m/s)" % [label, static_contact, _describe(d.last_crash), fastest])
	else:
		var off := d.last_crash != null and d.last_crash.type in [&"fall", &"thrown"]
		assert_false(off, "%s: never off the seat (%s; fastest %.1f m/s)" % [label, _describe(d.last_crash), fastest])


## Ride off gently along a clear run (turned onto one first; none clear: said and skipped).
func _ride_off(main: Main, v: Vehicle, label: String) -> void:
	if not _face_clear_run(v):
		print("    %s: no clear run round it, no ride-off" % label)
		return
	await wait_physics_frames(10)
	main.play_wiring.driving.last_crash = null
	main.play_wiring.driving.last_hit = null
	await _watch(main, v, "%s riding off" % label, RIDE_SECONDS, true)


## Turn the standing vehicle in place (direct placement, no driving) to the first of 16 headings,
## starting with its own, along which nothing static or parked stands for CLEAR_RUN metres (rays
## at the wheels' and the rider's height from both sides of the body). False if none is clear.
func _face_clear_run(v: Vehicle) -> bool:
	var space := v.get_world_3d().direct_space_state
	var h := v.type.spec.half_extents
	var feet := v.ground_point(Vector2.ZERO)
	var start := v.yaw()
	for i in 16:
		var heading := start + (float(floori((i + 1) / 2.0)) * TAU / 16.0) * (1.0 if i % 2 == 1 else -1.0)
		var fwd := Vector3(-sin(heading), 0, -cos(heading))
		var right := Vector3(cos(heading), 0, -sin(heading))
		var clear := true
		for side: float in [-1.0, 0.0, 1.0]:
			for up: float in [0.4, 1.0]:
				var from := feet + right * side * (h.x + 0.2) + Vector3(0, up, 0)
				var q := PhysicsRayQueryParameters3D.create(from, from + fwd * CLEAR_RUN, PhysicsLayers.WORLD | PhysicsLayers.VEHICLES)
				q.exclude = [v.get_rid()]
				if not space.intersect_ray(q).is_empty():
					clear = false
		if clear:
			if i > 0:
				v.place(feet, heading)
			return true
	return false


static func _describe(o: CrashRules.Outcome) -> String:
	if o == null:
		return "none"
	var other := "?"
	if o.hit != null and o.hit.other != null and is_instance_valid(o.hit.other):
		other = (o.hit.other as Node).name if o.hit.other is Node else str(o.hit.other)
	return "%s %.1f km/h from %s" % [o.type, o.impact_kmh, other]


## Park `count` vehicles of `variant` side by side (a hand's width apart) right beside `v`, as on
## a Chennai kerb, on the ground the game loaded.
func _crowd_round(main: Main, v: Vehicle, variant: StringName) -> Array[Vehicle]:
	var out: Array[Vehicle] = []
	var h := v.type.spec.half_extents
	var other := VehicleCatalog.variant(variant).type.spec.half_extents
	for s: float in [-1.0, 1.0]:
		var n := Vehicle.create(variant, StringName("crowd_%s_%d" % [variant, int(s)]))
		main.world.add_child(n)
		var off := v.global_basis.x * s * (h.x + other.x + 0.12)
		n.place(v.ground_point(Vector2.ZERO) + off, v.yaw())
		out.append(n)
	await wait_physics_frames(30)
	return out


## Board `v` the game's way (stand at its entry, ACTION), then watch standing and riding off.
func _board_and_watch(main: Main, v: Vehicle, label: String) -> void:
	var d := main.play_wiring.driving
	d.last_crash = null
	d.last_hit = null
	d.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), v.yaw())
	await wait_frames(3)
	assert_true(d.enter(v), "%s: getting on" % label)
	var seated := await wait_until(func() -> bool: return d.mode() == &"driving" or d.mode() == &"thrown", 60 * 10)
	assert_true(seated and d.mode() == &"driving", "%s: seated (%s)" % [label, d.mode()])
	await _watch(main, v, "%s standing" % label, WATCH, false)
	await _ride_off(main, v, label)
	d.brake = true
	await wait_until(func() -> bool: return absf(v.forward_speed()) < 0.5, 60 * 6)
	d.brake = false
	if d.exit():
		await wait_until(func() -> bool: return d.mode() == &"foot" and d.boarding == null, 60 * 8)


func test_boarding_parked_vehicles_in_a_crowded_street_never_throws() -> bool:
	var main := await _play()
	if main == null:
		return true
	var p := main.play_wiring
	for spot: StringName in [&"bike-start", &"auto-0", &"car-start"]:
		var v := p.parked.at_spot(spot)
		if not assert_true(v != null, "%s is parked (%s)" % [spot, p.parked.stats]):
			continue
		var crowd := await _crowd_round(main, v, &"motorbike")
		await _board_and_watch(main, v, String(spot))
		for n in crowd:
			n.queue_free()
		await wait_physics_frames(2)
	_restore()
	return true


## The traffic agent of `group` nearest the player going faster than 3 m/s, or null.
func _moving(main: Main, group: StringName) -> AgentSystem.Agent:
	var traffic := main.life.population.traffic
	var best: AgentSystem.Agent = null
	var best_d := INF
	for a in traffic.agents:
		var k := traffic.kinds[a.kind]
		var d := a.pos.distance_to(main.life.focus_world())
		if a.active and k.group == group and a.speed > 3.0 and d < best_d:
			best = a
			best_d = d
	return best


## TAKE OVER a moving traffic vehicle of `group` the way the button does; the Vehicle or null.
func _take_over(main: Main, group: StringName) -> Vehicle:
	var ctx := main.rig.controls.action_context
	var traffic := main.life.population.traffic
	if not await wait_until(func() -> bool: return _moving(main, group) != null, 60 * 60):
		print("    no moving %s came near" % group)
		return null
	var id := _moving(main, group).id
	var follow := func(stop: Callable) -> bool:
		var a := traffic.agents[id]
		var k := traffic.kinds[a.kind]
		# Close beside it, as on the phone (the owner's screenshot: right at the rider's knee).
		main.rig.body.global_position = WorldOrigin.to_scene(a.pos + Vector2(cos(a.heading), -sin(a.heading)) * (k.half_width + 0.5), a.y + 0.1)
		return bool(stop.call())
	if not await wait_until(func() -> bool: return follow.call(func() -> bool: return ctx.label() == "TAKE OVER"), 60 * 8):
		print("    TAKE OVER was not offered beside the %s" % group)
		return null
	ctx.trigger()
	await wait_until(func() -> bool: return follow.call(func() -> bool: return main.carjacking.vehicle != null), 60 * 2)
	return main.carjacking.vehicle


func test_taking_over_traffic_in_a_crowded_street_never_throws() -> bool:
	var main := await _play()
	if main == null:
		return true
	var d := main.play_wiring.driving
	var taken := 0
	for group: StringName in [&"bike", &"auto", &"car", &"bike"]:
		d.last_crash = null
		d.last_hit = null
		var v := await _take_over(main, group)
		if v == null:
			continue
		taken += 1
		var seated := await wait_until(func() -> bool: return d.mode() == &"driving" or d.mode() == &"thrown", 60 * 15)
		assert_true(seated and d.mode() == &"driving", "%s: seated (%s)" % [group, d.mode()])
		await _watch(main, v, "taken %s standing" % group, WATCH, false)
		await _ride_off(main, v, "taken %s" % group)
		d.brake = true
		await wait_until(func() -> bool: return absf(v.forward_speed()) < 0.5, 60 * 6)
		d.brake = false
		if d.exit():
			await wait_until(func() -> bool: return d.mode() == &"foot" and d.boarding == null, 60 * 8)
	assert_true(taken >= 3, "took over at least three traffic vehicles (%d)" % taken)
	assert_eq(int(main.life.stats.get("off_step_changes", 0)), 0, "no agent changed while the AI step may run (G-364)")
	_restore()
	return true
