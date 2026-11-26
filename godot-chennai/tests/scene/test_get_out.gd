extends TestCase
## GET OUT (G-494): the owner found no way out of a car or bike (the old round X top-right). The
## driving HUD now shows a labelled glass pill whenever the player drives or rides, a parked
## vehicle or one taken over from traffic; a finger tap on it (through the engine's touch path at
## the phone's stretch, as in `test_menu_touch.gd`) puts the player on foot beside the vehicle.
## Tapped while moving, it brakes for the player and gets out once slow enough.

const MAIN := preload("res://src/app/main.tscn")
const LOAD_FRAMES := 60 * 180
const PHONE := Vector2i(2460, 1080)

var _old_size: Vector2i


func before_each() -> void:
	_old_size = tree.root.size


func _restore() -> void:
	tree.root.size = _old_size
	tree.paused = false
	Sound.suspend()


func _play() -> Main:
	tree.root.size = PHONE
	var main: Main = MAIN.instantiate()
	root.add_child(main)
	var loaded := await wait_until(func() -> bool: return main.state in [&"title", &"failed"], LOAD_FRAMES)
	if not assert_true(loaded and main.state == &"title", "the game loaded (state %s)" % main.state):
		return null
	main.play()
	await wait_physics_frames(2)
	return main


func _send(e: InputEvent) -> void:
	Input.parse_input_event(e)
	Input.flush_buffered_events()


## A finger tap on `c` (window pixels through the stretch, a few pixels of roll).
func _tap(c: Control) -> void:
	var at := c.get_global_rect().get_center()
	var xf := tree.root.get_final_transform()
	for step: int in 3:
		if step == 1:
			var drag := InputEventScreenDrag.new()
			drag.position = xf * (at + Vector2(4, -3))
			drag.relative = xf.basis_xform(Vector2(4, -3))
			_send(drag)
		else:
			var t := InputEventScreenTouch.new()
			t.position = xf * (at + (Vector2(4, -3) if step == 2 else Vector2.ZERO))
			t.pressed = step == 0
			_send(t)
		await wait_frames(1)
	await wait_frames(2)


func _check_button(main: Main, what: String) -> HoldButton:
	var b := main.play_wiring.controls.exit_button
	var screen := Rect2(Vector2.ZERO, tree.root.get_visible_rect().size)
	check(b.is_visible_in_tree(), "%s: GET OUT shows" % what)
	check(b.text == "GET OUT", "%s: it says GET OUT (%s)" % [what, b.text])
	check(screen.encloses(b.get_global_rect()), "%s: inside the screen %s" % [what, b.get_global_rect()])
	check(b.size.x >= UiTheme.MIN_TARGET and b.size.y >= UiTheme.MIN_TARGET, "%s: a 48 target at least" % what)
	var pause := main.pause_menu.pause_button.get_global_rect()
	check(not b.get_global_rect().grow(4.0).intersects(pause.grow(4.0)), "%s: 8 apart from PAUSE" % what)
	return b


func _out_beside(main: Main, v: Vehicle, what: String) -> void:
	var d := main.play_wiring.driving
	var out := await wait_until(func() -> bool: return d.mode() == &"foot" and d.boarding == null, 60 * 10)
	check(out, "%s: on foot again (%s)" % [what, d.mode()])
	var gap := d.rider.position().distance_to(v.global_position)
	check(gap < 3.0, "%s: beside the vehicle (%.2f m)" % [what, gap])
	check(not main.play_wiring.controls.exit_button.is_visible_in_tree(), "%s: GET OUT hides on foot" % what)
	check(main.rig.controls.visible, "%s: the walking controls are back" % what)


func test_get_out_of_a_parked_car_and_bike_with_a_finger() -> bool:
	var main := await _play()
	if main == null:
		_restore()
		return true
	var p := main.play_wiring
	var d := p.driving
	check(not p.controls.exit_button.is_visible_in_tree(), "no GET OUT on foot")
	for spot: StringName in [&"car-start", &"bike-start"]:
		var v := p.parked.at_spot(spot)
		if not check(v != null, "%s is parked" % spot):
			continue
		d.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.6, 0.0)), v.yaw())
		await wait_physics_frames(1)
		check(d.enter(v), "%s: getting in" % spot)
		check(await wait_until(func() -> bool: return d.mode() == &"driving", 60 * 8), "%s: driving" % spot)
		var b := _check_button(main, String(spot))
		await _tap(b)
		await _out_beside(main, v, String(spot))
	_restore()
	return true


