class_name BuildingMeshes
extends RefCounted
## Buildings of one chunk merged into three surfaces (`ChunkView.ts` and `FacadeKit.ts`): walls
## (facade atlas: windows, balconies, doors, shops, with chajja sunshades and balcony slabs
## merged in), roofs (flat terraces, clay-tile hip roofs on a third of the low houses, black
## water tanks) and the kit (rolling shutters, Tamil signboards, balcony railings).
##
## Renderer-only variety, chosen deterministically from the building id (the world data is
## untouched): which houses get tiled roofs, which windows glow after dark, which walls get
## shops. Every size is estimated from typical Chennai streets, not mapped. Pure data: runs on a
## worker thread. Points are moved by `-origin` so a chunk's mesh is local to its centre.
## Colours are linear (materials leave `vertex_color_is_srgb` off), as in the Three.js game.

const BAY := 3.2
const GROUND_FLOOR := 3.3
const PARAPET := 0.9
const TILED_ROOFS := 0.32
const LIT_WINDOWS := 0.35
const OVERHANG := 0.35
const PITCH := 0.55
const TILE_REPEAT := 2.4
const TANKS := 0.7
const TANK_RADIUS := 0.75
const TANK_HEIGHT := 1.5
const TANK_COLOR := 0x1d1f22

## Shares by kind (house, apartments, commercial) of sunshades, balconies and shop fronts.
const CHAJJAS: Dictionary[StringName, float] = {&"house": 0.5, &"apartments": 0.85, &"commercial": 0.35}
const BALCONIES: Dictionary[StringName, float] = {&"house": 0.3, &"apartments": 0.7, &"commercial": 0.0}
const SHOPS: Dictionary[StringName, float] = {&"house": 0.4, &"apartments": 0.5, &"commercial": 1.0}
const SETBACK := 12.0
const FACING := 0.6
const MIN_SHOP_WALL := 2.5
const SHOP_HEIGHT := 3.2
const SHUTTER_TOP := 2.45
const SIGN_BOTTOM := 2.5
const SIGN_TOP := 3.2
const SIGN_DEPTH := 0.14
const SHUTTER_OFFSET := 0.03
const CHAJJA_DEPTH := 0.55
const CHAJJA_THICK := 0.1
const BALCONY_DEPTH := 0.85
const BALCONY_THICK := 0.14
const RAIL_HEIGHT := 0.95
## Painted shutter colours (linear), multiplied into the near-white shutter.
const SHUTTERS: Array[Color] = [Color(0.78, 0.8, 0.82), Color(0.45, 0.62, 0.5), Color(0.42, 0.55, 0.72), Color(0.75, 0.68, 0.5), Color(0.6, 0.6, 0.62)]


## Which details a building gets.
class Plan:
	extends RefCounted
	var chajjas: bool = false
	var balconies: bool = false
	## Wall indices (edge i runs from outline[i] to outline[i + 1]) with shop fronts.
	var shop_walls: Dictionary[int, bool] = {}


## A wall-aligned frame: start point (local), unit direction along the wall, outward normal.
class WallFrame:
	extends RefCounted
	var p: Vector2
	var u: Vector2
	var n: Vector2

	func _init(start: Vector2, along: Vector2, out: Vector2) -> void:
		p = start
		u = along
		n = out

	func at(s: float, d: float, y: float) -> Vector3:
		var q := p + u * s + n * d
		return Vector3(q.x, y, q.y)

	func moved(start: Vector2) -> WallFrame:
		return WallFrame.new(start, u, n)


var walls := MeshBuilder.new()
var roofs := MeshBuilder.new()
var kit := MeshBuilder.new()
## One quad per wall and a flat roof: the far look of the same buildings.
var far := MeshBuilder.new()
## Local origin: the chunk centre (world metres).
var origin := Vector2.ZERO

