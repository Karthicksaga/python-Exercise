## The game's content tables (G-41): the 21 stages, the city jobs, enemy groups, parking, the
## gangs, their crews and the weapon pickups, loaded from the JSON baked from the Three.js game
## (`tools/rules/export_content.ts`) into typed rules objects. Parking, gangs, crews and pickups
## stay plain Dictionaries in the TS shapes (they are placement data for the world and AI).
class_name GameContent
extends RefCounted

const DEFAULT_PATH := "res://src/missions/content/content.json"
const FORMAT := "chennai-rules-content"
const VERSION := 1

## {x, z, yaw}
var spawn: Dictionary = {}
var parking: Array[Dictionary] = []
var missions: Array[MissionData.Mission] = []
## group name -> Array of EnemySpot
var enemies: Dictionary = {}
var jobs: Array[JobData.Job] = []
var gangs: Array[Dictionary] = []
var crews: Array[Dictionary] = []
var pickups: Array[Dictionary] = []
## The life places {id, kind, name, x, z, radius} (home, hospital, gym, mall, cinema) and the
## short stories offered at them (`places.ts`, baked with the rest; G-131).
var places: Array[Dictionary] = []
var stories: Array[StoryRunner.Story] = []
## Why loading failed, or "".
var error := ""


static func load_file(path: String = DEFAULT_PATH) -> GameContent:
	var c := GameContent.new()
	var text := FileAccess.get_file_as_string(path)
	if text == "":
		c.error = "cannot read %s" % path
		return c
	var data: Variant = JSON.parse_string(text)
	if not (data is Dictionary):
		c.error = "%s is not a JSON object" % path
		return c
	c._fill(data)
	return c


func _fill(d: Dictionary) -> void:
	if d.get("format") != FORMAT or int(d.get("version", 0)) != VERSION:
		error = "unknown content format %s v%s" % [d.get("format"), d.get("version")]
		return
	spawn = d.get("spawn", {})
	for p: Dictionary in d.get("parking", []):
		parking.append(p)
	for m: Dictionary in d.get("missions", []):
		missions.append(MissionData.Mission.from_dict(m))
	var groups: Dictionary = d.get("enemies", {})
	for g: String in groups:
		var spots: Array[EnemySpot] = []
		for s: Dictionary in groups[g]:
			spots.append(EnemySpot.from_dict(s))
		enemies[g] = spots
	for j: Dictionary in d.get("jobs", []):
		jobs.append(JobData.Job.from_dict(j))
	for g: Dictionary in d.get("gangs", []):
		gangs.append(g)
	for c: Dictionary in d.get("crews", []):
		crews.append(c)
	for p: Dictionary in d.get("pickups", []):
		pickups.append(p)
	for p: Dictionary in d.get("places", []):
		places.append(p)
	for s: Dictionary in d.get("stories", []):
		stories.append(_story(s))


static func _story(d: Dictionary) -> StoryRunner.Story:
	var steps: Array = []
	for st: Dictionary in d.get("steps", []):
		if str(st.get("type", "")) == "activity":
			steps.append(StoryRunner.Step.make_activity(str(st.get("label", "")), str(st.get("place", "")), str(st.get("activity", "")), float(st.get("x", 0.0)), float(st.get("z", 0.0)), float(st.get("radius", 0.0))))
		else:
			steps.append(MissionData.Objective.from_dict(st))
	var story := StoryRunner.Story.make(str(d.get("id", "")), int(d.get("reward", 0)), str(d.get("offeredAt", "")), steps)
	story.title = str(d.get("title", ""))
	story.brief = str(d.get("brief", ""))
	story.ending = str(d.get("ending", ""))
	return story


func ok() -> bool:
	return error == ""


func mission(id: String) -> MissionData.Mission:
	for m in missions:
		if m.id == id:
			return m
	return null


func job(id: String) -> JobData.Job:
	for j in jobs:
		if j.id == id:
			return j
	return null


func place(id: String) -> Dictionary:
	for p in places:
		if p["id"] == id:
			return p
	return {}


func parked(id: String) -> Dictionary:
	for p in parking:
		if p["id"] == id:
			return p
	return {}
