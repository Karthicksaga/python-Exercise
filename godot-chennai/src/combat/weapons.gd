## The weapon table (port of `combat/src/Weapons.ts`): what each weapon does. Game-design
## estimates, chosen so each weapon has a clear role against 100-health enemies; none is a
## measured real-world figure. A spec is a Dictionary with the keys below.
class_name Weapons
extends RefCounted

const IDS: Array[String] = ["fists", "bat", "pistol", "shotgun", "smg"]
## Guns in the order the weapon button cycles through them.
const GUNS: Array[String] = ["pistol", "shotgun", "smg"]

const TABLE := {
	# Punch 34, 1.9 m, 0.45 s (the values from before there was a weapon table).
	"fists": {"id": "fists", "name": "Fists", "kind": "melee", "damage": 34.0, "range": 1.9, "interval": 0.45, "pellets": 1, "spread": 0.0, "aim_assist": 1.2, "falloff_from": 1.0, "falloff_to": 1.0, "max_ammo": 0, "clip": 0, "price": 0},
	# A cricket bat: two swings knock someone down.
	"bat": {"id": "bat", "name": "Cricket bat", "kind": "melee", "damage": 50.0, "range": 2.3, "interval": 0.7, "pellets": 1, "spread": 0.0, "aim_assist": 1.2, "falloff_from": 1.0, "falloff_to": 1.0, "max_ammo": 0, "clip": 0, "price": 300},
	"pistol": {"id": "pistol", "name": "Pistol", "kind": "gun", "damage": 34.0, "range": 45.0, "interval": 0.32, "pellets": 1, "spread": 0.0, "aim_assist": 0.5, "falloff_from": 1.0, "falloff_to": 1.0, "max_ammo": 150, "clip": 24, "price": 1500},
	# Six pellets of 20, full damage to 5 m, 40% at 14 m.
	"shotgun": {"id": "shotgun", "name": "Shotgun", "kind": "gun", "damage": 20.0, "range": 14.0, "interval": 0.95, "pellets": 6, "spread": 0.13, "aim_assist": 0.4, "falloff_from": 5.0 / 14.0, "falloff_to": 0.4, "max_ammo": 40, "clip": 10, "price": 3500},
	# About eleven rounds a second of 14, each straying up to 4 degrees.
	"smg": {"id": "smg", "name": "SMG", "kind": "gun", "damage": 14.0, "range": 30.0, "interval": 0.09, "pellets": 1, "spread": 0.07, "aim_assist": 0.45, "falloff_from": 0.5, "falloff_to": 0.6, "max_ammo": 360, "clip": 90, "price": 5000},
}


static func spec(id: String) -> Dictionary:
	return TABLE[id]


static func is_weapon(id: Variant) -> bool:
	return (id is String or id is StringName) and TABLE.has(str(id))


static func is_gun(id: String) -> bool:
	return TABLE.has(id) and TABLE[id]["kind"] == "gun"


## Share of the damage that lands at a distance: 1 near, down to `falloff_to` at the range, 0 beyond.
static func damage_factor(w: Dictionary, distance: float) -> float:
	var r: float = w["range"]
	if distance > r:
		return 0.0
	var full: float = r * float(w["falloff_from"])
	if distance <= full:
		return 1.0
	var t := (distance - full) / maxf(1e-6, r - full)
	return 1.0 + (float(w["falloff_to"]) - 1.0) * t


## Damage of one hit (one pellet) at a distance, in whole health points.
static func hit_damage(w: Dictionary, distance: float) -> int:
	return RulesMath.js_round_int(float(w["damage"]) * damage_factor(w, distance))


## A pellet's direction: the aim plus a stray within the spread. `roll` in [0, 1).
static func stray_angle(w: Dictionary, aim: float, roll: float) -> float:
	return aim + (roll * 2.0 - 1.0) * float(w["spread"])