var _plaster_flat := Vector4(CityAtlas.PLASTER.x, CityAtlas.PLASTER.x + 0.002, CityAtlas.PLASTER.y - 0.02, CityAtlas.PLASTER.y)
var _shutter_uv := CityAtlas.kit_uv(CityAtlas.KIT_SHUTTER)
var _lit_uv := CityAtlas.kit_uv(CityAtlas.KIT_LIT)
var _dark_uv := CityAtlas.kit_uv(CityAtlas.KIT_DARK)
var _rail_uv := CityAtlas.kit_uv(CityAtlas.KIT_RAILING)
var _plain_uv := CityAtlas.kit_uv(CityAtlas.KIT_PLAIN)


static func lin(hex: int) -> Color:
	return Color.hex((hex << 8) | 0xff).srgb_to_linear()


static func is_convex(outline: PackedVector2Array) -> bool:
	var sign := 0.0
	var n := outline.size()
	for i in n:
		var a := outline[i]
		var b := outline[(i + 1) % n]
		var c := outline[(i + 2) % n]
		var cross := (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)
		if absf(cross) < 1e-6:
			continue
		if sign == 0.0:
			sign = signf(cross)
		elif signf(cross) != sign:
			return false
	return true


## Low houses that get a clay-tile hip roof instead of a flat terrace.
static func has_tiled_roof(b: Building) -> bool:
	return b.kind == &"house" and b.floors <= 2 and b.outline.size() >= 4 and b.outline.size() <= 8 and CityHash.unit(b.id, 41) < TILED_ROOFS and is_convex(b.outline)


## Heights the walls are drawn with, for fixtures on walls and roofs (`buildingFrame`).
static func frame_of(b: Building) -> Dictionary:
	var upper_top := b.height - PARAPET
	var tiled := has_tiled_roof(b)
	return {"ground_floor": GROUND_FLOOR, "upper_top": upper_top, "bay": BAY, "tiled": tiled, "roof_y": upper_top - 0.05 if tiled else b.height - 0.35}


## Whether the wall p-q faces a road close in front of it; `main` limits it to arterial roads.
static func wall_faces_road(p: Vector2, q: Vector2, spans: Array, main: bool) -> bool:
	var length := p.distance_to(q)
	if length < 0.05:
		return false
	var n := Vector2(q.y - p.y, -(q.x - p.x)) / length
	var m := (p + q) * 0.5
	for span: CityLayout.RoadSpan in spans:
		var road := span.road
		if road.kind == &"footway" or (main and not road.is_main()):
			continue
		var reach := road.width / 2.0 + SETBACK
		for k in range(span.start, span.end):
			var c := Geometry2D.get_closest_point_to_segment(m, road.points[k], road.points[k + 1])
			var d := c.distance_to(m)
			if d < reach and d > 0.01 and (c - m).dot(n) / d > FACING:
				return true
	return false


static func plan_facade(b: Building, spans: Array) -> Plan:
	var plan := Plan.new()
	var ground_height := 3.3 if b.floors > 1 else b.height - 0.9
	var shops: bool = ground_height >= SHOP_HEIGHT and (b.kind == &"commercial" or b.floors >= 2) and CityHash.unit(b.id, 301) < float(SHOPS.get(b.kind, 0.0))
	if shops:
		var n := b.outline.size()
		for i in n:
			var p := b.outline[i]
			var q := b.outline[(i + 1) % n]
			if p.distance_to(q) < MIN_SHOP_WALL:
				continue
			if wall_faces_road(p, q, spans, b.kind != &"commercial"):
				plan.shop_walls[i] = true
	plan.chajjas = CityHash.unit(b.id, 302) < float(CHAJJAS.get(b.kind, 0.0))
	plan.balconies = b.floors >= 2 and CityHash.unit(b.id, 303) < float(BALCONIES.get(b.kind, 0.0))
	return plan


