class_name HomeSiteView
extends Node3D
## What a home for sale looks like on its street (G-233): a wooden door frame and a door leaf on
## the building's road-facing wall, a doorstep, and a FOR SALE board on two posts in front, in
## Tamil and English with the price (category words only: the kind of home and the area, never a
## business name). Bought, the board reads MY HOME. The building is not touched: these pieces
## stand 0.1 m clear of its wall. One view per site, shown only while the site's streets are
## loaded and the player is near (`HomesLayer`); the leaf swings open when the player goes in.
##
## Local frame: origin on the ground at the door's middle, +z out of the building, +x along the
## wall (`UP x normal`), so everything is built once and the node is just turned and placed.

const OPEN_ANGLE := -1.75
const BOARD_SIZE := Vector2(1.8, 1.15)
const SALE := Color("#b3261e")
const MINE := Color("#1f6f3f")
const INK := Color("#1b1b1b")

var site: HomeSite
var _leaf: Node3D
var _open: float = 0.0
var _want_open: float = 0.0
var _title: Label3D
var _title_ta: Label3D
var _line: Label3D
var _line_small: Label3D


static func make(s: HomeSite) -> HomeSiteView:
	var v := HomeSiteView.new()
	v.site = s
	v.name = "Home_%s" % s.id()
	v._build()
	v.add_to_group(WorldOrigin.GROUP)
	v.place()
	return v


## Puts the view on its site in the current scene origin.
func place() -> void:
	var n := Vector3(site.normal.x, 0.0, site.normal.y)
	var t := Vector3.UP.cross(n)
	global_transform = Transform3D(Basis(t, Vector3.UP, n), site.door_scene())


func _build() -> void:
	var frame := MeshBuilder.new()
	_box(frame, Vector3(0.14, 2.3, 0.16), Vector3(-0.64, 1.15, 0.04), "#4a2f20")
	_box(frame, Vector3(0.14, 2.3, 0.16), Vector3(0.64, 1.15, 0.04), "#4a2f20")
	_box(frame, Vector3(1.42, 0.14, 0.16), Vector3(0.0, 2.3, 0.04), "#4a2f20")
	_box(frame, Vector3(1.6, 0.14, 0.8), Vector3(0.0, 0.07, 0.42), "#cfc4ad")
	_box(frame, Vector3(0.9, 0.04, 0.5), Vector3(0.0, 0.16, 0.5), "#8a3f2f")
	var wood := StandardMaterial3D.new()
	wood.vertex_color_use_as_albedo = true
	wood.vertex_color_is_srgb = true
	wood.roughness = 0.9
	var frame_node := MeshInstance3D.new()
	frame_node.name = "Frame"
	frame_node.mesh = frame.commit(wood)
	add_child(frame_node)
	# The leaf is hinged on its left edge; it swings outwards.
	_leaf = Node3D.new()
	_leaf.name = "Leaf"
	_leaf.position = Vector3(-0.56, 0.0, 0.1)
	var leaf := MeshBuilder.new()
	_box(leaf, Vector3(1.12, 2.15, 0.07), Vector3(0.56, 1.08, 0.0), "#7a4a2e")
	_box(leaf, Vector3(0.8, 0.8, 0.02), Vector3(0.56, 1.5, 0.045), "#5e3822")
	_box(leaf, Vector3(0.8, 0.8, 0.02), Vector3(0.56, 0.62, 0.045), "#5e3822")
	_box(leaf, Vector3(0.06, 0.06, 0.06), Vector3(1.0, 1.05, 0.06), "#c9a24a")
	var leaf_node := MeshInstance3D.new()
	leaf_node.mesh = leaf.commit(wood)
	_leaf.add_child(leaf_node)
	add_child(_leaf)
	_build_board()


func _build_board() -> void:
	var board := Node3D.new()
	board.name = "Board"
	board.position = Vector3(1.55, 0.0, 1.0)
	add_child(board)
	var b := MeshBuilder.new()
	_box(b, Vector3(0.08, 1.75, 0.08), Vector3(-0.8, 0.875, 0.0), "#5a5a5a")
	_box(b, Vector3(0.08, 1.75, 0.08), Vector3(0.8, 0.875, 0.0), "#5a5a5a")
	_box(b, Vector3(BOARD_SIZE.x + 0.1, BOARD_SIZE.y + 0.1, 0.05), Vector3(0.0, 1.35, -0.005), "#3a3a3a")
	_box(b, Vector3(BOARD_SIZE.x, BOARD_SIZE.y, 0.06), Vector3(0.0, 1.35, 0.0), "#f3efe2")
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.vertex_color_is_srgb = true
	mat.roughness = 0.9
	# A little glow so the board reads at dusk.
	mat.emission_enabled = true
	mat.emission = Color(1, 1, 1)
	mat.emission_energy_multiplier = 0.08
	var node := MeshInstance3D.new()
	node.name = "Posts"
	node.mesh = b.commit(mat)
	board.add_child(node)
	var font := TitleFonts.display(true, 1.0)
	_title = _label(board, font, 92, 1.73, SALE)
	_title_ta = _label(board, font, 66, 1.47, INK)
	_line = _label(board, font, 80, 1.19, SALE)
	_line_small = _label(board, font, 42, 0.9, INK)


func _label(parent: Node3D, font: Font, size: int, y: float, colour: Color) -> Label3D:
	var l := Label3D.new()
	l.font = font
	l.font_size = size
	l.pixel_size = 0.0036
	l.modulate = colour
	l.outline_size = 0
	l.shaded = false
	l.double_sided = false
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	l.position = Vector3(0.0, y, 0.05)
	l.visibility_range_end = 140.0
	l.text = " "
	parent.add_child(l)
	return l


static func _box(b: MeshBuilder, size: Vector3, at: Vector3, hex: String) -> void:
	PropMesh.add_part(b, {"t": "box", "a": [size.x, size.y, size.z], "c": hex, "p": [at.x, at.y, at.z]})


## What the board says now. `price` is what it costs (shown while for sale).
func show_state(owned: bool, price: int, type: HomeType) -> void:
	var l := site.listing
	if owned:
		_title.text = "MY HOME"
		_title.modulate = MINE
		_title_ta.text = "என் வீடு"
		_line.text = l.area_en
		_line.modulate = MINE
	else:
		_title.text = "FOR SALE"
		_title.modulate = SALE
		_title_ta.text = "விற்பனைக்கு"
		_line.text = "₹%s" % MissionSession.rupees(price)
		_line.modulate = SALE
	_line_small.text = "%s · %s" % [type.en, type.ta] if not owned else "%s · %s" % [l.area_en, l.area_ta]


func open_door(on: bool) -> void:
	_want_open = 1.0 if on else 0.0


func door_open_amount() -> float:
	return _open


func _process(dt: float) -> void:
	if not is_equal_approx(_open, _want_open):
		_open = move_toward(_open, _want_open, dt * 2.2)
		_leaf.rotation.y = OPEN_ANGLE * _open
