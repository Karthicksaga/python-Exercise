class_name RoadHeights
extends RefCounted
## Ground-plus-deck height anywhere in the city (decision G-151): node-free and read-only, so the
## player, vehicles, traffic, pedestrians and spawners can ask it on any thread.
##
## The ground is flat at y = 0 (G-55); roads on bridges, flyovers, ramps and embankments carry
## height samples from `infra.bin` (format 2.1, estimated by rule, G-150). Where decks stack
## (Kathipara), one (x, z) has several surfaces: `surfaces_at` lists them and `height_at` picks
## the one a body at `near_y` stands on (the highest not more than `step_up` above it).
##
## Interface for the AI (traffic and pedestrians):
## - `RoadHeights.on_road(road, segment, t)`: the height of a point on a known road (an agent
##   following its lane); cheapest, no search.
## - `height_at(point, near_y)`: for anything placed by position (spawns, pedestrians crossing
##   under a flyover), using the street layout's segment grid.
## The layouts of tiles away from the player are built on first use; on the main thread ask only
## near the streaming focus (`CityLayouts.prefetch` keeps those ready) or call from a worker.

## Margin past a carriageway's edge that still counts as on the deck (parapet and verge), m.
const EDGE := 0.6

var layouts: CityLayouts


static func create(with_layouts: CityLayouts) -> RoadHeights:
	var h := RoadHeights.new()
	h.layouts = with_layouts
	return h


## Height of the road surface at fraction t of segment i of a road (0 on the ground).
static func on_road(road: Road, segment: int, t: float) -> float:
	return road.height_at(segment, t)


## Every surface at a point: 0 (the ground) first, then each raised carriageway covering it,
## ascending. Tunnel roads are at ground level and add nothing.
func surfaces_at(p: Vector2) -> PackedFloat32Array:
	var out := PackedFloat32Array([0.0])
	if layouts == null:
		return out
	var layout := layouts.layout_for(layouts.source.cell_at(p))
	var found: Array = [out]
	layout.segments_near(p, 24.0, func(ri: int, i: int) -> bool:
		var road := layout.roads[ri]
		if not road.is_raised():
			return false
		var a := road.points[i]
		var b := road.points[i + 1]
		var ab := b - a
		var len2 := ab.length_squared()
		var t := 0.0 if len2 < 1e-9 else clampf((p - a).dot(ab) / len2, 0.0, 1.0)
		var q := a + ab * t
		var reach := road.width / 2.0 + EDGE
		if q.distance_squared_to(p) > reach * reach:
			return false
		var h := road.height_at(i, t)
		if h <= 0.02:
			return false
		var list: PackedFloat32Array = found[0]
		for v in list:
			if absf(v - h) < 0.05:
				return false
		list.append(h)
		found[0] = list
		return false)
	out = found[0]
	out.sort()
	return out


## The surface something at height `near_y` stands on at p: the highest surface at most
## `step_up` above near_y (so a car under a flyover stays on the road below, and one on the deck
## stays on the deck). near_y = INF gives the top surface.
func height_at(p: Vector2, near_y: float = 0.0, step_up: float = 1.0) -> float:
	var best := 0.0
	for h in surfaces_at(p):
		if h <= near_y + step_up:
			best = maxf(best, h)
	return best


## The highest surface at p (the top deck where decks stack).
func top_at(p: Vector2) -> float:
	var s := surfaces_at(p)
	return s[s.size() - 1]