## Shops along one wall: runs of one or two bays under one signboard each (`shopsOnWall`).
static func shops_on_wall(b: Building, wall: int, bays: int) -> Array[Dictionary]:
	var out: Array[Dictionary] = []
	var wide := ShopSigns.wide()
	var narrow := ShopSigns.narrow()
	var bay := 0
	while bay < bays:
		var is_wide := bay + 1 < bays and CityHash.unit(b.id, 321 + wall * 97 + bay) < 0.4
		var list := wide if is_wide else narrow
		var sign := list[floori(CityHash.unit(b.id, 331 + wall * 89 + bay) * list.size())]
		var t := CityHash.unit(b.id, 311 + wall * 211 + bay * 17)
		var state := &"down" if t < 0.4 else (&"lit" if t < 0.78 else &"dark")
		out.append({"first": bay, "bays": 2 if is_wide else 1, "sign": sign, "state": state})
		bay += 2 if is_wide else 1
	return out


## A wall-space box (`box` in FacadeKit.ts): s along, y up, d out. `faces` maps front, top,
## bottom, ends to kit UVs (u0, u1, v top, v bottom); the back is never drawn.
static func box(mesh: MeshBuilder, f: WallFrame, s0: float, s1: float, y0: float, y1: float, d0: float, d1: float, faces: Dictionary, colour: Color) -> void:
	var a0 := f.at(s0, d1, y0)
	var b0 := f.at(s1, d1, y0)
	var c0 := f.at(s1, d0, y0)
	var e0 := f.at(s0, d0, y0)
	var a1 := Vector3(a0.x, y1, a0.z)
	var b1 := Vector3(b0.x, y1, b0.z)
	var c1 := Vector3(c0.x, y1, c0.z)
	var e1 := Vector3(e0.x, y1, e0.z)
	var n3 := Vector3(f.n.x, 0.0, f.n.y)
	var u3 := Vector3(f.u.x, 0.0, f.u.y)
	if faces.has("front"):
		_quad(mesh, [a0, b0, b1, a1], n3, faces["front"], colour)
	if faces.has("top"):
		_quad(mesh, [a1, b1, c1, e1], Vector3.UP, faces["top"], colour)
	if faces.has("bottom"):
		_quad(mesh, [e0, c0, b0, a0], Vector3.DOWN, faces["bottom"], colour)
	if faces.has("ends"):
		_quad(mesh, [e0, a0, a1, e1], -u3, faces["ends"], colour)
		_quad(mesh, [b0, c0, c1, b1], u3, faces["ends"], colour)


static func _quad(mesh: MeshBuilder, c: Array[Vector3], normal: Vector3, uv: Vector4, colour: Color) -> void:
	# Seen from outside, s runs right to left along a wall, so u is reversed to keep text reading right.
	var uvs: Array[Vector2] = [Vector2(uv.y, uv.w), Vector2(uv.x, uv.w), Vector2(uv.x, uv.z), Vector2(uv.y, uv.z)]
	var ids: Array[int] = []
	for k in 4:
		ids.append(mesh.vertex(c[k], normal, uvs[k], colour))
	if (c[1] - c[0]).cross(c[2] - c[0]).dot(normal) >= 0.0:
		mesh.quad(ids[0], ids[1], ids[2], ids[3])
	else:
		mesh.quad(ids[0], ids[3], ids[2], ids[1])


func _add_shop_fronts(b: Building, wall: int, f: WallFrame, length: float, bays: int) -> void:
	var bay_width := length / bays
	var margin := minf(0.22, bay_width * 0.08)
	for shop in shops_on_wall(b, wall, bays):
		var first: int = shop["first"]
		var count: int = shop["bays"]
		var s0 := first * bay_width
		var s1 := s0 + count * bay_width
		var state: StringName = shop["state"]
		for k in count:
			var a := s0 + k * bay_width + margin
			var c := s0 + (k + 1) * bay_width - margin
			var face := _shutter_uv if state == &"down" else (_lit_uv if state == &"lit" else _dark_uv)
			var tint := SHUTTERS[floori(CityHash.unit(b.id, 341 + wall * 31 + first) * SHUTTERS.size())] if state == &"down" else Color.WHITE
			box(kit, f, a, c, 0.0, SHUTTER_TOP, 0.0, SHUTTER_OFFSET, {"front": face}, tint)
		var sign_uv := CityAtlas.kit_uv(CityAtlas.sign_rect(int(shop["sign"])))
		box(kit, f, s0 + 0.05, s1 - 0.05, SIGN_BOTTOM, SIGN_TOP, 0.0, SIGN_DEPTH, {"front": sign_uv, "top": _plain_uv, "bottom": _plain_uv, "ends": _plain_uv}, Color.WHITE)


