class_name TempleProps
extends Node3D
## The two small things the temple visit puts on the ground (G-483): the sandal stand at the gate
## and the standing brass lamp inside it. Original, simple shapes (a wooden stand with rows of
## plain sandals, a lamp on a stem with a bowl of flames); the sanctum is never modelled and no
## deity figure or image is made (the landmark rule, docs/landmarks.md). Each is one mesh; the
## flame is a second, glowing one shown when the lamp is lit, with one small warm light.
## Placed by world position like the landmarks: the floating origin moves them.

const NEAR_VISIBLE := 260.0

var stand: Node3D
var lamp: Node3D
var _flame: MeshInstance3D
var _light: OmniLight3D
var _player_pair: MeshInstance3D
var stand_world: Vector2 = Vector2.ZERO
var lamp_world: Vector2 = Vector2.ZERO
var _stand_yaw: float = 0.0
var _lit: bool = false


## `stand_at` and `lamp_at` in world metres; the stand faces `gate` (the way people come from).
static func make(stand_at: Vector2, lamp_at: Vector2, face: Vector2) -> TempleProps:
	var p := TempleProps.new()
	p.name = "TempleProps"
	p.stand_world = stand_at
	p.lamp_world = lamp_at
	var d := face - stand_at
	p._stand_yaw = atan2(-d.x, -d.y) if d.length() > 0.01 else 0.0
	p._build()
	return p


func _build() -> void:
	stand = Node3D.new()
	stand.name = "SandalStand"
	add_child(stand)
	var rack := PropMesh.new()
	var wood := Color("#6b4a2f")
	var wood_dark := Color("#4d3421")
	# Four posts, three shelves.
	for x: float in [-0.95, 0.95]:
		for z: float in [-0.22, 0.22]:
			rack.box(Vector3(0.07, 1.05, 0.07), Vector3(x, 0.525, z), wood_dark)
	var pairs: Array[Color] = [Color("#9a7b4f"), Color("#3f5f7a"), Color("#b0664a"), Color("#6f7d58"), Color("#d6c8a0"), Color("#555555")]
	var n := 0
	for shelf in 3:
		var y := 0.12 + shelf * 0.38
		rack.box(Vector3(2.0, 0.04, 0.5), Vector3(0.0, y, 0.0), wood)
		for k in 6:
			var x := -0.8 + k * 0.32
			var c := pairs[(n * 5 + shelf) % pairs.size()]
			n += 1
			# A pair: two flat soles with a strap, set side by side.
			rack.box(Vector3(0.1, 0.03, 0.26), Vector3(x - 0.065, y + 0.035, 0.0), c)
			rack.box(Vector3(0.1, 0.03, 0.26), Vector3(x + 0.065, y + 0.035, 0.0), c)
			rack.box(Vector3(0.09, 0.02, 0.06), Vector3(x - 0.065, y + 0.06, 0.04), c.darkened(0.25))
			rack.box(Vector3(0.09, 0.02, 0.06), Vector3(x + 0.065, y + 0.06, 0.04), c.darkened(0.25))
	rack.box(Vector3(2.1, 0.05, 0.6), Vector3(0.0, 1.07, 0.0), wood)
	_mesh(stand, rack.commit())
	# The player's own pair, on the top shelf, shown once the sandals are left.
	var mine := PropMesh.new()
	mine.box(Vector3(0.11, 0.035, 0.28), Vector3(-0.07, 0.0, 0.0), Color("#e8e2d0"))
	mine.box(Vector3(0.11, 0.035, 0.28), Vector3(0.07, 0.0, 0.0), Color("#e8e2d0"))
	_player_pair = _mesh(stand, mine.commit())
	_player_pair.position = Vector3(0.0, 0.12 + 2 * 0.38 + 0.055, 0.0)
	_player_pair.visible = false
	lamp = Node3D.new()
	lamp.name = "StandardLamp"
	add_child(lamp)
	var brass := Color("#b88a2e")
	var brass_dark := Color("#8f6a20")
	var body := PropMesh.new()
	body.cylinder(0.2, 0.26, 0.07, Vector3.ZERO, brass_dark, 16)
	body.cylinder(0.035, 0.07, 0.55, Vector3(0, 0.07, 0), brass, 10)
	body.ellipsoid(Vector3(0.09, 0.07, 0.09), Vector3(0, 0.66, 0), brass)
	body.cylinder(0.035, 0.05, 0.4, Vector3(0, 0.7, 0), brass, 10)
	body.ellipsoid(Vector3(0.07, 0.06, 0.07), Vector3(0, 1.14, 0), brass)
	body.cylinder(0.2, 0.05, 0.09, Vector3(0, 1.12, 0), brass, 16)
	# Five wick cups round the bowl.
	for k in 5:
		var a := TAU * k / 5.0
		body.cylinder(0.035, 0.025, 0.04, Vector3(cos(a) * 0.17, 1.2, sin(a) * 0.17), brass_dark, 8)
	body.cylinder(0.02, 0.03, 0.06, Vector3(0, 1.21, 0), brass_dark, 8)
	_mesh(lamp, body.commit())
	var flames := PropMesh.new()
	for k in 5:
		var a := TAU * k / 5.0
		flames.ellipsoid(Vector3(0.022, 0.055, 0.022), Vector3(cos(a) * 0.17, 1.28, sin(a) * 0.17), Color("#ffc65a"))
	flames.ellipsoid(Vector3(0.025, 0.06, 0.025), Vector3(0, 1.3, 0), Color("#ffd98a"))
	_flame = _mesh(lamp, flames.commit(1.0))
	_flame.visible = false
	_light = OmniLight3D.new()
	_light.name = "Glow"
	_light.light_color = Color("#ffb347")
	_light.light_energy = 0.9
	_light.omni_range = 5.0
	_light.position = Vector3(0, 1.35, 0)
	_light.shadow_enabled = false
	_light.visible = false
	lamp.add_child(_light)


func _mesh(parent: Node3D, mesh: ArrayMesh) -> MeshInstance3D:
	var m := MeshInstance3D.new()
	m.mesh = mesh
	m.visibility_range_end = NEAR_VISIBLE
	m.visibility_range_end_margin = 20.0
	m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(m)
	return m


func _enter_tree() -> void:
	add_to_group(WorldOrigin.GROUP)
	_place()


## Puts the props at their world places (the origin may have moved) on the ground at `ground_y`.
func _place() -> void:
	position = Vector3.ZERO
	stand.position = WorldOrigin.to_scene(stand_world, _ground_y)
	stand.rotation.y = _stand_yaw
	lamp.position = WorldOrigin.to_scene(lamp_world, _ground_y)


var _ground_y: float = 0.0


## The ground's height under the props (found by a ray when the ground is in).
func set_ground(y: float) -> void:
	_ground_y = y
	if is_inside_tree():
		_place()


func set_lit(on: bool) -> void:
	_lit = on
	_flame.visible = on
	_light.visible = on


func lit() -> bool:
	return _lit


func show_player_pair(on: bool) -> void:
	_player_pair.visible = on


func pair_shown() -> bool:
	return _player_pair.visible
