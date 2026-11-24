class_name AiRandom
extends RefCounted
## Small deterministic generator (the Three.js `seeded()`, mulberry32), so the AI behaves the
## same in every run and in the tests. 32-bit arithmetic on GDScript's 64-bit ints.

const MASK := 0xffffffff
var _state: int = 0


func _init(seed_value: int = 1) -> void:
	_state = seed_value & MASK


## The next number in [0, 1).
func next() -> float:
	_state = (_state + 0x6d2b79f5) & MASK
	var t := _state
	t = _imul(t ^ (t >> 15), t | 1)
	t = t ^ ((t + _imul(t ^ (t >> 7), t | 61)) & MASK)
	return float((t ^ (t >> 14)) & MASK) / 4294967296.0


static func _imul(a: int, b: int) -> int:
	return (a * b) & MASK


## Stable pseudo-random number in [0, 1) from three integers (`crowdHash` of `Crowds.ts`).
static func hash3(a: int, b: int, c: int) -> float:
	var t := (_imul(a & MASK, 0x27d4eb2d) ^ _imul(b & MASK, 0x165667b1) ^ _imul(c & MASK, 0x9e3779b9)) & MASK
	t = _imul(t ^ (t >> 16), 0x21f0aaad)
	t = _imul(t ^ (t >> 15), 0x735a2d97)
	return float((t ^ (t >> 15)) & MASK) / 4294967296.0
