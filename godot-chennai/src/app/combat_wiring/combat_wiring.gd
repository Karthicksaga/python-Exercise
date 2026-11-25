class_name CombatWiring
extends Node
## Combat, weapons, gangs, the wanted level and the police in the running game (phase 5,
## G-410…G-429; the Three.js `Game.fight`, `knockedOut`, `arrested`, `storyPolice`). Composition
## glue only: the rules are `src/combat/` (`Combat`, `Arsenal`, `WeaponPickups`, `Gangs`, `Wanted`,
## `PoliceFleet`, `Strikes`, `FightSafety`); this node feeds them the player's real state each fixed
## step and turns their events into figures (`Fighters`), effects (`CombatFx`), the HUD
## (`CombatHud`), sound cues, camera shake and the missions' `cleared`, `wanted` and `down`.
##
## - **Enemies exist only while their objective is current** (a stage's defeat group, a reach
##   objective's hostiles), plus gang crews on their corners near the player (`ArmsWiring`) and
##   police officers on foot (`PoliceWiring`). A city job or a story holds stage fights back.
## - **Nothing fights on ground that is not loaded** (brief §7: an enemy charging through a wall
##   not yet built was sealed in it): enemies hold still and no group is placed until the chunks
##   round the player are in (`CityWorld.world_ready_around`).
## - **HIT** starts a punch or bat swing; the blow lands at the end of its wind-up (`SwingClock`),
##   when the figure's strike is drawn landing. **FIRE** shoots while held. Blows turn the player to
##   the locked enemy (`Melee.choose_lock`), so a thumb on HIT is enough on a phone.
## - **Knocked out**: a ₹100 hospital bill, the stage starts again, back at the start. **Busted**:
##   the fine, every weapon taken, let go outside the nearest police station.
## - **Children are never in a fight** (`FightSafety`): only adults are civilians the rules may hit,
##   and the crowd's children are kept out of the ring round any fight (`CityLife.fight_points`).
## - **Thread safety**: walkers are read only in `CityLife.between_steps`; blows on them are queued
##   to `StreetReactions`, which applies them there.

signal knocked_out(bill: int)
signal busted(fine: int, stars: int)

const HOSPITAL_BILL := 100
## Chest height for the rules' rays, metres above the ground.
const CHEST := 1.2
## Civilians the rules may hit: walkers and crowd adults this near the player.
const CIVILIAN_REACH := 6.0
## Hit-stop on a landed blow: physics frames the struck enemies hold still (game-feel: a few).
const HIT_STOP_FRAMES := 3
## Camera trauma: a punch, a bat, a blow taken, a bullet taken.
const TRAUMA := {"punch": 0.25, "bat": 0.4, "taken": 0.45, "taken_bat": 0.6, "shot": 0.2}

var world: CityWorld = null
var rig: PlayerRig = null
var driving: Driving = null
var life: CityLife = null
var layer: MissionsLayer = null
var street_reactions: StreetReactions = null
var content: GameContent
var combat: Combat
var arms: ArmsWiring
var fighters: Fighters
var police: PoliceWiring
var hud: CombatHud
var puffs: HitPuffs = null
var swing := SwingClock.new()
## Enemy groups beaten during the current stage (the missions' `cleared`).
var cleared: Dictionary = {}
var active := true
## False: no figures or car models (fast scene tests of the rules in play).
var load_models := true
## Main-thread cost of the fixed step, µs: last, max, total, steps (the 2.5 ms budget).
var stats: Dictionary = {"usec": 0, "usec_max": 0, "usec_total": 0, "steps": 0}
var _civilians: Array[Dictionary] = []
var _minors: Dictionary = {}
var _shots := PackedVector3Array()
var _shown := ""
var _hitstop := 0
var _down_now := false
var _respawn_pending := Vector3.INF
var _lock := -1
var _last_objective: MissionData.Objective = null
var _space: PhysicsDirectSpaceState3D = null
## The player's punch combo as drawn (the rules keep their own): last move and seconds since.
var _move := ""
var _since_move := 99.0
var _carrying := false
var _obstacles_hooked := false
const SAMPLES := 300
var _samples := PackedInt32Array()
var _sample_at := 0
var _runner: MissionRunner = null


