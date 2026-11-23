## What happens when the player's vehicle hits a pedestrian (port of
## `combat/src/PedestrianHits.ts`): whether it touched them, how bad it was by impact speed,
## where they end up and what it costs. Kept non-graphic: a person hit hard enough is knocked
## down and lies on the road; no blood or injury is shown. Children are never in anything that
## can be hit (they appear only in station crowds and as passengers with an adult), so these
## rules are only ever given adult pedestrians.
class_name PedestrianHits
extends RefCounted

const PEDESTRIAN_HIT := {
	"min_speed": 2.0,
	"injured_from": 4.5,
	"killed_from": 12.5,
	"person_radius": 0.35,
	"person_mass": 70.0,
	"fine": {"stumble": 0, "injured": 1500, "killed": 5000},
	"reputation": {"stumble": 0, "injured": 8, "killed": 20},
	"injured_down": 5.0,
	"limp_speed": 0.6,
	"limp_for": 30.0,
	"killed_stay": 25.0,
	"remove_beyond": 35.0,
	"killed_max": 90.0,
	"stumble_grace": 1.5,
	"scare_radius": 16.0,
	"scare_for": 6.0,
	"max_throw": 8.0,
}


## "stumble", "injured", "killed", or "" when too slow to count.
static func hit_outcome(speed: float) -> String:
	var s := absf(speed)
	if s < float(PEDESTRIAN_HIT["min_speed"]):
		return ""
	if s < float(PEDESTRIAN_HIT["injured_from"]):
		return "stumble"
	if s < float(PEDESTRIAN_HIT["killed_from"]):
		return "injured"
	return "killed"


## {fine, reputation} lost for an outcome.
static func hit_penalty(outcome: String) -> Dictionary:
	return {"fine": PEDESTRIAN_HIT["fine"][outcome], "reputation": PEDESTRIAN_HIT["reputation"][outcome]}


static func throw_distance(outcome: String, speed: float) -> float:
	if outcome == "stumble":
		return 0.4
	return minf(PEDESTRIAN_HIT["max_throw"], 1.0 + 0.035 * speed * speed)


## Share of its speed the vehicle keeps (momentum shared with the person).
static func speed_kept(vehicle_mass: float) -> float:
	return vehicle_mass / (vehicle_mass + float(PEDESTRIAN_HIT["person_mass"]))


## `vehicle`: {x, z, yaw, vx, vz, half_width, half_length}. Touches a person at (x, z) now or
## within the next `lead` seconds of travel.
static func vehicle_touches(v: Dictionary, x: float, z: float, lead: float) -> bool:
	var r: float = PEDESTRIAN_HIT["person_radius"]
	var fx := -sin(float(v["yaw"]))
	var fz := -cos(float(v["yaw"]))
	var steps := 4
	for i in steps + 1:
		var t := lead * i / steps
		var rx := x - (float(v["x"]) + float(v["vx"]) * t)
		var rz := z - (float(v["z"]) + float(v["vz"]) * t)
		var along := rx * fx + rz * fz
		var side := rx * fz - rz * fx
		if absf(along) <= float(v["half_length"]) + r and absf(side) <= float(v["half_width"]) + r:
			return true
	return false


## Where a person hit at (x, z) comes to rest: {x, z, dx, dz, distance}.
static func resting_spot(v: Dictionary, x: float, z: float, outcome: String) -> Dictionary:
	var vx: float = v["vx"]
	var vz: float = v["vz"]
	var speed := RulesMath.hypot(vx, vz)
	var ux := vx / speed if speed > 0.01 else -sin(float(v["yaw"]))
	var uz := vz / speed if speed > 0.01 else -cos(float(v["yaw"]))
	var lateral := (x - float(v["x"])) * -uz + (z - float(v["z"])) * ux
	var sign_side := 1.0 if lateral >= 0.0 else -1.0
	var clearance := maxf(0.0, float(v["half_width"]) + float(PEDESTRIAN_HIT["person_radius"]) + 0.5 - absf(lateral))
	var forward := throw_distance(outcome, speed)
	var dx := ux * forward + -uz * sign_side * clearance
	var dz := uz * forward + ux * sign_side * clearance
	var distance := RulesMath.hypot(dx, dz)
	return {"x": x + dx, "z": z + dz, "dx": dx / distance if distance > 0.0 else ux, "dz": dz / distance if distance > 0.0 else uz, "distance": distance}
