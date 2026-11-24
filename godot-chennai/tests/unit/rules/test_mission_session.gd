extends TestCase
## MissionSession (G-130): the stages, jobs, stories and life sharing one purse and one save,
## stepped in game time without nodes. The scene tests (`tests/scene/test_missions_layer.gd`)
## play the same through the real player and vehicles.

const SAVE := "user://test-mission-session.json"
const DT := 1.0 / 60.0


func before_each() -> void:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))


func _session() -> MissionSession:
	return MissionSession.open(SAVE)


func _step(s: MissionSession, seconds: float, x: float, z: float, mode: String = "foot", speed: float = 0.0) -> void:
	for i in ceili(seconds / DT):
		s.step(DT, MissionData.PlayerStatus.make(x, z, mode, speed))


func test_content_has_places_and_stories() -> bool:
	var s := _session()
	assert_true(s.content.ok(), "content loads")
	var kinds: Array[String] = []
	for p in s.content.places:
		kinds.append(str(p["kind"]))
	assert_eq(kinds, ["home", "hospital", "gym", "mall", "cinema"] as Array[String], "the five life places")
	assert_eq(s.content.stories.size(), 3, "three stories")
	assert_eq((s.content.stories[0].steps[2] as StoryRunner.Step).activity, "checkup", "activity steps keep their activity")
	return true


func test_stage_1_on_foot_pays_50_and_survives_a_restart() -> bool:
	var s := _session()
	assert_eq(s.runner.mission().id, "morning-walk", "stage 1 first")
	var t := s.target(Vector2(0, 0), "foot", [])
	assert_false(t.is_empty(), "stage 1 has a marker")
	var toasts: Array[String] = []
	s.notice.connect(func(title: String, _d: String, _s: float) -> void: toasts.append(title))
	_step(s, 0.5, float(t["x"]) + 30.0, float(t["z"]))
	assert_eq(s.runner.balance(), 0, "not paid away from the marker")
	_step(s, 0.1, float(t["x"]), float(t["z"]))
	assert_eq(s.runner.balance(), 50, "paid ₹50")
	assert_true(toasts.has("Stage 1 complete"), "completion toast")
	_step(s, MissionSession.NEXT_BRIEF_DELAY + 0.1, 0, 0)
	assert_true(toasts.has("Stage 2: borrowed-wheels") or toasts.any(func(x: String) -> bool: return x.begins_with("Stage 2:")), "next stage's brief after the delay")
	assert_eq(s.objective().label, "Get in the hatchback", "stage 2's first objective")
	var again := _session()
	assert_eq(again.runner.balance(), 50, "money restored from the save")
	assert_eq(again.runner.mission().id, "borrowed-wheels", "stage restored from the save")
	return true


func test_stage_2_needs_the_car_and_a_full_stop() -> bool:
	var s := _session()
	var first := s.target(Vector2.ZERO, "foot", [])
	_step(s, 0.1, float(first["x"]), float(first["z"]))
	var car: Dictionary = s.content.parked("car-start")
	var vehicles := [{"kind": "car", "x": float(car["x"]), "z": float(car["z"])}, {"kind": "bike", "x": 0.0, "z": 0.0}]
	var marker := s.target(Vector2(0, 0), "foot", vehicles)
	assert_near(float(marker["x"]), float(car["x"]), 0.01, "the marker points at the hatchback")
	_step(s, 0.1, float(car["x"]), float(car["z"]), "car")
	assert_eq(s.objective().label, "Drive to Anna Nagar Tower Park", "getting in moves the objective on")
	var park := s.target(Vector2.ZERO, "car", vehicles)
	_step(s, 0.5, float(park["x"]), float(park["z"]), "foot")
	assert_eq(s.runner.balance(), 50, "on foot does not count")
	_step(s, 0.5, float(park["x"]), float(park["z"]), "car", 8.0)
	assert_eq(s.runner.balance(), 50, "driving through does not count")
	_step(s, 0.1, float(park["x"]), float(park["z"]), "car", 0.5)
	assert_eq(s.runner.balance(), 200, "a full stop pays ₹150")
	assert_eq(s.runner.mission().id, "auto-shift", "stage 3 next")
	return true


func test_new_game_clears_progress() -> bool:
	var s := _session()
	var first := s.target(Vector2.ZERO, "foot", [])
	_step(s, 0.1, float(first["x"]), float(first["z"]))
	s.jobs.gain_reputation(10)
	s.life.finish_story("gym-bet")
	s.save()
	s.new_game()
	assert_eq(s.runner.balance(), 0, "money gone")
	assert_eq(s.runner.mission().id, "morning-walk", "back to stage 1")
	assert_eq(s.jobs.reputation(), JobRunner.START_REPUTATION, "reputation back to the start")
	var again := _session()
	assert_eq(again.runner.balance(), 0, "the save is cleared too")
	assert_eq(again.runner.mission().id, "morning-walk", "the saved stage is cleared too")
	assert_eq(again.stories.offered_at("gym").size(), 1, "stories offered again")
	return true


