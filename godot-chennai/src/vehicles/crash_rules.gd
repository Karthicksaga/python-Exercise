class_name CrashRules
extends RefCounted
## What a hit does to the driver (TD-29 of the Three.js game, decisions G-75 and G-270). Pure
## rules; `Driving` applies them, `Vehicle.consume_hit` measures the hit.
##
## A hit is judged by its **severity**: the change of velocity the driver's vehicle should feel,
## in km/h. `Vehicle` measures its own change of velocity in the step (head on into a wall that
## is about the speed it hit at; a glancing blow counts only what was lost). Jolt already shares
## that change by mass when the other body is a free rigid body (a parked vehicle), but AI
## traffic is kinematic (infinitely heavy to the solver), so against traffic the measured change
## is scaled by the mass share `m_other / (m_self + m_other)`: a motorbike that hits a traffic
## motorbike feels half the change, not all of it (G-270, the owner's bug: "hitting another bike
## throws the player far").
##
## Bands, per kind in `vehicle_types.json` (`crash`), by severity:
## - below `BUMP_FROM`: nothing;
## - below `hurt_from`: **bump** (a wobble, no damage, the rider stays on);
## - below `fall_from`: **shaken** (seated, hurt by km/h over `hurt_from`);
## - below `throw_from`: **fall** (open seats only: the rider slides off sideways, low and slow;
##   the bike falls over);
## - from `throw_from`: **thrown** (over the bars or out through the windscreen).
## The contact angle matters: a two-wheeler hit from the side falls from `SIDE_FALL` of its
## `fall_from`; a hit from behind (pushed forwards) never throws (the seat holds the rider), at
## most a fall.

## Below this severity (km/h) a hit is not felt.
const BUMP_FROM := 4.0
## Share of the vehicle's speed before the crash a thrown body keeps.
const THROW_KEEP := 0.7
## The body leaves at this angle off the line of travel, to the side (radians).
const THROW_SPREAD := 0.45
const THROW_UP_OFF := 3.2
const THROW_UP_WINDSCREEN := 4.2
const THROW_UP_PER_KMH := 0.03
const THROW_UP_MAX := 6.5
const LIE_BASE := 0.8
const LIE_PER_DAMAGE := 0.015
const LIE_MAX := 2.4
## A rider who falls off keeps this share of the speed, slides off to the side at this angle
## (radians) with this upward speed (m/s), and lies at least `FALL_LIE` s.
const FALL_KEEP := 0.35
const FALL_SPREAD := 0.9
const FALL_UP := 1.0
const FALL_LIE := 0.6
## A fall also carries the body along the push the vehicle got: this share of the severity (a
## rider knocked off a standing bike from the side lands on the far side).
const FALL_PUSH := 0.3
## A two-wheeler hit from the side (contact within 60° of its side) falls from this share of
## its `fall_from`.
const SIDE_FALL := 0.75
## Wobble of a bump: at least this, growing to 1 at `hurt_from`.
const WOBBLE_MIN := 0.2


## One measured hit (`Vehicle.consume_hit`).
class Impact:
	extends RefCounted
	## The vehicle's change of planar velocity in the step, m/s.
	var measured: float = 0.0
	## Direction of that change (unit, x and z): the push the vehicle got.
	var push: Vector2 = Vector2.ZERO
	## The vehicle's velocity over the ground before the hit (x, z), m/s.
	var approach: Vector2 = Vector2.ZERO
	## The vehicle's heading (unit, x and z; -Z is 0).
	var forward: Vector2 = Vector2(0, -1)
	var self_mass: float = 1.0
	## The other body's mass; INF for the world (walls, poles).
	var other_mass: float = INF
	## True when the solver could not move the other body (static or kinematic): its mass is
	## then applied here.
	var other_fixed: bool = true
	## The other body's kind (&"bike", &"car", … ) or &"" for the world.
	var other_kind: StringName = &""
	## What was hit (a `Vehicle`, a traffic view, a wall), or null.
	var other: Object = null
	## Scene point and normal of the contact (the normal points from the other body to this one).
	var point: Vector3 = Vector3.ZERO
	var normal: Vector3 = Vector3.ZERO


class Outcome:
	extends RefCounted
	## &"none", &"bump", &"shaken", &"fall" or &"thrown".
	var type: StringName = &"none"
	## Severity of the hit, km/h (the measured change, shared by mass when the other is fixed).
	var impact_kmh: float = 0.0
	var damage: float = 0.0
	## "off" or "windscreen" (fall and thrown).
	var style: String = ""
	var topples: bool = false
	## Seconds lying still once stopped (fall and thrown).
	var lie_for: float = 0.0
	## The body's velocity as it leaves the vehicle, m/s (fall and thrown).
	var launch: Vector3 = Vector3.ZERO
	## 0..1 how hard the vehicle and rider wobble (every felt hit).
	var wobble: float = 0.0
	## &"front", &"side" or &"rear": where the vehicle was hit.
	var contact: StringName = &"front"
	## The hit as measured (point, normal, other body); null for a bare `judge`.
	var hit: Impact = null


