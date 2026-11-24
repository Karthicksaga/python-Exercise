## Why a stage or job was failed (G-140). Each reason has a short text for the retry dialog;
## the runner's events keep their old `reason` strings and add `reason_id`.
class_name MissionFailure
extends RefCounted

enum Reason { OUT_OF_TIME, TARGET_ESCAPED, CARGO_RUINED, SPOTTED, PATIENT_LOST, VEHICLE_DESTROYED, PLAYER_DOWN }

const TEXTS := {
	Reason.OUT_OF_TIME: "Out of time",
	Reason.TARGET_ESCAPED: "They got away",
	Reason.CARGO_RUINED: "The cargo is ruined",
	Reason.SPOTTED: "You were spotted",
	Reason.PATIENT_LOST: "The patient is lost",
	Reason.VEHICLE_DESTROYED: "The vehicle is wrecked",
	Reason.PLAYER_DOWN: "You are down",
}
const IDS := {
	Reason.OUT_OF_TIME: "out_of_time",
	Reason.TARGET_ESCAPED: "target_escaped",
	Reason.CARGO_RUINED: "cargo_ruined",
	Reason.SPOTTED: "spotted",
	Reason.PATIENT_LOST: "patient_lost",
	Reason.VEHICLE_DESTROYED: "vehicle_destroyed",
	Reason.PLAYER_DOWN: "player_down",
}


static func text(reason: Reason) -> String:
	return str(TEXTS[reason])


static func id_of(reason: Reason) -> String:
	return str(IDS[reason])


## The reason with this id string, or -1 when unknown.
static func from_id(id: String) -> int:
	for r: Variant in IDS:
		if IDS[r] == id:
			return int(r)
	return -1
