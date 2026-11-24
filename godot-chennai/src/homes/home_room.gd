class_name HomeRoom
extends RefCounted
## The shape of a home's room on the 1 m grid: the type's size plus 3 cells of width per extension.
## Origin (0, 0) is the back-left corner seen from the interior camera, +x runs right along the
## back wall, +z towards the camera. Walls: "b" the back wall (z = 0, slots along x), "l" the left
## wall (x = 0, slots along z). The door is in the right wall (x = width), near the front.
## Floor pieces never cover the two doorway cells, so the way in stays open. Pure.

const HEIGHT := 3.0
## The doorway's centre, metres in from the front wall, and its width.
const DOOR_FROM_FRONT := 1.3
const DOOR_WIDTH := 1.2

var width: int = 6
var depth: int = 5


static func make(type: HomeType, extensions: int) -> HomeRoom:
	var r := HomeRoom.new()
	r.width = type.width + clampi(extensions, 0, 8) * HomeCatalog.EXTENSION_WIDTH
	r.depth = type.depth
	return r


## The two floor cells just inside the door.
func door_cells() -> Array[Vector2i]:
	return [Vector2i(width - 1, depth - 2), Vector2i(width - 1, depth - 1)]


## The door's centre on the floor plane (x, z in metres).
func door_point() -> Vector2:
	return Vector2(float(width), float(depth) - DOOR_FROM_FRONT)


func in_bounds(cell: Vector2i) -> bool:
	return cell.x >= 0 and cell.y >= 0 and cell.x < width and cell.y < depth


func clamp_cell(cell: Vector2i) -> Vector2i:
	return Vector2i(clampi(cell.x, 0, width - 1), clampi(cell.y, 0, depth - 1))


## The cell under a floor point (metres), clamped into the room.
func cell_at(point: Vector2) -> Vector2i:
	return clamp_cell(Vector2i(floori(point.x), floori(point.y)))


## Number of slots along a wall.
func wall_length(wall: String) -> int:
	return width if wall == "b" else depth


func centre() -> Vector2:
	return Vector2(float(width) * 0.5, float(depth) * 0.5)
