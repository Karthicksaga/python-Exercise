## Rival gangs' rules (port of `combat/src/Gangs.ts`): when a calm crew on its corner turns on
## the player, and which crews are on the street at once. Distances and times are estimates.
class_name Gangs
extends RefCounted

const GANG_RULES := {
	"gunshot_alarm": 22.0,
	"linger_range": 7.0,
	"linger_time": 4.0,
	"linger_cool_rate": 0.5,
	"warn_at": 1.5,
	"field_range": 110.0,
	"leave_range": 160.0,
	"max_crews": 2,
	"regroup_time": 180.0,
}


## One step of a calm member's unease about an armed player nearby: {unease, provoked}.
static func linger_step(unease: float, distance: float, armed: bool, dt: float) -> Dictionary:
	if armed and distance <= float(GANG_RULES["linger_range"]):
		var next := unease + dt
		return {"unease": next, "provoked": next >= float(GANG_RULES["linger_time"])}
	return {"unease": maxf(0.0, unease - dt * float(GANG_RULES["linger_cool_rate"])), "provoked": false}


## A gunshot at (sx, sz) is close enough to alarm someone at (x, z).
static func hears_gunshot(x: float, z: float, sx: float, sz: float) -> bool:
	return RulesMath.hypot(x - sx, z - sz) <= float(GANG_RULES["gunshot_alarm"])


## Which crews ([{id, x, z}]) should be on the street: those out stay until past `leave_range`,
## others come out within `field_range`, nearest first, up to `max_crews`; regrouping crews stay
## off. `out` and `regrouping` are sets (id -> true).
static func crews_to_field(crews: Array, x: float, z: float, out: Dictionary, regrouping: Dictionary, max_crews: int = GANG_RULES["max_crews"]) -> Array[String]:
	var dist := func(c: Dictionary) -> float: return RulesMath.hypot(float(c["x"]) - x, float(c["z"]) - z)
	var closer := func(a: Dictionary, b: Dictionary) -> bool: return dist.call(a) < dist.call(b)
	var keep: Array = []
	var fresh: Array = []
	for c: Dictionary in crews:
		if out.has(c["id"]) and not regrouping.has(c["id"]) and dist.call(c) <= float(GANG_RULES["leave_range"]):
			keep.append(c)
		if not out.has(c["id"]) and not regrouping.has(c["id"]) and dist.call(c) <= float(GANG_RULES["field_range"]):
			fresh.append(c)
	var chosen: Array[String] = []
	for c: Dictionary in RulesMath.stable_sorted(keep, closer).slice(0, max_crews):
		chosen.append(c["id"])
	for c: Dictionary in RulesMath.stable_sorted(fresh, closer):
		if chosen.size() >= max_crews:
			break
		chosen.append(c["id"])
	return chosen
