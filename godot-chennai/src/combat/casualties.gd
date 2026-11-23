## The people the player has hit, by pedestrian id, and their timers (port of `Casualties` in
## `combat/src/PedestrianHits.ts`). States: stumbled, down, limping, dead.
class_name Casualties
extends RefCounted

const HIT := PedestrianHits.PEDESTRIAN_HIT

## id -> {id, state, time}
var _by_id: Dictionary = {}


func hit(id: int, outcome: String) -> void:
	var state := "stumbled" if outcome == "stumble" else ("down" if outcome == "injured" else "dead")
	_by_id[id] = {"id": id, "state": state, "time": 0.0}


func can_hit(id: int) -> bool:
	if not _by_id.has(id):
		return true
	var c: Dictionary = _by_id[id]
	if c["state"] == "stumbled":
		return float(c["time"]) >= float(HIT["stumble_grace"])
	return c["state"] == "limping"


func is_down(id: int) -> bool:
	var c: Dictionary = _by_id.get(id, {})
	var state: String = c.get("state", "")
	return state == "down" or state == "dead"


## The casualty {id, state, time}, or {}.
func get_casualty(id: int) -> Dictionary:
	return _by_id.get(id, {})


func list() -> Array:
	return _by_id.values()


func forget(id: int) -> void:
	_by_id.erase(id)


func clear() -> void:
	_by_id.clear()


## Advance the timers. `distance`: Callable(id) -> metres from the player. Returns changes
## [{id, type: getsUp | recovered | remove}].
func update(dt: float, distance: Callable) -> Array[Dictionary]:
	var changes: Array[Dictionary] = []
	for c: Dictionary in _by_id.values():
		var id: int = c["id"]
		c["time"] = float(c["time"]) + dt
		var t: float = c["time"]
		if c["state"] == "stumbled" and t >= float(HIT["stumble_grace"]):
			_by_id.erase(id)
		elif c["state"] == "down" and t >= float(HIT["injured_down"]):
			c["state"] = "limping"
			c["time"] = 0.0
			changes.append({"id": id, "type": "getsUp"})
		elif c["state"] == "limping" and t >= float(HIT["limp_for"]):
			_by_id.erase(id)
			changes.append({"id": id, "type": "recovered"})
		elif c["state"] == "dead" and t >= float(HIT["killed_stay"]) and (float(distance.call(id)) > float(HIT["remove_beyond"]) or t >= float(HIT["killed_max"])):
			_by_id.erase(id)
			changes.append({"id": id, "type": "remove"})
	return changes
