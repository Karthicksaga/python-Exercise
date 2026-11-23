## Where an enemy stands when its group is placed (port of `EnemySpot` in `combat/src/Combat.ts`).
class_name EnemySpot
extends RefCounted

var x := 0.0
var z := 0.0
## Armed enemies shoot from a distance; unarmed ones close in and punch.
var armed := false
## 0: the default (100).
var health := 0.0
## What they carry ("" for the default: the pistol when armed, else fists).
var weapon := ""
## Clothing tint (a gang's colours); -1 for the default enemy colours.
var tint := -1
## Gang members on their corner: they ignore the player until provoked (`Gangs`).
var calm := false


static func make(px: float, pz: float, is_armed: bool, hp: float = 0.0, carries: String = "") -> EnemySpot:
	var s := EnemySpot.new()
	s.x = px
	s.z = pz
	s.armed = is_armed
	s.health = hp
	s.weapon = carries
	return s


static func from_dict(d: Dictionary) -> EnemySpot:
	var s := make(float(d.get("x", 0.0)), float(d.get("z", 0.0)), bool(d.get("armed", false)), float(d.get("health", 0.0)), str(d.get("weapon", "")))
	s.tint = int(d.get("tint", -1))
	s.calm = bool(d.get("calm", false))
	return s
