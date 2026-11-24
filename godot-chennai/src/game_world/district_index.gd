## Which named area of the city a point is in (port of `game-world/src/districts.ts`): the
## nearest district point within `reach` metres. Districts are Dictionaries {name, kind, x, z}
## as the world data has them.
class_name DistrictIndex
extends RefCounted

const DISTRICT_REACH := 1500.0
const CELL := 1000.0

var districts: Array
var _reach: float
var _cells: Dictionary = {}


func _init(list: Array, reach: float = DISTRICT_REACH) -> void:
	districts = list
	_reach = reach
	for d: Dictionary in list:
		var key := "%d,%d" % [floori(float(d["x"]) / CELL), floori(float(d["z"]) / CELL)]
		if not _cells.has(key):
			_cells[key] = []
		(_cells[key] as Array).append(d)


## The district a point is in, or an empty Dictionary.
func at(x: float, z: float) -> Dictionary:
	var best: Dictionary = {}
	var best_d2 := _reach * _reach
	var span := ceili(_reach / CELL)
	var cx := floori(x / CELL)
	var cz := floori(z / CELL)
	for i in range(-span, span + 1):
		for k in range(-span, span + 1):
			for d: Dictionary in _cells.get("%d,%d" % [cx + i, cz + k], []):
				var dx: float = float(d["x"]) - x
				var dz: float = float(d["z"]) - z
				var d2 := dx * dx + dz * dz
				if d2 < best_d2:
					best_d2 = d2
					best = d
	return best
