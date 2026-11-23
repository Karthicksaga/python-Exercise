## Ports of `missions/src/fares.test.ts` (13 cases: FareStop 6, busCrowd 1, MissionRunner with
## fares 3, evade and the train 2, JobRunner with fares 1).
extends "res://tests/rules/rules_test.gd"

const Fare := MissionData.Fare
const O := MissionData.Objective
const M := MissionData.Mission
const P := MissionData.PlayerStatus
const KX := 0.0
const KZ := 6.0


## The vehicle stopped 4 m from the kerb point (0, 6) at (0, 2): a 3 m walk to its door.
func run(stop: FareStop, seconds: float, ready: bool = true, x: float = 0.0, z: float = 2.0, dt: float = 0.05) -> bool:
	var done := false
	var t := 0.0
	while t < seconds - 1e-9:
		done = stop.step(dt, ready, x, z)
		t += dt
	return done


func test_waits_then_walks_the_passenger_over_and_in() -> bool:
	var stop := FareStop.new(Fare.make(1, 0, KX, KZ), "auto")
	eq(stop.people(), [{"action": "board", "index": 0, "stage": "waiting", "share": 0, "walk_seconds": 0}])
	eq(run(stop, 2, false), false)
	eq(stop.started(), false)
	var total := FareStop.walk_time(3) + FareStop.door_time("auto")
	eq(run(stop, 1), false)
	match_obj(stop.people()[0], {"stage": "walking"})
	eq(stop.change(), 0)
	eq(run(stop, total - 1 - 0.2), false)
	eq(stop.people()[0]["stage"], "entering")
	eq(run(stop, 0.3), true)
	eq(stop.people()[0]["stage"], "inside")
	eq(stop.change(), 1)
	return true


func test_walks_a_boarder_back_if_the_vehicle_drives_off() -> bool:
	var stop := FareStop.new(Fare.make(1, 0, KX, KZ), "car")
	run(stop, 1.5)
	var share: float = stop.people()[0]["share"]
	gt(share, 0)
	run(stop, 0.5, false)
	lt(stop.people()[0]["share"], share)
	run(stop, 3, false)
	eq(stop.people()[0]["stage"], "waiting")
	eq(stop.started(), false)
	run(stop, 0.1, true, 0, -2)
	near(stop.people()[0]["walk_seconds"], FareStop.walk_time(7), 5)
	return true


func test_someone_at_the_door_finishes_getting_in() -> bool:
	var stop := FareStop.new(Fare.make(1, 0, KX, KZ), "car")
	run(stop, FareStop.walk_time(3) + 0.1)
	eq(stop.people()[0]["stage"], "entering")
	eq(run(stop, FareStop.door_time("car"), false), true)
	return true


func test_lets_people_off_first_and_they_walk_off() -> bool:
	var stop := FareStop.new(Fare.make(1, 2, KX, KZ), "bus")
	run(stop, 0.5)
	var p := stop.people()
	match_obj(p[0], {"action": "alight", "stage": "exiting"})
	match_obj(p[1], {"action": "alight", "stage": "riding"})
	match_obj(p[2], {"action": "board", "stage": "waiting"})
	eq(stop.change(), -1)
	run(stop, FareStop.FARES["gap"])
	eq(stop.people()[1]["stage"], "exiting")
	eq(stop.people()[2]["stage"], "waiting")
	run(stop, FareStop.door_time("bus"))
	eq(stop.people()[2]["stage"], "walking")
	var leaving: Dictionary = stop.people()[0]
	eq(leaving["stage"], "leaving")
	near(leaving["walk_seconds"], FareStop.walk_time(3 + float(FareStop.FARES["walk_off"])), 5)
	eq(run(stop, 30), true)
	var stages: Array = []
	for q in stop.people():
		stages.append(q["stage"])
	eq(stages, ["gone", "gone", "inside"])
	eq(stop.change(), -1)
	return true


func test_says_what_is_happening_and_a_patient_takes_longer() -> bool:
	var stop := FareStop.new(Fare.make(1, 0, KX, KZ, true), "ambulance")
	eq(stop.note(), "")
	run(stop, 0.2)
	eq(stop.note(), "The patient is being loaded")
	gt(FareStop.door_time("ambulance", true), FareStop.door_time("ambulance"))
	var bus := FareStop.new(Fare.make(2, 1, KX, KZ), "bus")
	run(bus, 0.2)
	eq(bus.note(), "People getting off and on")
	return true


func test_caps_very_long_walks() -> bool:
	near(FareStop.walk_time(100), float(FareStop.FARES["max_walk"]) / float(FareStop.FARES["walk_speed"]), 5)
	gt(FareStop.walk_time(0), 0)
	return true


func test_bus_crowd_starts_empty_never_overfills_and_empties() -> bool:
	for stops: int in [2, 3, 4, 6]:
		var crowd := FareStop.bus_crowd(stops, 6)
		var aboard := 0
		for i in crowd.size():
			var c := crowd[i]
			le(c["alight"], aboard)
			if i > 0 and i < stops - 1:
				gt(c["alight"], 0)
			aboard += int(c["board"]) - int(c["alight"])
			le(aboard, 6)
			ge(c["board"], 0)
		eq(crowd[0], {"board": 3, "alight": 0})
		eq(crowd[stops - 1]["board"], 0)
		eq(aboard, 0)
	return true


# MissionRunner with fares ---------------------------------------------------------------------

