class_name LandmarkSpec
extends RefCounted
## One landmark's spec (`assets/landmarks/<id>/spec.json`, decision G-181): where it stands (from
## OpenStreetMap), what it is, its names, the research behind it and how its model was built.
## Node-free plain data, read on worker threads. `validate()` lists what is missing or wrong.

const DIR := "res://assets/landmarks"
const INDEX := DIR + "/index.json"
const FORMAT := 1
const KINDS: Array[StringName] = [&"temple", &"civic", &"station", &"tower", &"lighthouse", &"church", &"mosque", &"museum", &"mall"]
## Part roles: `model` parts are drawn by the model (their outline is matched within 2 m),
## `area` parts lie under the model, `info` parts only lend names and links.
## `model_rect` parts are drawn on their minimum rectangle (where OSM's outline is not the
## building's own, as at Chennai Central; G-186).
const ROLES: Array[StringName] = [&"model", &"model_rect", &"area", &"info"]
## Words that would mean a brand or business name on a landmark (TD-18).
const BUSINESS_WORDS: PackedStringArray = ["pvt", "ltd", "limited", "inc", "store", "stores", "mall", "hotel", "bank", "café", "cafe", "restaurant", "®", "™", "brand"]

var id: String = ""
var kind: StringName = &""
var name_en: String = ""
var name_ta: String = ""
## World metres (TD-2): the GLB's origin. The model is built in world orientation.
var origin: Vector2 = Vector2.ZERO
var yaw_deg: float = 0.0
## Metres: the value the model is built to, and OSM's `height` tag of the main part if any.
var height: float = 0.0
var osm_height: float = 0.0
var kit: String = ""
var lod0_end: float = 0.0
var lod1_end: float = 0.0
var lod2_end: float = 0.0
var budget: Dictionary = {}
## Part name -> footprint (world metres) and role.
var footprints: Dictionary[String, PackedVector2Array] = {}
## Part name -> corners of its minimum rectangle (world metres).
var rects: Dictionary[String, PackedVector2Array] = {}
var roles: Dictionary[String, StringName] = {}
## The outline a part is drawn on: its rectangle for `model_rect`, else its OSM footprint.
func outline(name: String) -> PackedVector2Array:
	if roles.get(name, &"") == &"model_rect" and rects.has(name):
		return rects[name]
	return footprints.get(name, PackedVector2Array())


## Footprints whose OSM buildings the city leaves out (their centroid inside), and their box.
var exclude: Array[PackedVector2Array] = []
var exclude_box: Rect2 = Rect2()
## [{"ta", "en", "at", "height"}]: real public names only.
var signs: Array[Dictionary] = []
var data: Dictionary = {}


func glb_path() -> String:
	return "%s/%s/%s.glb" % [DIR, id, id]


func build_path() -> String:
	return "%s/%s/build.json" % [DIR, id]


static func from_dict(d: Dictionary) -> LandmarkSpec:
	var s := LandmarkSpec.new()
	s.data = d
	s.id = str(d.get("id", ""))
	s.kind = StringName(str(d.get("kind", "")))
	var names: Dictionary = d.get("names", {})
	s.name_en = str(names.get("en", ""))
	s.name_ta = str(names.get("ta", ""))
	var o: Array = d.get("origin", [0.0, 0.0])
	s.origin = Vector2(float(o[0]), float(o[1]))
	s.yaw_deg = float(d.get("yaw_deg", 0.0))
	var h: Dictionary = d.get("height", {})
	s.height = float(h.get("value", 0.0))
	s.osm_height = float(h["osm_tag"]) if h.get("osm_tag") != null else 0.0
	var recipe: Dictionary = d.get("recipe", {})
	s.kit = str(recipe.get("kit", ""))
	var lod: Dictionary = d.get("lod", {})
	s.lod0_end = float(lod.get("lod0_end", 0.0))
	s.lod1_end = float(lod.get("lod1_end", 0.0))
	s.lod2_end = float(lod.get("lod2_end", 0.0))
	s.budget = d.get("budget", {})
	var osm: Dictionary = d.get("osm", {})
	var parts: Dictionary = osm.get("parts", {})
	for name: String in parts:
		var part: Dictionary = parts[name]
		s.roles[name] = StringName(str(part.get("role", "")))
		if part.has("footprint"):
			var ring := PackedVector2Array()
			for p: Array in part["footprint"]:
				ring.append(Vector2(float(p[0]), float(p[1])))
			s.footprints[name] = ring
		var rect: Dictionary = part.get("rect", {})
		if rect.has("corners"):
			var corners := PackedVector2Array()
			for p: Array in rect["corners"]:
				corners.append(Vector2(float(p[0]), float(p[1])))
			s.rects[name] = corners
	for name: String in osm.get("exclude", []):
		if s.footprints.has(name):
			var ring := s.outline(name)
			s.exclude.append(ring)
			var box := Rect2(ring[0], Vector2.ZERO)
			for p in ring:
				box = box.expand(p)
			s.exclude_box = box if s.exclude.size() == 1 else s.exclude_box.merge(box)
	for sign: Dictionary in d.get("signs", []):
		s.signs.append(sign)
	return s


static func read(path: String) -> LandmarkSpec:
	var text := FileAccess.get_file_as_string(path)
	var parsed: Variant = JSON.parse_string(text)
	if not parsed is Dictionary:
		return null
	return from_dict(parsed as Dictionary)


## Every spec named in `index.json` (a file list, so exported builds need no directory scan).
static func load_all() -> Array[LandmarkSpec]:
	var out: Array[LandmarkSpec] = []
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(INDEX))
	if not parsed is Dictionary:
		return out
	for lid: String in (parsed as Dictionary).get("landmarks", []):
		var s := read("%s/%s/spec.json" % [DIR, lid])
		if s != null:
			out.append(s)
	return out


