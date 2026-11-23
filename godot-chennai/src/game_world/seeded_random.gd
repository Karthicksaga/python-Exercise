## mulberry32, bit for bit as `seededRandom` in the TypeScript game (`shareAuto.ts`), so a
## seeded shift replays the same crowd. Call `next()` for a float in [0, 1).
class_name SeededRandom
extends RefCounted

const MASK := 0xFFFFFFFF

var _a: int


func _init(seed_value: int = 1) -> void:
	_a = seed_value & MASK


## Math.imul on unsigned 32-bit values, kept inside 64-bit integers.
static func imul(a: int, b: int) -> int:
	a &= MASK
	b &= MASK
	var hi: int = ((a * (b >> 16)) & 0xFFFF) << 16
	return (hi + a * (b & 0xFFFF)) & MASK


func next() -> float:
	_a = (_a + 0x6D2B79F5) & MASK
	var t: int = _a
	t = imul(t ^ (t >> 15), t | 1)
	t = (t ^ ((t + imul(t ^ (t >> 7), t | 61)) & MASK)) & MASK
	return float((t ^ (t >> 14)) & MASK) / 4294967296.0


## A Callable for rules that take a random source. The caller must keep this object alive
## (a Callable does not): `Combat` and `ShareShift` take the SeededRandom itself for that.
func as_callable() -> Callable:
	return next
