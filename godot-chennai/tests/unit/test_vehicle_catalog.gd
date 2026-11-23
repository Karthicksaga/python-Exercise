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
	for model: String in ["hatchback", "motorbike", "auto_rickshaw", "bus", "ambulance"]:
		var m := VehicleCatalog.manifest(model)
		if not check(m != null, "%s manifest" % model):
			continue
		var lods := m.lods()
		check(lods.size() >= 2 and float(lods[0]["max"]) > 0.0, "%s has LODs with distances" % model)
		var path := VehicleCatalog.MODELS_DIR.path_join(String(lods[0]["file"]))
		if not check(ResourceLoader.exists(path), "%s exists" % path):
			continue
		var scene := (load(path) as PackedScene).instantiate()
		var names: Array[String] = []
		for w in m.wheels():
			names.append(String(w["node"]))
		for d in m.doors():
			names.append(String(d["node"]))
		for n in names:
			check(scene.find_child(n, true, false) != null, "%s has node %s" % [model, n])
		scene.free()
	# Door leaves: the driver's door is 0; the ambulance's rear pair and the bus's folding leaves
	# swing together.
	var amb := VehicleCatalog.manifest("ambulance").doors()
	assert_eq([int(amb[0]["leaf"]), int(amb[1]["leaf"]), int(amb[2]["leaf"])], [0, 1, 1], "ambulance cab door, rear pair")
	var bus := VehicleCatalog.manifest("bus").doors()
	assert_eq([int(bus[0]["leaf"]), int(bus[1]["leaf"])], [0, 0], "bus folding leaves are one door")
	var car := VehicleCatalog.manifest("hatchback").doors()
	assert_eq([int(car[0]["leaf"]), int(car[1]["leaf"]), int(car[2]["leaf"])], [0, 1, 2], "hatchback driver and two rear doors")
	# The manifest geometry of the ported vehicles is the Three.js data (the handling tests rely on it).
	var t := VehicleCatalog.type(&"car")
	assert_vec_near(Vector2(t.driver.x, t.driver.y), Vector2(0.36, -0.03), 0.001, "driver hip in the chassis frame")
	assert_vec_near(t.entry.point, Vector2(1.25, 0.35), 0.001, "entry point")
	assert_eq(VehicleCatalog.type(&"bus").entry.aisle.size(), 2, "bus aisle from the manifest")
	assert_near(VehicleCatalog.type(&"bus").entry.aisle[0].y, -0.35, 0.001, "aisle in the chassis frame")
	# Kinds with no GLB yet fall back to a stand-in model.
	for k: StringName in [&"saloon", &"suv", &"coupe", &"race"]:
		check(VehicleCatalog.manifest_for(VehicleCatalog.type(k)) != null, "%s has a model to show" % k)
	return true
