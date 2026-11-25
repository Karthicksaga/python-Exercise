class_name HitPuffs
extends Node3D
## Where a blow lands (port of `apps/game/src/HitPuffs.ts`, decision G-432): a quick pale star
## flash and a ring of dust that spreads and fades, at the point of contact. Non-graphic on
## purpose (no blood), like the rest of the game's fighting.
##
## A pool of puffs (8 on High, 6 Medium, 4 Low: `QualitySettings` key `hit_puffs`), each two quads
## of ONE `MultiMesh` sharing one generated texture (a ring and a star on a 128 x 64 image) and
## one unshaded billboard shader: one draw call while a blow shows and none when nothing does (the
## node hides and stops processing). Nothing is allocated after `_ready`: `spawn` and the update
## write instance transforms and custom data into the arrays the multimesh already owns, and the
## oldest puff is reused when all are busy.
##
##     var puffs := HitPuffs.new()
##     scene.add_child(puffs)
##     puffs.spawn(figure.strike_point(), -facing, 1.0)   # strength 1 a punch, ~1.6 a bat

## Seconds a flash and a puff of dust last (the Three.js values).
const FLASH_TIME := 0.12
const DUST_TIME := 0.4
## The pool size at most (instances are twice this).
const MAX_POOL := 8

const SHADER_CODE := """shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, fog_disabled;
uniform sampler2D atlas : source_color, filter_linear, repeat_disable;
varying vec4 data;
void vertex() {
	data = INSTANCE_CUSTOM;
	if (data.z > 0.5) {
		MODELVIEW_MATRIX = VIEW_MATRIX * mat4(INV_VIEW_MATRIX[0], INV_VIEW_MATRIX[1], INV_VIEW_MATRIX[2], MODEL_MATRIX[3]);
		MODELVIEW_MATRIX = MODELVIEW_MATRIX * mat4(vec4(length(MODEL_MATRIX[0].xyz), 0.0, 0.0, 0.0), vec4(0.0, length(MODEL_MATRIX[1].xyz), 0.0, 0.0), vec4(0.0, 0.0, length(MODEL_MATRIX[2].xyz), 0.0), vec4(0.0, 0.0, 0.0, 1.0));
	}
}
void fragment() {
	vec2 uv = vec2((UV.x + data.y) * 0.5, UV.y);
	float a = texture(atlas, uv).a * data.w;
	ALBEDO = mix(vec3(0.79, 0.72, 0.60), vec3(1.0, 0.945, 0.78), data.y);
	ALPHA = a;
}
"""

## Puffs in use (the pool actually made), set from the quality level in `_ready`.
var pool: int = MAX_POOL
## False: the owner calls `advance(dt)` (tests, a fixed step); true: the node does it itself.
var auto_advance: bool = true
## The multimesh node (tests read its instance count).
var view: MultiMeshInstance3D = null
var multi: MultiMesh = null

var _age: PackedFloat32Array = PackedFloat32Array()
var _pos: PackedVector3Array = PackedVector3Array()
var _normal: PackedVector3Array = PackedVector3Array()
var _size: PackedFloat32Array = PackedFloat32Array()
## What was last written to each instance (the renderer holds the same; a headless run has none).
var _xf: Array[Transform3D] = []
var _alpha: PackedFloat32Array = PackedFloat32Array()
var _next: int = 0
var _live: int = 0
static var _atlas: ImageTexture = null
static var _shader: Shader = null


func _init() -> void:
	name = "HitPuffs"
	top_level = true
	set_process(false)


func _ready() -> void:
	if multi != null:
		return
	pool = clampi(int(QualitySettings.shared().current().get("hit_puffs", MAX_POOL)), 1, MAX_POOL)
	_build()
	# A script with _process starts processing on ready; nothing runs until a blow lands.
	set_process(false)


## Makes the pool (called by `_ready`; tests may set `pool` first and call it themselves).
func _build() -> void:
	_age.resize(pool)
	_age.fill(INF)
	_pos.resize(pool)
	_normal.resize(pool)
	_size.resize(pool)
	_xf.resize(pool * 2)
	_alpha.resize(pool * 2)
	var quad := QuadMesh.new()
	quad.size = Vector2.ONE
	var mat := ShaderMaterial.new()
	mat.shader = _the_shader()
	mat.set_shader_parameter(&"atlas", _the_atlas())
	mat.render_priority = 2
	quad.material = mat
	multi = MultiMesh.new()
	multi.transform_format = MultiMesh.TRANSFORM_3D
	multi.use_custom_data = true
	multi.mesh = quad
	multi.instance_count = pool * 2
	for i in multi.instance_count:
		_write(i, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO), Color(1, 0, 0, 0))
	view = MultiMeshInstance3D.new()
	view.name = "Puffs"
	view.multimesh = multi
	view.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	view.custom_aabb = AABB(Vector3(-4000, -4000, -4000), Vector3(8000, 8000, 8000))
	view.visible = false
	add_child(view)


static func _the_shader() -> Shader:
	if _shader == null:
		_shader = Shader.new()
		_shader.code = SHADER_CODE
	return _shader


