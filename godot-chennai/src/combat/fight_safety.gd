## Children are never in a fight (AGENTS.md, brief §6; G-415). Pure rules the game applies:
## - **Never a target.** Only adults are handed to `Combat` as civilians (`adults_only`), so no
##   punch, bat or shot can land on a child; the people manifest's minors (`child`, age child or
##   teen) are filtered out by id before anything else.
## - **Never near a fight.** Wherever a fight is on (an enemy who is not calm, a police officer on
##   foot, a shot fired in the last few seconds), children are kept `CHILD_CLEAR` metres away:
##   the crowd's children inside that ring are not placed or drawn until it is over.
## Distances are game-design estimates (a fight's reach plus the gun's sound, with room to spare).
class_name FightSafety
extends RefCounted

## Metres round a fight inside which no child is shown.
const CHILD_CLEAR := 45.0
## A shot keeps its spot "a fight" for this many seconds.
const SHOT_MEMORY := 8.0


## The points (x, z) where a fight is on now: every enemy standing who is not calm, and the
## shots fired recently (`shots`: [x, z, seconds since] per shot).
static func fight_points(combat: Combat, shots: PackedVector3Array = PackedVector3Array()) -> PackedVector2Array:
	var out := PackedVector2Array()
	if combat != null:
		for e in combat.enemies:
			if e.health > 0.0 and not e.calm:
				out.append(Vector2(e.x, e.z))
	for s in shots:
		if s.z < SHOT_MEMORY:
			out.append(Vector2(s.x, s.y))
	return out


## Whether a child may be at `at` (world metres) with fights at `points`.
static func child_allowed(at: Vector2, points: PackedVector2Array) -> bool:
	var r2 := CHILD_CLEAR * CHILD_CLEAR
	for p in points:
		if p.distance_squared_to(at) < r2:
			return false
	return true


## The civilians (`[{id, x, z, person}]`) that may be hit: never anyone whose person id is a minor
## (`minors`: person id -> true), never an entry without a person id.
static func adults_only(people: Array[Dictionary], minors: Dictionary) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	for p in people:
		var who := str(p.get("person", ""))
		if who == "" or minors.has(who):
			continue
		out.append(p)
	return out
