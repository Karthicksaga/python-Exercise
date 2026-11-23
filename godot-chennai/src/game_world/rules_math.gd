## Small numeric helpers shared by the pure game rules, written so the ported rules give the
## same numbers as the TypeScript game (`Math.round` rounds halves up, not away from zero).
class_name RulesMath
extends RefCounted


## JavaScript `Math.round`: halves go towards +infinity (-2.5 -> -2, 2.5 -> 3).
static func js_round(v: float) -> float:
	return floorf(v + 0.5)


static func js_round_int(v: float) -> int:
	return int(floorf(v + 0.5))


static func hypot(x: float, z: float) -> float:
	return sqrt(x * x + z * z)


## Hours wrapped into 0 <= h < 24.
static func wrap_hour(h: float) -> float:
	return fmod(fmod(h, 24.0) + 24.0, 24.0)


## "18:30" for a game hour.
static func clock_text(hour: float) -> String:
	var minutes: int = js_round_int(wrap_hour(hour) * 60.0) % (24 * 60)
	return "%02d:%02d" % [minutes / 60, minutes % 60]


## The smallest angle between two headings, radians.
static func angle_between(a: float, b: float) -> float:
	return absf(atan2(sin(a - b), cos(a - b)))


## Rounded to one decimal, as the TypeScript `Math.round(v * 10) / 10`.
static func round1(v: float) -> float:
	return js_round(v * 10.0) / 10.0


## A stable sort (JavaScript's `Array.prototype.sort` is stable; Godot's `sort_custom` is not),
## so ties keep their order as in the TypeScript rules. Returns a new array.
static func stable_sorted(list: Array, less: Callable) -> Array:
	var out := list.duplicate()
	for i in range(1, out.size()):
		var item: Variant = out[i]
		var j := i - 1
		while j >= 0 and less.call(item, out[j]):
			out[j + 1] = out[j]
			j -= 1
		out[j + 1] = item
	return out
