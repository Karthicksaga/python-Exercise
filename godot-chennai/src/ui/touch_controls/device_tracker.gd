class_name DeviceTracker
extends RefCounted
## Which device the player used last (decision G-178), so the hints show the right glyphs: a
## touch, a gamepad button or stick, or a key. Fed every input event by the touch controls; the
## controls and the controls guide read `current`. A stick resting at a tiny drift does not count
## as using the pad. Pure logic.

enum Device { TOUCH, PAD, KEYBOARD }

signal changed(device: Device)

## A pad axis must move this far to count as use (drift and noise stay under it).
const AXIS_USE := 0.5

var current: Device = Device.TOUCH

static var _shared: DeviceTracker = null


static func shared() -> DeviceTracker:
	if _shared == null:
		_shared = DeviceTracker.new()
	return _shared


## Looks at one input event; returns the device it came from, or -1 when it says nothing.
func observe(event: InputEvent) -> int:
	var seen := -1
	if event is InputEventScreenTouch or event is InputEventScreenDrag:
		seen = Device.TOUCH
	elif event is InputEventJoypadButton:
		seen = Device.PAD
	elif event is InputEventJoypadMotion:
		if absf((event as InputEventJoypadMotion).axis_value) >= AXIS_USE:
			seen = Device.PAD
	elif event is InputEventKey:
		if (event as InputEventKey).pressed:
			seen = Device.KEYBOARD
	if seen >= 0 and seen != current:
		current = seen as Device
		changed.emit(current)
	return seen


## The glyph (short text) for a control on the device: "" for touch (the button itself is the
## hint), the pad's face button or trigger, the key.
static func glyph(control: StringName, device: Device) -> String:
	match device:
		Device.PAD:
			return String({&"action": "A", &"jump": "X", &"gas": "RT", &"brake": "LT", &"horn": "Y", &"exit": "B", &"pause": "START", &"move": "L", &"look": "R", &"run": "L3", &"steer": "L"}.get(control, ""))
		Device.KEYBOARD:
			return String({&"action": "E", &"jump": "SPACE", &"gas": "W", &"brake": "S", &"horn": "H", &"exit": "E", &"pause": "ESC", &"move": "WASD", &"look": "MOUSE", &"run": "SHIFT", &"steer": "A D"}.get(control, ""))
	return ""
