class_name HomeEditor
extends RefCounted
## The furnishing rules of one home (G-232), ported from the reviewed prototype: grid placement
## with overlap and bounds, rotation, removal with a half refund, and the cells a person can walk.
## It edits the `items` array it is given (the owned home's own list), so every change is already
## in the save state; it never touches the wallet: each action returns a `HomeResult` whose
## `delta` the caller applies (cost negative, refund positive). Pure logic, no nodes.
##
## Floor pieces take their footprint's cells (turning swaps width and depth); a ceiling piece one
## cell (hangs above it); a wall piece `w` slots of the wall nearest the tapped cell, centred on
## it. A floor piece never covers the doorway cells.

var room: HomeRoom
var props: PropCatalog
var prices: HomePrices
var items: Array[PlacedProp]
var _occ: Dictionary[String, PlacedProp] = {}


static func make(room_: HomeRoom, props_: PropCatalog, prices_: HomePrices, items_: Array[PlacedProp]) -> HomeEditor:
	var e := HomeEditor.new()
	e.room = room_
	e.props = props_
	e.prices = prices_
	e.items = items_
	e.rebuild()
	return e


## Recomputes which cells are taken (after the room or the list changed behind the editor's back).
func rebuild() -> void:
	_occ.clear()
	for it in items:
		for key in keys_of(it):
			_occ[key] = it


## The occupancy keys of a piece: "f x,z" floor cells, "c x,z" ceiling cell, "wb i" / "wl i" slots.
func keys_of(it: PlacedProp) -> PackedStringArray:
	var out := PackedStringArray()
	var def := props.get_prop(it.k)
	if def == null:
		return out
	match def.kind:
		PropDef.CEILING:
			out.append("c %d,%d" % [it.x, it.z])
		PropDef.WALL:
			var first := it.x if it.wall == "b" else it.z
			for i in def.w:
				out.append("w%s %d" % [it.wall, first + i])
		_:
			var size := def.size_at(it.r)
			for i in size.x:
				for j in size.y:
					out.append("f %d,%d" % [it.x + i, it.z + j])
	return out


## The piece a tap on `cell` would place for `prop_id`, by the prototype's rules; null when the
## prop is unknown.
func make_item(prop_id: String, cell: Vector2i) -> PlacedProp:
	var def := props.get_prop(prop_id)
	if def == null:
		return null
	var c := room.clamp_cell(cell)
	match def.kind:
		PropDef.CEILING:
			return PlacedProp.make(prop_id, c.x, c.y)
		PropDef.WALL:
			# The nearer of the two visible walls: the back wall unless the cell is nearer the left.
			var wall := "b" if c.y <= c.x else "l"
			var along := c.x if wall == "b" else c.y
			var length := room.wall_length(wall)
			var first := clampi(along - floori(def.w / 2.0), 0, maxi(0, length - def.w))
			return PlacedProp.make(prop_id, first if wall == "b" else 0, 0 if wall == "b" else first, 0, wall)
		_:
			return PlacedProp.make(prop_id, clampi(c.x - floori(def.w / 2.0), 0, room.width - def.w), clampi(c.y - floori(def.d / 2.0), 0, room.depth - def.d))


## "" when `it` fits (ignoring `ignore`'s own cells), else the reason code.
func fit_problem(it: PlacedProp, ignore: PlacedProp = null) -> StringName:
	var def := props.get_prop(it.k)
	if def == null:
		return &"unknown"
	match def.kind:
		PropDef.CEILING:
			if not room.in_bounds(Vector2i(it.x, it.z)):
				return &"outside"
		PropDef.WALL:
			var first := it.x if it.wall == "b" else it.z
			if (it.wall != "b" and it.wall != "l") or first < 0 or first + def.w > room.wall_length(it.wall):
				return &"outside"
		_:
			var size := def.size_at(it.r)
			if it.x < 0 or it.z < 0 or it.x + size.x > room.width or it.z + size.y > room.depth:
				return &"outside"
			for dc in room.door_cells():
				if dc.x >= it.x and dc.x < it.x + size.x and dc.y >= it.z and dc.y < it.z + size.y:
					return &"doorway"
	for key in keys_of(it):
		var other: PlacedProp = _occ.get(key)
		if other != null and other != ignore:
			return &"taken"
	return &""


## Buy and place `prop_id` where the player tapped `cell`. `balance` is what the player has.
func place(prop_id: String, cell: Vector2i, balance: int) -> HomeResult:
	var def := props.get_prop(prop_id)
	if def == null:
		return HomeResult.refused(&"unknown", "That item is not for sale.", "அந்தப் பொருள் விற்பனைக்கு இல்லை.")
	var it := make_item(prop_id, cell)
	var cost := prices.prop(prop_id)
	if balance < cost:
		return HomeResult.refused(&"poor", "You need ₹%d for the %s." % [cost, def.en], "%s வாங்க ₹%d தேவை." % [def.ta, cost])
	match fit_problem(it):
		&"":
			pass
		&"doorway":
			return HomeResult.refused(&"doorway", "Keep the doorway clear.", "வாசலை காலியாக வைக்கவும்.")
		_:
			return HomeResult.refused(&"taken", "That spot is taken or outside the room.", "அந்த இடம் நிரம்பியுள்ளது அல்லது அறைக்கு வெளியே உள்ளது.")
	items.append(it)
	for key in keys_of(it):
		_occ[key] = it
	return HomeResult.done(-cost, it)


