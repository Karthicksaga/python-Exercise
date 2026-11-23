## Shared pieces of the combat tests (the TS tests' `open`, `walled`, `player`, `run`, `rolls`).
extends "res://tests/rules/rules_test.gd"

const PS := Combat.PlayerState


func open() -> CombatWorld:
	return CombatWorld.new()


func walled() -> CombatWorld:
	return CombatWorld.make(
		func(_a: float, _b: float, _c: float, _d: float) -> bool: return false,
		func(_x: float, _z: float, _dx: float, _dz: float, _m: float) -> Variant: return 6.0,
		func(_x: float, _z: float, _dx: float, _dz: float, _m: float) -> Variant: return 6.0)


## A world with a custom solid_distance (walls for walking and knock-back).
func with_solid(fn: Callable) -> CombatWorld:
	return CombatWorld.make(Callable(), Callable(), fn)


## Player at (x, z) facing `heading` (0 = north, -Z). Options: in_vehicle, speed, armed, blocking.
func player(opts: Dictionary = {}) -> Combat.PlayerState:
	var p := PS.make(opts.get("x", 0.0), opts.get("z", 0.0), opts.get("heading", 0.0))
	p.in_vehicle = opts.get("in_vehicle", false)
	p.speed = opts.get("speed", 0.0)
	p.armed = opts.get("armed", false)
	p.blocking = opts.get("blocking", false)
	return p


## A constant random source.
func always(v: float) -> Callable:
	return func() -> float: return v


## Values in turn, then the last one repeated.
func rolls(values: Array) -> Callable:
	var i := [0]
	return func() -> float:
		var v: float = values[mini(i[0], values.size() - 1)]
		i[0] += 1
		return v


## Run for `seconds` in 1/60 s steps (`Math.round(seconds * 60)` steps).
func step(combat: Combat, seconds: float, p: Combat.PlayerState = null) -> Array:
	if p == null:
		p = player()
	var events: Array = []
	for i in roundi(seconds * 60.0):
		events.append_array(combat.update(1.0 / 60.0, p))
	return events


## Combat.test.ts's `run`: `for (i = 0; i < seconds * 60; i++)`.
func run(combat: Combat, seconds: float, p: Combat.PlayerState) -> Array:
	var events: Array = []
	var i := 0
	while i < seconds * 60.0:
		events.append_array(combat.update(1.0 / 60.0, p))
		i += 1
	return events


func spot(x: float, z: float, armed: bool, health: float = 0.0, weapon: String = "") -> EnemySpot:
	return EnemySpot.make(x, z, armed, health, weapon)


func calm_spot(x: float, z: float, armed: bool, weapon: String = "", tint: int = -1) -> EnemySpot:
	var s := EnemySpot.make(x, z, armed, 0.0, weapon)
	s.calm = true
	s.tint = tint
	return s


func has_type(events: Array, t: String) -> bool:
	return types(events).has(t)


func count_type(events: Array, t: String) -> int:
	return types(events).count(t)
