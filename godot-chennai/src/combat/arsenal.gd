## The player's weapons (port of `Arsenal` in `combat/src/Weapons.ts`): owned weapons, rounds per
## gun, the gun in hand and the time to the next shot or swing. Saved as {owned, ammo, gun}
## (`cow-weapons-v1`).
class_name Arsenal
extends RefCounted

var _owned: Array[String] = ["fists", "pistol"]
var _rounds: Dictionary = {}
var _current := "pistol"
var _gun_cooldown := 0.0
var _melee_cooldown := 0.0


func has(id: String) -> bool:
	return _owned.has(id)


## The gun in hand (spec).
func gun() -> Dictionary:
	return Weapons.spec(_current)


## What HIT swings: the bat once owned.
func melee() -> Dictionary:
	return Weapons.spec("bat") if _owned.has("bat") else Weapons.spec("fists")


func ammo_of(id: String) -> int:
	return _rounds.get(id, 0)


func set_ammo(id: String, rounds: float) -> void:
	_rounds[id] = maxi(0, mini(int(Weapons.spec(id)["max_ammo"]), floori(rounds)))


## Add a weapon (or rounds for one owned). Returns the rounds actually added. `rounds` < 0: a clip.
func give(id: String, rounds: int = -1) -> int:
	if not _owned.has(id):
		_owned.append(id)
	var w := Weapons.spec(id)
	if w["kind"] == "melee":
		return 0
	var before := ammo_of(id)
	set_ammo(id, before + (int(w["clip"]) if rounds < 0 else rounds))
	return ammo_of(id) - before


## Guns owned, in button order.
func guns() -> Array[String]:
	var out: Array[String] = []
	for id in Weapons.GUNS:
		if _owned.has(id):
			out.append(id)
	return out


## Seconds until the next swing may land (0: ready).
func melee_ready_in() -> float:
	return _melee_cooldown


## Next owned gun; a short pause before it fires stops switching beating the fire rate.
func cycle() -> String:
	var list := guns()
	var at := list.find(_current)
	_current = list[(at + 1) % list.size()] if list.size() > 0 else "pistol"
	_gun_cooldown = maxf(_gun_cooldown, 0.25)
	return _current


func select(id: String) -> bool:
	if not _owned.has(id) or not Weapons.is_gun(id):
		return false
	_current = id
	return true


func tick(dt: float) -> void:
	_gun_cooldown = maxf(0.0, _gun_cooldown - dt)
	_melee_cooldown = maxf(0.0, _melee_cooldown - dt)


## Fire the gun in hand if ready and loaded (one round). Returns its spec, or {} for no shot.
func try_fire() -> Dictionary:
	var g := gun()
	if _gun_cooldown > 0.0 or ammo_of(g["id"]) <= 0:
		return {}
	_gun_cooldown = g["interval"]
	_rounds[g["id"]] = ammo_of(g["id"]) - 1
	return g


## Swing or punch if recovered. Returns the spec, or {}.
func try_swing() -> Dictionary:
	if _melee_cooldown > 0.0:
		return {}
	var m := melee()
	_melee_cooldown = m["interval"]
	return m


func save() -> Dictionary:
	var ammo := {}
	for id in Weapons.GUNS:
		if ammo_of(id) > 0:
			ammo[id] = ammo_of(id)
	return {"owned": _owned.duplicate(), "ammo": ammo, "gun": _current}


## Restore a save; anything unknown or damaged is ignored.
func load_save(data: Variant) -> void:
	reset()
	if not (data is Dictionary):
		return
	var d: Dictionary = data
	var owned: Variant = d.get("owned")
	if owned is Array:
		for id: Variant in owned:
			if Weapons.is_weapon(id) and not _owned.has(str(id)):
				_owned.append(str(id))
	var ammo_value: Variant = d.get("ammo")
	if ammo_value is Dictionary:
		var ammo: Dictionary = ammo_value
		for id: Variant in ammo:
			var rounds: Variant = ammo[id]
			if Weapons.is_weapon(id) and (rounds is int or rounds is float):
				set_ammo(str(id), rounds)
	if Weapons.is_weapon(d.get("gun")):
		select(str(d["gun"]))


func reset() -> void:
	_owned = ["fists", "pistol"]
	_rounds.clear()
	_current = "pistol"
	_gun_cooldown = 0.0
	_melee_cooldown = 0.0
