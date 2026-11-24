class_name HomeType
extends RefCounted
## One kind of home (from `data/homes/homes.json`): its names, the room's size in 1 m cells, the
## wall colour it starts with and the feature lines of its sale sign.

var id: String = ""
var en: String = ""
var ta: String = ""
var width: int = 6
var depth: int = 5
var wall: String = "#e9dcc4"
## [{en, ta}]
var features: Array[Dictionary] = []