## The session makes a new runner when it reloads (NEW GAME, a test's save): follow it.
func _watch_runner() -> void:
	var r := layer.session.runner
	if r == _runner:
		return
	_runner = r
	r.stage_completed.connect(_on_stage_completed)


static func make(city: CityWorld, player: PlayerRig, drive: Driving, missions: MissionsLayer, streets: CityLife = null, save_path: String = ArmsWiring.DEFAULT_SAVE) -> CombatWiring:
	var w := CombatWiring.new()
	w.name = "CombatWiring"
	w.world = city
	w.rig = player
	w.driving = drive
	w.layer = missions
	w.life = streets
	w.content = missions.session.content
	w.combat = Combat.new(w._combat_world(), SeededRandom.new(4091))
	w.arms = ArmsWiring.make(w.combat, w.content, save_path)
	w.police = PoliceWiring.make(w.combat)
	w.fighters = Fighters.make(w.combat, streets.pool if streets != null else null)
	w.hud = CombatHud.make()
	# After the player, Driving (-10) and the rig, before the missions (10) read `cleared`.
	w.process_physics_priority = 5
	w.process_mode = Node.PROCESS_MODE_PAUSABLE
	return w


## Loading work (awaited): the fighters' people and the police cars, the HUD row, the hooks into
## the missions, the street reactions and the carjacking. "" or the error.
func prepare(reactions: StreetReactions = null, carjacking: Carjacking = null) -> String:
	var holder: Node = world if world != null else get_parent()
	fighters.load_models = load_models
	police.load_models = load_models
	holder.add_child(fighters)
	holder.add_child(arms)
	holder.add_child(police)
	var err := await fighters.prepare()
	if err != "":
		return err
	police.prepare()
	police.graph_source = _graph
	police.line_clear = _line_clear_2d
	police.stations = _stations()
	police.busted.connect(_on_busted)
	fighters.ground_y = func(_x: float, _z: float) -> float: return 0.0
	if load_models:
		puffs = HitPuffs.new()
		holder.add_child(puffs)
	hud.attach(layer.hud)
	layer.combat_status = _fill_status
	layer.board_refusal = func() -> String: return police.job_refusal(layer.session.jobs.job() != null)
	_watch_runner()
	layer.session.heat_raised.connect(func(stars: int) -> void: police.set_stars(mini(Wanted.MAX_STARS, police.wanted.stars + stars)))
	arms.notice.connect(func(t: String, d: String, s: float) -> void: layer.hud.toast(t, d, s))
	street_reactions = reactions
	if reactions != null:
		reactions.wanted = police.wanted
		reactions.report_crime = func(crime: String) -> void: police.report(crime)
	if carjacking != null:
		carjacking.wanted = police.wanted
	if life != null:
		life.between_steps.connect(_between_steps)
		if life.cast != null:
			for e in life.cast.entries:
				if CastPicker.is_minor(e):
					_minors[str(e["id"])] = true
	return ""


func wanted() -> Wanted:
	return police.wanted


# --- What the rules ask of the world ---------------------------------------------------------

func _combat_world() -> CombatWorld:
	return CombatWorld.make(
		func(ax: float, az: float, bx: float, bz: float) -> bool: return _line_clear_2d(Vector2(ax, az), Vector2(bx, bz)),
		func(x: float, z: float, dx: float, dz: float, m: float) -> Variant:
			var hit: Variant = _ray(Vector2(x, z) + Vector2(dx, dz) * 0.6, Vector2(dx, dz), m)
			return null if hit == null else float(hit) + 0.6,
		func(x: float, z: float, dx: float, dz: float, m: float) -> Variant: return _ray(Vector2(x, z), Vector2(dx, dz), m))


