## Fighting rules (port of `combat/src/Combat.ts` from the TD-27 combat redesign, plus `hurt`
## from TD-29): the player's health and weapons, punches (the jab-cross-hook combo), shots, block
## and dodge, and enemies that notice the player, close in, wind up, strafe, circle, retreat and
## attack. Pure logic: the world answers `CombatWorld`'s questions, the game draws the events.
##
## Events are Dictionaries in the TS shapes ({type: "enemyHit", enemy, damage, heavy, weapon},
## ...); every one is also emitted as `combat_event`. `random` is injectable (a SeededRandom or
## a Callable) so tests are exact; the game passes its own seeded source.
class_name Combat
extends RefCounted

signal combat_event(event: Dictionary)

## How enemies use each gun (estimates; the pistol keeps the values from before).
const ENEMY_GUNS := {
	"pistol": {"damage": 7.0, "range": 22.0, "interval": 1.5, "accuracy": 0.45},
	"shotgun": {"damage": 15.0, "range": 11.0, "interval": 2.2, "accuracy": 0.6},
	"smg": {"damage": 4.0, "range": 20.0, "interval": 0.55, "accuracy": 0.3},
}
## An enemy's punch or bat swing.
const ENEMY_MELEE := {"fists": 6.0, "bat": 10.0}
const BODY_HALF_WIDTH := 0.35
const BODY_DEPTH := 0.45
const PLAYER_MAX_HEALTH := 100.0
const ENEMY_HEALTH := 100.0
const ENEMY_NOTICE := 28.0
const ENEMY_SPEED := 3.4
const WALL_LOOKAHEAD := 0.9
const ENEMY_PUNCH_RANGE := 1.7
const REGEN_DELAY := 6.0
const REGEN_RATE := 7.0
const RUN_OVER_SPEED := 4.0
const DOWN_TIME := 5.0
const FEEL := Melee.COMBAT_FEEL


class Enemy:
	var id := 0
	var group := ""
	var armed := false
	var max_health := 100.0
	var weapon := "fists"
	var tint := -1
	var calm := false
	var unease := 0.0
	var x := 0.0
	var z := 0.0
	## Radians, 0 = towards -Z (north), positive turning left.
	var heading := 0.0
	var health := 100.0
	var speed := 0.0
	var alerted := false
	var cooldown := 1.0
	## Seconds since death, or -1 while alive.
	var down_for := -1.0
	var stun := 0.0
	var knock_x := 0.0
	var knock_z := 0.0
	## Seconds left winding up, or -1 when not.
	var windup := -1.0
	var retreat := 0.0
	var retreated := false
	var strafe := 1.0
	var strafe_for := 1.0
	var since_hit := 99.0
	var heavy_hit := false


## The player as the rules see them this step.
class PlayerState:
	var x := 0.0
	var z := 0.0
	var heading := 0.0
	var in_vehicle := false
	var speed := 0.0
	## A weapon in hand (a loaded gun or the bat): makes gang members uneasy.
	var armed := false
	## Holding BLOCK: melee hits do a fifth of their damage.
	var blocking := false

	static func make(px: float = 0.0, pz: float = 0.0, facing: float = 0.0) -> PlayerState:
		var p := PlayerState.new()
		p.x = px
		p.z = pz
		p.heading = facing
		return p


var health := PLAYER_MAX_HEALTH
var arsenal := Arsenal.new()
var enemies: Array[Enemy] = []
## What the last swing was: a combo punch, "bat" or "".
var last_swing := ""

var _world: CombatWorld
var _random: Callable
var _rng: RefCounted
var _next_id := 1
var _since_hurt := 99.0
var _combo_last := ""
var _since_swing := 99.0
var _dodging := 0.0
var _dodge_wait := 0.0
var _attackers: Dictionary = {}


func _init(world: CombatWorld = null, random: Variant = null) -> void:
	_world = world if world != null else CombatWorld.new()
	if random is Callable:
		_random = random
	elif random is SeededRandom:
		_rng = random
		_random = (random as SeededRandom).next
	else:
		_random = randf


## Pistol rounds (the stages issue these for armed fights).
var ammo: int:
	get:
		return arsenal.ammo_of("pistol")
	set(rounds):
		arsenal.set_ammo("pistol", rounds)


