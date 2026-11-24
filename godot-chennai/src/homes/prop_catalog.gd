class_name PropCatalog
extends RefCounted
## The furniture and decoration of the reviewed prototype: 47 generic Chennai-home props in seven
## categories, each with its English and Tamil name (G-230). Data in `data/homes/props.json`.
## No brands and no deity images: the pooja shelf is a shelf with a brass lamp, nothing more.

const PATH := "res://data/homes/props.json"

## [{id, en, ta}] in tab order.
var categories: Array[Dictionary] = []
var props: Array[PropDef] = []
var error: String = ""
var _by_id: Dictionary[String, PropDef] = {}


static func load_file(path: String = PATH) -> PropCatalog:
	var c := PropCatalog.new()
	var d := HomeJson.read(path)
	if d.is_empty():
		c.error = "cannot read %s" % path
		return c
	for cat: Variant in HomeJson.array_of(d, "categories"):
		if cat is Dictionary:
			c.categories.append(cat)
	for p: Variant in HomeJson.array_of(d, "props"):
		if not (p is Dictionary):
			continue
		var pd: Dictionary = p
		var def := PropDef.new()
		def.id = HomeJson.text_of(pd, "id")
		def.category = HomeJson.text_of(pd, "category")
		def.en = HomeJson.text_of(pd, "en")
		def.ta = HomeJson.text_of(pd, "ta")
		def.w = clampi(HomeJson.int_of(pd, "w", 1), 1, 4)
		def.d = clampi(HomeJson.int_of(pd, "d", 1), 1, 4)
		def.walkable = HomeJson.int_of(pd, "walk", 0) != 0
		match HomeJson.text_of(pd, "kind", "floor"):
			"wall":
				def.kind = PropDef.WALL
			"ceiling":
				def.kind = PropDef.CEILING
			_:
				def.kind = PropDef.FLOOR
		for part: Variant in HomeJson.array_of(pd, "parts"):
			if part is Dictionary:
				def.parts.append(part)
		if def.id != "" and not c._by_id.has(def.id):
			c.props.append(def)
			c._by_id[def.id] = def
	return c


func get_prop(id: String) -> PropDef:
	return _by_id.get(id)


func has_prop(id: String) -> bool:
	return _by_id.has(id)


func in_category(category_id: String) -> Array[PropDef]:
	var out: Array[PropDef] = []
	for p in props:
		if p.category == category_id:
			out.append(p)
	return out
