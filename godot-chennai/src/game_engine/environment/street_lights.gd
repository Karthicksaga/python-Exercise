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

var lamps: PackedVector3Array = PackedVector3Array()
## Height of the lamp heads above the lamp points (the city's poles carry theirs higher).
var head_height: float = HEAD_HEIGHT
var night: float = 0.0
var lights: Array[OmniLight3D] = []

var _heads: MultiMeshInstance3D
var _poles: MultiMeshInstance3D = null
var _head_material: StandardMaterial3D
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
	if _poles != null:
		_poles.multimesh.instance_count = points.size()
	for i in points.size():
		_heads.multimesh.set_instance_transform(i, Transform3D(Basis(), points[i] + Vector3(0, head_height, 0)))
		if _poles != null:
			_poles.multimesh.set_instance_transform(i, Transform3D(Basis(), points[i] + Vector3(0, HEAD_HEIGHT * 0.5, 0)))
	_pick_timer = 0.0


## night 0..1 from `Lighting`; the real lights follow the lamps nearest `camera_position`.
func step(dt: float, camera_position: Vector3, night_amount: float) -> void:
	night = night_amount
	var glow := clampf((night - 0.15) / 0.85, 0.0, 1.0)
	_head_material.emission_energy_multiplier = 1.4 * glow
	_pick_timer -= dt
	if _pick_timer <= 0.0:
		_pick_timer = 0.25
		_pick(camera_position)
	for light in lights:
		light.visible = glow > 0.01 and light.has_meta(&"lamp")
		light.light_energy = 3.2 * glow


func _pick(from: Vector3) -> void:
	var order: Array[int] = []
	for i in lamps.size():
		order.append(i)
	order.sort_custom(func(a: int, b: int) -> bool: return lamps[a].distance_squared_to(from) < lamps[b].distance_squared_to(from))
	for k in lights.size():
		var light := lights[k]
		if k < order.size():
			light.position = lamps[order[k]] + Vector3(0, head_height - 0.3, 0)
			light.set_meta(&"lamp", order[k])
		elif light.has_meta(&"lamp"):
			light.remove_meta(&"lamp")


## Real lights lit now (tests: the budget).
func lit_lights() -> int:
	var n := 0
	for light in lights:
		if light.visible:
			n += 1
	return n