## Put a group of enemies on the map. Does nothing if the group is already there.
func spawn_group(group: String, spots: Array) -> void:
	for e in enemies:
		if e.group == group:
			return
	for spot: EnemySpot in spots:
		var hp := spot.health if spot.health > 0.0 else ENEMY_HEALTH
		var asked := spot.weapon if spot.weapon != "" and Weapons.is_weapon(spot.weapon) and Weapons.is_gun(spot.weapon) == spot.armed else ""
		var e := Enemy.new()
		e.id = _next_id
		_next_id += 1
		e.group = group
		e.armed = spot.armed
		e.max_health = hp
		e.weapon = asked if asked != "" else ("pistol" if spot.armed else "fists")
		e.tint = spot.tint
		e.calm = spot.calm
		e.x = spot.x
		e.z = spot.z
		e.health = hp
		e.strafe = 1.0 if e.id % 2 == 0 else -1.0
		e.strafe_for = 1.0 + (e.id % 3) * 0.6
		enemies.append(e)


## Take a group off the map at once.
func remove_group(group: String) -> void:
	for i in range(enemies.size() - 1, -1, -1):
		if enemies[i].group == group:
			enemies.remove_at(i)


## A calm group turns on the player: every member notices them and attacks.
func provoke(group: String, events: Array[Dictionary]) -> void:
	var changed := false
	for e in enemies:
		if e.group != group or e.health <= 0.0:
			continue
		if e.calm:
			changed = true
		e.calm = false
		e.alerted = true
		e.unease = 0.0
	if changed:
		events.append({"type": "crewProvoked", "group": group})


## Remove every enemy not in one of the given groups.
func keep_only(groups: Array) -> void:
	for i in range(enemies.size() - 1, -1, -1):
		if not groups.has(enemies[i].group):
			enemies.remove_at(i)


func remaining(group: String) -> int:
	var n := 0
	for e in enemies:
		if e.group == group and e.health > 0.0:
			n += 1
	return n


## Hurt the player by something that is not a fighter (a crash, TD-29): no dodge or block.
func hurt(amount: float) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	if amount <= 0.0 or health <= 0.0:
		return events
	health = maxf(0.0, health - amount)
	_since_hurt = 0.0
	events.append({"type": "playerHurt", "amount": amount})
	if health == 0.0:
		events.append({"type": "playerDied"})
	return _emit(events)


func revive() -> void:
	health = PLAYER_MAX_HEALTH
	_since_hurt = 99.0


func _hit_enemy(e: Enemy, amount: float, events: Array[Dictionary], fx: float, fz: float, weapon: String, move: String = "") -> void:
	if e.health <= 0.0:
		return
	var reaction := Melee.hit_reaction(amount, move)
	e.stun = maxf(e.stun, reaction["stun"])
	e.windup = -1.0
	e.since_hit = 0.0
	e.heavy_hit = reaction["heavy"]
	var away := RulesMath.hypot(e.x - fx, e.z - fz)
	if away > 0.01:
		# Knock-back travels over about a fifth of a second.
		e.knock_x = (e.x - fx) / away * float(reaction["knock"]) * 5.0
		e.knock_z = (e.z - fz) / away * float(reaction["knock"]) * 5.0
	events.append({"type": "enemyHit", "enemy": e, "damage": amount, "heavy": reaction["heavy"], "weapon": weapon})
	_damage_enemy(e, amount, events)


func _damage_enemy(e: Enemy, amount: float, events: Array[Dictionary]) -> void:
	if e.health <= 0.0:
		return
	e.health = maxf(0.0, e.health - amount)
	if e.calm:
		provoke(e.group, events)
	e.alerted = true
	if e.health > 0.0:
		return
	e.down_for = 0.0
	e.speed = 0.0
	events.append({"type": "enemyDown", "enemy": e})
	if remaining(e.group) == 0:
		events.append({"type": "groupCleared", "group": e.group})


