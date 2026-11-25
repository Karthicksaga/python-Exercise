class_name TouchScroll
extends ScrollContainer
## A vertical scroll container that works under a real thumb (G-350). The engine's own drag
## scrolling depends on which child takes the press and on whether the phone delivers touch or
## emulated mouse events, and on the owner's phone it moved a little or jumped. This one owns the
## whole gesture, whatever the source:
## - a press inside it is held back; moving more than `TAP_SLOP` turns it into a drag that moves
##   the list one-to-one with the finger (rubber band past the ends), a release after a drag
##   flicks (inertia) and settles back from an overscroll (bounce);
## - a release under `TAP_SLOP` is a tap: the press and release are replayed as a left click at
##   that spot, so the row under the finger is pressed;
## - a press on the scrollbar (plus `BAR_SLOP` to its left) drags the bar, which follows the finger;
## - touch and emulated mouse describe the same finger: the first family to start owns the
##   gesture and the other family's events are swallowed until it ends.
## Time comes from `step(delta)` (called from `_process`), so tests drive it with a fixed delta.

const TAP_SLOP := 10.0
const BAR_SLOP := 6.0
const BAR_WIDTH := 18
const FRICTION := 3.2  ## per second: a flick of v px/s travels about v / FRICTION
const STOP_SPEED := 12.0
const MAX_SPEED := 7000.0
const RUBBER := 0.45  ## how much of a finger move counts past an end
const SPRING := 160.0
const DAMPING := 22.0

## Controls drawn over lists while they show (the full map over the pause menu) join this group:
## a press on one of them is not this list's gesture. `_input` runs by tree order, not by what is
## drawn on top, so without it the pause list under the map took every drag meant for the map (G-492).
const COVER_GROUP := &"touch_scroll_cover"

enum Mode { IDLE, PENDING, DRAG, BAR }
enum Source { NONE, TOUCH, MOUSE }

var _mode: Mode = Mode.IDLE
var _source: Source = Source.NONE
var _finger: int = 0
var _start: Vector2 = Vector2.ZERO  ## local position of the press
var _last: Vector2 = Vector2.ZERO
var _y: float = 0.0  ## continuous scroll, may be outside [0, max] while rubber-banding
var _vel: float = 0.0
var _moved: float = 0.0  ## scroll units moved since the last step (for the velocity)
var _momentum: bool = false
var _swallow_up: Source = Source.NONE
## True while any TouchScroll replays a tap: another visible list must not take the click as a
## new gesture of its own (shared by every instance).
static var _replaying: bool = false
var _bar_grab: float = 0.0
var _base_y: float = 0.0
var _over_applied: float = 0.0


func _init() -> void:
	horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	follow_focus = true
	process_mode = Node.PROCESS_MODE_ALWAYS


func _ready() -> void:
	sort_children.connect(_after_sort)
	set_process(true)


func _process(delta: float) -> void:
	step(delta)


## Max scroll_vertical (what the bar can reach).
func max_scroll() -> float:
	var bar := get_v_scroll_bar()
	return maxf(0.0, bar.max_value - bar.page)


func is_interacting() -> bool:
	return _mode != Mode.IDLE or _momentum


## Advances the drag velocity, the flick and the bounce by `delta` seconds.
func step(delta: float) -> void:
	if delta <= 0.0:
		return
	if _mode == Mode.DRAG:
		var inst := _moved / delta
		_vel = clampf(lerpf(_vel, inst, 0.6), -MAX_SPEED, MAX_SPEED)
		_moved = 0.0
		return
	if _mode != Mode.IDLE:
		return
	if not _momentum:
		_y = float(scroll_vertical)  # follow outside changes (focus, code)
		return
	var hi := max_scroll()
	if _y < 0.0 or _y > hi:
		var edge := 0.0 if _y < 0.0 else hi
		_vel += ((edge - _y) * SPRING - _vel * DAMPING) * delta
	else:
		_vel *= exp(-FRICTION * delta)
	_y += _vel * delta
	var settled := absf(_vel) < STOP_SPEED
	if _y >= 0.0 and _y <= hi and settled:
		_momentum = false
	elif (_y < 0.0 or _y > hi) and settled and absf((0.0 if _y < 0.0 else hi) - _y) < 0.5:
		_y = clampf(_y, 0.0, hi)
		_momentum = false
	_apply()
	if not _momentum:
		_vel = 0.0


