class_name BenchmarkBanner
extends CanvasLayer
## The line at the top while the benchmark runs (G-405): which level and segment, and that Back
## pauses it. A glass plate, 12 text, ignores touches; its text changes once a segment.

var label: Label


func _init() -> void:
	name = "BenchmarkBanner"
	layer = 6  # under the performance overlay (7) and the menus (8)
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	root.theme = UiTheme.get_theme()
	add_child(root)
	var margin := SafeAreaMargin.new()
	margin.gutter = 8
	root.add_child(margin)
	var top := VBoxContainer.new()
	top.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(top)
	var plate := PanelContainer.new()
	plate.name = "Plate"
	plate.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
	plate.add_theme_stylebox_override("panel", UiTheme.glass_plate(0.6, 12))
	top.add_child(plate)
	label = UiTheme.label("Benchmark", 12, UiTheme.TEXT)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	plate.add_child(label)


func set_text(text: String) -> void:
	label.text = text + " · Back pauses"
