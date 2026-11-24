## Carjacking rules (port of `ai/src/Carjack.ts`, TD-30 on `agent/carjacking`): which AI traffic
## vehicle the player on foot can take, and which of the few spare drivable vehicles stands in for
## it. The crime is `Wanted` "carjacking". Game-design estimates.
class_name Carjack
extends RefCounted

## Traffic kinds that can be taken (buses and ambulances cannot).
const KINDS: Array[String] = ["car", "auto", "bike"]
## Only slower than this, m/s (stopped at a light, in a jam, or braking for the player).
const MAX_SPEED := 1.2
## A moving traffic vehicle can be taken over (the TAKE OVER button) up to this speed, m/s
## (about 40 km/h: the owner's report, G-300). It is stopped dead when the driver is pulled off.
const MAX_TAKE_SPEED := 11.0
## Metres from the vehicle's body the player may stand.
const REACH := 2.6
## Spare drivable vehicles kept per kind.
const PER_KIND := 2


static func carjackable(kind: String, speed: float, max_speed: float = MAX_SPEED) -> bool:
	return KINDS.has(kind) and absf(speed) < max_speed


## Why a vehicle ({kind, speed}) cannot be taken over, "" when it can: "kind" (buses and
## ambulances carry passengers or crews), "fast" (faster than `MAX_TAKE_SPEED`).
static func refusal(kind: String, speed: float) -> String:
	if not KINDS.has(kind):
		return "kind"
	if absf(speed) >= MAX_TAKE_SPEED:
		return "fast"
	return ""


## Distance from (px, pz) to a vehicle's rectangle ({x, z, heading, half_width, half_length}),
## 0 inside it.
static func distance_to_footprint(px: float, pz: float, v: Dictionary) -> float:
	var rx := px - float(v["x"])
	var rz := pz - float(v["z"])
	var h: float = v["heading"]
	var along := -(rx * sin(h) + rz * cos(h))
	var across := rx * cos(h) - rz * sin(h)
	var dz := maxf(0.0, absf(along) - float(v["half_length"]))
	var dx := maxf(0.0, absf(across) - float(v["half_width"]))
	return RulesMath.hypot(dx, dz)


## The nearest takeable vehicle ({id, kind, x, z, heading, speed, half_width, half_length})
## within reach of (x, z), or {}.
static func pick(x: float, z: float, vehicles: Array, reach: float = REACH, max_speed: float = MAX_SPEED) -> Dictionary:
	var best: Dictionary = {}
	var best_distance := reach
	for v: Dictionary in vehicles:
		if not carjackable(v["kind"], v["speed"], max_speed):
			continue
		var d := distance_to_footprint(x, z, v)
		if d <= best_distance:
			best = v
			best_distance = d
	return best


## Which spare stands in: a free one of the same kind and colour, else "new" while the kind has
## fewer than `per_kind`, else the free one of that kind handed out longest ago. Slots are
## {kind, color, free, used_at}. Returns the index, or -1 for "new".
static func choose_slot(slots: Array, kind: String, color: int, per_kind: int = PER_KIND) -> int:
	for i in slots.size():
		var s: Dictionary = slots[i]
		if s["free"] and s["kind"] == kind and int(s["color"]) == color:
			return i
	var of_kind := 0
	for s: Dictionary in slots:
		if s["kind"] == kind:
			of_kind += 1
	if of_kind < per_kind:
		return -1
	var oldest := -1
	for i in slots.size():
		var s: Dictionary = slots[i]
		if s["kind"] == kind and s["free"] and (oldest < 0 or float(s["used_at"]) < float(slots[oldest]["used_at"])):
			oldest = i
	return oldest
