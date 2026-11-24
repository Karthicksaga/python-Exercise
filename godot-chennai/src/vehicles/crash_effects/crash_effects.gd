class_name CrashEffects
extends Node3D
## What a crash looks like (decision G-272): sparks and glass shards thrown from the contact
## point, and smoke from wrecked vehicles. Pooled meshes, not particle nodes: three
## `MultiMeshInstance3D`s (sparks, glass, smoke) with fixed instance counts, moved on the CPU from
## preallocated packed arrays, so a crash allocates nothing, nothing is drawn while no piece is
## alive (the three nodes are hidden), and the motion runs headless (tested in game time).
## Phone cost when active: three draw calls; ~0.05 ms for the 120 instances (measured, G-273).
##
## Positions are local to this node; the composition root puts it in `WorldOrigin.GROUP`, so a
## recentre moves the pieces with the world.

const SPARKS := 48
const SHARDS := 48
const PUFFS := 24
## Instances in each pool's multimesh (the largest pool).
const INSTANCES := 48
const GRAVITY := 9.8
## Life of a spark, a shard, a puff (seconds, randomised ±30 %).
const SPARK_LIFE := 0.45
const SHARD_LIFE := 1.4
const PUFF_LIFE := 2.2
## Shards bounce off the ground (local y of the contact point) keeping this much speed.
const SHARD_BOUNCE := 0.3
## A wrecked vehicle puffs this often (seconds); at most this many vehicles smoke at once.
const PUFF_EVERY := 0.28
const SMOKERS := 4

enum Pool { SPARK, SHARD, PUFF }

var _nodes: Array[MultiMeshInstance3D] = []
## Every piece of the three pools in flat arrays (members, so writes stay in place: a packed
## array taken out of a container would be copied on write). Pool p is [_base[p], _base[p+1]).
var _pos := PackedVector3Array()
var _vel := PackedVector3Array()
var _age := PackedFloat32Array()
var _life := PackedFloat32Array()
## Ground height (local y) under each piece, for sparks and shards to land on.
var _floor := PackedFloat32Array()
var _base: PackedInt32Array = [0, SPARKS, SPARKS + SHARDS, SPARKS + SHARDS + PUFFS]
var _next: PackedInt32Array = [0, 0, 0]
## The multimesh buffer (12 transform + 4 colour floats per instance), a member so the writes
## stay in place (a packed array passed as an argument would be copied on its first write); every
## pool's multimesh has `INSTANCES` instances so this one buffer fits each, uploaded in one call
## per pool and frame.
var _buf := PackedFloat32Array()
var _alive: PackedInt32Array = [0, 0, 0]
## Pieces spawned in each pool since its last step (an idle pool is skipped).
var _spawned: PackedInt32Array = [0, 0, 0]
var _smokers: Array[Node3D] = []
var _smoke_at: PackedVector3Array = []
var _smoke_clock: PackedFloat32Array = []
var _rng := RandomNumberGenerator.new()
var _warm_frames := 2


func _init() -> void:
	name = "CrashEffects"
	_rng.seed = 7
	for p in 3:
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.use_colors = true
		mm.mesh = _mesh(p)
		mm.instance_count = INSTANCES
		mm.visible_instance_count = 0
		var node := MultiMeshInstance3D.new()
		node.name = ["Sparks", "Glass", "Smoke"][p]
		node.multimesh = mm
		node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		# Never culled by the stale bounds of last frame's pieces.
		node.custom_aabb = AABB(Vector3(-200, -50, -200), Vector3(400, 100, 400))
		add_child(node)
		_nodes.append(node)
	var total := SPARKS + SHARDS + PUFFS
	_pos.resize(total)
	_vel.resize(total)
	_age.resize(total)
	_life.resize(total)
	_floor.resize(total)
	_buf.resize(INSTANCES * 16)
	_smokers.resize(SMOKERS)
	_smoke_at.resize(SMOKERS)
	_smoke_clock.resize(SMOKERS)


func _ready() -> void:
	# Warm the three materials (Compatibility compiles a shader on its first draw): one piece
	# each, far below the ground, for the first two frames.
	for p in 3:
		var mm := _nodes[p].multimesh
		mm.visible_instance_count = 1
		mm.set_instance_transform(0, Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * 0.01), Vector3(0, -40, 0)))
		mm.set_instance_color(0, Color(1, 1, 1, 0))


