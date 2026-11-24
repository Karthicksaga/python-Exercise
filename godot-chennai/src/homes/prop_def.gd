class_name PropDef
extends RefCounted
## One piece of furniture or decoration (from `data/homes/props.json`).

const FLOOR := &"floor"
const WALL := &"wall"
const CEILING := &"ceiling"

var id: String = ""
var category: String = ""
var en: String = ""
var ta: String = ""
## Footprint in 1 m cells (width along x, depth along z) at rotation 0.
var w: int = 1
var d: int = 1
## FLOOR, WALL (hangs on the nearest wall) or CEILING (hangs above the spot).
var kind: StringName = FLOOR
## A floor piece the player can walk over (a mat).
var walkable: bool = false
## The model: boxes, cylinders, spheres, cones and tori `{t, a, c, p, r?, g?}` (see props.json).
var parts: Array[Dictionary] = []


## Cells wide and deep at a quarter-turn count (floor pieces turn; the others never do).
func size_at(rot: int) -> Vector2i:
	if kind == FLOOR and rot % 2 != 0:
		return Vector2i(d, w)
	return Vector2i(w, d)
