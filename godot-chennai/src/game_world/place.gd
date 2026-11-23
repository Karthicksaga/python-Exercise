class_name Place
extends RefCounted
## A named point from the index: a district (OSM `place`), a bus stop or a point of interest.

## (x, z) in metres.
var position: Vector2 = Vector2.ZERO
## "" when unnamed.
var name: String = ""
## District: suburb, neighbourhood, quarter, locality. POI: the OSM amenity or shop value. Bus stop: &"bus_stop".
var kind: StringName = &""
