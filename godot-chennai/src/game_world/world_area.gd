class_name WorldArea
extends RefCounted
## A park, water or beach outline (`Area` in `types.ts`), from the index or cut to a chunk.

var id: int = 0
## &"park", &"water" or &"beach".
var kind: StringName = &"park"
## Only set for areas from the index; chunk files carry no names.
var name: String = ""
var outline: PackedVector2Array = PackedVector2Array()
