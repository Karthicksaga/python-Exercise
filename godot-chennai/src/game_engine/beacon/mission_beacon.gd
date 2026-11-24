class_name MissionBeacon
extends Node3D
## The marker for the current objective (the Three.js `Beacon`): a pulsing amber ring on the
## ground the size of the target's radius and a tall thin column of light seen over the roofs,
## and smaller teal rings for place entrances. Unshaded, so it reads the same at noon and night;
## hidden while the player stands inside it (its column would tint the whole view).
##
## `place_at(scene_position, radius)` / `clear()`; `set_entrances([{position, radius}])`.

const COLOUR := Color(1.0, 0.72, 0.01)
const PLACE_COLOUR := Color(0.25, 0.85, 0.8)
const COLUMN_HEIGHT := 60.0
const COLUMN_RADIUS := 0.6
const RING_HEIGHT := 0.06
const PULSE := 2.2

var ring: MeshInstance3D
var column: MeshInstance3D
var _clock := 0.0
var _entrances: Array[MeshInstance3D] = []
var _ring_material: StandardMaterial3D
var _column_material: StandardMaterial3D


static func _material(colour: Color, alpha: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.no_depth_test = false
	m.albedo_color = Color(colour, alpha)
	return m


static func _ring_mesh(material: StandardMaterial3D) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = 0.9
	t.outer_radius = 1.0
	t.rings = 48
	t.ring_segments = 6
	t.material = material
	return t


func _ready() -> void:
	name = "MissionBeacon"
	_ring_material = _material(COLOUR, 0.85)
	_column_material = _material(COLOUR, 0.28)
	ring = MeshInstance3D.new()
	ring.name = "Ring"
	ring.mesh = _ring_mesh(_ring_material)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ring)
	column = MeshInstance3D.new()
	column.name = "Column"
	var c := CylinderMesh.new()
	c.top_radius = COLUMN_RADIUS * 0.6
	c.bottom_radius = COLUMN_RADIUS
	c.height = COLUMN_HEIGHT
	c.radial_segments = 10
	c.cap_top = false
	c.cap_bottom = false
	c.material = _column_material
	column.mesh = c
	column.position.y = COLUMN_HEIGHT / 2.0
	column.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(column)
	clear()


## Put the marker at a scene position (ground height) with this radius.
func place_at(where: Vector3, radius: float) -> void:
	ring.global_position = where
	column.global_position = where + Vector3(0, COLUMN_HEIGHT / 2.0, 0)
	var r := maxf(1.5, radius)
	ring.scale = Vector3(r, RING_HEIGHT / 0.05, r)
	ring.global_position.y += 0.15
	ring.visible = true
	column.visible = true


func clear() -> void:
	ring.visible = false
	column.visible = false


func shown() -> bool:
	return ring.visible


## Place entrances (scene positions, ground height) as small rings.
func set_entrances(points: Array[Dictionary]) -> void:
	while _entrances.size() < points.size():
		var m := MeshInstance3D.new()
		m.name = "Entrance%d" % _entrances.size()
		m.mesh = _ring_mesh(_material(PLACE_COLOUR, 0.8))
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		m.top_level = true
		add_child(m)
		_entrances.append(m)
	for i in _entrances.size():
		var m := _entrances[i]
		m.visible = i < points.size()
		if m.visible:
			var p: Vector3 = points[i]["position"]
			var r: float = points[i]["radius"]
			m.global_position = p + Vector3(0, 0.12, 0)
			m.scale = Vector3(r, 1.0, r)


func _process(delta: float) -> void:
	_clock += delta
	var pulse := 0.5 + 0.5 * sin(_clock * TAU / PULSE)
	_ring_material.albedo_color.a = 0.55 + 0.4 * pulse
	_column_material.albedo_color.a = 0.18 + 0.14 * pulse
