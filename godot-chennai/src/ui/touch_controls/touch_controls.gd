class_name TouchControls
extends CanvasLayer
## On-screen controls for walking, on a phone in landscape (port of the Three.js `TouchControls`
## on-foot part, G-66; redesigned in G-170…G-179 after the owner approved the proposal in
## `suggestions/2026-11-24-godot-controls-redesign.md`):
## - a floating stick on the left 45 % of the screen (right when left-handed);
## - drag on the rest to look;
## - one big round ACTION button, the biggest control on foot, whose label is whatever the
##   `ActionContext` offers (GET IN, TALK, PICK UP, HAND OVER, ENTER), dimmed when nothing is near;
## - a small JUMP above it. No RUN button: push the stick past 0.85 to run (`MoveState`). Only
##   with the "toggle run" setting on does a RUN button show.
## Several fingers work at once (each touch index is tracked); a mouse works too
## (`emulate_touch_from_mouse`). Every size comes from `ControlsLayout`, so the left-handed
## layout is its exact mirror.
##
## The controls only record intent; `PlayerRig` reads them once per physics step:
## `move` (the stick's raw travel: x right, y forward, 0..1), `consume_look()` (UI units dragged),
## `consume_jump()`, `consume_run_press()`.

signal action_pressed

## How far the knob travels from the stick's centre, UI units.
const STICK_RADIUS := ControlsLayout.STICK_RADIUS
const KNOB := 44.0
## Share of the screen's width (from the stick's side) where a touch takes the stick.
const MOVE_SHARE := ControlsLayout.MOVE_SHARE

var move: Vector2 = Vector2.ZERO
## The preferences it follows; may be swapped at any time (tests, a new profile).
var settings: ControlSettings = ControlSettings.shared():
	set(value):
		if settings != null and settings.changed.is_connected(_place):
			settings.changed.disconnect(_place)
		settings = value
		if is_node_ready():
			settings.changed.connect(_place)
			_place()
## What the ACTION button offers; systems register sources on it.
var action_context: ActionContext = ActionContext.new()
var _look: Vector2 = Vector2.ZERO
var _jump: bool = false
var _run_press: bool = false
var _move_finger: int = -1
var _look_finger: int = -1
var _look_last: Vector2 = Vector2.ZERO
var _base: Vector2 = Vector2.ZERO
var _root: Control
var _layer: Control
var _stick: StickView
var _action_button: TouchButton
var _jump_button: TouchButton
var _run_button: TouchButton
## The fight's buttons (G-414): HIT punches or swings, FIRE shoots while held (only with a
## loaded gun), WEAPON takes the next gun (only with two or more).
var _hit_button: TouchButton
var _fire_button: TouchButton
var _weapon_button: TouchButton
var _hit: bool = false
var _weapon: bool = false
var _fire_finger: int = -1
## FIRE is held down now.
var fire_held: bool = false
var _show_fire: bool = false
var _show_weapon: bool = false
var _layout: Dictionary = {}
var _label: String = ""
var _label_known: bool = false


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
	_action_button = TouchButton.new(Tr.t("ctl.action"), ControlsLayout.ACTION_SIZE)
	_action_button.name = "Action"
	_action_button.primary = true
	_action_button.font_size = 16
	_layer.add_child(_action_button)
	_jump_button = TouchButton.new(Tr.t("ctl.jump"), ControlsLayout.JUMP_SIZE)
	Tr.bind(_jump_button, "ctl.jump")
	_jump_button.name = "Jump"
	_jump_button.icon = UiIcons.JUMP
	_layer.add_child(_jump_button)
	_run_button = TouchButton.new(Tr.t("ctl.run"), ControlsLayout.RUN_SIZE)
	Tr.bind(_run_button, "ctl.run")
	_run_button.name = "Run"
	_layer.add_child(_run_button)
	_hit_button = TouchButton.new("HIT", ControlsLayout.HIT_SIZE)
	_hit_button.name = "Hit"
	_layer.add_child(_hit_button)
	_fire_button = TouchButton.new("FIRE", ControlsLayout.FIRE_SIZE)
	_fire_button.name = "Fire"
	_fire_button.font_size = 14
	_layer.add_child(_fire_button)
	_weapon_button = TouchButton.new("GUN", ControlsLayout.WEAPON_SIZE)
	_weapon_button.name = "Weapon"
	_weapon_button.font_size = 12
	_layer.add_child(_weapon_button)
	_layer.resized.connect(_place)
	visibility_changed.connect(_on_visibility)
	settings.changed.connect(_place)
	DeviceTracker.shared().changed.connect(_on_device)
	_place()