## Throw the next punch of the combo or swing the bat. Returns the enemy hit; null for a miss
## (or a pedestrian hit, reported as `civilianHit`); `false` when still recovering or unable.
## `civilians`: [{id, x, z}].
func punch(p: PlayerState, events: Array[Dictionary], civilians: Array = []) -> Variant:
	if p.in_vehicle or p.blocking:
		return false
	var start := events.size()
	var melee := arsenal.try_swing()
	if melee.is_empty():
		return false
	var move: String = "bat" if melee["id"] == "bat" else Melee.next_combo_move(_combo_last, _since_swing)
	_combo_last = "" if move == "bat" else move
	_since_swing = 0.0
	last_swing = move
	var damage: float = float(melee["damage"]) * (1.0 if move == "bat" else float(FEEL["combo"][move]))
	var best: Enemy = null
	var best_civilian: Dictionary = {}
	var best_distance: float = melee["range"]
	var assist: float = melee["aim_assist"]
	for e in enemies:
		if e.health <= 0.0:
			continue
		var d := _in_front(p, e.x, e.z, best_distance, assist)
		if d >= 0.0:
			best = e
			best_distance = d
	for c: Dictionary in civilians:
		var d := _in_front(p, c["x"], c["z"], best_distance, assist)
		if d >= 0.0:
			best = null
			best_civilian = c
			best_distance = d
	if best != null:
		_hit_enemy(best, damage, events, p.x, p.z, melee["id"], move)
	elif not best_civilian.is_empty():
		events.append({"type": "civilianHit", "id": best_civilian["id"], "damage": damage, "heavy": Melee.hit_reaction(damage, move)["heavy"], "weapon": melee["id"], "fromX": p.x, "fromZ": p.z})
	_emit_from(events, start)
	return best


## The distance to (x, z) when closer than `within` and roughly in front, else -1.
func _in_front(p: PlayerState, x: float, z: float, within: float, assist: float) -> float:
	var distance := RulesMath.hypot(x - p.x, z - p.z)
	var bearing := atan2(-(x - p.x), -(z - p.z))
	return distance if distance < within and RulesMath.angle_between(bearing, p.heading) < assist else -1.0


## Dodge: a moment untouchable. False while the last dodge is recovering.
func dodge() -> bool:
	if _dodge_wait > 0.0 or health <= 0.0:
		return false
	_dodging = FEEL["dodge_for"]
	_dodge_wait = FEEL["dodge_every"]
	return true


func dodging_now() -> bool:
	return _dodging > 0.0


## Fire the gun in hand the way the player faces, with a little aim assistance. Returns
## {fired, weapon, to_x, to_z, hit: Enemy or null, civilian, pellets: [{to_x, to_z, hit, civilian}]}.
func shoot(p: PlayerState, events: Array[Dictionary], civilians: Array = []) -> Dictionary:
	var none := {"fired": false, "weapon": "", "to_x": p.x, "to_z": p.z, "hit": null, "civilian": -1, "pellets": []}
	if p.in_vehicle:
		return none
	var gun := arsenal.try_fire()
	if gun.is_empty():
		return none
	var start := events.size()
	events.append({"type": "playerShot", "x": p.x, "z": p.z, "weapon": gun["id"]})
	for e in enemies:
		if e.calm and e.health > 0.0 and Gangs.hears_gunshot(e.x, e.z, p.x, p.z):
			provoke(e.group, events)
	var target := _assisted(p, gun)
	var aim := atan2(-(target.x - p.x), -(target.z - p.z)) if target != null else p.heading
	var pellets: Array[Dictionary] = []
	for i in int(gun["pellets"]):
		if float(gun["spread"]) == 0.0 and target != null:
			_hit_enemy(target, Weapons.hit_damage(gun, RulesMath.hypot(target.x - p.x, target.z - p.z)), events, p.x, p.z, gun["id"])
			pellets.append({"to_x": target.x, "to_z": target.z, "hit": target, "civilian": -1})
		else:
			var angle := aim if float(gun["spread"]) == 0.0 else Weapons.stray_angle(gun, aim, _random.call())
			pellets.append(_pellet(p, gun, angle, events, civilians))
	var first: Dictionary = pellets[0]
	for pl in pellets:
		if pl["hit"] != null:
			first = pl
			break
	_emit_from(events, start)
	return {"fired": true, "weapon": gun["id"], "to_x": first["to_x"], "to_z": first["to_z"], "hit": first["hit"], "civilian": first["civilian"], "pellets": pellets}


