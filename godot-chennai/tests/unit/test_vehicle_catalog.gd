extends TestCase
## The vehicle data (G-72, G-73): every kind and variant reads, the Three.js vehicles keep the
## Three.js numbers, the premium cars are faster and grippier, and every model manifest points
## at a real GLB with the wheel and door nodes it names.


func test_every_kind_and_variant_reads() -> bool:
	var kinds := VehicleCatalog.kinds()
	for k: StringName in [&"car", &"auto", &"bike", &"ambulance", &"bus", &"saloon", &"suv", &"coupe", &"race"]:
		check(kinds.has(k), "kind %s" % k)
	for v: StringName in [&"hatchback", &"taxi", &"police", &"gang", &"auto", &"motorbike", &"ambulance", &"bus", &"saloon", &"suv", &"coupe", &"race_car"]:
		var info := VehicleCatalog.variant(v)
		check(info != null and info.type != null, "variant %s" % v)
	assert_true(VehicleCatalog.variant(&"police").siren, "the police car has a siren")
	assert_true(VehicleCatalog.variant(&"ambulance").siren, "the ambulance has a siren")
	assert_false(VehicleCatalog.variant(&"taxi").siren, "the taxi has none")
	return true


func test_threejs_numbers_kept() -> bool:
	var car := VehicleCatalog.type(&"car")
	assert_eq(car.spec.mass, 950.0, "car mass")
	assert_eq(car.spec.engine_force, 5600.0, "car engine")
	assert_eq(car.spec.max_speed, 23.0, "car top speed")
	assert_eq(car.spec.drift, 0.55, "car drift")
	assert_eq(car.spec.wheels.size(), 4, "car wheels")
	assert_eq(car.entry.side, 1, "right-hand drive: in on the right")
	var bike := VehicleCatalog.type(&"bike")
	assert_eq(bike.spec.drift, 0.0, "a two-wheeler never drifts")
	assert_true(bike.leans, "the bike leans")
	assert_eq(VehicleCatalog.type(&"auto").spec.wheels.size(), 3, "three-wheeler")
	assert_eq(VehicleCatalog.type(&"bus").entry.aisle.size(), 2, "the bus aisle")
	assert_eq(VehicleCatalog.type(&"bus").crash.throw_from, -1.0, "never thrown from the bus")
	return true


func test_premium_and_race_profiles() -> bool:
	var car := VehicleCatalog.type(&"car").spec
	for k: StringName in [&"saloon", &"suv", &"coupe", &"race"]:
		var t := VehicleCatalog.type(k)
		check(t.premium, "%s is premium" % k)
		check(t.spec.max_speed > car.max_speed, "%s faster than the hatchback" % k)
		check(t.spec.grip > 1.0, "%s grippier" % k)
	assert_true(VehicleCatalog.type(&"race").spec.max_speed > VehicleCatalog.type(&"coupe").spec.max_speed, "race car fastest")
	return true


func test_manifests_name_real_nodes() -> bool:
	# Every model a kind or variant draws: its GLB loads and has the wheel and door nodes.
	var models: Array[VehicleManifest] = []
	for k in VehicleCatalog.kinds():
		models.append(VehicleCatalog.manifest_for(VehicleCatalog.type(k)))
	for v in VehicleCatalog.variant_ids():
		models.append(VehicleCatalog.manifest_for(VehicleCatalog.variant(v).type))
	for id: String in ["hatchback", "motorbike", "auto_rickshaw", "bus", "ambulance"]:
		models.append(VehicleManifest.read("res://assets/vehicles/legacy/%s.json" % id))
	for m in models:
		if not check(m != null, "a manifest for every vehicle"):
			continue
		var lods := m.lods()
		check(lods.size() >= 2 and float(lods[0]["max"]) > 0.0, "%s has LODs with distances" % m.id)
		var path := String(lods[0]["file"])
		if not check(ResourceLoader.exists(path), "%s exists" % path):
			continue
		var scene := (load(path) as PackedScene).instantiate()
		var names: Array[String] = []
		for w in m.wheels():
			names.append(String(w["node"]))
		for d in m.doors():
			names.append(String(d["node"]))
		for n in names:
			check(scene.find_child(n, true, false) != null, "%s has node %s" % [m.id, n])
		scene.free()
	return true


func _leaves(m: VehicleManifest) -> Array[int]:
	var out: Array[int] = []
	for d in m.doors():
		out.append(int(d["leaf"]))
	return out


func _first_door(m: VehicleManifest) -> String:
	return String(m.doors()[0]["node"])


