class_name RoadStyle
extends RefCounted
## What a road looks like by class (G-310): arterial, residential, lane or flyover. Plain data, no
## nodes, so it runs on a worker. Nothing here is mapped by OpenStreetMap beyond the highway
## class, the width, the lanes and `divider`: surfaces, wear, paint colours and tree species are
## estimated from how Tamil Nadu streets look (`docs/roads.md`), chosen by a hash of the way id so
## a road looks the same in every chunk it crosses.

const ARTERIAL := &"arterial"
const RESIDENTIAL := &"residential"
const LANE := &"lane"
const FLYOVER := &"flyover"
const PATH := &"path"
const RURAL := &"rural"

var klass: StringName = RESIDENTIAL
## Footpath width each side, metres (0 = none), and the dust verge beside the road.
var footpath: float = 0.0
var verge: float = 0.0
## Trees planted by this module (0 pitch: none), the offset from the road's edge and the share kept.
var tree_pitch: float = 0.0
var tree_edge: float = 1.6
var tree_keep: float = 1.0
## Poles planted by this module on roads that have none (residential and lane).
var pole_pitch: float = 0.0
## Species weights for trees planted along this class: neem, rain, coconut, palmyra.
var species: Dictionary[StringName, float] = {}


## The way an id belongs to: pieces of one way share the hash (`id` is way * 10 + piece).
static func way(road: Road) -> int:
	return road.id / 10


static func klass_of(road: Road) -> StringName:
	if road.kind == &"footway":
		return PATH
	if road.is_raised():
		return FLYOVER
	if road.is_main():
		return ARTERIAL
	if road.kind == &"service" or road.width < 4.4:
		return LANE
	return RESIDENTIAL


## Roads outside the built-up area (a chunk with fewer than `RoadDetail.RURAL_BUILDINGS` buildings):
## a narrow dust shoulder, no kerb, rows of palmyra palms (owner-supplied photographs, G-314).
static func rural(road: Road) -> RoadStyle:
	var s := RoadStyle.new()
	s.klass = RURAL
	s.verge = 1.4
	s.tree_pitch = 9.0
	s.tree_edge = 3.2
	s.tree_keep = 0.85
	s.species = {&"palmyra": 0.55, &"coconut": 0.15, &"neem": 0.15, &"rain": 0.15}
	return s


static func of(road: Road) -> RoadStyle:
	var s := RoadStyle.new()
	s.klass = klass_of(road)
	match s.klass:
		ARTERIAL:
			s.footpath = 2.4 if road.kind == &"primary" else (2.0 if road.kind == &"secondary" else 1.6)
			s.verge = s.footpath + 1.0
			s.species = {&"rain": 0.38, &"neem": 0.34, &"coconut": 0.14, &"palmyra": 0.14}
		RESIDENTIAL:
			s.verge = 1.2
			s.tree_pitch = 15.0
			s.tree_edge = 1.9
			s.tree_keep = 0.55
			s.pole_pitch = 30.0
			s.species = {&"neem": 0.5, &"coconut": 0.25, &"rain": 0.15, &"palmyra": 0.1}
		LANE:
			s.verge = 0.7
			s.tree_pitch = 22.0
			s.tree_edge = 1.6
			s.tree_keep = 0.4
			s.species = {&"neem": 0.55, &"coconut": 0.35, &"palmyra": 0.1}
	return s


## True when a road is paved with cement concrete (panels with joints), not tar.
static func is_concrete(road: Road) -> bool:
	var k := klass_of(road)
	if k == LANE:
		return CityHash.unit(way(road), 91) < 0.6
	if k == RESIDENTIAL:
		return CityHash.unit(way(road), 91) < 0.22
	return false


## Surface condition of a road (G-315): &"good", &"worn", &"damaged" or &"unpaved". Drawn from the
## road class, a hash of the way id and a hash of the 600 m square the road starts in (some districts
## are looked after, some are not). Estimated: OSM maps `surface` for few Chennai roads.
const GOOD := &"good"
const WORN := &"worn"
const DAMAGED := &"damaged"
const UNPAVED := &"unpaved"
const AREA_SIDE := 600.0