func _assisted(p: PlayerState, gun: Dictionary) -> Enemy:
	var target: Enemy = null
	var best_angle: float = gun["aim_assist"]
	for e in enemies:
		if e.health <= 0.0:
			continue
		var distance := RulesMath.hypot(e.x - p.x, e.z - p.z)
		if distance > float(gun["range"]) or distance < 0.3:
			continue
		var off := RulesMath.angle_between(atan2(-(e.x - p.x), -(e.z - p.z)), p.heading)
		if off < best_angle and _world.line_of_sight(p.x, p.z, e.x, e.z):
			target = e
			best_angle = off
	return target


func _pellet(p: PlayerState, gun: Dictionary, angle: float, events: Array[Dictionary], civilians: Array) -> Dictionary:
	var dx := -sin(angle)
	var dz := -cos(angle)
	var r: float = gun["range"]
	var wall_at: Variant = _world.wall_distance(p.x, p.z, dx, dz, r)
	var wall := minf(r, float(wall_at) if wall_at != null else r)
	var hit: Enemy = null
	var nearest := wall
	for e in enemies:
		if e.health <= 0.0:
			continue
		var ex := e.x - p.x
		var ez := e.z - p.z
		var along := ex * dx + ez * dz
		# The ray also stops at people's own boxes: someone up to a body's depth past the "wall" is hit.
		if along <= 0.3 or along >= nearest + BODY_DEPTH:
			continue
		if absf(ex * dz - ez * dx) <= BODY_HALF_WIDTH:
			hit = e
			nearest = along
	var civilian: Dictionary = {}
	for c: Dictionary in civilians:
		var cx: float = float(c["x"]) - p.x
		var cz: float = float(c["z"]) - p.z
		var along := cx * dx + cz * dz
		if along <= 0.3 or along >= nearest + BODY_DEPTH:
			continue
		if absf(cx * dz - cz * dx) <= BODY_HALF_WIDTH:
			civilian = c
			nearest = along
			hit = null
	if not civilian.is_empty():
		var damage := Weapons.hit_damage(gun, nearest)
		events.append({"type": "civilianHit", "id": civilian["id"], "damage": damage, "heavy": Melee.hit_reaction(damage)["heavy"], "weapon": gun["id"], "fromX": p.x, "fromZ": p.z})
		return {"to_x": civilian["x"], "to_z": civilian["z"], "hit": null, "civilian": civilian["id"]}
	if hit == null:
		return {"to_x": p.x + dx * wall, "to_z": p.z + dz * wall, "hit": null, "civilian": -1}
	_hit_enemy(hit, Weapons.hit_damage(gun, nearest), events, p.x, p.z, gun["id"])
	return {"to_x": hit.x, "to_z": hit.z, "hit": hit, "civilian": -1}


func _hurt_player(amount: float, events: Array[Dictionary], melee: bool = false, blocking: bool = false) -> void:
	if health <= 0.0:
		return
	if _dodging > 0.0:
		events.append({"type": "dodged"})
		return
	if melee and blocking:
		amount *= float(FEEL["block_share"])
		events.append({"type": "blocked", "amount": amount})
	health = maxf(0.0, health - amount)
	_since_hurt = 0.0
	events.append({"type": "playerHurt", "amount": amount})
	if health == 0.0:
		events.append({"type": "playerDied"})


