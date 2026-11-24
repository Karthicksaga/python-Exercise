extends TestCase
## Handling against the Three.js game (G-71): every Three.js vehicle kind is measured on a flat
## plane exactly as `tools/reference/threejs_handling.mts` measured the Rapier vehicles
## (`tests/data/threejs_handling.json`) and must match within 10 %: speed curve, top speed, time
## to half and 90 % of top speed, braking, coasting, reversing. Then the feel rules of the
## Three.js tests: drift on full lock at speed, grip again within a second; no drift when slow;
## two-wheelers never slide; wheels stay on the ground. One measurement (about 22 s of game
## time, all vehicles at once) serves every test in the file.

const REFERENCE := "res://tests/data/threejs_handling.json"
const LEGACY: Array[StringName] = [&"car", &"auto", &"bike", &"ambulance", &"bus"]
const PREMIUM: Array[StringName] = [&"saloon", &"suv", &"coupe", &"race"]
const TOLERANCE := 0.10

static var _measured: Dictionary = {}


func before_each() -> void:
	if _measured.is_empty():
		var kinds: Array[StringName] = []
		kinds.append_array(LEGACY)
		kinds.append_array(PREMIUM)
		_measured = await HandlingMeasure.measure_all(tree, root, kinds)


func _reference() -> Dictionary:
	var data: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(REFERENCE))
	return data["vehicles"]


func _within(actual: float, expected: float, share: float, label: String) -> void:
	check(absf(actual - expected) <= absf(expected) * share, "%s: Three.js %.3f, Godot %.3f (%+.1f %%, limit %d %%)" % [label, expected, actual, (actual - expected) / expected * 100.0, roundi(share * 100.0)])


func test_speed_curves_match_threejs() -> bool:
	var ref := _reference()
	for kind in LEGACY:
		var g: Dictionary = _measured[kind]
		var r: Dictionary = ref[String(kind)]
		var gs: Dictionary = g["speedAt"]
		var rs: Dictionary = r["speedAt"]
		for t: String in ["2", "3", "4", "6", "8", "10"]:
			_within(float(gs[t]), float(rs[t]), TOLERANCE, "%s speed at %s s" % [kind, t])
		# The first second: the Rapier reference vehicles wake from sleep with a suspension bounce
		# (largest on the light motorbike), so this point gets 15 % (docs/driving.md).
		_within(float(gs["1"]), float(rs["1"]), 0.15, "%s speed at 1 s" % kind)
		_within(float(g["t50"]), float(r["t50"]), TOLERANCE, "%s time to half top speed" % kind)
		_within(float(g["t90"]), float(r["t90"]), TOLERANCE, "%s time to 90 %% of top speed" % kind)
		_within(float(g["topSpeed"]), float(r["topSpeed"]), TOLERANCE, "%s top speed" % kind)
		_within(float(g["distance3s"]), float(r["distance3s"]), TOLERANCE, "%s distance in 3 s" % kind)
		check(float(g["topSpeed"]) <= VehicleCatalog.type(kind).spec.max_speed + 0.5, "%s respects its top speed" % kind)
	return true


func test_braking_coasting_reversing_match_threejs() -> bool:
	var ref := _reference()
	for kind in LEGACY:
		var g: Dictionary = _measured[kind]
		var r: Dictionary = ref[String(kind)]
		var gb: Dictionary = g["brake"]
		var rb: Dictionary = r["brake"]
		_within(float(gb["distance"]), float(rb["distance"]), TOLERANCE, "%s braking distance from 80 %%" % kind)
		_within(float(gb["time"]), float(rb["time"]), TOLERANCE, "%s braking time" % kind)
		_within(float((g["coast3s"] as Dictionary)["to"]), float((r["coast3s"] as Dictionary)["to"]), TOLERANCE, "%s speed after coasting 3 s" % kind)
		_within(float(g["reverse5s"]), float(r["reverse5s"]), TOLERANCE, "%s reverse after 5 s" % kind)
		check(float(gb["jolt"]) < Vehicle.IMPACT, "%s braking hard is not a crash" % kind)
		check(float(g["joltDriving"]) < Vehicle.IMPACT, "%s accelerating is not a crash" % kind)
	return true