## 0 to 1 per square of the map: how neglected its roads are.
static func area_neglect(p: Vector2) -> float:
	return CityHash.unit(floori(p.x / AREA_SIDE) * 7919 + floori(p.y / AREA_SIDE), 108)


static func condition(road: Road, rural: bool = false) -> StringName:
	var k := klass_of(road)
	if k == PATH or k == FLYOVER:
		return GOOD
	var start := road.points[0] if not road.points.is_empty() else Vector2.ZERO
	# One roll per way, moved by the district: neglect of 0.5 changes nothing.
	var roll := clampf(CityHash.unit(way(road), 92) + (area_neglect(start) - 0.5) * 0.3, 0.0, 0.9999)
	var shares: Array[float] = [0.6, 0.3, 0.1, 0.0]
	match k:
		ARTERIAL:
			shares.assign([0.4, 0.3, 0.3, 0.0] if rural else [0.55, 0.3, 0.15, 0.0])
		RESIDENTIAL:
			shares.assign([0.2, 0.35, 0.35, 0.1])
		LANE:
			shares.assign([0.15, 0.25, 0.3, 0.3])
	var names: Array[StringName] = [GOOD, WORN, DAMAGED, UNPAVED]
	var acc := 0.0
	for i in 4:
		acc += shares[i]
		if roll < acc:
			return names[i]
	return WORN


## True when a tar road is the pale, patched, worn kind (worn or damaged).
static func is_worn(road: Road, rural: bool = false) -> bool:
	var c := condition(road, rural)
	return c == WORN or c == DAMAGED


## Ground layer of a road's carriageway: mud where unpaved, concrete where a lane is cemented and
## not broken, else tar (fresh when good).
static func surface(road: Road, rural: bool = false) -> int:
	var c := condition(road, rural)
	if c == UNPAVED:
		return CityAtlas.GROUND_MUD
	if is_concrete(road) and c != DAMAGED:
		return CityAtlas.GROUND_CONCRETE
	return CityAtlas.GROUND_ASPHALT_WORN if (c == WORN or c == DAMAGED) else CityAtlas.GROUND_ASPHALT


## What a surface does to a vehicle on it (data for the vehicles to read, G-315): the share of top
## speed a cheap vehicle keeps, bump amplitude in metres, and the grip multiplier.
static func feel(c: StringName) -> Dictionary:
	match c:
		WORN:
			return {"top_speed": 0.97, "bump": 0.01, "grip": 0.98}
		DAMAGED:
			return {"top_speed": 0.85, "bump": 0.04, "grip": 0.92}
		UNPAVED:
			return {"top_speed": 0.65, "bump": 0.06, "grip": 0.7}
	return {"top_speed": 1.0, "bump": 0.0, "grip": 1.0}


## Ground layer of the kerb paint: yellow and black on primary roads and some secondary ones, black
## and white on the rest.
static func kerb_paint(road: Road) -> int:
	if road.kind == &"primary" or (road.kind == &"secondary" and CityHash.unit(way(road), 93) < 0.5):
		return CityAtlas.GROUND_KERB
	return CityAtlas.GROUND_KERB_BW


## Species for a weight table and a unit value.
static func pick_species(weights: Dictionary[StringName, float], unit: float) -> StringName:
	var total := 0.0
	for k in weights:
		total += weights[k]
	var acc := 0.0
	var last: StringName = &"neem"
	for k in weights:
		acc += weights[k] / maxf(total, 1e-6)
		last = k
		if unit < acc:
			return k
	return last


## Species of a tree from the chunk file (or planted without one): about two in five are palms
## (as `ChunkBuilder.PALMS` always had it), the rest neem or rain trees.
static func species_of(t: WorldTree) -> StringName:
	if t.species != &"":
		return t.species
	if CityHash.tree_unit(t.position, 51) < 0.4:
		return &"coconut" if CityHash.tree_unit(t.position, 55) < 0.65 else &"palmyra"
	return &"neem" if CityHash.tree_unit(t.position, 56) < 0.55 else &"rain"