## Advance one step: cooldowns, healing, and every enemy's decision.
func update(dt: float, p: PlayerState) -> Array[Dictionary]:
	var events: Array[Dictionary] = []
	arsenal.tick(dt)
	_since_hurt += dt
	_since_swing += dt
	_dodging = maxf(0.0, _dodging - dt)
	_dodge_wait = maxf(0.0, _dodge_wait - dt)
	if health > 0.0 and _since_hurt > REGEN_DELAY:
		health = minf(PLAYER_MAX_HEALTH, health + REGEN_RATE * dt)

	# Melee fighters take turns: a couple attack, the rest circle and wait.
	var brawlers: Array = []
	for e in enemies:
		if e.health > 0.0 and not e.calm and e.alerted and not e.armed:
			brawlers.append({"id": e.id, "distance": RulesMath.hypot(p.x - e.x, p.z - e.z)})
	_attackers = Melee.choose_attackers(brawlers, _attackers)

	for i in range(enemies.size() - 1, -1, -1):
		var e := enemies[i]
		if e.health <= 0.0:
			e.down_for += dt
			if e.down_for > DOWN_TIME:
				enemies.remove_at(i)
			continue
		var dx := p.x - e.x
		var dz := p.z - e.z
		var distance := RulesMath.hypot(dx, dz)
		e.cooldown = maxf(0.0, e.cooldown - dt)
		e.speed = 0.0
		e.since_hit += dt
		e.strafe_for -= dt
		if e.strafe_for <= 0.0:
			e.strafe = -e.strafe
			e.strafe_for = 1.4 + float(_random.call()) * 1.2
		_knock_back(e, dt)
		e.stun = maxf(0.0, e.stun - dt)

		# A fast vehicle knocks down anyone it hits.
		if p.in_vehicle and p.speed > RUN_OVER_SPEED and distance < 1.9:
			_damage_enemy(e, 70.0, events)
			continue
		if e.calm:
			var before := e.unease
			var step := Gangs.linger_step(e.unease, INF if p.in_vehicle else distance, p.armed, dt)
			e.unease = step["unease"]
			if e.unease > 0.0 and distance > 0.01:
				e.heading = atan2(-dx, -dz)
			if step["provoked"]:
				provoke(e.group, events)
			elif before < float(Gangs.GANG_RULES["warn_at"]) and e.unease >= float(Gangs.GANG_RULES["warn_at"]) and not _has_warning(events, e.group):
				events.append({"type": "crewWarning", "group": e.group})
			if e.calm:
				continue
		if not e.alerted:
			if distance < ENEMY_NOTICE and _world.line_of_sight(e.x, e.z, p.x, p.z):
				e.alerted = true
			else:
				continue
		if health <= 0.0 or distance < 0.01:
			continue
		e.heading = atan2(-dx, -dz)
		var ux := dx / distance
		var uz := dz / distance
		if e.stun > 0.0:
			continue

		# A wound-up punch or swing lands now, if the player is still in reach.
		if e.windup >= 0.0:
			e.windup -= dt
			if e.windup <= 0.0:
				e.windup = -1.0
				e.cooldown = 1.3
				if distance <= ENEMY_PUNCH_RANGE + 0.4 and not p.in_vehicle:
					events.append({"type": "enemyPunch", "enemy": e})
					var fist: float = ENEMY_MELEE["fists"]
					_hurt_player(fist * 0.7 if e.armed else float(ENEMY_MELEE.get(e.weapon, fist)), events, true, p.blocking)
			continue

		# Badly hurt: back off once (not the boss), only with open ground behind.
		if not e.retreated and e.max_health <= 150.0 and e.health < e.max_health * float(FEEL["retreat_below"]):
			e.retreated = true
			if _world.solid_distance(e.x, e.z, -ux, -uz, 3.0) == null:
				e.retreat = FEEL["retreat_for"]
		if e.retreat > 0.0:
			e.retreat -= dt
			if not _walk(e, -ux, -uz, ENEMY_SPEED * 0.8, dt):
				e.retreat = 0.0
			continue

		var gun: Dictionary = ENEMY_GUNS.get(e.weapon, ENEMY_GUNS["pistol"]) if e.armed else {}
		var sees := not gun.is_empty() and distance < float(gun["range"]) and _world.line_of_sight(e.x, e.z, p.x, p.z)
		if not gun.is_empty() and sees and distance > 5.0:
			if e.cooldown == 0.0:
				e.cooldown = float(gun["interval"]) * (0.8 + float(_random.call()) * 0.4)
				var chance: float = float(gun["accuracy"]) * (1.0 - distance / (float(gun["range"]) * 1.6))
				if p.speed > 3.0:
					chance *= 0.6
				if p.in_vehicle:
					chance *= 0.5
				var hit: bool = float(_random.call()) < chance
				events.append({"type": "enemyShot", "fromX": e.x, "fromZ": e.z, "toX": p.x, "toZ": p.z, "hit": hit})
				if hit:
					_hurt_player(gun["damage"], events)
			elif distance < float(FEEL["gunman_space"]) + 1.0:
				_walk(e, -ux, -uz, FEEL["strafe_speed"], dt)
			elif not _walk(e, -uz * e.strafe, ux * e.strafe, FEEL["strafe_speed"], dt):
				e.strafe = -e.strafe
			continue
		if distance <= ENEMY_PUNCH_RANGE:
			if e.cooldown == 0.0 and not p.in_vehicle and (e.armed or _attackers.has(e.id)):
				e.windup = FEEL["windup"]
				events.append({"type": "enemyWindup", "enemy": e})
			continue
		if not e.armed and not _attackers.has(e.id) and distance < float(FEEL["circle_at"]) + 3.0:
			var radial := maxf(-1.0, minf(1.0, distance - float(FEEL["circle_at"])))
			var mx := -uz * e.strafe + ux * radial
			var mz := ux * e.strafe + uz * radial
			var length := RulesMath.hypot(mx, mz)
			if length == 0.0:
				length = 1.0
			if not _walk(e, mx / length, mz / length, FEEL["circle_speed"], dt):
				e.strafe = -e.strafe
			continue
		# Close in, stepping round walls: straight at the player; else half-left or half-right,
		# then sideways, the side it last went first.
		var move_x := ux
		var move_z := uz
		if _world.solid_distance(e.x, e.z, ux, uz, WALL_LOOKAHEAD) != null:
			var c := sqrt(0.5)
			var found := false
			for option: Array in [[c, e.strafe], [c, -e.strafe], [0.0, e.strafe], [0.0, -e.strafe]]:
				var along: float = option[0]
				var side: float = option[1]
				var across := 1.0 if along == 0.0 else c
				var mx := ux * along - uz * side * across
				var mz := uz * along + ux * side * across
				if _world.solid_distance(e.x, e.z, mx, mz, WALL_LOOKAHEAD) == null:
					move_x = mx
					move_z = mz
					if side != e.strafe:
						e.strafe = side
					found = true
					break
			if not found:
				continue
		var crowded := false
		for other in enemies:
			if other == e or other.health <= 0.0:
				continue
			var ahead := (other.x - e.x) * move_x + (other.z - e.z) * move_z
			if ahead > 0.0 and RulesMath.hypot(other.x - e.x, other.z - e.z) < 0.9:
				crowded = true
		if crowded:
			continue
		e.x += move_x * ENEMY_SPEED * dt
		e.z += move_z * ENEMY_SPEED * dt
		e.speed = ENEMY_SPEED
	return _emit(events)