## Distance along a horizontal ray at chest height to the first building, tree or vehicle, or null.
func _ray(from: Vector2, dir: Vector2, length: float) -> Variant:
	if _space == null or length <= 0.0:
		return null
	var a := WorldOrigin.to_scene_xz(from.x, from.y, CHEST)
	var b := WorldOrigin.to_scene_xz(from.x + dir.x * length, from.y + dir.y * length, CHEST)
	var q := PhysicsRayQueryParameters3D.create(a, b, PhysicsLayers.WORLD | PhysicsLayers.VEHICLES)
	var hit := _space.intersect_ray(q)
	if hit.is_empty():
		return null
	return a.distance_to(hit["position"] as Vector3)


func _line_clear_2d(a: Vector2, b: Vector2) -> bool:
	var d := a.distance_to(b)
	if d < 1.4:
		return true
	var dir := (b - a) / d
	return _ray(a + dir * 0.6, dir, d - 1.2) == null


func _graph() -> RoadGraph:
	return _graph_cache


var _graph_cache: RoadGraph = null


func _stations() -> PackedVector2Array:
	var out := PackedVector2Array()
	if world == null or world.source == null:
		return out
	var index: WorldIndex = world.source.index_at(WorldOrigin.to_world(rig.body.global_position))
	if index != null:
		for p in index.pois:
			if p.kind == &"police":
				out.append(p.position)
	return out


## Between the AI's steps (the only time walkers may be read): the adults near the player and the
## drive graph for the police.
func _between_steps(_dt: float) -> void:
	if life.population == null:
		return
	if life.population.area != null:
		_graph_cache = life.population.area.drive
	_civilians.clear()
	var at := _player_at()
	var r2 := CIVILIAN_REACH * CIVILIAN_REACH
	var walkers := life.population.walkers
	for a in walkers.agents:
		if a.active and a.pos.distance_squared_to(at) < r2 and not life.downed.has(a.id):
			_civilians.append({"id": a.id, "x": a.pos.x, "z": a.pos.y, "person": life.cast.walker(a.id)})
	for p in life.population.people:
		if p.child or p.play or p.pos.distance_squared_to(at) > r2 or life.downed_crowd.has(p.key):
			continue
		_civilians.append({"id": -1 - p.key, "x": p.pos.x, "z": p.pos.y, "person": life.cast.crowd_person(p.look, p.child, p.play)})
	_civilians = FightSafety.adults_only(_civilians, _minors)


# --- The fixed step -----------------------------------------------------------------------

func _player_at() -> Vector2:
	var v := _vehicle()
	return WorldOrigin.to_world(v.global_position if v != null else rig.body.global_position)


func _vehicle() -> Vehicle:
	if driving == null or driving.mode() != &"driving":
		return null
	return driving.vehicle


func _on_foot() -> bool:
	return driving == null or driving.mode() == &"foot"


func _fill_status(p: MissionData.PlayerStatus) -> void:
	p.cleared = cleared
	p.wanted = police.wanted.stars
	p.down = p.down or _down_now


