extends TestCase
## City jobs played through the real player, vehicles and HUD (G-132, G-133): goods handed over
## at a kerb (`goods.spec.ts`), the ambulance's stretcher, the pay and reputation, the bus
## timetable's late fare, and the save file. In game time, on `MissionsGround`.

const SAVE := "user://test-missions-jobs.json"

var g: MissionsGround


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	g = MissionsGround.make(SAVE)
	root.add_child(g)
	await wait_physics_frames(2)


func _session() -> MissionSession:
	return g.layer.session


func _money() -> int:
	return _session().runner.balance()


func _parked(id: String) -> Vehicle:
	var spot := _session().content.parked(id)
	g.put_player(float(spot["x"]) + 5.0, float(spot["z"]))
	await wait_until(func() -> bool: return g.layer.parked.has(id), 120)
	var v: Vehicle = g.layer.parked.get(id)
	await wait_physics_frames(30)
	return v


func _board(v: Vehicle) -> bool:
	g.driving.rider.place(v.ground_point(v.type.entry.point + Vector2(float(v.type.entry.side) * 0.4, 0.0)), 0.0)
	await wait_physics_frames(1)
	check(g.driving.enter(v), "enter %s" % v.id)
	return await wait_until(func() -> bool: return g.driving.mode() == &"driving", 60 * 8)


## The stage names of everyone drawn, joined.
func _stages() -> String:
	return ",".join(g.layer.figures.stages())


func test_courier_parcel_is_handed_over_at_the_kerb_and_the_job_pays() -> bool:
	var s := _session()
	var bike := await _parked("bike-start")
	assert_true(s.take_job("courier", 10.0), "take the courier job")
	assert_true(await _board(bike), "on the bike")
	var job := s.jobs.job()
	assert_eq(job.vehicle, "bike", "a courier rides a motorbike")
	var first: JobData.Stop = s.jobs.stop()
	assert_true(first.goods != null and first.goods.action == "load", "the first stop loads a parcel")
	bike.teleport(Vector3(first.x, bike.global_position.y, first.z), 0.0)
	assert_true(await wait_until(func() -> bool: return g.layer.figures.stages().size() > 0, 60 * 5), "someone comes to hand the parcel over")
	await wait_frames(2)
	assert_true(not s.goods_scene().is_empty(), "the goods scene is asked of the figures")
	assert_eq(g.layer.figures.people[0]["kind"], "sender", "the sender hands it over")
	assert_eq(s.goods_scene()["cargo"], [] as Array[String], "nothing aboard before the hand-over")
	assert_true(await wait_until(func() -> bool: return s.jobs.stop_number() == 1, 60 * 20), "the parcel is taken, the next stop is asked")
	assert_true(s.jobs.job() != null, "the job goes on")
	assert_contains(g.layer.hud.objective_label.text, "Deliver the parcel", "the HUD names the delivery")
	var second: JobData.Stop = s.jobs.stop()
	assert_eq(s.goods_scene()["cargo"], ["parcel"] as Array[String], "the parcel is aboard for the drive")
	bike.teleport(Vector3(second.x, bike.global_position.y, second.z), 0.0)
	var toasts: Array[String] = []
	s.result.connect(func(title: String, _m: String, _b: bool) -> void: toasts.append(title))
	assert_true(await wait_until(func() -> bool: return s.jobs.job() == null, 60 * 25), "the delivery completes the job")
	assert_true(_money() >= 450, "paid the job's ₹450 or more (%d)" % _money())
	assert_eq(toasts.size(), 1, "one result screen")
	assert_true(g.layer.hud.dialog_open() and g.layer.get_tree().paused, "the result holds the game")
	assert_true(g.layer.hud.press("continue"), "CONTINUE")
	# The money and the reputation are in the save file.
	var again := MissionSession.open(SAVE)
	assert_true(again.runner.balance() >= 450, "the pay is saved")
	assert_true(again.jobs.reputation() > JobRunner.START_REPUTATION, "the reputation is saved")
	return true


func test_ambulance_patient_lies_on_a_stretcher_and_the_run_pays() -> bool:
	var s := _session()
	var amb := await _parked("ambulance")
	assert_true(s.take_job("ambulance-run", 10.0), "take the ambulance run")
	assert_true(await _board(amb), "in the ambulance")
	var first: JobData.Stop = s.jobs.stop()
	assert_true(first.fare != null and first.fare.patient, "the first stop has a patient")
	amb.teleport(Vector3(first.x, amb.global_position.y, first.z), 0.0)
	var seen_stretcher := [false]
	var watch := func() -> bool:
		await wait_frames(1)
		var stretcher := g.layer.figures.get_node_or_null("Stretcher") as Node3D
		seen_stretcher[0] = seen_stretcher[0] or (stretcher != null and stretcher.visible)
		return s.jobs.stop_number() == 1
	var loaded := false
	for i in 60 * 30:
		if await watch.call():
			loaded = true
			break
	assert_true(loaded, "the patient is loaded")
	assert_true(seen_stretcher[0], "the stretcher was wheeled to the door")
	assert_eq(s.jobs.aboard(), 1, "the patient is aboard")
	var drop: JobData.Stop = s.jobs.stop()
	amb.teleport(Vector3(drop.x, amb.global_position.y, drop.z), 0.0)
	assert_true(await wait_until(func() -> bool: return s.jobs.job() == null, 60 * 40), "the hospital drop completes the run")
	assert_true(_money() >= 900, "paid ₹900 or more (%d)" % _money())
	assert_true(g.layer.hud.press("continue"), "CONTINUE")
	return true


func test_a_crash_with_a_patient_aboard_counts_as_a_bump() -> bool:
	var s := _session()
	var amb := await _parked("ambulance")
	assert_true(s.take_job("ambulance-run", 10.0), "take the run")
	assert_true(await _board(amb), "in the ambulance")
	var first: JobData.Stop = s.jobs.stop()
	amb.teleport(Vector3(first.x, amb.global_position.y, first.z), 0.0)
	assert_true(await wait_until(func() -> bool: return s.jobs.stop_number() == 1, 60 * 30), "patient aboard")
	var before := s.jobs.bumps()
	g.layer._impact = 1.0
	await wait_physics_frames(2)
	assert_eq(s.jobs.bumps(), before + 1, "one bump")
	return true


func test_everyone_who_boards_or_hands_over_is_an_adult() -> bool:
	# Children are never in a vehicle that can crash with them hurt, never anywhere they can be
	# hurt (AGENTS.md): the fare figures draw cast adults only.
	var manifest := PeopleManifest.open(FareFigures.MANIFEST)
	var ids: Array[String] = []
	for id in FareFigures.RIDERS:
		ids.append(id)
	for id in FareFigures.SENDERS:
		ids.append(id)
	ids.append(FareFigures.PARAMEDIC)
	for id in ids:
		assert_true(manifest.model_path(id) != "", "%s is in the cast" % id)
		assert_eq(manifest.entry(id).get("child", true), false, "%s is not a child" % id)
	return true
