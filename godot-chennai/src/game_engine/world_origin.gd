extends Node
## Autoload `WorldOrigin`: the floating origin (decision G-7).
##
## World data stays in world metres from the fixed geographic origin (`WorldSource`); the scene
## is placed relative to `origin`, a world point that can move. Far from the scene's zero,
## single-precision floats in physics, the camera and the GPU lose precision (about 1 cm at
## 100 km), so when the player wanders more than `recentre_distance` from it, the game calls
## `recentre()`: every node in the group `WorldOrigin.GROUP` shifts by the same amount and
## `shifted` tells systems that keep scene positions of their own.
##
## Conversions use the engine's 64-bit floats on scalars, so world positions of a city 100 km
## across convert without loss.

## Nodes (Node3D) in this group are moved when the origin moves: put top-level world content here.
const GROUP := &"origin_shifted"

## Emitted after a recentre with the scene-space offset every position moved by.
signal shifted(offset: Vector3)

## Recentre when the focus is further than this from the scene's zero, metres.
@export var recentre_distance: float = 2000.0

## The world point (x, z) at the scene's zero, as two 64-bit floats.
var origin_x: float = 0.0
var origin_z: float = 0.0


## World (x, z) and a height to a scene position.
func to_scene(world: Vector2, height: float = 0.0) -> Vector3:
	return Vector3(world.x - origin_x, height, world.y - origin_z)


## World (x, z) given as 64-bit scalars, for positions held as doubles.
func to_scene_xz(world_x: float, world_z: float, height: float = 0.0) -> Vector3:
	return Vector3(world_x - origin_x, height, world_z - origin_z)


## A scene position back to world (x, z).
func to_world(scene: Vector3) -> Vector2:
	return Vector2(scene.x + origin_x, scene.z + origin_z)


## Moves the origin to a world point; shifts every node in GROUP and emits `shifted`.
func recentre(world_x: float, world_z: float) -> void:
	var offset := Vector3(origin_x - world_x, 0.0, origin_z - world_z)
	origin_x = world_x
	origin_z = world_z
	if offset == Vector3.ZERO:
		return
	for node in get_tree().get_nodes_in_group(GROUP):
		var n3 := node as Node3D
		if n3 != null:
			n3.global_position += offset
			n3.reset_physics_interpolation()
	shifted.emit(offset)


## Recentres on the focus (a scene position, e.g. the player) when it has wandered too far.
## Returns true when it did.
func follow(focus: Vector3) -> bool:
	if Vector2(focus.x, focus.z).length() <= recentre_distance:
		return false
	recentre(origin_x + focus.x, origin_z + focus.z)
	return true
