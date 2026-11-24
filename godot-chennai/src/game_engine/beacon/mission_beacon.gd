class_name MissionBeacon
extends Node3D
## The marker for the current objective (G-282), redesigned after the owner's phone report that
## the circles on the ground were unexplained. It is now a labelled marker:
##
## - a vertical beam of light, thin and tall, whose width follows the distance so it reads from far
##   away; fainter when you are close (it would tint the whole view);
## - a floating icon whose SHAPE says what it is (pick-up: arrow down, drop-off: cube, mission:
##   diamond, fight: cross, vehicle: sphere, target: dot) and whose COLOUR says the kind;
## - a text label that stays one size on screen: "Pick up - 420 m";
## - a thin ring the size of the target's radius, only when the player is near (inside 45 m, fading
##   out by 70 m); no filled discs;
## - places you can enter get a label and a small ring only within 90 m; none from afar.
##
## A target beyond the camera's range is drawn at the edge of it, in the right direction, so the
## beam still points the way (its label keeps the true distance). Unshaded, additive beam, so it
## reads the same at noon and night. `place_at(...)` every frame while there is a marker, `clear()`
## when there is none or the player stands inside it.

const COLUMN_HEIGHT := 240.0
const RING_HEIGHT := 0.05
const RING_NEAR := 45.0
const RING_GONE := 70.0
## A marker farther than this from the camera is drawn at this distance (the camera's far plane
## is 1500 m).
const SHOW_LIMIT := 1000.0
const ICON_LIFT := 4.0
const LABEL_LIFT := 6.5
const DEFAULT_COLOUR := Color(1.0, 0.72, 0.01)
const PLACE_COLOUR := Color(0.25, 0.85, 0.8)
const PULSE := 2.2

const BEAM_SHADER := """
shader_type spatial;
render_mode unshaded, blend_add, cull_disabled, depth_draw_never, fog_disabled;
uniform vec4 colour : source_color = vec4(1.0, 0.7, 0.0, 1.0);
uniform float strength = 0.5;
uniform float height = 240.0;
varying float up;
void vertex() {
	up = clamp(VERTEX.y / height + 0.5, 0.0, 1.0);
}
void fragment() {
	float face = abs(dot(normalize(NORMAL), normalize(VIEW)));
	ALBEDO = colour.rgb;
	ALPHA = strength * smoothstep(0.0, 0.5, face) * (1.0 - up * 0.85);
}
"""

var ring: MeshInstance3D
var beam: MeshInstance3D
var icon: Node3D
var label: Label3D
## What the marker is now (read by tests).
var kind: StringName = &"mission"
var label_text := ""

var _clock := 0.0
var _beam_material: ShaderMaterial
var _ring_material: StandardMaterial3D
var _icon_material: StandardMaterial3D
var _icon_kind: StringName = &""
var _where := Vector3.ZERO
var _distance := 0.0
var _radius := 0.0
var _shown := false
var _entrances: Array[Node3D] = []


