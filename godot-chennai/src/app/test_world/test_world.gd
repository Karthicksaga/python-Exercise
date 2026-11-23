class_name TestWorld
extends Node3D
## The empty test ground the game boots into in phase 0: a ground plane with a collider, golden
## hour sun and haze, a camera, and two objects for scale (a 1 m box, a 1.75 m capsule). Later
## phases replace it with the streamed city; it holds no gameplay.

## Where the camera looks, in world metres (x, z). World (0, 0) is the map's geographic origin.
@export var focus: Vector2 = Vector2.ZERO

@onready var camera: Camera3D = $Camera


func _ready() -> void:
	add_to_group(WorldOrigin.GROUP)
	position = WorldOrigin.to_scene(Vector2.ZERO)
	var target := WorldOrigin.to_scene(focus, 0.9)
	camera.look_at_from_position(target + Vector3(-6.0, 3.2, 9.0), target)


## True once the ground's collider is in the physics world (Jolt): a ray from above hits it.
func ground_ready() -> bool:
	var space := get_world_3d().direct_space_state
	var query := PhysicsRayQueryParameters3D.create(Vector3(0, 50, 0), Vector3(0, -50, 0))
	return not space.intersect_ray(query).is_empty()
