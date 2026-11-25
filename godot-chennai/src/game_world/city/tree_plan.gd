class_name TreePlan
extends RefCounted
## Which plant stands where in one chunk (G-383): takes the trees the chunk file and the road work
## planted, drops the ones that cannot stand (inside a building, on a carriageway, beside a
## railway track), gives each a species from its place (`TreeStyle`), a size, a lean towards the
## road, a tint and a rank, and adds the plants round them (bushes, tufts, scrub, bougainvillea on
## walls). Plain data, deterministic: every choice is a hash of the position (`CityHash.tree_unit`),
## so a tree is the same every time its chunk loads. Runs on a worker.

## Distance from a road's edge a tree needs, metres (a trunk on the kerb is on the road).
const ROAD_MARGIN := 0.55
## Distance from the nearest rail a plant needs, metres.
const RAIL_MARGIN := 3.4
## Trees closer to a road than this (from its centre line, beyond its half width) lean over it.
const LEAN_REACH := 8.5
## Draw-call caps: distinct tree species and distinct understory species per chunk.
const MAX_TREE_SPECIES := 7
const MAX_UNDER_SPECIES := 3
## A species with fewer plants than this in a chunk is folded into a commoner one.
const MIN_COUNT := 3
## Plants added around the trees, at most per chunk.
const MAX_EXTRAS := 260
## Scrub scattered over open country: one cell every so many metres.
const SCRUB_PITCH := 26.0
const SCRUB_MAX := 70
## Bougainvillea on walls: chance per building, at most per chunk.
const WALL_CHANCE := 0.035
const WALL_MAX := 24

# Hash salts (`CityHash.tree_unit`): kept apart from the old chunk builder's 51..56.
const S_SPECIES := 401
const S_SIZE := 402
const S_YAW := 403
const S_TINT := 404
const S_RANK := 405
const S_LEAN := 406
const S_COMPANION := 410


## What the plan needs from the chunk build (everything read-only).
class Context:
	extends RefCounted
	var layout: CityLayout
	var buildings: Array[Building] = []
	var boxes: Array[Rect2] = []
	var areas: Array[WorldArea] = []
	var water: Array[PackedVector2Array] = []
	var palettes: AreaPalettes
	var rail: RailIndex
	var square: Rect2 = Rect2()
	## A chunk with few buildings: open country (RoadDetail.RURAL_BUILDINGS).
	var rural: bool = false
	## Draw-call caps for this build (the preset's, `QualitySettings` "tree_species", "under_species").
	var max_species: int = MAX_TREE_SPECIES
	var max_under: int = MAX_UNDER_SPECIES


static func for_chunk(ctx: Context, trees: Array[WorldTree]) -> Array[TreeSpot]:
	var out: Array[TreeSpot] = []
	for t in trees:
		var spot := _from_tree(ctx, t)
		if spot != null:
			out.append(spot)
	var extras := _companions(ctx, out)
	extras.append_array(_walls(ctx, out))
	if ctx.rural:
		extras.append_array(_scrub(ctx, out))
	if extras.size() > MAX_EXTRAS:
		extras.resize(MAX_EXTRAS)
	out.append_array(extras)
	_cap_species(out, ctx.max_species, ctx.max_under)
	return out


## Whether a plant can stand at `p`: clear of buildings, carriageways, water and rails.
static func can_stand(ctx: Context, p: Vector2, margin: float = ROAD_MARGIN) -> bool:
	if not ctx.water.is_empty() and WaterMeshes.inside_any(p, ctx.water, -1):
		return false
	if StreetFurniture.in_building(ctx.buildings, ctx.boxes, p, 0.4):
		return false
	var hit := ctx.layout.nearest_road_point(p, false)
	if not hit.is_empty():
		var road: Road = ctx.layout.roads[int(hit["road_index"])]
		if float(hit["distance"]) < road.width / 2.0 + margin:
			return false
	if ctx.rail != null and ctx.rail.track_distance(p) < RAIL_MARGIN:
		return false
	return true


static func area_kind(ctx: Context, p: Vector2) -> StringName:
	for a in ctx.areas:
		if a.kind == &"water":
			continue
		if StreetFurniture.point_in_polygon(p, a.outline):
			return a.kind
	return &""


static func profile_at(ctx: Context, p: Vector2) -> StringName:
	if ctx.palettes == null:
		return TreeStyle.URBAN
	return TreeStyle.district_profile(ctx.palettes.at(p).id)


