class_name Fighters
extends Node3D
## The visible side of the fight (port of `apps/game/src/Fighters.ts`, G-416): a figure of the
## cast for every enemy and officer the combat rules hold, placed between the last two fixed
## steps, walking at their speed, a blow drawn when they wind up (`CombatFx.strike`), a fall when
## they go down (`PersonView.play_fall`, the knockdown API), and bullet tracers. Enemies are grown
## men of the street cast (never a child or teen: `CastPicker.is_minor`), officers the police
## people; a gang member wears a band in the gang's colour round the arm.
##
## Views are made during loading (`prepare`) and reused: nothing is instantiated in play unless
## more fighters are out than were warmed. At most `cap` figures are drawn (the nearest); the rest
## of the rules' enemies still fight (quality presets lower it: Low draws fewer).

const ENEMY_CAST: PackedStringArray = ["young-man", "electrician", "delivery-rider", "middle-aged-man"]
const POLICE_CAST: PackedStringArray = ["police-constable", "police-inspector"]
## Views made ahead of play per person.
const WARM := 3
## Figures drawn at most (High); `cap` may lower it.
const CAP := 18
## Tracers drawn at once and their life, seconds.
const TRACERS := 12
const TRACER_LIFE := 0.07

var combat: Combat
var pool: PeoplePool = null
var cap: int = CAP
## Hit-stop: the figures hold their pose while true.
var frozen: bool = false
## False: no figures at all (headless rules tests on a flat ground).
var load_models: bool = true
## Ground height under a world point (scene y), or 0 when unknown.
var ground_y: Callable = Callable()
var _views: Dictionary[int, PersonView] = {}
var _free: Dictionary[String, Array] = {}
var _prev: Dictionary[int, Vector3] = {}
var _now: Dictionary[int, Vector3] = {}
var _down: Dictionary[int, bool] = {}
var _bands: Dictionary[int, MeshInstance3D] = {}
var _tracers: Array[MeshInstance3D] = []
var _tracer_life: PackedFloat32Array = PackedFloat32Array()
var _next_tracer := 0
var _band_mesh: BoxMesh = null
var _band_materials: Dictionary[int, StandardMaterial3D] = {}
## Physics frames since the last fixed step (interpolation).
var _since := 0.0
var _step_dt := 1.0 / 60.0
var _minors: Dictionary = {}


static func make(rules: Combat, people: PeoplePool) -> Fighters:
	var f := Fighters.new()
	f.name = "Fighters"
	f.combat = rules
	f.pool = people
	return f


## Loading work: the cast's scenes and the warm views. "" or the error.
func prepare() -> String:
	_build_tracers()
	if not load_models:
		return ""
	if pool == null:
		pool = PeoplePool.new()
		add_child(pool)
	var ids := PackedStringArray()
	ids.append_array(ENEMY_CAST)
	ids.append_array(POLICE_CAST)
	var err := await pool.prepare(ids)
	if err != "":
		return err
	for id in ids:
		var e := pool.manifest.entry(id)
		if CastPicker.is_minor(e):
			_minors[id] = true
			continue
		for i in WARM:
			var v := pool.make_view(id)
			if v != null:
				v.visible = false
				add_child(v)
				_give_back(v)
	return ""


func _build_tracers() -> void:
	if not _tracers.is_empty():
		return
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.035, 0.035, 1.0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = Color("#ffe08a")
	mesh.material = mat
	for i in TRACERS:
		var t := MeshInstance3D.new()
		t.mesh = mesh
		t.visible = false
		t.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(t)
		_tracers.append(t)
		_tracer_life.append(0.0)


## Who plays an enemy: officers the police people, everyone else a grown man of the street cast.
func person_for(e: Combat.Enemy) -> String:
	var cast := POLICE_CAST if Wanted.is_police_group(e.group) else ENEMY_CAST
	var id := cast[e.id % cast.size()]
	# A boss is the older man of the cast.
	if e.max_health > 150.0 and not Wanted.is_police_group(e.group):
		id = ENEMY_CAST[ENEMY_CAST.size() - 1]
	return id


func _take(id: String) -> PersonView:
	if _minors.has(id) or pool == null:
		return null
	var list: Array = _free.get(id, [])
	if not list.is_empty():
		return list.pop_back() as PersonView
	var v := pool.make_view(id)
	if v != null:
		add_child(v)
	return v


func _give_back(v: PersonView) -> void:
	v.visible = false
	if not _free.has(v.person_id):
		_free[v.person_id] = []
	_free[v.person_id].append(v)


## After each fixed step of the rules: note where everyone is (drawn in between by `_process`).
func after_step(dt: float) -> void:
	_step_dt = maxf(0.001, dt)
	_since = 0.0
	var alive: Dictionary[int, bool] = {}
	for e in combat.enemies:
		alive[e.id] = true
		var p := Vector3(e.x, 0.0, e.z)
		_prev[e.id] = _now.get(e.id, p)
		_now[e.id] = Vector3(e.x, e.heading, e.z)
	for id: int in _now.keys():
		if not alive.has(id):
			_now.erase(id)
			_prev.erase(id)
			_down.erase(id)
			var v: PersonView = _views.get(id)
			if v != null:
				_views.erase(id)
				_hide_band(id)
				CombatFx.hold(v, &"")
				_give_back(v)


