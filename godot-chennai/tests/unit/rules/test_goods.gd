## Ports of `missions/src/goods.test.ts` (9 cases).
extends "res://tests/unit/rules/rules_test.gd"

const G := MissionData.Goods


func _load() -> MissionData.Goods:
	return G.make("load", ["parcel"], 0, 5)


func _drop() -> MissionData.Goods:
	return G.make("unload", ["parcel"], 100, 5)


func run(stop: GoodsStop, seconds: float, ready: bool, x: float = 0.0, z: float = 0.0) -> void:
	var t := 0.0
	while t < seconds - 1e-9:
		stop.step(0.1, ready, x, z)
		t += 0.1


func test_waits_walks_over_hands_in_and_is_done() -> bool:
	var stop := GoodsStop.new(_load(), "bike")
	run(stop, 3, false)
	match_obj(stop.person(), {"stage": "waiting", "holder": "hands"})
	eq(stop.started(), false)
	stop.step(0.1, true, 0, 0)
	near(stop.person()["walk_seconds"], FareStop.walk_time(4), 5)
	eq(stop.person()["stage"], "walking")
	eq(stop.note(), "The parcel being loaded")
	run(stop, FareStop.walk_time(4), true)
	eq(stop.person()["stage"], "handing")
	eq(stop.person()["holder"], "hands")
	run(stop, float(GoodsStop.HAND["bike"]) * GoodsStop.SWAP, true)
	eq(stop.person()["holder"], "vehicle")
	eq(stop.done(), false)
	run(stop, float(GoodsStop.HAND["bike"]) * (1 - GoodsStop.SWAP) + 0.1, true)
	eq(stop.done(), true)
	eq(stop.person()["stage"], "done")
	eq(stop.note(), "")
	return true


func test_walks_back_if_the_vehicle_drives_off_and_finishes_once_there() -> bool:
	var stop := GoodsStop.new(_load(), "car")
	run(stop, 1, true)
	var share: float = stop.person()["share"]
	run(stop, 0.5, false)
	lt(stop.person()["share"], share)
	run(stop, 5, false)
	eq(stop.person()["stage"], "waiting")
	run(stop, FareStop.walk_time(4) + 0.2, true)
	eq(stop.person()["stage"], "handing")
	run(stop, float(GoodsStop.HAND["car"]) + 0.1, false)
	eq(stop.done(), true)
	return true


func test_at_a_drop_the_goods_end_in_the_recipients_hands() -> bool:
	var stop := GoodsStop.new(_drop(), "car")
	eq(stop.person()["holder"], "vehicle")
	run(stop, 30, true, 100, 0)
	eq(stop.done(), true)
	eq(stop.person()["holder"], "hands")
	eq(GoodsStop.new(_drop(), "car").note(), "")
	return true


func test_names_the_goods_on_the_hud() -> bool:
	eq(GoodsStop.goods_name(["tiffin", "tiffin"] as Array[String]), "the lunch boxes")
	eq(GoodsStop.goods_name(["food-bag", "parcel"] as Array[String]), "the goods")
	eq(GoodsStop.goods_name(["cash-bag"] as Array[String]), "the money")
	return true


func test_cargo_nothing_before_pickup_both_after_one_fewer_each_drop() -> bool:
	var lunch: Array = [null, G.make("load", ["tiffin", "tiffin"], 0, 0), G.make("unload", ["tiffin"], 0, 0), G.make("unload", ["tiffin"], 0, 0)]
	eq(GoodsStop.cargo_aboard(lunch, 0, null), [])
	var pickup := GoodsStop.new(lunch[1], "bike")
	eq(GoodsStop.cargo_aboard(lunch, 1, pickup), [])
	run(pickup, 30, true)
	eq(GoodsStop.cargo_aboard(lunch, 1, pickup), ["tiffin", "tiffin"])
	var first := GoodsStop.new(lunch[2], "bike")
	eq(GoodsStop.cargo_aboard(lunch, 2, first), ["tiffin", "tiffin"])
	run(first, 30, true)
	eq(GoodsStop.cargo_aboard(lunch, 2, first), ["tiffin"])
	eq(GoodsStop.cargo_aboard(lunch, 3, null), ["tiffin"])
	eq(GoodsStop.cargo_aboard(lunch, 4, null), [])
	return true


