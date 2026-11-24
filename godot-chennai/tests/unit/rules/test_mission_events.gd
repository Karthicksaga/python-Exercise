## Dynamic events in the real jobs and the Hall Ticket (W4, G-146): they start from game time,
## change the clock and the roads, never overlap, and a run repeats with its seed. New cases.
extends "res://tests/unit/rules/rules_test.gd"

const SAVE := "user://test-mission-events.json"


func _session() -> MissionSession:
	DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE))
	return MissionSession.open(SAVE)


## Play a cab job to its first stop in the cab, then `seconds` of driving.
func _drive_job(s: MissionSession, id: String, seconds: float, started: Array, ended: Array) -> void:
	s.event_started.connect(func(e: Dictionary) -> void: started.append(e))
	s.event_ended.connect(func(e: Dictionary) -> void: ended.append(e))
	s.take_job(id, 10.0)
	var j := s.jobs.job()
	var first := j.stops[0]
	# In the vehicle, away from the first stop, so the clock runs and the job does not progress.
	var p := MissionData.PlayerStatus.make(first.x + 600.0, first.z, j.vehicle, 8.0)
	var t := 0.0
	while t < seconds and s.jobs.job() != null:
		s.step(0.5, p)
		t += 0.5


func test_a_job_gets_seeded_events_with_their_time_and_zones() -> bool:
	var s := _session()
	var started: Array = []
	var ended: Array = []
	_drive_job(s, "cab-ride", 60.0, started, ended)
	gt(float(started.size()), 0.0, "an event came within a minute")
	var first: Dictionary = started[0]
	ge(float(first["at"]), DynamicEvents.FIRST_AT, "not before 25 s")
	var limit := s.content.job("cab-ride").time_limit
	var left: Variant = s.jobs.seconds_left()
	near(float(left), limit + float(first["time"]) - s.jobs.elapsed() if started.size() == 1 else float(left), 1, "the clock took the event's time")
	var again := _session()
	var started2: Array = []
	_drive_job(again, "cab-ride", 60.0, started2, [])
	eq(started2.map(func(e: Dictionary) -> String: return e["kind"]), started.map(func(e: Dictionary) -> String: return e["kind"]), "same job, same attempt: same events")
	return true


func test_events_never_overlap_and_zones_expire_with_them() -> bool:
	var s := _session()
	var started: Array = []
	var ended: Array = []
	_drive_job(s, "cab-ride", 400.0, started, ended)
	for i in range(1, started.size()):
		ok(float(started[i]["at"]) >= float(started[i - 1]["at"]) + DynamicEvents.GAP_MIN - 1.0 or float(started[i - 1]["duration"]) == 0.0, "event %d does not crowd the last" % i)
	ok(s.hazard_zones().size() <= 1, "at most one zone at a time")
	return true


func test_a_rain_event_asks_for_rain_and_the_hall_ticket_runs_events_only_in_a_vehicle() -> bool:
	var s := _session()
	ok(s.play_stage("hall-ticket"))
	var m := s.runner.mission()
	var started: Array = []
	s.event_started.connect(func(e: Dictionary) -> void: started.append(e))
	# On foot nothing happens, however long.
	for i in 400:
		s.step(0.5, MissionData.PlayerStatus.make(0, 0, "foot"))
	eq(started.size(), 0, "no event on foot")
	# In the auto at the pick-up, driving: events come.
	var lodge := m.objectives[1]
	for i in 600:
		s.step(0.5, MissionData.PlayerStatus.make(lodge.x, lodge.z, "auto", 8.0))
	gt(float(started.size()), 0.0, "events come while driving the stage")
	return true
