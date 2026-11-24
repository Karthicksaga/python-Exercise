class_name HapticsPlan
extends RefCounted
## What to buzz for what happened (decision G-178), kept apart from the device calls so it can be
## tested: a crash outcome and its damage become a phone buzz (milliseconds, amplitude) and a pad
## rumble (weak and strong motor, seconds). `play_*` does the real calls and respects the
## haptics setting. Pure plan, tiny glue.

## [milliseconds, amplitude 0..1, weak motor, strong motor, pad seconds]
static func crash(outcome_type: StringName, damage: float) -> Dictionary:
	var hard := clampf(damage / 40.0, 0.0, 1.0)
	match outcome_type:
		&"thrown", &"toppled":
			return {"ms": 320, "amp": 1.0, "weak": 0.6, "strong": 1.0, "seconds": 0.5}
		&"fall":
			return {"ms": 240, "amp": 0.9, "weak": 0.6, "strong": 0.8, "seconds": 0.4}
		&"bump":
			return {"ms": 40, "amp": 0.45, "weak": 0.3, "strong": 0.1, "seconds": 0.08}
		&"shaken":
			return {"ms": roundi(lerpf(80.0, 220.0, hard)), "amp": lerpf(0.5, 0.9, hard), "weak": 0.5, "strong": lerpf(0.4, 0.8, hard), "seconds": 0.25}
	return {}


## A light tick (ACTION taken, a jump).
static func tick() -> Dictionary:
	return {"ms": 12, "amp": 0.4, "weak": 0.2, "strong": 0.0, "seconds": 0.05}


static func play(plan: Dictionary, settings: ControlSettings, device: DeviceTracker.Device) -> void:
	if plan.is_empty() or not settings.haptics:
		return
	if device == DeviceTracker.Device.PAD:
		Input.start_joy_vibration(0, float(plan["weak"]), float(plan["strong"]), float(plan["seconds"]))
	else:
		Input.vibrate_handheld(int(plan["ms"]), float(plan["amp"]))