func _fare_missions() -> Array:
	var pick := O.reach("Pick up", 50, 0, 5)
	pick.mode = "auto"
	pick.stop = true
	pick.fare = Fare.make(1, 0, 50, 5)
	var drop := O.reach("Drop off", 100, 0, 5)
	drop.mode = "auto"
	drop.stop = true
	drop.time_limit = 10
	drop.fare = Fare.make(0, 1, 100, 5)
	return [M.make("fare", 1, 300, [pick, drop])]


func at(x: float, mode: String = "auto", speed: float = 0.0) -> MissionData.PlayerStatus:
	return P.make(x, 0, mode, speed)


## Run for `seconds`, stopping once the objective moves on.
func step(runner: MissionRunner, seconds: float, status: MissionData.PlayerStatus) -> Array:
	var events: Array = []
	var label := runner.objective().label if runner.objective() != null else ""
	var t := 0.0
	while t < seconds - 1e-9 and runner.objective() != null and runner.objective().label == label:
		events.append_array(runner.update(0.1, status))
		t += 0.1
	return events


func test_pickup_completes_once_the_passenger_is_in() -> bool:
	var runner := MissionRunner.new(_fare_missions())
	eq(runner.update(0.1, at(50)), [])
	eq(runner.objective().label, "Pick up")
	eq(runner.fare().started(), true)
	var boarding := FareStop.walk_time(5 - float(FareStop.FARES["door_offset"])) + FareStop.door_time("auto")
	eq(step(runner, boarding - 0.4, at(50)), [])
	eq(runner.aboard(), 0)
	var events := step(runner, 0.6, at(50))
	eq(types(events), ["objective"])
	eq(runner.objective().label, "Drop off")
	eq(runner.aboard(), 1)
	eq(runner.seconds_left(), 10)
	return true


func test_drop_clock_stops_while_the_passenger_gets_out() -> bool:
	var runner := MissionRunner.new(_fare_missions())
	step(runner, 10, at(50))
	eq(runner.objective().label, "Drop off")
	step(runner, 6, at(70, "auto", 8))
	near(runner.seconds_left(), 4, 5)
	var leaving := FareStop.door_time("auto") + FareStop.walk_time(5 - float(FareStop.FARES["door_offset"]) + float(FareStop.FARES["walk_off"]))
	gt(leaving, 4)
	runner.update(0.1, at(100))
	eq(runner.aboard(), 0)
	var events := step(runner, leaving + 0.2, at(100))
	eq(types(events), ["completed", "allDone"])
	eq(runner.balance(), 300)
	return true


func test_puts_the_passenger_out_when_the_stage_restarts() -> bool:
	var runner := MissionRunner.new(_fare_missions())
	step(runner, 10, at(50))
	eq(runner.aboard(), 1)
	runner.restart_stage()
	eq(runner.aboard(), 0)
	eq(runner.fare().people()[0]["stage"], "waiting")
	return true


func _evade_missions() -> Array:
	var ride := O.reach("Ride to Chetpet", 0, 0, 60)
	ride.by_train = true
	return [M.make("run", 1, 100, [O.evade("Lose the police", 2), ride])]


func test_evade_is_met_only_after_the_police_were_after_the_player() -> bool:
	var runner := MissionRunner.new(_evade_missions())
	eq(runner.update(0.1, at(0, "foot").with_wanted(0)), [])
	eq(runner.update(0.1, at(0, "foot").with_wanted(2)), [])
	eq(runner.update(0.1, at(0, "foot").with_wanted(1)), [])
	match_obj(runner.update(0.1, at(0, "foot").with_wanted(0))[0], {"type": "objective", "label": "Ride to Chetpet"})
	return true


func test_a_station_counts_only_when_arriving_by_train() -> bool:
	var runner := MissionRunner.new(_evade_missions())
	runner.update(0.1, at(0, "foot").with_wanted(2))
	runner.update(0.1, at(0, "foot").with_wanted(0))
	eq(runner.update(0.1, at(10, "foot")), [])
	eq(runner.update(0.1, at(10, "car")), [])
	eq(types(runner.update(0.1, at(10, "foot", 12).with_train(true))), ["completed", "allDone"])
	return true


# JobRunner with fares ------------------------------------------------------------------------

func _steps(runner: JobRunner, seconds: float, x: float, speed: float = 0.0) -> Array:
	var events: Array = []
	var t := 0.0
	while t < seconds - 1e-9:
		events.append_array(runner.update(0.1, x, 0, "car", speed))
		t += 0.1
	return events


func test_job_moves_on_once_the_passenger_is_in_and_its_clock_waits() -> bool:
	var pick := JobData.Stop.make("Pick up", 50, 0, 7, 2)
	pick.fare = Fare.make(1, 0, 50, 5)
	var drop := JobData.Stop.make("Drop", 200, 0, 7, 1)
	drop.fare = Fare.make(0, 1, 200, 5)
	var job := JobData.Job.make("cab", "cab", "car", [pick, drop], 60, 500, 50)
	var runner := JobRunner.new()
	runner.accept(job)
	runner.update(0.1, 0, 0, "car", 0)
	_steps(runner, 5, 30, 10)
	var left: float = runner.seconds_left()
	_steps(runner, 2.1, 50)
	eq(runner.stop_number(), 0)
	eq(runner.fare().note(), "Passenger getting in")
	near(runner.seconds_left(), left - 0.1, 5)
	var events := _steps(runner, FareStop.walk_time(4) + FareStop.door_time("car"), 50)
	ok(types(events).has("stop"))
	eq(runner.aboard(), 1)
	_steps(runner, 3, 200)
	var done := _steps(runner, 10, 200)
	ok(types(done).has("completed"))
	eq(runner.aboard(), 0)
	is_nil(runner.fare())
	return true
