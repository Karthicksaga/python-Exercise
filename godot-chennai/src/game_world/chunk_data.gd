class_name ChunkData
extends RefCounted
## One 250 m square of the streaming grid, decoded from `c/<col>_<row>.bin` (`ChunkData` in `types.ts`).
##
## Plain data, built on any thread. `error` is "" when the file decoded; otherwise it says why
## (wrong magic, unsupported format version, truncated) and the lists may be partial.

var key: String = ""
var col: int = 0
var row: int = 0
## Centre of the square in world metres: the origin of the file's quantised points, and a good
## local origin for the chunk's meshes (TD-2: each chunk carries its own offset).
var centre: Vector2 = Vector2.ZERO
## Format version of the file it came from.
var format: int = 0
var buildings: Array[Building] = []
var trees: Array[WorldTree] = []
## Parks, water and beaches cut to this square.
var areas: Array[WorldArea] = []
var error: String = ""


func ok() -> bool:
	return error == ""