## One 128 x 64 image: a soft dust ring on the left, a four-point star on the right.
static func _the_atlas() -> ImageTexture:
	if _atlas != null:
		return _atlas
	var img := Image.create(128, 64, false, Image.FORMAT_RGBA8)
	for y in 64:
		for x in 128:
			var cell := x / 64
			var u := (float(x % 64) + 0.5) / 32.0 - 1.0
			var v := (float(y) + 0.5) / 32.0 - 1.0
			var r := sqrt(u * u + v * v)
			var a := 0.0
			if cell == 0:
				# Dust: a soft ring with a hazy inside.
				var ring := exp(-pow((r - 0.62) / 0.2, 2.0))
				a = clampf(ring * 0.95 + (1.0 - smoothstep(0.0, 0.8, r)) * 0.25, 0.0, 1.0) * (1.0 - smoothstep(0.82, 1.0, r))
			else:
				# Star: bright core, four thin points along the axes.
				var core := exp(-r * r * 38.0)
				var arms := 1.0 / (1.0 + 90.0 * absf(u * v)) * (1.0 - smoothstep(0.35, 0.98, r))
				a = clampf(core + arms * 0.9, 0.0, 1.0)
			img.set_pixel(x, y, Color(1, 1, 1, a))
	_atlas = ImageTexture.create_from_image(img)
	return _atlas


## A blow lands at `position` (scene space) on a surface facing `normal` (unit, away from what
## was hit); `strength` 1 a punch, about 1.6 a bat, less for a small hit.
func spawn(position: Vector3, normal: Vector3, strength: float) -> void:
	if multi == null:
		_build()
	var i := _next
	_next = (_next + 1) % pool
	_age[i] = 0.0
	_pos[i] = to_local(position) if is_inside_tree() else position
	_normal[i] = normal.normalized() if normal.length_squared() > 0.0001 else Vector3.UP
	_size[i] = clampf(strength, 0.3, 3.0)
	view.visible = true
	_place(i)
	_live = _count()
	if auto_advance and is_inside_tree():
		set_process(true)


## How many blows are showing now.
func showing() -> int:
	return _live


func _count() -> int:
	var n := 0
	for i in pool:
		if _age[i] < DUST_TIME:
			n += 1
	return n


func _process(delta: float) -> void:
	if auto_advance:
		advance(delta)


## Once per frame, by the owner (or the node itself with `auto_advance`).
func advance(dt: float) -> void:
	if _live == 0:
		return
	for i in pool:
		if _age[i] >= DUST_TIME:
			continue
		_age[i] += dt
		if _age[i] >= DUST_TIME:
			_age[i] = INF
			_hide(i)
		else:
			_place(i)
	_live = _count()
	if _live == 0:
		view.visible = false
		set_process(false)


func _hide(i: int) -> void:
	_write(i * 2, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO), Color(1, 0, 0, 0))
	_write(i * 2 + 1, Transform3D(Basis.from_scale(Vector3.ZERO), Vector3.ZERO), Color(1, 1, 1, 0))


func _write(slot: int, xf: Transform3D, data: Color) -> void:
	multi.set_instance_transform(slot, xf)
	multi.set_instance_custom_data(slot, data)
	_xf[slot] = xf
	_alpha[slot] = data.a


## The dust ring's and the flash's last transform and opacity of puff `i` (tests, debugging).
func ring_transform(i: int) -> Transform3D:
	return _xf[i * 2]


func flash_transform(i: int) -> Transform3D:
	return _xf[i * 2 + 1]


func ring_alpha(i: int) -> float:
	return _alpha[i * 2]


func flash_alpha(i: int) -> float:
	return _alpha[i * 2 + 1]


## Writes puff `i`'s two quads: the dust ring (lies on the surface, spreads, drifts up) and the
## star flash (faces the camera, grows, fades in 0.12 s).
func _place(i: int) -> void:
	var age := _age[i]
	var size := _size[i]
	var dust := clampf(age / DUST_TIME, 0.0, 1.0)
	var flash := clampf(age / FLASH_TIME, 0.0, 1.0)
	var at := _pos[i]
	# Dust ring: its quad faces along the surface normal.
	var n := _normal[i]
	var side := n.cross(Vector3.UP if absf(n.y) < 0.95 else Vector3.RIGHT).normalized()
	var up := n.cross(side)
	var d := (0.22 + 0.55 * sqrt(dust)) * size
	var ring_at := at + Vector3(0.0, 0.15 * dust * size, 0.0) + n * 0.03
	_write(i * 2, Transform3D(Basis(side * d, up * d, n * d), ring_at), Color(dust, 0.0, 0.0, 0.55 * (1.0 - dust) * (1.0 - dust)))
	# Flash: a billboard.
	var f := (0.18 + 0.32 * flash) * size
	if flash < 1.0:
		_write(i * 2 + 1, Transform3D(Basis.from_scale(Vector3(f, f, f)), at + n * 0.06), Color(flash, 1.0, 1.0, 0.9 * (1.0 - flash)))
	else:
		_write(i * 2 + 1, Transform3D(Basis.from_scale(Vector3.ZERO), at), Color(1, 1, 1, 0))