static func _additive(colour: Color, alpha: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD
	m.cull_mode = BaseMaterial3D.CULL_DISABLED
	m.albedo_color = Color(colour, alpha)
	return m


static func _ring_mesh(material: StandardMaterial3D) -> TorusMesh:
	var t := TorusMesh.new()
	t.inner_radius = 0.94
	t.outer_radius = 1.0
	t.rings = 48
	t.ring_segments = 4
	t.material = material
	return t


func _ready() -> void:
	name = "MissionBeacon"
	var shader := Shader.new()
	shader.code = BEAM_SHADER
	_beam_material = ShaderMaterial.new()
	_beam_material.shader = shader
	_beam_material.set_shader_parameter("height", COLUMN_HEIGHT)
	beam = MeshInstance3D.new()
	beam.name = "Beam"
	var c := CylinderMesh.new()
	c.top_radius = 1.0
	c.bottom_radius = 1.0
	c.height = COLUMN_HEIGHT
	c.radial_segments = 12
	c.cap_top = false
	c.cap_bottom = false
	c.material = _beam_material
	beam.mesh = c
	beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(beam)
	_ring_material = _additive(DEFAULT_COLOUR, 0.8)
	ring = MeshInstance3D.new()
	ring.name = "Ring"
	ring.mesh = _ring_mesh(_ring_material)
	ring.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(ring)
	icon = Node3D.new()
	icon.name = "Icon"
	add_child(icon)
	_icon_material = StandardMaterial3D.new()
	_icon_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_icon_material.albedo_color = DEFAULT_COLOUR
	label = _make_label("Label", 30, 0.0016)
	add_child(label)
	clear()


## A label that keeps its size on screen and draws over buildings.
static func _make_label(node_name: String, font_size: int, pixel: float) -> Label3D:
	var l := Label3D.new()
	l.name = node_name
	l.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	l.fixed_size = true
	l.no_depth_test = true
	l.pixel_size = pixel
	l.font_size = font_size
	l.outline_size = 10
	l.outline_modulate = Color(0.04, 0.05, 0.08, 0.95)
	l.render_priority = 5
	l.outline_render_priority = 4
	l.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return l


## Put the marker at a scene position (ground height): `radius` is the target's size, `marker_kind`
## its kind (the shape), `colour` its colour, `text` its words and `metres` how far it is.
func place_at(where: Vector3, radius: float, marker_kind: StringName = &"mission", colour: Color = DEFAULT_COLOUR, text: String = "", metres: float = 0.0) -> void:
	_where = where
	_radius = maxf(1.5, radius)
	_distance = metres
	_shown = true
	if marker_kind != _icon_kind:
		_icon_kind = marker_kind
		_build_icon(marker_kind)
	kind = marker_kind
	_beam_material.set_shader_parameter("colour", colour)
	_ring_material.albedo_color = Color(colour, _ring_material.albedo_color.a)
	_icon_material.albedo_color = colour
	label.modulate = colour
	var words := "%s - %s" % [text, _metres_text(metres)] if text != "" else _metres_text(metres)
	if words != label_text:
		label_text = words
		label.text = words
	beam.visible = true
	icon.visible = true
	label.visible = true
	_follow_camera()


func clear() -> void:
	_shown = false
	if beam == null:
		return
	beam.visible = false
	ring.visible = false
	icon.visible = false
	label.visible = false


func shown() -> bool:
	return _shown


## "420 m" below a kilometre (to ten metres from 100 m), "1.2 km" above.
static func _metres_text(m: float) -> String:
	if m < 1000.0:
		return "%d m" % (int(round(m / 10.0)) * 10 if m >= 100.0 else int(round(m)))
	return "%.1f km" % (m / 1000.0)


func _build_icon(marker_kind: StringName) -> void:
	for ch in icon.get_children():
		ch.queue_free()
	var mesh: PrimitiveMesh = null
	match marker_kind:
		&"pickup":
			var cone := CylinderMesh.new()
			cone.top_radius = 0.55
			cone.bottom_radius = 0.0
			cone.height = 1.1
			cone.radial_segments = 4
			cone.rings = 1
			mesh = cone
		&"dropoff":
			var box := BoxMesh.new()
			box.size = Vector3(0.9, 0.9, 0.9)
			mesh = box
		&"fight":
			for angle: float in [PI / 4.0, -PI / 4.0]:
				var bar := MeshInstance3D.new()
				var bm := BoxMesh.new()
				bm.size = Vector3(1.5, 0.3, 0.3)
				bm.material = _icon_material
				bar.mesh = bm
				bar.rotation.z = angle
				bar.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
				icon.add_child(bar)
		&"vehicle", &"target":
			var sphere := SphereMesh.new()
			sphere.radius = 0.5
			sphere.height = 1.0
			sphere.radial_segments = 12
			sphere.rings = 6
			mesh = sphere
		_:
			var diamond := SphereMesh.new()
			diamond.radius = 0.6
			diamond.height = 1.4
			diamond.radial_segments = 4
			diamond.rings = 2
			mesh = diamond
	if mesh != null:
		mesh.material = _icon_material
		var m := MeshInstance3D.new()
		m.mesh = mesh
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		icon.add_child(m)


## Place the parts for the camera's distance: far targets are drawn at SHOW_LIMIT in the right
## direction, and the beam, icon and label are sized so they read at any distance.
func _follow_camera() -> void:
	var cam := get_viewport().get_camera_3d() if is_inside_tree() else null
	var eye := cam.global_position if cam != null else _where + Vector3(0, 2, 30)
	var flat := Vector3(_where.x - eye.x, 0.0, _where.z - eye.z)
	var dist := flat.length()
	var at := _where
	if dist > SHOW_LIMIT:
		at = Vector3(eye.x + flat.x / dist * SHOW_LIMIT, _where.y, eye.z + flat.z / dist * SHOW_LIMIT)
		dist = SHOW_LIMIT
	# Width of the beam: about 0.45 % of the distance, never thinner than 0.35 m nor wider than 4 m.
	var width := clampf(dist * 0.0045, 0.35, 4.0)
	beam.global_position = at + Vector3(0, COLUMN_HEIGHT / 2.0, 0)
	beam.scale = Vector3(width, 1.0, width)
	# Brighter from far, quiet close up (a bright column right in front of the camera tints the view).
	_beam_material.set_shader_parameter("strength", lerpf(0.16, 0.6, smoothstep(15.0, 120.0, dist)))
	var grow := clampf(dist * 0.012, 1.0, 9.0)
	icon.global_position = at + Vector3(0, ICON_LIFT + grow * 0.5, 0)
	icon.scale = Vector3.ONE * grow
	label.global_position = at + Vector3(0, LABEL_LIFT + grow, 0)
	# The ring: only near, the real size, at the real place (it is never drawn at a clamped spot).
	var near := _distance <= RING_GONE and dist <= RING_GONE and at == _where
	ring.visible = near
	if near:
		ring.global_position = _where + Vector3(0, 0.15, 0)
		ring.scale = Vector3(_radius, RING_HEIGHT / 0.05, _radius)
		var fade := 1.0 - smoothstep(RING_NEAR, RING_GONE, dist)
		var pulse := 0.5 + 0.5 * sin(_clock * TAU / PULSE)
		_ring_material.albedo_color.a = (0.45 + 0.35 * pulse) * fade


## Places you can enter, each `{position, radius, name}` (scene position at ground height): a
## label and a small ring, and only the ones near enough to matter (the caller filters by
## distance; a label never shows from afar).
func set_entrances(points: Array[Dictionary]) -> void:
	while _entrances.size() < points.size():
		var n := Node3D.new()
		n.name = "Entrance%d" % _entrances.size()
		n.top_level = true
		var r := MeshInstance3D.new()
		r.name = "Ring"
		r.mesh = _ring_mesh(_additive(PLACE_COLOUR, 0.7))
		r.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		n.add_child(r)
		var l := _make_label("Label", 26, 0.0014)
		l.modulate = PLACE_COLOUR
		l.position = Vector3(0, 3.2, 0)
		n.add_child(l)
		add_child(n)
		_entrances.append(n)
	for i in _entrances.size():
		var n := _entrances[i]
		n.visible = i < points.size()
		if n.visible:
			var p: Vector3 = points[i]["position"]
			var radius: float = maxf(1.2, minf(float(points[i]["radius"]), 3.0))
			n.global_position = p + Vector3(0, 0.12, 0)
			(n.get_node(^"Ring") as Node3D).scale = Vector3(radius, 1.0, radius)
			var text := str(points[i].get("name", ""))
			var l := n.get_node(^"Label") as Label3D
			if l.text != text:
				l.text = text


func _process(delta: float) -> void:
	_clock += delta
	if _shown:
		_follow_camera()
