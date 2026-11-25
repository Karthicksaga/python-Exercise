class_name CombatFx
extends RefCounted
## The combat wiring's calls into the fight's visuals (`agent/godot-combat-visuals`, G-430…G-435):
## strike, flinch and carry poses on `CombatFigure`s, `HitPuffs`, `WeaponModels` in hand. Only null
## checks here (a figure whose model is not loaded, no puffs in a headless rules test), so the
## wiring reads the same with and without models.


## A blow on a figure: &"jab", &"cross", &"hook" (fists) or &"bat"; `side` 1 the right hand.
static func strike(figure: CombatFigure, kind: StringName, side: int = 1) -> bool:
	if figure == null or figure.poser == null:
		return false
	figure.play_strike(kind, side)
	return true


## A figure reels from a blow struck from `from` (scene point).
static func flinch(figure: CombatFigure, from: Vector3, strength: float) -> void:
	if figure != null and figure.poser != null:
		figure.play_flinch(from, strength)


## Drop a blow that has not finished (knocked out, into a vehicle).
static func cancel(figure: CombatFigure) -> void:
	if figure != null:
		figure.cancel_strike()


static func striking(figure: CombatFigure) -> bool:
	return figure != null and figure.is_striking()


static func carry(figure: CombatFigure, on: bool, kind: StringName = &"box") -> void:
	if figure != null and figure.poser != null:
		figure.carry(on, kind)


## A puff where a blow lands (`puffs` null: none drawn).
static func puff(puffs: HitPuffs, at: Vector3, normal: Vector3, strength: float) -> void:
	if puffs != null:
		puffs.spawn(at, normal, strength)


## The weapon in a figure's hand (&"" takes it away).
static func hold(figure: CombatFigure, weapon: StringName) -> void:
	if figure == null or figure.poser == null:
		return
	if weapon == &"":
		WeaponModels.detach(figure)
	elif WeaponModels.held(figure) != weapon:
		WeaponModels.attach(figure, weapon)
