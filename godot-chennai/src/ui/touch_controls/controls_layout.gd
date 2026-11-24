class_name ControlsLayout
extends RefCounted
## Where every touch control sits (decision G-177): one pure function per control set, from the
## play area's size in UI units (the 915x412 base scales with the screen) and the settings.
## The right-handed layout is computed; the left-handed one is its exact mirror
## (`x' = width - x - w`), so nothing is laid out twice and a test can compare them. Rects are in
## the play area's own coordinates (inside the safe area). Sizes are the 915x412 dp values;
## the button-size setting scales them, never under `MIN_TARGET`.
##
## New schemes or combat buttons are added here: a new key in the dictionaries below and a
## button node in the controls that reads it.

const MIN_TARGET := 48.0

## On foot.
## Hit-area sizes: the glass circle drawn inside is about 80 % of these (G-290), so a button is
## smaller to the eye than before and still at least 48 dp to the thumb.
const ACTION_SIZE := 88.0
const JUMP_SIZE := 70.0
const RUN_SIZE := 70.0
const FOOT_RIGHT := 20.0
const FOOT_BOTTOM := 36.0
const FOOT_GAP := 10.0
## Share of the width, from the stick's side, where a touch takes the stick (the rest looks).
const MOVE_SHARE := 0.45
const STICK_RADIUS := 56.0
const STICK_REST := 28.0

## Driving.
const GAS_SIZE := Vector2(92, 92)
const BRAKE_SIZE := Vector2(76, 76)
const HORN_SIZE := 52.0
const EXIT_SIZE := Vector2(48, 48)
const DRIVE_RIGHT := 16.0
## Room under the pedals for BRAKE's "hold to reverse" line, clear of the map credit.
const DRIVE_BOTTOM := 40.0
const DRIVE_GAP := 12.0
const READOUT_SIZE := Vector2(180, 40)
## Share of the width, from the steering side, where a touch steers.
const STEER_SHARE := 0.5


static func _px(v: float, k: float) -> float:
	return maxf(MIN_TARGET, v * k)


static func _mirror(r: Rect2, width: float) -> Rect2:
	return Rect2(width - r.position.x - r.size.x, r.position.y, r.size.x, r.size.y)


static func _handed(rects: Dictionary, area: Vector2, s: ControlSettings) -> Dictionary:
	if not s.left_handed:
		return rects
	var out := {}
	for key: Variant in rects:
		out[key] = _mirror(rects[key] as Rect2, area.x)
	return out


## On foot. Keys: &"action", &"jump", &"run" (the toggle-run button, only shown when the setting
## is on), &"stick" (the stick's ring at rest), &"move_zone", &"look_zone".
static func foot(area: Vector2, s: ControlSettings) -> Dictionary:
	var k := s.button_scale()
	var a := _px(ACTION_SIZE, k)
	var j := _px(JUMP_SIZE, k)
	var r := _px(RUN_SIZE, k)
	var action := Rect2(area.x - FOOT_RIGHT - a, area.y - FOOT_BOTTOM - a, a, a)
	var jump := Rect2(action.position.x + (a - j) * 0.5, action.position.y - FOOT_GAP - j, j, j)
	# The toggle-run button sits on the thumb's arc, to ACTION's left.
	var run := Rect2(action.position.x - FOOT_GAP - r, area.y - FOOT_BOTTOM - r, r, r)
	var ring := Vector2.ONE * STICK_RADIUS * 2.0
	var rects := {
		&"action": action,
		&"jump": jump,
		&"run": run,
		&"stick": Rect2(Vector2(STICK_REST, area.y - STICK_REST - ring.y), ring),
		&"move_zone": Rect2(0.0, 0.0, area.x * MOVE_SHARE, area.y),
		&"look_zone": Rect2(area.x * MOVE_SHARE, 0.0, area.x * (1.0 - MOVE_SHARE), area.y),
	}
	return _handed(rects, area, s)


## Driving, scheme A (wheel). Keys: &"gas", &"brake", &"horn", &"exit", &"readout",
## &"steer_zone" (a touch there steers), &"steer_rest" (where the idle hint shows).
static func driving(area: Vector2, s: ControlSettings) -> Dictionary:
	var k := s.button_scale()
	var gas_size := Vector2(_px(GAS_SIZE.x, k), _px(GAS_SIZE.y, k))
	var brake_size := Vector2(_px(BRAKE_SIZE.x, k), _px(BRAKE_SIZE.y, k))
	var horn := _px(HORN_SIZE, k)
	var gas := Rect2(area.x - DRIVE_RIGHT - gas_size.x, area.y - DRIVE_BOTTOM - gas_size.y, gas_size.x, gas_size.y)
	var brake := Rect2(gas.position.x - DRIVE_GAP - brake_size.x, area.y - DRIVE_BOTTOM - brake_size.y, brake_size.x, brake_size.y)
	var horn_rect := Rect2(brake.position.x, brake.position.y - DRIVE_GAP - horn, horn, horn)
	var exit_rect := Rect2(area.x - EXIT_SIZE.x, 0.0, EXIT_SIZE.x, maxf(EXIT_SIZE.y, MIN_TARGET))
	var rects := {
		&"gas": gas,
		&"brake": brake,
		&"horn": horn_rect,
		&"exit": exit_rect,
		&"readout": Rect2((area.x - READOUT_SIZE.x) * 0.5, area.y - READOUT_SIZE.y, READOUT_SIZE.x, READOUT_SIZE.y),
		&"steer_zone": Rect2(0.0, 0.0, area.x * STEER_SHARE, area.y),
		&"steer_rest": Rect2(24.0, area.y - 24.0 - 120.0, 200.0, 120.0),
	}
	# The readout is centred already; mirroring keeps it so.
	return _handed(rects, area, s)


## Only the touchable buttons of a layout (not zones, ring or readout), for tests and hit checks.
static func buttons_of(rects: Dictionary) -> Dictionary:
	var out := {}
	for key: Variant in rects:
		if key in [&"action", &"jump", &"run", &"gas", &"brake", &"horn", &"exit"]:
			out[key] = rects[key]
	return out
