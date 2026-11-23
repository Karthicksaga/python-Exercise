## Weapons lying in the world (port of `combat/src/Pickups.ts`): walk over one on foot to take
## it; a taken pickup comes back after a while. Spots are Dictionaries {id, weapon, ammo, x, z}.
class_name WeaponPickups
extends RefCounted

## Metres: about an arm's reach and a step (estimate).
const PICKUP_RADIUS := 1.6
## Game seconds before a taken pickup is back (estimate).
const PICKUP_RESPAWN := 240.0

var spots: Array
var _away: Dictionary = {}


func _init(spot_list: Array) -> void:
	spots = spot_list


func available(id: String) -> bool:
	return not _away.has(id)


## Advance by `dt`; a player on foot at (x, z) takes any pickup in reach. Returns those taken.
func update(dt: float, x: float, z: float, on_foot: bool) -> Array[Dictionary]:
	for id: String in _away.keys():
		var left: float = float(_away[id]) - dt
		if left <= 0.0:
			_away.erase(id)
		else:
			_away[id] = left
	var taken: Array[Dictionary] = []
	if not on_foot:
		return taken
	for s: Dictionary in spots:
		if _away.has(s["id"]) or RulesMath.hypot(float(s["x"]) - x, float(s["z"]) - z) > PICKUP_RADIUS:
			continue
		_away[s["id"]] = PICKUP_RESPAWN
		taken.append(s)
	return taken


func reset() -> void:
	_away.clear()
