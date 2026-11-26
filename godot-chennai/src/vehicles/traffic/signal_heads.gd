class_name SignalHeads
extends Node3D
## The traffic lights the AI obeys, drawn (G-123): a pole at the kerb before each stop line with a
## head of three lamps facing the traffic, the lit one bright, and a white stop line across the
## lanes coming in. All heads near the player in two `MultiMesh`es (poles and stop lines; lamps
## with a colour per instance, unshaded), so the whole junction costs three draw calls.
## Rebuilt from the approaches within REACH every REFRESH frames; colours every frame.

const REACH := 140.0
const REFRESH := 20
const POLE_HEIGHT := 3.4
const LAMP_SPACING := 0.3
const KERB_OUT := 0.7
const LIT := {TrafficSignals.RED: Color(1.0, 0.12, 0.08), TrafficSignals.AMBER: Color(1.0, 0.62, 0.05), TrafficSignals.GREEN: Color(0.15, 1.0, 0.45)}
const DIM := Color(0.08, 0.08, 0.08)

var signals: TrafficSignals = null
var _poles := MultiMeshInstance3D.new()
var _lamps := MultiMeshInstance3D.new()
var _lines := MultiMeshInstance3D.new()
var _shown: Array[TrafficSignals.Approach] = []
var _frame: int = 0


func _init() -> void:
	name = "SignalHeads"
	var pole := BoxMesh.new()
	pole.size = Vector3(0.16, POLE_HEIGHT, 0.16)
	var pole_mat := StandardMaterial3D.new()
	pole_mat.albedo_color = Color(0.16, 0.17, 0.18)
	pole_mat.roughness = 0.85
	pole_mat.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	pole.material = pole_mat
	# The head (a dark box) is part of the pole mesh: one draw call for both.
	var head := BoxMesh.new()
	head.size = Vector3(0.36, 1.0, 0.24)
	var st := SurfaceTool.new()
	st.append_from(pole, 0, Transform3D(Basis.IDENTITY, Vector3(0, POLE_HEIGHT / 2.0, 0)))
	st.append_from(head, 0, Transform3D(Basis.IDENTITY, Vector3(0, POLE_HEIGHT + 0.5, 0)))
	var body := st.commit()
	body.surface_set_material(0, pole_mat)
	_poles.multimesh = _multi(body, false)
	var lamp := SphereMesh.new()
	lamp.radius = 0.1
	lamp.height = 0.2
	lamp.radial_segments = 8
	lamp.rings = 4
	var lamp_mat := StandardMaterial3D.new()
	lamp_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	lamp_mat.vertex_color_use_as_albedo = true
	lamp.material = lamp_mat
	_lamps.multimesh = _multi(lamp, true)
	var line := PlaneMesh.new()
	line.size = Vector2(1.0, 0.35)
	var line_mat := StandardMaterial3D.new()
	line_mat.albedo_color = Color(0.86, 0.86, 0.82)
	line_mat.roughness = 0.9
	line_mat.specular_mode = BaseMaterial3D.SPECULAR_DISABLED
	line.material = line_mat
	_lines.multimesh = _multi(line, false)
	for m: MultiMeshInstance3D in [_poles, _lamps, _lines]:
		m.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		add_child(m)
	_poles.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON


static func _multi(mesh: Mesh, colours: bool) -> MultiMesh:
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = colours
	mm.mesh = mesh
	return mm


func use(next: TrafficSignals) -> void:
	signals = next
	_frame = 0


## Draw the heads round `focus` (world metres) in the current origin; `ground` gives the road
## height at a point (decks, G-122; 0 on the ground).
func refresh(focus: Vector2) -> void:
	if signals == null:
		return
	if _frame % REFRESH == 0:
		_shown = signals.approaches_near(focus, REACH)
		_place()
	_frame += 1
	var mm := _lamps.multimesh
	for i in _shown.size():
		var light := signals.light_for(_shown[i])
		for k in 3:
			var state: int = [TrafficSignals.RED, TrafficSignals.AMBER, TrafficSignals.GREEN][k]
			mm.set_instance_color(i * 3 + k, LIT[state] if light == state else DIM)


func _place() -> void:
	var n := _shown.size()
	if _poles.multimesh.instance_count != n:
		_poles.multimesh.instance_count = n
		_lamps.multimesh.instance_count = n * 3
		_lines.multimesh.instance_count = n
	for i in n:
		var a := _shown[i]
		var left := Vector2(a.dir.y, -a.dir.x)
		var foot := a.point + left * (a.width / 2.0 + KERB_OUT)
		var at := WorldOrigin.to_scene(foot, 0.0)
		# The head faces the oncoming traffic (against `dir`).
		var facing := atan2(a.dir.x, a.dir.y)
		var basis := Basis(Vector3.UP, facing)
		_poles.multimesh.set_instance_transform(i, Transform3D(basis, at))
		var toward := Vector3(-a.dir.x, 0.0, -a.dir.y) * 0.155
		for k in 3:
			var lamp := at + Vector3(0, POLE_HEIGHT + 0.5 + LAMP_SPACING * (1 - k), 0) + toward
			_lamps.multimesh.set_instance_transform(i * 3 + k, Transform3D(Basis.IDENTITY, lamp))
		# The stop line across the lanes coming in (the left half of a two-way road).
		var centre := a.point + left * (a.width / 4.0)
		var line_basis := Basis(Vector3.UP, facing).scaled(Vector3(maxf(1.0, a.width / 2.0 - 0.3), 1.0, 1.0))
		_lines.multimesh.set_instance_transform(i, Transform3D(line_basis, WorldOrigin.to_scene(centre, 0.075)))