func test_the_board_offers_every_job_and_each_jobs_vehicle_is_parked() -> bool:
	var s := _session()
	var rows := s.board_rows(12.0)
	assert_eq(rows.size(), 13, "every job on the board")
	var parked := {}
	for p in s.content.parking:
		parked[str(p["kind"])] = true
	for j in s.content.jobs:
		assert_true(parked.has(j.vehicle), "a %s is parked for %s" % [j.vehicle, j.id])
	var marina: Dictionary = rows.filter(func(r: Dictionary) -> bool: return r["id"] == "marina-evening")[0]
	assert_contains(str(marina["disabled"]), "16:00", "the Marina drive is offered in the evening only")
	var bus: Dictionary = rows.filter(func(r: Dictionary) -> bool: return r["id"] == "bus-route")[0]
	assert_eq(str(bus["disabled"]), "Needs reputation 55", "the bus needs reputation")
	assert_true(s.take_job("ambulance-run", 12.0), "take the ambulance run")
	assert_eq(s.view("foot", -1.0)["objective"], "Get in the ambulance", "the panel asks for the ambulance")
	var amb: Dictionary = s.content.parked("ambulance")
	var t := s.target(Vector2.ZERO, "foot", [{"kind": "ambulance", "x": float(amb["x"]), "z": float(amb["z"])}])
	assert_near(float(t["x"]), float(amb["x"]), 0.01, "the marker points at the ambulance")
	var rows_now := s.board_rows(12.0)
	assert_eq(str(rows_now[0]["disabled"]), "On this job now", "the job being worked is marked")
	assert_contains(s.board_message(), "Quitting costs", "the board says what quitting costs")
	s.quit_job()
	assert_eq(s.jobs.reputation(), JobRunner.START_REPUTATION - JobRunner.FAIL_REPUTATION, "quitting costs reputation")
	return true


func test_a_fares_passenger_boards_and_alights() -> bool:
	var s := _session()
	s.store.read()
	s.store.set_section(SaveStore.PROGRESS, {"completed": ["morning-walk", "borrowed-wheels"], "money": 200})
	s.store.write()
	s.reload()
	assert_eq(s.runner.mission().id, "auto-shift", "stage 3")
	_step(s, 0.1, 0, 0, "auto")
	assert_eq(s.objective().label, "Pick up the passenger", "pick-up objective")
	var pick := s.target(Vector2.ZERO, "auto", [])
	var scene := s.fare_scene()
	var fare: FareStop = scene["stop"]
	assert_eq(fare.people()[0]["stage"], "waiting", "waiting at the kerb")
	var stages: Array[String] = []
	for i in 600:
		s.step(DT, MissionData.PlayerStatus.make(float(pick["x"]), float(pick["z"]), "auto", 0.0))
		if s.fare_scene().is_empty() or s.fare_scene()["stop"] != fare:
			break
		var st: String = fare.people()[0]["stage"]
		if stages.is_empty() or stages[-1] != st:
			stages.append(st)
	assert_eq(stages, ["walking", "entering"] as Array[String], "walks over, then gets in")
	assert_eq(s.objective().label, "Drop the passenger", "the drop next")
	assert_eq(s.runner.aboard(), 1, "one aboard")
	var drop := s.target(Vector2.ZERO, "auto", [])
	var drop_fare: FareStop = s.fare_scene()["stop"]
	stages.clear()
	for i in 900:
		s.step(DT, MissionData.PlayerStatus.make(float(drop["x"]), float(drop["z"]), "auto", 0.0))
		if s.runner.balance() > 200:
			break
		var st: String = drop_fare.people()[0]["stage"]
		if stages.is_empty() or stages[-1] != st:
			stages.append(st)
	assert_eq(stages, ["exiting", "leaving"] as Array[String], "gets out, walks off")
	assert_eq(s.runner.balance(), 500, "paid only once they are off")
	return true


func test_places_offer_their_activities_and_charge() -> bool:
	var s := _session()
	s.runner.earn(1000)
	var home: Dictionary = s.content.place("home")
	assert_eq(s.place_near(Vector2(float(home["x"]), float(home["z"])), "foot")["id"], "home", "home's entrance on foot")
	assert_true(s.place_near(Vector2(float(home["x"]), float(home["z"])), "car").is_empty(), "not from a car")
	var ids: Array = s.place_actions("home", 22.0).map(func(a: Dictionary) -> String: return a["id"])
	assert_true(ids.has("sleep") and ids.has("clothes") and ids.has("story:paati-checkup"), "home: sleep, clothes and Paati's story")
	var sleep := s.do_place("home", "sleep", 22.0)
	assert_near(float(sleep["hours"]), 9.0, 0.01, "sleep from 22:00 to 07:00")
	var film := s.do_place("cinema", "film:sambar-sunday", 10.0)
	assert_true(bool(film["ok"]) and (film["lines"] as Array).size() == 7, "a film with its audience")
	assert_eq(s.runner.balance(), 1000 - Life.TICKET_PRICE, "the ticket is paid")
	var gym := s.do_place("gym", "workout", 9.0, 4)
	assert_eq(s.life.fitness(), 1, "a good workout raises fitness")
	assert_true(bool(gym["ok"]), "workout done")
	s.do_place("gym", "story:gym-bet", 9.0)
	assert_eq(s.stories.story().id, "gym-bet", "the gym bet starts")
	assert_eq(s.do_place("gym", "activity:gym-bet", 9.0, 3)["ok"], false, "three reps lose the bet")
	s.do_place("gym", "activity:gym-bet", 9.0, 4)
	assert_eq(s.stories.step_number(), 1, "four reps: on to the race")
	return true
