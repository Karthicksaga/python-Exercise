## Why a stage or job was failed (G-140). Each reason has a short text for the retry dialog;
## the runner's events keep their old `reason` strings and add `reason_id`.
class_name MissionFailure
extends RefCounted

enum Reason { OUT_OF_TIME, TARGET_ESCAPED, CARGO_RUINED, SPOTTED, PATIENT_LOST, VEHICLE_DESTROYED, PLAYER_DOWN }

const TEXT_KEYS := {
	Reason.OUT_OF_TIME: "fail.out_of_time",
	Reason.TARGET_ESCAPED: "fail.target_escaped",
	Reason.CARGO_RUINED: "fail.cargo_ruined",
	Reason.SPOTTED: "fail.spotted",
	Reason.PATIENT_LOST: "fail.patient_lost",
	Reason.VEHICLE_DESTROYED: "fail.vehicle_destroyed",
	Reason.PLAYER_DOWN: "fail.player_down",
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
	return Tr.t(str(TEXT_KEYS[reason]))


static func id_of(reason: Reason) -> String:
	return str(IDS[reason])


## The reason with this id string, or -1 when unknown.
static func from_id(id: String) -> int:
	for r: Variant in IDS:
		if IDS[r] == id:
			return int(r)
	return -1
