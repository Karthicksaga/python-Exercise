class_name TouchControls
extends CanvasLayer
## On-screen controls for a phone in landscape (port of the Three.js `TouchControls`, on-foot
## part; decision G-66): a floating joystick on the left 45% of the screen, camera drag on the
## rest, and RUN and JUMP buttons in the right thumb's reach. Several fingers work at once
## (each touch index is tracked); a mouse works too (`emulate_touch_from_mouse`).
##
## The controls only record intent; `PlayerRig` reads them once per physics step:
## `move` (x right, y forward), `consume_look()` (UI units dragged), `consume_jump()`, `run`.
## RUN is a switch (a thumb can't hold it and steer the camera): tap it to run, it switches off
## when the stick is let go. Pushing the stick to its edge runs as well.

## How far the knob travels from the stick's centre, UI units.
const STICK_RADIUS := 56.0
const KNOB := 52.0
## Share of the screen's width (from the left) where a touch takes the stick.
const MOVE_SHARE := 0.45
## Button sizes, UI units: at least 70 so they stay 48 px or more on a 640x320 screen.
const JUMP_SIZE := 80.0
const RUN_SIZE := 70.0

var move: Vector2 = Vector2.ZERO
var run: bool = false:
	set(value):
		run = value
		if _run_button != null:
			_run_button.lit = value
var _look: Vector2 = Vector2.ZERO
var _jump: bool = false
var _move_finger: int = -1
var _look_finger: int = -1
var _look_last: Vector2 = Vector2.ZERO
var _base: Vector2 = Vector2.ZERO
var _root: Control
var _layer: Control
var _stick: StickView
var _jump_button: TouchButton
var _run_button: TouchButton


func _ready() -> void:
	layer = 1
	_root = Control.new()
	_root.name = "Root"
	_root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_root.theme = UiTheme.get_theme()
	add_child(_root)
	var margin := SafeAreaMargin.new()
	margin.name = "Safe"
	_root.add_child(margin)
	_layer = Control.new()
	_layer.name = "Layer"
	_layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
	margin.add_child(_layer)
	_stick = StickView.new()
	_stick.name = "Stick"
	_stick.radius = STICK_RADIUS
	_stick.knob = KNOB
	_layer.add_child(_stick)
	_jump_button = TouchButton.new("JUMP", JUMP_SIZE)
	_jump_button.name = "Jump"
	_layer.add_child(_jump_button)
	_run_button = TouchButton.new("RUN", RUN_SIZE)
	_run_button.name = "Run"
	_layer.add_child(_run_button)
	_layer.resized.connect(_place)
	_place()


## Buttons bottom-right above the map credit, RUN to JUMP's left; the stick at rest bottom-left.
func _place() -> void:
	var s := _layer.size
	# JUMP in the corner, lifted clear of the OSM credit line (HUD, bottom-right).
	_jump_button.position = Vector2(s.x - JUMP_SIZE - 16.0, s.y - JUMP_SIZE - 32.0)
	# RUN to its left and a little higher, along the thumb's arc, 16 apart.
	_run_button.position = Vector2(_jump_button.position.x - RUN_SIZE - 16.0, _jump_button.position.y - 34.0)
	if _move_finger < 0:
		_base = _rest()
		_stick.show_at(_base, Vector2.ZERO, false)


func _rest() -> Vector2:
	var s := _layer.size
	return _layer.global_position + Vector2(STICK_RADIUS + 28.0, s.y - STICK_RADIUS - 28.0)


## The buttons, for layout tests and the screenshot review.
func buttons() -> Array[TouchButton]:
	return [_jump_button, _run_button]


## The stick's area at rest (its ring), in canvas units.
func stick_rect() -> Rect2:
	return _stick.get_global_rect()


func consume_look() -> Vector2:
	var out := _look
	_look = Vector2.ZERO
	return out


func consume_jump() -> bool:
	var out := _jump
	_jump = false
	return out


## Drops every finger (pause, entering a vehicle).
func release_all() -> void:
	_move_finger = -1
	_look_finger = -1
	move = Vector2.ZERO
	run = false
	_base = _rest()
	_stick.show_at(_base, Vector2.ZERO, false)


func _input(event: InputEvent) -> void:
	if not visible:
		return
	var touch := event as InputEventScreenTouch
	if touch != null:
		if touch.pressed:
			_press(touch.index, touch.position)
		else:
			_release(touch.index)
		get_viewport().set_input_as_handled()
		return
	var drag := event as InputEventScreenDrag
	if drag != null:
		if drag.index == _move_finger:
			_steer(drag.position)
		elif drag.index == _look_finger:
			_look += drag.position - _look_last
			_look_last = drag.position
		get_viewport().set_input_as_handled()


func _press(index: int, at: Vector2) -> void:
	if _jump_button.hit(at):
		_jump = true
		_jump_button.lit = true
		return
	if _run_button.hit(at):
		run = not run
		return
	var screen := _root.get_global_rect()
	if at.x < screen.position.x + screen.size.x * MOVE_SHARE:
		if _move_finger >= 0:
			return
		_move_finger = index
		# The stick starts under the thumb, kept whole on the screen.
		var lo := _layer.get_global_rect().position + Vector2.ONE * STICK_RADIUS
		var hi := _layer.get_global_rect().end - Vector2.ONE * STICK_RADIUS
		_base = at.clamp(lo, hi)
		_steer(at)
	elif _look_finger < 0:
		_look_finger = index
		_look_last = at


func _release(index: int) -> void:
	if index == _move_finger:
		_move_finger = -1
		move = Vector2.ZERO
		run = false
		_base = _rest()
		_stick.show_at(_base, Vector2.ZERO, false)
	elif index == _look_finger:
		_look_finger = -1
	_jump_button.lit = false


func _steer(at: Vector2) -> void:
	var offset := (at - _base).limit_length(STICK_RADIUS)
	move = Vector2(offset.x, -offset.y) / STICK_RADIUS
	_stick.show_at(_base, offset, true)


## The stick's ring and knob.
class StickView:
	extends Control
	var radius: float = 56.0
	var knob: float = 52.0
	var offset: Vector2 = Vector2.ZERO
	var active: bool = false

	func _init() -> void:
		mouse_filter = Control.MOUSE_FILTER_IGNORE

	func show_at(centre: Vector2, knob_offset: Vector2, held: bool) -> void:
		size = Vector2.ONE * radius * 2.0
		global_position = centre - Vector2.ONE * radius
		offset = knob_offset
		active = held
		queue_redraw()

	func _draw() -> void:
		var c := Vector2.ONE * radius
		var a := 1.0 if active else 0.55
		draw_circle(c, radius, Color(1, 1, 1, 0.12 * a))
		draw_arc(c, radius - 1.0, 0.0, TAU, 48, Color(1, 1, 1, 0.45 * a), 2.0, true)
		draw_circle(c + offset, knob * 0.5, Color(1, 1, 1, 0.85 * a))