func _add_chajja(f: WallFrame, bay_width: float, y0: float, storey: float, colour: Color) -> void:
	var top := y0 + storey * 0.79
	var half := bay_width * 0.31
	var mid := bay_width / 2.0
	# No top face: from the street it is never seen.
	box(walls, f, mid - half, mid + half, top - CHAJJA_THICK, top, 0.0, CHAJJA_DEPTH, {"front": _plaster_flat, "bottom": _plaster_flat}, colour)


func _add_balcony(f: WallFrame, bay_width: float, y0: float, colour: Color) -> void:
	var half := bay_width * 0.36
	var mid := bay_width / 2.0
	var top := y0 + 0.04
	box(walls, f, mid - half, mid + half, top - BALCONY_THICK, top, 0.0, BALCONY_DEPTH, {"front": _plaster_flat, "top": _plaster_flat, "bottom": _plaster_flat}, colour)
	box(kit, f, mid - half, mid + half, top, top + RAIL_HEIGHT, 0.0, BALCONY_DEPTH - 0.02, {"front": _rail_uv, "ends": _rail_uv}, Color.WHITE)


## Adds one building (`addBuilding`). `spans` are the roads of its chunk.
func add(b: Building, plan: Plan) -> void:
	var base := lin(b.color_hex)
	var outline := PackedVector2Array()
	for p in b.outline:
		outline.append(p - origin)
	var upper_top := b.height - PARAPET
	var upper_floors := b.floors - 1
	var tiled := has_tiled_roof(b)
	var n := outline.size()
	for i in n:
		var p := outline[i]
		var q := outline[(i + 1) % n]
		var dv := q - p
		var length := dv.length()
		if length < 0.05:
			continue
		# Outline is anticlockwise, so this is the outward normal.
		var normal := Vector2(dv.y, -dv.x) / length
		var n3 := Vector3(normal.x, 0.0, normal.y)
		var shade := 0.92 + 0.08 * CityHash.unit(b.id, i)
		var c := Color(base.r * shade, base.g * shade, base.b * shade)
		_add_far_wall(p, q, n3, b.height, c)
		var bays := maxi(1, roundi(length / BAY))
		var frame := WallFrame.new(p, dv / length, normal)
		var shop_wall := plan.shop_walls.has(i)
		if shop_wall:
			_add_shop_fronts(b, i, frame, length, bays)
		var slab := Color(minf(1.0, c.r * 1.06), minf(1.0, c.g * 1.06), minf(1.0, c.b * 1.06))
		var plain := length / bays < 1.6
		var bay_width := length / bays
		for bay in bays:
			var x0 := p + dv * (float(bay) / bays)
			var x1 := p + dv * (float(bay + 1) / bays)
			var pick := CityHash.unit(b.id, i * 97 + bay)
			var ground_top := GROUND_FLOOR if upper_floors > 0 else upper_top
			var ground_tile: int
			if b.kind == &"commercial":
				ground_tile = CityAtlas.TILE_SHOP if pick < 0.75 else CityAtlas.TILE_WINDOW
			else:
				ground_tile = CityAtlas.TILE_DOOR if pick < 0.3 else CityAtlas.TILE_WINDOW
			var lit0 := _lit(b, i, bay, 0)
			# Behind a shop front the ground floor is plain plaster: the shutters and sign cover it.
			_band(x0, x1, n3, 0.0, ground_top, CityAtlas.TILE_WINDOW if shop_wall else ground_tile + lit0, plain or shop_wall, c)
			var bay_frame := frame.moved(x0)
			if plan.chajjas and not plain and not shop_wall and ground_tile == CityAtlas.TILE_WINDOW:
				_add_chajja(bay_frame, bay_width, 0.0, ground_top, slab)
			if upper_floors > 0:
				var upper_tile := CityAtlas.TILE_BALCONY if CityHash.unit(b.id, i * 131 + bay + 7) < (0.25 if b.kind == &"house" else 0.45) else CityAtlas.TILE_WINDOW
				var storey := (upper_top - GROUND_FLOOR) / upper_floors
				for floor_i in upper_floors:
					var y0 := GROUND_FLOOR + floor_i * storey
					_band(x0, x1, n3, y0, y0 + storey, upper_tile + _lit(b, i, bay, floor_i + 1), plain, c)
					if plain:
						continue
					if upper_tile == CityAtlas.TILE_WINDOW and plan.chajjas:
						_add_chajja(bay_frame, bay_width, y0, storey, slab)
					elif upper_tile == CityAtlas.TILE_BALCONY and plan.balconies:
						_add_balcony(bay_frame, bay_width, y0, slab)
		if tiled:
			continue
		# Parapet: plain plaster from a blank corner of the window tile.
		var u := CityAtlas.PLASTER.x
		var v0 := walls.vertex(Vector3(p.x, upper_top, p.y), n3, Vector2(u, 0.14), c)
		var v1 := walls.vertex(Vector3(q.x, upper_top, q.y), n3, Vector2(u + 0.01, 0.14), c)
		var v2 := walls.vertex(Vector3(q.x, b.height, q.y), n3, Vector2(u + 0.01, 0.10), c)
		var v3 := walls.vertex(Vector3(p.x, b.height, p.y), n3, Vector2(u, 0.10), c)
		walls.quad(v0, v3, v2, v1)
	_add_flat(far, outline, b.height, Color(base.r * 0.8, base.g * 0.8, base.b * 0.8), CityAtlas.ROOF_PLAIN)
	if tiled and _add_tiled_roof(b, outline, upper_top):
		return
	var roof_y := upper_top - 0.05 if tiled else b.height - 0.35
	var tone := 0.55 + CityHash.unit(b.id, 3) * 0.2
	_add_flat(roofs, outline, roof_y, Color(tone, tone * 0.98, tone * 0.95), CityAtlas.ROOF_PLAIN)
	if not tiled and CityHash.unit(b.id, 21) < TANKS:
		var centre := Vector2.ZERO
		for p in outline:
			centre += p
		_add_tank(centre / n, roof_y)