static func _from_tree(ctx: Context, t: WorldTree) -> TreeSpot:
	var p := t.position
	var hit := ctx.layout.nearest_road_point(p, false)
	var road: Road = null
	var d_road := INF
	if not hit.is_empty():
		road = ctx.layout.roads[int(hit["road_index"])]
		d_road = float(hit["distance"])
		if d_road < road.width / 2.0 + ROAD_MARGIN:
			return null
	if not ctx.water.is_empty() and WaterMeshes.inside_any(p, ctx.water, -1):
		return null
	if StreetFurniture.in_building(ctx.buildings, ctx.boxes, p, 0.4):
		return null
	if ctx.rail != null and ctx.rail.track_distance(p) < RAIL_MARGIN:
		return null
	var s := TreeSpot.new()
	s.position = p
	s.from_data = true
	var profile := profile_at(ctx, p)
	if ctx.rural and profile != TreeStyle.COASTAL:
		profile = TreeStyle.RURAL
	var kind := area_kind(ctx, p)
	var arterial := road != null and d_road < road.width / 2.0 + 9.0 and (road.is_main() or road.kind == &"primary")
	var named := t.species
	if named != &"" and TreeSpecies.TABLE.has(named):
		s.species = named
	else:
		var w := TreeStyle.weights_for(profile, kind, arterial, t.source == &"osm")
		s.species = RoadStyle.pick_species(w, CityHash.tree_unit(p, S_SPECIES))
	_finish(s, t.scale, road, d_road, hit, ctx.rural)
	return s


## Size, yaw, lean, tint and rank from the position.
static func _finish(s: TreeSpot, base_scale: float, road: Road, d_road: float, hit: Dictionary, dry: bool) -> void:
	var p := s.position
	var jitter := TreeSpecies.number(s.species, "jitter")
	var size := clampf(base_scale, 0.7, 1.4) * (1.0 + (CityHash.tree_unit(p, S_SIZE) - 0.5) * 2.0 * jitter)
	s.scale = clampf(size, 0.55, 1.6)
	s.yaw = CityHash.tree_unit(p, S_YAW) * TAU
	var v := 0.88 + CityHash.tree_unit(p, S_TINT) * 0.24
	s.tint = Color(v, v, v * 0.95, 1.0)
	if dry and TreeSpecies.kind_of(s.species) != TreeSpecies.DEAD:
		s.tint = Color(v * 1.06, v * 0.97, v * 0.78, 1.0)
	s.rank = CityHash.tree_unit(p, S_RANK)
	var kind := TreeSpecies.kind_of(s.species)
	if kind == TreeSpecies.PALM:
		s.lean = 0.02 + CityHash.tree_unit(p, S_LEAN) * 0.07
		s.lean_dir = Vector2.from_angle(CityHash.tree_unit(p, S_LEAN + 1) * TAU)
	if road != null and not hit.is_empty() and (kind == TreeSpecies.TREE or kind == TreeSpecies.PALM or kind == TreeSpecies.DEAD):
		var reach := road.width / 2.0 + LEAN_REACH
		if d_road < reach:
			var toward: Vector2 = (hit["point"] as Vector2) - p
			if toward.length() > 0.1:
				# Rain trees and palms lean over the road, the others less; the nearer the more.
				var gain := 0.16 if (s.species == TreeSpecies.RAIN or kind == TreeSpecies.PALM) else 0.08
				s.lean_dir = toward.normalized()
				s.lean = maxf(s.lean, gain * (1.0 - (d_road - road.width / 2.0) / LEAN_REACH) * (0.6 + 0.4 * CityHash.tree_unit(p, S_LEAN + 2)))


## A bush or tuft beside some trees; position and kind by hash.
static func _companions(ctx: Context, trees: Array[TreeSpot]) -> Array[TreeSpot]:
	var out: Array[TreeSpot] = []
	for t in trees:
		if TreeSpecies.is_understory(t.species) or TreeSpecies.kind_of(t.species) == TreeSpecies.DEAD:
			continue
		var kind := area_kind(ctx, t.position)
		var profile := profile_at(ctx, t.position)
		if ctx.rural and profile != TreeStyle.COASTAL:
			profile = TreeStyle.RURAL
		if CityHash.tree_unit(t.position, S_COMPANION) >= TreeStyle.companion_chance(profile, kind):
			continue
		var ang := CityHash.tree_unit(t.position, S_COMPANION + 1) * TAU
		var dist := 1.6 + CityHash.tree_unit(t.position, S_COMPANION + 2) * 2.6 + TreeSpecies.number(t.species, "width") * 0.12
		var at := t.position + Vector2.from_angle(ang) * dist
		if not can_stand(ctx, at, 0.9):
			continue
		var s := TreeSpot.new()
		s.position = at
		s.from_data = false
		var w := TreeStyle.understory_for(profile, kind)
		s.species = RoadStyle.pick_species(w, CityHash.tree_unit(at, S_COMPANION + 3))
		_finish(s, 1.0, null, INF, {}, ctx.rural)
		out.append(s)
		if out.size() >= MAX_EXTRAS:
			break
	return out


