class_name StreetLights
extends Node3D
## Street lights at night (decisions G-88, G-316), cheap on a phone: every lamp is one instance of
## an additive glow MultiMesh (one draw call for all of them), glowing as night falls; only
## the few lamps nearest the camera also get a real OmniLight3D (no shadows), so per-object light
## limits and fill cost stay small. The world tells it where the lamps are (`set_lamps`), chunk by
## chunk; the stand-in poles are drawn only when asked (`with_poles`, the test ground).

## Cool white-blue LED, as on the city's new lamps; `RoadLamps.WARM` for residential streets.
const COOL := Color(0.78, 0.88, 1.0)
## Real lights at most (Mobile renderer: 8 omni lights per mesh; leave room for headlights).
const POOL := 6
const RANGE := 15.0
const HEAD_HEIGHT := 7.5

## Lamp points: x and z on the ground, y the height of the head above it (0: `head_height`).
var lamps: PackedVector3Array = PackedVector3Array()
## Height of the lamp heads above the lamp points when a point carries none (G-88's default).
var head_height: float = HEAD_HEIGHT
var night: float = 0.0
var lights: Array[OmniLight3D] = []

## One MultiMesh draws every lamp's glow (G-316): a cool white-blue core with a halo (two crossed
## upright quads) and the pool of light on the ground under it (a flat quad), all additive and
## unshaded, tinted per lamp. One draw call however many lamps.
var _glow: MultiMeshInstance3D
var _poles: MultiMeshInstance3D = null
var _glow_material: StandardMaterial3D
var _pick_timer: float = 0.0
## The pool quad's height below the head in the shared mesh (instances scale it to their own).
const GLOW_REF := 8.0
const POOL_SIZE := 9.0
const HALO_SIZE := 2.6


func _init(with_poles: bool = false) -> void:
	name = "StreetLights"
	_glow_material = StandardMaterial3D.new()
	_glow_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_glow_material.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	_glow_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_glow_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_glow_material.vertex_color_use_as_albedo = true
	_glow_material.albedo_texture = _radial()
	_glow_material.albedo_color = Color(1, 1, 1, 0.0)
	_glow_material.disable_receive_shadows = true
	_glow = _multimesh(_glow_mesh(), true)
	add_child(_glow)
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
		_poles = _multimesh(pole, false)
		add_child(_poles)
	for i in POOL:
		var light := OmniLight3D.new()
		light.light_color = COOL
		light.omni_range = RANGE
		light.omni_attenuation = 1.2
		light.shadow_enabled = false
		light.light_energy = 0.0
		light.visible = false
		add_child(light)
		lights.append(light)


## A soft round falloff, white in the middle.
static func _radial() -> GradientTexture2D:
	var g := Gradient.new()
	g.colors = PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 0.35), Color(1, 1, 1, 0)])
	g.offsets = PackedFloat32Array([0.0, 0.3, 1.0])
	var t := GradientTexture2D.new()
	t.gradient = g
	t.fill = GradientTexture2D.FILL_RADIAL
	t.fill_from = Vector2(0.5, 0.5)
	t.fill_to = Vector2(1.0, 0.5)
	t.width = 64
	t.height = 64
	return t


func _glow_mesh() -> ArrayMesh:
	var b := MeshBuilder.new()
	var h := HALO_SIZE / 2.0
	var white := Color.WHITE
	for plane in 2:
		var a := Vector3(h, 0, 0) if plane == 0 else Vector3(0, 0, h)
		var i0 := b.vertex(-a + Vector3(0, -h, 0), Vector3.UP, Vector2(0, 1), white)
		var i1 := b.vertex(a + Vector3(0, -h, 0), Vector3.UP, Vector2(1, 1), white)
		var i2 := b.vertex(a + Vector3(0, h, 0), Vector3.UP, Vector2(1, 0), white)
		var i3 := b.vertex(-a + Vector3(0, h, 0), Vector3.UP, Vector2(0, 0), white)
		b.quad(i0, i1, i2, i3)
	var p := POOL_SIZE / 2.0
	var y := -GLOW_REF + 0.14
	var j0 := b.vertex(Vector3(-p, y, -p), Vector3.UP, Vector2(0, 0), white)
	var j1 := b.vertex(Vector3(p, y, -p), Vector3.UP, Vector2(1, 0), white)
	var j2 := b.vertex(Vector3(p, y, p), Vector3.UP, Vector2(1, 1), white)
	var j3 := b.vertex(Vector3(-p, y, p), Vector3.UP, Vector2(0, 1), white)
	b.quad(j0, j1, j2, j3)
	return b.commit(_glow_material)


func _multimesh(m: Mesh, coloured: bool) -> MultiMeshInstance3D:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = coloured
	mm.mesh = m
	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


## Head height of lamp i.
func _head(i: int) -> float:
	return lamps[i].y if lamps[i].y > 0.5 else head_height


## Lamps (G-316): x and z the ground point, y the head's height above it (a point with y 0 uses
## `head_height`); `tints` colour each lamp's glow (cool white-blue, warmer on residential streets).
func set_lamps(points: PackedVector3Array, tints: PackedColorArray = PackedColorArray()) -> void:
	lamps = points
	_glow.multimesh.instance_count = points.size()
	if _poles != null:
		_poles.multimesh.instance_count = points.size()
	for i in points.size():
		var h := _head(i)
		var wide := clampf(h / 9.0, 0.8, 2.6)
		var basis := Basis.from_scale(Vector3(wide, h / GLOW_REF, wide))
		_glow.multimesh.set_instance_transform(i, Transform3D(basis, Vector3(points[i].x, h, points[i].z)))
		_glow.multimesh.set_instance_color(i, tints[i] if i < tints.size() else COOL)
		if _poles != null:
			_poles.multimesh.set_instance_transform(i, Transform3D(Basis(), Vector3(points[i].x, 0.0, points[i].z) + Vector3(0, HEAD_HEIGHT * 0.5, 0)))
	_pick_timer = 0.0


## night 0..1 from `Lighting`; the real lights follow the lamps nearest `camera_position`.
func step(dt: float, camera_position: Vector3, night_amount: float) -> void:
	night = night_amount
	var glow := clampf((night - 0.15) / 0.85, 0.0, 1.0)
	_glow_material.albedo_color = Color(1, 1, 1, 0.9 * glow)
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
			light.position = Vector3(lamps[order[k]].x, _head(order[k]) - 0.3, lamps[order[k]].z)
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