func _lit(b: Building, wall: int, bay: int, floor_i: int) -> int:
	return CityAtlas.LIT if CityHash.unit(b.id, wall * 7919 + bay * 61 + floor_i * 13 + 5) < LIT_WINDOWS else 0


## One facade band from x0 to x1 between heights y0 and y1 (one tile wide, one storey high).
func _band(x0: Vector2, x1: Vector2, n3: Vector3, y0: float, y1: float, tile: int, flat: bool, c: Color) -> void:
	var u0: float
	var u1: float
	if flat:
		u0 = (tile + 0.03) / CityAtlas.FACADE_TILES
		u1 = (tile + 0.06) / CityAtlas.FACADE_TILES
	else:
		u0 = float(tile) / CityAtlas.FACADE_TILES + CityAtlas.INSET
		u1 = float(tile + 1) / CityAtlas.FACADE_TILES - CityAtlas.INSET
	var a := walls.vertex(Vector3(x0.x, y0, x0.y), n3, Vector2(u0, 1.0), c)
	var cc := walls.vertex(Vector3(x1.x, y0, x1.y), n3, Vector2(u1, 1.0), c)
	var d := walls.vertex(Vector3(x1.x, y1, x1.y), n3, Vector2(u1, 0.0), c)
	var e := walls.vertex(Vector3(x0.x, y1, x0.y), n3, Vector2(u0, 0.0), c)
	walls.quad(a, e, d, cc)