func test_door_leaves() -> bool:
	# Leaf 0 is the driver's door; double rear doors and the folding leaves of one doorway swing
	# together. The Three.js models (legacy/) and the redesigned Tamil Nadu ones (23 Nov 2026:
	# the ambulance is now an Indian van with a left cab door too, the bus has a rear door).
	var legacy_amb := VehicleManifest.read("res://assets/vehicles/legacy/ambulance.json")
	assert_eq(_leaves(legacy_amb), [0, 1, 1] as Array[int], "Three.js ambulance: cab door, rear pair")
	assert_eq(_leaves(VehicleManifest.read("res://assets/vehicles/legacy/bus.json")), [0, 0] as Array[int], "Three.js bus: folding leaves are one door")
	assert_eq(_leaves(VehicleManifest.read("res://assets/vehicles/legacy/hatchback.json")), [0, 1, 2] as Array[int], "Three.js hatchback: driver and two rear doors")
	var amb := VehicleCatalog.manifest("ambulance")
	assert_eq(_first_door(amb), "door_cab", "ambulance: the driver's (right) cab door first")
	assert_eq(_leaves(amb), [0, 1, 2, 2] as Array[int], "ambulance: cab, left cab, rear pair")
	var car := VehicleCatalog.manifest("hatchback")
	assert_eq(_first_door(car), "door_fr", "hatchback: the driver's door (right front) first")
	assert_eq(_leaves(car), [0, 1, 2, 3] as Array[int], "hatchback: four doors")
	var bus := VehicleCatalog.manifest("bus_city")
	assert_eq(_leaves(bus), [0, 0, 1, 1] as Array[int], "city bus: front and rear folding doors")
	assert_eq(_leaves(VehicleCatalog.manifest("auto_rickshaw")), [] as Array[int], "auto: no doors")
	return true


func test_geometry_comes_from_each_model() -> bool:
	# The kind's seat, entry and wheels are the model's own anchors in the chassis frame (model y
	# minus the ride height), whichever model it is.
	for k: StringName in [&"car", &"auto", &"bike", &"ambulance", &"bus", &"saloon", &"race"]:
		var t := VehicleCatalog.type(k)
		var m := VehicleCatalog.manifest_for(t)
		if not check(m != null and m.id == t.model or m.id == t.fallback_model, "%s draws its model" % k):
			continue
		var hip := Vector3.ZERO
		for seat: Dictionary in m.data["seats"]:
			if String(seat["role"]) == "driver":
				var a: Array = seat["hip"]
				hip = Vector3(float(a[0]), float(a[1]), float(a[2])) - Vector3(0, m.chassis_height(), 0)
		assert_vec_near(Vector2(t.driver.x, t.driver.y), Vector2(hip.x, hip.y), 0.001, "%s driver hip in the chassis frame" % k)
		var e: Array = (m.data["entry"] as Dictionary)["point"]
		assert_vec_near(t.entry.point, Vector2(float(e[0]), float(e[e.size() - 1])), 0.001, "%s entry point" % k)
		check(t.spec.wheels.size() == m.wheels().size(), "%s wheels from the model" % k)
	# The Three.js data still reads the same through the legacy manifest.
	var old := VehicleType.new()
	old.spec = VehicleSpec.new()
	VehicleManifest.read("res://assets/vehicles/legacy/hatchback.json").apply_geometry(old)
	assert_vec_near(Vector2(old.driver.x, old.driver.y), Vector2(0.36, -0.03), 0.001, "Three.js hatchback driver hip")
	assert_vec_near(old.entry.point, Vector2(1.25, 0.35), 0.001, "Three.js hatchback entry point")
	# Passenger doors come from the model's seats: the redesigned ambulance's attendant uses a rear door.
	var amb := VehicleCatalog.type(&"ambulance")
	var rear := amb.passengers.filter(func(p: VehicleType.PassengerDoor) -> bool: return p.leaf == 2)
	check(not rear.is_empty(), "ambulance: a passenger at the rear doors")
	assert_eq(VehicleCatalog.type(&"bus").entry.aisle.size(), 2, "bus aisle from the model")
	assert_eq(String(VehicleCatalog.variant(&"taxi").type.model), "taxi", "the taxi draws its own model")
	# The premium cars use their own models (not the stand-ins).
	for k: StringName in [&"saloon", &"suv", &"coupe", &"race"]:
		var m := VehicleCatalog.manifest_for(VehicleCatalog.type(k))
		if check(m != null, "%s has a model to show" % k):
			check(m.id == VehicleCatalog.type(k).model, "%s uses its own model (%s)" % [k, m.id])
	return true