func test_get_out_while_moving_stops_first() -> bool:
	var main := await _play()
	if main == null:
		_restore()
		return true
	var p := main.play_wiring
	var d := p.driving
	var car := p.parked.at_spot(&"car-start")
	if not check(car != null, "the start car is parked"):
		_restore()
		return true
	d.rider.place(car.ground_point(car.type.entry.point + Vector2(float(car.type.entry.side) * 0.6, 0.0)), car.yaw())
	await wait_physics_frames(1)
	d.enter(car)
	check(await wait_until(func() -> bool: return d.mode() == &"driving", 60 * 8), "driving")
	d.gas = true
	check(await wait_until(func() -> bool: return absf(car.forward_speed()) > Driving.EXIT_SPEED * 2.0, 60 * 6), "moving (%.1f m/s)" % car.forward_speed())
	d.gas = false
	await _tap(_check_button(main, "moving"))
	var wiring := main.play_wiring.find_child("DrivingWiring", true, false) as DrivingWiring
	check(wiring != null and (wiring.stopping_to_exit or d.mode() != &"driving"), "GET OUT while moving: it stops for the player")
	check(p.controls.toast_label.visible and p.controls.toast_label.text == "Stopping to get out", "and says so (%s)" % p.controls.toast_label.text)
	await _out_beside(main, car, "after stopping")
	check(absf(car.forward_speed()) < Driving.EXIT_SPEED + 0.5, "the car stopped (%.1f m/s)" % car.forward_speed())
	_restore()
	return true


## The nearest moving traffic agent of `group` (read only; the AI is not changed here).
func _moving(main: Main, group: StringName) -> AgentSystem.Agent:
	var traffic := main.life.population.traffic
	var best: AgentSystem.Agent = null
	var best_d := INF
	for a in traffic.agents:
		var k := traffic.kinds[a.kind]
		var gap := a.pos.distance_to(main.life.focus_world())
		if a.active and k.group == group and a.speed > 3.0 and gap < best_d:
			best = a
			best_d = gap
	return best


func test_get_out_after_taking_over_a_bike() -> bool:
	var main := await _play()
	if main == null:
		_restore()
		return true
	var d := main.play_wiring.driving
	var ctx := main.rig.controls.action_context
	var traffic := main.life.population.traffic
	if not check(await wait_until(func() -> bool: return _moving(main, &"bike") != null, 60 * 60), "a bike comes by"):
		_restore()
		return true
	var id := _moving(main, &"bike").id
	var follow := func(stop: Callable) -> bool:
		var a := traffic.agents[id]
		var k := traffic.kinds[a.kind]
		main.rig.body.global_position = WorldOrigin.to_scene(a.pos + Vector2(cos(a.heading), -sin(a.heading)) * (k.half_width + 0.5), a.y + 0.1)
		return bool(stop.call())
	if not check(await wait_until(func() -> bool: return follow.call(func() -> bool: return ctx.label() == "TAKE OVER"), 60 * 8), "TAKE OVER is offered"):
		_restore()
		return true
	ctx.trigger()
	await wait_until(func() -> bool: return follow.call(func() -> bool: return main.carjacking.vehicle != null), 60 * 2)
	var v := main.carjacking.vehicle
	if not check(v != null and await wait_until(func() -> bool: return d.mode() == &"driving" or d.mode() == &"thrown", 60 * 15), "took the bike over and rides it"):
		_restore()
		return true
	if not check(d.mode() == &"driving", "riding the taken bike (%s)" % d.mode()):
		_restore()
		return true
	await _tap(_check_button(main, "taken bike"))
	await _out_beside(main, v, "taken bike")
	_restore()
	return true
