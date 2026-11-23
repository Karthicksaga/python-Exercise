class_name RoadNetwork
extends RefCounted
## Every road in the city, decoded from `roads.bin`: always in memory (AI, street names, minimap).
##
## `error` is "" when the file decoded; otherwise it says why.

var roads: Array[Road] = []
var format: int = 0
var error: String = ""


func ok() -> bool:
	return error == ""


func size() -> int:
	return roads.size()


## All roads with this exact name, in file order.
func named(road_name: String) -> Array[Road]:
	var out: Array[Road] = []
	for r in roads:
		if r.name == road_name:
			out.append(r)
	return out
