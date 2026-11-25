class_name CombatFigure
extends Node3D
## What a person who can fight, carry and hold a weapon has in common (decision G-430):
## `HumanFigure` (the player, fare passengers) and `PersonView` (walkers, crowds, gangsters) both
## extend it, so the combat code calls the same methods on everyone and `WeaponModels` takes
## either. The poses are procedural on the shared `PoseRig` (`StrikePose`, `CarryPose`), laid on
## after the clip and the walk's arm swing; the subclass calls `combat_after_clip(dt)` there.
##
## Nothing here costs anything while nobody fights: the pose objects are made on first use and
## `combat_after_clip` returns at once when nothing is going on.

## The blow reached its hit frame (fist fully out, bat across the front): apply the damage, the
## puff and the sound now. Emitted once per blow, on the step it is reached.
signal strike_hit(kind: StringName, side: int)

## The body for the procedural poses (null if the model lacks a core bone).
var poser: PoseRig = null
## The weapon held (set by `WeaponModels`): its id and the node in the hand.
var held_id: StringName = &""
var held_node: Node3D = null
var _strike: StrikePose = null
var _carry: CarryPose = null
var _flinch_t: float = StrikePose.FLINCH_TIME
var _flinch_axis: Vector3 = Vector3.RIGHT
var _flinch_strength: float = 1.0
## Closing of the hand round a held weapon, radians per joint.
const GRIP := 0.9


## Throw a blow: kind &"jab", &"cross", &"hook" or &"bat"; side 0 left hand, 1 right (the bat is
## swung from the right). Restarts a blow in progress. No-op without a body or for another kind.
func play_strike(kind: StringName, side: int) -> void:
	if poser == null or not StrikePose.is_kind(kind):
		return
	if _strike == null:
		_strike = StrikePose.new()
	_strike.start(kind, side)


func is_striking() -> bool:
	return _strike != null and _strike.active


func cancel_strike() -> void:
	if _strike != null:
		_strike.cancel()


## The blow being thrown: &"jab", &"cross", &"hook", &"bat", or &"".
func strike_kind() -> StringName:
	return _strike.kind if is_striking() else &""


## Seconds since the blow started (0 when none).
func strike_time() -> float:
	return _strike.t if is_striking() else 0.0


## Where the blow lands in the current pose, scene space: the fist, or the bat's blade.
func strike_point() -> Vector3:
	if _strike == null or poser == null:
		return global_position
	return to_global(_strike.point)


## Where the striking wrist was sent at the last posed step, scene space (tests, debugging).
func strike_wrist_target() -> Vector3:
	return to_global(_strike.wrist_target) if _strike != null else global_position


## Carry something in the hands (&"box", &"shoulder", &"bag", &"push") or put it down.
func carry(on: bool, kind: StringName = &"box") -> void:
	if poser == null:
		return
	if _carry == null:
		if not on:
			return
		_carry = CarryPose.new()
	if on and not CarryPose.is_kind(kind):
		return
	_carry.set_carry(on, kind, self)


## What is carried now (&"" when empty-handed or put down).
func carrying() -> StringName:
	return _carry.kind if _carry != null and _carry.on else &""


## Where `side`'s palm goes on the carried thing, scene space (tests, debugging).
func carry_anchor(side: int) -> Vector3:
	return to_global(_carry.anchors[side]) if _carry != null else global_position


## The carried box (null when none is drawn).
func carry_prop() -> Node3D:
	return _carry.prop if _carry != null else null


## Hit by something at `from` (scene space): the upper body bends away for a moment.
## `strength` 1 a punch, more for a bat.
func play_flinch(from: Vector3, strength: float = 1.0) -> void:
	var push := global_position - from
	push.y = 0.0
	if push.length_squared() < 0.0001:
		push = global_basis * Vector3.BACK
	push = global_basis.orthonormalized().inverse() * push.normalized()
	# Turning about up x push tips the top of the body along the push.
	_flinch_axis = Vector3.UP.cross(push).normalized()
	_flinch_strength = strength
	_flinch_t = 0.0


## For the subclass, once a step after the clip, the swing and the settling: lays carrying,
## the grip on a held weapon, a blow and a flinch on the skeleton. `show`: false only runs the
## clocks (a figure out of sight still lands its blows). Not called while seated or knocked down.
func combat_after_clip(dt: float, show: bool = true) -> void:
	if poser == null:
		return
	var fired := false
	if show:
		if _carry != null and _carry.active():
			_carry.apply(poser, dt)
		if held_node != null and not is_striking():
			poser.curl_fingers(1, GRIP)
	if _strike != null and _strike.active:
		fired = _strike.step(poser, dt, show)
	if show and _flinch_t < StrikePose.FLINCH_TIME:
		_flinch_t += dt
		var bend := StrikePose.flinch_amount(_flinch_t) * _flinch_strength
		poser.bend(PoseRig.SPINE1, _flinch_axis, 0.10 * bend)
		poser.bend(PoseRig.SPINE2, _flinch_axis, 0.16 * bend)
		poser.bend(PoseRig.NECK, _flinch_axis, 0.08 * bend)
	if fired:
		strike_hit.emit(_strike.kind, _strike.side)


## Seated or knocked down: nothing is thrown or carried in hand poses any more.
func combat_interrupt() -> void:
	cancel_strike()
	_flinch_t = StrikePose.FLINCH_TIME
	if _carry != null and _carry.prop != null:
		_carry.prop.visible = false
	if _carry != null:
		_carry.amount = 0.0


## True while the combat poses have anything to do (a quick test for the caller).
func combat_busy() -> bool:
	return (_strike != null and _strike.active) or (_carry != null and _carry.active()) or held_node != null or _flinch_t < StrikePose.FLINCH_TIME
