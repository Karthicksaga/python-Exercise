class_name SafeAreaMargin
extends MarginContainer
## A full-screen margin that keeps its children out of notches and the gesture bar
## (`DisplayServer.get_display_safe_area()`; only phones report one, elsewhere it is the window),
## plus a fixed gutter. Reapplied when the window changes size.

@export var gutter: int = 12


func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	get_viewport().size_changed.connect(apply)
	apply()


func apply() -> void:
	var inset := _insets()
	add_theme_constant_override("margin_left", gutter + inset[0])
	add_theme_constant_override("margin_top", gutter + inset[1])
	add_theme_constant_override("margin_right", gutter + inset[2])
	add_theme_constant_override("margin_bottom", gutter + inset[3])


## Left, top, right, bottom insets in UI units.
func _insets() -> Array[int]:
	if DisplayServer.get_name() == "headless" or not OS.has_feature("mobile"):
		return [0, 0, 0, 0]
	var win := Rect2(Vector2(DisplayServer.window_get_position()), Vector2(DisplayServer.window_get_size()))
	var safe := Rect2(DisplayServer.get_display_safe_area()).intersection(win)
	if win.size.x <= 0.0 or safe.size.x <= 0.0:
		return [0, 0, 0, 0]
	var to_ui := get_viewport_rect().size / win.size
	return [
		int((safe.position.x - win.position.x) * to_ui.x),
		int((safe.position.y - win.position.y) * to_ui.y),
		int((win.end.x - safe.end.x) * to_ui.x),
		int((win.end.y - safe.end.y) * to_ui.y),
	]
