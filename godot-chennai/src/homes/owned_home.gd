class_name OwnedHome
extends RefCounted
## A home the player bought: which listing, its type, the rooms built on (`extensions`), the
## wall colour, whether the kolam is drawn at the door, and every piece placed in it.

var listing_id: String = ""
var type_id: String = ""
var extensions: int = 0
var wall: String = "#e9dcc4"
var kolam: bool = false
var items: Array[PlacedProp] = []


func to_dict() -> Dictionary:
	var list: Array = []
	for it in items:
		list.append(it.to_dict())
	return {"type": type_id, "extensions": extensions, "wall": wall, "kolam": kolam, "items": list}


## Rebuilds a home from its saved dictionary; pieces of unknown props, or that no longer fit,
## are dropped (counted in `dropped`). Null when `v` is not a home or its type is unknown.
static func from_dict(id: String, v: Variant, data: HomeData, dropped: Array[int]) -> OwnedHome:
	if not (v is Dictionary):
		return null
	var d: Dictionary = v
	var type := data.homes.type_of(HomeJson.text_of(d, "type"))
	if type == null:
		return null
	var h := OwnedHome.new()
	h.listing_id = id
	h.type_id = type.id
	h.extensions = clampi(HomeJson.int_of(d, "extensions"), 0, data.prices.max_extensions)
	h.wall = HomeJson.text_of(d, "wall", type.wall)
	if not Color.html_is_valid(h.wall):
		h.wall = type.wall
	h.kolam = d.get("kolam") == true
	var editor := HomeEditor.make(HomeRoom.make(type, h.extensions), data.props, data.prices, h.items)
	for raw: Variant in HomeJson.array_of(d, "items"):
		var it := PlacedProp.from_dict(raw)
		if it == null or not data.props.has_prop(it.k) or editor.fit_problem(it) != &"":
			dropped[0] += 1
			continue
		h.items.append(it)
		editor.rebuild()
	return h