## True when an OSM building with this centroid is replaced by the landmark's model.
func excludes(point: Vector2) -> bool:
	if exclude.is_empty() or not exclude_box.grow(0.01).has_point(point):
		return false
	for ring in exclude:
		if Geometry2D.is_point_in_polygon(point, ring):
			return true
	return false


static func _is_url(v: Variant) -> bool:
	var t := str(v)
	return t.begins_with("https://") or t.begins_with("http://")


## Problems with the spec; empty when it is complete (decision G-181).
func validate() -> PackedStringArray:
	var e := PackedStringArray()
	var d := data
	if int(d.get("format", 0)) != FORMAT:
		e.append("format must be %d" % FORMAT)
	if id == "" or not id.is_valid_filename():
		e.append("id missing or not a file name")
	if not KINDS.has(kind):
		e.append("kind %s unknown" % kind)
	if name_en.strip_edges() == "" or name_ta.strip_edges() == "":
		e.append("names: English and Tamil both required")
	var names: Dictionary = d.get("names", {})
	if str(names.get("ta_source", "")) == "" or str(names.get("en_source", "")) == "":
		e.append("names: say where each name comes from")
	if not _is_tamil(name_ta):
		e.append("names.ta is not Tamil script")
	var osm: Dictionary = d.get("osm", {})
	var parts: Dictionary = osm.get("parts", {})
	if not parts.has(str(osm.get("main", ""))):
		e.append("osm.main must name a part")
	if str(osm.get("data_date", "")) == "" or not str(osm.get("licence", "")).contains("OpenStreetMap"):
		e.append("osm: data date and ODbL attribution required")
	for name: String in parts:
		var part: Dictionary = parts[name]
		var ref := str(part.get("osm", ""))
		if not (ref.begins_with("way/") or ref.begins_with("node/")):
			e.append("part %s: osm must be way/N or node/N" % name)
		if not ROLES.has(roles.get(name, &"")):
			e.append("part %s: role must be model, model_rect, area or info" % name)
		if ref.begins_with("way/") and not footprints.has(name):
			e.append("part %s: footprint not filled from OSM (run cli landmark-osm)" % name)
		var tags: Dictionary = part.get("tags", {})
		if tags.has("brand") or tags.has("shop"):
			e.append("part %s: a business (brand/shop) cannot be a landmark part" % name)
		if kind == &"mall":
			for k: String in tags:
				if k.begins_with("name") or k.contains("_name") or k.begins_with("wiki") or k == "brand":
					e.append("part %s: a mall's name and links are withheld (TD-18): %s" % [name, k])
	if footprints.is_empty() or exclude.is_empty():
		e.append("osm: at least one footprint and one exclude part")
	var h: Dictionary = d.get("height", {})
	if height <= 0.0 or str(h.get("source", "")) == "" or str(h.get("chosen_because", "")) == "":
		e.append("height: value, source and the reason for the choice required")
	for alt: Dictionary in h.get("alternatives", []):
		if not _is_url(alt.get("source", "")):
			e.append("height alternative without a source URL")
	if osm_height <= 0.0 and h.get("osm_tag") != null:
		e.append("height.osm_tag must be a number or null")
	var facts: Array = d.get("facts", [])
	if facts.is_empty():
		e.append("facts: at least one")
	for f: Dictionary in facts:
		if str(f.get("en", "")) == "" or not _is_url(f.get("source", "")):
			e.append("fact without text or source URL: %s" % str(f.get("en", "")).left(40))
	var refs: Array = d.get("references", [])
	if refs.is_empty() and str(d.get("references_withheld", "")) == "":
		e.append("references: at least one reference photo (or say why none is listed)")
	for r: Dictionary in refs:
		for k: String in ["title", "author", "licence", "url", "use"]:
			if str(r.get(k, "")) == "":
				e.append("reference %s: %s missing" % [str(r.get("title", "?")), k])
		if not str(r.get("url", "")).begins_with("https://commons.wikimedia.org/wiki/File:"):
			e.append("reference %s: must be a Wikimedia Commons file page" % str(r.get("title", "?")))
	for k: String in ["style", "colours", "materials", "recipe", "budget", "lod", "collision", "estimated"]:
		if not d.has(k):
			e.append("%s missing" % k)
	if kit == "":
		e.append("recipe.kit missing")
	if not (lod0_end > 0.0 and lod0_end < lod1_end and lod1_end < lod2_end):
		e.append("lod: lod0_end < lod1_end < lod2_end required")
	if int(budget.get("lod0_min", 0)) < 5000 or int(budget.get("lod0_max", 0)) > 15000:
		e.append("budget: LOD0 within 5k..15k triangles")
	for sign: Dictionary in signs:
		if str(sign.get("ta", "")) != name_ta and str(sign.get("en", "")).to_lower() != name_en.to_lower():
			e.append("sign text must be the landmark's real public name")
	for word in _words():
		if BUSINESS_WORDS.has(word):
			e.append("business or brand word on the landmark: %s" % word)
	return e


func _words() -> PackedStringArray:
	var out := PackedStringArray()
	var texts: Array[String] = [name_en, name_ta]
	for sign: Dictionary in signs:
		texts.append(str(sign.get("ta", "")))
		texts.append(str(sign.get("en", "")))
	for t in texts:
		for w in t.to_lower().replace(",", " ").replace(".", " ").split(" ", false):
			out.append(w)
	return out


static func _is_tamil(text: String) -> bool:
	var tamil := 0
	for i in text.length():
		var c := text.unicode_at(i)
		if c >= 0x0B80 and c <= 0x0BFF:
			tamil += 1
	return tamil >= 2