func _add_far_wall(p: Vector2, q: Vector2, n3: Vector3, height: float, c: Color) -> void:
	var uv := CityAtlas.ROOF_PLAIN
	var a := far.vertex(Vector3(p.x, 0.0, p.y), n3, uv, c)
	var b := far.vertex(Vector3(q.x, 0.0, q.y), n3, uv, c)
	var d := far.vertex(Vector3(q.x, height, q.y), n3, uv, c)
	var e := far.vertex(Vector3(p.x, height, p.y), n3, uv, c)
	far.quad(a, e, d, b)


## A flat polygon facing up at height y (roof slabs).
static func _add_flat(mesh: MeshBuilder, outline: PackedVector2Array, y: float, c: Color, uv: Vector2) -> void:
	var faces := Geometry2D.triangulate_polygon(outline)
	if faces.is_empty():
		return
	var base := mesh.vertex_count()
	for p in outline:
		mesh.vertex(Vector3(p.x, y, p.y), Vector3.UP, uv, c)
	for t in range(0, faces.size(), 3):
		var i0 := faces[t]
		var i1 := faces[t + 1]
		var i2 := faces[t + 2]
		var p0 := outline[i0]
		var p1 := outline[i1]
		var p2 := outline[i2]
		# Keep the triangle facing up whichever way the triangulator wound it.
		if (p1.y - p0.y) * (p2.x - p0.x) - (p1.x - p0.x) * (p2.y - p0.y) > 0.0:
			mesh.triangle(base + i0, base + i1, base + i2)
		else:
			mesh.triangle(base + i0, base + i2, base + i1)


## The black rooftop water tank of almost every Chennai house: a ten-sided drum with a lid.
func _add_tank(c: Vector2, y: float) -> void:
	var colour := lin(TANK_COLOR)
	var uv := CityAtlas.ROOF_PLAIN
	const SIDES := 10
	var top := y + TANK_HEIGHT
	var lid := roofs.vertex(Vector3(c.x, top, c.y), Vector3.UP, uv, colour)
	var rim: Array[int] = []
	for s in SIDES:
		var a0 := TAU * s / SIDES
		var a1 := TAU * (s + 1) / SIDES
		var mid := (a0 + a1) * 0.5
		var nrm := Vector3(cos(mid), 0.0, sin(mid))
		var p0 := Vector3(c.x + cos(a0) * TANK_RADIUS, y, c.y + sin(a0) * TANK_RADIUS)
		var p1 := Vector3(c.x + cos(a1) * TANK_RADIUS, y, c.y + sin(a1) * TANK_RADIUS)
		var i0 := roofs.vertex(p0, nrm, uv, colour)
		var i1 := roofs.vertex(p1, nrm, uv, colour)
		var i2 := roofs.vertex(Vector3(p1.x, top, p1.z), nrm, uv, colour)
		var i3 := roofs.vertex(Vector3(p0.x, top, p0.z), nrm, uv, colour)
		# Outward faces: anticlockwise seen from outside.
		roofs.quad(i0, i3, i2, i1)
		rim.append(roofs.vertex(Vector3(p0.x, top, p0.z), Vector3.UP, uv, colour))
	for s in SIDES:
		roofs.triangle(lid, rim[(s + 1) % SIDES], rim[s])


