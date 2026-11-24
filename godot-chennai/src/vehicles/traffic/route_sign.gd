class_name RouteSign
extends Node3D
## A city bus's destination sign (decision G-214): a dark board over the windscreen with the
## route number and the destination in Tamil above English, in amber (the LED boards Chennai's
## buses carry), and a smaller copy by the front door on the kerb side. Plain text only: no
## operator name, livery or logo (TD-18). Drawn only near the camera (`REACH`).

const REACH := 70.0
const AMBER := Color("#ffb703")
const BOARD := Color(0.05, 0.05, 0.06)
const PIXEL := 0.004
## Longer destinations are cut (the board is about 2.7 m wide).
const MAX_CHARS := 20

var _ref_labels: Array[Label3D] = []
var _dest_labels: Array[Label3D] = []


## `half_extents`: half the body's width and length, and in y the height of the roof above the
## view's origin.
static func make(half_extents: Vector3, font: Font) -> RouteSign:
	var s := RouteSign.new()
	s.name = "RouteSign"
	var width := half_extents.x * 2.0 - 0.5
	# Front, over the windscreen (the bus faces -Z), and on the kerb side (left, -X) by the front door.
	s._board(Transform3D(Basis(Vector3.UP, PI), Vector3(0, half_extents.y - 0.32, -half_extents.z - 0.04)), Vector2(width, 0.46), font, 1.0)
	s._board(Transform3D(Basis(Vector3.UP, -PI / 2.0), Vector3(-half_extents.x - 0.04, half_extents.y - 0.42, -half_extents.z + 2.2)), Vector2(1.7, 0.34), font, 0.72)
	return s


func _board(at: Transform3D, size: Vector2, font: Font, scale_by: float) -> void:
	var root := Node3D.new()
	root.transform = at
	add_child(root)
	var quad := MeshInstance3D.new()
	var mesh := QuadMesh.new()
	mesh.size = size
	quad.mesh = mesh
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.albedo_color = BOARD
	quad.material_override = mat
	quad.visibility_range_end = REACH
	quad.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	root.add_child(quad)
	var ref := _label(font, roundi(96 * scale_by))
	ref.position = Vector3(-size.x / 2.0 + 0.06, 0, 0.01)
	ref.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT
	root.add_child(ref)
	_ref_labels.append(ref)
	var dest := _label(font, roundi(44 * scale_by))
	dest.position = Vector3(size.x / 2.0 - 0.06, 0, 0.01)
	dest.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	dest.line_spacing = -6.0
	root.add_child(dest)
	_dest_labels.append(dest)


func _label(font: Font, size: int) -> Label3D:
	var l := Label3D.new()
	l.font = font
	l.font_size = size
	l.pixel_size = PIXEL
	l.modulate = AMBER
	l.outline_size = 0
	l.shaded = false
	l.double_sided = false
	l.visibility_range_end = REACH
	l.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return l


## Route number and destination (Tamil above English; either may be empty).
func show_route(ref: String, english: String, tamil: String) -> void:
	english = english if english.length() <= MAX_CHARS else english.left(MAX_CHARS - 1) + "."
	tamil = tamil if tamil.length() <= MAX_CHARS else tamil.left(MAX_CHARS - 1) + "."
	var dest := tamil + ("\n" if tamil != "" and english != "" else "") + english
	for l in _ref_labels:
		l.text = ref
	for l in _dest_labels:
		l.text = dest


func ref_text() -> String:
	return _ref_labels[0].text if not _ref_labels.is_empty() else ""


func destination_text() -> String:
	return _dest_labels[0].text if not _dest_labels.is_empty() else ""
