## The two or three questions the combat rules ask about the world (port of `CombatWorld` in
## `combat/src/Combat.ts`), as Callables so the game can answer them with Jolt raycasts and the
## tests with simple shapes:
##   line_of_sight(ax, az, bx, bz) -> bool  nothing solid between two points at chest height
##   wall_distance(x, z, dx, dz, max) -> float or null  first wall in a direction
##   solid_distance(x, z, dx, dz, max) -> float or null  nearest building, tree or vehicle from a
##     person's own centre (passing through people), for walking
## The defaults are an open field.
class_name CombatWorld
extends RefCounted

var los: Callable = func(_ax: float, _az: float, _bx: float, _bz: float) -> bool: return true
var wall: Callable = func(_x: float, _z: float, _dx: float, _dz: float, _max: float) -> Variant: return null
var solid: Callable = func(_x: float, _z: float, _dx: float, _dz: float, _max: float) -> Variant: return null


static func make(line_of_sight_fn: Callable = Callable(), wall_fn: Callable = Callable(), solid_fn: Callable = Callable()) -> CombatWorld:
	var w := CombatWorld.new()
	if line_of_sight_fn.is_valid():
		w.los = line_of_sight_fn
	if wall_fn.is_valid():
		w.wall = wall_fn
	if solid_fn.is_valid():
		w.solid = solid_fn
	return w


func line_of_sight(ax: float, az: float, bx: float, bz: float) -> bool:
	return los.call(ax, az, bx, bz)


func wall_distance(x: float, z: float, dx: float, dz: float, max_distance: float) -> Variant:
	return wall.call(x, z, dx, dz, max_distance)


func solid_distance(x: float, z: float, dx: float, dz: float, max_distance: float) -> Variant:
	return solid.call(x, z, dx, dz, max_distance)