## Clay-tile hip roof over a convex footprint (`addTiledRoof`); false when too small.
func _add_tiled_roof(b: Building, o: PackedVector2Array, base_y: float) -> bool:
	var n := o.size()
	var centre := Vector2.ZERO
	for p in o:
		centre += p
	centre /= n
	var axis := Vector2(1.0, 0.0)
	var half := 0.0
	var span: float
	if n == 4:
		var edge := func(i: int) -> float: return o[i].distance_to(o[(i + 1) % 4])
		var e0: float = edge.call(0)
		var e1: float = edge.call(1)
		var e2: float = edge.call(2)
		var e3: float = edge.call(3)
		var long_first := e0 + e2 >= e1 + e3
		var a0 := o[0] if long_first else o[1]
		var a1 := o[1] if long_first else o[2]
		var b0 := o[3] if long_first else o[0]
		var b1 := o[2] if long_first else o[3]
		axis = (a1 - a0) + (b1 - b0)
		var l := axis.length()
		axis = axis / l if l > 0.0 else Vector2(1.0, 0.0)
		var long_side := (e0 + e2) / 2.0 if long_first else (e1 + e3) / 2.0
		span = (e1 + e3) / 2.0 if long_first else (e0 + e2) / 2.0
		half = maxf(0.0, (long_side - span) / 2.0)
	else:
		var radius := 0.0
		for p in o:
			radius += p.distance_to(centre)
		span = radius / n * 1.4
	if span < 3.0:
		return false
	var rise := minf(2.4, span / 2.0 * PITCH)
	var ends := PackedFloat32Array()
	var lows := 0
	for p in o:
		var e := -1.0 if (p - centre).dot(axis) < 0.0 else 1.0
		ends.append(e)
		if e < 0.0:
			lows += 1
	# A skewed quad whose corners don't split two and two along the axis gets a pyramid.
	if half > 0.0 and lows != 2:
		half = 0.0
	var eaves: Array[Vector3] = []
	for p in o:
		var d := p - centre
		var dl := d.length()
		if dl == 0.0:
			dl = 1.0
		var e := p + d / dl * OVERHANG
		eaves.append(Vector3(e.x, base_y, e.y))
	var terracotta := lin(0xb0553a).lerp(lin(0x8f4630 if CityHash.unit(b.id, 43) < 0.5 else 0xc4704a), CityHash.unit(b.id, 44) * 0.6)
	for i in n:
		var j := (i + 1) % n
		var e0 := eaves[i]
		var e1 := eaves[j]
		var r0 := _ridge(centre, axis, half * (ends[i] if half > 0.0 else 0.0), base_y + rise)
		var r1 := _ridge(centre, axis, half * (ends[j] if half > 0.0 else 0.0), base_y + rise)
		var face: Array[Vector3] = [e0, e1, r0]
		if not r0.is_equal_approx(r1):
			face = [e0, e1, r1, r0]
		var ev := Vector2(e1.x - e0.x, e1.z - e0.z)
		var el := ev.length()
		if el == 0.0:
			el = 1.0
		var ux := ev / el
		var inward := Vector2(-ux.y, ux.x)
		if (centre - Vector2(e0.x, e0.z)).dot(inward) < 0.0:
			inward = -inward
		var nrm := (face[1] - face[0]).cross(face[2] - face[0])
		# Face up whichever way the corners run (three.js winding, flipped by MeshBuilder).
		var flip := nrm.y < 0.0
		nrm = (-nrm if flip else nrm).normalized()
		var shade := 0.9 + 0.1 * CityHash.unit(b.id, 50 + i)
		var colour := Color(terracotta.r * shade, terracotta.g * shade, terracotta.b * shade)
		var ids: Array[int] = []
		for p in face:
			var rel := Vector2(p.x - e0.x, p.z - e0.z)
			ids.append(roofs.vertex(p, nrm, Vector2(rel.dot(ux) / TILE_REPEAT, Vector2(rel.dot(inward), p.y - base_y).length() / TILE_REPEAT), colour))
		if flip:
			ids.reverse()
		if ids.size() == 3:
			roofs.triangle(ids[0], ids[1], ids[2])
		else:
			roofs.quad(ids[0], ids[1], ids[2], ids[3])
	return true


static func _ridge(centre: Vector2, axis: Vector2, along: float, y: float) -> Vector3:
	var p := centre + axis * along
	return Vector3(p.x, y, p.y)