func _apply() -> void:
	var hi := max_scroll()
	var clamped := clampf(_y, 0.0, hi)
	scroll_vertical = int(roundf(clamped))
	_over_applied = _y - clamped
	_shift_child()


func _shift_child() -> void:
	if get_child_count() == 0:
		return
	for c: Node in get_children():
		if c is Control and c != get_v_scroll_bar() and c != get_h_scroll_bar():
			(c as Control).position.y = _base_y - _over_applied
			return


func _after_sort() -> void:
	for c: Node in get_children():
		if c is Control and c != get_v_scroll_bar() and c != get_h_scroll_bar():
			_base_y = (c as Control).position.y
			(c as Control).position.y = _base_y - _over_applied
			return


func _to_local(p: Vector2) -> Vector2:
	return get_global_transform_with_canvas().affine_inverse() * p


func _inside(local: Vector2) -> bool:
	return Rect2(Vector2.ZERO, size).has_point(local)


func _bar_rect() -> Rect2:
	var bar := get_v_scroll_bar()
	if not bar.visible:
		return Rect2()
	return Rect2(bar.position - Vector2(BAR_SLOP, 0.0), bar.size + Vector2(BAR_SLOP, 0.0))


func _input(event: InputEvent) -> void:
	if _replaying or not is_visible_in_tree():
		if _mode != Mode.IDLE and not is_visible_in_tree():
			_cancel()
		return
	var src := Source.NONE
	var pos := Vector2.ZERO
	var pressed := false
	var kind := 0  # 1 press/release, 2 move
	var idx := 0
	if event is InputEventScreenTouch:
		var t := event as InputEventScreenTouch
		src = Source.TOUCH
		pos = t.position
		pressed = t.pressed
		kind = 1
		idx = t.index
	elif event is InputEventScreenDrag:
		var d := event as InputEventScreenDrag
		src = Source.TOUCH
		pos = d.position
		kind = 2
		idx = d.index
	elif event is InputEventMouseButton:
		var m := event as InputEventMouseButton
		if m.button_index != MOUSE_BUTTON_LEFT:
			return
		src = Source.MOUSE
		pos = m.position
		pressed = m.pressed
		kind = 1
	elif event is InputEventMouseMotion:
		var mm := event as InputEventMouseMotion
		src = Source.MOUSE
		pos = mm.position
		kind = 2
	else:
		return
	var local := _to_local(pos)
	if _mode == Mode.IDLE:
		if kind == 1 and not pressed and src == _swallow_up:
			_swallow_up = Source.NONE
			get_viewport().set_input_as_handled()
			return
		if kind != 1 or not pressed or not _inside(local):
			return
		if _covered(pos):
			return
		if max_scroll() <= 0.0:
			return  # nothing to scroll: let the rows take the press as usual
		_begin(src, idx, local, event)
		get_viewport().set_input_as_handled()
		return
	# A gesture is running.
	if src != _source:
		# The same finger as emulated events of the other family: swallow them.
		get_viewport().set_input_as_handled()
		return
	if src == Source.TOUCH and idx != _finger:
		return
	get_viewport().set_input_as_handled()
	if kind == 2:
		_move(local)
	elif not pressed:
		_end(local, event)


## True when a visible cover (`COVER_GROUP`) that is not this list's own ancestor is under `at`
## (viewport coordinates).
func _covered(at: Vector2) -> bool:
	for n: Node in get_tree().get_nodes_in_group(COVER_GROUP):
		var c := n as Control
		if c == null or not c.is_visible_in_tree() or c.is_ancestor_of(self):
			continue
		var p := c.get_global_transform_with_canvas().affine_inverse() * at
		if Rect2(Vector2.ZERO, c.size).has_point(p):
			return true
	return false