func _physics_process(dt: float) -> void:
	if not active or rig == null or layer == null or layer.held:
		return
	var t0 := Time.get_ticks_usec()
	_space = rig.body.get_world_3d().direct_space_state
	_down_now = false
	if _respawn_pending != Vector3.INF and _on_foot():
		rig.place(WorldOrigin.to_scene_xz(_respawn_pending.x, _respawn_pending.y, 0.05), _respawn_pending.z)
		_respawn_pending = Vector3.INF
	var at := _player_at()
	var on_foot := _on_foot()
	var v := _vehicle()
	_watch_runner()
	var session := layer.session
	var objective := session.objective() if session.jobs.job() == null and session.stories.story() == null else null
	_story_police(objective)
	var group := ""
	var marker := {}
	if objective != null:
		if objective.type == "defeat":
			group = objective.group
		elif objective.type == "reach" and objective.hostiles != "":
			group = objective.hostiles
		if objective.type in ["reach", "defeat"]:
			marker = {"x": objective.x, "z": objective.z}
	var ground := world == null or world.world_ready_around(at)
	var keep: Array = []
	if ground:
		keep.append_array(arms.step(dt, at, on_foot, marker))
	else:
		keep.append_array(arms.out.keys())
	if group != "":
		keep.append(group)
	keep.append_array(police.groups())
	combat.keep_only(keep)
	if group != "" and ground and not cleared.has(group) and combat.remaining(group) == 0 and content.enemies.has(group):
		var spots: Array = content.enemies[group]
		combat.spawn_group(group, spots)
		var armed := 0
		for s: EnemySpot in spots:
			if s.armed:
				armed += 1
		if armed > 0:
			combat.ammo = maxi(combat.ammo, armed * 8 + 8)

	var state := Combat.PlayerState.make(at.x, at.y, rig.body.yaw)
	state.in_vehicle = not on_foot
	state.speed = absf(v.forward_speed()) if v != null else rig.body.speed
	state.armed = on_foot and arms.armed()
	var events: Array[Dictionary] = []
	var reads := rig.reads_devices
	if (rig.controls.consume_weapon() or (reads and Input.is_action_just_pressed(&"player_weapon"))) and on_foot and combat.arsenal.guns().size() > 1:
		arms.switch_weapon()
	var hit := rig.controls.consume_hit() or (reads and Input.is_action_just_pressed(&"player_hit"))
	var fire := rig.controls.fire_held or (reads and Input.is_action_pressed(&"player_fire"))
	# A swing started earlier lands now, where the player faces.
	var landed := ""
	_since_move += dt
	if not on_foot:
		if swing.kind() != "":
			CombatFx.cancel(rig.body.figure)
		swing.cancel()
	else:
		landed = swing.step(dt)
	if landed != "":
		var got: Variant = combat.punch(state, events, _civilians)
		if got is Combat.Enemy:
			var e := got as Combat.Enemy
			_blow_lands(Vector2(e.x, e.z), at, landed)
			rig.camera.add_trauma(float(TRAUMA[landed]))
			_hitstop = HIT_STOP_FRAMES
			Sound.cue("punch")
		elif got == null:
			Sound.cue("whiff")
	if on_foot and (hit or fire):
		_face_target(at)
		state.heading = rig.body.yaw
		var kind := Strikes.strike_kind(str(combat.arsenal.melee()["id"]))
		if hit and combat.arsenal.melee_ready_in() <= Strikes.windup(kind) and swing.begin(kind):
			# The drawn blow: the bat, or the combo's jab (lead hand), cross (rear), hook (lead).
			_move = "bat" if kind == "bat" else Melee.next_combo_move(_move, _since_move)
			_since_move = 0.0
			CombatFx.strike(rig.body.figure, StringName(_move), 0 if _move in ["jab", "hook"] else 1)
		if fire:
			var shot := combat.shoot(state, events, _civilians)
			if bool(shot["fired"]):
				Sound.cue("shot")
				var muzzle := at + Vector2(-sin(state.heading), -cos(state.heading)) * 0.7
				for pl: Dictionary in shot["pellets"]:
					fighters.tracer(muzzle, Vector2(float(pl["to_x"]), float(pl["to_z"])), 0.0)
					if pl["hit"] is Combat.Enemy:
						var he := pl["hit"] as Combat.Enemy
						_blow_lands(Vector2(he.x, he.z), at, "shot")
				_shots.append(Vector3(at.x, at.y, 0.0))
				police.gunfire(at, Vector2(float(shot["to_x"]), float(shot["to_z"])))
	# Hit-stop: the struck hold still a few frames; otherwise the enemies take their turn.
	if _hitstop > 0:
		_hitstop -= 1
	elif ground:
		events.append_array(combat.update(dt, state))
	_handle(events, at)
	police.step(dt, _police_view(at, state.speed, v, on_foot))
	arms.handle(events)
	fighters.after_step(dt)
	_age_shots(dt)
	if life != null:
		life.fight_points = FightSafety.fight_points(combat, _shots)
	var spent := Time.get_ticks_usec() - t0
	stats["usec"] = spent
	stats["usec_max"] = maxi(int(stats["usec_max"]), spent)
	stats["usec_total"] = int(stats["usec_total"]) + spent
	stats["steps"] = int(stats["steps"]) + 1
	if _samples.size() < SAMPLES:
		_samples.append(spent)
	else:
		_samples[_sample_at] = spent
		_sample_at = (_sample_at + 1) % SAMPLES