static func _mesh(pool: int) -> Mesh:
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	match pool:
		Pool.SPARK:
			# Hot metal: unshaded so it reads at noon and glows at night; no transparency.
			mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
			var spark := BoxMesh.new()
			spark.size = Vector3(0.03, 0.03, 0.22)
			spark.material = mat
			return spark
		Pool.SHARD:
			mat.metallic = 0.6
			mat.roughness = 0.08
			var shard := BoxMesh.new()
			shard.size = Vector3(0.12, 0.01, 0.09)
			shard.material = mat
			return shard
	# Smoke: a soft grey ball, alpha-blended (few, small: little overdraw on a phone).
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.cull_mode = BaseMaterial3D.CULL_DISABLED
	var ball := SphereMesh.new()
	ball.radius = 0.5
	ball.height = 1.0
	ball.radial_segments = 8
	ball.rings = 4
	ball.material = mat
	return ball


## Throw pieces from a contact `point` (scene space) along `normal` (from the other body towards
## the vehicle hit): `strength` 0..1, `sparks` and `shards` pieces (clamped to the pools).
func burst(point: Vector3, normal: Vector3, strength: float, sparks: int, shards: int) -> void:
	var at := to_local(point)
	var n := normal.normalized() if normal.length_squared() > 1e-6 else Vector3.UP
	var s := clampf(strength, 0.0, 1.0)
	for i in mini(sparks, SPARKS):
		var dir := (n + _scatter(0.9)).normalized()
		dir.y = absf(dir.y) * 0.6 + 0.15
		_spawn(Pool.SPARK, at, dir * _rng.randf_range(3.0, 6.0 + 6.0 * s), SPARK_LIFE, at.y - 0.4)
	for i in mini(shards, SHARDS):
		var dir := (n * 0.6 + _scatter(1.0)).normalized()
		dir.y = absf(dir.y) + 0.3
		_spawn(Pool.SHARD, at + Vector3(0, 0.4, 0), dir * _rng.randf_range(1.5, 3.0 + 3.5 * s), SHARD_LIFE, at.y - 0.45)


## Smoke from a wrecked vehicle, from `local` (its own frame: the engine bay) until it is freed
## or `stop_smoke` is called. At most `SMOKERS` at once; the oldest gives way.
func smoke(vehicle: Node3D, local: Vector3) -> void:
	var slot := _smokers.find(vehicle)
	if slot < 0:
		slot = _smokers.find(null)
	if slot < 0:
		slot = 0
	_smokers[slot] = vehicle
	_smoke_at[slot] = local
	_smoke_clock[slot] = 0.0


func stop_smoke(vehicle: Node3D) -> void:
	var slot := _smokers.find(vehicle)
	if slot >= 0:
		_smokers[slot] = null


## Pieces alive in a pool (tests, the budget check).
func alive(pool: Pool) -> int:
	return _alive[pool]


## Vehicles smoking now.
func smoking() -> int:
	var n := 0
	for v in _smokers:
		if v != null and is_instance_valid(v):
			n += 1
	return n


func _scatter(r: float) -> Vector3:
	return Vector3(_rng.randf_range(-r, r), _rng.randf_range(-r, r), _rng.randf_range(-r, r))


func _spawn(pool: int, at: Vector3, vel: Vector3, life: float, ground: float) -> void:
	var n := _base[pool + 1] - _base[pool]
	var i := _base[pool] + _next[pool]
	_next[pool] = (_next[pool] + 1) % n
	_pos[i] = at
	_vel[i] = vel
	_age[i] = 0.0
	_life[i] = life * _rng.randf_range(0.7, 1.3)
	_floor[i] = ground
	_spawned[pool] += 1


func _process(dt: float) -> void:
	step(dt)


## Advance every piece by `dt` seconds (the frame; tests call it in game time).
func step(dt: float) -> void:
	if _warm_frames > 0:
		_warm_frames -= 1
		if _warm_frames == 0:
			for p in 3:
				_nodes[p].multimesh.visible_instance_count = 0
		return
	_emit_smoke(dt)
	for p in 3:
		_step_pool(p, dt)


