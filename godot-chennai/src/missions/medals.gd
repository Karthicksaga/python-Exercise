## Bonus goals and medals (G-142). A mission lists up to 3 optional goals; the medal is how many
## were met: all gold, at least half silver, otherwise bronze (a stage with goals always earns at
## least bronze for finishing). Retrying from a checkpoint caps the medal at silver.
class_name Medals
extends RefCounted

const NONE := ""
const BRONZE := "bronze"
const SILVER := "silver"
const GOLD := "gold"
const RANK := {"": 0, "bronze": 1, "silver": 2, "gold": 3}
const MAX_GOALS := 3


## Whether one goal {id, kind, value} was met by `stats`.
static func met(goal: Dictionary, stats: MissionStats) -> bool:
	var value := float(goal.get("value", 0.0))
	match str(goal.get("kind", "")):
		"no_damage":
			return stats.damage_taken == 0
		"par_time":
			return stats.seconds <= value
		"time_left":
			return stats.seconds_left >= value
		"no_police":
			return stats.max_wanted == 0
		"cargo":
			return stats.stability_lowest >= value
		"quiet_zone":
			return stats.horns_in_quiet_zone == 0
		"no_suspicion":
			return stats.suspicion_peak <= value
		"no_retry":
			return stats.retries == 0
	return false


## {met: [goal ids], medal}. A mission with no goals gives no medal.
static func evaluate(goals: Array, stats: MissionStats) -> Dictionary:
	var done: Array[String] = []
	var n := mini(goals.size(), MAX_GOALS)
	for i in n:
		var g: Dictionary = goals[i]
		if met(g, stats):
			done.append(str(g.get("id", i)))
	if n == 0:
		return {"met": done, "medal": NONE}
	var medal := BRONZE
	if done.size() == n:
		medal = GOLD
	elif float(done.size()) / float(n) >= 0.5:
		medal = SILVER
	if stats.retries > 0 and RANK[medal] > RANK[SILVER]:
		medal = SILVER
	return {"met": done, "medal": medal}


## The better of two medals (a replay never lowers one).
static func best(a: String, b: String) -> String:
	return a if int(RANK.get(a, 0)) >= int(RANK.get(b, 0)) else b