func _begin(src: Source, idx: int, local: Vector2, _event: InputEvent) -> void:
	_source = src
	_finger = idx
	_start = local
	_last = local
	_momentum = false
	_vel = 0.0
	_moved = 0.0
	_y = float(scroll_vertical) + _over_applied
	if _bar_rect().has_point(local):
		_mode = Mode.BAR
		var bar := get_v_scroll_bar()
		var th := _thumb_rect(bar)
		_bar_grab = local.y - th.position.y if (local.y >= th.position.y and local.y <= th.end.y) else th.size.y * 0.5
		_drag_bar(local)
	else:
		_mode = Mode.PENDING


func _thumb_rect(bar: ScrollBar) -> Rect2:
	var track := bar.size.y
	var total := maxf(1.0, bar.max_value - bar.min_value)
	var th := clampf(track * bar.page / total, 24.0, track)
	var span := maxf(0.0, bar.max_value - bar.page)
	var off := 0.0 if span <= 0.0 else (track - th) * (bar.value / span)
	return Rect2(bar.position.x, bar.position.y + off, bar.size.x, th)


func _drag_bar(local: Vector2) -> void:
	var bar := get_v_scroll_bar()
	var th := _thumb_rect(bar)
	var free := maxf(1.0, bar.size.y - th.size.y)
	var ratio := clampf((local.y - _bar_grab - bar.position.y) / free, 0.0, 1.0)
	_y = ratio * max_scroll()
	_apply()


func _move(local: Vector2) -> void:
	if _mode == Mode.BAR:
		_drag_bar(local)
		return
	if _mode == Mode.PENDING:
		if local.distance_to(_start) <= TAP_SLOP:
			return
		_mode = Mode.DRAG
		_last = _start  # the whole travel counts, no dead lag
	var dy := local.y - _last.y
	_last = local
	var hi := max_scroll()
	var move := -dy
	# Past an end the list follows only part of the finger.
	if (_y <= 0.0 and move < 0.0) or (_y >= hi and move > 0.0):
		move *= RUBBER
	_y += move
	_moved += move
	_apply()


func _end(local: Vector2, _event: InputEvent) -> void:
	var was := _mode
	var src := _source
	_mode = Mode.IDLE
	_source = Source.NONE
	_swallow_up = Source.MOUSE if src == Source.TOUCH else Source.TOUCH
	if was == Mode.PENDING:
		_tap(local)
	elif was == Mode.DRAG:
		_momentum = absf(_vel) > STOP_SPEED or _y < 0.0 or _y > max_scroll()
	elif was == Mode.BAR:
		_momentum = false


func _cancel() -> void:
	_mode = Mode.IDLE
	_source = Source.NONE
	_momentum = false
	_vel = 0.0
	_over_applied = 0.0
	_shift_child()


## A press and release at `local` that did not move: click what is under it.
## The click is pushed in the viewport's own coordinates (`in_local_coords` true, G-490). The
## position comes from the canvas transform, which is already in those units; pushed as window
## coordinates, the viewport would map it through the stretch transform a second time. On a phone
## (canvas_items stretch, 2460x1080 window over a 938x412 UI, scale 2.62) the click landed at
## a third of the spot, on the dim behind the panel, so no row in any scrolling menu could be tapped.
## Unscaled test viewports did not show it.
func _tap(local: Vector2) -> void:
	var at := get_global_transform_with_canvas() * local
	_replaying = true
	var vp := get_viewport()
	var motion := InputEventMouseMotion.new()
	motion.position = at
	motion.global_position = at
	vp.push_input(motion, true)
	for down: bool in [true, false]:
		var b := InputEventMouseButton.new()
		b.button_index = MOUSE_BUTTON_LEFT
		b.pressed = down
		b.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0
		b.position = at
		b.global_position = at
		vp.push_input(b, true)
	_replaying = false