func test_cornering_from_rest() -> bool:
	var ref := _reference()
	# Four-wheelers match closely; the single-front-wheel bike and auto turn about 15 % less here
	# (docs/driving.md, "Known differences"), so they get 20 %.
	for kind in LEGACY:
		var share := 0.2 if kind in [&"bike", &"auto"] else TOLERANCE
		_within(float((_measured[kind]["turn"] as Dictionary)["yaw"]), float((ref[String(kind)]["turn"] as Dictionary)["yaw"]), share, "%s heading after 2.5 s full right" % kind)
		check(float((_measured[kind]["turn"] as Dictionary)["yaw"]) < -0.4, "%s: steering right turns clockwise" % kind)
	return true


func test_drift_on_full_lock_at_speed_then_grip() -> bool:
	for kind: StringName in [&"car", &"ambulance"]:
		var lock: Dictionary = _measured[kind]["fastLock"]
		check(float(lock["drifting"]) > 0.3, "%s drifts at 90 %% on full lock (%.2f)" % [kind, float(lock["drifting"])])
		check(float(lock["slip"]) < 0.62, "%s: no spin, slide under 35 degrees (%.2f rad)" % [kind, float(lock["slip"])])
		check(float(lock["regripTime"]) < 1.0, "%s grips again within a second of the stick released (%.2f s)" % [kind, float(lock["regripTime"])])
		check(float(lock["jolt"]) < Vehicle.IMPACT, "%s: a drift is not a crash" % kind)
	return true


func test_no_drift_when_slow_and_two_wheelers_never_slide() -> bool:
	var kinds: Array[StringName] = []
	kinds.append_array(LEGACY)
	kinds.append_array(PREMIUM)
	for kind in kinds:
		if kind == &"bike":
			continue
		check(float((_measured[kind]["slowLock"] as Dictionary)["drifting"]) < 0.15, "%s: no drift at 40 %% on full lock" % kind)
		check(float((_measured[kind]["turn"] as Dictionary)["drifting"]) < 0.15, "%s: no drift pulling away on full lock" % kind)
	var bike: Dictionary = _measured[&"bike"]["fastLock"]
	check(float(bike["slip"]) < 0.25, "the motorbike holds its line at speed (slip %.2f)" % float(bike["slip"]))
	check(float(bike["drifting"]) < 0.3, "the motorbike does not drift (%.2f)" % float(bike["drifting"]))
	check(float((_measured[&"bike"]["slowLock"] as Dictionary)["slip"]) < 0.25, "the motorbike holds its line slowly")
	return true


func test_wheels_on_the_ground_and_ride_height() -> bool:
	var ref := _reference()
	var kinds: Array[StringName] = []
	kinds.append_array(LEGACY)
	kinds.append_array(PREMIUM)
	for kind in kinds:
		var t := VehicleCatalog.type(kind)
		check(bool(_measured[kind]["wheelsOnGround"]), "%s: every wheel on the ground while accelerating" % kind)
		# Every vehicle settles where its own wheel and spring geometry puts it (the model's
		# ground, `VehicleModel.settled_ground`), so the drawn wheels touch the road.
		assert_near(float(_measured[kind]["restY"]), -VehicleModel.settled_ground(t.spec), 0.03, "%s settles at its model's ride height" % kind)
		# Kinds still on the Three.js models also settle where the Three.js game put them. The
		# redesigned Tamil Nadu models (hatchback, auto, ambulance, bus) have their own wheels.
		var m := VehicleCatalog.manifest_for(t)
		if kind in LEGACY and m != null and m.dir.ends_with("/legacy"):
			assert_near(float(_measured[kind]["restY"]), float(ref[String(kind)]["restY"]), 0.03, "%s settles at the Three.js ride height" % kind)
	return true


func test_premium_and_race_cars_are_faster() -> bool:
	var car: Dictionary = _measured[&"car"]
	for kind in PREMIUM:
		var g: Dictionary = _measured[kind]
		var top := VehicleCatalog.type(kind).spec.max_speed
		check(float(g["topSpeed"]) >= top * 0.93, "%s reaches its top speed (%.1f of %.1f)" % [kind, float(g["topSpeed"]), top])
		check(float((g["speedAt"] as Dictionary)["4"]) > float((car["speedAt"] as Dictionary)["4"]), "%s out-accelerates the hatchback" % kind)
		check(float((g["slowLock"] as Dictionary)["slip"]) < float((car["slowLock"] as Dictionary)["slip"]) * 2.5, "%s grips in slow corners" % kind)
		check(float(g["joltDriving"]) < Vehicle.IMPACT, "%s: driving is never mistaken for a crash" % kind)
	var race: Dictionary = _measured[&"race"]
	check(float(race["topSpeed"]) > 55.0, "the race car tops 200 km/h")
	return true