func _exit_tree() -> void:
	if settings != null and settings.changed.is_connected(_place):
		settings.changed.disconnect(_place)
	var tracker := DeviceTracker.shared()
	if tracker.changed.is_connected(_on_device):
		tracker.changed.disconnect(_on_device)


## Lays every control out from `ControlsLayout` (also when the settings change).
func _place() -> void:
	if _layer == null:
		return
	_layout = ControlsLayout.foot(_layer.size, settings)
	_put(_action_button, &"action")
	_put(_jump_button, &"jump")
	_put(_run_button, &"run")
	_run_button.visible = settings.run_toggle
	_put(_hit_button, &"hit")
	_put(_fire_button, &"fire")
	_put(_weapon_button, &"weapon")
	_fire_button.visible = _show_fire
	_weapon_button.visible = _show_weapon
	_layer.modulate.a = settings.opacity
	if _move_finger < 0:
		_base = _rest()
		_stick.show_at(_base, Vector2.ZERO, false)
	_on_device(DeviceTracker.shared().current)


func _put(button: TouchButton, key: StringName) -> void:
	var r: Rect2 = _layout[key]
	button.place(r.position, r.size.x)


func _on_device(device: DeviceTracker.Device) -> void:
	if _action_button == null:
		return
	_action_button.glyph = DeviceTracker.glyph(&"action", device)
	_jump_button.glyph = DeviceTracker.glyph(&"jump", device)
	_run_button.glyph = DeviceTracker.glyph(&"run", device)


func _process(_delta: float) -> void:
	if _action_button == null or not visible:
		return
	var text := action_context.label()
	if text != _label or not _label_known:
		_label_known = true
		_label = text
		_action_button.text = text if text != "" else Tr.t("ctl.action")
		_action_button.font_size = 16 if text.length() <= 6 else 13
		_action_button.dim = text == ""


func _rest() -> Vector2:
	var r: Rect2 = _layout[&"stick"]
	return _layer.global_position + r.get_center()


## The buttons, for layout tests and the screenshot review (RUN only while it shows).
func buttons() -> Array[TouchButton]:
	var out: Array[TouchButton] = [_action_button, _jump_button, _hit_button]
	if _run_button.visible:
		out.append(_run_button)
	if _fire_button.visible:
		out.append(_fire_button)
	if _weapon_button.visible:
		out.append(_weapon_button)
	return out


## The fight's buttons by name (&"hit", &"fire", &"weapon"), for tests.
func fight_button(key: StringName) -> TouchButton:
	match key:
		&"fire":
			return _fire_button
		&"weapon":
			return _weapon_button
	return _hit_button


## What the fight's buttons show: HIT's word (HIT or SWING with the bat), FIRE only with a loaded
## gun, the weapon pill (the gun's short name) only with two guns or more to switch between.
func set_weapons(hit_label: String, show_fire: bool, gun_label: String, show_switch: bool) -> void:
	if _hit_button == null:
		return
	if _hit_button.text != hit_label:
		_hit_button.text = hit_label
	if _weapon_button.text != gun_label:
		_weapon_button.text = gun_label
	if show_fire != _show_fire or show_switch != _show_weapon:
		_show_fire = show_fire
		_show_weapon = show_switch
		_fire_button.visible = show_fire
		_weapon_button.visible = show_switch
		if not show_fire:
			fire_held = false
			_fire_finger = -1


