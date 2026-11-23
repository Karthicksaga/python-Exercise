## Short stories (port of `missions/src/stories.ts`): optional light missions offered at a
## place, with steps in order like a stage (reach, get in, or an activity inside a place) and a
## reward paid once. Failing one just ends it. Steps are MissionData.Objective, plus an
## "activity" step (`place`, `activity` and the entrance's x, z, radius).
class_name StoryRunner
extends RefCounted

signal story_event(event: Dictionary)

const STOPPED := 1.2


## A story step: an Objective, or an activity done inside a place.
class Step extends MissionData.Objective:
	var place := ""
	var activity := ""

	static func make_activity(text: String, place_id: String, activity_id: String, px: float, pz: float, r: float) -> Step:
		var s := Step.new()
		s.type = "activity"
		s.label = text
		s.place = place_id
		s.activity = activity_id
		s.x = px
		s.z = pz
		s.radius = r
		return s


## A story: {id, title, brief, reward, offered_at, ending, steps: Array[Objective]}.
class Story:
	var id := ""
	var title := ""
	var brief := ""
	var reward := 0
	var offered_at := ""
	var ending := ""
	var steps: Array[MissionData.Objective] = []

	static func make(story_id: String, money: int, place: String, step_list: Array) -> Story:
		var s := Story.new()
		s.id = story_id
		s.title = story_id
		s.reward = money
		s.offered_at = place
		for st: MissionData.Objective in step_list:
			s.steps.append(st)
		return s


var _stories: Array[Story] = []
var _current: Story = null
var _index := 0
var _timed := false
var _time_left := 0.0
var _finished: Array[String] = []


func _init(stories: Array, completed: Array = []) -> void:
	for s: Story in stories:
		_stories.append(s)
	var known := {}
	for s in _stories:
		known[s.id] = true
	for id: Variant in completed:
		if known.has(str(id)) and not _finished.has(str(id)):
			_finished.append(str(id))


func story() -> Story:
	return _current


func step() -> MissionData.Objective:
	if _current == null or _index >= _current.steps.size():
		return null
	return _current.steps[_index]


func step_number() -> int:
	return _index


func seconds_left() -> Variant:
	return _time_left if _timed else null


func completed() -> Array[String]:
	return _finished


## Stories offered at a place that have not been finished.
func offered_at(place: String) -> Array[Story]:
	var out: Array[Story] = []
	for s in _stories:
		if s.offered_at == place and not _finished.has(s.id):
			out.append(s)
	return out


## The activity step the current step wants done at this place, or null.
func wanted(place: String) -> Step:
	var s := step()
	if s is Step and s.type == "activity" and (s as Step).place == place:
		return s
	return null


func start(id: String) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var found: Story = null
	for s in _stories:
		if s.id == id:
			found = s
	if found == null or _current != null or _finished.has(id):
		return events
	_current = found
	_index = 0
	_arm()
	events.append({"type": "started", "story": found})
	return _emit(events)


func quit() -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if _current == null:
		return events
	events.append({"type": "failed", "story": _current, "reason": "Story abandoned"})
	_current = null
	_timed = false
	return _emit(events)


func _arm() -> void:
	var s := step()
	_timed = s != null and s.type == "reach" and s.time_limit > 0.0
	_time_left = s.time_limit if _timed else 0.0


func _met(s: MissionData.Objective, p: MissionData.PlayerStatus) -> bool:
	if s.type == "enter":
		return p.mode == s.vehicle
	if s.type in ["defeat", "activity", "chase", "evade"]:
		return false
	if s.mode != "" and p.mode != s.mode:
		return false
	if RulesMath.hypot(p.x - s.x, p.z - s.z) > s.radius:
		return false
	return not s.stop or p.speed < STOPPED


func _advance(s: Story) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	_index += 1
	if _index < s.steps.size():
		_arm()
		events.append({"type": "step", "story": s, "label": s.steps[_index].label, "index": _index})
		return events
	_current = null
	_timed = false
	var first := not _finished.has(s.id)
	if first:
		_finished.append(s.id)
	events.append({"type": "completed", "story": s, "reward": s.reward if first else 0})
	return events


func update(dt: float, p: MissionData.PlayerStatus) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	var s := _current
	var st := step()
	if s == null or st == null:
		return events
	if _timed:
		_time_left -= dt
		if _time_left <= 0.0:
			_current = null
			_timed = false
			events.append({"type": "failed", "story": s, "reason": "Out of time"})
			return _emit(events)
	return _emit(_advance(s)) if _met(st, p) else events


## The player did `activity` inside `place`.
func activity(place: String, what: String) -> Array[Dictionary]:
	var s := _current
	var st := step()
	if s == null or not (st is Step) or st.type != "activity" or (st as Step).place != place or (st as Step).activity != what:
		return [] as Array[Dictionary]
	return _emit(_advance(s))


func _emit(events: Array[Dictionary]) -> Array[Dictionary]:
	for e in events:
		story_event.emit(e)
	return events


func reset() -> void:
	_current = null
	_timed = false
	_finished.clear()