func _has_warning(events: Array[Dictionary], group: String) -> bool:
	for ev in events:
		if ev["type"] == "crewWarning" and ev["group"] == group:
			return true
	return false


func _walk(e: Enemy, dx: float, dz: float, speed: float, dt: float) -> bool:
	if _world.solid_distance(e.x, e.z, dx, dz, WALL_LOOKAHEAD) != null:
		return false
	e.x += dx * speed * dt
	e.z += dz * speed * dt
	e.speed = speed
	return true


func _knock_back(e: Enemy, dt: float) -> void:
	var speed := RulesMath.hypot(e.knock_x, e.knock_z)
	if speed < 0.05:
		e.knock_x = 0.0
		e.knock_z = 0.0
		return
	var step := speed * dt
	if _world.solid_distance(e.x, e.z, e.knock_x / speed, e.knock_z / speed, WALL_LOOKAHEAD + step) == null:
		e.x += e.knock_x * dt
		e.z += e.knock_z * dt
	var fade := exp(-dt * 10.0)
	e.knock_x *= fade
	e.knock_z *= fade


func _emit(events: Array[Dictionary]) -> Array[Dictionary]:
	for ev in events:
		combat_event.emit(ev)
	return events


## punch() and shoot() append to the caller's array: emit only what they added.
func _emit_from(events: Array[Dictionary], start: int) -> void:
	for i in range(start, events.size()):
		combat_event.emit(events[i])
