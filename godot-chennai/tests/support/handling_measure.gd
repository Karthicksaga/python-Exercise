class_name HandlingMeasure
extends RefCounted
## The handling measurements of `tools/reference/threejs_handling.mts`, on Godot (G-71). Every
## scenario of every kind runs at once, each vehicle in its own lane of one big plane, so the
## whole set takes about 22 s of game time instead of minutes.

var tree: SceneTree
var parent: Node
var results: Dictionary = {}
var _running := 0
var _lane := 1


## Measures `kinds` (all scenarios), returning {kind: {metric: value}} like the reference JSON.
static func measure_all(test_tree: SceneTree, test_parent: Node, kinds: Array[StringName]) -> Dictionary:
	var m := HandlingMeasure.new()
	m.tree = test_tree
	m.parent = test_parent
	HandlingRig.ground(test_parent, 2000.0)
	for kind in kinds:
		m.results[kind] = {"maxSpeed": VehicleCatalog.type(kind).spec.max_speed}
		for scenario: StringName in [&"_accelerate", &"_brake", &"_coast", &"_reverse", &"_turn", &"_fast_lock", &"_slow_lock"]:
			m._start(scenario, kind)
	while m._running > 0:
		await test_tree.physics_frame
	return m.results


func _start(scenario: StringName, kind: StringName) -> void:
	_running += 1
	var lane := _lane
	_lane += 1
	_run.call(scenario, kind, lane)


func _run(scenario: StringName, kind: StringName, lane: int) -> void:
	var rig: HandlingRig = await HandlingRig.create(tree, parent, kind, 2.0 if scenario == &"_accelerate" else 1.0, lane)
	var r: Dictionary = results[kind]
	await call(scenario, rig, r)
	rig.holder.queue_free()
	_running -= 1


func _accelerate(a: HandlingRig, r: Dictionary) -> void:
	var spec := a.car.spec
	r["restY"] = a.car.global_position.y
	var z0 := a.car.global_position.z
	var t50 := -1.0
	var t90 := -1.0
	var speed_at := {}
	var all_wheels := true
	for i in range(1, 10 * 60 + 1):
		await a.step(1, 0, 0)
		var s := a.car.forward_speed()
		for w in spec.wheels.size():
			all_wheels = all_wheels and a.car.wheel_in_contact(w)
		if t50 < 0.0 and s >= spec.max_speed * 0.5:
			t50 = i / 60.0
		if t90 < 0.0 and s >= spec.max_speed * 0.9:
			t90 = i / 60.0
		if i in [60, 120, 180, 240, 360, 480, 600]:
			speed_at[str(i / 60)] = s
		if i == 180:
			r["distance3s"] = z0 - a.car.global_position.z
	r["speedAt"] = speed_at
	r["topSpeed"] = a.car.forward_speed()
	r["t50"] = t50
	r["t90"] = t90
	r["joltDriving"] = a.peak_jolt
	r["wheelsOnGround"] = all_wheels


func _brake(b: HandlingRig, r: Dictionary) -> void:
	await b.run_up(b.car.spec.max_speed * 0.8)
	var from := b.car.forward_speed()
	var bz := b.car.global_position.z
	var bt := 0.0
	while b.car.forward_speed() > 0.3 and bt < 30.0:
		await b.step(0, 0, 1)
		bt += HandlingRig.DT
	r["brake"] = {"from": from, "time": bt, "distance": bz - b.car.global_position.z, "jolt": b.peak_jolt}


func _coast(c: HandlingRig, r: Dictionary) -> void:
	await c.run_up(c.car.spec.max_speed * 0.8)
	var cf := c.car.forward_speed()
	await c.run(0, 0, 0, 3)
	r["coast3s"] = {"from": cf, "to": c.car.forward_speed()}


func _reverse(d: HandlingRig, r: Dictionary) -> void:
	await d.run(-1, 0, 0, 5)
	r["reverse5s"] = d.car.forward_speed()


func _turn(e: HandlingRig, r: Dictionary) -> void:
	var y0 := e.turned
	var x0 := e.car.global_position.x
	await e.run(0.7, 1, 0, 2.5)
	r["turn"] = {"yaw": e.turned - y0, "speed": e.car.forward_speed(), "x": e.car.global_position.x - x0, "drifting": e.peak_drifting}


func _fast_lock(f: HandlingRig, r: Dictionary) -> void:
	await f.run_up(f.car.spec.max_speed * 0.9)
	var fy := f.turned
	await f.run(1, 1, 0, 1.1)
	var lock := {"yaw": f.turned - fy, "slip": f.peak_slip, "drifting": f.peak_drifting, "speed": f.car.forward_speed(), "jolt": f.peak_jolt}
	var rt := 0.0
	while f.car.drifting() >= 0.1 and rt < 5.0:
		await f.step(1, 0, 0)
		rt += HandlingRig.DT
	lock["regripTime"] = rt
	r["fastLock"] = lock


func _slow_lock(g: HandlingRig, r: Dictionary) -> void:
	await g.run_up(g.car.spec.max_speed * 0.4)
	await g.run(0.5, 1, 0, 2)
	r["slowLock"] = {"drifting": g.peak_drifting, "slip": g.peak_slip}