func test_cargo_from_the_start_and_recovered_goods_only_at_their_stop() -> bool:
	var d := _drop()
	var parcels: Array = [null, d, d, d]
	eq(GoodsStop.cargo_aboard(parcels, 0, null), ["parcel", "parcel", "parcel"])
	eq(GoodsStop.cargo_aboard(parcels, 3, null), ["parcel"])
	var money: Array = [null, null, G.make("unload", ["cash-bag"], 0, 0, "here")]
	eq(GoodsStop.cargo_aboard(money, 0, null), [])
	eq(GoodsStop.cargo_aboard(money, 1, null), [])
	eq(GoodsStop.cargo_aboard(money, 2, null), ["cash-bag"])
	return true


func test_cargo_mixed_goods_still_to_load_are_not_aboard() -> bool:
	var biryani: Array = [G.make("load", ["food-bag", "parcel"], 0, 0), G.make("unload", ["food-bag"], 0, 0), G.make("unload", ["parcel"], 0, 0)]
	eq(GoodsStop.cargo_aboard(biryani, 0, null), [])
	eq(GoodsStop.cargo_aboard(biryani, 1, null), ["food-bag", "parcel"])
	eq(GoodsStop.cargo_aboard(biryani, 2, null), ["parcel"])
	return true


func _steps(runner: JobRunner, seconds: float, x: float, speed: float = 0.0) -> Array:
	var events: Array = []
	var t := 0.0
	while t < seconds - 1e-9:
		events.append_array(runner.update(0.1, x, 0, "bike", speed))
		t += 0.1
	return events


func test_job_stop_waits_for_the_handover_with_the_clock_paused() -> bool:
	var collect := JobData.Stop.make("Collect", 50, 0, 6, 2)
	collect.goods = G.make("load", ["parcel"], 50, 4)
	var deliver := JobData.Stop.make("Deliver", 200, 0, 6, 1)
	deliver.goods = G.make("unload", ["parcel"], 200, 4)
	var job := JobData.Job.make("courier", "courier", "bike", [collect, deliver], 60, 400, 50)
	var runner := JobRunner.new()
	runner.accept(job)
	runner.update(0.1, 0, 0, "bike", 0)
	_steps(runner, 5, 30, 10)
	var left: float = runner.seconds_left()
	_steps(runner, 2.1, 50)
	eq(runner.stop_number(), 0)
	eq(runner.goods().note(), "The parcel being loaded")
	near(runner.seconds_left(), left - 0.1, 5)
	var events := _steps(runner, FareStop.walk_time(3) + float(GoodsStop.HAND["bike"]), 50)
	ok(types(events).has("stop"))
	eq(runner.goods().goods.action, "unload")
	_steps(runner, 3, 200)
	var pay := 0
	for e: Dictionary in _steps(runner, 10, 200):
		if e["type"] == "completed":
			pay = e["result"]["pay"]
	gt(pay, 400)
	is_nil(runner.goods())
	return true


func test_stage_objective_with_goods_waits_and_its_timer_pauses() -> bool:
	var o := MissionData.Objective.reach("Deliver", 10, 0, 6)
	o.mode = "car"
	o.stop = true
	o.time_limit = 20
	o.goods = G.make("unload", ["parcel"], 10, 4)
	var runner := MissionRunner.new([MissionData.Mission.make("parcel", 1, 100, [o])])
	var car := MissionData.PlayerStatus.make(10, 0, "car", 0)
	runner.update(0.1, car)
	var left: float = runner.seconds_left()
	eq(runner.goods().started(), true)
	for i in 20:
		runner.update(0.1, car)
	eq(runner.seconds_left(), left)
	var done := false
	var i := 0
	while i < 100 and not done:
		done = types(runner.update(0.1, car)).has("completed")
		i += 1
	eq(done, true)
	eq(runner.balance(), 100)
	return true
