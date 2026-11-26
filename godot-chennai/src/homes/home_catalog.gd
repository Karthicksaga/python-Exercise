class_name HomeCatalog
extends RefCounted
## The four home types of the reviewed prototype (G-230): flat, beach cottage, terrace house and
## the old house with a thinnai. Data in `data/homes/homes.json`; prices in `prices.json`.

const PATH := "res://data/homes/homes.json"
## Each extension adds this many cells of width, up to `HomePrices.max_extensions`.
const EXTENSION_WIDTH := 3

var types: Array[HomeType] = []
## The wall colours the player can choose (#rrggbb).
var wall_colours: Array[String] = []
var error: String = ""


static func load_file(path: String = PATH) -> HomeCatalog:
	var c := HomeCatalog.new()
	var d := HomeJson.read(path)
	if d.is_empty():
		c.error = "cannot read %s" % path
		return c
	for w: Variant in HomeJson.array_of(d, "wall_colours"):
		c.wall_colours.append(str(w))
	for t: Variant in HomeJson.array_of(d, "types"):
		if not (t is Dictionary):
			continue
		var td: Dictionary = t
		var h := HomeType.new()
		h.id = HomeJson.text_of(td, "id")
		h.en = HomeJson.text_of(td, "en")
		h.ta = HomeJson.text_of(td, "ta")
		h.width = clampi(HomeJson.int_of(td, "width", 6), 3, 16)
		h.depth = clampi(HomeJson.int_of(td, "depth", 5), 3, 16)
		h.wall = HomeJson.text_of(td, "wall", "#e9dcc4")
		for f: Variant in HomeJson.array_of(td, "features"):
			if f is Dictionary:
				h.features.append(f)
		if h.id != "":
			c.types.append(h)
	return c


func type_of(id: String) -> HomeType:
	for t in types:
		if t.id == id:
			return t
	return null
