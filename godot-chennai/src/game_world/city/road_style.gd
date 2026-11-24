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
			s.tree_keep = 0.7
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


## True when a tar road is the pale, patched, worn kind.
static func is_worn(road: Road) -> bool:
	var share := 0.3
	match klass_of(road):
		ARTERIAL:
			share = 0.3
		RESIDENTIAL:
			share = 0.55
		LANE:
			share = 0.7
		FLYOVER:
			share = 0.1
	return CityHash.unit(way(road), 92) < share


## Ground layer of a road's carriageway.
static func surface(road: Road) -> int:
	if is_concrete(road):
		return CityAtlas.GROUND_CONCRETE
	return CityAtlas.GROUND_ASPHALT_WORN if is_worn(road) else CityAtlas.GROUND_ASPHALT


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
