class_name SteerZone
extends Control
## Slide-to-steer, scheme A "wheel" (decision G-174): the whole left side of the screen (the right
## when left-handed) steers. Touch down anywhere (a ring shows where the thumb landed) and slide
## sideways: `SteerState.FULL_LOCK` units from the landing point is full lock, with no need to
## find the centre; lifting the thumb lets the steering ease back. The sliding is `SteerState`'s;
## this node draws the ring and feeds it fingers (touch and mouse). Buttons placed over it take
## their own touches first.

var state := SteerState.new()
var _finger: int = -2
var _origin: Vector2 = Vector2.ZERO
## Where the idle hint is drawn (local), set by the layout.
var rest: Rect2 = Rect2()


func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP


## The eased steering, -1..1.
var value: float:
	get:
		return state.value


func _gui_input(event: InputEvent) -> void:
	var st := event as InputEventScreenTouch
	var sd := event as InputEventScreenDrag
	var mb := event as InputEventMouseButton
	var mm := event as InputEventMouseMotion
	if st != null:
		if st.pressed and _finger == -2:
			_begin(st.index, st.position)
		elif not st.pressed and st.index == _finger:
			_end()
	elif sd != null and sd.index == _finger:
		state.drag(sd.position.x)
		queue_redraw()
	elif mb != null and mb.button_index == MOUSE_BUTTON_LEFT:
		if mb.pressed and _finger == -2:
			_begin(-1, mb.position)
		elif not mb.pressed and _finger == -1:
			_end()
	elif mm != null and _finger == -1:
		state.drag(mm.position.x)
		queue_redraw()
	else:
		return
	accept_event()


func _begin(finger: int, at: Vector2) -> void:
	_finger = finger
	_origin = at
	state.begin(at.x)
	queue_redraw()


func _end() -> void:
	_finger = -2
	state.end()
	queue_redraw()


## Tests and scripted demos: hold the steering at `v` (-1 to 1); 0 releases.
func hold(v: float) -> void:
	state.hold(v)
	if v == 0.0:
		_finger = -2
	queue_redraw()


func _physics_process(dt: float) -> void:
	var before := state.value
	state.step(dt)
	if state.value != before:
		queue_redraw()


func _notification(what: int) -> void:
	if what == NOTIFICATION_VISIBILITY_CHANGED and not is_visible_in_tree():
		_end()


func _draw() -> void:
	if _finger == -2 and not state.active:
		# Idle: a faint hint where the thumb usually rests.
		if rest.size != Vector2.ZERO:
			var c := rest.get_center()
			draw_arc(c, 44.0, 0.0, TAU, 40, Color(1, 1, 1, 0.22), 2.0, true)
			for side: float in [-1.0, 1.0]:
				var tip := Vector2(c.x + side * 70.0, c.y)
				draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-side * 12.0, -9.0), tip + Vector2(-side * 12.0, 9.0)]), Color(1, 1, 1, 0.3))
		return
	var ring_c := _origin
	if _finger == -2:
		ring_c = rest.get_center() if rest.size != Vector2.ZERO else size * 0.5
	draw_arc(ring_c, 48.0, 0.0, TAU, 48, Color(1, 1, 1, 0.55), 3.0, true)
	for side: float in [-1.0, 1.0]:
		var tip := ring_c + Vector2(side * 76.0, 0.0)
		draw_colored_polygon(PackedVector2Array([tip, tip + Vector2(-side * 12.0, -9.0), tip + Vector2(-side * 12.0, 9.0)]), Color(1, 1, 1, 0.45))
	draw_circle(ring_c + Vector2(state.value * 40.0, 0.0), 24.0, Color(1, 0.72, 0.01, 0.85))
