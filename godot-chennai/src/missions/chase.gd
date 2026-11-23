## Rules for a chase objective (port of `missions/src/chase.ts`): where the quarry is after some
## distance along its path, and how fast it goes. Path points are Dictionaries {x, z} (doubles:
## Vector2 is 32-bit and would change the numbers).
class_name Chase
extends RefCounted

## Beyond this gap (m) the quarry eases off, so a player who fell behind can catch up (estimate).
const EASE_GAP := 60.0
## Speed while easing off, as a fraction of its own (estimate).
const EASE := 0.55
## Closer than this the quarry bursts away...
const BURST_GAP := 15.0
## ...at this fraction of its own speed (estimate).
const BURST := 1.12


static func path_length(path: Array) -> float:
	var total := 0.0
	for i in range(1, path.size()):
		total += RulesMath.hypot(float(path[i]["x"]) - float(path[i - 1]["x"]), float(path[i]["z"]) - float(path[i - 1]["z"]))
	return total


## The point `distance` metres along the path (clamped), with its heading: {x, z, heading};
## heading 0 = north (-Z), positive turning left.
static func point_along(path: Array, distance: float) -> Dictionary:
	var left := maxf(0.0, distance)
	for i in range(1, path.size()):
		var ax: float = path[i - 1]["x"]
		var az: float = path[i - 1]["z"]
		var bx: float = path[i]["x"]
		var bz: float = path[i]["z"]
		var length := RulesMath.hypot(bx - ax, bz - az)
		var heading := atan2(-(bx - ax), -(bz - az))
		if left <= length or i == path.size() - 1:
			var t := minf(1.0, left / length) if length > 0.0 else 1.0
			return {"x": ax + (bx - ax) * t, "z": az + (bz - az) * t, "heading": heading}
		left -= length
	if path.is_empty():
		return {"x": 0.0, "z": 0.0, "heading": 0.0}
	return {"x": float(path[0]["x"]), "z": float(path[0]["z"]), "heading": 0.0}


## The quarry's speed with the player `gap` metres away.
static func quarry_speed(speed: float, gap: float) -> float:
	if gap > EASE_GAP:
		return speed * EASE
	if gap < BURST_GAP:
		return speed * BURST
	return speed
