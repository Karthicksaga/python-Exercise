class_name CastPicker
extends RefCounted
## Who walks, drives and stands in the crowds, from the people manifest (`assets/people/
## people.json`, the Cast agent's 70 people): the Three.js `humans.look(role, id)` by data.
##
## - Walkers (agents that can be hit by a vehicle or in a fight): role `pedestrian`, never a
##   child (`child` or age `child`) and never a teenager (G-18: teens stay out of anything that
##   can hurt them too). Consecutive ids get different people.
## - Drivers by vehicle kind: autos `auto-driver`, cars `cab-driver`, buses `bus-driver`,
##   motorbikes delivery riders and young adult commuters; never a minor. A kind with nobody
##   in its role falls back to an adult man (the Three.js stand-in rule).
## - Crowds: adults with any street role. Children and teens only for crowd spots marked as a
##   child (`CrowdField`: beside an adult at a station or on the sand, away from any road), and
##   the cricket boy (role `play`) only for spots marked as at play (on the sand). G-125.

const DRIVER_ROLES := {
	&"auto": ["auto-driver"],
	&"car": ["cab-driver"],
	&"bus": ["bus-driver"],
	&"bike": ["delivery", "college", "office"],
}
const CROWD_ROLES: Array[String] = ["pedestrian", "vendor", "shopkeeper", "passenger", "tea-worker", "temple", "traditional", "tourist", "sport"]

var entries: Array[Dictionary] = []
var walkers: PackedStringArray = PackedStringArray()
var crowd: PackedStringArray = PackedStringArray()
var children: PackedStringArray = PackedStringArray()
var players: PackedStringArray = PackedStringArray()
var _drivers: Dictionary[StringName, PackedStringArray] = {}


static func is_minor(e: Dictionary) -> bool:
	var age := str(e.get("age", ""))
	return bool(e.get("child", false)) or age == "child" or age == "teen"


static func is_child(e: Dictionary) -> bool:
	return bool(e.get("child", false)) or str(e.get("age", "")) == "child"


static func has_role(e: Dictionary, role: String) -> bool:
	var roles: Array = e.get("roles", [])
	return roles.has(role)


static func create(people: Array[Dictionary]) -> CastPicker:
	var c := CastPicker.new()
	c.entries = people
	for e in people:
		var id := str(e["id"])
		if is_minor(e):
			if is_child(e) and has_role(e, "play"):
				c.players.append(id)
			else:
				c.children.append(id)
			continue
		if has_role(e, "pedestrian"):
			c.walkers.append(id)
		for r in CROWD_ROLES:
			if has_role(e, r):
				c.crowd.append(id)
				break
	for kind: StringName in DRIVER_ROLES:
		var list := PackedStringArray()
		for e in people:
			if is_minor(e):
				continue
			for r: String in DRIVER_ROLES[kind]:
				if has_role(e, r):
					list.append(str(e["id"]))
					break
		if list.is_empty():
			for e in people:
				if not is_minor(e) and str(e.get("sex", "")) == "male":
					list.append(str(e["id"]))
		c._drivers[kind] = list
	c.walkers = _mixed(c.walkers, people)
	return c


## Spread men and women, young and old through the list, so consecutive ids differ.
static func _mixed(ids: PackedStringArray, people: Array[Dictionary]) -> PackedStringArray:
	var men := PackedStringArray()
	var women := PackedStringArray()
	for id in ids:
		for e in people:
			if str(e["id"]) == id:
				if str(e.get("sex", "")) == "female":
					women.append(id)
				else:
					men.append(id)
	var out := PackedStringArray()
	var i := 0
	while out.size() < ids.size():
		if i < men.size():
			out.append(men[i])
		if i < women.size():
			out.append(women[i])
		i += 1
	return out


func entry(id: String) -> Dictionary:
	for e in entries:
		if str(e["id"]) == id:
			return e
	return {}


## The person walking as pedestrian agent `id` ("" when the manifest has no walkers).
func walker(id: int) -> String:
	return walkers[posmod(id, walkers.size())] if not walkers.is_empty() else ""


## Who drives a traffic vehicle of a kind (agent `id`).
func driver(kind: StringName, id: int) -> String:
	var list: PackedStringArray = _drivers.get(kind, _drivers.get(&"car", PackedStringArray()))
	return list[posmod(id, list.size())] if not list.is_empty() else ""


## A crowd look (`look` is the spot's stable number): an adult or teen, a child for a child
## spot, the cricket boy for a spot at play.
func crowd_person(look: int, child: bool, play: bool) -> String:
	if play and not players.is_empty():
		return players[posmod(look, players.size())]
	if child:
		return children[posmod(look, children.size())] if not children.is_empty() else ""
	return crowd[posmod(look, crowd.size())] if not crowd.is_empty() else ""


## Keep only the first `walker_n` walkers, the crowd people among them plus `crowd_n` others, `child_n` children and three drivers of each kind: the variety the game
## keeps loaded (`CityLife`).
func limit(walker_n: int, crowd_n: int, child_n: int) -> void:
	walkers = walkers.slice(0, walker_n)
	# Walkers who also stand in crowds cost nothing more; then up to `crowd_n` others.
	var kept := PackedStringArray()
	var others := 0
	for id in crowd:
		if walkers.has(id):
			kept.append(id)
		elif others < crowd_n:
			kept.append(id)
			others += 1
	crowd = kept
	children = children.slice(0, child_n)
	for kind: StringName in _drivers:
		_drivers[kind] = _drivers[kind].slice(0, 3)


## Every person any pick can return (the models to load).
func used_ids() -> PackedStringArray:
	var out := PackedStringArray()
	for list: PackedStringArray in [walkers, crowd, children, players]:
		for id in list:
			if not out.has(id):
				out.append(id)
	for kind: StringName in _drivers:
		for id in _drivers[kind]:
			if not out.has(id):
				out.append(id)
	return out