## Bougainvillea against some building walls (a corner, a little out from the wall).
static func _walls(ctx: Context, _trees: Array[TreeSpot]) -> Array[TreeSpot]:
	var out: Array[TreeSpot] = []
	if ctx.rural:
		return out
	for b in ctx.buildings:
		if out.size() >= WALL_MAX:
			break
		if b.outline.size() < 3 or CityHash.unit(b.id, 420) >= WALL_CHANCE:
			continue
		var i := floori(CityHash.unit(b.id, 421) * b.outline.size())
		var a := b.outline[i]
		var c := b.outline[(i + 1) % b.outline.size()]
		var edge := c - a
		if edge.length() < 4.0:
			continue
		var along := a + edge * (0.25 + 0.5 * CityHash.unit(b.id, 422))
		var n := Vector2(edge.y, -edge.x).normalized()
		var at := along + n * 0.9
		if StreetFurniture.point_in_polygon(at, b.outline):
			at = along - n * 0.9
		if not ctx.square.has_point(at) or not can_stand(ctx, at, 0.9):
			continue
		var s := TreeSpot.new()
		s.position = at
		s.from_data = false
		s.species = TreeSpecies.BOUGAINVILLEA
		_finish(s, 1.0, null, INF, {}, false)
		out.append(s)
	return out


## Dry scrub and grass over open country, on a jittered grid.
static func _scrub(ctx: Context, _trees: Array[TreeSpot]) -> Array[TreeSpot]:
	var out: Array[TreeSpot] = []
	var x := ctx.square.position.x
	while x < ctx.square.end.x:
		var z := ctx.square.position.y
		while z < ctx.square.end.y:
			var cell := Vector2(x, z)
			var jx := CityHash.tree_unit(cell, 430)
			var jz := CityHash.tree_unit(cell, 431)
			var at := cell + Vector2(jx, jz) * SCRUB_PITCH
			if ctx.square.has_point(at) and CityHash.tree_unit(at, 432) < 0.55 and out.size() < SCRUB_MAX:
				if can_stand(ctx, at, 1.2):
					var s := TreeSpot.new()
					s.position = at
					s.from_data = false
					s.species = TreeSpecies.SCRUB if CityHash.tree_unit(at, 433) < 0.6 else TreeSpecies.GRASS_TUFT
					_finish(s, 1.0, null, INF, {}, true)
					out.append(s)
			z += SCRUB_PITCH
		x += SCRUB_PITCH
	return out


## At most `max_trees` tree species and `max_under` understory species in a chunk (draw calls), and
## none with fewer than MIN_COUNT plants: the rare ones take the species of a commoner one of the
## same kind, by hash.
static func _cap_species(spots: Array[TreeSpot], max_trees: int, max_under: int) -> void:
	var counts: Dictionary[StringName, int] = {}
	for s in spots:
		counts[s.species] = int(counts.get(s.species, 0)) + 1
	for under: bool in [false, true]:
		var ids: Array[StringName] = []
		for k in counts:
			if TreeSpecies.is_understory(k) == under:
				ids.append(k)
		var cap := max_under if under else max_trees
		ids.sort_custom(func(a: StringName, b: StringName) -> bool:
			return counts[a] > counts[b] or (counts[a] == counts[b] and String(a) < String(b)))
		var keep: Array[StringName] = []
		for i in mini(cap, ids.size()):
			# A species with only a plant or two is not worth its draw calls (unless it is the only one).
			if i > 0 and counts[ids[i]] < MIN_COUNT:
				break
			keep.append(ids[i])
		if keep.size() == ids.size():
			continue
		for s in spots:
			if TreeSpecies.is_understory(s.species) == under and not keep.has(s.species):
				# A dead tree stays dead and a palm stays a palm where the kit has one of the kind.
				var same: Array[StringName] = []
				for k in keep:
					if TreeSpecies.kind_of(k) == TreeSpecies.kind_of(s.species):
						same.append(k)
				var pool := same if not same.is_empty() else keep
				s.species = pool[floori(CityHash.tree_unit(s.position, 440) * pool.size()) % pool.size()]
