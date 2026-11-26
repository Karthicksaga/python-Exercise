class_name HeritageJournal
extends RefCounted
## The heritage journal's state (G-482): which stops the player has visited, in order, how often,
## and whether the longer visit (the temple's lamp and walk round) was done. Saved in the save
## file in its own section `chennai-heritage-v1` (`SaveStore.HERITAGE`); a save without it is an
## empty journal. Pure logic; the screen is `HeritageJournalScreen`.

signal visited(id: String)
signal completed(id: String)

var _order: Array[String] = []
var _count: Dictionary[String, int] = {}
var _done: Dictionary[String, bool] = {}


func _init(saved: Variant = null) -> void:
	if saved is Dictionary:
		var d: Dictionary = saved
		for id: Variant in d.get("order", []):
			var key := str(id)
			if not _order.has(key):
				_order.append(key)
		var counts: Variant = d.get("count", {})
		if counts is Dictionary:
			for id: Variant in counts:
				_count[str(id)] = maxi(1, int(counts[id]))
		for id: Variant in d.get("done", []):
			_done[str(id)] = true
		for id in _order:
			if not _count.has(id):
				_count[id] = 1


## The player is at a stop. True the first time.
func visit(id: String) -> bool:
	_count[id] = int(_count.get(id, 0)) + 1
	if _order.has(id):
		return false
	_order.append(id)
	visited.emit(id)
	return true


## The stop's longer visit was done. True the first time.
func complete(id: String) -> bool:
	if not _order.has(id):
		visit(id)
	if _done.has(id):
		return false
	_done[id] = true
	completed.emit(id)
	return true


func has_visited(id: String) -> bool:
	return _order.has(id)


func is_done(id: String) -> bool:
	return _done.has(id)


func count() -> int:
	return _order.size()


## Ids in the order first visited.
func order() -> Array[String]:
	return _order


func visits(id: String) -> int:
	return int(_count.get(id, 0))


func clear() -> void:
	_order.clear()
	_count.clear()
	_done.clear()


func to_save() -> Dictionary:
	var done: Array[String] = []
	for id in _done:
		done.append(id)
	done.sort()
	return {"order": _order.duplicate(), "count": _count.duplicate(), "done": done}


## Reads the journal from the save file (an empty one when the section is missing).
static func load_from(store: SaveStore) -> HeritageJournal:
	return HeritageJournal.new(store.section(SaveStore.HERITAGE))


## Writes the section: the file is read again first, so nothing else in it is lost.
func save(path: String = SaveStore.DEFAULT_PATH) -> Error:
	var store := SaveStore.new(path).read()
	store.set_section(SaveStore.HERITAGE, to_save())
	return store.write()
