class_name CityHash
extends RefCounted
## Stable pseudo-random numbers in [0, 1) from an id and a salt, bit for bit the same as the
## Three.js game's `hash` (`game-engine/src/hash.ts`, also used by `furniture.ts`) and the props'
## `hash` (`game-world/src/props.ts`), so a building, a tree or a pole looks the same in both
## games. 32-bit maths emulated on GDScript's 64-bit ints (JavaScript `Math.imul`, `>>> 0`).

const _U32 := 0xffffffff


## JavaScript ToInt32 then `>>> 0` of a whole number: its value modulo 2^32.
static func u32(v: int) -> int:
	return v & _U32


## Low 32 bits of a * b for two uint32 values (`Math.imul` then `>>> 0`).
static func imul(a: int, b: int) -> int:
	a &= _U32
	b &= _U32
	var lo := (a & 0xffff) * b
	var hi := (((a >> 16) & 0xffff) * b) & 0xffff
	return (lo + (hi << 16)) & _U32


## `hash(id, salt)` of the renderer and the street furniture.
static func unit(id: int, salt: int) -> float:
	var t := u32(id) ^ imul(salt + 1, 0x9e3779b9)
	t = imul(t ^ (t >> 16), 0x21f0aaad)
	t = imul(t ^ (t >> 15), 0x735a2d97)
	return float(t ^ (t >> 15)) / 4294967296.0


## `hash(id, salt)` of the pavement props (other constants, last shift 16).
static func prop_unit(id: int, salt: int) -> float:
	var t := u32(id) ^ imul(salt + 1, 0x85ebca6b)
	t = imul(t ^ (t >> 16), 0x7feb352d)
	t = imul(t ^ (t >> 15), 0x846ca68b)
	return float(t ^ (t >> 16)) / 4294967296.0


## JavaScript `Math.round`: halves go up.
static func js_round(v: float) -> int:
	return floori(v + 0.5)


## `treeHash` of `ChunkView.ts`: from a tree's position, so a tree is a palm every time it loads.
static func tree_unit(position: Vector2, salt: int) -> float:
	var a := u32(js_round(position.x * 10.0) * 73856093)
	var b := u32(js_round(position.y * 10.0) * 19349663)
	return unit(a ^ b, salt)
