class_name SignCategories
extends RefCounted
## The sign category table (`assets/city/sign_categories.json`, G-192): one data file shared by
## the world build (`tools/geo/chennai_geo/detail.py` maps OSM tags to a category id) and the
## game (the sign atlas is baked from it, `tools/bake_city_textures.gd`). A sign shows the
## category word in Tamil (top) and English (below) and **never** a business name or brand
## (TD-18): the only text a sign can carry is in this table.

const PATH := "res://assets/city/sign_categories.json"
## Everyday street-shop categories the renderer picks from, by a stable hash, for a shop front
## whose building and surroundings map no shop (estimated).
const STREET: PackedStringArray = [
	"grocery", "grocery", "tea", "textiles", "pharmacy", "bakery", "flowers", "footwear", "mobile", "stationery", "hardware",
	"salon", "electronics", "restaurant", "snacks", "vegetables", "sweets", "supermarket", "jewellery", "coffee",
]
## Categories that are shops or services a shop front can plausibly hold (a temple or a school
## does not get shutters and a signboard on its street wall).
const PUBLIC_KEYS: PackedStringArray = ["hospital", "bus_stand", "railway", "school", "college", "temple", "church", "mosque", "police", "post", "library"]

## Index = id - 1.
var items: Array[Dictionary] = []
var by_key: Dictionary[String, int] = {}
var error: String = ""

static var _shared: SignCategories = null


static func shared() -> SignCategories:
	if _shared == null:
		_shared = load_file()
	return _shared


static func load_file(path: String = PATH) -> SignCategories:
	var out := SignCategories.new()
	var json := JSON.new()
	if not FileAccess.file_exists(path) or json.parse(FileAccess.get_file_as_string(path)) != OK or typeof(json.data) != TYPE_DICTIONARY:
		out.error = "%s could not be read." % path
		return out
	for c: Dictionary in (json.data as Dictionary).get("categories", []):
		out.items.append(c)
		out.by_key[str(c["key"])] = int(c["id"])
	return out


func count() -> int:
	return items.size()


func get_item(id: int) -> Dictionary:
	return items[id - 1] if id >= 1 and id <= items.size() else {}


func id_of(key: String) -> int:
	return by_key.get(key, 0)


func is_public(id: int) -> bool:
	return bool(get_item(id).get("public", false))


## Category ids of the everyday street shops (with repeats for the common ones).
func street_ids() -> Array[int]:
	var out: Array[int] = []
	for k in STREET:
		var id := id_of(k)
		if id > 0:
			out.append(id)
	return out


## Every English and Tamil word a sign can show.
func words() -> PackedStringArray:
	var out := PackedStringArray()
	for c in items:
		out.append(str(c["english"]))
		out.append(str(c["tamil"]))
	return out