func _emit_smoke(dt: float) -> void:
	for k in SMOKERS:
		var v := _smokers[k]
		if v == null:
			continue
		if not is_instance_valid(v) or not v.is_inside_tree():
			_smokers[k] = null
			continue
		_smoke_clock[k] -= dt
		if _smoke_clock[k] > 0.0:
			continue
		_smoke_clock[k] = PUFF_EVERY * _rng.randf_range(0.8, 1.2)
		var at := to_local(v.global_transform * _smoke_at[k])
		_spawn(Pool.PUFF, at, Vector3(_rng.randf_range(-0.2, 0.2), _rng.randf_range(0.9, 1.4), _rng.randf_range(-0.2, 0.2)), PUFF_LIFE, at.y)


func _step_pool(p: int, dt: float) -> void:
	if _alive[p] == 0 and _spawned[p] == 0:
		return
	_spawned[p] = 0
	var mm := _nodes[p].multimesh
	var shown := 0
	for i in range(_base[p], _base[p + 1]):
		if _age[i] >= _life[i]:
			continue
		var a := _age[i] + dt
		_age[i] = a
		if a >= _life[i]:
			continue
		var v := _vel[i]
		var x := _pos[i]
		var t := a / _life[i]
		var xf := Transform3D.IDENTITY
		var c := Color.WHITE
		match p:
			Pool.SPARK:
				v.y -= GRAVITY * dt
				x += v * dt
				if x.y < _floor[i]:
					x.y = _floor[i]
					v *= 0.4
				# Stretched along the motion, white-yellow cooling to red.
				var look := v.normalized() if v.length_squared() > 0.01 else Vector3.FORWARD
				xf = Transform3D(_basis_along(look).scaled(Vector3(1, 1, 0.6 + 0.4 * (1.0 - t))), x)
				c = Color(1.0, lerpf(0.95, 0.35, t), lerpf(0.6, 0.05, t))
			Pool.SHARD:
				v.y -= GRAVITY * dt
				x += v * dt
				if x.y < _floor[i]:
					x.y = _floor[i]
					v = Vector3(v.x * SHARD_BOUNCE, -v.y * SHARD_BOUNCE, v.z * SHARD_BOUNCE)
				var spin := a * (9.0 + float(i % 5) * 3.0)
				xf = Transform3D(Basis(Vector3(0.3, 1, 0.5).normalized(), spin + float(i)), x)
				c = Color(0.82, 0.93, 0.97) if i % 3 != 0 else Color(0.95, 0.55, 0.2)
			_:
				v *= 1.0 - 0.6 * dt
				x += v * dt
				var size := lerpf(0.35, 1.5, t)
				xf = Transform3D(Basis.IDENTITY.scaled(Vector3.ONE * size), x)
				var fade := (1.0 - t) * minf(1.0, t * 6.0)
				c = Color(0.2, 0.2, 0.21, 0.55 * fade)
		_vel[i] = v
		_pos[i] = x
		# Live pieces are packed at the front so the draw covers only them.
		var o := shown * 16
		var b := xf.basis
		_buf[o] = b.x.x
		_buf[o + 1] = b.y.x
		_buf[o + 2] = b.z.x
		_buf[o + 3] = xf.origin.x
		_buf[o + 4] = b.x.y
		_buf[o + 5] = b.y.y
		_buf[o + 6] = b.z.y
		_buf[o + 7] = xf.origin.y
		_buf[o + 8] = b.x.z
		_buf[o + 9] = b.y.z
		_buf[o + 10] = b.z.z
		_buf[o + 11] = xf.origin.z
		_buf[o + 12] = c.r
		_buf[o + 13] = c.g
		_buf[o + 14] = c.b
		_buf[o + 15] = c.a
		shown += 1
	if shown > 0:
		RenderingServer.multimesh_set_buffer(mm.get_rid(), _buf)
	mm.visible_instance_count = shown
	_nodes[p].visible = shown > 0
	_alive[p] = shown


static func _basis_along(dir: Vector3) -> Basis:
	var up := Vector3.UP if absf(dir.y) < 0.95 else Vector3.RIGHT
	var x := up.cross(dir).normalized()
	var y := dir.cross(x)
	return Basis(x, y, dir)
