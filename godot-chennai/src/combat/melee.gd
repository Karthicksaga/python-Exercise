## The fighting system's numbers and small rules (port of `combat/src/Melee.ts`, the 22 Nov
## 2026 redesign, TD-27): the punch combo, how hard a hit knocks someone, block and dodge, the
## lock-on target, what a hit does to a pedestrian, and how enemies share the attacking.
## Game-design estimates.
class_name Melee
extends RefCounted

const COMBAT_FEEL := {
	"combo_window": 0.7,
	"combo": {"jab": 1.0, "cross": 1.0, "hook": 1.4},
	"light": {"stun": 0.35, "knock": 0.25},
	"heavy": {"stun": 0.9, "knock": 1.3},
	"heavy_from": 45.0,
	"block_share": 0.2,
	"dodge_for": 0.35,
	"dodge_every": 0.8,
	"dodge_distance": 2.6,
	"windup": 0.4,
	"attackers": 2,
	"circle_at": 3.6,
	"circle_speed": 1.5,
	"gunman_space": 4.5,
	"strafe_speed": 1.6,
	"retreat_below": 0.3,
	"retreat_for": 3.0,
	"lock_range": 12.0,
	"lock_arc": 1.9,
	"lock_keep": 15.0,
	"lock_switch_within": 2.2,
	"civilian_health": 60.0,
}


## Which punch a swing is, given the last one and the seconds since it.
static func next_combo_move(last: String, since_last: float) -> String:
	if last == "" or since_last > float(COMBAT_FEEL["combo_window"]):
		return "jab"
	if last == "jab":
		return "cross"
	if last == "cross":
		return "hook"
	return "jab"


## {stun, knock, heavy} for a hit of this damage; `move` a combo punch, "bat", or "".
static func hit_reaction(damage: float, move: String = "") -> Dictionary:
	var heavy := move == "hook" or move == "bat" or damage >= float(COMBAT_FEEL["heavy_from"])
	var feel: Dictionary = COMBAT_FEEL["heavy"] if heavy else COMBAT_FEEL["light"]
	return {"stun": feel["stun"], "knock": feel["knock"], "heavy": heavy}


## A pedestrian hit: {health, outcome} with outcome flinch, stumble, injured (knocked out by
## fists or the bat: down, then up and limping) or killed (guns).
static func attack_outcome(health: float, damage: float, weapon: String) -> Dictionary:
	var left := maxf(0.0, health - damage)
	if left > 0.0:
		var heavy: bool = hit_reaction(damage, "bat" if weapon == "bat" else "")["heavy"]
		return {"health": left, "outcome": "stumble" if heavy else "flinch"}
	var melee := weapon == "fists" or weapon == "bat"
	return {"health": 0.0, "outcome": "injured" if melee else "killed"}


## The enemy the player's attacks turn to (port of `chooseLock`). `candidates`: [{id, x, z}];
## `current`: the locked id or -1; `sees`: Callable(candidate) -> bool. Returns an id or -1.
static func choose_lock(px: float, pz: float, heading: float, candidates: Array, current: int, sees: Callable) -> int:
	var kept: Dictionary = {}
	if current >= 0:
		for c: Dictionary in candidates:
			if int(c["id"]) == current:
				kept = c
				break
	var kept_at := RulesMath.hypot(float(kept["x"]) - px, float(kept["z"]) - pz) if not kept.is_empty() else INF
	for c: Dictionary in candidates:
		var d := RulesMath.hypot(float(c["x"]) - px, float(c["z"]) - pz)
		if int(c["id"]) != current and d <= float(COMBAT_FEEL["lock_switch_within"]) and d < kept_at - 1.5 and sees.call(c):
			return c["id"]
	if not kept.is_empty() and kept_at <= float(COMBAT_FEEL["lock_keep"]) and sees.call(kept):
		return kept["id"]
	var best := -1
	var best_score := INF
	for c: Dictionary in candidates:
		var distance := RulesMath.hypot(float(c["x"]) - px, float(c["z"]) - pz)
		if distance > float(COMBAT_FEEL["lock_range"]) or distance < 0.2:
			continue
		var off := RulesMath.angle_between(atan2(-(float(c["x"]) - px), -(float(c["z"]) - pz)), heading)
		if off > float(COMBAT_FEEL["lock_arc"]):
			continue
		var score := distance + off * 2.5
		if score < best_score and sees.call(c):
			best = c["id"]
			best_score = score
	return best


## Which melee enemies may attack now: those already attacking (while within 8 m), then the
## nearest, up to `attackers`. `fighters`: [{id, distance}]; `current`: set (id -> true).
static func choose_attackers(fighters: Array, current: Dictionary) -> Dictionary:
	var chosen := {}
	var by_distance := RulesMath.stable_sorted(fighters, func(a: Dictionary, b: Dictionary) -> bool: return float(a["distance"]) < float(b["distance"]))
	var cap: int = COMBAT_FEEL["attackers"]
	for f: Dictionary in by_distance:
		if current.has(f["id"]) and float(f["distance"]) < 8.0 and chosen.size() < cap:
			chosen[f["id"]] = true
	for f: Dictionary in by_distance:
		if chosen.size() < cap:
			chosen[f["id"]] = true
	return chosen
