class_name CombatFx
extends RefCounted
## The combat wiring's only door to the visuals agent's work (docs/handoff.md, "Combat in play"):
## strike and carry poses on the figures, hit puffs, weapon models in hand. Everything is looked
## up by name and called only when it exists, so the game runs (without those visuals) before
## `agent/godot-combat-visuals` is merged, and nothing here depends on its file paths.

static var _classes: Dictionary = {}
static var _looked := false


## The script of a global class by name, or null when the project has none.
static func script_of(name: StringName) -> Script:
	if not _looked:
		_looked = true
		for c: Dictionary in ProjectSettings.get_global_class_list():
			_classes[StringName(str(c["class"]))] = str(c["path"])
	if not _classes.has(name):
		return null
	return load(str(_classes[name])) as Script


## A new instance of a class by name (a node or a RefCounted), or null.
static func make(name: StringName) -> Object:
	var s := script_of(name)
	if s == null or not s.can_instantiate():
		return null
	return s.call(&"new") as Object


## A blow on a figure: &"jab", &"cross", &"hook" (fists) or &"bat"; `side` 1 the right hand,
## 0 the left. False when the figure cannot draw it.
static func strike(figure: Object, kind: StringName, side: int = 1) -> bool:
	if figure == null or not figure.has_method(&"play_strike"):
		return false
	figure.call(&"play_strike", kind, side)
	return true


## A figure reels from a blow struck from `from` (scene point).
static func flinch(figure: Object, from: Vector3, strength: float) -> bool:
	if figure == null or not figure.has_method(&"play_flinch"):
		return false
	figure.call(&"play_flinch", from, strength)
	return true


## The figure's blow is drawn; drop it (knocked out, into a vehicle).
static func cancel(figure: Object) -> void:
	if figure != null and figure.has_method(&"cancel_strike"):
		figure.call(&"cancel_strike")


static func striking(figure: Object) -> bool:
	return figure != null and figure.has_method(&"is_striking") and bool(figure.call(&"is_striking"))


static func carry(figure: Object, on: bool, kind: StringName = &"box") -> bool:
	if figure == null or not figure.has_method(&"carry"):
		return false
	figure.call(&"carry", on, kind)
	return true


## The puffs' frame (their owner advances them).
static func advance(puffs: Object, dt: float) -> void:
	if puffs != null and puffs.has_method(&"advance"):
		puffs.call(&"advance", dt)


## A weapon's shared mesh (a pickup lying in the street), or null.
static func weapon_mesh(weapon: StringName) -> Mesh:
	var s := script_of(&"WeaponModels")
	if s == null or not _has_static(s, &"mesh"):
		return null
	return s.call(&"mesh", weapon) as Mesh


## A puff where a blow lands; `puffs` is the HitPuffs node (or null).
static func puff(puffs: Object, at: Vector3, normal: Vector3, strength: float) -> bool:
	if puffs == null or not puffs.has_method(&"spawn"):
		return false
	puffs.call(&"spawn", at, normal, strength)
	return true


## The weapon in a figure's hand (&"" takes it away). False when the models are not there.
static func hold(figure: Node3D, weapon: StringName) -> bool:
	var s := script_of(&"WeaponModels")
	# Only the people's figures (`CombatFigure`) hold weapons.
	if s == null or figure == null or not figure.has_method(&"play_strike"):
		return false
	if weapon == &"":
		if _has_static(s, &"detach"):
			s.call(&"detach", figure)
			return true
		return false
	if not _has_static(s, &"attach"):
		return false
	s.call(&"attach", figure, weapon)
	return true


static func _has_static(s: Script, method: StringName) -> bool:
	for m: Dictionary in s.get_script_method_list():
		if StringName(str(m["name"])) == method:
			return true
	return false
