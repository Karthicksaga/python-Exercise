class_name HomeListing
extends RefCounted
## One home for sale in the world: a real OSM building (`osm`, its way id) in a named area, with
## the kind of home it becomes (`type_id`). Which buildings, per area, is the data file
## `data/homes/listings.json`.

var id: String = ""
var osm: int = 0
## The building's centre in world metres (a hint to find its chunk quickly).
var at: Vector2 = Vector2.ZERO
var area_id: String = ""
var area_en: String = ""
var area_ta: String = ""
var type_id: String = ""
