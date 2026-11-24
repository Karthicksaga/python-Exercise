class_name StreetLights
extends Node3D
## Sodium street lights at night (decision G-88), cheap on a phone: every lamp head is one
## instance of an emissive MultiMesh (one draw call for all of them), glowing as night falls; only
## the few lamps nearest the camera also get a real OmniLight3D (no shadows), so per-object light
## limits and fill cost stay small. The world tells it where the lamps are (`set_lamps`), chunk by
## chunk; the stand-in poles are drawn only when asked (`with_poles`, the test ground).

const SODIUM := Color(1.0, 0.62, 0.26)
## Real lights at most (Mobile renderer: 8 omni lights per mesh; leave room for headlights).
const POOL := 6
const RANGE := 15.0
const HEAD_HEIGHT := 7.5
## The ground glow under a lamp (metres across) and how far away pools are drawn.
const POOL_SIZE := 13.0
const POOL_REACH := 140.0

var lamps: PackedVector3Array = PackedVector3Array()
## Height of the lamp heads above the lamp points (the city's poles carry theirs higher).
var head_height: float = HEAD_HEIGHT
var night: float = 0.0
var lights: Array[OmniLight3D] = []
## Real lights in use, at most POOL (quality presets lower it, G-252).
var pool: int = POOL:
	set(value):
		pool = clampi(value, 0, POOL)
		_pick_timer = 0.0

var _heads: MultiMeshInstance3D
var _poles: MultiMeshInstance3D = null
var _head_material: StandardMaterial3D
## A soft sodium pool on the ground under every lamp (G-259): one additive, unshaded MultiMesh,
## so the street reads lit at night without a per-pixel light on the merged chunk meshes.
var _pools: MultiMeshInstance3D
var _pool_material: StandardMaterial3D
var _pick_timer: float = 0.0


func _init(with_poles: bool = false) -> void:
	name = "StreetLights"
	_head_material = StandardMaterial3D.new()
	_head_material.albedo_color = Color(0.55, 0.45, 0.3)
	_head_material.emission_enabled = true
	_head_material.emission = SODIUM
	_head_material.emission_energy_multiplier = 0.0
	var head := BoxMesh.new()
	head.size = Vector3(0.5, 0.18, 0.28)
	head.material = _head_material
	_heads = _multimesh(head)
	add_child(_heads)
	_pool_material = StandardMaterial3D.new()
	_pool_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_pool_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_pool_material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_pool_material.depth_draw_mode = BaseMaterial3D.DEPTH_DRAW_DISABLED
	_pool_material.disable_fog = false
	var glow := GradientTexture2D.new()
	glow.fill = GradientTexture2D.FILL_RADIAL
	glow.fill_from = Vector2(0.5, 0.5)
	glow.fill_to = Vector2(0.5, 0.0)
	glow.width = 64
	glow.height = 64
	var g := Gradient.new()
	g.set_color(0, Color(1, 1, 1, 1))
	g.set_color(1, Color(1, 1, 1, 0))
	glow.gradient = g
	_pool_material.albedo_texture = glow
	_pool_material.albedo_color = Color(SODIUM, 0.0)
	var quad := PlaneMesh.new()
	quad.size = Vector2(POOL_SIZE, POOL_SIZE)
	quad.material = _pool_material
	_pools = _multimesh(quad)
	_pools.name = "Pools"
	_pools.visibility_range_end = POOL_REACH
	_pools.visible = false
	add_child(_pools)
	if with_poles:
		var pole_material := StandardMaterial3D.new()
		pole_material.albedo_color = Color(0.42, 0.43, 0.42)
		pole_material.roughness = 0.8
		var pole := CylinderMesh.new()
		pole.top_radius = 0.07
		pole.bottom_radius = 0.1
		pole.height = HEAD_HEIGHT
		pole.radial_segments = 6
		pole.material = pole_material
		_poles = _multimesh(pole)
		add_child(_poles)
	for i in POOL:
		var light := OmniLight3D.new()
		light.light_color = SODIUM
		light.omni_range = RANGE
		light.omni_attenuation = 1.2
		light.shadow_enabled = false
		# Not the merged chunk meshes (their glow is the ground pools); vehicles, people, props.
		light.light_cull_mask = 0xFFFFF & ~ChunkBuilder.RENDER_LAYER
		light.light_energy = 0.0
		light.visible = false
		add_child(light)
		lights.append(light)


func _multimesh(m: Mesh) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = m
	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


## Lamp positions on the ground (x, 0, z) in scene coordinates; replaces the previous set.
func set_lamps(points: PackedVector3Array) -> void:
	lamps = points
	_heads.multimesh.instance_count = points.size()
	_pools.multimesh.instance_count = points.size()
	if _poles != null:
		_poles.multimesh.instance_count = points.size()
	for i in points.size():
		_heads.multimesh.set_instance_transform(i, Transform3D(Basis(), points[i] + Vector3(0, head_height, 0)))
		_pools.multimesh.set_instance_transform(i, Transform3D(Basis(), points[i] + Vector3(0, 0.06, 0)))
		if _poles != null:
			_poles.multimesh.set_instance_transform(i, Transform3D(Basis(), points[i] + Vector3(0, HEAD_HEIGHT * 0.5, 0)))
	_pick_timer = 0.0


## night 0..1 from `Lighting`; the real lights follow the lamps nearest `camera_position`.
func step(dt: float, camera_position: Vector3, night_amount: float) -> void:
	night = night_amount
	var glow := clampf((night - 0.15) / 0.85, 0.0, 1.0)
	_head_material.emission_energy_multiplier = 1.4 * glow
	_pools.visible = glow > 0.01 and not lamps.is_empty()
	_pool_material.albedo_color = Color(SODIUM, 0.32 * glow)
	_pick_timer -= dt
	if _pick_timer <= 0.0:
		_pick_timer = 0.25
		_pick(camera_position)
	for k in lights.size():
		var light := lights[k]
		light.visible = glow > 0.01 and light.has_meta(&"lamp") and k < pool
		light.light_energy = 3.2 * glow


func _pick(from: Vector3) -> void:
	# The nearest few by one scan (no sort of every lamp; G-257): lights.size() is at most POOL.
	var best: Array[int] = []
	var best_d := PackedFloat32Array()
	for i in lamps.size():
		var d := lamps[i].distance_squared_to(from)
		if best.size() == lights.size() and d >= best_d[best.size() - 1]:
			continue
		var at := best.size()
		while at > 0 and best_d[at - 1] > d:
			at -= 1
		best.insert(at, i)
		best_d.insert(at, d)
		if best.size() > lights.size():
			best.resize(lights.size())
			best_d.resize(lights.size())
	for k in lights.size():
		var light := lights[k]
		if k < best.size():
			light.position = lamps[best[k]] + Vector3(0, head_height - 0.3, 0)
			light.set_meta(&"lamp", best[k])
		elif light.has_meta(&"lamp"):
			light.remove_meta(&"lamp")


## Real lights lit now (tests: the budget).
func lit_lights() -> int:
	var n := 0
	for light in lights:
		if light.visible:
			n += 1
	return n
