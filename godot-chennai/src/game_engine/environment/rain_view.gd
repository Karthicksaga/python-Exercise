class_name RainView
extends MeshInstance3D
## Rain streaks round the camera: one mesh, one draw call whatever the number of drops, hidden
## (no draw call) when dry. Deterministic scatter, so it looks the same on every run.

const SHADER := preload("res://src/game_engine/environment/rain.gdshader")
const BOX := Vector3(36.0, 22.0, 36.0)
const FALL := 14.0

var drops: int = 0
var _material: ShaderMaterial
var _time: float = 0.0


func _init(count: int = 1100) -> void:
	drops = count
	name = "Rain"
	var verts := PackedVector3Array()
	var uvs := PackedVector2Array()
	var indices := PackedInt32Array()
	var rng := RandomNumberGenerator.new()
	rng.seed = 12345
	for i in count:
		var p := Vector3(rng.randf() * BOX.x, rng.randf() * BOX.y, rng.randf() * BOX.z)
		var base := verts.size()
		for corner: Vector2 in [Vector2(0, 0), Vector2(1, 0), Vector2(0, 1), Vector2(1, 1)]:
			verts.append(p)
			uvs.append(corner)
		indices.append_array([base, base + 1, base + 2, base + 1, base + 3, base + 2])
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = verts
	arrays[Mesh.ARRAY_TEX_UV] = uvs
	arrays[Mesh.ARRAY_INDEX] = indices
	var m := ArrayMesh.new()
	m.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	mesh = m
	_material = ShaderMaterial.new()
	_material.shader = SHADER
	_material.set_shader_parameter(&"box", BOX)
	_material.set_shader_parameter(&"fall", FALL)
	material_override = _material
	cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	# The streaks move in the shader; never cull the mesh by its resting bounds.
	custom_aabb = AABB(Vector3(-1e5, -1e5, -1e5), Vector3(2e5, 2e5, 2e5))
	visible = false


## level 0 (hidden, no draw call) … 1 steady rain; night 0..1 dims the streaks.
func step(dt: float, camera_position: Vector3, level: float, night: float) -> void:
	visible = level > 0.01
	if not visible:
		return
	_time = fmod(_time + dt, BOX.y / FALL)
	_material.set_shader_parameter(&"time", _time)
	_material.set_shader_parameter(&"origin", camera_position)
	_material.set_shader_parameter(&"tint", Color(0.25 + 0.53 * (1.0 - night), 0.28 + 0.52 * (1.0 - night), 0.33 + 0.51 * (1.0 - night)))
	_material.set_shader_parameter(&"opacity", 0.42 * level)
