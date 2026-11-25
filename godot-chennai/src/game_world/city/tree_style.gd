class_name TreeStyle
extends RefCounted
## Which species grow where (G-383): the weights by the kind of place (district palette,
## the park or beach under a tree, the class of the road beside it, a mapped OSM tree). Plain data.
##
## What the data gives: a chunk file carries a tree's position, size and whether OpenStreetMap
## mapped it (`natural=tree`, tree rows); there is no species or leaf-type tag in the files and no
## landuse=forest (areas are park, water, beach). So the species is *estimated* from the place, with
## a hash of the position for the choice, so a tree is the same species every time its chunk loads.

const URBAN := &"urban"
const LEAFY := &"leafy"
const DENSE := &"dense"
const COASTAL := &"coastal"
const RURAL := &"rural"
const PARK := &"park"
const AVENUE := &"avenue"

## District palette id (`data/areas/palettes.json`) -> the place's profile. Estimated from what the
## district is (the owner knows these streets; photographs go in `docs/trees.md`).
const DISTRICTS: Dictionary[String, StringName] = {
	"george-town": DENSE, "parrys-corner": DENSE, "park-town-chennai-central": DENSE, "egmore": DENSE,
	"purasawalkam": DENSE, "chetpet": URBAN, "triplicane": DENSE, "royapettah": URBAN, "t-nagar": URBAN,
	"kodambakkam-vadapalani": URBAN, "mandaveli": LEAFY, "mylapore": LEAFY, "nungambakkam": LEAFY,
	"anna-nagar": LEAFY, "kilpauk": LEAFY, "adyar": LEAFY, "guindy": LEAFY, "saidapet": URBAN,
	"fort-st-george-island-grounds": LEAFY, "marina-santhome": COASTAL, "besant-nagar-elliots-beach": COASTAL,
	"thiruvanmiyur": COASTAL, "ennore-north-chennai-port": COASTAL, "pulicat-edge": COASTAL,
	"perambur": URBAN, "ambattur-industrial": RURAL, "velachery": URBAN, "tambaram": RURAL,
	"chengalpattu": RURAL, "pallavaram-meenambakkam-airport": URBAN, "omr-sholinganallur": RURAL,
}

## profile -> species weights. The roads work's palmyra rows and avenue trees keep their own
## species (`WorldTree.species`); these are for the trees the data does not name.
const WEIGHTS: Dictionary[StringName, Dictionary] = {
	URBAN: {&"neem": 0.26, &"rain": 0.18, &"coconut": 0.1, &"mango": 0.1, &"peepal": 0.07, &"gulmohar": 0.08, &"tamarind": 0.07, &"banyan": 0.02, &"palmyra": 0.03, &"casuarina": 0.01, &"dead_snag": 0.01, &"dead_bare": 0.01, &"dead_palm": 0.01},
	LEAFY: {&"neem": 0.18, &"rain": 0.18, &"coconut": 0.08, &"mango": 0.12, &"peepal": 0.1, &"gulmohar": 0.1, &"tamarind": 0.09, &"banyan": 0.07, &"palmyra": 0.01, &"casuarina": 0.01, &"dead_snag": 0.01, &"dead_bare": 0.005, &"dead_palm": 0.005},
	DENSE: {&"neem": 0.34, &"rain": 0.14, &"coconut": 0.06, &"mango": 0.08, &"peepal": 0.14, &"gulmohar": 0.04, &"tamarind": 0.06, &"banyan": 0.03, &"palmyra": 0.03, &"dead_snag": 0.03, &"dead_bare": 0.03, &"dead_palm": 0.02},
	COASTAL: {&"casuarina": 0.42, &"coconut": 0.28, &"palmyra": 0.1, &"neem": 0.09, &"tamarind": 0.03, &"rain": 0.03, &"banyan": 0.01, &"dead_palm": 0.02, &"dead_snag": 0.02},
	RURAL: {&"palmyra": 0.24, &"neem": 0.17, &"tamarind": 0.13, &"mango": 0.08, &"coconut": 0.1, &"banyan": 0.05, &"peepal": 0.05, &"rain": 0.06, &"dead_bare": 0.05, &"dead_snag": 0.03, &"dead_palm": 0.04},
	PARK: {&"rain": 0.18, &"banyan": 0.1, &"peepal": 0.12, &"neem": 0.12, &"gulmohar": 0.14, &"tamarind": 0.1, &"mango": 0.1, &"coconut": 0.08, &"casuarina": 0.03, &"palmyra": 0.02, &"dead_snag": 0.01},
	AVENUE: {&"rain": 0.34, &"neem": 0.2, &"gulmohar": 0.14, &"peepal": 0.08, &"tamarind": 0.08, &"mango": 0.05, &"coconut": 0.05, &"palmyra": 0.03, &"banyan": 0.02, &"dead_snag": 0.005, &"dead_bare": 0.005},
}