func _process(dt: float) -> void:
	_since += dt
	for i in _tracers.size():
		if _tracer_life[i] > 0.0:
			_tracer_life[i] -= dt
			if _tracer_life[i] <= 0.0:
				_tracers[i].visible = false
	if not load_models or combat == null:
		return
	var camera := get_viewport().get_camera_3d()
	var eye := camera.global_position if camera != null else Vector3.ZERO
	var t := clampf(_since / _step_dt, 0.0, 1.0)
	# The nearest `cap` are drawn.
	var order: Array[Combat.Enemy] = combat.enemies.duplicate()
	if order.size() > cap:
		var me := WorldOrigin.to_world(eye)
		order.sort_custom(func(a: Combat.Enemy, b: Combat.Enemy) -> bool: return Vector2(a.x, a.z).distance_squared_to(me) < Vector2(b.x, b.z).distance_squared_to(me))
	for i in order.size():
		var e := order[i]
		var v: PersonView = _views.get(e.id)
		if i >= cap:
			if v != null:
				v.visible = false
			continue
		if v == null:
			v = _take(person_for(e))
			if v == null:
				continue
			_views[e.id] = v
			v.visible = true
			v.play(&"idle")
			if e.weapon == "bat":
				CombatFx.hold(v, &"bat")
			if e.tint >= 0 and not Wanted.is_police_group(e.group):
				_band(e.id, v, e.tint)
			v.scale = Vector3.ONE * (1.12 if e.max_health > 150.0 else 1.0)
		v.visible = true
		var a: Vector3 = _prev.get(e.id, Vector3(e.x, 0, e.z))
		var b: Vector3 = _now.get(e.id, Vector3(e.x, e.heading, e.z))
		var x := lerpf(a.x, b.x, t)
		var z := lerpf(a.z, b.z, t)
		var y := float(ground_y.call(x, z)) if ground_y.is_valid() else 0.0
		v.global_transform = Transform3D(Basis(Vector3.UP, e.heading).scaled(v.scale), WorldOrigin.to_scene_xz(x, z, y))
		if e.health <= 0.0:
			if not _down.has(e.id):
				_down[e.id] = true
				var away := Vector3(-sin(e.heading), 0.0, -cos(e.heading)) * -3.0 + Vector3(0, 1.5, 0)
				v.play(&"idle")
				v.play_fall(away)
				CombatFx.hold(v, &"")
		else:
			var gait: StringName = &"idle" if e.speed < 0.2 else (&"walk" if e.speed < 2.5 else &"run")
			if not CombatFx.striking(v):
				v.play(gait, e.speed)
			if e.armed and Weapons.is_gun(e.weapon):
				CombatFx.hold(v, StringName(e.weapon) if e.alerted and e.speed == 0.0 else &"")
		v.advance(0.0 if frozen else dt, eye.distance_to(v.global_position), true)


## An enemy winds up a punch or a swing (the blow lands `Strikes.windup` later).
func windup(e: Combat.Enemy) -> void:
	var v: PersonView = _views.get(e.id)
	if v != null:
		CombatFx.strike(v, StringName(Strikes.strike_kind(e.weapon)), 1)


## The figure of an enemy (tests, effects), or null.
func view_of(e: Combat.Enemy) -> PersonView:
	return _views.get(e.id)


func shown() -> int:
	var n := 0
	for id: int in _views:
		if _views[id].visible:
			n += 1
	return n


## The person ids drawn now (tests: never a minor).
func people() -> PackedStringArray:
	var out := PackedStringArray()
	for id: int in _views:
		out.append(_views[id].person_id)
	return out


## A bullet's path for a moment (world metres, at chest height above `y`).
func tracer(from: Vector2, to: Vector2, y: float) -> void:
	var length := from.distance_to(to)
	if length < 0.5 or _tracers.is_empty():
		return
	var t := _tracers[_next_tracer]
	_tracer_life[_next_tracer] = TRACER_LIFE
	_next_tracer = (_next_tracer + 1) % _tracers.size()
	var mid := (from + to) * 0.5
	t.global_transform = Transform3D(Basis(Vector3.UP, atan2(to.x - from.x, to.y - from.y)).scaled(Vector3(1, 1, length)), WorldOrigin.to_scene_xz(mid.x, mid.y, y + 1.36))
	t.visible = true


func tracers_shown() -> int:
	var n := 0
	for t in _tracers:
		if t.visible:
			n += 1
	return n


## A band in the gang's colour round the left upper arm.
func _band(id: int, v: PersonView, tint: int) -> void:
	if v.poser == null:
		return
	if _band_mesh == null:
		_band_mesh = BoxMesh.new()
		_band_mesh.size = Vector3(0.13, 0.07, 0.13)
	var mat: StandardMaterial3D = _band_materials.get(tint)
	if mat == null:
		mat = StandardMaterial3D.new()
		mat.albedo_color = Color.hex((tint << 8) | 0xff)
		mat.roughness = 0.8
		_band_materials[tint] = mat
	var mi: MeshInstance3D = _bands.get(id)
	if mi == null:
		mi = MeshInstance3D.new()
		mi.mesh = _band_mesh
		mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		_bands[id] = mi
	mi.material_override = mat
	var attach := v.poser.skeleton.get_node_or_null(^"GangBand") as BoneAttachment3D
	if attach == null:
		attach = BoneAttachment3D.new()
		attach.name = "GangBand"
		v.poser.skeleton.add_child(attach)
		attach.bone_idx = v.poser.bone(PoseRig.ARM[0])
	if mi.get_parent() != null:
		mi.get_parent().remove_child(mi)
	attach.add_child(mi)
	# Halfway down the upper arm (the bone points along its own +Y).
	var length := v.poser.pose(PoseRig.ARM[0]).origin.distance_to(v.poser.pose(PoseRig.FOREARM[0]).origin)
	mi.transform = Transform3D(Basis.IDENTITY.scaled(Vector3.ONE / maxf(0.001, v.poser.to_fig.basis.get_scale().x)), Vector3(0, length * 0.45, 0))


func _hide_band(id: int) -> void:
	var mi: MeshInstance3D = _bands.get(id)
	if mi != null and mi.get_parent() != null:
		mi.get_parent().remove_child(mi)