## Turns a floor piece a quarter turn where it stands.
func rotate(it: PlacedProp) -> HomeResult:
	var def: PropDef = null if it == null else props.get_prop(it.k)
	if def == null or def.kind != PropDef.FLOOR:
		return HomeResult.refused(&"nothing", "Only floor items can turn.", "தரையில் உள்ள பொருட்கள் மட்டுமே திரும்பும்.")
	var turned := PlacedProp.make(it.k, it.x, it.z, (it.r + 1) % 4, it.wall)
	if fit_problem(turned, it) != &"":
		return HomeResult.refused(&"blocked", "No room to turn it here.", "இங்கே திருப்ப இடம் இல்லை.")
	for key in keys_of(it):
		_occ.erase(key)
	it.r = turned.r
	for key in keys_of(it):
		_occ[key] = it
	return HomeResult.done(0, it)


## Takes a piece out and pays half its price back.
func remove(it: PlacedProp) -> HomeResult:
	var at := items.find(it)
	if at < 0:
		return HomeResult.refused(&"nothing", "Nothing is selected.", "எதுவும் தேர்ந்தெடுக்கப்படவில்லை.")
	for key in keys_of(it):
		_occ.erase(key)
	items.remove_at(at)
	return HomeResult.done(prices.refund(it.k), it)


## Removes everything; the refund is half of every price.
func clear() -> HomeResult:
	var back := 0
	for it in items:
		back += prices.refund(it.k)
	items.clear()
	_occ.clear()
	return HomeResult.done(back)


## The piece a tap on a floor cell selects: the floor piece there, else the ceiling piece above
## it, else the wall piece on the wall that cell touches. Null when empty.
func item_at(cell: Vector2i) -> PlacedProp:
	var f: PlacedProp = _occ.get("f %d,%d" % [cell.x, cell.y])
	if f != null:
		return f
	var c: PlacedProp = _occ.get("c %d,%d" % [cell.x, cell.y])
	if c != null:
		return c
	if cell.y == 0:
		var wb: PlacedProp = _occ.get("wb %d" % cell.x)
		if wb != null:
			return wb
	if cell.x == 0:
		return _occ.get("wl %d" % cell.y)
	return null


## What the pieces refund if everything were removed (the CLEAR button's label).
func refund_all() -> int:
	var back := 0
	for it in items:
		back += prices.refund(it.k)
	return back


## True when a person can stand on the cell: inside the room and no non-walkable floor piece.
func walkable(cell: Vector2i) -> bool:
	if not room.in_bounds(cell):
		return false
	var it: PlacedProp = _occ.get("f %d,%d" % [cell.x, cell.y])
	if it == null:
		return true
	var def := props.get_prop(it.k)
	return def != null and def.walkable


## A walkable route between two floor points (metres), through cell centres, straightened where
## it can be; empty when `to` cannot be reached. The first point is `from` itself.
func path(from: Vector2, to: Vector2) -> PackedVector2Array:
	var start := room.cell_at(from)
	var goal := room.cell_at(to)
	if not walkable(goal):
		return PackedVector2Array()
	var came: Dictionary[Vector2i, Vector2i] = {start: start}
	var frontier: Array[Vector2i] = [start]
	var head := 0
	while head < frontier.size() and not came.has(goal):
		var here := frontier[head]
		head += 1
		for step: Vector2i in [Vector2i(1, 0), Vector2i(-1, 0), Vector2i(0, 1), Vector2i(0, -1)]:
			var next := here + step
			if not came.has(next) and walkable(next):
				came[next] = here
				frontier.append(next)
	if not came.has(goal):
		return PackedVector2Array()
	var cells: Array[Vector2i] = []
	var at := goal
	while at != start:
		cells.append(at)
		at = came[at]
	cells.reverse()
	if cells.is_empty():
		return PackedVector2Array([from, to])
	var raw: Array[Vector2] = [from]
	for c in cells:
		raw.append(Vector2(float(c.x) + 0.5, float(c.y) + 0.5))
	raw[raw.size() - 1] = to
	return _straighten(raw)


func _straighten(points: Array[Vector2]) -> PackedVector2Array:
	var out := PackedVector2Array([points[0]])
	var i := 0
	while i < points.size() - 1:
		var far := points.size() - 1
		while far > i + 1 and not _clear_line(points[i], points[far]):
			far -= 1
		out.append(points[far])
		i = far
	return out


func _clear_line(a: Vector2, b: Vector2) -> bool:
	var steps := maxi(1, ceili(a.distance_to(b) / 0.2))
	for s in steps + 1:
		var p := a.lerp(b, float(s) / float(steps))
		if not walkable(room.cell_at(p)):
			return false
		# A body is about 0.6 m wide: check the cells to each side of the line as well.
		for off: Vector2 in [Vector2(0.25, 0.0), Vector2(-0.25, 0.0), Vector2(0.0, 0.25), Vector2(0.0, -0.25)]:
			if not walkable(room.cell_at(p + off)):
				return false
	return true