## The step's cost over the last SAMPLES steps, µs: {median, p95, max} (a single spike from a busy
## machine does not hide what the step usually costs).
func cost_summary() -> Dictionary:
	var sorted := Array(_samples)
	sorted.sort()
	if sorted.is_empty():
		return {"median": 0, "p95": 0, "max": 0}
	return {"median": sorted[sorted.size() / 2], "p95": sorted[mini(sorted.size() - 1, int(sorted.size() * 0.95))], "max": sorted[sorted.size() - 1]}


func reset_cost() -> void:
	_samples.clear()
	_sample_at = 0


func _age_shots(dt: float) -> void:
	for i in range(_shots.size() - 1, -1, -1):
		var s := _shots[i]
		s.z += dt
		if s.z > FightSafety.SHOT_MEMORY:
			_shots.remove_at(i)
		else:
			_shots[i] = s


## Turn the player to the enemy their blows lock on to (the nearest in front, kept while near).
## Someone already in reach in front is hit as they are: the player is not turned.
func _face_target(at: Vector2) -> void:
	var candidates: Array = []
	var reach := float(combat.arsenal.melee()["range"]) + 0.3
	for e in combat.enemies:
		if e.health > 0.0:
			candidates.append({"id": e.id, "x": e.x, "z": e.z})
			var d := Vector2(e.x, e.z) - at
			if d.length() < reach and RulesMath.angle_between(atan2(-d.x, -d.y), rig.body.yaw) < 0.6:
				_lock = e.id
				return
	_lock = Melee.choose_lock(at.x, at.y, rig.body.yaw, candidates, _lock, func(c: Dictionary) -> bool: return _line_clear_2d(at, Vector2(float(c["x"]), float(c["z"]))))
	if _lock < 0:
		return
	for c: Dictionary in candidates:
		if int(c["id"]) == _lock:
			var d := Vector2(float(c["x"]), float(c["z"])) - at
			if d.length() > 0.1:
				rig.body.yaw = atan2(-d.x, -d.y)
			return


## A puff where a blow or bullet meets someone at `who`, struck from `from`.
func _blow_lands(who: Vector2, from: Vector2, by: String) -> void:
	var d := from - who
	var front := minf(0.3, d.length() * 0.5)
	var n := d.normalized() if d.length() > 0.01 else Vector2(0, 1)
	var height := {"punch": 1.3, "bat": 1.1, "shot": 1.15}
	var strength := {"punch": 1.0, "bat": 1.4, "shot": 0.6}
	var p := who + n * front
	CombatFx.puff(puffs, WorldOrigin.to_scene_xz(p.x, p.y, float(height[by])), Vector3(n.x, 0.0, n.y), float(strength[by]))


