class_name MarkerKind
extends RefCounted
## What a marker on the ground and on the map means (G-282): the words and the colour the player
## reads, per kind, so the beacon, the minimap and the full map say the same thing. Pure data; the
## composition root hands `{kind, label, colour}` to whoever draws.
##
## PICKUP: someone or something is collected here. DROPOFF: the ride or delivery ends here.
## MISSION: go here (a stage's place). FIGHT: people to beat. VEHICLE: the vehicle to get into.
## PLACE: a place you can go inside. TARGET: someone to catch or follow.

const PICKUP := &"pickup"
const DROPOFF := &"dropoff"
const MISSION := &"mission"
const FIGHT := &"fight"
const VEHICLE := &"vehicle"
const PLACE := &"place"
const TARGET := &"target"

const ALL: Array[StringName] = [PICKUP, DROPOFF, MISSION, FIGHT, VEHICLE, PLACE, TARGET]
const LABELS := {
	PICKUP: "Pick up",
	DROPOFF: "Drop off",
	MISSION: "Mission",
	FIGHT: "Fight",
	VEHICLE: "Vehicle",
	PLACE: "Place",
	TARGET: "Target",
}
## Green to collect, blue to hand over, amber (the game's accent) for the mission, red for a fight.
const COLOURS := {
	PICKUP: Color("#46d17a"),
	DROPOFF: Color("#4aa8ff"),
	MISSION: Color("#ffb703"),
	FIGHT: Color("#ff6b5a"),
	VEHICLE: Color("#8be3ff"),
	PLACE: Color("#40d9cc"),
	TARGET: Color("#ffffff"),
}


static func label_of(kind: StringName) -> String:
	return str(LABELS.get(kind, "Mission"))


static func colour_of(kind: StringName) -> Color:
	return COLOURS.get(kind, COLOURS[MISSION])


## The kind of a stage objective's marker.
static func of_objective(o: MissionData.Objective) -> StringName:
	if o == null:
		return MISSION
	match o.type:
		"reach":
			if o.fare != null:
				return PICKUP if o.fare.board > 0 and o.fare.alight == 0 else DROPOFF
			if o.goods != null:
				return PICKUP if o.goods.action == "load" else DROPOFF
			return MISSION
		"defeat":
			return FIGHT
		"enter":
			return VEHICLE
		"chase", "tail":
			return TARGET
	return MISSION


## The kind of a city job's stop (the vehicle first when the player is not in it).
static func of_stop(s: JobData.Stop) -> StringName:
	if s == null:
		return MISSION
	if s.fare != null:
		return PICKUP if s.fare.board > 0 and s.fare.alight == 0 else DROPOFF
	if s.goods != null:
		return PICKUP if s.goods.action == "load" else DROPOFF
	return MISSION
