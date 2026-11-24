class_name HomeListings
extends RefCounted
## The homes for sale, two to three real OSM buildings in each of Anna Nagar, Besant Nagar,
## Velachery and Mylapore (G-233), from `data/homes/listings.json`. When the areas data
## (`data/areas`, agent/godot-areas) is merged this file can be regenerated from it.

const PATH := "res://data/homes/listings.json"

var listings: Array[HomeListing] = []
var error: String = ""
var _by_id: Dictionary[String, HomeListing] = {}


static func load_file(path: String = PATH) -> HomeListings:
	var l := HomeListings.new()
	var d := HomeJson.read(path)
	if d.is_empty():
		l.error = "cannot read %s" % path
		return l
	for a: Variant in HomeJson.array_of(d, "areas"):
		if not (a is Dictionary):
			continue
		var ad: Dictionary = a
		for b: Variant in HomeJson.array_of(ad, "buildings"):
			if not (b is Dictionary):
				continue
			var bd: Dictionary = b
			var at := HomeJson.array_of(bd, "at")
			var item := HomeListing.new()
			item.id = HomeJson.text_of(bd, "id")
			item.osm = HomeJson.int_of(bd, "osm")
			item.at = Vector2(float(at[0]), float(at[1])) if at.size() >= 2 else Vector2.ZERO
			item.area_id = HomeJson.text_of(ad, "id")
			item.area_en = HomeJson.text_of(ad, "en")
			item.area_ta = HomeJson.text_of(ad, "ta")
			item.type_id = HomeJson.text_of(ad, "type")
			if item.id != "" and item.osm != 0 and not l._by_id.has(item.id):
				l.listings.append(item)
				l._by_id[item.id] = item
	return l


func get_listing(id: String) -> HomeListing:
	return _by_id.get(id)