func _handle(events: Array[Dictionary], at: Vector2) -> void:
	for ev in events:
		match str(ev["type"]):
			"enemyWindup":
				fighters.windup(ev["enemy"] as Combat.Enemy)
			"enemyHit":
				var he := ev["enemy"] as Combat.Enemy
				var heavy := bool(ev["heavy"])
				CombatFx.flinch(fighters.view_of(he), WorldOrigin.to_scene_xz(at.x, at.y, 1.2), 1.4 if heavy else 1.0)
			"enemyShot":
				Sound.cue("shot")
				fighters.tracer(Vector2(float(ev["fromX"]), float(ev["fromZ"])), Vector2(float(ev["toX"]), float(ev["toZ"])), 0.0)
				_shots.append(Vector3(float(ev["fromX"]), float(ev["fromZ"]), 0.0))
				if bool(ev["hit"]):
					rig.camera.add_trauma(float(TRAUMA["shot"]))
			"enemyPunch":
				var e := ev["enemy"] as Combat.Enemy
				var bat := e.weapon == "bat"
				Sound.cue("punch")
				_blow_lands(at, Vector2(e.x, e.z), "bat" if bat else "punch")
				rig.camera.add_trauma(float(TRAUMA["taken_bat" if bat else "taken"]))
				CombatFx.flinch(rig.body.figure, WorldOrigin.to_scene_xz(e.x, e.z, 1.2), 1.4 if bat else 1.0)
				if _on_foot():
					var push := (at - Vector2(e.x, e.z)).normalized() * (2.2 if bat else 1.5)
					rig.body.knock(Vector3(push.x, 0.0, push.y))
			"playerHurt":
				hud.flash_hurt()
				Sound.cue("hurt")
			"groupCleared":
				cleared[str(ev["group"])] = true
			"civilianHit":
				var from := Vector2(float(ev["fromX"]), float(ev["fromZ"]))
				if street_reactions != null:
					street_reactions.strike_person(int(ev["id"]), from, bool(ev["heavy"]))
				police.report("pedestrianAssaulted")
			"playerDied":
				_knocked_out()


func _police_view(at: Vector2, speed: float, v: Vehicle, on_foot: bool) -> Dictionary:
	var vel := Vector2(v.linear_velocity.x, v.linear_velocity.z) if v != null else Vector2(-sin(rig.body.yaw), -cos(rig.body.yaw)) * rig.body.speed
	var allowed: Array = []
	var session := layer.session
	var job := session.jobs.job()
	if job != null:
		allowed.append(job.vehicle)
	var o := session.objective()
	if o != null and o.type == "enter":
		allowed.append(o.vehicle)
	var vid := ""
	if v != null:
		vid = String(v.id)
	return {"x": at.x, "z": at.y, "speed": speed, "vx": vel.x, "vz": vel.y, "on_foot": on_foot,
		"vehicle_id": vid, "vehicle_kind": String(v.type.kind) if v != null else "",
		"half_length": v.type.spec.half_extents.z if v != null else 0.0, "impact": 0.0, "allowed_kinds": allowed}


## A stage objective that has just started may call for the police: an "evade" raises the level.
func _story_police(o: MissionData.Objective) -> void:
	if o == _last_objective:
		return
	_last_objective = o
	if o != null and o.type == "evade":
		police.set_stars(maxi(police.wanted.stars, o.stars))


func _on_stage_completed(m: MissionData.Mission) -> void:
	cleared.clear()
	var line := arms.reward(m)
	if line != "":
		layer.hud.toast("Weapons", line, 3.0)


## Out of health: a hospital bill, the stage starts again, back at the start.
func _knocked_out() -> void:
	swing.cancel()
	_down_now = true
	var session := layer.session
	var bill := session.runner.charge(HOSPITAL_BILL)
	session.runner.restart_stage()
	session.save()
	cleared.clear()
	combat.keep_only([])
	combat.revive()
	police.clear()
	var s := content.spawn
	_go_to(Vector2(float(s.get("x", 0.0)), float(s.get("z", 0.0))), float(s.get("yaw", 0.0)))
	Sound.cue("fail")
	layer.hud.toast("Knocked out", "Hospital bill ₹%d. The stage starts again." % bill if bill > 0 else "The stage starts again.", 4.5)
	knocked_out.emit(bill)


## Busted (the police decided): the fine, the weapons, released outside the station.
func _on_busted(fine: int, stars: int, at: Vector2, yaw: float) -> void:
	swing.cancel()
	var session := layer.session
	var paid := session.runner.charge(fine)
	arms.confiscate()
	session.runner.restart_stage()
	session.save()
	cleared.clear()
	combat.keep_only([])
	combat.revive()
	_go_to(at, yaw)
	Sound.cue("fail")
	layer.hud.toast("Busted", "%s · %s · weapons taken. Released at the police station." % ["★".repeat(stars), "Fine ₹%s" % MissionSession.rupees(paid) if paid > 0 else "No money for the fine"], 5.0)
	busted.emit(paid, stars)


