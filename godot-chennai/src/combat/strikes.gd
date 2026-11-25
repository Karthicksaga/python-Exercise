## Timing of a blow, and the knock-back it gives (port of `combat/src/Strikes.ts`). A punch or a
## bat swing is drawn as a wind-up, the strike and a recovery (`StrikePose`); the player's damage
## lands at the strike, not when HIT is pressed (`SwingClock`), so what is seen and what happens
## agree. Pure logic. Every number is a game-design estimate, judged by eye at the phone's rate.
class_name Strikes
extends RefCounted

## Seconds from the start of a swing to the blow landing (arm out, bat across the front), and
## from the blow back to standing. Both fit inside the weapon's interval (fists 0.45 s, bat
## 0.7 s), so the rate of blows is unchanged.
const STRIKES := {
	"punch": {"windup": 0.12, "recover": 0.26},
	"bat": {"windup": 0.22, "recover": 0.38},
}
## How far a blow pushes someone back, metres (a step back, not a flight).
const KNOCK_BACK := {"punch": 0.4, "bat": 0.65, "shot": 0.12}
## Seconds the knock-back step takes.
const STAGGER_TIME := 0.22
## A person's half-width plus a margin: how close to a wall a knock-back may take their centre.
const BODY_CLEARANCE := 0.4


## The blow a melee weapon throws: the bat swings, anything else (fists, a gun up close) punches.
static func strike_kind(weapon: String) -> String:
	return "bat" if weapon == "bat" else "punch"


static func windup(kind: String) -> float:
	return float((STRIKES[kind] as Dictionary)["windup"])


static func recover(kind: String) -> float:
	return float((STRIKES[kind] as Dictionary)["recover"])


## How far someone at (x, z) can be pushed along the unit direction (dx, dz), up to `distance`,
## without their body entering a building, tree or vehicle (`CombatWorld.solid_distance`).
static func knock_back_room(world: CombatWorld, x: float, z: float, dx: float, dz: float, distance: float) -> float:
	if distance <= 0.0:
		return 0.0
	var solid: Variant = world.solid_distance(x, z, dx, dz, distance + BODY_CLEARANCE)
	if solid == null:
		return distance
	return maxf(0.0, minf(distance, float(solid) - BODY_CLEARANCE))