## Severity (m/s) of a measured hit: the measured change, shared by mass when the other body
## could not be moved by the solver.
static func severity(i: Impact) -> float:
	if i.other_fixed and is_finite(i.other_mass):
		return i.measured * i.other_mass / (i.self_mass + i.other_mass)
	return i.measured


## &"front", &"side" or &"rear" from the push the vehicle got and its heading.
static func contact_of(push: Vector2, forward: Vector2) -> StringName:
	if push.length_squared() < 1e-6 or forward.length_squared() < 1e-6:
		return &"front"
	var along := push.normalized().dot(forward.normalized())
	if along < -0.5:
		return &"front"
	if along > 0.5:
		return &"rear"
	return &"side"


## Judge a measured hit. `side` 1: a body goes right of the line of travel, -1 left.
static func judge_hit(rule: VehicleType.CrashRule, i: Impact, side: int) -> Outcome:
	var o := decide(rule, severity(i), i.approach, side, contact_of(i.push, i.forward), i.push)
	o.hit = i
	return o


## Judge a head-on hit of `impact` m/s (a wall).
## @param approach velocity over the ground before the crash (x, z)
## @param side 1: the body goes right of the line of travel, -1 left
static func judge(rule: VehicleType.CrashRule, impact: float, approach: Vector2, side: int) -> Outcome:
	return decide(rule, impact, approach, side, &"front")


## The band and its numbers for a severity (m/s), a contact and the push (unit, x and z).
static func decide(rule: VehicleType.CrashRule, impact: float, approach: Vector2, side: int, contact: StringName, push: Vector2 = Vector2.ZERO) -> Outcome:
	var o := Outcome.new()
	var kmh := impact * 3.6
	o.impact_kmh = kmh
	o.contact = contact
	if kmh < BUMP_FROM:
		return o
	o.wobble = clampf(kmh / maxf(1.0, rule.hurt_from), WOBBLE_MIN, 1.0)
	var fall_from := rule.fall_from
	if fall_from >= 0.0 and contact == &"side" and rule.topples:
		fall_from *= SIDE_FALL
	var can_throw := rule.throw_from >= 0.0 and contact != &"rear"
	if can_throw and kmh >= rule.throw_from:
		o.type = &"thrown"
		o.damage = minf(100.0, rule.throw_base + rule.throw_per_kmh * (kmh - rule.throw_from))
		o.style = rule.style
		o.topples = rule.topples
		o.lie_for = minf(LIE_MAX, LIE_BASE + LIE_PER_DAMAGE * o.damage)
		# The body keeps most of its own speed, but never more than the hit took from it.
		var speed := minf(approach.length(), impact) * THROW_KEEP
		var up := minf(THROW_UP_MAX, (THROW_UP_WINDSCREEN if rule.style == "windscreen" else THROW_UP_OFF) + THROW_UP_PER_KMH * kmh)
		o.launch = _launch(approach, side, THROW_SPREAD, speed, up)
	elif fall_from >= 0.0 and kmh >= fall_from:
		o.type = &"fall"
		o.damage = minf(100.0, rule.fall_base + rule.seated_damage * (kmh - rule.hurt_from))
		o.style = "off"
		o.topples = rule.topples
		o.lie_for = minf(LIE_MAX, FALL_LIE + LIE_PER_DAMAGE * o.damage)
		o.launch = _launch(approach, side, FALL_SPREAD, approach.length() * FALL_KEEP, FALL_UP) + Vector3(push.x, 0.0, push.y) * impact * FALL_PUSH
	elif kmh >= rule.hurt_from:
		o.type = &"shaken"
		o.wobble = 1.0
		o.damage = rule.seated_damage * (kmh - rule.hurt_from)
	else:
		o.type = &"bump"
	return o


## Velocity leaving at `spread` radians to `side` of the travel, `speed` flat and `up` upwards.
static func _launch(approach: Vector2, side: int, spread: float, speed: float, up: float) -> Vector3:
	# Heading of travel (0 = -Z, positive turning left); "right" turns it clockwise.
	var travel := atan2(-approach.x, -approach.y) - side * spread
	return Vector3(-sin(travel) * speed, up, -cos(travel) * speed)