func _go_to(at: Vector2, yaw: float) -> void:
	if not _on_foot():
		driving.cancel_boarding()
		if driving.mode() == &"driving":
			driving.exit()
		_respawn_pending = Vector3(at.x, at.y, yaw)
		return
	rig.place(WorldOrigin.to_scene_xz(at.x, at.y, 0.05), yaw)


## NEW GAME: no fights, not wanted, the arsenal and pickups as new.
func new_game() -> void:
	cleared.clear()
	combat.keep_only([])
	combat.revive()
	police.clear()
	arms.reset()


# --- Each frame -----------------------------------------------------------------------------

func _process(dt: float) -> void:
	if rig == null:
		return
	_hook_obstacles()
	var at := _player_at()
	arms.draw(dt, at)
	# A box carried on foot for a goods objective with no vehicle (`carryPose`).
	var goods := layer.session.goods_scene()
	var carry := not goods.is_empty() and str(goods.get("kind", "")) == "" and _on_foot()
	if carry != _carrying:
		_carrying = carry
		CombatFx.carry(rig.body.figure, carry, &"box")
	hud.set_health(combat.health / Combat.PLAYER_MAX_HEALTH)
	hud.set_wanted(police.wanted.stars, police.wanted.seen)
	var a := combat.arsenal
	var gun := str(a.gun()["id"])
	var loaded := a.ammo_of(gun) > 0
	rig.controls.set_weapons("SWING" if a.has("bat") else "HIT", loaded, "%s %d" % [str(Weapons.spec(gun)["name"]).to_upper().left(7), a.ammo_of(gun)], a.guns().size() > 1)
	var show := arms.shown(swing.kind() == "bat") if _on_foot() else ""
	if show != _shown:
		_shown = show
		CombatFx.hold(rig.body.figure, StringName(show))
	fighters.frozen = _hitstop > 0


## Traffic stops for the police cars: they join the street life's extra obstacles (after the
## railway has set its level crossings there, so both count).
func _hook_obstacles() -> void:
	if _obstacles_hooked or life == null:
		return
	_obstacles_hooked = true
	var before := life.extra_obstacles
	life.extra_obstacles = func() -> PackedVector3Array:
		var out := (before.call() as PackedVector3Array) if before.is_valid() else PackedVector3Array()
		out.append_array(police.obstacles())
		return out


## For tests and the debug panel: the fight as the Three.js snapshot showed it.
func snapshot() -> Dictionary:
	var enemies: Array[Dictionary] = []
	for e in combat.enemies:
		if not Wanted.is_police_group(e.group):
			enemies.append({"id": e.id, "x": e.x, "z": e.z, "health": e.health, "armed": e.armed, "group": e.group, "calm": e.calm, "weapon": e.weapon})
	var crews: Array[Dictionary] = []
	for c: Dictionary in content.crews:
		crews.append({"id": c["id"], "gang": c["gang"], "x": c["x"], "z": c["z"], "street": c["street"], "out": arms.out.has(str(c["id"]))})
	var ammo := {}
	for g in combat.arsenal.guns():
		ammo[g] = combat.arsenal.ammo_of(g)
	var owned: Array[String] = []
	for id in Weapons.IDS:
		if combat.arsenal.has(id):
			owned.append(id)
	return {"health": combat.health, "ammo": combat.ammo, "enemies": enemies, "crews": crews, "weapon": str(combat.arsenal.gun()["id"]),
		"weapons": owned, "weapon_ammo": ammo, "shown": _shown, "stars": police.wanted.stars, "seen": police.wanted.seen,
		"cars": police.cars(), "officers": police.officers().size(), "last_bust": police.last_bust, "last_crime": police.last_crime}