func consume_hit() -> bool:
	var out := _hit
	_hit = false
	return out


func consume_weapon() -> bool:
	var out := _weapon
	_weapon = false
	return out


## A test or the keyboard pressing HIT.
func press_hit() -> void:
	_hit = true


## A test pressing the weapon pill.
func press_weapon() -> void:
	_weapon = true


func action_button() -> TouchButton:
	return _action_button


## The stick's area at rest (its ring), in canvas units.
func stick_rect() -> Rect2:
	return Rect2(_layer.global_position + (_layout[&"stick"] as Rect2).position, (_layout[&"stick"] as Rect2).size)


## The areas that take a touch for the stick and for looking, in canvas units.
func zone(key: StringName) -> Rect2:
	var r: Rect2 = _layout[key]
	return Rect2(_layer.global_position + r.position, r.size)


func consume_look() -> Vector2:
	var out := _look
	_look = Vector2.ZERO
	return out


func consume_jump() -> bool:
	var out := _jump
	_jump = false
	return out


func consume_run_press() -> bool:
	var out := _run_press
	_run_press = false
	return out


## The ACTION button as a finger would press it: runs what the context offers.
func press_action() -> bool:
	var done := action_context.trigger()
	if done:
		action_pressed.emit()
		HapticsPlan.play(HapticsPlan.tick(), settings, DeviceTracker.shared().current)
	return done


## Drops every finger (pause, entering a vehicle).
func release_all() -> void:
	_move_finger = -1
	_look_finger = -1
	_fire_finger = -1
	fire_held = false
	move = Vector2.ZERO
	if _layout.has(&"stick") and _layer != null:
		_base = _rest()
		_stick.show_at(_base, Vector2.ZERO, false)


func _on_visibility() -> void:
	if not visible:
		release_all()


func _input(event: InputEvent) -> void:
	DeviceTracker.shared().observe(event)
	if not visible:
		return
	var touch := event as InputEventScreenTouch
	if touch != null:
		# The top-left corner belongs to the hidden performance-overlay gesture (`DebugHud`).
		if touch.pressed and CornerTaps.in_corner(touch.position):
			return
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
	if _action_button.hit(at):
		press_action()
		_action_button.lit = true
		return
	if _jump_button.hit(at):
		_jump = true
		_jump_button.lit = true
		return
	if _run_button.visible and _run_button.hit(at):
		_run_press = true
		_run_button.lit = true
		return
	if _hit_button.hit(at):
		_hit = true
		_hit_button.lit = true
		return
	if _fire_button.visible and _fire_button.hit(at):
		_fire_finger = index
		fire_held = true
		_fire_button.lit = true
		return
	if _weapon_button.visible and _weapon_button.hit(at):
		_weapon = true
		_weapon_button.lit = true
		return
	if zone(&"move_zone").has_point(at):
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
		_base = _rest()
		_stick.show_at(_base, Vector2.ZERO, false)
	elif index == _look_finger:
		_look_finger = -1
	if index == _fire_finger:
		_fire_finger = -1
		fire_held = false
		_fire_button.lit = false
	_hit_button.lit = false
	_weapon_button.lit = false
	_jump_button.lit = false
	_action_button.lit = false
	_run_button.lit = false


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
		draw_circle(c, radius, Color(UiTheme.GLASS_FILL, 0.3 * a))
		draw_arc(c, radius - 0.5, 0.0, TAU, 48, Color(UiTheme.GLASS_OUTLINE, 0.9 * a), 1.5, true)
		draw_circle(c + offset, knob * 0.5, Color(1, 1, 1, 0.3 * a))
		draw_arc(c + offset, knob * 0.5 - 0.5, 0.0, TAU, 40, Color(1, 1, 1, 0.7 * a), 1.5, true)
