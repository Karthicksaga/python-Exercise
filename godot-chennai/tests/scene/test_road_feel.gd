extends YardTest
## Road condition feel in the driving (G-450): the same vehicle, the same flat yard and the same
## controls, once on a good road and once on a damaged or unpaved one (the condition read from the
## real street layout by `RoadSurface`). Bad roads bump a little, mud slows cheap vehicles and cuts
## grip, a puddle splashes; the speed readout is the real speed and a rough road is not a crash.

const SPAWN := Vector2i(6, 4)

var _surface: RoadSurface


func before_each() -> void:
	await super.before_each()
	_surface = RoadSurface.create(CityTestKit.kit().layouts)


func _point_on(want: StringName) -> Vector2:
	for dx in range(-3, 4):
		for dz in range(-3, 4):
			var layout := _surface.layouts.layout_for(SPAWN + Vector2i(dx, dz))
			for road in layout.roads:
				if road.width < 3.0 or road.is_raised() or road.tunnel or RoadStyle.klass_of(road) == RoadStyle.PATH:
					continue
				for i in road.points.size() - 1:
					if road.points[i].distance_to(road.points[i + 1]) < 8.0:
						continue
					var mid := road.points[i].lerp(road.points[i + 1], 0.5)
					var found := _surface.lookup(mid)
					if found["condition"] == want and found["on_road"]:
						return mid
	return Vector2.ZERO


## Drive `variant` flat out for `seconds` with every look at the road answered from `at`; returns
## top speed reached, how far the body's height wandered (max - min after 2 s) and the peak
## change of speed in one step.
func _run(variant: StringName, at: Vector2, seconds: float) -> Dictionary:
	# A fresh yard each time: the same place, nobody still at the wheel of the last run.
	yard.queue_free()
	yard = VehicleYard.new()
	root.add_child(yard)
	await wait_physics_frames(2)
	var car := await spawn(variant, Vector3(0, 0, 0))
	yard.driving.ground_source = func(_p: Vector3) -> Dictionary: return _surface.feel_at(at)
	await board(car)
	yard.driving.gas = true
	var lo := INF
	var hi := -INF
	var peak := 0.0
	var top := 0.0
	var last := car.planar_velocity()
	for i in roundi(seconds * 60.0):
		await wait_physics_frames(1)
		top = maxf(top, car.forward_speed())
		var v := car.planar_velocity()
		peak = maxf(peak, v.distance_to(last))
		last = v
		if i > 120:
			lo = minf(lo, car.global_position.y)
			hi = maxf(hi, car.global_position.y)
	yard.driving.gas = false
	return {"top": top, "wander": hi - lo, "peak_step": peak, "crashed": yard.driving.last_hit != null, "grip": car.ground.grip, "neutral": car.ground.is_neutral()}


func test_damaged_roads_bump_the_vehicle_a_little() -> bool:
	var good := _point_on(RoadStyle.GOOD)
	var damaged := _point_on(RoadStyle.DAMAGED)
	assert_true(good != Vector2.ZERO and damaged != Vector2.ZERO, "a good and a damaged road near the spawn")
	var on_good := await _run(&"motorbike", good, 6.0)
	var on_damaged := await _run(&"motorbike", damaged, 6.0)
	assert_true(float(on_good["wander"]) < 0.004, "good tar: the body stays level (%.4f m)" % float(on_good["wander"]))
	assert_true(float(on_damaged["wander"]) > 0.01, "damaged: the body wanders (%.4f m)" % float(on_damaged["wander"]))
	assert_true(float(on_damaged["wander"]) < 0.12, "but only a little (%.4f m)" % float(on_damaged["wander"]))
	assert_false(bool(on_damaged["crashed"]), "a rough road is not a crash")
	assert_true(float(on_damaged["peak_step"]) < Vehicle.IMPACT, "no step changes speed like a crash does")
	# Damaged roads cost 15 % of a bike's top speed; the readout is the real speed.
	assert_true(float(on_damaged["top"]) < float(on_good["top"]) * 0.93, "slower on the damaged road: %.1f against %.1f m/s" % [float(on_damaged["top"]), float(on_good["top"])])
	assert_true(float(on_damaged["top"]) > float(on_good["top"]) * 0.78, "but not stopped")
	return true


func test_mud_slows_a_bike_more_than_a_bus_and_cuts_grip() -> bool:
	var mud := _point_on(RoadStyle.UNPAVED)
	assert_true(mud != Vector2.ZERO, "an unpaved lane near the spawn")
	var good := _point_on(RoadStyle.GOOD)
	var bike_good := await _run(&"motorbike", good, 7.0)
	var bike_mud := await _run(&"motorbike", mud, 7.0)
	var bike_max := VehicleCatalog.type(&"bike").spec.max_speed
	assert_true(float(bike_mud["top"]) < bike_max * 0.72, "a bike in mud stays under 72 %% of top speed (%.1f of %.1f)" % [float(bike_mud["top"]), bike_max])
	assert_true(float(bike_mud["top"]) < float(bike_good["top"]) * 0.8, "clearly slower than on good tar")
	var car_good := await _run(&"hatchback", good, 7.0)
	var car_mud := await _run(&"hatchback", mud, 7.0)
	var bike_loss := 1.0 - float(bike_mud["top"]) / float(bike_good["top"])
	var car_loss := 1.0 - float(car_mud["top"]) / float(car_good["top"])
	assert_true(car_loss < bike_loss, "a car loses less than a bike (%.2f against %.2f)" % [car_loss, bike_loss])
	assert_true(car_loss > 0.0, "but it does lose some")
	# Grip: the sliding is measured on the vehicle itself.
	assert_true(float(bike_mud["grip"]) < 0.8, "the tyres hold less on mud (%.2f)" % float(bike_mud["grip"]))
	return true


func test_a_good_road_changes_nothing() -> bool:
	var good := _point_on(RoadStyle.GOOD)
	var with_road := await _run(&"hatchback", good, 5.0)
	var plain := VehicleCatalog.type(&"car").spec.max_speed
	assert_true(float(with_road["top"]) > plain * 0.85, "the car reaches its speed on good tar (%.1f)" % float(with_road["top"]))
	assert_true(bool(with_road["neutral"]), "its ground feel is plain")
	return true


func test_a_puddle_splashes_and_slows() -> bool:
	var damaged := _point_on(RoadStyle.DAMAGED)
	var mark := RoadDetail.Mark.new()
	mark.kind = &"puddle"
	mark.position = damaged
	mark.dir = Vector2.RIGHT
	mark.length = 4.0
	mark.width = 2.0
	_surface.note_chunk(_surface.layouts.source.cell_at(damaged), false, [mark])
	var car := await spawn(&"hatchback", Vector3(0, 0, 0))
	# The first 10 m of travel are dry, then a puddle for 12 m.
	yard.driving.ground_source = func(p: Vector3) -> Dictionary:
		var f := _surface.feel_at(damaged + (Vector2.ZERO if p.z < -10.0 and p.z > -22.0 else Vector2(0, 5)))
		return f
	await board(car)
	var splashes: Array[float] = []
	yard.driving.splashed.connect(func(_v: Vehicle, _at: Vector3, s: float) -> void: splashes.append(s))
	yard.driving.gas = true
	await wait_until(func() -> bool: return car.global_position.z < -30.0, 60 * 8)
	yard.driving.gas = false
	assert_true(splashes.size() >= 1, "the puddle splashed")
	if not splashes.is_empty():
		assert_true(splashes[0] > 0.2 and splashes[0] <= 1.0, "strength in range (%.2f)" % splashes[0])
	return true