## Understory by place: what grows beside a tree. profile -> weights of bushes and grass.
const UNDERSTORY: Dictionary[StringName, Dictionary] = {
	URBAN: {&"oleander": 0.3, &"croton": 0.25, &"bougainvillea": 0.2, &"grass_tuft": 0.25},
	LEAFY: {&"oleander": 0.2, &"croton": 0.28, &"bougainvillea": 0.17, &"grass_tuft": 0.35},
	DENSE: {&"oleander": 0.3, &"croton": 0.2, &"bougainvillea": 0.2, &"grass_tuft": 0.3},
	COASTAL: {&"scrub": 0.45, &"grass_tuft": 0.4, &"oleander": 0.1, &"bougainvillea": 0.05},
	RURAL: {&"scrub": 0.5, &"grass_tuft": 0.4, &"oleander": 0.05, &"croton": 0.05},
	PARK: {&"croton": 0.3, &"oleander": 0.22, &"bougainvillea": 0.12, &"grass_tuft": 0.36},
	AVENUE: {&"oleander": 0.4, &"croton": 0.2, &"bougainvillea": 0.15, &"grass_tuft": 0.25},
}

## The chance (0..1) that a tree has a bush or tuft beside it, by profile.
const COMPANION: Dictionary[StringName, float] = {
	URBAN: 0.14, LEAFY: 0.3, DENSE: 0.08, COASTAL: 0.22, RURAL: 0.3, PARK: 0.55, AVENUE: 0.18,
}

## Species a mapped (`natural=tree`) tree favours: old, large trees.
const MAPPED_BOOST: Dictionary[StringName, float] = {
	&"banyan": 2.2, &"peepal": 1.8, &"rain": 1.4, &"tamarind": 1.5, &"neem": 1.3, &"mango": 1.2,
	&"gulmohar": 0.8, &"coconut": 0.8, &"dead_palm": 0.5, &"dead_bare": 0.7,
}


static func district_profile(palette_id: String) -> StringName:
	return DISTRICTS.get(palette_id, URBAN)


## The weights for a place: the profile, replaced by the park or beach under the tree, or the avenue
## beside it, and boosted for a mapped tree.
static func weights_for(profile: StringName, area_kind: StringName, road_arterial: bool, mapped: bool) -> Dictionary[StringName, float]:
	var key := profile
	if area_kind == &"park":
		key = PARK
	elif area_kind == &"beach":
		key = COASTAL
	elif road_arterial and profile != COASTAL and profile != RURAL:
		key = AVENUE
	var base: Dictionary = WEIGHTS[key]
	var out: Dictionary[StringName, float] = {}
	for k: StringName in base:
		var w := float(base[k])
		if mapped:
			w *= float(MAPPED_BOOST.get(k, 1.0))
		out[k] = w
	return out


static func understory_for(profile: StringName, area_kind: StringName) -> Dictionary[StringName, float]:
	var key := profile
	if area_kind == &"park":
		key = PARK
	elif area_kind == &"beach":
		key = COASTAL
	var base: Dictionary = UNDERSTORY[key]
	var out: Dictionary[StringName, float] = {}
	for k: StringName in base:
		out[k] = float(base[k])
	return out


static func companion_chance(profile: StringName, area_kind: StringName) -> float:
	var key := profile
	if area_kind == &"park":
		key = PARK
	elif area_kind == &"beach":
		key = COASTAL
	return float(COMPANION[key])
