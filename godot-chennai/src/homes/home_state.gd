class_name HomeState
extends RefCounted
## The player's homes and what is in them (G-233): the owned homes, the one last entered, each
## home's extensions, wall colour, kolam and furniture layout. It lives in its own versioned
## section of the save file (`SAVE_KEY`, `VERSION`), beside the missions' keys. Wallet effects are
## returned as `HomeResult.delta`; the caller charges or pays the missions' money. Pure logic.
##
## Save compatibility: a save without the section is a new game with no homes; a section from a
## newer game (`version` above VERSION) is read-only and written back untouched; homes of a type
## this game does not know are kept as they were; pieces of unknown props are dropped on load.

const SAVE_KEY := "chennai-homes-v1"
const VERSION := 1

var owned: Dictionary[String, OwnedHome] = {}
## The listing id of the home last entered or bought ("" for none): the one SLEEP saves in.
var current: String = ""
## Pieces dropped when loading (unknown props, or ones that no longer fit).
var dropped: int = 0
## The saved section came from a newer game: kept as it was, never rewritten.
var too_new: bool = false
var _raw: Dictionary = {}
## Saved homes of types this game does not know, written back as they were.
var _kept: Dictionary = {}


func owns(listing_id: String) -> bool:
	return owned.has(listing_id)


func get_home(listing_id: String) -> OwnedHome:
	return owned.get(listing_id)


## Buys a listed home at its type's price. The new home is empty and becomes the current one.
func buy(listing: HomeListing, balance: int, data: HomeData) -> HomeResult:
	if owns(listing.id):
		return HomeResult.refused(&"owned", "You already own this home.", "இந்த வீடு ஏற்கனவே உங்களுடையது.")
	var type := data.homes.type_of(listing.type_id)
	if type == null:
		return HomeResult.refused(&"unknown", "This home is not for sale.", "இந்த வீடு விற்பனைக்கு இல்லை.")
	var price := data.prices.home(type.id)
	if balance < price:
		return HomeResult.refused(&"poor", "You need ₹%d." % price, "₹%d தேவை." % price)
	var h := OwnedHome.new()
	h.listing_id = listing.id
	h.type_id = type.id
	h.wall = type.wall
	owned[listing.id] = h
	current = listing.id
	return HomeResult.done(-price)


func room_of(listing_id: String, data: HomeData) -> HomeRoom:
	var h := get_home(listing_id)
	if h == null:
		return null
	return HomeRoom.make(data.homes.type_of(h.type_id), h.extensions)


## A furnishing editor over the home's own list (its changes are the save state's changes).
func editor(listing_id: String, data: HomeData) -> HomeEditor:
	var h := get_home(listing_id)
	if h == null:
		return null
	return HomeEditor.make(room_of(listing_id, data), data.props, data.prices, h.items)


## What the next extension costs, or -1 when the home cannot grow any more.
func extension_cost(listing_id: String, data: HomeData) -> int:
	var h := get_home(listing_id)
	if h == null or h.extensions >= data.prices.max_extensions:
		return -1
	return data.prices.extension(h.extensions)


## Builds the next room (3 cells of width, 20,000 x n at the prototype scale, up to two).
func extend(listing_id: String, balance: int, data: HomeData) -> HomeResult:
	var h := get_home(listing_id)
	if h == null:
		return HomeResult.refused(&"nothing", "This is not your home.", "இது உங்கள் வீடு அல்ல.")
	var cost := extension_cost(listing_id, data)
	if cost < 0:
		return HomeResult.refused(&"limit", "This home cannot grow any more.", "இந்த வீட்டை மேலும் பெரிதாக்க முடியாது.")
	if balance < cost:
		return HomeResult.refused(&"poor", "A new room costs ₹%d. You have ₹%d." % [cost, balance], "புதிய அறைக்கு ₹%d. உங்களிடம் ₹%d." % [cost, balance])
	h.extensions += 1
	return HomeResult.done(-cost)


func set_wall(listing_id: String, colour: String) -> bool:
	var h := get_home(listing_id)
	if h == null or not Color.html_is_valid(colour):
		return false
	h.wall = colour
	return true


func set_kolam(listing_id: String, on: bool) -> void:
	var h := get_home(listing_id)
	if h != null:
		h.kolam = on


## Forget everything (NEW GAME).
func reset() -> void:
	owned.clear()
	current = ""
	dropped = 0
	_kept.clear()
	_raw = {}
	too_new = false


## The section to store in the save file.
func to_save() -> Dictionary:
	if too_new:
		return _raw
	var homes: Dictionary = _kept.duplicate(true)
	for id in owned:
		homes[id] = owned[id].to_dict()
	return {"version": VERSION, "current": current, "owned": homes}


## Reads the saved section (`v` is whatever the file held there): empty or damaged is a new game.
static func from_save(v: Variant, data: HomeData) -> HomeState:
	var s := HomeState.new()
	if not (v is Dictionary):
		return s
	var d: Dictionary = v
	var version := HomeJson.int_of(d, "version", 1)
	if version > VERSION:
		s.too_new = true
		s._raw = d
		return s
	var count: Array[int] = [0]
	var saved := HomeJson.dict_of(d, "owned")
	for id: Variant in saved:
		var h := OwnedHome.from_dict(str(id), saved[id], data, count)
		if h != null:
			s.owned[str(id)] = h
		elif saved[id] is Dictionary:
			s._kept[str(id)] = saved[id]
	s.dropped = count[0]
	var cur := HomeJson.text_of(d, "current")
	s.current = cur if s.owned.has(cur) else ""
	return s
