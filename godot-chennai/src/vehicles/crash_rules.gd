class_name CrashRules
extends RefCounted
## What a hard impact does to the driver (TD-29 of the Three.js game, decision G-75). Pure rules;
## `Driving` applies them. "Impact" is the vehicle's change of velocity in one physics step
## (`Vehicle.consume_impact`): head on into a wall it is the speed it hit at; a glancing blow
## counts only what was lost. Thresholds per kind are in `vehicle_types.json` (`crash`).

## Share of the vehicle's speed before the crash the thrown body keeps.
const THROW_KEEP := 0.8
## The body leaves at this angle off the line of travel, to the side (radians).
const THROW_SPREAD := 0.45
const THROW_UP_OFF := 3.2
const THROW_UP_WINDSCREEN := 4.2
const THROW_UP_PER_KMH := 0.03
const THROW_UP_MAX := 6.5
const LIE_BASE := 0.8
const LIE_PER_DAMAGE := 0.015
const LIE_MAX := 2.4


class Outcome:
	extends RefCounted
	## &"none", &"shaken" or &"thrown".
	var type: StringName = &"none"
	var impact_kmh: float = 0.0
	var damage: float = 0.0
	## "off" or "windscreen" (thrown only).
	var style: String = ""
	var topples: bool = false
	## Seconds lying still once stopped (thrown only).
	var lie_for: float = 0.0
	## The body's velocity as it leaves the vehicle, m/s (thrown only).
	var launch: Vector3 = Vector3.ZERO


## @param impact change of velocity in the crash step, m/s
## @param approach velocity over the ground before the crash (x, z)
## @param side 1: the body goes right of the line of travel, -1 left
static func judge(rule: VehicleType.CrashRule, impact: float, approach: Vector2, side: int) -> Outcome:
	var o := Outcome.new()
	var kmh := impact * 3.6
	o.impact_kmh = kmh
	if rule.throw_from >= 0.0 and kmh >= rule.throw_from:
		o.type = &"thrown"
		o.damage = minf(100.0, rule.throw_base + rule.throw_per_kmh * (kmh - rule.throw_from))
		o.style = rule.style
		o.topples = rule.topples
		o.lie_for = minf(LIE_MAX, LIE_BASE + LIE_PER_DAMAGE * o.damage)
		var speed := approach.length() * THROW_KEEP
		# Heading of travel (0 = -Z, positive turning left); "right" turns it clockwise.
		var travel := atan2(-approach.x, -approach.y) - side * THROW_SPREAD
		var up := minf(THROW_UP_MAX, (THROW_UP_WINDSCREEN if rule.style == "windscreen" else THROW_UP_OFF) + THROW_UP_PER_KMH * kmh)
		o.launch = Vector3(-sin(travel) * speed, up, -cos(travel) * speed)
	elif kmh >= rule.hurt_from:
		o.type = &"shaken"
		o.damage = rule.seated_damage * (kmh - rule.hurt_from)
	return o
