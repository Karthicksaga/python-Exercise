class_name SwimHud
extends CanvasLayer
## The swimmer's energy (G-484): a small glass plate at the bottom centre, shown only while swimming,
## with the word ENERGY and a bar (`MeterBar`, full is good). It is not a touch target. Nothing about
## breath or drowning: tiring only sends the swimmer back to the shore.

const WIDTH := 200.0
const BOTTOM := 18.0

var bar: MeterBar
var label: Label
var _plate: PanelContainer


func _init() -> void:
	name = "SwimHud"
	layer = 2
	visible = false
	var root := Control.new()
	root.name = "Root"
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.get_theme()
	add_child(root)
	_plate = PanelContainer.new()
	_plate.name = "Plate"
	_plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_plate.add_theme_stylebox_override("panel", UiTheme.glass_plate(0.45, 12))
	_plate.anchor_left = 0.5
	_plate.anchor_right = 0.5
	_plate.anchor_top = 1.0
	_plate.anchor_bottom = 1.0
	_plate.grow_horizontal = Control.GROW_DIRECTION_BOTH
	_plate.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_plate.offset_top = -BOTTOM
	_plate.offset_bottom = -BOTTOM
	root.add_child(_plate)
	var box := VBoxContainer.new()
	box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	box.add_theme_constant_override("separation", 3)
	_plate.add_child(box)
	label = UiTheme.label("", 12, UiTheme.TEXT_DIM)
	label.name = "Label"
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.custom_minimum_size.x = WIDTH
	Tr.bind(label, "cul.swim.energy")
	box.add_child(label)
	bar = MeterBar.new()
	bar.name = "Bar"
	bar.custom_minimum_size = Vector2(WIDTH, 8)
	box.add_child(bar)


## Shows (or hides) the plate and sets the bar to a share 0..1.
func show_energy(on: bool, share: float = 1.0) -> void:
	visible = on
	bar.set_value(share * 100.0)
